---
name: cardimg-upload
description: Upload card scan images to BSV on-chain under the CARDIMG protocol
---

# CARDIMG Upload Skill

Upload card scan images to the BSV blockchain under the CARDIMG protocol.

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

No metadata. No version byte. Image-only. The SHA256 of the image bytes IS the identity.

## Setup

Requires the `bsv` npm package (auto-installs). Uses the BSV wallet skill's wallet at `~/.openclaw/bsv-wallet.json`.

### Check wallet exists

```bash
node scripts/upload.cjs --help
```

If wallet is missing, initialize it first via the BSV wallet skill:
```bash
node scripts/wallet.cjs init   # from bsv-skill
```

## Upload a card scan

```bash
node scripts/upload.cjs <image_path>
```

Options:
- `--wallet <path>` — Use a different wallet JSON
- `--tx` — Show TX hex without broadcasting (dry run)

## What it does

1. Loads image bytes from file
2. Loads BSV wallet (your wallet, your keys)
3. Fetches UTXOs from WhatsOnChain
4. Builds `OP_FALSE OP_RETURN "CARDIMG" <image_data>` transaction
5. Signs and broadcasts to BSV mainnet
6. Returns: TXID, SHA256 hash, size, fee

## What it does NOT do

- No indexing (use the CARDIMG indexer)
- No viewing (use the CARDIMG viewer)
- No metadata (protocol is image-only)
- No wallet management (use the BSV wallet skill)
- No local state (broadcast and return)

## Output

```
Image: 560.0KB
SHA256: 397cb348667b1926479702d54baf62b0fca6d5aa5a6c76953d1be121fa671073
Fee: 280 sats

✓ Uploaded!
TXID: 3a512c182e03f4d5cf1468e679740f7ca5c6bdcfb9953fcda95704997aacb3f6
Hash: 397cb348667b1926479702d54baf62b0fca6d5aa5a6c76953d1be121fa671073
View: https://whatsonchain.com/tx/3a512c182e03f4d5cf1468e679740f7ca5c6bdcfb9953fcda95704997aacb3f6
```

## Programmatic API

```javascript
const { uploadCardImg } = require('./lib/cardimg.js')

const result = await uploadCardImg('/path/to/card.png', '~/.openclaw/bsv-wallet.json')
// { txid, hash, size, fee }
```

## Composability

This module is one piece of the CARDIMG ecosystem:

- **cardimg-upload** (this) — upload scans on-chain
- **cardimg indexer** — index all CARDIMG txs from anyone
- **cardimg viewer** — view indexed card images
- **BSV wallet skill** — manage the wallet that funds uploads

Each is independent. Any agent can use any of them. The chain is the glue.
