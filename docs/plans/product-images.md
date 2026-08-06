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

## The stock pool is gone (2026-08-04)

`server.js` no longer substitutes a category stock photo. A product with no
verified image returns `image: null` and the frontend draws the brand tile it
already had. Category thumbnails still use the pool — a category is not a
product.

## What the capture pass taught us

Running headless Chrome over the 31 unreadable rows returned 6 images, and
**3 of those 6 were wrong** — a backpack for a sports-bra row, a campaign
banner for a different shoe model, a bra of the wrong model. Two causes, both
now refused outright:

- **The row's URL was a collection or category page**, so no single product was
  on it. Those rows need a real product URL, not a picture.
- **The picked filename shared no word with the product**, i.e. the picker was
  guessing among a page full of images. Now reported as `NEEDS_EYES`.

**Never write a captured image without looking at it.** The heuristic picks a
plausible file, not a correct one; a human or an agent has to confirm it is
that product before it ships. That is the whole point of this exercise.

## The bigger find: dead links

13 of the 31 rows are not missing an image — their **Buy link is dead**
(Titan ×5 canonical to /404, Klean ×3, YoungLA ×2, Hydrow, New Balance, AG1).
Those go through the re-sourcing brief (`resource-brief.md`), same as the
Amazon rows: find the same product on a retailer we can verify, or delist.

## Published vs shelved (2026-08-04)

`server.js` serves only rows that have a verified photo. Everything else stays
in the file and is filtered out at startup, so it cannot appear in a listing, a
kit, a plan, search or the sitemap. One rule, and it is self-maintaining —
verify a photo and the product publishes itself.

That shelf currently holds **66 rows**: the 33 Amazon ones (deliberate — their
images need PA-API, and the affiliate links are kept for the day we have keys),
the 13 dead retailer links, the collection-URL rows, and the rest that no
source could prove.

Published: **225 of 291**, every one with a photo of that exact product.
Thin categories to refill first: gymbags (1), kettlebells (2), sportsbras (2),
foamrollers (2).

## Gate

`npm run check:images` is the gate. It fails a run where nothing was readable
(a dead extractor must never look like a clean bill of health), and the report
lists every row still on a stock photo.
