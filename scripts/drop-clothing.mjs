/* One-off: remove the clothing group from the catalog.
 *
 * Apparel never earned its place here — the site's job is helping someone
 * choose gym equipment, and a hoodie has no specs to score, no footprint for
 * the planner and no role in a kit. It was also the worst-behaved data in the
 * catalog: Nike and adidas rows pointed at category pages, both lululemon
 * links landed on the home page, and better-bodies.com had been sold to a
 * domain parker whose banner we were showing as a product photo.
 *
 * Rows are ARCHIVED verbatim, not deleted outright, so the decision is
 * reversible without re-sourcing anything.
 *
 *   node scripts/drop-clothing.mjs --dry
 *   node scripts/drop-clothing.mjs
 */
import fs from 'node:fs';
import { readCatalog, archiveProducts } from './catalog-io.js';

const DRY = process.argv.includes('--dry');
const CATALOG = 'server.js';
const CLOTHING = ['shorts', 'compression', 'tanks', 'hoodies', 'footwear', 'sportsbras'];

/* Span of one category array inside PRODUCTS, so we can tell which rows live
   in it — the p(...) rows carry no category of their own. */
function categorySpan(src, cat) {
  const products = src.indexOf('const PRODUCTS');
  const re = new RegExp(`\\n\\s*${cat}\\s*:\\s*\\[`, 'g');
  let m;
  while ((m = re.exec(src))) {
    if (m.index < products) continue;
    let depth = 0;
    for (let i = src.indexOf('[', m.index); i < src.length; i++) {
      const c = src[i];
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) return { start: m.index, end: i };
      }
    }
  }
  return null;
}

const src = fs.readFileSync(CATALOG, 'utf8');
const rows = readCatalog(CATALOG).rows;

const ids = [];
for (const cat of CLOTHING) {
  const span = categorySpan(src, cat);
  if (!span) {
    console.log(`no ${cat} array — already gone?`);
    continue;
  }
  const inCat = rows.filter((r) => r.span.call.start > span.start && r.span.call.start < span.end);
  console.log(`${cat.padEnd(12)} ${inCat.length}`);
  ids.push(...inCat.map((r) => r.id));
}

console.log(`\n${ids.length} clothing rows`);
if (DRY) {
  console.log('dry run — nothing written');
  process.exit(0);
}

/* Archive first: archiveProducts writes the verbatim rows to the markdown file
   and then removes them, so a reversal is a paste. */
archiveProducts(
  CATALOG,
  ids,
  'ARCHIVED-PRODUCTS.md',
  'clothing category retired — the site advises on equipment, and apparel had no specs to score, no footprint, and the worst link rot in the catalog',
);
console.log(`archived and removed ${ids.length} rows`);

/* Now the category itself: its array, metadata, image pool and taxonomy. */
let out = fs.readFileSync(CATALOG, 'utf8');
for (const cat of CLOTHING) {
  const span = categorySpan(out, cat);
  if (span) {
    let end = span.end + 1;
    if (out[end] === ',') end++;
    out = out.slice(0, span.start) + out.slice(end);
  }
  /* CATEGORY_META / CAT_IMAGE / CATEGORY_TAGS entries, one line each. */
  out = out.replace(new RegExp(`\\n\\s*${cat}\\s*:\\s*\\{[^\\n]*\\},?`, 'g'), '');
  out = out.replace(new RegExp(`\\n\\s*${cat}\\s*:\\s*\\[[^\\]]*\\],?`, 'g'), '');
}
fs.writeFileSync(CATALOG, out);
console.log('removed the category keys');
