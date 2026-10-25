#!/usr/bin/env node
/**
 * Card Screen + Upload CLI
 *
 * Screens images in input/ through the cardid-detector, uploads only passing
 * matches to BSV under the CARDIMG protocol.
 *
 * Usage:
 *   node scripts/screen-upload.cjs                    # dry-run (default)
 *   node scripts/screen-upload.cjs --live             # real uploads
 *   node scripts/screen-upload.cjs --live --duplicates # allow re-uploads
 *   node scripts/screen-upload.cjs --max-distance 10 --min-margin 5
 */

const { runScreen } = require('../lib/screener')

async function main() {
  const args = process.argv.slice(2)

  const overrides = {}

  if (args.includes('--live')) overrides.dryRun = false
  if (args.includes('--duplicates')) overrides.allowDuplicates = true

  const mdIdx = args.indexOf('--max-distance')
  if (mdIdx >= 0) overrides.maxDistance = parseInt(args[mdIdx + 1], 10)

  const mmIdx = args.indexOf('--min-margin')
  if (mmIdx >= 0) overrides.minMargin = parseInt(args[mmIdx + 1], 10)

  console.log('🎴 Card Screen & Upload')
  console.log('')

  const { summary, results } = await runScreen(overrides)

  // Print per-image results
  for (const r of results) {
    const icon = r.result === 'pass' ? '✅' : '❌'
    const code = r.code ? ` [${r.code}]` : ''
    const dist = r.distance != null ? ` dist=${r.distance}` : ''
    const marg = r.margin != null ? ` margin=${r.margin}` : ''
    const reason = r.reason ? ` ${r.reason}` : ''
    const tx = r.txid ? ` tx=${r.txid.slice(0, 12)}…` : ''
    console.log(`  ${icon} ${r.name}${code}${dist}${marg}${reason}${tx}`)
  }

  // Print summary
  console.log('')
  console.log('─'.repeat(50))
  console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Mode: ${summary.dryRun ? 'DRY-RUN' : 'LIVE'}`)
  if (summary.failed > 0) {
    console.log('Failure reasons:')
    for (const [reason, count] of Object.entries(summary.failures)) {
      console.log(`  ${reason}: ${count}`)
    }
  }
  console.log('')
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
