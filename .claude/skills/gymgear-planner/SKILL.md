---
name: gymgear-planner
description: Architecture and rules for the GymGear commercial gym planner ("For Gyms") and floor-plan visualizer — the backend-only plan logic (opposite of the kit lockstep), footprint data that placeable products need, regulation clearances, and the sessionStorage handoff. Use when editing /gym, /planner, /start, /api/gym-plan, GymPlanner/FloorPlanner components, footprints, or anything about the facility planner or floor visualizer.
---

# GymGear planner — For Gyms + floor visualizer

## Map (frontend: gymgear-frontend-final)
- **Site nav:** `/gym`, `/planner`, `/start` now wrap their tool component with `<SiteNav/>…<SiteFooter/>` (added 2026-07-14 — they were nav-less "trap pages" before). `/quiz` stays nav-free by design (funnel). If you add another standalone tool route, include SiteNav or the user is stranded.
- `/start` (`src/app/start/page.tsx`) — path chooser: home quiz vs For Gyms, plus renovation questions.
- `/gym` (`src/components/gym/GymPlanner.tsx`) — commercial questionnaire → equipment list + written build plan **+ embedded floor dashboard** (`<FloorPlanner embedded itemsProp defaultRoomW/D>`, room auto-sized to plan area, `#floor-dashboard` anchor; Start over is two-click confirmed).
- `/planner` (`src/components/planner/FloorPlanner.tsx`) — drag-to-place floor visualizer; domain data in `src/lib/floor-plan.ts`; `CropTool.tsx` + `equipment-icon.tsx` support it.
- `src/lib/auto-layout.ts` — **auto-layout engine** (2026-07-14): `detectWalls()` canvas Otsu + dilate + flood-fill-from-centre (photos/dense drawings fall back to borders-only `detected:false`), then **`mainRoom()` room segmentation** — erode open space ~27" so door throats (≤ ~4.5 ft) sever, label core blobs, keep the largest (training floor), regrow by T+2 without crossing other cores — so gear never lands in bathrooms/offices that flood fill would leak into through door gaps (`grid.rooms` = cores found, surfaced in the arrange note); `autoPlace()` formation packer — cardio row on longest wall + 6 ft fall-zone reserves, racks backed to the opposite wall, dumbbells + facing benches, machines on walls then interior rows with 36" aisles; keeps ≥17" air between pieces so auto results never render red (display halos are 8"+8" worst case). Auto-runs after crop apply; manual "Auto-arrange" button; paste (Ctrl+V) supported. Planner board shows a 4-chip stat strip (placed/room/footprint/floor-used).
- **3D view** (rebuilt 2026-07-15/16): `src/lib/equipment-3d.ts` — 21 detailed procedural builders (deliberately NO downloaded models: licensing + payload + nothing matches the catalog) sharing a parts vocabulary (`tube()` between points, `plate()`, `loadedBar()`, `weightStack()`, `pulley()`, `fanWheel()`, chrome/rubber mats); types resolve via the icons' `equipmentTypeOf`, sizes from footprints + `TYPE_HEIGHT`/`HEIGHT_OVERRIDES`. `Planner3D.tsx` (three.js, `next/dynamic` ssr:false): light "showroom" scene (bright room floor = stage, NO grid — deliberate), see-through walls from the detected grid, orbit controls, hover tooltip. New product ⇒ footprint + icon TYPE_OF row + (optional) height override.
- **Click-to-inspect (2D+3D, 2026-07-15/16):** clicking a piece selects it (`selectedUid` in FloorPlanner, synced both ways). 2D: family-hue hover glow, **brand-orange** selected halo; click-vs-drag split at 6 px. 3D cinematic: 1.3 s eased dolly (cancelled by manual orbit), room lerps to a dark "mood" (bg/fog/floor/lights + non-selected pieces dimmed via stashed `material.userData.base`), a warm `SpotLight` reveals the hero (**decay 0 — scene units are inches, physical decay 2 would kill it**), selected piece gets a 0.09 orange emissive tint (full emissive floods the model flat — don't raise it). `EquipCard` (home-FlowCard language, buy link via cached `/api/catalog/products/{cat}`) is pinned top-right in 2D but **anchored in-scene in 3D**: Planner3D takes a `cardSlot` prop and positions it beside the piece every frame by projecting its bbox. Selection changes must NOT rebuild the scene — they go through the `sceneApi` ref + a separate `[selectedUid]` effect.
- **Colours:** `FAMILY_COLORS` in `equipment-icon.tsx` is the single source for 2D tiles, palette icons AND 3D materials — never fork it. Selected = brand orange `#f0531e` everywhere.
- **Off-limits zones (2026-07-15):** `Zone` rects (inches) in floor-plan.ts, drawn via the "Mark off-limits" toggle, persisted with the layout, rasterised into the grid by `applyZones()` so autoPlace + 3D walls avoid them; pieces overlapping a zone reuse the red collision flag.
- `mainRoom()` is a **nearest-core watershed** (2026-07-15): erode ~27" to sever door throats → label cores → every open cell joins its NEAREST core — the old capped regrow truncated L-shapes/wrap-around corridors; don't reintroduce a fixed band.
- Interaction gotchas (drag, hover toolbars, file drop, crop math, StrictMode save-clobber, click-vs-drag, synthetic-pointer testing) → **`drag-map-ui` skill**, don't re-derive.

## The split decision (do NOT copy the kit-builder pattern here)
Gym-plan logic lives **only** in backend `server.js` (`/api/gym-plan`, ~line 1643 + GYM PLANNER section ~1437). The frontend `src/app/api/gym-plan/route.ts` is a **thin proxy** — 90s `AbortSignal.timeout` for Render free-tier cold start, friendly 503 ("planner is waking up"). Rationale: low-volume high-intent B2B flow tolerates the wait, and the written plan needs the backend's server-side Groq key. The home kit is the opposite (ported locally because the quiz funnel can't wait) — see the kit-builder-lockstep memory. Never duplicate gym-plan into the frontend; never make the kit wait on the backend.

## Catalog hooks (backend server.js)
- `pro: true` (p() opts) marks full-commercial machines that are gym-planner stock — home kit never picks them.
- `flooring` category exists for gyms; sizing uses `coverageSqFt`.
- Quiz depth: experience level + ceiling height shape BOTH builders (home + gym).
- Renovation mode: targets, scope, and renovated-area sizing are backend logic.

## Footprint rule (new lockstep surface)
Every **placeable** product (categories: racks, machines, cardio, benches, dumbbells) should get a `FOOTPRINTS[id] = {w, d}` entry (published W×D in **inches**) in `src/lib/floor-plan.ts`. Missing entries silently fall back to `CATEGORY_DEFAULT` — the map draws a wrong-size box with no error. Adding placeable products to the backend catalog ⇒ add footprints in the frontend.

## Halo philosophy (deliberate, don't "fix")
On-map safety halos (`CLEARANCE_IN`) are intentionally SMALL nudges so pieces can sit close while planning. The real regulation numbers (36" walkways, 6 ft treadmill fall zones, 3–4 ft rack fronts, 25–35 sq ft/person) live in the `LAYOUT_ADVICE` side panel. Don't inflate halos to regulation size — it makes the map unusable.

## Handoff keys (sessionStorage)
`gymgear.floor.v1` (equipment list), `gymgear.floor.layout.v1` (placed layout **+ roomW/roomD** — saved dims beat plan-derived defaults), `gymgear.floor.origin.v1` (back-button target — `/gym` or `/quiz`). The gym plan syncs `saveFloorItems`+`saveFloorOrigin` via effect on every plan/qty change (kit result still saves on link click). Floor images never leave the browser (object URLs only) — keep it that way; it's a privacy promise in the UI copy. FloorPlanner's layout-save effect is gated by a `hydrated` ref — without it the mount's empty state clobbers the saved layout (StrictMode makes that deterministic).

## Verify
Frontend gate `npm run build` (backend must be listening on :3001 or prerender dies with `fetch failed … ECONNREFUSED`); backend gate `node --check server.js`. Exercise: /start → For Gyms → answer → plan renders → "Visualize floor plan" → pieces placeable, delete/rotate hover tools clickable, halos toggle.

**Fast planner seeding (skip the quiz funnel):** on localhost, set sessionStorage then open `/planner`:
```js
sessionStorage.setItem("gymgear.floor.layout.v1", JSON.stringify({placed:[
  {uid:"t01",id:"rep-pr5000",name:"Power Rack",category:"racks",w:58,d:53,x:15,y:15,rot:false},
  // …one per type; ids from equipment-icon TYPE_OF; w/d/x/y in inches
],roomW:42,roomD:34,savedAt:Date.now()}));
sessionStorage.setItem("gymgear.floor.v1", JSON.stringify({items:[/* FloorItem[] for the palette */]}));
```
Then drive: 2D tile click → card; "3D view" → cinematic. Pane closed/screenshots timing out → **`canvas-capture` skill**.
