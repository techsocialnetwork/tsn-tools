# TSN Tools

Free browser-based tools and dashboards for [TSN Media](https://tsnmedia.org).

These pages used to live under `tsnmedia.org/tools/*`. This public repo is the new home, published with **GitHub Pages**.

## Live site

**https://techsocialnetwork.github.io/tsn-tools/**

| Tool | Pages URL |
|------|-----------|
| Hub | https://techsocialnetwork.github.io/tsn-tools/ |
| Crypto Profit Calculator | https://techsocialnetwork.github.io/tsn-tools/crypto-calculator/ |
| Bitcoin Halving Countdown | https://techsocialnetwork.github.io/tsn-tools/bitcoin-halving-countdown/ |
| AI Model Comparison | https://techsocialnetwork.github.io/tsn-tools/ai-model-comparison/ |
| AI Image Comparison | https://techsocialnetwork.github.io/tsn-tools/ai-image-comparison/ |
| AI Token Calculator | https://techsocialnetwork.github.io/tsn-tools/ai-token-calculator/ |
| Tech Earnings Calendar | https://techsocialnetwork.github.io/tsn-tools/tech-earnings/ |
| S&P 500 Earnings Calendar | https://techsocialnetwork.github.io/tsn-tools/sp500-earnings/ |
| Macro Economic Calendar | https://techsocialnetwork.github.io/tsn-tools/macro-economic/ |
| Macro News Scanner | https://techsocialnetwork.github.io/tsn-tools/macro-news/ |
| Flux Network Dashboard | https://techsocialnetwork.github.io/tsn-tools/flux-dashboard/ |
| Akash Network Dashboard | https://techsocialnetwork.github.io/tsn-tools/akash-dashboard/ |
| Hyperliquid Dashboard | https://techsocialnetwork.github.io/tsn-tools/hyperliquid-dashboard/ |

## Data sources

Most tools are fully static or call public CORS-friendly APIs (CoinGecko, mempool.space, Flux, Chart.js CDN). The Hyperliquid dashboard calls `https://api.hyperliquid.xyz/info` directly from the browser (`metaAndAssetCtxs` for perps and `spotMetaAndAssetCtxs` for spot). No API key.

These tools still load live data through CORS proxies hosted on `tsnmedia.org` (PHP backends that cannot run on GitHub Pages):

- **Macro Economic** → FRED / BLS via `tsnmedia.org/tools/macro-economic/fred-proxy.php`
- **Macro News** → news feed via `tsnmedia.org/tools/macro-news/proxy.php`
- **Akash Dashboard** → providers via `tsnmedia.org/tools/akash-dashboard/proxy.php`

If those proxies are retired, those three tools will need new backends or public CORS-enabled APIs.

## Hosting

GitHub Pages serves `main` from `/` (project site at `/tsn-tools/`).
