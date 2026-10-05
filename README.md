# Trading Card Image Uploader for OpenClaw

A skill that lets your OpenClaw agent upload trading card scan images to the BSV blockchain — permanently, on-chain, under the CARDIMG protocol.

- **On-chain uploads** — Card scans are embedded as `OP_FALSE OP_RETURN "CARDIMG" <image_data>` transactions

- **Permissionless** — Anyone with a BSV wallet can upload. No server, no API key, no account

- **Image-only protocol** — No metadata on-chain. Card ID, condition, price — all application layer

- **SHA256 identity** — The hash of the image bytes IS the identity. Exact match, data integrity

- **Uses the [BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill)** — Requires a funded BSV wallet at `~/.openclaw/bsv-wallet.json`

Tell your OpenClaw agent:

Install the skill from https://github.com/axiemaid/cardimg-upload

Once installed, just talk to your agent:

- "Upload this card scan to BSV"
- "Upload card.png to the CARDIMG protocol"
- "Upload this card image and show me the transaction"

- **Protocol:** `OP_FALSE OP_RETURN "CARDIMG" <image_data>` — no version byte, no metadata, no chunking

- **Identity:** SHA256 of image bytes

- **Cost:** ~0.5 sats/byte (~$0.10 for 500KB, ~$0.40 for 2MB)

- **API:** WhatsOnChain mainnet for UTXO fetching and broadcast

## Composability

Part of the CARDIMG ecosystem:

- **Trading Card Image Uploader** (this) — upload scans on-chain
- **CARDIMG indexer** — index all CARDIMG transactions from anyone
- **CARDIMG viewer** — view indexed card images
- **[BSV wallet skill](https://github.com/axiemaid/bsv-openclaw-skill)** — create and fund the wallet

## License

MIT
