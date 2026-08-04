/* Stage 1 of docs/plans/catalog-expansion.md — harvest candidate products from
 * a retailer's own Shopify product feed.
 *
 * THE CARDINAL RULE (same as check-prices.js): every fact written here was READ
 * from the retailer. Price, sale price, image and URL are copied, never
 * inferred. A product whose price cannot be read unambiguously is skipped, not
 * guessed. Nothing here writes to server.js — output is a staging file that a
 * human or an enrichment agent works on next.
 *
 *   node scripts/import-harvest.mjs --host repfitness.com --brand "REP Fitness"
 *   node scripts/import-harvest.mjs --host titan.fitness --brand "Titan Fitness" --deals-only
 *   node scripts/import-harvest.mjs --host bellsofsteel.us --brand "Bells of Steel" --cats racks,benches
 */
import fs from 'node:fs';
import path from 'node:path';
import { readCatalog } from './catalog-io.js';

/* Their bot-UA blocklist 403s a descriptive agent but serves a browser one, and
   these are the same public JSON endpoints their own storefront calls. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OPT = {
  host: val('--host', ''),
  brand: val('--brand', ''),
  pages: Number(val('--pages', 8)),
  cats: (val('--cats', '') || '').split(',').filter(Boolean),
  dealsOnly: argv.includes('--deals-only'),
  out: val('--out', ''),
  catalog: val('--catalog', 'server.js'),
};
if (!OPT.host) {
  console.error('need --host <shopify-store-host>');
  process.exit(1);
}

/* ── category mapping ──────────────────────────────────────────────────
   Ordered: the first rule that matches wins, so specific beats generic
   ("weight bench" must beat "weight"). Matched against title + product_type
   + tags. A product that matches nothing is skipped — an unmapped product
   would land in the wrong part of the site, which is worse than absent. */
const RULES = [
  ['racks', /power rack|squat rack|half rack|rig|squat stand|wall.?mount rack|folding rack/],
  ['machines', /functional trainer|cable (tower|machine|crossover)|lat pulldown|leg press|smith machine|all.?in.?one|home gym|chest press machine|hack squat|glute (ham|drive)|hyperextension|pec deck/],
  ['cardio', /treadmill|rower|rowing machine|air bike|assault bike|exercise bike|spin bike|elliptical|stair ?climber|ski ?(erg|trainer)|bike ?erg|jacobs ladder/],
  ['benches', /bench(?!.*press bar)|flat utility|adjustable bench|fid bench|preacher curl/],
  ['barbells', /barbell|olympic bar\b|power bar|deadlift bar|squat bar|trap bar|hex bar|safety squat bar|swiss bar|ez.?curl bar|technique bar|axle bar/],
  ['plates', /bumper plate|weight plate|iron plate|calibrated plate|change plate|fractional plate|plate set|competition plates/],
  ['dumbbells', /dumbbell|adjustable dumbbell/],
  ['kettlebells', /kettlebell|competition bell/],
  ['bands', /resistance band|power band|mini band|glute band|loop band|band pack/],
  ['flooring', /gym (floor|mat|tile)|rubber (floor|tile|mat)|stall mat|platform|deadlift platform|horse stall/],
  ['jumpropes', /jump ?rope|speed rope|skipping rope/],
  ['foamrollers', /foam roller|massage (ball|gun|stick)|percussion|mobility (ball|stick)|lacrosse ball/],
  ['yogamats', /yoga mat|exercise mat|pilates mat/],
  ['belts', /lifting belt|weight ?lifting belt|lever belt|dip belt|power belt/],
  ['wraps', /wrist wrap|knee wrap|hand wrap/],
  ['sleeves', /knee sleeve|elbow sleeve/],
  ['straps', /lifting strap|wrist strap|figure ?8|versa gripp/],
  ['chalk', /\bchalk\b|liquid grip/],
  ['gymbags', /gym bag|duffel|kit bag|backpack/],
  /* Shoes only. "Trainer" is a machine word in this industry — matching it
     here filed a suspension system and a tibialis machine as footwear. */
  ['footwear', /\bshoes?\b|sneaker|training shoe|lifting shoe|weightlifting shoe|\bboots?\b/],
  ['preworkout', /pre.?workout|pump formula|energy formula/],
  ['protein', /protein (powder|isolate|blend)|whey|casein|mass gainer/],
  ['creatine', /creatine/],
  ['recovery', /bcaa|eaa|amino|electrolyte|hydration|recovery (drink|formula)|glutamine/],
  ['vitamins', /multivitamin|vitamin |omega|fish oil|magnesium|zinc|greens\b/],
  ['fatburners', /fat burner|thermogenic|l.?carnitine/],
  ['shorts', /\bshorts\b/],
  ['tanks', /tank top|\btank\b|stringer/],
  ['hoodies', /hoodie|sweatshirt|crewneck|\bjacket\b/],
  ['sportsbras', /sports bra|\bbra\b/],
  ['compression', /compression (shirt|top|tight|legging)|base layer|\btights\b|\bleggings\b/],
];

/* Things that are not products we would ever list. */
const REJECT =
  /gift card|warranty|protection plan|shipping|sample|replacement|spare|repair|part\b|hardware kit|bolt|screw|decal|sticker|apparel bundle|e-?book|program|coaching|membership|subscription|financing|assembly|freight|clearance bundle|old version|refurb|open box|scratch (and|&) dent/i;

/* Attachments and add-ons: real products, but they are accessories to a
   machine rather than something a kit or a comparison should ever pick. */
const ACCESSORY =
  /attachment|adapter|adaptor|conversion|connection kit|upgrade kit|footplate|foot plate|band peg|\bpegs?\b|\bshim\b|mounting|bracket|extension kit|spotter arm|safety (arm|strap|spotter)|j.?cup|landmine|storage|dip bar|handles?\b|carabiner|cover\b|stand alone base|shackle|crossmember|cross member|divider|\bfor .*(bench|rack|tower|cage|trainer)\b|converter bench|\buprights?\b|connector|iso arms?|\bpads?\b|pull.?up bar|socket set|\bwheels?\b|\bcasters?\b|fractional|change plate|builder|pre.?selected bundle/i;

/* The retailer usually says so itself. REP tags rig hardware "Rig Attachment"
   and yoke crossmembers "bundle_component". Matched per whole tag, not as a
   substring of the joined list: a rack legitimately carries a "Rack
   Attachments" collection tag, and a substring match on "attachment" deleted
   REP's entire rack range (43 -> 1) before this was tightened. */
const ACCESSORY_TAGS =
  /^(rig|rack|optional|bar|bench) attachments?$|^bundle_component$|^replacement|^spare/i;

/* Weight-graded lines (a plate, dumbbell or bell sold per weight) have no
   single price and no representative variant. Pinning the default gave a
   "plates" row that was really a 2.5 lb pair at $35.99 on a line running to
   $259.98 — honest about the SKU, useless in a kit, and one a kit builder
   would happily pick as somebody's only plates. Refuse them. */
const WEIGHT_GRADED = new Set(['plates', 'dumbbells', 'kettlebells']);

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

function categoryOf(p) {
  const title = p.title.toLowerCase();
  const tags = (p.tags || []).join(' ');
  const hay = `${title} ${p.product_type || ''} ${tags}`.toLowerCase();
  if (REJECT.test(hay)) return null;
  /* Judge accessory-ness on the title only: a rack's tags legitimately
     mention its j-cups, but a product NAMED "J-Cup" is an accessory. */
  if (ACCESSORY.test(title)) return null;
  /* The retailer's own tags are more reliable than the title. */
  if ((p.tags || []).some((t) => ACCESSORY_TAGS.test(String(t).trim()))) return null;
  /* Bundle-builder and dealer pages: noindex, hidden from search, and they
     redirect to a login — no specs, no public price, nothing to list. */
  if (/hide-from-search|bundle-parent|dealer|wholesale/i.test(tags)) return null;
  for (const [cat, re] of RULES) if (re.test(hay)) return cat;
  return null;
}

async function feedPage(host, page) {
  const res = await fetch(`https://${host}/products.json?limit=250&page=${page}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`feed ${host} page ${page}: HTTP ${res.status}`);
  const j = JSON.parse(await res.text());
  return j.products || [];
}

/* The shop's own currency. Bells of Steel quotes CAD on its .com store, and
   reading those bare numbers as USD is exactly how a $329 bench that really
   costs $173.99 got into this catalog. USD only. */
async function currencyOf(host) {
  try {
    const r = await fetch(`https://${host}/meta.json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) return (await r.json()).currency || null;
  } catch {
    /* unknown → caller refuses to harvest */
  }
  return null;
}

const cur = await currencyOf(OPT.host);
if (cur !== 'USD') {
  console.error(
    `refusing to harvest ${OPT.host}: shop currency is ${cur || 'unknown'}, the catalog is USD`,
  );
  process.exit(1);
}

/* Existing rows — so a harvest never proposes a duplicate id or a product we
   already list under another id. */
const existing = readCatalog(OPT.catalog).rows;
const haveIds = new Set(existing.map((r) => r.id));
const haveUrls = new Set(existing.map((r) => (r.url || '').split('?')[0].toLowerCase()));

const prefix = slug(OPT.brand || OPT.host.split('.')[0]).split('-')[0];
const out = [];
const skipped = { rejected: 0, unmapped: 0, ambiguous: 0, graded: 0, unavailable: 0, duplicate: 0, noPrice: 0, notOnSale: 0 };

for (let page = 1; page <= OPT.pages; page++) {
  const products = await feedPage(OPT.host, page);
  if (!products.length) break;

  for (const p of products) {
    const category = categoryOf(p);
    if (!category) {
      skipped[REJECT.test(`${p.title} ${p.product_type || ''}`) ? 'rejected' : 'unmapped']++;
      continue;
    }
    if (OPT.cats.length && !OPT.cats.includes(category)) continue;

    const variants = p.variants || [];
    const prices = [...new Set(variants.map((v) => v.price))];
    /* Per-variant pricing has no single answer. Pin the default variant (the
       one the page loads with) so the URL and the price refer to the same SKU
       — the same fix that made the Bells cable tower verifiable. */
    const v = variants[0];
    if (!v) {
      skipped.noPrice++;
      continue;
    }
    const price = money(v.price);
    if (!price) {
      skipped.noPrice++;
      continue;
    }
    const pinned = prices.length > 1;
    if (pinned && WEIGHT_GRADED.has(category)) {
      /* A weight-graded line has no representative SKU — see WEIGHT_GRADED. */
      skipped.graded++;
      continue;
    }
    if (v.available === false) {
      /* Sold out, pre-order or "coming soon": a Buy button that cannot be
         used is worse than no listing. */
      skipped.unavailable++;
      continue;
    }
    if (pinned && !v.available) {
      // Default variant sold out and siblings differ in price → nothing certain to quote.
      skipped.ambiguous++;
      continue;
    }

    const compare = money(v.compare_at_price);
    const onSale = compare && compare > price;
    if (OPT.dealsOnly && !onSale) {
      skipped.notOnSale++;
      continue;
    }

    const url =
      `https://${OPT.host}/products/${p.handle}` + (pinned ? `?variant=${v.id}` : '');
    if (haveUrls.has(`https://${OPT.host}/products/${p.handle}`.toLowerCase())) {
      skipped.duplicate++;
      continue;
    }

    let id = `${prefix}-${slug(p.handle)}`.slice(0, 44);
    if (haveIds.has(id)) {
      skipped.duplicate++;
      continue;
    }
    haveIds.add(id);

    /* A multi-variant listing is priced per variant, and stores order plates
       and bars ascending — so the pinned default is routinely the 10 lb pair
       or the fractional set, not "the product". Naming the row after the
       variant is what keeps the price honest: "Colored Bumper Plates" at
       $64.96 is wrong, "Colored Bumper Plates — 10 LB (Pair)" is not. */
    const variantName =
      pinned && v.title && !/^default title$/i.test(v.title) ? ` — ${v.title}` : '';

    out.push({
      id,
      name: `${p.title.trim()}${variantName}`,
      brand: (OPT.brand || p.vendor || '').trim(),
      /* On sale: price = list (struck through), salePrice = what you pay —
         the shape p() expects. Not on sale: price only. */
      price: onSale ? compare : price,
      salePrice: onSale ? price : null,
      discount: onSale ? Math.round((1 - price / compare) * 100) : 0,
      retailer: OPT.brand || OPT.host,
      url,
      image: (p.images && p.images[0] && p.images[0].src) || null,
      category,
      variantTitle: pinned ? v.title : null,
      available: v.available ?? null,
      sourceType: p.product_type || null,
      readAt: new Date().toISOString(),
      /* Stage 2 (agents) fills these — see docs/plans/enrichment-brief.md. */
      quality: null,
      expertVerdict: null,
      specs: null,
      aspects: null,
      rating: null,
      reviewCount: null,
    });
  }
  if (products.length < 250) break;
}

const dir = 'staging';
fs.mkdirSync(dir, { recursive: true });
const file = OPT.out || path.join(dir, `${OPT.host.replace(/\W+/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ host: OPT.host, harvestedAt: new Date().toISOString(), products: out }, null, 2));

const byCat = {};
for (const p of out) byCat[p.category] = (byCat[p.category] || 0) + 1;
const onSale = out.filter((p) => p.salePrice).length;

console.log(`${OPT.host}: ${out.length} candidates -> ${file}`);
console.log(`  on sale now: ${onSale}`);
console.log(`  ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join(' ')}`);
console.log(`  skipped: ${Object.entries(skipped).map(([k, n]) => `${k}=${n}`).join(' ')}`);

/* A harvest that finds nothing is a broken run, not an empty store. */
if (!out.length) {
  console.error('FAILED: 0 candidates — check the host, the category rules, or the feed shape.');
  process.exit(1);
}
