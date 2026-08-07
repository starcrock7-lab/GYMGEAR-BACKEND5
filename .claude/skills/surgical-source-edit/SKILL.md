---
name: surgical-source-edit
description: Programmatically edit data that lives inside source code — hardcoded product rows, config arrays, seed data, fixture tables — without corrupting the file. Quote/bracket-aware argument scanning, exact character spans, back-to-front patching, and archive-instead-of-delete. Use when a script must update or remove records embedded in a .js/.ts/.py file, when positional-argument helpers risk silent arg-swaps, or before reaching for a regex over a whole source file.
---

# Surgical source edits

Data often lives in source: `p('id','Name','Brand',249,...)` rows, config arrays, seed tables. A whole-file regex is how those get silently corrupted — swapped positional args, a replacement landing in a description that happened to contain the same number, a trailing comma that turns the file into a syntax error.

## Why not just parse it properly?

Often you can't: the module has side effects on import (`app.listen()`), or the file is huge, or you need to preserve exact formatting and comments. Then scan for spans, don't rewrite structures.

## The scanner

Walk each call with a **quote- and bracket-aware splitter** that splits on top-level commas only. Data rows are full of commas inside strings, objects and arrays; naive `split(',')` destroys them.

```js
function splitArgs(src, open) {          // open = index of '('
  const args = []; let depth = 0, quote = null, start = open + 1;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' && depth === 0) { args.push({ start, end: i, text: src.slice(start, i) }); return { args, close: i }; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ',' && depth === 0) { args.push({ start, end: i, text: src.slice(start, i) }); start = i + 1; }
  }
  return null;                            // unterminated → treat as unparseable, skip
}
```

Return every record with the **character spans** of the fields you may edit. An edit then replaces only `[start, end)` — it cannot touch a neighbouring argument.

## Rules that keep it safe

- **Patch back-to-front.** Sort edits by descending `start` before applying, or earlier splices invalidate every later span.
- **Validate the whole file after writing** (`node --check`, `python -m py_compile`, `tsc`). A malformed write must fail loudly, not reach a commit.
- **Assert the blast radius.** `git diff --numstat` should show exactly the number of lines you intended. Three edits → three changed lines. Anything else means the scanner mismatched.
- **Verify by re-reading**, not by trusting the write: parse the file again and confirm each field now holds the new value.
- **Never trust argument position blindly.** Log the parsed arg count; if a helper takes 15 positional args and some rows have 14, your index for the last one is wrong for those rows.

## Deleting: archive, don't destroy

When removing records (dead links, discontinued items), keep them restorable:

- Cut the record's exact source text and append it verbatim to an archive file with the date and reason.
- Write the archive as **markdown, not `.js`** — bare `p(...),` calls are not valid standalone JavaScript and a `.js` archive fails syntax checks. Fenced code blocks restore by paste.
- Verify the archive: extract the fenced rows, wrap them in a stub array, and syntax-check that. An archive that can't be restored isn't an archive.
- Ids left behind in lookup sets/maps keyed by id (`FOOTPRINTS`, feature sets, flag lists) are **inert** — they simply stop matching. Leave them rather than churning several files across repos for no behaviour change, and say so.

## Deletion is a judgement, not a lookup

Before removing a record because its source is gone, distinguish:

- **Moved** → relink.
- **Discontinued** → delist; the record's reviews and verdict belong to a product nobody can buy.
- **Never matched** → the record describes something the source doesn't sell in that form. Relinking to "something similar" carries the old rating and verdict onto a different product. That's worse than leaving it broken.
