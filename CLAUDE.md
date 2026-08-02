# GymGear Compare — Backend Briefing

Express API for **gymgearcompare.com** — product catalog + AI endpoints. Deployed on Render (free tier).
The frontend is a **Next.js 16 app** in `C:\Users\nirka\Documents\gymgear-frontend-final` (see its CLAUDE.md/CONTEXT.md) — NOT the old static HTML site some older docs describe.

## Live
- API: https://gymgear-backend5.onrender.com · Site: https://gymgearcompare.com
- GitHub: https://github.com/starcrock7-lab/GYMGEAR-BACKEND5 — **PUBLIC repo: nothing secret may ever be committed**

## The rules that prevent breakage
1. **Never commit secrets.** `SITE_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` are Render env vars only — never in code, docs, or examples. `.env.example` holds **blank placeholders only** (a real SITE_KEY sat there until the 2026-07-09 security review; an older CLAUDE.md leaked it too — both scrubbed, key rotated, old key rejected by prod).
2. **Verify after every edit:** `node --check server.js` must pass, then hit `GET /health` locally (`npm run dev`, port from `PORT` env). There is no test suite — the syntax check is the gate.
3. **Smallest possible diff.** `server.js` is one large file (~1,300 lines, mostly hardcoded product data). Bad bulk edits have corrupted files in this project before. Never rewrite it wholesale.
4. **Keep the security middleware intact:** CORS origin allowlist, 60 req/min rate limit, and `X-Site-Key` header validation. The frontend only calls through its `apiFetch()` wrapper which sends that header.
5. **Git email must be `starcrock7@gmail.com`** (`git config user.email`) or Vercel-linked deploy tooling rejects the push.
6. **The kit builder exists twice.** `COVERAGE MODEL` + `KIT BUILDER` here are a mirror of the frontend's `src/lib/coverage.ts` + `src/lib/kit-builder.ts`, which is what production actually serves. Change one, change both, then prove it: `npm run check:lockstep` and `npm run audit:kits` in the frontend repo. `node --check` cannot see divergence. See the `gymgear-kits` skill.

## What's in server.js
| Route | What it does |
|---|---|
| `GET /health` | status + category count (`server.js:908`) |
| `GET /api/products/:cat` | 8 products for one of 20 categories (`:910`) |
| `GET /api/categories` | category metadata (`:917`) |
| `POST /api/compare` | AI verdict comparing selected products — Anthropic Claude (`:922`) |
| `POST /api/kit` | quiz → kit builder: **deterministic cart builder** picks products (budget/space/owned-aware), then checks the result against the `COVERAGE MODEL` section — a kit must let you *train every muscle group its goal requires*, not merely hang together. Groq (Llama 3.3 70B) writes only the kit name/description; the coverage sentence is appended deterministically on every path so the claim can't be hallucinated or dropped. Templated fallback copy if no key or API error. Server validates + hydrates product ids and owns all price data. |
| `POST /api/gym-plan` | commercial gym planner (new build/renovation): deterministic zone allocator (budget split by facility type, quantities from area/peak capacity, renovation keep-zones, flooring sized by coverageSqFt) specs **pro-flagged** gear only; Groq writes the prose plan (LAYOUT/BUYING ORDER/WHY/WATCH OUT), templated fallback. |

Catalog: 31 categories, 290 hardcoded products in `PRODUCTS` (incl. `machines` and `flooring`). Product flags: `compact:true` (machines/cardio/racks — fits a tight space; kit builder gates non-compact out of small rooms per product), `pro:true` (commercial-suitable — set in p() opts or bulk via `PRO_IDS`; the gym planner specs pro gear only), `coverageSqFt` (flooring sizing). Product shape: `{ id, name, brand, emoji, price, retailer, url, affiliateUrl, quality, rating, reviewCount, reviewSource, expertVerdict, expertSource, specs{}, aspects[], bestChoice?, salePrice?, discount? }`. Buy links resolve `affiliateUrl || url`; Amazon tag `gymgearcompar-20`.

## Render env vars (names only — values live in the Render dashboard)
`ANTHROPIC_API_KEY` (compare verdicts) · `GROQ_API_KEY` (kit copy) · `SITE_KEY` (must match frontend) · `ALLOWED_ORIGINS` (must include `https://gymgearcompare.com` + `www`)

## Deploy
Push to `main` → Render deploy (manual deploy from dashboard if auto-deploy is off). Free tier **sleeps after 15 min**; first request takes 30–60 s — normal, not a bug.

## Price truth check (`scripts/check-prices.js`)
Weekly GitHub Action (`.github/workflows/price-check.yml`) that reads every product's price from its **live retailer listing** and opens a PR with the diff. A human merges it — the job never writes to `main`.

- `npm run check:prices` — dry run, writes nothing, prints the classification table
- `npm run check:prices:write` — applies edits (what CI runs before raising the PR)
- Flags: `--limit N`, `--only id1,id2`, `--json out.json`, `--catalog file` (test against a copy)

**The rule this exists to enforce:** a price is only ever *read*, never inferred, estimated or carried forward, and **no LLM authors a price**. Anything unreadable is reported `UNREADABLE` and left alone. Deliberate refusals you'll see in the output:
- `amazon-tos` — Amazon (81 of 290 products) is never scraped; it needs PA-API via the Associates account
- `ambiguous-variants` — a Shopify listing priced per variant, where the catalog row doesn't record which one. Guessing here turned a $295 dumbbell **set** into the $29.99 single, i.e. a fabricated 90% discount
- `http-403` — Rogue and several others block bots at the product page; robots.txt is served fine, the page is not

Edits go through `scripts/catalog-io.js`, which walks each `p(...)` call quote- and bracket-aware and replaces only the exact value span — never a whole-file regex, which is how the 15 positional args get silently swapped.

## Inactive-but-present
`search.js` + `weekly-refresh.yml` — weekly **AI** price-refresh pipeline, **not active**. Don't wire it up as a side effect of another change. Not the same thing as `check-prices.js` above: that pipeline puts an LLM in the pricing path, which is exactly what the deals rule forbids.
