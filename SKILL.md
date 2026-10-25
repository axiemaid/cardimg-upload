---
name: cardimg-upload
description: Upload card scan images to BSV on-chain under the CARDIMG protocol
---

# Trading Card Image Uploader for OpenClaw

Upload card scan images to the BSV blockchain under the CARDIMG protocol.

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

No metadata. No version byte. Image-only. The SHA256 of the image bytes IS the identity.

## Fee Model

Fee is calculated from the **actual serialized transaction size** at **0.1 sats/byte** (100 sat/KB), matching the current BSV network rate. The fee includes inputs, outputs, change, and the full image data in the OP_RETURN.

For an 843KB JPEG (typical card scan): tx ≈ 843KB → fee ≈ 84,360 sats.

## Setup

Requires a BSV wallet at `~/.openclaw/bsv-wallet.json`. To create and fund one, use the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill).

## Upload a card scan

```bash
node scripts/upload.cjs <image_path>
```

Options:
- `--wallet <path>` — Use a different wallet JSON
- `--tx` — Show TX hex without broadcasting (dry run)

## What it does

1. Loads image bytes from file
2. Loads BSV wallet (via BSV wallet skill's wallet format)
3. Fetches UTXOs from WhatsOnChain
4. Builds `OP_FALSE OP_RETURN "CARDIMG" <image_data>` transaction
5. Calculates fee from actual serialized tx size (0.1 sats/byte)
6. Signs and broadcasts to BSV mainnet
7. Returns: TXID, SHA256 hash, size, fee

## What it does NOT do

- No indexing (use the CARDIMG indexer)
- No viewing (use the CARDIMG viewer)
- No metadata (protocol is image-only)
- No wallet creation or funding (see the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill))
- No local state (broadcast and return)
- No CARDSET creation (use cardimg-bind)

## WoC Broadcast Response

WhatsOnChain's `/tx/raw` endpoint returns the txid as a JSON-quoted string with a trailing newline: `"<txid>"\n`. The `broadcast()` function cleans this (strips quotes and whitespace) to return a plain 64-char hex string.

## Output

```
Image: 843.0KB
SHA256: 104ea4f5e02e3be08510b8a8133e15e77cdbbd1a81f3c849c42135d8314f978a
Fee: 84360 sats (0.1 sats/byte × 843KB tx)

✓ Uploaded!
TXID: 49ad6f618e3b7e95695fb0f7924e0d0ab29f5f923f2ccbfff71a89f78ab5cb8e
Hash: 104ea4f5e02e3be08510b8a8133e15e77cdbbd1a81f3c849c42135d8314f978a
View: https://whatsonchain.com/tx/49ad6f618e3b7e95695fb0f7924e0d0ab29f5f923f2ccbfff71a89f78ab5cb8e
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
- **cardimg-bind** — link images together (CARDSET)
- **cardimg-indexer** — index all CARDIMG txs from anyone
- **cardimg-api** — serve images and metadata over HTTP
- **[BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill)** — manage the wallet that funds uploads

Each is independent. Any agent can use any of them. The chain is the glue.
