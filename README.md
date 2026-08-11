# GymGear Compare — Backend

Express API serving the product catalog, kit builder and gym planner. See CLAUDE.md for working rules.

## Session log

- 2026-08-10 · fixed the 16 unverifiable rows: 14 had silently redirected to new URLs (adopted, and one had landed on the WRONG product — Legion Whey+ vs Whey Concentrate), manduka pinned to a variant, 5 prices corrected incl. a Schwinn sale that had ended; 8 rows shelved as unverifiable (Legion x5, Liforme GBP, two weight-graded REP). Link checker no longer calls a Cloudflare challenge a dead product — it was about to condemn all 26 Rogue rows · this commit
- 2026-08-08 · sold-out rows are shelved automatically: the daily price job now maintains SOLD_OUT_IDS (adds what it reads as out of stock, removes what came back, never guesses from a failed read); 253 published · this commit
- 2026-08-08 · merged the price bot's stranded sale (bells-power-bar 10% off); a refused PR now raises an issue instead of failing silently; new weekly catalog-health workflow re-checks every link and photo · this commit
- 2026-08-07 · refill batch: 56 products added from six unmined retailers (Titan, GoRuck, Pioneer, Fringe, JadeYoga, FrictionLabs) — 56/56 verify UNCHANGED and 56/56 links resolve to a product page; hoodies and sports bras are back, 258 published of 347 · this commit
- 2026-08-04 · Buy-link audit (check-links.mjs): 66 of 291 links never reached a product page (35 dead, 14 listings, 12 landing on the retailer's home page, 5 parked domains) — all shelved, the Amazon-search fallback for broken links deleted, and categories left with nothing publishable are no longer offered; 202 published · this commit
- 2026-08-04 · products without a verified photo are no longer served (225 published, 66 shelved incl. all 33 Amazon rows kept for later); every product on the site now shows a photo of that exact product · this commit
- 2026-08-04 · stock-photo fallback deleted (a product with no verified photo now renders the brand tile); Chrome capture pass over the 31 unreadable rows returned 3 usable images (Thorne) and exposed 13 dead Buy links · this commit
- 2026-08-04 · product images audited against each product's own page: 45 fixed (36 wrong photo, 9 missing), including variant-correct shots — the Open Trap Bar had the Standard photo on a Wide row, the BlackWing had Matte on a Metallic SKU; 69 rows still on the stock-photo fallback (33 of them Amazon, which needs PA-API) · this commit
- 2026-08-04 · REP Fitness batch: 9 products added (282 -> 291), all 9 verify UNCHANGED; 39 of 48 candidates dropped — rig hardware, configurators, and five plate-set pages REP marks noindex/hide-from-search (a Buy link there lands on a page REP does not publish) · this commit
- 2026-08-03 · first expansion batch: 21 discounted Bells of Steel products added (261 -> 282), all 21 verify UNCHANGED against the live listing; addProducts now scopes the category lookup to PRODUCTS (a bare name search inserted a row into the stock-image pool) · this commit
- 2026-08-03 · catalog expansion started: plan + agent enrichment brief in docs/plans/, import-harvest (Shopify feed -> staging, USD-only, variant-pinned), catalog-io addProducts + import-apply (refuses unfinished rows), price-check now daily with an 18% verifiable-coverage floor · this commit
- 2026-08-02 · full price audit: 23 rows re-priced from live retailer data; 4 Bells of Steel rows moved off the CAD .com store to .us · this commit
- 2026-08-02 · check-prices honours ?variant= on a catalog URL (no longer UNREADABLE as ambiguous); pinned both Bells of Steel rows, bells-ft 2145 -> 2144.99 · this commit
- 2026-08-02 · bells-cable-tower buy link now deep-links the plate-loaded variant; added Config spec · this commit
- 2026-08-02 · bells-cable-tower price 420 -> 434.99, verified against Bells of Steel plate-loaded variant · this commit
- 2026-08-02 · retailer rating/reviewCount now optional; missing facets score at category median so absence is neutral · this commit
- 2026-08-02 · archived 27 products with dead retailer URLs to ARCHIVED-PRODUCTS.md (288 -> 261) · this commit
- 2026-08-02 · delisted archon-bench (brand storefront now a parked domain) · this commit
- 2026-08-02 · delisted discontinued rep-hr100; added removeProducts to catalog-io · this commit
- 2026-08-02 · fixed 3 dead product URLs (assault-bike, assault-runner, concept2-bikeerg); added URL editing to catalog-io · this commit
