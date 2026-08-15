/* Apply a re-sourcing batch: point an existing row at a retailer we can read.
 *
 * These rows already exist — the product is right, the destination was wrong.
 * So this rewrites url/price/salePrice/image (and refreshes the verdict block
 * when the agent supplied one) rather than inserting anything new.
 *
 * Refuses anything unproven, in the same spirit as import-apply: no price, no
 * image, a non-product URL, or a status other than "replaced" and the row
 * stays shelved. A row we cannot fix is not worse off for staying hidden; a
 * row fixed with a guess is.
 *
 *   node scripts/resource-apply.mjs staging/resource-a.json --dry
 *   node scripts/resource-apply.mjs staging/resource-*.json
 */
import fs from 'node:fs';
import { readCatalog, applyEdits, setArgs } from './catalog-io.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node scripts/resource-apply.mjs <staging.json...> [--dry]');
  process.exit(1);
}

const CATALOG = 'server.js';
const MIN_REVIEWS = 5;
const known = new Map(readCatalog(CATALOG).rows.map((r) => [r.id, r]));

const ready = [];
const skipped = [];
for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of doc.products || []) {
    if (p.status !== 'replaced') {
      skipped.push(`${p.id}: ${p.status || 'no status'}${p.reason ? ' — ' + p.reason : ''}`);
      continue;
    }
    const missing = [];
    if (!known.has(p.id)) missing.push('unknown id');
    if (!(Number(p.price) > 0)) missing.push('price');
    if (!/^https?:\/\//.test(p.url || '')) missing.push('url');
    if (!/^https?:\/\//.test(p.image || '')) missing.push('image');
    if (/amazon\./i.test(p.url || '')) missing.push('still an amazon url');
    if (p.salePrice && Number(p.salePrice) >= Number(p.price)) missing.push('salePrice not below price');
    if (missing.length) {
      skipped.push(`${p.id}: needs ${missing.join(', ')}`);
      continue;
    }
    ready.push(p);
  }
}

console.log(`ready ${ready.length}  skipped ${skipped.length}`);
for (const s of skipped) console.log(`  SKIP ${s}`);
if (DRY) {
  console.log('\ndry run — nothing written');
  process.exit(0);
}
if (!ready.length) {
  console.error('nothing to apply');
  process.exit(1);
}

/* Price, sale and url through the span editor; everything else that must move
   with them by argument index. */
applyEdits(
  CATALOG,
  ready.map((p) => ({
    id: p.id,
    url: p.url,
    price: Number(p.price),
    salePrice: p.salePrice ? Number(p.salePrice) : null,
  })),
);

for (const p of ready) {
  const fields = {};
  if (p.retailer) fields.retailer = p.retailer;
  if (p.expertVerdict) {
    fields.expertVerdict = p.expertVerdict;
    /* A new verdict is ours until someone else says it. Leaving the old
       publication's name on a sentence we wrote attributes an opinion to
       Barbend that Barbend never gave. */
    fields.expertSource = p.expertSource || 'GymGear Compare';
  }
  if (p.specs && Object.keys(p.specs).length >= 3) fields.specs = p.specs;
  if (p.aspects && p.aspects.length >= 3) fields.aspects = p.aspects;
  if (Number(p.quality) >= 6 && Number(p.quality) <= 10) fields.quality = Number(p.quality);

  /* The rating has to move with the link or be dropped. Leaving Amazon's
     9,500 reviews on a row that now points at a brand store is a claim about
     a page that never carried them. */
  const enough = Number(p.reviewCount) >= MIN_REVIEWS && Number(p.rating) > 0;
  fields.rating = enough ? Number(p.rating) : null;
  fields.reviewCount = enough ? Number(p.reviewCount) : null;
  fields.reviewSource = enough ? p.retailer ?? null : null;
  if (!enough && p.rating) console.log(`  rating dropped (${p.reviewCount || 0} reviews): ${p.id}`);

  setArgs(CATALOG, p.id, fields);

  /* IMGS is keyed by id: replace in place, or add at the end of the map. */
  let src = fs.readFileSync(CATALOG, 'utf8');
  const imgRe = new RegExp(`(['"]${p.id}['"]\s*:\s*)['"][^'"]*['"]`);
  if (imgRe.test(src)) src = src.replace(imgRe, `$1'${p.image}'`);
  else {
    const at = src.indexOf('const IMGS');
    let depth = 0;
    let end = -1;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    src = src.slice(0, end) + `  '${p.id}': '${p.image}',
` + src.slice(end);
  }
  fs.writeFileSync(CATALOG, src);
}

/* The shelf lists are keyed by id and these rows are fixed now, so drop them
   from every reason-set. Anything still broken will be re-added by the next
   check-links / check-prices run — the lists are outputs, not decisions. */
let out = fs.readFileSync(CATALOG, 'utf8');
const fixed = new Set(ready.map((r) => r.id));
for (const name of ['BAD_LINK_IDS', 'UNVERIFIED_PRICE_IDS', 'SOLD_OUT_IDS']) {
  const at = out.indexOf(`const ${name} = new Set([`);
  if (at < 0) continue;
  const close = out.indexOf(']);', at);
  const head = out.slice(at, out.indexOf('new Set([', at) + 9);
  const ids = [...out.slice(at, close).matchAll(/'([a-z0-9-]+)'/g)]
    .map((m) => m[1])
    .filter((id) => !fixed.has(id));
  const lines = [];
  for (let i = 0; i < ids.length; i += 4)
    lines.push('  ' + ids.slice(i, i + 4).map((x) => `'${x}'`).join(', ') + ',');
  out = out.slice(0, at) + head + '\n' + lines.join('\n') + '\n' + out.slice(close);
}
fs.writeFileSync(CATALOG, out);

console.log(`\napplied ${ready.length} row(s)`);
console.log('now run: node --check server.js && node scripts/check-prices.js --only ' + ready.map((r) => r.id).join(','));
