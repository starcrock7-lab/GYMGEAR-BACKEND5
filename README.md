# GymGear Compare — Backend

Express API serving the product catalog, kit builder and gym planner. See CLAUDE.md for working rules.

## Session log

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
