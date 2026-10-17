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
const SATS_PER_BYTE = 0.1
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
 * Filters out UTXOs that are being spent in the mempool to avoid conflicts.
 * Uses WoC's tx-spent endpoint to find mempool spends of each candidate UTXO.
 * @param {string} addrStr - BSV address string
 * @param {Set<string>} [spentOutpoints] - Local set of "txid:vout" already spent in this session
 * @returns {Promise<Array<{txid, vout, satoshis}>>}
 */
async function getUtxos(addrStr, spentOutpoints = new Set()) {
  const res = await fetch(`${WoC_API}/address/${addrStr}/unspent`)
  if (!res.ok) throw new Error(`WoC UTXO error: ${res.status}`)
  const data = await res.json()

  return data
    .filter(u => u.height > 0 && u.value > 1000)
    .filter(u => !spentOutpoints.has(u.tx_hash + ':' + u.tx_pos))
    .sort((a, b) => b.value - a.value)  // largest first
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

  // Estimate fee: actual tx will include version(4) + in count(1) + N×input(~147) + out count(1) + opreturn(8+7+imageLen) + change(34) + locktime(4)
  // Pre-estimate for UTXO selection
  const INPUT_SIZE = 147
  const OUTPUT_SIZE = 34
  const OP_RETURN_SIZE = 8 + 7 + imageBuf.length // value(8) + prefix(7) + image
  const baseSize = 4 + 1 + OP_RETURN_SIZE + OUTPUT_SIZE + 4 // version + incount + opreturn + change + locktime
  let estimatedSize = baseSize + INPUT_SIZE // start with 1 input
  let estimatedFee = Math.ceil(estimatedSize * SATS_PER_BYTE)

  // Only use enough UTXOs to cover the fee (plus dust for change)
  let inputSats = 0
  const usedUtxos = []
  for (const u of utxos) {
    usedUtxos.push(u)
    inputSats += u.satoshis
    estimatedSize = baseSize + usedUtxos.length * INPUT_SIZE
    estimatedFee = Math.ceil(estimatedSize * SATS_PER_BYTE)
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

  // Calculate fee from actual serialized tx size
  // Add change output first so serialize works, then adjust
  tx.change(wallet.addr)
  tx.sign(wallet.priv)
  
  const txSize = tx.serialize().length / 2
  const fee = Math.ceil(txSize * SATS_PER_BYTE)
  const change = inputSats - fee
  
  if (change > 546) {
    tx.outputs[tx.outputs.length - 1].satoshis = change
    tx.sign(wallet.priv)
  } else {
    tx.outputs.pop()
    tx.sign(wallet.priv)
  }
  
  const finalSize = tx.serialize().length / 2
  const finalFee = Math.ceil(finalSize * SATS_PER_BYTE)
  
  return { tx, fee: finalFee, hash }
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
  // WoC returns txid as a quoted string with trailing newline: "<txid>"\n
  // Clean it up to get just the 64-char hex txid
  const raw = await res.text()
  return raw.trim().replace(/^["']+|["']+$/g, '')
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
  const { dryRun = false, spentOutpoints = new Set() } = opts

  // Load image
  const imageBuf = typeof image === 'string' ? fs.readFileSync(image) : image
  const size = imageBuf.length

  // Load wallet (uses BSV wallet skill's wallet format)
  const wallet = loadWallet(walletPath)
  const addrStr = wallet.addr.toString()

  // Fetch UTXOs (filtering out locally-tracked spent outpoints)
  const utxos = await getUtxos(addrStr, spentOutpoints)
  if (utxos.length === 0) {
    throw new Error(`No UTXOs for ${addrStr}. Fund the wallet first.`)
  }

  // Build tx
  const { tx, fee, hash } = buildCardImgTx(imageBuf, wallet, utxos)
  const txHex = tx.serialize()

  if (dryRun) {
    return { txid: null, hash, size, fee, txHex }
  }

  // Broadcast — try each UTXO until one works
  // WoC doesn't reliably filter mempool-spent UTXOs, so we retry on conflict
  let txid = null
  let lastError = null

  for (const u of utxos) {
    const outpoint = u.txid + ':' + u.vout
    if (spentOutpoints.has(outpoint)) continue

    try {
      const { tx, fee, hash } = buildCardImgTx(imageBuf, wallet, [u])
      const txHex = tx.serialize()
      txid = await broadcast(txHex)
      spentOutpoints.add(outpoint)
      lastError = null
      break
    } catch (e) {
      if (e.message.includes('txn-mempool-conflict') || e.message.includes('258') || e.message.includes('Missing inputs') || e.message.includes('already in the mempool')) {
        // This UTXO is already spent in mempool — mark and try next
        spentOutpoints.add(outpoint)
        lastError = e
        continue
      }
      // Different error — throw immediately
      throw e
    }
  }

  if (!txid) {
    throw lastError || new Error('All UTXOs failed to broadcast')
  }

  return { txid, hash, size, fee }
}

module.exports = { uploadCardImg, buildCardImgTx, broadcast, loadWallet, getUtxos }
