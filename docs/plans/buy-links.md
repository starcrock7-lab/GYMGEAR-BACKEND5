# Every Buy link goes to the product

**Status:** in progress · started 2026-08-04

```bash
node scripts/check-links.mjs              # audit every row
node scripts/check-links.mjs --published  # only what the site serves
```

## The error

Some catalog rows never had a product URL. They were written with whatever page
was to hand — a category listing, a collection, sometimes a domain that has
since been sold. Nothing ever checked them, and `affiliateUrl` falls back to
`url`, so the Buy button inherits the same wrong destination.

Three shapes, all seen in one screenshot of `/category/shorts`:

| Row | URL points at | What the shopper gets |
|---|---|---|
| `nike-dri-fit` | `nike.com/w/mens-training-shorts` | a category page, and Nike's own "IMAGE UNAVAILABLE" placeholder as the photo |
| `lululemon-shorts` | a `/en-us/p/…` product path | **redirected to the lululemon home page** |
| `better-bodies-shorts` | `better-bodies.com/collections/mens-shorts` | **HugeDomains** — the domain is for sale, and the "product photo" was its parking banner |

The common failure is the same as with prices and images: a value nobody
verified, presented to a customer as fact. A link to a category page is not a
Buy button, it is a shrug — the price and photo we showed belong to a product
the shopper now has to go and find.

## The rule

**A row may only be published if its link resolves to that product's own
page.** Not a listing, not a home page, not a parked domain.

## Classes

| Class | Meaning | Action |
|---|---|---|
| `PRODUCT` | JSON-LD Product, `og:type=product`, or an add-to-cart form | publish |
| `LISTING` | Collection / category / search page | shelve, re-source |
| `HOME` | Canonical or redirect lands on the site root | shelve, re-source |
| `DEAD` | 404 / gone / canonical to `/404` | shelve, re-source |
| `PARKED` | Domain is for sale | shelve, delist the retailer |
| `BLOCKED` | Unreadable (Amazon, hard bot wall) | reported, not judged |

Two implementation notes worth keeping:

- **The canonical is the evidence.** When Chrome renders a page we never see
  the redirect chain, so `<link rel=canonical>` (or `og:url`) is what tells us
  a product URL actually answered with the home page.
- **400/403/429 are not verdicts.** Bot walls answer those to a plain fetch and
  serve the real page to a browser, so they trigger the Chrome fallback.

## Fixing, not hiding

Shelving stops the harm immediately; it does not fix the row. Each shelved row
goes through `resource-brief.md`: find the same product on a retailer whose
page we can verify, or delist it. The acceptance test is this audit returning
`PRODUCT`, plus `check-prices --only <id>` returning UNCHANGED.

## First audit (2026-08-04, 291 rows)

| Class | Count |
|---|---|
| PRODUCT | 219 |
| DEAD | 35 |
| LISTING | 14 |
| HOME | 12 |
| UNKNOWN | 6 |
| PARKED | 5 |

66 rows do not reach a product page; 23 of them were live on the site. All are
shelved. `BAD_LINK_IDS` in `server.js` carries the list — regenerate it from a
fresh audit after re-sourcing.

Two `UNKNOWN` rows (assault-bike, assault-runner) are genuine product pages
with no standard markup — their titles are the product names — so they stay
published. The rest of the UNKNOWNs were already shelved.

Shelving 23 rows emptied two categories (hoodies, sports bras), so
`/api/categories` now omits any category with nothing publishable: a "Best
Hoodies, ranked" page with no products is worse than not offering the page,
and the frontend builds its nav, browse grid and sitemap from that list.

**Published: 202 of 291** — every one with a photo of that exact product and a
link that lands on it.

## Deploy order (learned the hard way, 2026-08-07)

Shelving a row removes it from the API, but the frontend's category and product
pages are ISR-cached for an hour. Push the backend, **wait for Render to finish**,
then deploy the frontend — otherwise Vercel prerenders against the old catalog
and keeps serving the shelved products until revalidation. After the first push
`/category/hoodies` was still listing five rows whose links were dead or parked,
straight from `X-Vercel-Cache: HIT`.

If they get out of step, push again once the backend is live; a fresh
deployment discards the stale pages.

## Picker pages (added 2026-08-07)

A `/products/…` URL can answer 200, carry add-to-cart markup, and still not be
a product: Titan sells whole ranges from one page — 20+ kettlebells or plates,
each with its own price and stock state — behind a single handle whose feed
price belongs to none of them. `titan-lb-cast-iron-kettlebells` advertised
$1,999.99 → $1,339.99; `lb-elite-competition-plates` carried $449.99 against a
real basket of $2,059.86. Two enrichment agents found this independently.

The detector is the **"add all selections"** control, nothing else. Counting
prices or cart buttons condemns any normal product page with a
recommended-accessories grid — it wrongly flagged the REP Arcadia and the
Bells cable tower before being narrowed.

## Gate

`npm run check:links`. Publishing is conditional on it, so a link that rots
later takes its product off the site rather than sending a customer nowhere.
