---
name: gymgear-catalog
description: Workflow for adding or editing products in the GymGear backend catalog (server.js) — the 15-arg p() helper and its silent arg-swap trap, image pools, sale/deal fields, compact/pro flags, and the frontend surfaces each product must be wired into. Use when adding products, brands, or categories to GymGear, curating sales/prices/images, or expanding the catalog.
---

# GymGear catalog — adding products without breaking the machine

Repo: `C:\Users\nirka\Documents\gymgear-backend-new` (**public — no secrets ever**). Gate: `node --check server.js`.

## The p() helper (server.js ~line 320)
```
p(id, name, brand, price, retailer, url, quality, rating, reviewCount,
  reviewSource, expertVerdict, expertSource, specs, aspects, opts={})
```
**15 positional args — a swap is silent and ships** (real bug: two yoga mats had swapped args in prod, commit a8c8ced). After adding products, spot-check the actual JSON: run the server locally and eyeball your new items in `/api/products` — does the rating look like a rating, the price like a price?

## opts flags (each one gates real behavior)
- `salePrice` — auto-computes `discount` %. `saleEndsAt` — **hand-curated ISO date ONLY when the real end date is known; the LLM never sources prices or expiry** (deals-engine hard rule). Frontend drops the deal once it passes.
- `compact: true` — racks/machines/cardio that physically fit low ceilings / tight rooms; gates kit selection for small spaces.
- `pro: true` — full-commercial, gym-planner stock only; the home kit never picks these.
- `bestChoice: true` — award treatment on tiles.

## specs drive the coverage model — not just the spec table
The kit builder reads `specs` to decide **what a product lets you train** (`gymgear-kits` skill). Two categories where a careless `specs` object silently breaks kits:

- **machines** — `machineTrains()` switches on `specs.Type` (`All-In-One`, `Functional Trainer`, `Cable Tower`, `Multi-Station`, `Home Gym`, `Smart Gym`) and `specs.Movement` (`Leg Press`, `Row`, `Posterior Chain`). A machine with neither — or with the placeholder `—` — **trains nothing** in the model: the builder treats it as dead weight and buys other gear around it. It also decides `replacesRack()`, i.e. whether the kit still needs a rack.
- **barbells** — a bar that can't rack/bench/squat (EZ curl, specialty) must be added to `SPECIALTY_BARS` in both `src/lib/coverage.ts` and server.js, or it will satisfy the kit's barbell slot and produce a squat stand loaded with a curl bar.

After adding to either category, run `npm run audit:kits` in the frontend.

## Images
`IMGS[id]` pools — photos must be **subject-correct** per product (a rower photo on a rower, not generic gym stock; this was a real cleanup pass). Category lead images feed `/api/categories` browse thumbnails.

## Wiring checklist — a product isn't "added" until:
1. **Placeable category** (racks/machines/cardio/benches/dumbbells) → add `FOOTPRINTS[id]` (published W×D inches) in frontend `src/lib/floor-plan.ts`, else the floor planner silently draws a wrong-size default box.
2. **Kit selection logic changed?** → port identically to frontend `src/lib/kit-builder.ts` + `src/lib/coverage.ts` (prod kits come from there — kit-builder lockstep; see the `gymgear-kits` skill). Backend must deploy BEFORE the frontend ISR refresh shows new products.
3. `node --check server.js` passes.
4. **Kit-eligible category?** (racks/machines/barbells/plates/benches/dumbbells/kettlebells/cardio/bands/jumpropes/yogamats/foamrollers) → run `npm run audit:kits` in the frontend. A new product can only ever be *picked*, so this catches the cases where it gets picked and shouldn't be.
5. Local smoke: run server with `ALLOWED_ORIGINS=http://localhost:3000`, POST `/api/kit` across a couple of quiz profiles; kill stale `node.exe` first (orphaned servers have served stale code during testing before).

## Data honesty (hard rules)
Never invent prices, ratings, review counts, or expert verdicts — published listing data and real reviews only. Free-tier retail/affiliate links only (Amazon per-item links; the bulk-cart endpoint is dead — no cart).
