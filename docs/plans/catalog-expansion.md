# Catalog expansion + deals-first positioning

**Status:** in progress · started 2026-08-03
**Owner:** any chat may pick this up — read this file first, then continue from the Batch ledger at the bottom.

## Why

Two goals, one pipeline.

1. **Size.** The catalog is 261 products across 31 categories. Target is **700–1000**. Ten retailers already in the catalog publish ~3,900 products through their own product feeds, ~3,080 of them at a single unambiguous price.

   **Measured yield, so you don't over-promise:** a feed is mostly not listable. REP Fitness went 705 raw → 253 mapped → **97 after the accessory/hidden/graded filters**, and the enrichment agents then drop roughly a third of what is left (rig hardware, configurators, unusable variants). Bells of Steel: 479 raw → 236 listable. So budget **10–15% of a feed** reaching the catalog, which means 700–1000 products needs on the order of **15–20 retailers**, not five. Cast wide rather than mining one store deep.
2. **Deals are the product.** The site's edge is "the best deals available right now". Discounted products get priority — in the kit builder, in listings, and in what the site chooses to show first. A discount is only real if it was **read from the retailer**, never inferred.

## Hard rules (these are what stop the site from lying)

1. **No invented facts.** Price, sale price, discount %, rating, review count and stock status are only ever *read* from the retailer. A product whose price cannot be read does not get added. This is the same cardinal rule as `scripts/check-prices.js` — that file's header is the canon.
2. **Sourcing prefers verifiability.** Add from retailers whose feed `check-prices.js` can read (Shopify `/products.json`). Amazon (ToS) and Rogue (403) rows can never be re-verified, so they must not grow as a share of the catalog.
3. **One variant, pinned.** Multi-variant listings get `?variant=<id>` on the URL so the price refers to a specific SKU and `check-prices` can verify it. Without the pin the row is UNREADABLE by design.
4. **`quality` and `expertVerdict` are judgment, not scrape.** They come from the enrichment pass (below), grounded in published specs. Never fabricate an award, a review count, or a publication's verdict.
5. Every batch passes **all** gates before commit (below). A batch that fails a gate is not merged, it is fixed.

## The pipeline

### Stage 1 — harvest (`npm run import:harvest`)

`scripts/import-harvest.mjs` pulls a retailer's Shopify feed and writes candidate rows to `staging/<retailer>.json`. It never touches `server.js`.

For each product it records: title (plus the variant name when a variant is pinned), brand (vendor), handle/URL, chosen variant id + price, `compare_at_price` (→ the real discount), first image URL, published product type/tags, and the mapped GymGear category.

It refuses, in order: shops not quoting USD; gift cards, spares and refurbs; accessories and rig hardware by name (uprights, connectors, ISO arms, casters, pads, J-cups, storage) and by the retailer's own tag (`Rig Attachment`, `bundle_component`); `hide-from-search` / dealer / bundle-parent pages, which are noindex, render nothing and redirect to a login; configurator "builder" pages; sold-out and coming-soon variants; **weight-graded lines** (plates, dumbbells, kettlebells sold per weight — no representative SKU, and the pinned default is a 2.5 lb pair a kit builder would treat as somebody's only plates); and anything whose category cannot be mapped.

**Discount capture is the point:** `compare_at_price > price` becomes `salePrice` + list `price`, which is exactly what the deals surfaces read.

### Stage 2 — enrichment (subagents)

Each candidate needs `quality` (0–10), `expertVerdict` (one sentence), `specs` (4–5 published facts) and `aspects` (3 short chips). This is the part that is judgment, so it is done by a small fleet of agents, one batch each, using `docs/plans/enrichment-brief.md` as the prompt. Agents may read the retailer's own spec table; they may not invent numbers, awards, or third-party verdicts, and they must leave `rating`/`reviewCount` null when the retailer does not publish them (the score handles null by falling back to the category median).

### Stage 3 — insert (`npm run import:apply`)

`scripts/import-apply.mjs` inserts finished rows into `server.js` via `catalog-io.js` (`addProducts`), into the right category array, plus the `IMGS` entry. Positional-arg helpers are exactly where silent corruption happens, so insertion goes through the scanner, never a regex.

### Stage 4 — wire into the system

A product is not "in the system" until every surface knows about it:

| Surface | File | Needed for |
|---|---|---|
| Catalog row + image | `server.js` (`PRODUCTS`, `IMGS`) | everything |
| Kit builder | frontend `src/lib/kit-builder.ts` **and** backend `server.js` (lockstep) | kits |
| Floor footprint | frontend `src/lib/floor-plan.ts` (`FOOTPRINTS`, `CATEGORY_DEFAULT`) | planner + 3D |
| 2D map glyph | frontend `src/components/planner/equipment-icon.tsx` | planner |
| 3D model | frontend `src/lib/equipment-3d.ts` | 3D room |

New *categories* need all five. New products in an existing category inherit the last three.

### Stage 5 — gates (all must pass, in this order)

```bash
node --check server.js
node scripts/check-prices.js --only <the new ids>   # every new row must read UNCHANGED
npm run audit:kits          # frontend — kits stay trainable
npm run check:lockstep      # frontend — both kit-builder copies agree
npm run audit:layout        # frontend — a kit still lands in a real room
npm run build               # frontend gate (needs the backend on :3001)
```

`check-prices --only` returning UNCHANGED for a new row is the proof that its price, URL and variant pin are all correct — it is the single most important gate in this plan.

## Deals-first behaviour

- **Kit builder** already prefers genuine discounts (`kit-builder.ts`, mirrored in `server.js`) — a discount lifts effective value, bounded by the discount itself.
- **Listings** must default to deals first, then GymGear Score. (Stage 6, not yet done.)
- **`saleEndsAt`** stays hand-curated and is never written by a model; an expired date drops the deal and its countdown.
- A discount is only shown when `salePrice < price` and both came from the retailer.

## GitHub: is it still on sale?

`.github/workflows/price-check.yml` reads **every row in the catalog** — new rows are included automatically, no registration step — and opens a PR for a human to merge. It classifies `SALE_STARTED`, `SALE_ENDED`, `PRICE_CHANGED`, `OUT_OF_STOCK`, `NEEDS_REVIEW`, `UNREADABLE`.

Changes this plan makes to it:

1. **Daily, not weekly.** Sales rotate faster than the weekly cadence, and a stale discount is a false claim.
2. **Coverage is reported and floored.** Today only 51 of 261 rows are readable (81 Amazon, 26 Rogue 403). The run must print readable/total and fail if coverage drops below the floor, so an expansion that adds unverifiable rows is caught.
3. Every new product must be readable at add time (Stage 5), so coverage rises with the catalog instead of falling.

## Batch ledger

Append one line per batch. Newest last.

| Date | Retailer | Categories | Added | Coverage after | Commit |
|---|---|---|---|---|---|
| — | — | — | — | 51/261 (20%) | baseline |
| 2026-08-03 | Bells of Steel | racks 9, barbells 4, cardio 3, plates 2, machines 1, dumbbells 1, flooring 1 | 21 (all currently discounted) | 72/282 (26%) | this commit |
| 2026-08-04 | REP Fitness | barbells 2, racks 2, benches 2, bands 2, machines 1 | 9 (3 discounted) | 81/291 (28%) | this commit |
