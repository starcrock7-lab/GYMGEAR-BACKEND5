/* Verify every catalog image is a photo of THAT product.
 *
 * THE CARDINAL RULE, same as check-prices.js: only report an image actually
 * READ from the product's own page. Never substitute "something from the same
 * category" — that is exactly the failure this exists to fix. server.js falls
 * back to a stock photo pool when a product has no IMGS entry, which puts a
 * generic gym photo on a specific hoodie and makes the whole catalog look
 * fake.
 *
 * Variants matter as much as products: a listing pinned to the black colourway
 * must not show the blue one, so a pinned URL reads that variant's own image.
 *
 *   node scripts/check-images.mjs                 # audit everything
 *   node scripts/check-images.mjs --only rep-open-trap-bar
 *   node scripts/check-images.mjs --write         # fill in what it can prove
 */
import fs from 'node:fs';
import { readCatalog } from './catalog-io.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OPT = {
  write: argv.includes('--write'),
  only: (val('--only', '') || '').split(',').filter(Boolean),
  limit: Number(val('--limit', 0)),
  json: val('--json', ''),
  delay: Number(val('--delay', 900)),
  timeout: Number(val('--timeout', 20000)),
  catalog: val('--catalog', 'server.js'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '(bad url)';
  }
};

/* ── the IMGS map ─────────────────────────────────────────────────────── */
function readImages(file) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf('const IMGS');
  if (at < 0) throw new Error('no IMGS map');
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(at, end);
  const map = new Map();
  for (const m of block.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*['"]([^'"]+)['"]/g))
    map.set(m[1], m[2]);
  return { src, block, start: at, end, map };
}

/* ── reading the retailer's own image ─────────────────────────────────── */
const clean = (u) => (u || '').replace(/^\/\//, 'https://').split('?')[0];

async function fromShopify(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^(.*\/products\/[^/]+)/);
  if (!m) return null;
  const res = await fetch(`${u.origin}${m[1]}.js`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(OPT.timeout),
  });
  if (!res.ok) return null;
  let j;
  try {
    j = JSON.parse(await res.text());
  } catch {
    return null;
  }
  const wanted = u.searchParams.get('variant');
  /* A pinned variant's own photo is the point: the catalog row is that SKU,
     and the black shorts must not show the blue ones. */
  if (wanted) {
    const v = (j.variants || []).find((x) => String(x.id) === wanted);
    if (v?.featured_image?.src)
      return { image: clean(v.featured_image.src), method: 'shopify-variant' };
  }
  const first = (j.images || [])[0];
  if (first) return { image: clean(typeof first === 'string' ? first : first.src), method: 'shopify-product' };
  if (j.featured_image) return { image: clean(j.featured_image), method: 'shopify-product' };
  return null;
}

function fromHtml(html) {
  const grab = (re) => {
    const m = re.exec(html);
    return m ? clean(m[1]) : null;
  };
  /* JSON-LD first: it is the retailer stating which image is the product's,
     rather than whatever the page decided to open-graph. */
  for (const b of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data;
    try {
      data = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
      const type = [].concat(node['@type'] || []);
      if (!type.some((t) => /product/i.test(String(t)))) continue;
      const img = node.image;
      const first = Array.isArray(img) ? img[0] : img;
      const src = typeof first === 'string' ? first : first?.url;
      if (src) return { image: clean(src), method: 'json-ld' };
    }
  }
  const og = grab(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  if (og) return { image: og, method: 'og-image' };
  const tw = grab(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i);
  if (tw) return { image: tw, method: 'twitter-image' };
  return null;
}

async function readImage(url) {
  if (/(^|\.)amazon\./i.test(hostOf(url)))
    return { error: 'amazon-tos', note: 'Amazon images need PA-API via the Associates account' };
  try {
    const shop = await fromShopify(url);
    if (shop) return shop;
  } catch {
    /* fall through to HTML */
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(OPT.timeout),
    });
    if (!res.ok) return { error: `http-${res.status}` };
    return fromHtml(await res.text()) || { error: 'no-image-markup' };
  } catch (e) {
    return { error: 'fetch-failed', note: String(e.message || e).slice(0, 60) };
  }
}

/* Same image, different URL. Shopify serves one file from both the shop
   domain and cdn.shopify.com, plus size and format transforms — comparing
   raw URLs called two identical benches a mismatch. The filename is the
   stable identity, so compare that (with transforms stripped). */
const fingerprint = (u) => {
  const url = clean(u).toLowerCase();
  const file = url.split('/').pop() || url;
  return file
    .replace(/_(\d+)x(\d+)?(_crop_[a-z]+)?(?=\.[a-z]+$)/, '')
    .replace(/@\dx(?=\.[a-z]+$)/, '');
};

/* An og:image is often the site's social share card, not the product —
   ironmaster's is literally IronMaster-Share.jpg. Writing that would make the
   catalog worse than the stock photo it replaced, so these are reported for a
   human and never auto-written. */
const GENERIC_IMAGE = /share|logo|social|default|placeholder|banner|og[-_]image|favicon/i;

/* ── run ──────────────────────────────────────────────────────────────── */
const { map: imgs } = readImages(OPT.catalog);
let rows = readCatalog(OPT.catalog).rows;
if (OPT.only.length) rows = rows.filter((r) => OPT.only.includes(r.id));
if (OPT.limit) rows = rows.slice(0, OPT.limit);

const results = [];
const lastHit = new Map();
for (const row of rows) {
  const host = hostOf(row.url);
  const since = Date.now() - (lastHit.get(host) || 0);
  if (since < OPT.delay) await sleep(OPT.delay - since);
  lastHit.set(host, Date.now());

  const have = imgs.get(row.id) || null;
  const seen = await readImage(row.url);

  let cls;
  if (seen.error) cls = have ? 'UNVERIFIABLE' : 'NO_IMAGE';
  else if (GENERIC_IMAGE.test(seen.image.split('/').pop() || ''))
    cls = have ? 'OK' : 'NEEDS_REVIEW'; // a share card proves nothing either way
  else if (!have) cls = 'MISSING';
  else if (fingerprint(have) === fingerprint(seen.image)) cls = 'OK';
  else cls = 'MISMATCH';

  results.push({ id: row.id, host, url: row.url, have, seen: seen.image || null, method: seen.method || seen.error, cls });
  console.log(
    `${cls.padEnd(13)} ${row.id.padEnd(38)} ${seen.method || seen.error || ''}`,
  );
}

const counts = {};
for (const r of results) counts[r.cls] = (counts[r.cls] || 0) + 1;
console.log('\n── summary ──────────────────────────────────────────────');
console.log(`checked ${results.length} products`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(14)} ${v}`);

const noPhoto = results.filter((r) => r.cls === 'NO_IMAGE');
if (noPhoto.length) {
  console.log('\nNO_IMAGE (these render a stock photo of something else):');
  const byHost = {};
  for (const r of noPhoto) byHost[r.host] = (byHost[r.host] || 0) + 1;
  for (const [h, n] of Object.entries(byHost).sort((a, b) => b[1] - a[1]))
    console.log(`  ${h.padEnd(28)} ${n}`);
}

if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));

const fixable = results.filter((r) => r.cls === 'MISSING' || r.cls === 'MISMATCH');
if (OPT.write && fixable.length) {
  const { src, end } = readImages(OPT.catalog);
  const existing = readImages(OPT.catalog).map;
  let out = src;
  const adds = [];
  const patches = [];
  for (const r of fixable) {
    if (existing.has(r.id)) {
      /* Replace in place — the line is `'id': 'url',` inside IMGS. */
      const re = new RegExp(`(['"]${r.id}['"]\\s*:\\s*)['"][^'"]+['"]`);
      const m = re.exec(out);
      if (m) patches.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]}'${r.seen}'` });
    } else {
      adds.push(`  '${r.id}': '${r.seen}',\n`);
    }
  }
  patches.sort((a, b) => b.start - a.start);
  for (const p of patches) out = out.slice(0, p.start) + p.text + out.slice(p.end);
  if (adds.length) {
    const at = readImages(OPT.catalog).end; // recompute against original offsets
    out = out.slice(0, at) + adds.join('') + out.slice(at);
  }
  fs.writeFileSync(OPT.catalog, out);
  console.log(`\nwrote ${fixable.length} image(s) to ${OPT.catalog} — review the diff`);
} else if (fixable.length) {
  console.log(`\n${fixable.length} image(s) would change. Dry run: nothing written.`);
}

if (results.length && results.every((r) => r.cls === 'NO_IMAGE' || r.cls === 'UNVERIFIABLE')) {
  console.error('\nFAILED: nothing was readable — treat as a broken run, not a clean bill of health.');
  process.exit(1);
}
