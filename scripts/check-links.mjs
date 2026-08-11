/* Every Buy link must land on THAT product's page. Nothing else counts.
 *
 * A link to a category page is not a Buy button, it is a shrug: the shopper
 * has to find the product again, and the price and photo we showed belong to
 * something they may never see. A link to a parked domain is worse — one row
 * pointed at better-bodies.com, which is now a HugeDomains sale page, and the
 * "product photo" we displayed was that parking page's banner.
 *
 * Classifies, never guesses a replacement:
 *   PRODUCT   the page is that product (JSON-LD Product / og:type product /
 *             an add-to-cart form) — the only class that may be published
 *   GROUP     a /products/ URL that is really a multi-SKU picker: it answers
 *             200 and has add-to-cart markup, but sells 6-24 separate weights
 *             from one page, so the feed's price belongs to none of them
 *             (Titan listed elite plates at $449.99 against a real basket of
 *             $2,059.86)
 *   LISTING   a collection, category or search page
 *   HOME      redirects to the site root
 *   DEAD      404, gone, or a canonical pointing at /404
 *   PARKED    the domain is for sale
 *   BLOCKED   we could not read it (Amazon, hard 403) — reported, not judged
 *
 *   node scripts/check-links.mjs                    # audit everything
 *   node scripts/check-links.mjs --only nike-dri-fit
 *   node scripts/check-links.mjs --published        # only what the site serves
 */
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readCatalog } from './catalog-io.js';

const run = promisify(execFile);
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OPT = {
  only: (val('--only', '') || '').split(',').filter(Boolean),
  limit: Number(val('--limit', 0)),
  published: argv.includes('--published'),
  json: val('--json', ''),
  delay: Number(val('--delay', 800)),
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

const PARKED = /hugedomains|afternic|sedoparking|dan\.com|domain( name)? is for sale|buy this domain|parkingcrew|bodis\.com/i;

/* A bot wall is not a dead product. Rogue sits behind Cloudflare, which answers
   403 to one client and a 404-shaped challenge page to another — and the
   challenge's title made this checker call 26 live products DEAD, including
   the R-3 and RM-6 the whole rack ranking is anchored on. Shelving those would
   have been the most expensive false positive in the catalog. */
const CHALLENGE =
  /just a moment|attention required|cf-browser-verification|checking your browser|enable javascript and cookies|__cf_chl|请稍候|verify you are human|ddos protection by/i;
const NOT_FOUND = /404|page not found|not found|no longer available|gone/i;
/* Path shapes that are a list of products rather than one product. Nike's /w/
   and adidas' bare category paths are the ones that slipped through. */
const LISTING_PATH =
  /\/(collections|collection|category|categories|shop|browse|search|w|c)\/|\/(mens|womens)-[a-z-]+$|-shorts$|-bras$|-shoes$/i;

function classifyHtml(html, finalUrl, requestedUrl) {
  /* Checked before everything else: a challenge page can carry any status code
     and any title, so reading further only produces a confident wrong answer. */
  if (CHALLENGE.test(html)) return { cls: 'BLOCKED', note: 'bot challenge page — the link is unreadable, not dead' };
  if (PARKED.test(html)) return { cls: 'PARKED' };

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || '';
  const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html)?.[1] || '';
  if (/\/404(\b|\/|$)/.test(canonical) || NOT_FOUND.test(title))
    return { cls: 'DEAD', note: title.slice(0, 60) || canonical };

  /* Where the page says it lives. When Chrome renders the page we never see
     the redirect chain, so the canonical (or og:url) IS the evidence: a
     lululemon product URL that answers with the homepage says canonical "/".
     That is the "it sent me to their home page" case. */
  const ogUrl = /property=["']og:url["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] || '';
  const effective = canonical || ogUrl || finalUrl || requestedUrl;
  const path = (() => {
    try {
      return new URL(effective).pathname;
    } catch {
      return '';
    }
  })();
  if (path === '/' || path === '') return { cls: 'HOME', note: `lands on ${effective || 'the site root'}` };

  /* Does the page describe ONE product? */
  const hasProductLd = /"@type"\s*:\s*"?\[?[^]]*Product/i.test(html);
  const ogProduct = /property=["']og:type["'][^>]+content=["']product/i.test(html);
  const hasCart = /(add.to.cart|addtocart|product-form|ProductForm|data-product-id|id=["']AddToCart)/i.test(html);
  const productLinks = (html.match(/\/products\/[a-z0-9-]+/gi) || []).length;

  if (LISTING_PATH.test(path) && !/\/products?\//.test(path))
    return { cls: 'LISTING', note: `path ${path}` };

  /* A picker page: many buyable SKUs behind one URL, where the feed's price
     belongs to none of them (Titan listed elite plates at $449.99 against a
     real basket of $2,059.86). The giveaway is the "add all selections"
     control. Counting prices or cart buttons does NOT work — a normal product
     page with a recommended-accessories grid trips that, and it wrongly
     condemned the REP Arcadia and the Bells cable tower. */
  if (/add all selections|add all to cart|add selected to cart/i.test(html))
    return { cls: 'GROUP', note: 'sells several SKUs from one page ("add all selections")' };
  if (hasProductLd || ogProduct || hasCart) return { cls: 'PRODUCT' };
  /* No product signal and a page full of product links = a listing. */
  if (productLinks > 8) return { cls: 'LISTING', note: `${productLinks} product links, no product markup` };
  return { cls: 'UNKNOWN', note: title.slice(0, 60) };
}

async function readPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(OPT.timeout),
    });
    const html = await res.text();
    if ((res.status === 404 || res.status === 410) && !CHALLENGE.test(html))
      return { cls: 'DEAD', note: `http-${res.status}` };
    /* Bot walls answer 400/403/429 to a plain fetch and serve the real page to
       a browser, so those are a reason to try Chrome, not a verdict. */
    if (!res.ok) throw new Error(`http-${res.status}`);
    return { ...classifyHtml(html, res.url, url), finalUrl: res.url };
  } catch {
    /* Plain fetch fails on a few retailers' TLS/redirect setups where Chrome
       is fine (Titan was one), so fall back rather than call it blocked. */
    try {
      const { stdout } = await run(
        CHROME,
        [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--ignore-certificate-errors',
          `--user-agent=${UA}`, '--virtual-time-budget=10000', '--dump-dom', url,
        ],
        { maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
      );
      return { ...classifyHtml(stdout, url, url), via: 'chrome' };
    } catch (e) {
      return { cls: 'BLOCKED', note: String(e.message || e).slice(0, 50) };
    }
  }
}

/* ── run ──────────────────────────────────────────────────────────────── */
const src = fs.readFileSync(OPT.catalog, 'utf8');
const at = src.indexOf('const IMGS');
let depth = 0;
let end = -1;
for (let i = src.indexOf('{', at); i < src.length; i++) {
  const c = src[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const imgs = new Map(
  [...src.slice(at, end).matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]),
);

let rows = readCatalog(OPT.catalog).rows;
if (OPT.published) rows = rows.filter((r) => imgs.has(r.id));
if (OPT.only.length) rows = rows.filter((r) => OPT.only.includes(r.id));
if (OPT.limit) rows = rows.slice(0, OPT.limit);

const results = [];
const lastHit = new Map();
for (const row of rows) {
  const host = hostOf(row.url);
  const since = Date.now() - (lastHit.get(host) || 0);
  if (since < OPT.delay) await sleep(OPT.delay - since);
  lastHit.set(host, Date.now());

  const verdict = await readPage(row.url);

  /* An image served from a domain unrelated to the retailer is a tell: the
     better-bodies row displayed HugeDomains' own parking banner. */
  const img = imgs.get(row.id) || null;
  const imgHost = img ? hostOf(img) : null;
  const foreignImage =
    img && PARKED.test(img) ? 'image comes from a domain-parking page' : null;

  results.push({ id: row.id, host, url: row.url, image: img, imgHost, ...verdict, foreignImage });
  console.log(
    `${verdict.cls.padEnd(8)} ${row.id.padEnd(24)} ${verdict.note || verdict.finalUrl || ''}${foreignImage ? '  [' + foreignImage + ']' : ''}`,
  );
}

/* A retailer does not delete its entire range overnight. When every row we
   hold on a host comes back dead, the host is blocking us, not closing down —
   Rogue answers a bot challenge here and a bare 404 from CI's datacenter IPs,
   which would have condemned all 26 of its products including the R-3 and
   RM-6 the rack ranking is anchored on. Needs at least three rows on the host
   before the pattern means anything. */
const byHost = new Map();
for (const r of results) {
  if (!byHost.has(r.host)) byHost.set(r.host, []);
  byHost.get(r.host).push(r);
}
for (const [host, rows] of byHost) {
  if (rows.length < 3) continue;
  if (!rows.every((r) => r.cls === 'DEAD')) continue;
  for (const r of rows) {
    r.cls = 'BLOCKED';
    r.note = `every one of ${rows.length} rows on ${host} read as dead — treating it as a block, not ${rows.length} deletions`;
  }
  console.log(`
[reclassified] ${host}: ${rows.length} rows DEAD -> BLOCKED (whole-host pattern)`);
}

const counts = {};
for (const r of results) counts[r.cls] = (counts[r.cls] || 0) + 1;
console.log('\n── summary ──────────────────────────────────────────────');
console.log(`checked ${results.length} links`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(9)} ${v}`);

const broken = results.filter((r) => ['LISTING', 'HOME', 'DEAD', 'PARKED', 'GROUP'].includes(r.cls));
if (broken.length) {
  console.log(`\n${broken.length} link(s) do not go to a product page:`);
  for (const r of broken) console.log(`  ${r.cls.padEnd(8)} ${r.id.padEnd(24)} ${r.url}`);
}
if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));

/* A run that reads nothing is broken, not clean. */
if (results.length && results.every((r) => r.cls === 'BLOCKED')) {
  console.error('\nFAILED: every link was unreadable — treat as a broken run.');
  process.exit(1);
}
