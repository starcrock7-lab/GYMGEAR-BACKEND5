# Enrichment brief (agent prompt)

Used in Stage 2 of `catalog-expansion.md`. One agent per batch. Give the agent
the batch file path and this brief verbatim.

## The job

You are given candidate products in `staging/<retailer>.json`. Each already has
**verified** `id`, `name`, `brand`, `price`, `salePrice`, `url`, `image`,
`category` — read from the retailer's own feed. **Do not change any of those.**

Fill in only these four fields per product:

| Field | What it is |
|---|---|
| `quality` | 0–10, one decimal. The GymGear Score input. |
| `expertVerdict` | ONE sentence, ~12–20 words, plain and specific. What this is best at, or who it is for. No superlatives you cannot support. |
| `specs` | 4–5 key/value pairs of **published** facts (capacity, gauge, weight, warranty, dimensions, material). |
| `aspects` | 3 short chips, ≤3 words each (e.g. `Lifetime Warranty`, `Compact Build`, `Budget Pick`). |

## Scoring `quality`

Judge the product against **others in its own category**, from published specs
only. Anchors, from rows already in the catalog:

- **9.0–9.6** — commercial-grade build, lifetime frame warranty, the category benchmark (Rogue R-3, REP Arcadia, Force USA G20)
- **8.0–8.9** — strong home-gym build, solid warranty, no obvious compromise (Bells of Steel Cable Tower)
- **7.0–7.9** — good value with a real trade-off: lighter gauge, shorter warranty, fewer features (Titan plate-loaded trainer)
- **6.0–6.9** — budget pick that works but is outclassed on build (Marcy MWM-990)
- **below 6.0** — do not add it; a product we would not recommend does not belong in the catalog

Steel gauge, capacity, warranty length, materials and country of manufacture are
the evidence. A cheap price is not a quality score, and a big discount never
raises `quality` — the builder already values discounts separately.

## Rules you may not break

1. **Never invent a number.** If a spec is not published, leave it out. Four real specs beat five with one guessed.
2. **Never invent a review, rating, award, or a publication's verdict.** `expertVerdict` is our own one-line read, not a quote. `reviewSource`/`expertSource` stay as given.
3. **Leave `rating` and `reviewCount` null** unless the retailer publishes them on that product page. Null is handled — a missing rating scores at the category median. A fabricated 4.7 is not recoverable.
4. **Do not touch price, salePrice, url, image, id or category.** Those are verified; changing one silently breaks the price gate.
5. If a product should not be in the catalog at all (a spare part, a duplicate, an accessory bundle, or something below 6.0), set `"drop": true` with a one-line reason instead of enriching it.

## Output

Write the same JSON file back with your four fields filled in per product (plus
any `drop` flags). Change nothing else. Report: how many enriched, how many
dropped and why, and any product you were unsure about.
