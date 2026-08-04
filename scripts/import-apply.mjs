/* Stage 3 of docs/plans/catalog-expansion.md — insert enriched staging rows
 * into the catalog.
 *
 * Refuses anything that is not finished: a row with no quality, no verdict, no
 * specs or no image never reaches server.js. Half a product in the catalog is
 * worse than none — it renders as a card with blank facts and still gets
 * recommended by the kit builder.
 *
 *   node scripts/import-apply.mjs staging/bos-deals-a.json --dry
 *   node scripts/import-apply.mjs staging/bos-deals-*.json
 */
import fs from 'node:fs';
import { addProducts } from './catalog-io.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node scripts/import-apply.mjs <staging.json...> [--dry]');
  process.exit(1);
}

const CATALOG = 'server.js';
/* Our own one-line read, not a publication's — saying otherwise would be
   inventing a source, which is the one thing this pipeline must never do. */
const VERDICT_SOURCE = 'GymGear Compare';

const ready = [];
const rejected = [];
let dropped = 0;

for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of doc.products || []) {
    if (p.drop) {
      dropped++;
      continue;
    }
    const missing = [];
    if (!(Number(p.quality) >= 6 && Number(p.quality) <= 10)) missing.push('quality 6-10');
    if (!p.expertVerdict) missing.push('expertVerdict');
    if (!p.specs || Object.keys(p.specs).length < 3) missing.push('3+ specs');
    if (!p.aspects || p.aspects.length < 3) missing.push('3 aspects');
    if (!p.image) missing.push('image');
    if (!(Number(p.price) > 0)) missing.push('price');
    if (!/^https?:\/\//.test(p.url || '')) missing.push('url');
    if (missing.length) {
      rejected.push(`${p.id}: needs ${missing.join(', ')}`);
      continue;
    }
    /* A sale must be a real one: salePrice below the list price we read. */
    const onSale = p.salePrice && Number(p.salePrice) < Number(p.price);
    ready.push({
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: p.price,
      retailer: p.retailer,
      url: p.url,
      image: p.image,
      category: p.category,
      quality: p.quality,
      rating: p.rating ?? null,
      reviewCount: p.reviewCount ?? null,
      reviewSource: p.reviewSource ?? p.retailer ?? null,
      expertVerdict: p.expertVerdict,
      expertSource: p.expertSource ?? VERDICT_SOURCE,
      specs: p.specs,
      aspects: p.aspects,
      opts: onSale ? { salePrice: Number(p.salePrice) } : {},
    });
  }
}

const byCat = {};
for (const r of ready) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log(`ready ${ready.length}  dropped ${dropped}  rejected ${rejected.length}`);
console.log(`  ${Object.entries(byCat).map(([c, n]) => `${c}=${n}`).join(' ')}`);
for (const r of rejected) console.log(`  REJECTED ${r}`);
console.log(`  on sale: ${ready.filter((r) => r.opts.salePrice).length}`);

if (DRY) {
  console.log('\ndry run — nothing written');
  process.exit(0);
}
if (!ready.length) {
  console.error('nothing ready to insert');
  process.exit(1);
}

const n = addProducts(CATALOG, ready);
console.log(`\ninserted ${n} product(s) into ${CATALOG}`);
console.log('now run: node --check server.js && node scripts/check-prices.js --only ' + ready.map((r) => r.id).join(','));
