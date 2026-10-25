# Trading Card Image Uploader for OpenClaw

Permissionless CARDIMG protocol uploader for BSV.

Uploads card scan images to the BSV blockchain as `OP_FALSE OP_RETURN "CARDIMG" <image_data>` transactions. No metadata, no server, no state — just image bytes on-chain.

## UTXO Handling

The uploader fetches confirmed UTXOs from WhatsOnChain and tries each one until broadcast succeeds. This handles two common issues:

- **Mempool conflicts** (`txn-mempool-conflict`, error 258) — WoC reports UTXOs as unspent even when they're being spent in the mempool. The uploader catches this and tries the next UTXO.
- **Missing inputs** — UTXO was already spent and confirmed, but WoC hasn't updated. Same retry logic.

A shared `spentOutpoints` set can be passed across multiple uploads in a session to avoid re-trying known-spent UTXOs.

## Install

```bash
git clone https://github.com/axiemaid/cardimg-upload.git
cd cardimg-upload
npm install
```

Requires a BSV wallet JSON file (`{ wif, address }`). To create and fund one, use the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill).

## Usage

### CLI

```bash
node scripts/upload.cjs card.png
node scripts/upload.cjs card.png --wallet /custom/wallet.json
node scripts/upload.cjs card.png --tx   # dry run, show hex
```

### Library

```javascript
const { uploadCardImg } = require('./lib/cardimg.js')

// Basic upload
const { txid, hash, size, fee } = await uploadCardImg(
  'card.png',
  '~/.openclaw/cardimg-scanner-wallet.json'
)

// With spent-outpoint tracking (for batch uploads)
const spentOutpoints = new Set()

for (const image of images) {
  const result = await uploadCardImg(image, walletPath, { spentOutpoints })
  // spentOutpoints is updated in-place — next call skips used UTXOs
  console.log(result.txid)
}

// Dry run (build tx without broadcasting)
const { txHex } = await uploadCardImg(image, walletPath, { dryRun: true })
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dryRun` | boolean | `false` | Build tx without broadcasting; returns `txHex` |
| `spentOutpoints` | `Set<string>` | `new Set()` | Track spent `"txid:vout"` pairs across calls to avoid mempool conflicts in batch uploads |

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

- **Identity:** SHA256 of image bytes
- **No metadata:** Card ID, condition, price — all application layer
- **No chunking:** BSV accepts large OP_RETURN outputs
- **Permissionless:** Anyone with a BSV wallet can upload
- **Broadcast:** Uses [WhatsOnChain](https://whatsonchain.com) API for UTXO fetching and transaction broadcast

## How It Works

1. Load wallet from JSON (`{ wif, address }`)
2. Fetch confirmed UTXOs from WoC (filters out `height === 0` and `value <= 1000`)
3. For each UTXO (largest first):
   - Skip if in `spentOutpoints` set
   - Build a single-input tx: `OP_RETURN` output + change
   - Sign and serialize
   - Try broadcasting via WoC `/tx/raw`
   - On success: mark UTXO as spent, return `{ txid, hash, size, fee }`
   - On `txn-mempool-conflict` or `Missing inputs`: mark UTXO as spent, try next
   - On other errors: throw immediately
4. If all UTXOs fail: throw last error

## What This Is Not

- Not an indexer (use the [cardimg-indexer](https://github.com/axiemaid/cardimg-indexer))
- Not a viewer (use the [cardimg-api](https://github.com/axiemaid/cardimg-api))
- Not a scanner/validator (use the [cardimg-scan](https://github.com/axiemaid/cardimg-scan))
- No wallet creation or funding (see the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill))
- Not a server (CLI + library only)

## License

MIT
