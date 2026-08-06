# Re-sourcing brief (agent prompt)

For moving a catalog row off a retailer we cannot verify (Amazon, or a dead
URL) onto one we can. Give the agent the row and this brief verbatim.

## The job

You are given catalog rows whose current retailer link is unusable — Amazon
(we cannot read their prices or images without PA-API) or a URL that now 404s.
Find **the same product** on another retailer and report the replacement.

Amazon does not manufacture most of what it sells, so the manufacturer's own
store is usually the best target: Optimum Nutrition, Gaiam, RumbleRoller,
TriggerPoint, Osprey, Nike, Bowflex all sell direct.

## What counts as "the same product"

The **same model, same specification**. A 36" high-density foam roller is not
"the same" as a 24" one. A 20 kg bar is not a 15 kg bar. If you can only find
a different size, colour or generation, that is **not** a match — report it as
`no-match` rather than substituting something close. Wrong product data is
worse than a missing row.

## For each row, report

| Field | Rule |
|---|---|
| `url` | The product page on the new retailer. Pin the variant (`?variant=…`) if the listing is priced per variant |
| `price` | Read from that page. Never carried over from the Amazon row |
| `salePrice` | Only if the page shows a real discount; otherwise null |
| `retailer` | The new retailer's name |
| `image` | The product's own photo URL from that page |
| `evidence` | The spec or model number that proves it is the same product |

## Hard rules

1. **Never invent a price.** Read it from the new page or report `unreadable`.
2. **Prefer a retailer whose price we can re-read** — a Shopify store (its
   `/products/<handle>.js` endpoint works) beats one that blocks scripts.
   `node scripts/check-prices.js --only <id>` must return UNCHANGED afterwards,
   and that is the acceptance test for your work.
3. **No close-enough substitutions.** Report `no-match` and move on.
4. **Amazon house brands cannot be re-sourced.** Amazon Basics products exist
   nowhere else — report them as `house-brand` so they can be delisted.
5. Note if the new retailer has **no affiliate programme**; moving the link
   costs commission, which is a business decision, not yours to make silently.

## Output

Write your findings as JSON to the file path you are given:

```json
[{ "id": "...", "status": "replaced|no-match|house-brand|unreadable",
   "url": "...", "price": 0, "salePrice": null, "retailer": "...",
   "image": "...", "evidence": "...", "affiliate": "yes|no|unknown" }]
```

Report how many you replaced, how many had no match, and anything you were
unsure about.
