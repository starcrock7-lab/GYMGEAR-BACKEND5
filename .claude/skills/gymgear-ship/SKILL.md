---
name: gymgear-ship
description: Ship and verify a GymGear Compare change end to end — frontend build gate, push, Vercel deploy watching (with its stale-list gotcha), production smoke tests with the site key, Render backend checks. Use when deploying gymgearcompare.com changes, or the user says "ship gymgear", "deploy the site", or "is prod ok?".
---

# Ship GymGear Compare

Repos: frontend `C:\Users\nirka\Documents\gymgear-frontend-final` (Vercel), backend `C:\Users\nirka\Documents\gymgear-backend-new` (Render). Both public — no secrets in any commit.

## Frontend
0. **Touched kit selection, the coverage model, the catalog, or the quiz?** Two extra gates before the build — both fast, both real:
   - `npm run audit:kits` — builds all 8,640 kits the quiz can produce, fails on any that isn't trainable
   - `npm run check:lockstep -- http://localhost:3002` — frontend builder vs `server.js` (start `gymgear-backend-alt` from `.claude/launch.json` first, so you're comparing against *your* backend changes, not a stale process)

   See the `gymgear-kits` skill. Neither runs on Vercel — if you skip them, nothing else will catch a broken kit.
1. Gate: `npm run build` green locally (Vercel runs the same; broken build = blocked deploy).
   - **Start the local backend first** (`node server.js` in the backend repo, port 3001): `.env.local` points builds at it, and SSG catalog fetches failing can leave `.next` incomplete (`ENOENT prerender-manifest.json` on `next start`) even though "Compiled successfully" prints.
   - **Capture the REAL exit code**: `npm run build > "$TEMP/build.txt" 2>&1; echo "EXIT: $?"` — piping to `grep`/`tail` makes `$?` report the pipe's exit, which once hid a failed build.
   - **Don't run `next build` while the Turbopack dev server is up** — both own `.next`. Sequence for Roe's review-before-push flow: `npx tsc --noEmit` as the quick check while dev runs → stop the preview server → `npm run build` → restart the preview server (+ backend + reseed) so localhost stays viewable. Keep localhost running after the gate; he reviews before saying "push" (see roe-review-on-localhost memory).
2. Commit targeted files with git email `starcrock7@gmail.com` (Vercel rejects otherwise); push `main`. If push is rejected, expect the **weekly-deal-pitches bot commit** (Monday cron commits `src/data/deal-pitches.json`) — `git fetch && git rebase origin/main`, don't force.
3. Watch the deploy: the Deployments **list** can show "Building" minutes after it finished — open the **deployment detail page** for true status (typical build ≈ 45 s). No dashboard needed though:
   - **Poll prod for a marker string unique to the new commit** (a class name, keyframe id, or literal you just added):
     `until curl -s https://gymgearcompare.com/ | grep -q "<marker>"; do sleep 15; done` (background it) — deterministic "new build is live" signal.

## Production smoke tests
Read the site key from the frontend's `.env.local` (`NEXT_PUBLIC_SITE_KEY`) — never hardcode it in commands that get committed anywhere.

```powershell
# gate sanity: expect 403 / 200
curl.exe -s -o NUL -w "%{http_code}" -H "Origin: https://gymgearcompare.com" https://gymgear-backend5.onrender.com/api/categories
curl.exe -s -o NUL -w "%{http_code}" -H "Origin: https://gymgearcompare.com" -H "X-Site-Key: <from .env.local>" https://gymgear-backend5.onrender.com/api/categories
```
- PS 5.1 mangles inline JSON in curl — write POST bodies to a scratch file, use `--data "@file"`.
- First Render hit after idle = 30–60 s cold start (free tier). Normal.
- Money path: the quiz's kit request is served by the frontend's **own Next route** `src/app/api/kit/route.ts` (deliberate port of the backend kit builder so a sleeping Render can't stall the conversion moment) — test it on the live site, and keep its selection logic **in lockstep with server.js's KIT BUILDER section** whenever either changes.

## Backend
Gate: `node --check server.js` → push → Render auto/manual deploy → `GET /health`. Env vars (`SITE_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `ALLOWED_ORIGINS`) live in the Render dashboard only.

## Scheduled automation living in the frontend repo
- `.github/workflows/weekly-deal-pitches.yml` — Mondays 06:00 UTC + manual dispatch: one batched Groq call → commits `src/data/deal-pitches.json` only on change (its commit triggers a Vercel deploy). Needs repo Actions secrets `GROQ_API_KEY` + `SITE_KEY`; the script deliberately keeps last week's pitches when the key is missing, and templated copy in `src/lib/deals.ts` is the permanent fallback. Hard rule: the LLM never sources a price or expiry — it only writes copy over computed numbers.

## Rules that have bitten before
- framer-motion: no blur transitions inside `AnimatePresence mode="wait"` (froze prod quiz).
- All browser→backend calls through `apiFetch()`; key attaches there.
- `legacy/` is read-only history; never edit or import from it.
- After a smoke test that started the local backend, kill the port-3001 listener when done (`Get-NetTCPConnection -LocalPort 3001` → Stop-Process) or the next preview/build fights it.
