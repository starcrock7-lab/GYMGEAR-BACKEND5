---
name: baseline-diff
description: Before blaming your change for a defect you just measured, measure the same thing with the change removed. Separates real regressions from pre-existing bugs and from harness artifacts, and stops you "fixing" something that was never broken. Use when a metric looks wrong after an edit, when a verification tool reports something alarming, when about to claim a change caused a problem, or when a bug is "sometimes".
---

# Baseline diff

You change something, measure, and see a bad number. The instinct is to fix it. Half the time it was already there, and you're about to spend an hour "fixing" someone else's decision — or worse, chase an artifact of your own measuring rig.

**Rule: attribute before you fix.** `git stash` the change, re-measure the identical thing, restore. The delta is what you actually caused.

```bash
git stash push -- path/to/changed-file
# re-run the exact same measurement
git stash pop
```

For a dev server, allow for recompile before re-measuring, and warm the route so you don't measure a cold-start.

## What this catches

**Pre-existing defects.** A per-case tier-ordering check reported 57 violations after a change. Baseline: **34 already violated**. The change caused 23, not 57 — and the honest report is "pre-existing, made somewhat worse", not "I broke it". It also invalidated an earlier claim that the ordering "held", which had been based on a weaker aggregate check.

**Harness artifacts masquerading as bugs.** A layout measurement showed an element pushed 56px right and clipped on mobile — apparently a serious responsive bug. Baseline with the change stashed: **identical 56px offset**. Not the change. The real cause was the measuring environment: the browser pane was hidden, so `requestAnimationFrame` was suspended, so an entrance animation never ran and the element sat frozen at its initial `translateX(56px)`, `opacity: 0`. Nothing was broken at all.

## Corollary: suspect the rig before the code

A hidden/headless/background browser suspends rAF and stops compositing. That single cause presents as *several* different "bugs":

- screenshots time out or come back blank
- CSS/JS animations never progress; elements stay stuck at their initial transform
- elements report `opacity: 0` and offset positions that look like layout bugs
- `getAnimations()` is empty, WebGL canvases never draw, draw-call counters read 0
- reading pixels outside the render loop returns black (`preserveDrawingBuffer: false`)

Before diagnosing any of those as application defects, check whether frames are advancing at all — count rAF callbacks over a second. Zero frames means you're measuring a parked page.

Timers throttle too: background tabs clamp `setTimeout` to ~1/sec, so a "wait 20 frames" gate that normally takes 300ms silently takes 20 seconds.

## Also worth ruling out before blaming code

- **Stale caches.** Two engines that "diverged" were identical; one was serving an hourly ISR cache from before the change. Restart, re-measure, and the mismatch vanishes.
- **Rate limits.** An audit that crashed mid-run was hitting a 60-req/min limiter after earlier suites had spent the window — nothing to do with the data under test. Wait out the window and re-run before investigating.
- **Your own measuring code.** A tolerance that flags one legitimate case forever (a model whose loaded barbell is *designed* to overhang its footprint) is noise you'll re-investigate every run. Encode the exception once.

## Reporting

State attribution explicitly: "34 pre-existing, my change added 7". If an earlier claim of yours turns out to have rested on a weaker check, correct it plainly once and move on — that costs a sentence and buys trust in every other number you report.
