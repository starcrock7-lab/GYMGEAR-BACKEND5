# GymGear Compare — Backend Briefing

Express API for **gymgearcompare.com** — product catalog + AI endpoints. Deployed on Render (free tier).
The frontend is a **Next.js 16 app** in `C:\Users\nirka\Documents\gymgear-frontend-final` (see its CLAUDE.md/CONTEXT.md) — NOT the old static HTML site some older docs describe.

## Live
- API: https://gymgear-backend5.onrender.com · Site: https://gymgearcompare.com
- GitHub: https://github.com/starcrock7-lab/GYMGEAR-BACKEND5 — **PUBLIC repo: nothing secret may ever be committed**

## The rules that prevent breakage
1. **Never commit secrets.** `SITE_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` are Render env vars only — never in code, docs, or examples. (A previous CLAUDE.md leaked the SITE_KEY value into this public repo — if not rotated yet, rotate it in Render + the frontend's Vercel env.)
2. **Verify after every edit:** `node --check server.js` must pass, then hit `GET /health` locally (`npm run dev`, port from `PORT` env). There is no test suite — the syntax check is the gate.
3. **Smallest possible diff.** `server.js` is one large file (~1,300 lines, mostly hardcoded product data). Bad bulk edits have corrupted files in this project before. Never rewrite it wholesale.
4. **Keep the security middleware intact:** CORS origin allowlist, 60 req/min rate limit, and `X-Site-Key` header validation. The frontend only calls through its `apiFetch()` wrapper which sends that header.
5. **Git email must be `starcrock7@gmail.com`** (`git config user.email`) or Vercel-linked deploy tooling rejects the push.

## What's in server.js
| Route | What it does |
|---|---|
| `GET /health` | status + category count (`server.js:908`) |
| `GET /api/products/:cat` | 8 products for one of 20 categories (`:910`) |
| `GET /api/categories` | category metadata (`:917`) |
| `POST /api/compare` | AI verdict comparing selected products — Anthropic Claude (`:922`) |
| `POST /api/reviews` | sample reviews for a product (`:978`) |
| `POST /api/kit` | quiz → kit builder (`:1227`): **deterministic cart builder** picks products (budget/space/owned-aware); Groq (Llama 3.3 70B) writes only the kit name/description; templated fallback copy if no key or API error. Server validates + hydrates product ids and owns all price data. |

Catalog: 20 categories × 8 = 160 hardcoded products in `PRODUCTS`. Product shape: `{ id, name, brand, emoji, price, retailer, url, affiliateUrl, quality, rating, reviewCount, reviewSource, expertVerdict, expertSource, specs{}, aspects[], bestChoice?, salePrice?, discount? }`. Buy links resolve `affiliateUrl || url`; Amazon tag `gymgearcompar-20`.

## Render env vars (names only — values live in the Render dashboard)
`ANTHROPIC_API_KEY` (compare verdicts) · `GROQ_API_KEY` (kit copy) · `SITE_KEY` (must match frontend) · `ALLOWED_ORIGINS` (must include `https://gymgearcompare.com` + `www`)

## Deploy
Push to `main` → Render deploy (manual deploy from dashboard if auto-deploy is off). Free tier **sleeps after 15 min**; first request takes 30–60 s — normal, not a bug.

## Inactive-but-present
`search.js` + `weekly-refresh.yml` — weekly AI price-refresh pipeline, **not active**. Don't wire it up as a side effect of another change.
