---
name: gymgear-ui
description: UI design workflow for gymgearcompare.com — locks the design direction (dark premium Whoop-style, brand tokens), produces clear visual briefs any model can execute, and proves every change with before/after screenshots at mobile + desktop via the local preview server or live site. Use when working on GymGear UI/styling/redesign, when the user says "make it look better", or when preparing a UI task brief for another model.
---

# GymGear UI — direction, briefs, proof

## Direction anchor (never drift)
- **Brand tokens:** orange `#e8542a` (accent ONLY — CTAs/highlights; orange everywhere = wrong), navy `#0d1b35`, Syne (display) + DM Sans (body). Source of truth `src/app/globals.css` — change tokens there, never scatter inline hex.
- **Site-wide DARK since 2026-07-07** (techy/futuristic, "gym gear in space"): the old light tokens (`--off`, `--ink*`, `--line`) were flipped dark in globals.css and `--card` (`bg-card`) is the raised-surface token. **`bg-white` is reserved for product-photo tiles and brand-initial tiles only** — a solid white card on a dark page is a regression. `bg-ink text-white` chips are dead (white-on-white after the flip) — use accent glow chips.
- **Body background is the LIGHT-era default** — every page must set its own dark bg (`bg-navy` wrapper); a page without one renders unreadable (bit us on /cart).
- **Glow language, not lift:** hover feedback = orange glow/edge-ignite (`shadow-[0_0_..rgba(232,84,42,..)]`, text-shadow sweeps), NOT translate-y "3D" lifts — except the how-it-works panels, which keep tilt + jump-and-grow pop. Springs and jank rules live in the `smooth-motion` skill (elastic pop 210/15, hover pop 520/17, no backdrop-blur on animated nodes).
- **Hero wallpaper** (`src/components/ui/dumbbell-wall.tsx`): inline SVG grid of glass dumbbells at 45°, whole-dumbbell `g:hover` ignition (instant-in / 90ms-hold / 360ms-cool), frame mask clearing the copy zone, cosmic radial + `.starfield` utility. It went through 5 rewrites — cursor-following spotlights and animated turbulence were rejected as laggy/weird; don't reintroduce them.
- **Shader halos** (`ui/pulsing-border.tsx`, @paper-design/shaders-react) mount ONLY while a money CTA is hovered (AnimatePresence spring pop) — never always-on (idle WebGL).
- **Badge language (locked 2026-07-09/10):** product-tile markers are **theme-lit glowing badges**, never flat overlay bars (those were ripped out). The family: award emblem = custom SVG dumbbell glyph centered in an on-theme pill; discount = zigzag corner tag anchored to the tile's corner; generic tags = accent-glow chips. A new tile marker joins this family or it's wrong.
- **Conveyor wallpaper motion:** hero dumbbell rows drift exactly one cell (78px/26s linear) and loop on an identical frame — alternating rows run opposite directions. Seamless-loop recipe in `smooth-motion`.
- **Planner map aesthetic** (/planner, /gym, /start): equipment pieces = `border-accent/70 bg-navy/85` with a soft accent glow + white label + accent icon; clearance halos = dashed `border-win/40`, flipping red on collision. Planner architecture/rules live in the `gymgear-planner` skill.
- **Reuse first:** `src/components/ui/*` primitives (spotlight-card, aurora-background, text-scramble, buttons…) before inventing new ones.
- **Idea backlog:** `design-improvements.md` at repo root — read before proposing direction; add ideas there, not in chat only.
- For palette/style/UX pattern lookups run `/ui-ux-pro-max` (e.g. `/ui-ux dark premium fitness e-commerce dashboard`).

## Screenshot evidence loop (every UI change)
0. Interactions (hover states, springs, flows) are verified programmatically, not by screenshot — recipes in the `preview-drive` skill (real `:hover` needs `preview_click`; synthetic events only reach React handlers). User sends a recording of the problem? → `video-debug` skill.

> ⚠️ **The preview-pane screenshot TIMES OUT on this site** (verified 2026-07-25) — the starfield/dumbbell-conveyor/shader loops never yield a stable frame, so it hangs 30s every time. Killing rAF + canvases from JS does NOT help; don't retry it. Use **headless Chrome with `--force-prefers-reduced-motion=reduce`** instead (full recipe + flags in the `web-capture` skill), which renders the settled state instantly. Plain headless without that flag captures framer-motion reveals mid-animation → blank sections. For clean mobile shots use width ≤560px (below the `sm` breakpoint) so the page reflows to a centered single column, and warm the route with `curl` first or you'll capture the "Compiling…" toast.
1. `preview_start "gymgear-frontend"` — config in `.claude/launch.json`; from another repo's session use `"runtimeArgs": ["run","start","--prefix","C:\\Users\\nirka\\Documents\\gymgear-frontend-final"]`. Production build (`next start`) shows real perf; dev mode hides jank differences.
2. **BEFORE:** `preview_screenshot` at desktop → `preview_resize` mobile (375×812) → screenshot again.
3. Edit — smallest diff. Hard rule: **no blur/filter transitions inside `AnimatePresence mode="wait"`** (froze prod once).
4. **AFTER:** same two screenshots + `preview_console_logs` for errors + `preview_inspect` for exact colors/spacing (screenshots lie about colors).
5. Live-site reference shots: claude-in-chrome → gymgearcompare.com → screenshot with `save_to_disk`.
6. Keep the good ones: `design/screens/YYYY-MM-DD-<name>-{before,after}.png` in the repo — tracked visual history.

## UI brief template (hand this to any model)
```
GOAL: <one sentence, user-visible outcome>
PAGE/COMPONENT: <route + exact file path from README route map>
REFERENCE: <screenshot path or URL + what specifically to copy (spacing? type scale? motion?)>
KEEP: brand tokens (globals.css), existing layout unless stated, components from src/components/ui/*
CONSTRAINTS: no blur + AnimatePresence mode="wait"; mobile-first at 375px; Next 16 idioms (check node_modules/next/dist/docs)
DONE = npm run build green + before/after screenshots at 375 AND 1280 attached
```

## Review checklist before "done"
- 375px: no horizontal scroll, tap targets ≥ 44px, nav usable, quiz flow completable
- Contrast ≥ 4.5:1 for text on navy/dark
- Orange only where the eye should go
- Motion: entrances ≤ ~300 ms, no scroll jank (lenis is active on some pages)
- `npm run build` green — a pretty page that doesn't build is not done
