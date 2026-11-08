/* Verify catalog prices against the live retailer listings.
 *
 * THE CARDINAL RULE: this script only ever reports a price it actually READ
 * from the listing. It never infers, estimates, rounds, or carries a stale
 * value forward, and nothing here may be filled in by a model. A product whose
 * price cannot be read is UNREADABLE — never guessed, never quietly left
 * alone. A fabricated discount is worse than no discount: it makes the site
 * lie to customers, which is the failure this exists to prevent.
 *
 * Dry run by default: prints the classification table and writes nothing.
 * --write edits server.js so CI can raise a PR; a human still merges it.
 *
 *   node scripts/check-prices.js                  # dry run, whole catalog
 *   node scripts/check-prices.js --limit 10       # first 10 products
 *   node scripts/check-prices.js --only rogue-r3  # specific ids
 *   node scripts/check-prices.js --write --json report.json
 */
import fs from 'node:fs';
import { readCatalog, applyEdits } from './catalog-io.js';
import { hostOf, readListing, setReadTimeout } from './read-listing.js';

/* --catalog lets the acceptance tests run against a throwaway copy instead of
   the real server.js. */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OPT = {
  write: flag('--write'),
  limit: Number(val('--limit', 0)),
  only: (val('--only', '') || '').split(',').filter(Boolean),
  json: val('--json', ''),
  timeout: Number(val('--timeout', 15000)),
  delay: Number(val('--delay', 1200)), // per-host politeness gap
  catalog: val('--catalog', 'server.js'),
};
const CATALOG = OPT.catalog;
setReadTimeout(OPT.timeout);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => (n === null || n === undefined ? '—' : `$${n}`);

/* ── classification ───────────────────────────────────────────────────── */
function classify(row, seen) {
  if (seen.error) return { cls: 'UNREADABLE', reason: seen.error, note: seen.note };
  if (seen.available === false) return { cls: 'OUT_OF_STOCK', reason: 'listing reports out of stock' };
  /* Only the Shopify feed can confirm all three things an edit depends on:
     the shop's currency, that the listing is not priced per variant, and
     whether a compare-at price exists. Structured data confirms none of them —
     it read $69.99 for a plate set sold from $69.99 (10lb pair) to $199.99,
     against a $215 catalog set price. Report those, never auto-edit them. */
  if (seen.method !== 'shopify-json')
    return {
      cls: 'NEEDS_REVIEW',
      reason: `reads $${seen.current} via ${seen.method}, which cannot confirm currency, variants or compare-at — verify by hand`,
    };

  const edit = { id: row.id };
  const advertisedSale = seen.list && seen.current && seen.list > seen.current;

  if (advertisedSale) {
    if (row.salePrice === null) {
      edit.price = seen.list; edit.salePrice = seen.current;
      if (seen.validUntil) edit.saleEndsAt = seen.validUntil;
      return { cls: 'SALE_STARTED', edit };
    }
    if (seen.current !== row.salePrice || seen.list !== row.price) {
      edit.price = seen.list; edit.salePrice = seen.current;
      if (seen.validUntil) edit.saleEndsAt = seen.validUntil;
      return { cls: 'PRICE_CHANGED', edit };
    }
    return { cls: 'UNCHANGED' };
  }

  if (row.salePrice !== null) {
    /* Only a source that can actually see a compare-at price may conclude a
       sale has ended. From JSON-LD, "no list price in the markup" means we
       could not see one — not that the discount is gone. Report it and leave
       the sale alone; a human decides. */
    if (!seen.canSeeList)
      return {
        cls: 'NEEDS_REVIEW',
        reason: `reads $${seen.current} but this source cannot see a compare-at price; catalog claims a sale at $${row.salePrice}`,
      };
    // compare_at_price is genuinely absent → the retailer withdrew the sale.
    edit.price = seen.current; edit.salePrice = null; edit.saleEndsAt = null;
    return { cls: 'SALE_ENDED', edit };
  }
  if (seen.current !== row.price) {
    edit.price = seen.current;
    return { cls: 'PRICE_CHANGED', edit };
  }
  return { cls: 'UNCHANGED' };
}

/* ── run ──────────────────────────────────────────────────────────────── */
const { rows } = readCatalog(CATALOG);
let targets = rows;
if (OPT.only.length) targets = targets.filter((r) => OPT.only.includes(r.id));
if (OPT.limit) targets = targets.slice(0, OPT.limit);

const results = [];
const lastHit = new Map();
for (const row of targets) {
  const host = hostOf(row.url);
  const gap = OPT.delay;
  const since = Date.now() - (lastHit.get(host) || 0);
  if (since < gap) await sleep(gap - since);
  lastHit.set(host, Date.now());

  const seen = await readListing(row.url);
  const verdict = classify(row, seen);
  results.push({
    id: row.id, host, url: row.url,
    catalog: { price: row.price, salePrice: row.salePrice },
    read: seen.error ? null : { current: seen.current, list: seen.list, method: seen.method, validUntil: seen.validUntil || null },
    ...verdict,
    checkedAt: new Date().toISOString(),
  });
  const r = results[results.length - 1];
  console.log(
    `${r.cls.padEnd(14)} ${r.id.padEnd(22)} catalog ${money(row.salePrice ?? row.price).padStart(7)}` +
      `  read ${money(seen.current).padStart(7)}${seen.list ? ` of ${money(seen.list)}` : ''}` +
      `  ${seen.method || seen.error || ''}`,
  );
}

const counts = {};
for (const r of results) counts[r.cls] = (counts[r.cls] || 0) + 1;
const readable = results.filter((r) => r.cls !== 'UNREADABLE').length;

console.log('\n── summary ──────────────────────────────────────────────');
console.log(`checked ${results.length} products, ${readable} readable`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(15)} ${v}`);

const unreadable = results.filter((r) => r.cls === 'UNREADABLE');
if (unreadable.length) {
  console.log('\nUNREADABLE by retailer:');
  const byHost = {};
  for (const r of unreadable) (byHost[r.host] ||= {})[r.reason] = ((byHost[r.host] || {})[r.reason] || 0) + 1;
  for (const [h, reasons] of Object.entries(byHost).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)))
    console.log(`  ${h.padEnd(28)} ${Object.entries(reasons).map(([k, v]) => `${k}×${v}`).join(', ')}`);
}

const edits = results.filter((r) => r.edit).map((r) => r.edit);
if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));

/* Stock is the one fact that flips back on its own, so it gets a list the job
 * maintains rather than a human. A published row whose retailer has sold out
 * sends a buyer to a dead end; shelving it is right, but so is un-shelving it
 * the day it returns.
 *
 * Only rows this run actually READ are touched. An unreadable row keeps
 * whatever it had — inferring "back in stock" from a failed fetch is how a
 * sold-out product quietly returns to the shelf. */
function writeSoldOut(file, results) {
  let src = fs.readFileSync(file, 'utf8');
  const m = /const SOLD_OUT_IDS = new Set\(\[([\s\S]*?)\]\);/.exec(src);
  const current = new Set(
    m ? [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]) : [],
  );
  const before = new Set(current);
  for (const r of results) {
    if (r.cls === 'UNREADABLE') continue; // never guess from a failed read
    if (r.cls === 'OUT_OF_STOCK') current.add(r.id);
    else current.delete(r.id);
  }
  const added = [...current].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !current.has(id));
  if (!added.length && !removed.length) return { added, removed };

  const ids = [...current].sort();
  const lines = [];
  for (let i = 0; i < ids.length; i += 4)
    lines.push('  ' + ids.slice(i, i + 4).map((x) => `'${x}'`).join(', ') + ',');
  const block = ['const SOLD_OUT_IDS = new Set([', ...lines, ']);'].join('\n');
  if (m) src = src.slice(0, m.index) + block + src.slice(m.index + m[0].length);
  else throw new Error('no SOLD_OUT_IDS set in ' + file);
  fs.writeFileSync(file, src);
  return { added, removed };
}

if (OPT.write && edits.length) {
  const n = applyEdits(CATALOG, edits);
  console.log(`\napplied ${n} edit(s) to ${CATALOG} — review the diff, never merge unread`);
} else if (edits.length) {
  console.log(`\n${edits.length} product(s) would change. Dry run: nothing written. Re-run with --write.`);
}

/* A run that reads nothing is a broken run, not a clean one. Silence here is
 * how a dead selector rewrites the whole catalog as "unchanged". */
if (results.length && readable === 0) {
  console.error('\nFAILED: 0 of ' + results.length + ' products were readable — treat as a broken run, not "no changes".');
  process.exit(1);
}
