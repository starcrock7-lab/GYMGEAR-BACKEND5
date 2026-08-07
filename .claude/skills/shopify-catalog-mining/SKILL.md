---
name: shopify-catalog-mining
description: Read real product data (price, compare-at discount, variants, stock, currency, ratings) from e-commerce sites at scale using their own published endpoints, and get past the common blockers — Cloudflare 403s, rate limits, non-JSON content types, per-variant pricing. Use when building a price checker, mining competitor/retailer catalogs, sourcing products to import, verifying prices, or when a retailer page returns 403 to your script but loads fine in a browser.
---

# Shopify catalog mining

Most e-commerce fitness/retail sites are Shopify, and Shopify publishes machine-readable endpoints *for machines*. Use those before parsing HTML — they survive redesigns and carry fields HTML doesn't.

## The endpoints

| Endpoint | Gives you |
|---|---|
| `/products.json?limit=250&page=N` | whole catalog, paginated: title, handle, vendor, tags, variants |
| `/products/<handle>.js` | one product: `price`, `compare_at_price`, `available` per variant |
| `/meta.json` | **shop currency**, country, name |

Prices are in **cents** — divide by 100. `compare_at_price` is authoritative: null genuinely means no sale, so a sale ending can be believed from this source (unlike HTML).

Probe a host cheaply: fetch `/meta.json` and `/products.json?limit=250`. Non-Shopify sites 404 both.

## Non-negotiable preconditions before using a price

1. **Currency** — `/meta.json` → `currency`. A Calgary shop quoting CAD into a USD catalog invents a ~30% discount out of thin air.
2. **Variant ambiguity** — `[...new Set(variants.map(v => v.price))]`. More than one distinct price means the listing has no single price. If your record doesn't say *which* variant it priced, **refuse**; don't take the first or cheapest.
3. **Stock** — `variants.some(v => v.available)`.

## Gotchas that cost real time

- **`/products/x.js` serves `text/javascript`, not `application/json`.** Gating on content-type silently rejects your best source and falls through to HTML that may be blocked. Parse defensively: `try { JSON.parse(await res.text()) } catch { return null }`.
- **`product_type` is often one undifferentiated bucket** (e.g. 575 of 705 as "Exercise & Fitness"). Don't rely on it for categorising; use title patterns plus an exclusion list for parts and accessories (`attachment`, `spotter`, `j-cup`, `shim`, `bracket`, `coaster`, `replacement`, `bundle`).
- **`/products.json` caps at 250/page** and some hosts 404 it entirely while still serving `/products/x.js`.

## When the site blocks you

Order of escalation, stopping at the first that works:

1. **Check `robots.txt` first** — it's the site's *stated* policy. Frequently `/products` is explicitly allowed while Cloudflare still 403s a script. Allowed-but-bot-blocked is a detection heuristic, not a prohibition; blocked-in-robots is a prohibition, and you stop.
2. **The published JSON endpoints** often answer when the HTML page 403s.
3. **A real browser** renders what scripts can't. Once a page from that origin is open, `fetch()` from the page context is **same-origin and inherits the session** — so you can read many products in one pass instead of one navigation each.
4. **Official API** where the ToS requires it (Amazon → Product Advertising API). Never scrape a source whose terms forbid it to hit a coverage target — and note Amazon's API also returns rating and review count, fields you usually cannot get anywhere else.

Identify the bot honestly in `User-Agent`, rate-limit per host, and honour `Crawl-delay`.

## Ratings are the scarce field

Price is easy at scale; **published ratings are not**. In one sample only ~21% of retailers exposed `aggregateRating` in JSON-LD, concentrated in a few hosts. Plan for it: either make the rating field optional (see `optional-field-migration`) or accept a much smaller import. Do not fill the gap by estimating.

## Yield expectations

From 11 retailers in one pass: ~4,900 products → ~2,800 unambiguous (single price, in stock) → ~700 with a real `compare_at` discount → ~320 after excluding parts/apparel and classifying into real categories. Budget for roughly a **10× drop** from raw scrape to usable rows.
