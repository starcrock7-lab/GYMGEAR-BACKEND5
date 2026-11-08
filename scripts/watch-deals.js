/* Read every store we are allowed to read and write the live price feed.
 * Run by .github/workflows/deal-watch.yml, which publishes the result to the
 * live-deals branch; server.js picks it up without a redeploy.
 *
 *   node scripts/watch-deals.js --out live-deals.json [--prev old.json] [--only id,id]
 *
 * Exits non-zero and writes nothing when far fewer products could be read than
 * last time: a broken reader must never look like every sale having ended.
 */
import fs from 'node:fs';
import { readCatalog } from './catalog-io.js';
import { hostOf, pagePrices, readListing, readPage } from './read-listing.js';
import { decideItem, findPromoEnd } from '../live-deals.js';

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OUT = val('--out', 'live-deals.json');
const PREV = val('--prev', '');
const ONLY = val('--only', '').split(',').filter(Boolean);
const GAP_MS = 1200; // per store
const MIN_VERIFIED = 40;
const KEEP_SHARE = 0.7;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let prev = { items: {}, promos: {}, stats: {} };
if (PREV && fs.existsSync(PREV)) {
  try { prev = JSON.parse(fs.readFileSync(PREV, 'utf8')); } catch { /* first run, or a bad file */ }
}

const { rows } = readCatalog('server.js');
const targets = rows.filter((r) => !/(^|\.)amazon\./i.test(hostOf(r.url)) && (!ONLY.length || ONLY.includes(r.id)));

const nowIso = new Date().toISOString();
const items = {};
const refused = {};
const lastHit = new Map();
const pace = async (host) => {
  const wait = GAP_MS - (Date.now() - (lastHit.get(host) || 0));
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
};

for (const row of targets) {
  const host = hostOf(row.url);
  await pace(host);
  const seen = await readListing(row.url).catch((e) => ({ error: 'fetch-failed', note: String(e.message || e) }));
  const out = await decideItem(seen, prev.items?.[row.id], async () => {
    await pace(host);
    return pagePrices(row.url);
  }, nowIso);
  if (out.item) items[row.id] = out.item;
  else (refused[out.refused] ||= []).push(row.id);
}

/* A banner must read the same on two runs in a row before anyone sees it. */
const promos = {};
const saleHosts = new Set(targets.filter((r) => items[r.id]?.salePrice).map((r) => hostOf(r.url)));
for (const host of saleHosts) {
  await pace(host);
  const html = await readPage(`https://${host}/`);
  const ends = html ? findPromoEnd(html) : null;
  if (ends) promos[host] = { ends };
}
for (const row of targets) {
  const it = items[row.id];
  const promo = promos[hostOf(row.url)];
  if (it?.salePrice && promo && prev.promos?.[hostOf(row.url)]?.ends === promo.ends) it.storeSaleEnds = promo.ends;
}

const list = Object.values(items);
const stats = {
  verified: list.length,
  onSale: list.filter((i) => i.salePrice).length,
  soldOut: list.filter((i) => i.soldOut).length,
  refused: Object.values(refused).reduce((n, a) => n + a.length, 0),
};
console.log(`read ${targets.length} products: ${JSON.stringify(stats)}`);
for (const [why, ids] of Object.entries(refused).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(ids.length).padStart(3)} ${why}`);
console.log('store sale banners:', JSON.stringify(promos));

if (!ONLY.length) {
  const floor = Math.max(MIN_VERIFIED, Math.floor((prev.stats?.verified || 0) * KEEP_SHARE));
  if (stats.verified < floor) {
    console.error(`FAILED: only ${stats.verified} products confirmed, need ${floor}. Keeping the last good feed.`);
    process.exit(1);
  }
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: nowIso, stats, promos, items }));
console.log(`wrote ${OUT}`);
