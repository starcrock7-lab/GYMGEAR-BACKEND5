/* Try to rescue a row whose link no longer reaches its product.
 *
 * Most "dead" links are not dead — the retailer renamed the handle and serves
 * a redirect we never followed. Adopting the destination fixed 14 of 16 rows
 * in one pass.
 *
 * But adopting blindly is how you swap the product: legion-whey's redirect
 * landed on Legion's whey CONCENTRATE, a different item at a different price,
 * and a loose word-overlap check waved it through on "whey" and "protein".
 * So a proposal is only made when the destination page's title still carries
 * the row's DISTINCTIVE words — model numbers and names, not category nouns.
 *
 * Proposes; never writes. Review the table, then apply what you believe.
 *
 *   node scripts/resolve-links.mjs --only titan-ab,fringe-wonder
 *   node scripts/resolve-links.mjs --broken --json proposals.json
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
  only: (val('--only', '') || '').split(',').filter(Boolean),
  broken: argv.includes('--broken'),
  json: val('--json', ''),
  catalog: val('--catalog', 'server.js'),
};

/* Words too generic to prove identity — every gym page contains them. */
const GENERIC = new Set(
  ('the and for with your from best pro plus set kit pair gym home fitness training workout ' +
    'weight weights lifting strength equipment bar bars plate plates bench benches rack racks ' +
    'dumbbell dumbbells kettlebell kettlebells mat mats rope ropes protein powder supplement ' +
    'multivitamin creatine chalk belt belts wrap wraps strap straps roller rollers bag bags ' +
    'adjustable olympic cast iron steel rubber premium classic original series').split(' '),
);
const distinctive = (s) =>
  [...new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/))].filter(
    (w) => w.length > 2 && !GENERIC.has(w),
  );

const src = fs.readFileSync(OPT.catalog, 'utf8');
const setOf = (n) => {
  const a = src.indexOf(`const ${n} = new Set([`);
  if (a < 0) return new Set();
  return new Set([...src.slice(a, src.indexOf(']);', a)).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
};

let rows = readCatalog(OPT.catalog).rows;
if (OPT.broken) {
  const bad = setOf('BAD_LINK_IDS');
  rows = rows.filter((r) => bad.has(r.id) && !/amazon\./.test(r.url));
}
if (OPT.only.length) rows = rows.filter((r) => OPT.only.includes(r.id));

const proposals = [];
for (const row of rows) {
  let res;
  try {
    res = await fetch(row.url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    console.log(`unreachable  ${row.id}`);
    continue;
  }
  const html = await res.text().catch(() => '');
  const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const canonical = (/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html) || [])[1] || '';
  const finalUrl = canonical || res.url;

  /* Brand words are excluded from the evidence: every page on a retailer's
     site carries the brand in its title, so "ghost" matching on
     ghostlifestyle.com's HOME PAGE looked like a hit. The proof has to come
     from the product's own words. */
  const brandWords = new Set(distinctive(row.brand));
  const want = distinctive(row.name).filter((w) => !brandWords.has(w));
  const got = distinctive(title);
  const hits = want.filter((w) => got.some((g) => g.includes(w) || w.includes(g)));
  const isProduct = /"@type"\s*:\s*"?\[?[^]]*Product|og:type["'][^>]+content=["']product|add.to.cart|product-form/i.test(html);

  const path = (() => { try { return new URL(finalUrl).pathname; } catch { return ''; } })();
  const verdict =
    !res.ok ? `http-${res.status}` :
    path === '/' || path === '' ? 'lands on the home page' :
    !isProduct ? 'not a product page' :
    hits.length === 0 ? 'DIFFERENT PRODUCT — title shares no distinctive word' :
    finalUrl.split('?')[0] === row.url.split('?')[0] ? 'same url, still unreadable' :
    'PROPOSE';

  console.log(`${verdict.padEnd(22)} ${row.id.padEnd(22)} ${title.slice(0, 44)}`);
  if (verdict === 'PROPOSE') {
    console.log(`    ${row.url}\n -> ${finalUrl}   [matched: ${hits.join(', ')}]`);
    proposals.push({ id: row.id, from: row.url, url: finalUrl, title, matched: hits });
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n${proposals.length} proposal(s) of ${rows.length} checked`);
if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify(proposals, null, 1));
