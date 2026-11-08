/* Live prices and sales, read from the stores by scripts/watch-deals.js and
 * overlaid on the catalog by server.js. No model and no guess ever produces a
 * value here: a fact is read from the store's own feed and confirmed by a
 * second read of its page, or it is not published.
 *
 * What protects the customer:
 *  - A sale is shown only while it has been confirmed recently. If the job
 *    stops, or a store blocks us, the claim disappears by itself.
 *  - Stores' machine-readable "priceValidUntil" is ignored. Measured November
 *    2026: Life Fitness, TRX and Element 26 all said "10 days from today" and
 *    DMoose said 2040. It is a template default, not a sale end.
 *  - An end date comes only from a store's own sale banner, and is worded as
 *    the store's sale, because a banner cannot say which items it covers.
 */

export const MAX_AGE_MS = 12 * 3600 * 1000;
const MAX_DISCOUNT = 0.75;
const PROMO_HORIZON_DAYS = 45;

const near = (a, b) => Math.abs(a - b) < 0.011;

/* One product's read turned into what gets published, or a named refusal.
   `prev` is the last published entry; `confirm` lazily reads the second source
   and is only used when something would change. */
export async function decideItem(seen, prev, confirm, nowIso) {
  if (seen.error) return { refused: seen.error };
  if (seen.available === false) return { item: { soldOut: true, checkedAt: nowIso } };
  /* Only the store feed can see the variant, the currency and the compare-at
     price together, so it is the only source allowed to state a sale. */
  if (seen.method !== 'shopify-json') return { refused: `cannot-confirm-${seen.method}` };

  const onSale = seen.list && seen.list > seen.current;
  if (onSale && 1 - seen.current / seen.list > MAX_DISCOUNT) return { refused: 'implausible-discount' };
  const item = onSale
    ? { price: seen.list, salePrice: seen.current, checkedAt: nowIso }
    : { price: seen.current, salePrice: null, checkedAt: nowIso };

  const same = prev && !prev.soldOut && near(prev.price, item.price) && (prev.salePrice ?? null) === item.salePrice;
  if (same) return { item };

  const prices = await confirm();
  if (!prices.length) return { refused: 'no-second-source' };
  if (!prices.some((p) => near(p, seen.current))) return { refused: 'second-read-disagrees' };
  return { item };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const END =
  /\b(?:ends?|ending|through|thru)\b[\s,:]*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[\s,]+)?(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})|(\d{1,2})\/(\d{1,2}))(?![\d/])/gi;
const SALE_WORDS = /\b(sale|black friday|cyber monday)\b/i;

/* The end of a store-wide sale, from the words on the store's own homepage.
   It must sit next to the word "sale" (or Black Friday / Cyber Monday) and fall
   soon. That rejects "period ending 12/28" in a footnote and a single-category
   offer like "any rack = 10% off, through Nov 9", which says nothing about the
   store's other sale items. Returns YYYY-MM-DD or null. */
export function findPromoEnd(html, now = new Date()) {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ');
  for (const m of text.matchAll(END)) {
    if (!SALE_WORDS.test(text.slice(Math.max(0, m.index - 90), m.index + m[0].length))) continue;
    const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : Number(m[3]) - 1;
    const day = Number(m[2] ?? m[4]);
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    let when = Date.UTC(now.getUTCFullYear(), month, day);
    if (when < now.getTime() - 86400000) when = Date.UTC(now.getUTCFullYear() + 1, month, day);
    if (when - now.getTime() > PROMO_HORIZON_DAYS * 86400000) continue;
    return new Date(when).toISOString().slice(0, 10);
  }
  return null;
}

/* Overlay a feed on the published products, in place. Returns the ids the
   stores report as sold out. Anything without a recent confirmation loses its
   sale claim and keeps its list price. */
export function applyFeed(productsByCat, feed, now = Date.now()) {
  const soldOut = new Set();
  for (const list of Object.values(productsByCat)) {
    for (const p of list) {
      const it = feed?.items?.[p.id];
      const fresh = it && now - Date.parse(it.checkedAt) < MAX_AGE_MS;
      delete p.priceCheckedAt;
      delete p.storeSaleEnds;
      if (fresh && it.soldOut) {
        soldOut.add(p.id);
        continue;
      }
      if (fresh) {
        p.price = it.price;
        p.priceCheckedAt = it.checkedAt;
        if (it.storeSaleEnds) p.storeSaleEnds = it.storeSaleEnds;
      }
      if (fresh && it.salePrice) {
        p.salePrice = it.salePrice;
        p.discount = Math.round((1 - it.salePrice / it.price) * 100);
      } else {
        delete p.salePrice;
        delete p.discount;
        delete p.saleEndsAt;
      }
    }
  }
  return soldOut;
}
