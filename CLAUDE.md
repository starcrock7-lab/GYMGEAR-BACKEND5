# GymGear Compare — Project Briefing for Claude Code

## What This Is
GymGear Compare (gymgearcompare.com) is an AI-powered gym equipment, clothing, and supplement price comparison website with an affiliate revenue model. Users select two or more products, see a side-by-side spec breakdown, and get an AI verdict on which to buy. The site is live and functional.

---

## Live URLs
- **Frontend:** https://gymgearcompare.com (also https://gymgear-frontend5.vercel.app)
- **Backend:** https://gymgear-backend5.onrender.com
- **GitHub Frontend:** https://github.com/starcrock7-lab/gymgear-frontend5
- **GitHub Backend:** https://github.com/starcrock7-lab/GYMGEAR-BACKEND5

---

## Local Folder Paths
- **Frontend:** `C:\Users\nirka\Documents\gymgear-frontend-final`
- **Backend:** `C:\Users\nirka\Documents\gymgear-backend-new`

---

## Tech Stack
- **Frontend:** Static HTML/CSS/JS — index.html, app.html, sponsors.html — deployed on Vercel
- **Backend:** Node.js/Express — server.js — deployed on Render.com (free tier, sleeps after 15min inactivity)
- **Fonts:** Syne (headings) + DM Sans (body) from Google Fonts
- **Images:** Unsplash photos (free commercial license)
- **Domain:** Bought directly through Vercel — gymgearcompare.com
- **Contact form:** Formspree (already activated on sponsors.html)

---

## Services & Accounts
| Service | Purpose | Notes |
|---|---|---|
| Vercel | Frontend hosting + domain | Free tier, auto-deploys on git push |
| Render.com | Backend hosting | Free tier, sleeps after 15min |
| GitHub (starcrock7-lab) | Version control | Both repos are public |
| Anthropic API | AI comparison verdicts + reviews | Tier 1, rate limits apply |
| Amazon Associates | Affiliate links | Tag: gymgearcompar-20 |
| Formspree | Sponsor contact form | Already set up on sponsors.html |

---

## File Structure

### Frontend (gymgear-frontend-final/)
```
index.html      — Homepage: hero, 3 category cards, how it works, sponsor CTA
app.html        — Main comparison app
sponsors.html   — Brand partnership / media kit page with contact form
logo.svg        — Orange gradient dumbbell logo with diagonal split
```

### Backend (gymgear-backend-new/)
```
server.js       — All product data + API routes. NO external API calls — pure sample data
search.js       — Weekly AI search script (runs via GitHub Actions — NOT active yet)
weekly-refresh.yml — GitHub Action for weekly product refresh (NOT active yet)
```

---

## Design System
```css
--accent: #e8542a        /* orange — primary brand color */
--navy: #0d1b35          /* dark blue — hero backgrounds, compare bar */
--text: #161410          /* near-black */
--text-2: #706b63        /* body text */
--text-3: #aca59b        /* muted/labels */
--off: #f8f7f5           /* page background */
--border: #e6e1da        /* card borders */
--green: #15803d         /* Best Choice badge, winner highlight */
--ff: 'Syne'             /* display font — headings, buttons, prices */
--fb: 'DM Sans'          /* body font */
```

---

## Logo
SVG dumbbell with diagonal split (orange left `#e8542a`, deeper orange right `#c94020`), knurl detail lines, no background. Inline SVG in nav and footer of all pages. The split represents the "comparison" concept. Logo is embedded inline — no external file request needed.

---

## Backend Architecture

### server.js — Key Facts
- **Zero API calls on startup** — all 160 products are hardcoded sample data
- **20 categories, 8 products each = 160 total**
- **Security:** CORS origin allowlist, rate limiting (60 req/min), secret key header (`X-Site-Key`)
- **Secret key:** `ggcp-2026-xK9m` — frontend sends as `X-Site-Key` header, backend validates via `SITE_KEY` env var on Render

### Render Environment Variables (must be set)
```
ANTHROPIC_API_KEY = (the key)
ALLOWED_ORIGINS   = https://gymgearcompare.com,https://www.gymgearcompare.com
SITE_KEY          = ggcp-2026-xK9m
```

### API Routes
```
GET  /health                    — status check
GET  /api/products/:cat         — returns 8 products for a category
GET  /api/categories            — returns all 20 category metadata
POST /api/compare               — returns AI verdict comparing p1 vs p2
POST /api/reviews               — returns 3 sample reviews for a product
```

### Categories (20 total)
**Equipment (8):** benches, barbells, dumbbells, plates, racks, cardio, kettlebells, bands
**Clothing (6):** shorts, compression, tanks, hoodies, footwear, sportsbras
**Supplements (6):** preworkout, protein, creatine, recovery, vitamins, fatburners

### Product Data Structure
```js
{
  id: 'rogue-ohio',
  name: 'Ohio Bar',
  brand: 'Rogue Fitness',
  emoji: '🥇',           // shown as product card image
  price: 345,
  retailer: 'Rogue Fitness',
  url: 'https://...',    // direct product URL
  affiliateUrl: '',      // affiliate link (empty until approved)
  quality: 9.5,          // 0-10 quality score
  rating: 4.9,           // customer star rating
  reviewCount: 2100,
  reviewSource: 'Rogue Fitness',
  expertVerdict: 'The best all-around barbell ever made.',
  expertSource: 'Garage Gym Reviews',
  specs: { Weight: '20 kg', Shaft: '28.5mm', ... },
  aspects: ['American Made', 'All-Purpose', 'Gold Standard'],
  bestChoice: true,      // shows green "Best Choice" stripe at top of card
  salePrice: 299,        // optional — triggers discount badge
  discount: 13,          // auto-calculated % off
}
```

---

## Frontend Architecture (app.html)

### Navigation — Hollister-Style Drill-Down
Three top-level groups (Equipment / Clothing / Supplements) each open a dropdown of subcategories on click. Active category shown in breadcrumb. No flat pill strip — it's a drill-down.

### Product Cards
- Emoji displayed large on gradient background (no photos — hotlinking from brands is blocked)
- Best Choice: green stripe across top of card (z-index:2)
- Selected badge: green pill top-right (z-index:10, above best-choice stripe)
- Discount badge: red angled clip-path bottom-left, pulsing animation
- Sale price: red with strikethrough original

### Comparison (supports 2–4 products)
- Compare bar slides up from bottom when products are selected
- Supports up to 4 products simultaneously
- Unified spec matrix: all specs from ALL selected products shown, `—` where a product doesn't have that spec
- Winner column has green top border + "🏆 Best" badge
- AI verdict shows pros/cons for each product in a two-column layout

### Filters (sidebar on desktop, drawer on mobile)
- Sort: Low → High / High → Low
- Deals: On Sale toggle, Clearance toggle (20%+ off)
- Price Range: Low $ — High $
- Brand chips
- Min Rating radio buttons

### apiFetch helper
All API calls go through `apiFetch()` which automatically adds the `X-Site-Key` header. Never use raw `fetch(BACKEND+...)` directly.

---

## Affiliate Links
- Amazon products use tag: `gymgearcompar-20`  
  Format: `https://www.amazon.com/s?k=Product+Name&tag=gymgearcompar-20`
- Other brands (Ghost, Transparent Labs, Rep Fitness, Young LA, etc.) — affiliate applications in progress
- `affiliateUrl` field in each product is currently empty (`''`) — fill in once approved
- Buy buttons use: `p.affiliateUrl || p.url`

---

## Current Known Issues / Things Being Worked On
1. **Product images** — currently using emoji. Once Amazon Associates account hits 3 qualifying sales, apply for Product Advertising API to get real product photos
2. **Weekly AI refresh** — search.js and weekly-refresh.yml exist but are NOT active. Currently all data is hardcoded. Activate when ready to go live with real pricing
3. **Sponsors page** — live and working with Formspree. Ghost affiliate application in progress
4. **More product categories** — could add yoga mats, foam rollers, gym bags, shaker bottles, jump ropes
5. **Logo** — inline SVG dumbbell with diagonal split, orange gradient. May need slight refinement

---

## Deployment Workflow

### Frontend (Vercel auto-deploys on push)
```powershell
cd C:\Users\nirka\Documents\gymgear-frontend-final
git add .
git commit -m "description"
git push origin main
# Vercel auto-deploys within ~30 seconds
# Hard refresh browser: Ctrl+Shift+R
```

### Backend (Render manual deploy or auto on push)
```powershell
cd C:\Users\nirka\Documents\gymgear-backend-new
git add .
git commit -m "description"
git push origin main
# Then: Render dashboard → Manual Deploy
# OR set up auto-deploy in Render settings
```

---

## Important Notes for Claude Code
- **Never add `SITE_KEY` or `ANTHROPIC_API_KEY` to any file** — these are env vars on Render only
- **Don't break the `apiFetch` wrapper** — all API calls must go through it
- **ALLOWED_ORIGINS must include gymgearcompare.com** — currently hardcoded in server.js AND as Render env var
- **Render free tier sleeps** — first request after inactivity takes 30-60s. This is normal.
- **Git email** must be `starcrock7@gmail.com` for Vercel to accept deploys
  ```powershell
  git config --global user.email "starcrock7@gmail.com"
  ```
- **Both repos are public** on GitHub — required for Vercel free tier
- **The JS in app.html has been corrupted before** by bad str_replace operations. Always verify with a syntax check after edits. The key rule: `PROD_IMGS`, `CAT_IMGS`, and `getProdImg` should each appear exactly once.

---

## Revenue Model
1. **Affiliate commissions** — Amazon (4-8%), brand programs (10-20%)
2. **Display ads** — Ad slots already in HTML (leaderboard, sidebar skyscraper, in-grid rectangle). Paste Google AdSense code when ready
3. **Sponsored listings** — brands pay for featured placement with "Sponsored" badge
4. **Media kit** — sponsors.html has full partnership page with contact form

---

## Traffic Strategy (Not Started Yet)
- Reddit: r/homegym, r/Fitness, r/xxfitness — post genuine comparisons, mention site naturally
- TikTok/Instagram Reels — 30-second comparison videos using the live site
- Google SEO — comparison article titles like "Rogue Ohio Bar vs Eleiko IWF Bar"
- YouTube Shorts

---

## Copyright / Legal
- Copyright on code and design: automatic, owned by site creator
- Trademark "GymGear Compare": using ™ symbol (unregistered). File with USPTO when revenue starts (~$350, Class 42)
- Affiliate disclosure: already in footer — "Some links are affiliate links..."
- FTC compliant: disclosure present
