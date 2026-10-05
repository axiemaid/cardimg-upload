# Trading Card Image Uploader for OpenClaw

Permissionless CARDIMG protocol uploader for BSV.

Uploads card scan images to the BSV blockchain as `OP_FALSE OP_RETURN "CARDIMG" <image_data>` transactions. No metadata, no server, no state — just image bytes on-chain.

## Install

```bash
git clone https://github.com/axiemaid/cardimg-upload.git
cd cardimg-upload
npm install
```

Requires a BSV wallet at `~/.openclaw/bsv-wallet.json`. To create and fund one, use the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill).

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

const { txid, hash, size, fee } = await uploadCardImg(
  'card.png',
  '~/.openclaw/bsv-wallet.json'
)
```

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

- **Identity:** SHA256 of image bytes
- **No metadata:** Card ID, condition, price — all application layer
- **No chunking:** BSV accepts large OP_RETURN outputs
- **Permissionless:** Anyone with a BSV wallet can upload
- **Broadcast:** Uses [WhatsOnChain](https://whatsonchain.com) API for UTXO fetching and transaction broadcast

## What This Is Not

- Not an indexer (use the CARDIMG indexer)
- Not a viewer (use the CARDIMG viewer)
- No wallet creation or funding (see the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill))
- Not a server (CLI + library only)

## License

MIT
