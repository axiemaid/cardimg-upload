#!/usr/bin/env node
/**
 * CARDIMG Upload CLI
 * 
 * Upload a card scan image to BSV under the CARDIMG protocol.
 * 
 * Uses the BSV wallet skill's wallet (~/.openclaw/bsv-wallet.json by default).
 * 
 * Usage:
 *   node upload.cjs <image_path>
 *   node upload.cjs <image_path> --wallet /path/to/wallet.json
 *   node upload.cjs <image_path> --tx        (show TX hex without broadcasting)
 */

const { uploadCardImg } = require('../lib/cardimg.js')

const DEFAULT_WALLET = require('path').join(
  process.env.HOME || '/root', '.openclaw', 'bsv-wallet.json'
)

async function main() {
  const args = process.argv.slice(2)
  const imgPath = args.find(a => !a.startsWith('--'))
  const walletArg = args.indexOf('--wallet')
  const walletPath = walletArg >= 0 ? args[walletArg + 1] : DEFAULT_WALLET
  const dryRun = args.includes('--tx')

  if (!imgPath) {
    console.log('CARDIMG Upload — Permissionless card scan uploader')
    console.log('')
    console.log('Usage: node upload.cjs <image_path> [options]')
    console.log('')
    console.log('Options:')
    console.log('  --wallet <path>  BSV wallet JSON (default: ~/.openclaw/bsv-wallet.json)')
    console.log('  --tx             Show TX hex without broadcasting')
    process.exit(1)
  }

  const fs = require('fs')
  if (!fs.existsSync(imgPath)) {
    console.error('File not found:', imgPath)
    process.exit(1)
  }

  const result = await uploadCardImg(imgPath, walletPath, { dryRun })

  console.log('Image:', `${(result.size / 1024).toFixed(1)}KB`)
  console.log('SHA256:', result.hash)
  console.log('Fee:', result.fee, 'sats')

  if (dryRun) {
    console.log('\n--- TX HEX ---')
    console.log(result.txHex)
  } else {
    console.log('\n✓ Uploaded!')
    console.log('TXID:', result.txid)
    console.log('Hash:', result.hash)
    console.log('View:', `https://whatsonchain.com/tx/${result.txid}`)
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
