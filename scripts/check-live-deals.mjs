/* Self-check for the live deal rules. No network.  node scripts/check-live-deals.mjs */
import assert from 'node:assert/strict';
import { applyFeed, decideItem, findPromoEnd, MAX_AGE_MS } from '../live-deals.js';

const now = '2026-11-08T12:00:00.000Z';
const feed = (o) => ({ current: 100, list: null, available: true, canSeeList: true, method: 'shopify-json', ...o });
const agrees = async () => [80, 100];
const never = async () => assert.fail('second read should not run');

// A new sale needs a second source that agrees.
let r = await decideItem(feed({ current: 80, list: 100 }), undefined, agrees, now);
assert.deepEqual(r.item, { price: 100, salePrice: 80, checkedAt: now });
r = await decideItem(feed({ current: 80, list: 100 }), undefined, async () => [95], now);
assert.equal(r.refused, 'second-read-disagrees');
r = await decideItem(feed({ current: 80, list: 100 }), undefined, async () => [], now);
assert.equal(r.refused, 'no-second-source');

// Nothing changed: no second read, just a fresh timestamp.
r = await decideItem(feed({ current: 80, list: 100 }), { price: 100, salePrice: 80 }, never, now);
assert.equal(r.item.salePrice, 80);

// A sale that ended is believed from the feed, once confirmed.
r = await decideItem(feed({ current: 100 }), { price: 100, salePrice: 80 }, agrees, now);
assert.equal(r.item.salePrice, null);

// Sources that cannot see a compare-at price never state anything.
r = await decideItem(feed({ method: 'json-ld', canSeeList: false }), { price: 100, salePrice: 80 }, never, now);
assert.equal(r.refused, 'cannot-confirm-json-ld');
assert.equal((await decideItem({ error: 'http-403' }, undefined, never, now)).refused, 'http-403');
assert.equal((await decideItem(feed({ current: 10, list: 100 }), undefined, agrees, now)).refused, 'implausible-discount');
assert.equal((await decideItem(feed({ available: false }), undefined, never, now)).item.soldOut, true);

// Sale banners: real wording seen on store homepages.
const today = new Date(now);
assert.equal(findPromoEnd('<p>SALE UP TO 30% OFF selected products. Biggest sale of the year! Sale Ends November 29.</p>', today), '2026-11-29');
assert.equal(findPromoEnd('Early Black Friday Sale! Save up to $1,200 + Free Shipping. Ends 11/14.', today), '2026-11-14');
assert.equal(findPromoEnd('Any rack = 10% off your cart When Through Mon, Nov 09 Code None', today), null); // one category, not a store sale
assert.equal(findPromoEnd('Black Friday: everything through Mon, Nov 30', today), '2026-11-30');
assert.equal(findPromoEnd('Rack November sale ends December 1, 11:59pm CT.', today), '2026-12-01');
assert.equal(findPromoEnd('Nielsen XAOC+Conv L52W period ending 12/28/2024, Creatine', today), null);
assert.equal(findPromoEnd('Rent: 1st month free, then $279/mo. No setup fee. Ends 11/30.', today), null);
assert.equal(findPromoEnd('Sale ends June 3', today), null); // too far off to trust

// Overlay.
const t = Date.parse(now);
const mk = () => ({ a: [{ id: 'x', price: 100, salePrice: 90, discount: 10 }, { id: 'y', price: 50, salePrice: 40, discount: 20 }, { id: 'z', price: 30 }] });
let cat = mk();
let gone = applyFeed(cat, { items: { x: { price: 120, salePrice: 60, checkedAt: now, storeSaleEnds: '2026-11-29' }, z: { soldOut: true, checkedAt: now } } }, t);
assert.deepEqual(cat.a[0], { id: 'x', price: 120, salePrice: 60, discount: 50, priceCheckedAt: now, storeSaleEnds: '2026-11-29' });
assert.deepEqual(cat.a[1], { id: 'y', price: 50 }, 'no confirmation, no sale claim');
assert.ok(gone.has('z'));
cat = mk();
applyFeed(cat, { items: { x: { price: 100, salePrice: 90, checkedAt: now } } }, t + MAX_AGE_MS + 1);
assert.equal(cat.a[0].salePrice, undefined, 'a stale confirmation expires');
cat = mk();
applyFeed(cat, { items: {} }, t);
assert.ok(cat.a.every((p) => !p.salePrice), 'no feed, no sale claims');
console.log('live deal rules OK');
