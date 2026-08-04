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

/* Delist products the retailer no longer sells. A Buy button pointing at a
 * discontinued item is worse than no listing, and relinking it to "something
 * similar" would misrepresent what the review and rating belong to.
 *
 * Only the p(...) row goes. Ids left behind in lookup sets (LOW_CEIL_RACKS,
 * PRO_IDS, FOOTPRINTS…) are keyed by product id, so they simply never match —
 * inert, and still correct if the product is ever relisted. */
function removeProducts(file, ids) {
  const { src, rows } = readCatalog(file);
  const cuts = [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`removeProducts: unknown product id ${id}`);
    let start = row.span.call.start;
    let end = row.span.call.end + 1; // past ')'
    if (src[end] === ',') end++;
    while (start > 0 && (src[start - 1] === ' ' || src[start - 1] === '\t')) start--;
    if (src[end] === '\r') end++;
    if (src[end] === '\n') end++;
    cuts.push({ start, end });
  }
  cuts.sort((a, b) => b.start - a.start);
  let out = src;
  for (const c of cuts) out = out.slice(0, c.start) + out.slice(c.end);
  fs.writeFileSync(file, out);
  return cuts.length;
}

/* Archive = delist, but keep the row verbatim so it can be pasted straight
 * back. Products whose retailer URL is dead are useless live (the Buy button
 * 404s) but not necessarily gone forever — several are only unverifiable
 * because Amazon needs PA-API keys we don't have yet. */
function archiveProducts(file, ids, archivePath, reason) {
  const { src, rows } = readCatalog(file);
  const kept = [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`archiveProducts: unknown product id ${id}`);
    kept.push({ id, url: row.url, text: src.slice(row.span.call.start, row.span.call.end + 1) });
  }
  /* Markdown, not .js: these are bare `p(...)` calls, which are not valid
     standalone JavaScript and would fail node --check as a .js file. */
  const stamp = new Date().toISOString().slice(0, 10);
  const head = fs.existsSync(archivePath)
    ? ''
    : `# Archived catalog rows\n\nDelisted from \`server.js\`, kept verbatim. To relist, paste the row back into\nits category array in \`PRODUCTS\` and re-verify the URL and price first.\n`;
  const block =
    `\n## ${stamp} · ${reason}\n\n` +
    kept.map((k) => `- \`${k.id}\` — dead URL: ${k.url}\n\n\`\`\`js\n${k.text},\n\`\`\`\n`).join('\n');
  fs.appendFileSync(archivePath, head + block);
  removeProducts(file, ids);
  return kept.length;
}

/* Insert new products (stage 3 of docs/plans/catalog-expansion.md).
 *
 * p() takes 15 positional args and swapping two of them is silent — a row
 * whose rating landed in the reviewCount slot still parses and still serves.
 * So the order lives here once, and callers pass a named object.
 *
 * rows = [{ id, name, brand, price, retailer, url, image, category, quality,
 *           rating, reviewCount, reviewSource, expertVerdict, expertSource,
 *           specs, aspects, opts }]
 */
function addProducts(file, rows) {
  let src = fs.readFileSync(file, 'utf8');
  const known = new Set(readCatalog(file).rows.map((r) => r.id));

  /* Character index just before the closing bracket of PRODUCTS.<cat>. */
  function categoryEnd(cat) {
    const open = new RegExp(`\\n  ${cat}\\s*:\\s*\\[`).exec(src);
    if (!open) throw new Error(`addProducts: no category array "${cat}" in ${file}`);
    let depth = 0, quote = null;
    for (let i = open.index + open[0].length - 1; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '[' || c === '(' || c === '{') depth++;
      else if (c === ')' || c === '}') depth--;
      else if (c === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
    throw new Error(`addProducts: unterminated category array "${cat}"`);
  }

  function imgsEnd() {
    const open = /\nconst IMGS\s*=\s*\{/.exec(src);
    if (!open) throw new Error('addProducts: no IMGS map');
    let depth = 0, quote = null;
    for (let i = open.index + open[0].length - 1; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    throw new Error('addProducts: unterminated IMGS map');
  }

  const js = (v) => JSON.stringify(v ?? null);
  const optsText = (o) => {
    const parts = Object.entries(o || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== false)
      .map(([k, v]) => `${k}:${typeof v === 'string' ? js(v) : v}`);
    return parts.length ? `,{${parts.join(',')}}` : '';
  };

  const patches = [];
  for (const r of rows) {
    if (!r.id || known.has(r.id)) throw new Error(`addProducts: duplicate or missing id "${r.id}"`);
    if (!(Number(r.price) > 0)) throw new Error(`addProducts: ${r.id} has no price`);
    if (!r.url || !r.category) throw new Error(`addProducts: ${r.id} needs url and category`);
    known.add(r.id);

    /* The 15 args of p(), in order. Do not reorder without changing p(). */
    const call =
      `  p(${js(r.id)},${js(r.name)},${js(r.brand)},${r.price},${js(r.retailer)},${js(r.url)},` +
      `${r.quality},${js(r.rating)},${js(r.reviewCount)},${js(r.reviewSource)},` +
      `${js(r.expertVerdict)},${js(r.expertSource)},${js(r.specs || {})},${js(r.aspects || [])}` +
      `${optsText(r.opts)}),\n`;

    patches.push({ at: categoryEnd(r.category), text: call });
    if (r.image) patches.push({ at: imgsEnd(), text: `  ${js(r.id)}: ${js(r.image)},\n` });
  }

  /* Back to front, so every index computed above stays valid. */
  patches.sort((a, b) => b.at - a.at);
  for (const p of patches) src = src.slice(0, p.at) + p.text + src.slice(p.at);
  fs.writeFileSync(file, src);
  return rows.length;
}

export { readCatalog, applyEdits, removeProducts, archiveProducts, addProducts };
