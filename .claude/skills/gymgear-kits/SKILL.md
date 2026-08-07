---
name: gymgear-kits
description: The GymGear kit builder and its muscle-coverage model — how kits are selected, the two-copy lockstep, the movement-pattern rules that decide whether a kit is actually trainable, and the two audit gates that must pass. Use when changing kit selection, the coverage model, quiz answers that feed the builder, tier behaviour (Best Value/Match/Quality), or when a kit "looks wrong" or contains the wrong products.
---

# GymGear kits — selection + coverage

Two copies of one algorithm, in lockstep:

| Where | File | Serves |
|---|---|---|
| **Frontend (prod path)** | `src/lib/kit-builder.ts` + `src/lib/coverage.ts` | The quiz. `/api/kit` is a thin HTTP shell around `selectKits()` |
| Backend | `server.js` — `COVERAGE MODEL` + `KIT BUILDER` sections | `POST /api/kit`, and adds a Groq copy pass |

The quiz hits the **frontend** route (Render's free tier sleeps; a cold start at the conversion moment is unacceptable). The backend copy still has to match — **every algorithm change goes in both**.

## The two gates — run both, always

```bash
npm run audit:kits
```
Builds **every kit the quiz can produce** (8,640: goal × budget × experience × pieces × space × owned × 3 tiers) directly against `selectKits`, no server needed. Fails on structural problems (orphan bar, no bench, re-sold owned gear, over cap, <3 pieces) **and** coverage failures.

```bash
npm run check:lockstep -- http://localhost:3002
```
Proves the frontend builder and `server.js` still produce identical kits. Needs a backend running with your changes — start one via `.claude/launch.json` (`gymgear-backend-alt`, auto-port) rather than reusing a stale process. The script paces itself under the backend's **60 req/min** limit; unpaced runs produce fake "mismatches" that are really 429s.

## The coverage model — what makes a kit a gym

A kit used to be judged structurally: does the bar have plates, do the free weights have a bench. That passed an **$8,548 "build strength" kit anchored by a commercial linear leg press** — no rack, no pull-up bar, no way to train your back.

**Trainability is a property of the combination, not of any product.** A barbell trains nothing without plates. A bench trains nothing on its own but turns floor pressing into real pressing. A rack turns a barbell into a squat you can bail out of.

Eight movements: `push-h push-v pull-h pull-v squat hinge core conditioning`. Levels **2 = trainable, 1 = limited (bands, floor press), 0 = not at all**. `GOAL_NEEDS` says what each goal requires; the **coverage repair pass** buys the *cheapest* piece that closes each gap (cheapest, not best — a $54 kettlebell restoring the hinge must not turn Best Value into Best Quality).

### Rules that were learned the hard way

1. **Same category ≠ same function.** `machines` spans a functional trainer and a single-station leg press. Capability is read from what the listing itself states (`specs.Type` / `specs.Movement`), never assumed from the category.
2. **Only a real all-in-one replaces a rack** (`replacesRack()` — needs pull-v *and* push-h). Blocking racks per-category is what let a leg press gut a kit.
3. **The deal swap must preserve function AND eligibility.** It once traded a compact all-in-one for a discounted commercial leg press: coverage collapsed, and in a small room the room filter then dropped it downstream, leaving a two-item kit on a $2,000 budget. Any swap must satisfy `eligible()` and `keepsCoverage()`.
4. **`eligible()` vs `allowed()`** — put new gates in the right one. `eligible()` = answer-derived and true for any slot (fits the room, clears the ceiling, already owned, not a specialty bar). `allowed()` = `eligible()` + slot-derived (category not already taken, no rack/all-in-one conflict). The swap can only use `eligible()`, because its slot is by definition taken.
5. **Owned gear counts toward coverage.** The kit doesn't re-sell you your rack, so judging the kit alone concluded you couldn't do pull-ups and bolted a band on to "fix" it.
6. **Specialty bars can't anchor a kit.** An EZ curl bar sits in `barbells` but won't rack, bench or squat (`SPECIALTY_BARS`).
7. **The coverage claim is measured, never written.** Both copies append `coverageSummary()` deterministically — including on the Groq copy path, so a model can neither hallucinate nor drop it.

## Changing anything here

1. **Measure first.** Run `npm run audit:kits` and record the number. "It looks better" is not a result — the whole point of the audit is that kit quality is a number.
2. Change `src/lib/coverage.ts` and/or `src/lib/kit-builder.ts`.
3. Port to `server.js` (same constants, same order of passes).
4. `npx tsc --noEmit` → `npm run audit:kits` → `npm run check:lockstep` → `npm run build`.
5. If you widened the audit's dimensions and new failures appear, they are almost always **real pre-existing bugs the old audit couldn't see** — fix them, don't narrow the audit.

## Adding a machine to the catalog

`machineTrains()` reads `specs.Type` and `specs.Movement`. A machine added with neither (or with `—`) **trains nothing** in the model, so the builder will treat it as dead weight and buy other gear around it. Set `Type` to one of: `All-In-One`, `Functional Trainer`, `Cable Tower`, `Multi-Station`, `Home Gym`, `Smart Gym`, or set `Movement` to `Leg Press` / `Row` / `Posterior Chain`. See the `gymgear-catalog` skill for the rest of the wiring.

## Debugging a specific bad kit

Don't reason about it through HTTP. Import the builder directly — `scripts/register-ts.mjs` lets plain `node` load the app's TypeScript:

```bash
node --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs yourscript.mjs
```

Call `buildKit()` for the raw picks (before hydration) and compare with `selectKits()` output. A product present in the raw picks but absent from the final kit means `hydrateKits` filtered it — usually the room/ceiling gate.
