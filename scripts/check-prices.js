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

/* --catalog lets the acceptance tests run against a throwaway copy instead of
   the real server.js. */
const UA =
  'GymGearCompareBot/1.0 (+https://gymgearcompare.com; price accuracy check; contact starcrock7@gmail.com)';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '(bad url)'; } };
const money = (n) => (n === null || n === undefined ? '—' : `$${n}`);

/* ── robots.txt ───────────────────────────────────────────────────────── */
const robotsCache = new Map();
async function robotsAllows(url) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    let rules = { disallow: [], crawlDelay: 0 };
    try {
      const res = await fetch(`${u.origin}/robots.txt`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(OPT.timeout),
      });
      if (res.ok) {
        const txt = await res.text();
        let applies = false;
        for (const raw of txt.split('\n')) {
          const line = raw.replace(/#.*/, '').trim();
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').trim();
          if (!k) continue;
          const key2 = k.trim().toLowerCase();
          if (key2 === 'user-agent') applies = v === '*';
          else if (applies && key2 === 'disallow' && v) rules.disallow.push(v);
          else if (applies && key2 === 'crawl-delay' && v) rules.crawlDelay = Number(v) * 1000 || 0;
        }
      }
    } catch { /* unreachable robots.txt → treat as no rules, still rate-limited */ }
    robotsCache.set(key, rules);
  }
  const r = robotsCache.get(key);
  const path = u.pathname + u.search;
  return { allowed: !r.disallow.some((d) => path.startsWith(d)), crawlDelay: r.crawlDelay };
}

/* ── price extraction ─────────────────────────────────────────────────── */
const num = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* Shopify exposes the real list/sale pair at /products/<handle>.js — it is
 * published for machines and survives redesigns, so try it before HTML. */
async function fromShopify(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^(.*\/products\/[^/]+)/);
  if (!m) return null;
  const res = await fetch(`${u.origin}${m[1]}.js`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(OPT.timeout),
  });
  // Shopify serves this as text/javascript, not application/json — content-type
  // is not a usable gate here, so parse defensively instead.
  if (!res.ok) return null;
  let j;
  try { j = JSON.parse(await res.text()); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const variants = j.variants || [];
  if (!variants.length) return null;
  /* Multi-variant listings (a dumbbell sold per weight, a rack per height)
     have no single price, and the catalog row does not record which variant it
     priced. Picking one would have turned a $295 dumbbell SET into the $29.99
     single — a fabricated 90% discount. Refuse rather than guess. */
  const distinct = [...new Set(variants.map((x) => x.price))];
  if (distinct.length > 1) {
    return {
      error: 'ambiguous-variants',
      note: `${distinct.length} variant prices ($${Math.min(...distinct) / 100}–$${Math.max(...distinct) / 100}) — catalog row does not say which`,
    };
  }
  const v = variants.find((x) => x.available) || variants[0];
  return {
    current: num(v.price / 100),
    list: num(v.compare_at_price ? v.compare_at_price / 100 : null),
    available: j.available ?? v.available ?? null,
    method: 'shopify-json',
  };
}

function fromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
      const type = [].concat(node['@type'] || []);
      if (!type.some((t) => /product/i.test(String(t)))) continue;
      const offers = [].concat(node.offers || []);
      for (const o of offers) {
        if (!o || typeof o !== 'object') continue;
        const current = num(o.price ?? o.lowPrice);
        if (!current) continue;
        return {
          current,
          list: num(o.highPrice) && num(o.highPrice) > current ? num(o.highPrice) : null,
          available: o.availability ? !/OutOfStock|SoldOut|Discontinued/i.test(o.availability) : null,
          validUntil: typeof o.priceValidUntil === 'string' ? o.priceValidUntil.slice(0, 10) : null,
          method: 'json-ld',
        };
      }
    }
  }
  return null;
}

function fromMeta(html) {
  const grab = (re) => { const m = re.exec(html); return m ? num(m[1]) : null; };
  const current =
    grab(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)/i) ||
    grab(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)/i);
  if (!current) return null;
  return { current, list: null, available: null, method: 'meta-tag' };
}

async function readListing(url) {
  if (/(^|\.)amazon\./i.test(hostOf(url)))
    return { error: 'amazon-tos', note: 'Amazon forbids scraping — needs PA-API via the Associates account' };

  const rob = await robotsAllows(url);
  if (!rob.allowed) return { error: 'robots-disallow', note: 'robots.txt disallows this path' };

  try {
    const shop = await fromShopify(url);
    /* An ambiguous variant set is a determinate answer — "we cannot know" —
       not a reason to fall through and scrape a number off the page. */
    if (shop && (shop.current || shop.error)) return shop;
  } catch { /* fall through to HTML */ }

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(OPT.timeout),
    });
    if (!res.ok) return { error: `http-${res.status}` };
    html = await res.text();
  } catch (e) {
    return { error: 'fetch-failed', note: String(e.message || e).slice(0, 80) };
  }
  return fromJsonLd(html) || fromMeta(html) || { error: 'no-price-markup' };
}

/* ── classification ───────────────────────────────────────────────────── */
function classify(row, seen) {
  if (seen.error) return { cls: 'UNREADABLE', reason: seen.error, note: seen.note };
  if (seen.available === false) return { cls: 'OUT_OF_STOCK', reason: 'listing reports out of stock' };

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
    // Listing no longer advertises a sale. Record what we read as the price
    // and clear the sale — never keep a discount the retailer has withdrawn.
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
