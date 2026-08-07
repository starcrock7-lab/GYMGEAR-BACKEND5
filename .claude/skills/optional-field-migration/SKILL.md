---
name: optional-field-migration
description: Make a required field nullable without shipping crashes or silently biasing every score that reads it. Type it null first so the compiler finds every consumer, then make absence NEUTRAL rather than zero. Use when a schema forces fabricated data, when adding records blocked by a field you cannot source, when making a column optional, or when a ranking/score reads a field that may now be missing.
---

# Optional field migration

Two failures hide in "just make it optional": the **crash** (a consumer calls `.toLocaleString()` on null) and the far worse **silent bias** (every record missing the field sinks to the bottom of every ranking, forever).

## Symptom that you need this

A required field can't be sourced for most new records, so the only ways to add them are inventing values or not adding them. That's the schema forcing a lie — fix the schema, don't fill the field.

Keep the distinction sharp: **your own editorial/derived fields stay required** (you can always produce them). Only fields that are *claims about someone else's data* become optional.

## Step 1 — type it null first, then let the compiler find the consumers

```ts
rating: number | null;
reviewCount: number | null;
```

Do this **before** touching any UI. In a typed codebase the compiler enumerates every site that would crash or render a fake zero — in one migration it found 8, including a `reviewCount.toLocaleString()` that would have been a production 500. Grep would have missed several.

Untyped codebase? Add the type anyway, or write a one-off scan for every read of the field. Do not go site-by-site from memory.

## Step 2 — absence must be NEUTRAL in scoring

This is the part that quietly breaks ranking. If a score is a weighted blend of facets and one facet is now missing, there are three options and **two of them are wrong**:

| Approach | Effect | Verdict |
|---|---|---|
| Score the missing facet **0** | record sinks below every peer that has the field — permanently excluded from any "best match" surface | ✗ punishes the record for someone else's silence |
| **Redistribute** its weight to the remaining facets | record is judged only on its strengths and can *outrank* better records | ✗ rewards missing data |
| Substitute the **group median** for that facet | absence is neither strength nor flaw | ✓ |

Median substitution (shrinkage to the mean) keeps weights summing to 1 and leaves the record ranked on what is actually known.

**Verify neutrality, don't assume it.** Take one record that *has* the field, score it, then hide the field and score it again. The delta should be small and the rank stable. In one migration: 88 with the real value, 90 with it hidden — 2 points, same rank. The redistribute approach had produced 91 vs 84, i.e. missing data winning.

Implementation note: compute facets in a first pass, derive medians, then score in a second pass — you can't know the median until every record is measured.

## Step 3 — render absence honestly

- Show nothing, or an explicit "Not published". Never a zero, an empty star row, or a 0-width bar — those read as *"rated badly"*, which is a different false claim.
- Keep any always-present score visible so records don't look empty.
- Downstream consumers (sorts, comparators) need a fallback on the same scale: mapping a 0-10 field onto a 0-5 one via `x/2` keeps an unrated record sorting on merit instead of `NaN`-ing the comparator.

## Step 4 — gates

Typecheck at zero, build green, and re-run whatever measures output quality end-to-end (see `measure-first`). A migration that passes typecheck can still have inverted your rankings — only the behavioural audit catches that.
