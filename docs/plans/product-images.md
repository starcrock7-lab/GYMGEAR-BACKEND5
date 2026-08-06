# Every image is a photo of that exact product

**Status:** in progress · started 2026-08-04
**Owner:** any chat may pick this up. Run the audit first — it tells you the current state in one command.

```bash
node scripts/check-images.mjs            # audit, writes nothing
node scripts/check-images.mjs --write    # fill in only what it can prove
```

## The problem

`server.js` falls back to a **stock photo pool** when a product has no `IMGS`
entry (`p.image = p.image || pool[h % pool.length]`). 78 of 291 rows hit that
path, so the site shows a generic gym photo in place of a specific hoodie,
shoe or bench. It reads as fake, and for apparel it is simply wrong — the
picture is of a different product.

Variants make it worse: a row pinned to the black colourway can still carry
the product's default photo of the blue one.

## The rule

**An image must be read from that product's own page, for that variant.**
Never a stock bank, never a category photo, never another colourway, never a
site-wide share card. Same cardinal rule as prices: if it cannot be read, it
does not get filled in.

## Source order (first one that holds wins)

| # | Source | Why it ranks here |
|---|---|---|
| 1 | Shopify **variant** `featured_image` | The exact SKU the row is priced from — the only source that gets colourways right |
| 2 | Shopify product `images[0]` | The retailer's own primary photo |
| 3 | JSON-LD `Product.image` | The retailer *stating* which image is the product's |
| 4 | `og:image` / `twitter:image` | Weakest: often the site's social share card. Rejected when the filename looks generic (`share`, `logo`, `social`, `banner`…), and never auto-written |
| 5 | **Screenshot** of the product page's own image element | For pages with no machine-readable image at all. Saved to the frontend's `public/product-images/<id>.jpg` and referenced by path |
| — | Amazon | **PA-API only.** Scraping or rehosting Amazon images breaks the Associates terms, so these rows are reported, never auto-filled |

Two identical images can have different URLs — Shopify serves the same file
from both the shop domain and `cdn.shopify.com`, plus size transforms. Compare
the **filename**, not the URL, or every row reads as a mismatch.

## Classes the audit reports

| Class | Meaning | Action |
|---|---|---|
| `OK` | Catalog image matches the page | none |
| `MISSING` | No `IMGS` entry — renders a stock photo of something else | auto-fill |
| `MISMATCH` | Catalog image differs from the page's own | auto-fill |
| `NEEDS_REVIEW` | Only a generic share card was readable | human |
| `UNVERIFIABLE` | Page unreadable, but we have an image already | leave |
| `NO_IMAGE` | Page unreadable AND no image | screenshot or delist |

## The stock pool has to go

Once coverage is high, delete the pool fallback. A random photo of a different
product is worse than an honest placeholder: it makes every image on the site
untrustworthy, including the correct ones. Interim state is fine; the end
state is "verified photo or neutral placeholder".

## Gate

`npm run check:images` is the gate. It fails a run where nothing was readable
(a dead extractor must never look like a clean bill of health), and the report
lists every row still on a stock photo.
