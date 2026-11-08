/* Reading a store listing: shared by the daily report (check-prices.js) and
 * the live feed (watch-deals.js). Only ever reports what it actually read.
 */
const UA =
  'GymGearCompareBot/1.0 (+https://gymgearcompare.com; price accuracy check; contact starcrock7@gmail.com)';
let TIMEOUT = 15000;
export const setReadTimeout = (ms) => { TIMEOUT = ms; };
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '(bad url)'; } };

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
        signal: AbortSignal.timeout(TIMEOUT),
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
/* Shop currency, straight from Shopify. The catalog is in USD; Bells of Steel
   is Calgary-based and quotes CAD, so reading the bare number turned a
   CAD 159.99 bench into "$159.99" — a 51% discount that does not exist. */
const currencyCache = new Map();
async function shopCurrency(origin) {
  if (!currencyCache.has(origin)) {
    let cur = null;
    try {
      const r = await fetch(`${origin}/meta.json`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (r.ok) cur = (await r.json()).currency || null;
    } catch { /* unknown currency is handled by the caller */ }
    currencyCache.set(origin, cur);
  }
  return currencyCache.get(origin);
}

/* The currency a specific market page declares in its structured data. */
async function marketCurrency(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = /"priceCurrency"\s*:\s*"([A-Z]{3})"/.exec(html);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function fromShopify(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^(.*\/products\/[^/]+)/);
  if (!m) return null;
  const res = await fetch(`${u.origin}${m[1]}.js`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
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
  /* A ?variant=<id> on the catalog URL is the row saying which one it priced,
     so the listing is no longer ambiguous — read that variant and only it. */
  const wanted = u.searchParams.get('variant');
  const pinned = wanted ? variants.find((x) => String(x.id) === wanted) : null;
  if (wanted && !pinned)
    return { error: 'variant-gone', note: `URL pins variant ${wanted}; the listing no longer offers it` };
  const distinct = [...new Set(variants.map((x) => x.price))];
  if (!pinned && distinct.length > 1) {
    return {
      error: 'ambiguous-variants',
      note: `${distinct.length} variant prices ($${Math.min(...distinct) / 100}–$${Math.max(...distinct) / 100}) — catalog row does not say which (pin one with ?variant=<id>)`,
    };
  }
  let cur = await shopCurrency(u.origin);
  /* A Shopify store can run several markets from one domain, and /meta.json
     answers for the PRIMARY one. Rehband's shop reports EUR from Cyprus while
     its /en-us market genuinely sells in dollars — reading the shop-level
     currency alone would have shelved a perfectly good row as unreadable. When
     the URL carries a market segment, let the page's own JSON-LD settle it. */
  const market = /^\/([a-z]{2}-[a-z]{2})\//i.exec(u.pathname);
  if (market && cur !== 'USD') {
    const declared = await marketCurrency(`${u.origin}${u.pathname}`);
    if (declared) cur = declared;
  }
  if (cur && cur !== 'USD')
    return { error: `currency-${cur}`, note: `shop quotes ${cur}; the catalog is USD` };
  if (!cur) return { error: 'currency-unknown', note: 'could not confirm the shop trades in USD' };

  const v = pinned || variants.find((x) => x.available) || variants[0];
  return {
    current: num(v.price / 100),
    list: num(v.compare_at_price ? v.compare_at_price / 100 : null),
    available: (pinned ? v.available : j.available ?? v.available) ?? null,
    /* compare_at_price is authoritative: null genuinely means "no sale", so a
       sale ending can be believed from this source. */
    canSeeList: true,
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
        const cur = o.priceCurrency || node.priceCurrency;
        if (cur && String(cur).toUpperCase() !== 'USD')
          return { error: `currency-${String(cur).toUpperCase()}`, note: 'catalog is USD' };
        return {
          current,
          list: num(o.highPrice) && num(o.highPrice) > current ? num(o.highPrice) : null,
          available: o.availability ? !/OutOfStock|SoldOut|Discontinued/i.test(o.availability) : null,
          validUntil: typeof o.priceValidUntil === 'string' ? o.priceValidUntil.slice(0, 10) : null,
          /* Structured data carries the selling price and rarely the struck-out
             one. Not seeing a compare-at here is not evidence there isn't one —
             Schwinn's IC4 shows "$899 was $999" on the page while its markup
             exposes only 899. Believing that would have deleted a live deal. */
          canSeeList: false,
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

export async function readListing(url) {
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
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { error: `http-${res.status}` };
    html = await res.text();
  } catch (e) {
    return { error: 'fetch-failed', note: String(e.message || e).slice(0, 80) };
  }
  return fromJsonLd(html) || fromMeta(html) || { error: 'no-price-markup' };
}

/* A page's text, or null. Honours robots.txt. */
export async function readPage(url) {
  try {
    if (!(await robotsAllows(url)).allowed) return null;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/* Every selling price the product page itself states, from its structured data
   and meta tags: the second, independent read. A different URL and parser from
   the Shopify feed. Empty when the page states none. */
export async function pagePrices(url) {
  const html = await readPage(url);
  if (!html) return [];
  const prices = [];
  for (const b of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
      if ([].concat(node['@type'] || []).some((t) => /offer/i.test(String(t)))) {
        for (const v of [node.price, node.lowPrice]) if (num(v)) prices.push(num(v));
      }
    }
  }
  for (const m of html.matchAll(/<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["'][^>]+content=["']([^"']+)/gi))
    if (num(m[1])) prices.push(num(m[1]));
  return prices;
}
