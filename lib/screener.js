/**
 * Card Screener — Automatic pass/fail gate for card image uploads.
 *
 * For each image in inputDir:
 *   1. Run the cardid-detector (import as-is, no copy)
 *   2. Match against reference database
 *   3. Pass only if: match found, distance < MAX_DISTANCE, margin > MIN_MARGIN,
 *      and (code not already uploaded OR allowDuplicates=true)
 *   4. Pass → upload via cardimg-upload, record code
 *   5. Fail → move to rejected/ with sidecar reason file
 *
 * Dry-run mode (default): runs full screen + log, uploads nothing.
 */

const fs = require('fs')
const path = require('path')

// Load config relative to this module's directory
const CONFIG_PATH = path.join(__dirname, '..', 'config.json')

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  // Resolve relative paths against the package root
  const root = path.join(__dirname, '..')
  for (const key of ['inputDir', 'rejectedDir', 'logPath', 'uploadedLogPath']) {
    if (cfg[key] && !path.isAbsolute(cfg[key])) {
      cfg[key] = path.resolve(root, cfg[key])
    }
  }
  return cfg
}

// Load or initialize the uploaded-codes tracker
function loadUploadedLog(cfg) {
  try {
    return new Set(JSON.parse(fs.readFileSync(cfg.uploadedLogPath, 'utf8')))
  } catch {
    return new Set()
  }
}

function saveUploadedLog(cfg, codes) {
  fs.writeFileSync(cfg.uploadedLogPath, JSON.stringify([...codes].sort(), null, 2))
}

// Append a log line (JSONL)
function logResult(cfg, entry) {
  const dir = path.dirname(cfg.logPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(cfg.logPath, JSON.stringify(entry) + '\n')
}

// Move file to rejected with sidecar reason
function rejectFile(cfg, filePath, reason) {
  fs.mkdirSync(cfg.rejectedDir, { recursive: true })
  const name = path.basename(filePath)
  const dest = path.join(cfg.rejectedDir, name)
  fs.renameSync(filePath, dest)
  // Sidecar: <filename>.reason.txt
  fs.writeFileSync(dest + '.reason.txt', reason + '\n')
  return dest
}

// Discover image files in inputDir
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp'])
function findImages(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => path.join(dir, f))
    .sort()
}

/**
 * Run the screener on all images in inputDir.
 *
 * @param {object} [overrideCfg] - Override config fields (e.g. { dryRun: false })
 * @returns {Promise<object>} Summary { passed, failed, results: [...] }
 */
async function runScreen(overrideCfg = {}) {
  const cfg = { ...loadConfig(), ...overrideCfg }

  // Dynamically import the detector from its own directory
  const detectorPath = path.join(cfg.detectorPath, 'lib', 'match.js')
  const { matchCard } = require(detectorPath)

  // Import the uploader from this package
  const { uploadCardImg } = require('./cardimg.js')

  // Ensure dirs exist
  fs.mkdirSync(cfg.inputDir, { recursive: true })
  fs.mkdirSync(cfg.rejectedDir, { recursive: true })

  const uploadedCodes = loadUploadedLog(cfg)
  const images = findImages(cfg.inputDir)
  const results = []
  let passed = 0
  let failed = 0

  for (const imgPath of images) {
    const name = path.basename(imgPath)
    const entry = {
      name,
      timestamp: new Date().toISOString(),
      result: null,
      code: null,
      distance: null,
      margin: null,
      reason: null,
      uploaded: false,
      txid: null,
    }

    try {
      // 1. Run detector
      const matchResult = await matchCard(imgPath, cfg.referenceDir)
      const matches = matchResult.results || []

      if (matches.length === 0) {
        entry.result = 'fail'
        entry.reason = 'no_match'
        failed++
        results.push(entry)
        logResult(cfg, entry)
        rejectFile(cfg, imgPath, 'no_match: detector returned no results')
        continue
      }

      const best = matches[0]
      const second = matches[1]
      // Sort by hamming distance to find the two closest matches
      const byHamming = [...matches].sort((a, b) => a.hamming - b.hamming)
      const closest = byHamming[0]
      const runnerUp = byHamming[1]
      const distance = closest.hamming
      const margin = runnerUp ? runnerUp.hamming - closest.hamming : closest.hamming

      entry.code = closest.code
      entry.distance = distance
      entry.margin = margin

      // 2. Check distance threshold
      if (distance >= cfg.maxDistance) {
        entry.result = 'fail'
        entry.reason = `distance_${distance}_exceeds_${cfg.maxDistance}`
        failed++
        results.push(entry)
        logResult(cfg, entry)
        rejectFile(cfg, imgPath, `distance ${distance} exceeds max ${cfg.maxDistance} (code=${closest.code})`)
        continue
      }

      // 3. Check margin threshold
      if (margin <= cfg.minMargin) {
        entry.result = 'fail'
        entry.reason = `margin_${margin}_below_${cfg.minMargin}`
        failed++
        results.push(entry)
        logResult(cfg, entry)
        rejectFile(cfg, imgPath, `margin ${margin} below min ${cfg.minMargin} (code=${closest.code}, next=${runnerUp?.code})`)
        continue
      }

      // 4. Check duplicates
      if (uploadedCodes.has(closest.code) && !cfg.allowDuplicates) {
        entry.result = 'fail'
        entry.reason = `duplicate_${closest.code}`
        failed++
        results.push(entry)
        logResult(cfg, entry)
        rejectFile(cfg, imgPath, `duplicate: ${closest.code} already uploaded`)
        continue
      }

      // 5. Pass — upload (or dry-run skip)
      entry.result = 'pass'

      if (cfg.dryRun) {
        entry.uploaded = false
        entry.reason = 'dry_run'
        passed++
        results.push(entry)
        logResult(cfg, entry)
        // Don't move the file in dry-run — leave it in input for re-runs
        continue
      }

      // Real upload
      const uploadResult = await uploadCardImg(imgPath, cfg.walletPath, {})
      entry.uploaded = true
      entry.txid = uploadResult.txid
      uploadedCodes.add(best.code)
      saveUploadedLog(cfg, uploadedCodes)
      passed++
      results.push(entry)
      logResult(cfg, entry)

      // Remove the uploaded file
      fs.unlinkSync(imgPath)

    } catch (err) {
      entry.result = 'fail'
      entry.reason = `crash: ${err.message}`
      failed++
      results.push(entry)
      logResult(cfg, entry)
      rejectFile(cfg, imgPath, `crash: ${err.message}`)
    }
  }

  // Summary
  const summary = {
    total: images.length,
    passed,
    failed,
    dryRun: cfg.dryRun,
    failures: {},
  }

  for (const r of results) {
    if (r.result === 'fail') {
      const cat = r.reason.split(/[0-9_]/)[0] || r.reason
      summary.failures[cat] = (summary.failures[cat] || 0) + 1
    }
  }

  return { summary, results }
}

module.exports = { runScreen, loadConfig }
