# Ham Exam — SRS Trainer (Technician + General + Extra)

One app, three pools, switched via tabs in the header (or `#technician` / `#general` / `#extra` URL hash):

| Class | Pool | Qs | Real exam | Pass |
|-------|------|----|-----------|------|
| Technician | 2022–2026 Element 2 (hamexam.org/21) | 409 (T0–T9) | 35Q | 26 |
| General | 2019 Element 3 (hamexam.org/19) | 423 (G0–G9) | 35Q | 26 |
| Extra | 2024–2028 Element 4 (hamexam.org/20) | 599 (E0–E9) | 50Q | 37 |

## Quick start
```bash
cd ham-radio-prep-all
python3 -m http.server 8000 --directory public
# open http://localhost:8000
```

## What's per-class
- Pool file: `public/pool-{technician,general,extra}.json`
- Progress: separate `localStorage` key per class (`ham-{class}-srs-v1`) + separate cloud KV key (`progress:{user}:{class}`), so studying one class never clobbers another. Old General-only cloud data is auto-migrated on first load.
- Mock exam size / pass line, subelement grid, study plan, and export filename all follow the active class.
- Explanations: General uses `public/explanations.json` (HamStudy E3_2023). Technician/Extra fall back to it until you run the scraper for their pools.

## Refreshing pools / explanations
- Pools: `pool-*.json` were scraped from hamexam.org `view_pool/21-Technician`, `/19-General`, `/20-Extra`.
- Explanations: `scripts/scrape_hamstudy.py` covers General groups; extend `GROUPS` with `T0A…` (`/browse/E2_2022/…`) and `E0A…` (`/browse/E4_2024/…`) to generate `explanations-technician.json` / `explanations-extra.json` — the app picks them up automatically.

## Deploy (Cloudflare Worker + KV, same as before)
```bash
npx wrangler kv:key put --binding PROGRESS_KV test 1  # sanity check binding
npx wrangler deploy
```

Trigger rebuild
