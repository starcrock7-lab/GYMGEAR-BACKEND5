/* Last-resort image capture for pages nothing else can read.
 *
 * check-images works off the page's own markup. Some retailers render
 * everything client-side, or sit behind a TLS/redirect setup plain fetch
 * cannot follow, so they come back NO_IMAGE. This renders the page in headless
 * Chrome and takes the product's own photo out of the rendered DOM, then
 * DOWNLOADS it into the frontend's public/product-images/ so the site serves
 * the file itself instead of hotlinking someone's CDN.
 *
 * THE CARDINAL RULE still holds: the image must be that product's own photo
 * from its own page. This never invents one, and it refuses a page that turns
 * out to be dead — a 404 needs a new URL, not a picture.
 *
 *   node scripts/capture-images.mjs --from report.json         # dry run
 *   node scripts/capture-images.mjs --only titan-ab --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readCatalog } from './catalog-io.js';

const run = promisify(execFile);
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* The frontend serves these; a path here resolves against our own domain. */
const OUT_DIR =
  process.env.IMAGE_DIR ||
  'C:/Users/nirka/Documents/gymgear-frontend-final/public/product-images';
const PUBLIC_PREFIX = '/product-images';

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OPT = {
  write: argv.includes('--write'),
  from: val('--from', ''),
  only: (val('--only', '') || '').split(',').filter(Boolean),
  catalog: val('--catalog', 'server.js'),
  json: val('--json', ''),
};

/* Render the page. --ignore-certificate-errors is required in this
   environment: without it Chrome served a "Privacy error" interstitial and the
   dump contained no product at all. */
async function renderDom(url) {
  const { stdout } = await run(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--ignore-certificate-errors',
      '--hide-scrollbars',
      `--user-agent=${UA}`,
      '--virtual-time-budget=12000',
      '--dump-dom',
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: 90000 },
  );
  return stdout;
}

/* A row whose URL is a collection or category page has no single product on
   it, so nothing captured from it can be right — adidas returned a BACKPACK
   for a sports-bra row, gymshark a different bra model. Those rows need a real
   product URL, not a picture. */
const LISTING_URL = /\/(collections|category|categories|shop|c)\/[^/]+\/?$|-sports-bras|\/womens-|\/mens-[a-z-]+s$/i;

const DEAD = /404|not found|page (is )?(unavailable|missing)|no longer available/i;
/* A page can serve HTTP 200 and still be an error page — hydrow's rendered
   DOM was fine except its biggest image was literally error-404.jpg. */
const DEAD_ASSET = /(^|\/)(error|404)[-_.][^"']*\.(jpe?g|png|webp)/i;
function isDead(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html)?.[1] || '';
  if (/\/404(\b|\/|$)/.test(canonical)) return `canonical points at ${canonical}`;
  if (DEAD.test(title)) return `title says "${title.trim().slice(0, 60)}"`;
  if (DEAD_ASSET.test(html)) return 'page serves a 404 asset';
  return null;
}

/* Site furniture, not products. */
const JUNK =
  /favicon|logo|sprite|icon|placeholder|banner|hero|badge|payment|visa|mastercard|paypal|klarna|affirm|flag|avatar|review|star|trustpilot|social|share|error|404|oops/i;

/* Every image the page offers, widest first. srcset carries the real
   resolutions, so it beats a src attribute that may be a thumbnail. */
function imageCandidates(html) {
  const out = new Map(); // url -> width
  const add = (u, w) => {
    if (!u) return;
    let url = u.trim().replace(/&amp;/g, '&');
    if (!/^https?:\/\//.test(url)) return;
    if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return;
    if (JUNK.test(url)) return;
    const bare = url.split('?')[0];
    const prev = out.get(bare) || 0;
    out.set(bare, Math.max(prev, w || 0, Number(/[?&]width=(\d+)/.exec(url)?.[1] || 0)));
  };

  for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi))
    for (const part of m[1].split(','))
      add(part.trim().split(/\s+/)[0], Number(/(\d+)w/.exec(part)?.[1] || 0));
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1], 0);
  for (const m of html.matchAll(/property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi))
    add(m[1], 0);

  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

/* Prefer an image whose filename shares words with the product handle — on a
   page full of "you may also like", the first image is often a neighbour. */
function pickImage(candidates, url, name) {
  const handle = (url.split('/products/')[1] || '').split('?')[0].toLowerCase();
  const words = new Set(
    [...handle.split('-'), ...name.toLowerCase().split(/[^a-z0-9]+/)].filter((w) => w.length > 3),
  );
  let best = null;
  let bestScore = -1;
  let bestMatched = false;
  for (const [u, w] of candidates) {
    const file = u.split('/').pop().toLowerCase();
    let score = Math.min(w, 2000) / 2000; // resolution, capped
    let matched = false;
    for (const word of words)
      if (file.includes(word)) { score += 1; matched = true; }
    if (score > bestScore) {
      bestScore = score;
      bestMatched = matched;
      best = { url: u, width: w };
    }
  }
  /* No filename token in common with the product means we are guessing from a
     page full of images — inov-8 handed back a campaign banner for a different
     model that way. Report it instead of writing it. */
  if (best && !bestMatched) best.unmatched = true;
  return best;
}

/* Enough of a JPEG/PNG/WebP header to know it is a real photo, not a 1x1 or an
   error page with an image content-type. */
function dimensions(buf) {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG')
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { w: 0, h: 0 }; // dimensions vary by chunk type; size check covers it
  return { w: 0, h: 0 };
}

async function download(url, id) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`image http-${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error(`not an image (${type})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error(`too small (${buf.length} bytes)`);
  const { w, h } = dimensions(buf);
  if (w && (w < 400 || h < 400)) throw new Error(`too small (${w}x${h})`);
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${id}.${ext}`), buf);
  return { file: `${PUBLIC_PREFIX}/${id}.${ext}`, bytes: buf.length, w, h };
}

/* ── run ──────────────────────────────────────────────────────────────── */
const rows = readCatalog(OPT.catalog).rows;
const byId = new Map(rows.map((r) => [r.id, r]));

let targets;
if (OPT.only.length) targets = OPT.only;
else if (OPT.from) {
  const rep = JSON.parse(fs.readFileSync(OPT.from, 'utf8')).results;
  targets = rep.filter((r) => r.cls === 'NO_IMAGE' && !/amazon/.test(r.host)).map((r) => r.id);
} else {
  console.error('need --from <report.json> or --only <ids>');
  process.exit(1);
}

const results = [];
for (const id of targets) {
  const row = byId.get(id);
  if (!row) {
    console.log(`SKIP        ${id} (not in catalog)`);
    continue;
  }
  if (LISTING_URL.test(row.url) && !/\/products?\//.test(row.url)) {
    console.log(`LISTING_URL ${id} ${row.url}`);
    results.push({ id, cls: 'LISTING_URL', url: row.url });
    continue;
  }
  let html;
  try {
    html = await renderDom(row.url);
  } catch (e) {
    console.log(`RENDER_FAIL ${id} ${String(e.message).slice(0, 50)}`);
    results.push({ id, cls: 'RENDER_FAIL', note: String(e.message).slice(0, 80) });
    continue;
  }
  const dead = isDead(html);
  if (dead) {
    console.log(`DEAD_URL    ${id} ${dead}`);
    results.push({ id, cls: 'DEAD_URL', note: dead, url: row.url });
    continue;
  }
  const pick = pickImage(imageCandidates(html), row.url, row.name);
  if (!pick) {
    console.log(`NO_CANDIDATE ${id}`);
    results.push({ id, cls: 'NO_CANDIDATE', url: row.url });
    continue;
  }
  if (pick.unmatched) {
    console.log(`NEEDS_EYES  ${id} best guess ${pick.url.split('/').pop().slice(0, 44)}`);
    results.push({ id, cls: 'NEEDS_EYES', source: pick.url, url: row.url });
    continue;
  }
  try {
    const saved = await download(pick.url, id);
    console.log(`CAPTURED    ${id} ${saved.w}x${saved.h} ${(saved.bytes / 1024) | 0}KB  <- ${pick.url.split('/').pop().slice(0, 40)}`);
    results.push({ id, cls: 'CAPTURED', source: pick.url, ...saved });
  } catch (e) {
    console.log(`BAD_IMAGE   ${id} ${String(e.message).slice(0, 50)}`);
    results.push({ id, cls: 'BAD_IMAGE', note: String(e.message).slice(0, 80), source: pick.url });
  }
}

const counts = {};
for (const r of results) counts[r.cls] = (counts[r.cls] || 0) + 1;
console.log('\n── summary ──────────────────────────────────────────────');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(13)} ${v}`);
if (OPT.json) fs.writeFileSync(OPT.json, JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));

const captured = results.filter((r) => r.cls === 'CAPTURED');
if (OPT.write && captured.length) {
  let src = fs.readFileSync(OPT.catalog, 'utf8');
  const at = src.indexOf('const IMGS');
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const adds = captured.map((r) => `  '${r.id}': '${r.file}',\n`).join('');
  src = src.slice(0, end) + adds + src.slice(end);
  fs.writeFileSync(OPT.catalog, src);
  console.log(`\nwrote ${captured.length} image path(s) to ${OPT.catalog}; files in ${OUT_DIR}`);
} else if (captured.length) {
  console.log(`\n${captured.length} captured. Dry run: catalog not modified.`);
}
