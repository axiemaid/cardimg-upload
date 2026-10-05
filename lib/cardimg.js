/**
 * CARDIMG Upload — Core Library
 * 
 * Permissionless CARDIMG protocol uploader.
 * Takes an image buffer + BSV wallet, returns { txid, hash }.
 * 
 * Protocol: OP_FALSE OP_RETURN "CARDIMG" <image_data>
 * No metadata. No version byte. No server. No state.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const bsv = require('bsv')

const PROTOCOL_PREFIX = Buffer.from('CARDIMG')
const SATS_PER_BYTE = 0.5
const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'

/**
 * Load a BSV wallet from a JSON file containing { wif, address }.
 * @param {string} walletPath - Path to wallet JSON
 * @returns {{ priv: bsv.PrivateKey, addr: bsv.Address }}
 */
function loadWallet(walletPath) {
  const data = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
  return {
    priv: bsv.PrivateKey.fromWIF(data.wif),
    addr: bsv.Address.fromString(data.address)
  }
}

/**
 * Fetch confirmed UTXOs for an address from WhatsOnChain.
 * Only returns confirmed outputs to avoid mempool conflicts.
 * @param {string} addrStr - BSV address string
 * @returns {Promise<Array<{txid, vout, satoshis}>>}
 */
async function getUtxos(addrStr) {
  const res = await fetch(`${WoC_API}/address/${addrStr}/unspent`)
  if (!res.ok) throw new Error(`WoC UTXO error: ${res.status}`)
  const data = await res.json()
  return data
    .filter(u => u.value > 1000 && u.height > 0)  // confirmed only
    .sort((a, b) => b.value - a.value)  // largest first (fewer inputs for large images)
    .map(u => ({ txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value }))
}

/**
 * Build a CARDIMG transaction.
 * 
 * @param {Buffer} imageBuf - Raw image bytes
 * @param {{ priv: bsv.PrivateKey, addr: bsv.Address }} wallet - BSV wallet
 * @param {Array<{txid, vout, satoshis}>} utxos - Funding UTXOs
 * @returns {{ tx: bsv.Transaction, fee: number, hash: string }}
 */
function buildCardImgTx(imageBuf, wallet, utxos) {
  const hash = crypto.createHash('sha256').update(imageBuf).digest('hex')
  const tx = new bsv.Transaction()

  // Estimate fee: ~20 bytes overhead + image size, at 0.5 sats/byte
  const estimatedFee = Math.ceil((20 + imageBuf.length) * SATS_PER_BYTE)

  // Only use enough UTXOs to cover the fee (plus dust for change)
  let inputSats = 0
  const usedUtxos = []
  for (const u of utxos) {
    usedUtxos.push(u)
    inputSats += u.satoshis
    if (inputSats >= estimatedFee + 546) break  // enough for fee + dust change
  }

  if (inputSats < estimatedFee) {
    throw new Error(`Insufficient funds: need ${estimatedFee} sats, have ${inputSats} sats`)
  }

  for (const u of usedUtxos) {
    tx.from({
      txId: u.txid,
      outputIndex: u.vout,
      script: bsv.Script.buildPublicKeyHashOut(wallet.addr).toHex(),
      satoshis: u.satoshis
    })
  }

  // OP_FALSE OP_RETURN "CARDIMG" <image_data>
  const script = bsv.Script.buildSafeDataOut([PROTOCOL_PREFIX, imageBuf])
  tx.addOutput(new bsv.Transaction.Output({ script, satoshis: 0 }))

  const fee = Math.ceil((20 + imageBuf.length) * SATS_PER_BYTE)
  const change = inputSats - fee
  if (change > 546) tx.change(wallet.addr)

  tx.sign(wallet.priv)
  return { tx, fee, hash }
}

/**
 * Broadcast a raw transaction hex to the BSV network via WhatsOnChain.
 * @param {string} txHex - Raw transaction hex
 * @returns {Promise<string>} txid
 */
async function broadcast(txHex) {
  const res = await fetch(`${WoC_API}/tx/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txhex: txHex })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Broadcast failed: ${res.status} - ${text}`)
  }
  return res.text()
}

/**
 * Upload a card scan image to BSV under the CARDIMG protocol.
 * 
 * This is the main entry point. Bring your own wallet —
 * the function doesn't own or manage any wallet.
 * 
 * @param {string|Buffer} image - Path to image file, or raw image buffer
 * @param {string} walletPath - Path to BSV wallet JSON ({ wif, address })
 * @param {object} [opts] - Optional: { dryRun: false }
 * @returns {Promise<{ txid: string, hash: string, size: number, fee: number }>}
 */
async function uploadCardImg(image, walletPath, opts = {}) {
  const { dryRun = false } = opts

  // Load image
  const imageBuf = typeof image === 'string' ? fs.readFileSync(image) : image
  const size = imageBuf.length

  // Load wallet (uses BSV wallet skill's wallet format)
  const wallet = loadWallet(walletPath)
  const addrStr = wallet.addr.toString()

  // Fetch UTXOs
  const utxos = await getUtxos(addrStr)
  if (utxos.length === 0) {
    throw new Error(`No UTXOs for ${addrStr}. Fund the wallet first.`)
  }

  // Build tx
  const { tx, fee, hash } = buildCardImgTx(imageBuf, wallet, utxos)
  const txHex = tx.serialize()

  if (dryRun) {
    return { txid: null, hash, size, fee, txHex }
  }

  // Broadcast
  const txid = await broadcast(txHex)
  return { txid, hash, size, fee }
}

module.exports = { uploadCardImg, buildCardImgTx, broadcast, loadWallet, getUtxos }
