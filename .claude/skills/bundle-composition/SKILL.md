---
name: bundle-composition
description: Build bundles, baskets, kits, loadouts or plans under a budget so the result is actually usable, not merely affordable. Slot reserves, essential companions, all-or-nothing pairs, planning trades before applying them, and stopping a later trim from undoing the composition. Use when a greedy selector produces one-item or unusable results, when a recommended set is missing something it obviously needs, or when writing any "pick N things within a budget" algorithm.
---

# Bundle composition

A greedy "pick the best item per category until the budget runs out" selector produces results that are individually optimal and collectively useless. The classic output: **one expensive item and nothing else** — technically in budget, worthless to the user.

These are the rules that make the output usable. They generalise to any budgeted basket: gym kits, PC builds, travel packing, meal plans, loadouts.

## 1. Reserve for the slots you haven't filled

Without a reserve, the first pick can eat the entire budget. A "cheapest decent" strategy gated to quality ≥ 7 picked a $295 item against a $300 cap, leaving $5 and a one-item result.

```
budget_for_this_pick = cap − (remaining_slots − 1) × MIN_PER_SLOT
```

Always keep a fallback: if nothing clears the reserve, retry at the plain cap so a category is never silently skipped by the reserve itself.

## 2. Essentials must compete for budget, not live off leftovers

If a category becomes required once something else is chosen (free weights → a bench; a printer → ink), **hold its cost back from the moment the trigger enters the basket** — not only while picking that category, or the accessories chosen afterwards will quietly spend it.

Same for **all-or-nothing pairs** (barbell ↔ plates, rack → bar + plates, console → controller): reserve the cheapest partner's price *before* buying the anchor. Otherwise you buy the anchor, discover you can't afford the partner, and throw the anchor away — having wasted the budget that could have bought a usable pair.

## 3. Orphans: buy the partner or drop the item

After composing, sweep for items whose required partner is missing. Buy the partner if it fits; otherwise **drop the orphan** and free its budget. A rack with no barbell, or plates with no bar to load them on, is money spent on something the user physically cannot use. Bound the sweep (a few passes) — adding one partner can require another.

Symmetrically, drop an item that only existed to support something no longer present (a bench with no weight of any kind beside it).

## 4. Plan trades before applying them

The most damaging bug in this family: a pass that sheds items to afford an essential, **as it goes**, and then declines the essential anyway. It drops the very item that created the requirement, then correctly observes nothing needs the essential any more — leaving a basket smaller and worse than before, having removed things for nothing.

Simulate the whole trade first. Apply the drops **only if** the essential actually lands. And never cut the last item that justifies the essential.

When shedding, drop the **priciest expendable first** so the essential costs the fewest items. A fixed drop-order once traded away two cheap useful items while keeping a pricier irrelevant one.

## 5. Run the composition pass on the FINAL basket

Essential/companion logic must run **after** filler and top-up, or it judges a composition that later passes go on to change. It can afford to run last precisely because step 2 reserved its money.

## 6. Don't let a trim undo the composition

If a later step trims to budget, it must not dismantle what composition built. Two rules:

- trim against the **same budget the composer was allowed to spend**, not a stricter one — otherwise it drops the anchor moments after the composer placed it
- never trim below the minimum viable size, and never drop protected essentials

Then re-run the orphan sweep, because trimming can *create* orphans (drop the bar, the plates are now useless).

## 7. Allow a bounded overrun

Being modestly over budget beats being unusable. Cap it (e.g. 1.35×) and only spend it on essentials — otherwise every result drifts over. Say plainly in the UI when a result exceeds the stated budget and why.

## Verify by enumeration

Every rule above was found by enumerating the whole input space and counting failures, not by inspecting examples — see `measure-first`. Assert the invariants: minimum size, no missing companion, no orphaned pair, no result exceeding its cap ratio. Each fix in this list *introduced* a new absurdity that only the sweep caught.
