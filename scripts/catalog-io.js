/* Read and surgically rewrite the p(...) catalog rows in server.js.
 *
 * server.js calls app.listen() unconditionally, so it cannot be require()d to
 * read the catalog — and a regex over the whole file is exactly how the p()
 * helper's 15 positional args get silently swapped. Instead this walks each
 * p( ... ) call with a quote/bracket-aware scanner, so every value comes with
 * its precise character span and edits replace only that span.
 */
import fs from 'node:fs';

const ARG = { id: 0, name: 1, brand: 2, price: 3, retailer: 4, url: 5, opts: 14 };

/* Split a p(...) argument list on TOP-LEVEL commas only: specs/aspects are
 * objects and arrays full of commas, and blurbs contain them in prose. */
function splitArgs(src, open) {
  const args = [];
  let depth = 0, quote = null, start = open + 1;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' && depth === 0) {
      args.push({ start, end: i, text: src.slice(start, i) });
      return { args, close: i };
    }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ',' && depth === 0) {
      args.push({ start, end: i, text: src.slice(start, i) });
      start = i + 1;
    }
  }
  return null; // unterminated — caller treats as unparseable
}

const unquote = (s) => {
  const t = s.trim();
  return /^['"`]/.test(t) ? t.slice(1, -1) : t;
};

/* Every product row, with the spans needed to rewrite price / opts in place. */
function readCatalog(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rows = [];
  const re = /\bp\(/g;
  let m;
  while ((m = re.exec(src))) {
    const parsed = splitArgs(src, m.index + 1);
    if (!parsed || parsed.args.length < 14) continue;
    const a = parsed.args;
    const id = unquote(a[ARG.id].text);
    const price = Number(a[ARG.price].text.trim());
    if (!id || !Number.isFinite(price)) continue;
    const optsArg = a[ARG.opts] || null;
    const optsText = optsArg ? optsArg.text.trim() : '';
    const sale = /salePrice\s*:\s*([\d.]+)/.exec(optsText);
    const ends = /saleEndsAt\s*:\s*'([^']*)'/.exec(optsText);
    rows.push({
      id,
      name: unquote(a[ARG.name].text),
      brand: unquote(a[ARG.brand].text),
      retailer: unquote(a[ARG.retailer].text),
      url: unquote(a[ARG.url].text),
      price,
      salePrice: sale ? Number(sale[1]) : null,
      saleEndsAt: ends ? ends[1] : null,
      span: { call: { start: m.index, end: parsed.close } },
      priceSpan: { start: a[ARG.price].start, end: a[ARG.price].end },
      urlSpan: { start: a[ARG.url].start, end: a[ARG.url].end },
      optsSpan: optsArg ? { start: optsArg.start, end: optsArg.end } : null,
      argCount: a.length,
    });
    re.lastIndex = parsed.close;
  }
  return { src, rows };
}

/* Apply edits back-to-front so earlier spans stay valid.
 * edit = { id, price?, salePrice? (null clears), saleEndsAt? (null clears) } */
function applyEdits(file, edits) {
  let { src, rows } = readCatalog(file);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const patches = [];
  for (const e of edits) {
    const row = byId.get(e.id);
    if (!row) throw new Error(`applyEdits: unknown product id ${e.id}`);

    if (e.price !== undefined && e.price !== row.price) {
      patches.push({ start: row.priceSpan.start, end: row.priceSpan.end, text: String(e.price) });
    }
    if (e.url !== undefined && e.url !== row.url) {
      patches.push({ start: row.urlSpan.start, end: row.urlSpan.end, text: `'${e.url}'` });
    }

    const wantSale = e.salePrice !== undefined ? e.salePrice : row.salePrice;
    const wantEnds = e.saleEndsAt !== undefined ? e.saleEndsAt : row.saleEndsAt;
    if (wantSale === row.salePrice && wantEnds === row.saleEndsAt) continue;

    let opts = row.optsSpan ? src.slice(row.optsSpan.start, row.optsSpan.end).trim() : '';
    let body = opts.startsWith('{') ? opts.slice(1, -1).trim() : '';
    const setKey = (key, val) => {
      const has = new RegExp(`(^|,)\\s*${key}\\s*:\\s*[^,}]+`);
      if (val === null || val === undefined) {
        body = body.replace(has, '').replace(/^\s*,|,\s*$/g, '').trim();
      } else if (has.test(body)) {
        body = body.replace(has, (s, lead) => `${lead}${key}:${val}`);
      } else {
        body = body ? `${body},${key}:${val}` : `${key}:${val}`;
      }
    };
    setKey('salePrice', wantSale);
    setKey('saleEndsAt', wantEnds === null ? null : `'${wantEnds}'`);
    const rebuilt = body ? `{${body}}` : '';

    if (row.optsSpan) {
      patches.push({ start: row.optsSpan.start, end: row.optsSpan.end, text: rebuilt ? rebuilt : '{}' });
    } else if (rebuilt) {
      // No opts arg at all — append one before the closing paren.
      patches.push({ start: row.span.call.end, end: row.span.call.end, text: `,${rebuilt}` });
    }
  }
  patches.sort((a, b) => b.start - a.start);
  for (const pt of patches) src = src.slice(0, pt.start) + pt.text + src.slice(pt.end);
  fs.writeFileSync(file, src);
  return patches.length;
}

export { readCatalog, applyEdits };
