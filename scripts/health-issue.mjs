/* Turn the weekly link/image reports into an issue body — but only for rows
 * the site actually serves. A shelved row cannot hurt anyone, and reporting it
 * every week would cry wolf until nobody reads the issue.
 *
 * Writes issue.md and prints "clean" (exit 0, no file) when nothing is wrong.
 *
 *   node scripts/health-issue.mjs link-report.json image-report.json
 */
import fs from 'node:fs';

const [linkPath, imagePath, out = 'issue.md'] = process.argv.slice(2);
if (!linkPath || !imagePath) {
  console.error('usage: node scripts/health-issue.mjs <link-report.json> <image-report.json> [out.md]');
  process.exit(1);
}

const links = JSON.parse(fs.readFileSync(linkPath, 'utf8')).results;
const images = JSON.parse(fs.readFileSync(imagePath, 'utf8')).results;

/* Which rows the site actually serves. A photo is only one of three
   conditions — server.js also shelves anything in BAD_LINK_IDS or
   SOLD_OUT_IDS — and ignoring the other two made the first weekly issue list
   23 rows that were already shelved. An alert that mostly reports things you
   have already dealt with is an alert you stop reading. */
function shelvedIds(catalog = 'server.js') {
  const src = fs.readFileSync(catalog, 'utf8');
  const out = new Set();
  for (const name of ['BAD_LINK_IDS', 'SOLD_OUT_IDS']) {
    const at = src.indexOf(`const ${name} = new Set([`);
    if (at < 0) continue;
    const m = [src.slice(at, src.indexOf(']);', at))];
    for (const id of m[0].matchAll(/'([a-z0-9-]+)'/g)) out.add(id[1]);
  }
  return out;
}
const shelved = shelvedIds();
const served = new Set(
  images.filter((r) => r.have && !shelved.has(r.id)).map((r) => r.id),
);
const BROKEN = new Set(['LISTING', 'HOME', 'DEAD', 'PARKED', 'GROUP']);

const badLinks = links.filter((r) => served.has(r.id) && BROKEN.has(r.cls));
const badImages = images.filter((r) => r.cls === 'MISMATCH' && !shelved.has(r.id));

if (!badLinks.length && !badImages.length) {
  console.log('clean — every published row still reaches its product and shows its own photo');
  process.exit(0);
}

const lines = ['A published row stopped pointing at its product, or its photo drifted.', ''];
if (badLinks.length) {
  lines.push(`### ${badLinks.length} link(s) no longer reach the product`, '');
  for (const r of badLinks) lines.push(`- \`${r.id}\` — **${r.cls}** — ${r.url}`);
  lines.push('');
}
if (badImages.length) {
  lines.push(`### ${badImages.length} photo(s) no longer match the page`, '');
  for (const r of badImages) lines.push(`- \`${r.id}\` — the page now shows ${r.seen}`);
  lines.push('');
}
lines.push(
  'Re-source it (`docs/plans/resource-brief.md`) or shelve it, then rerun `npm run check:links` and `npm run check:images`.',
);
fs.writeFileSync(out, lines.join('\n'));
console.log(`${badLinks.length} bad link(s), ${badImages.length} bad image(s) — wrote ${out}`);
