---
name: measure-first
description: Turn a vague quality complaint ("the results are bad", "make it actually useful", "some of these look wrong") into a number, by enumerating the whole input space and counting failures — then wire that count in as a gate. Use when asked to improve the quality of generated output (recommendations, kits, plans, matches, search results), when a bug is "sometimes", or before changing any algorithm whose output a human currently eyeballs.
---

# Measure first

When someone says the output is bad, the instinct is to look at one bad example and fix it. That fixes one example. The move that actually works: **enumerate every input the system can receive, score every output, and print the failure count.** Then the complaint has a number, the fix has proof, and the number becomes a gate so it can't regress.

Worked example: a kit builder that "gives useless kits". Enumerating all 8,640 quiz answer combinations showed 25% of kits left a muscle group untrainable — including the most expensive ones. Three distinct bugs fell out of that one number, and none of them were visible in the example first complained about.

## The loop

1. **Name the failure predicate before touching code.** Not "looks wrong" — a function `isBad(output, input) -> reason[]`. If you can't write it, you don't understand the complaint yet; go and look at 5 outputs first. Two useful classes: *structural* (internally inconsistent) and *semantic* (consistent, but doesn't do the job). The second is usually the one being complained about, and usually the one nothing checks.
2. **Enumerate the input space.** Cross-product every choice a user can make. Hundreds or thousands of cases is normal and cheap. If the space is unbounded, sample it — but cover every *dimension*, and add dimensions later rather than depth.
3. **Print the baseline count and the worst offenders**, sorted by something meaningful (cost, severity, price). The worst offenders are where the real bug is; the median case usually looks fine, which is why eyeballing missed it.
4. **Fix, re-run, watch the number.** Each fix should move it. A fix that doesn't move it wasn't the bug.
5. **Wire it in as a gate** — an npm script / make target that exits non-zero, documented in CLAUDE.md. An audit that isn't a gate rots within a month.

## Make the logic callable without its transport

The usual blocker is that the logic only exists inside an HTTP handler / CLI command / UI event, so the only way to test it is to run a server and squint at JSON.

**Extract the pure part.** Move selection/scoring/planning into a module the handler calls. The handler keeps I/O; the module keeps decisions. This is worth doing on its own merits and it's what makes the audit possible at all.

For a Next.js/TypeScript app, plain `node` (24+) strips types itself and only needs help with path aliases:

```js
// scripts/ts-alias-hooks.mjs — resolve "@/..." and extensionless imports
export function resolve(specifier, context, next) { /* map to a real .ts path */ }
// scripts/register-ts.mjs
import { register } from "node:module";
register("./ts-alias-hooks.mjs", import.meta.url);
```
```bash
node --env-file-if-exists=.env.local --import ./scripts/register-ts.mjs scripts/audit.mjs
```

A working pair lives in `gymgear-frontend-final/scripts/`. This turns a 30-second HTTP round trip per case into thousands of cases in seconds — which is the difference between an audit you run once and one you run after every edit.

## Rules that keep the number honest

- **Widen the audit when you suspect a dimension, not when you want a green run.** New failures from a widened audit are almost always real pre-existing bugs the old audit couldn't see. Fix them; never narrow the dimensions to get back to green.
- **A gate that only catches structural problems will pass garbage.** Internally-consistent-but-useless is the most common real defect.
- **Report the count even when it's zero** — "0 of 8,640" is a claim someone can check; silence isn't.
- **Quote the baseline in the commit message.** "110 of 432 before, 0 of 1728 now" is the review; "improved kit quality" is not.

## Look for the gate before you build one

Check `package.json` scripts and `scripts/` first. If a gate already exists, **run it** — a repo that has been measured before usually encodes requirements yours won't guess.

When a hand-rolled measurement disagrees with the project's own gate, **suspect yours first.** A binary model ("does this kit cover all six movement patterns?") reported 61 failures and 86% coverage. The repo's own audit reported **0 of 8,640**. The repo was right on both counts:

- its requirement was **goal-aware** — a fat-loss kit is not failing because it can't train heavy pull-ups, and demanding every pattern of every goal invents failures
- it scored **0/1/2** (not at all / limited / properly trainable) instead of a boolean, and read per-product specs rather than assuming a category implies a capability
- it enumerated **more dimensions** (8,640 vs 432) — a hand-rolled sweep usually forgets the ones that don't fit in a nested loop you can hold in your head

Cost of skipping this: a false alarm reported as a real defect, and work started on a bug that did not exist. Run the existing gate, and only write your own when there genuinely isn't one — then make it the project's gate.
