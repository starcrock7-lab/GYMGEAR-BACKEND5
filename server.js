// GymGear Compare Pro — Optimized Backend v3
// Cost target: ~$0.05-0.10/day
// Savings vs v2:
//   - Haiku 4.5 instead of Sonnet (~20x cheaper)
//   - Prompt caching on system prompt (90% off repeated input)
//   - Only refresh categories that were actually visited
//   - Reviews fetched separately on demand, not in daily search
//   - Minimal JSON schema (removes ~40% of prompt tokens)
//   - Comparison summaries are local math (0 tokens)
//   - 2s delay between searches to avoid rate limit retries

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CACHE_FILE = '/tmp/gymgear_cache.json';
const VISIT_FILE = '/tmp/gymgear_visits.json';
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ── MODEL ─────────────────────────────────────────────────────
// Haiku 4.5: $1/$5 per MTok — 3x cheaper than Sonnet for same search quality
const SEARCH_MODEL = 'claude-haiku-4-5-20251001';

// ── ALLOWED ORIGINS ───────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean)
  .concat([
    'https://gymgear-frontend5.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ]);

// ── CATEGORY DEFINITIONS ──────────────────────────────────────
const CATEGORIES = {
  // Equipment
  benches:     { label:'weight benches',          group:'equipment', brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness,American Barbell' },
  barbells:    { label:'barbells',                group:'equipment', brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,American Barbell,Fringe Sport,Vulcan Strength' },
  dumbbells:   { label:'dumbbells',               group:'equipment', brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Ironmaster,Fringe Sport,Bowflex,Vulcan Strength' },
  plates:      { label:'weight plates',           group:'equipment', brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,Vulcan Strength,CAP Barbell' },
  racks:       { label:'squat racks and power racks', group:'equipment', brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness' },
  cardio:      { label:'cardio machines',         group:'equipment', brands:'Concept2,Assault Fitness,Rogue Fitness,NordicTrack,Peloton,SkiErg' },
  // Clothing
  shorts:      { label:'gym shorts',              group:'clothing',  brands:'Young LA,Gymshark,NOBULL,Alphalete,Nike,Adidas,Lululemon,Under Armour' },
  compression: { label:'compression leggings',   group:'clothing',  brands:'Young LA,Gymshark,Alphalete,Lululemon,Nike,Under Armour,Better Bodies' },
  hoodies:     { label:'gym hoodies',             group:'clothing',  brands:'Young LA,Gymshark,Alphalete,GASP,Better Bodies,Nike,Adidas' },
  footwear:    { label:'gym and lifting shoes',   group:'clothing',  brands:'NOBULL,Nike,Adidas,Reebok,New Balance,Converse,Inov-8' },
  // Supplements
  preworkout:  { label:'pre-workout supplements', group:'supplements', brands:'Ghost,Transparent Labs,Gorilla Mind,C4,Legion,Jym,Bucked Up,Alani Nu' },
  protein:     { label:'protein powder',          group:'supplements', brands:'Optimum Nutrition,Ghost,Transparent Labs,Dymatize,Jym,Legion,Thorne,Nutricost' },
  creatine:    { label:'creatine supplements',    group:'supplements', brands:'Transparent Labs,Optimum Nutrition,Thorne,Legion,Nutricost,Klean Athlete,Momentous' },
  recovery:    { label:'recovery supplements',    group:'supplements', brands:'Transparent Labs,Legion,Thorne,Klean Athlete,Momentous,Optimum Nutrition,Ghost' },
};

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS — origin allowlist, no secret key in frontend needed
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting
const ratemap = new Map();
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hits = (ratemap.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 40) return res.status(429).json({ error: 'Too many requests.' });
  hits.push(now);
  ratemap.set(ip, hits);
  next();
});

// Block non-allowed origins on /api routes
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.some(o => referer.startsWith(o));
  if (!ok) {
    console.warn(`Blocked: origin="${origin}" referer="${referer}"`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// ── CACHE ─────────────────────────────────────────────────────
let mem = null;

function readCache() {
  if (mem && Date.now() - mem.timestamp < CACHE_TTL) return mem;
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (Date.now() - c.timestamp > CACHE_TTL) return null;
    mem = c; return c;
  } catch { return null; }
}

function writeCache(data) {
  mem = data;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch (e) { console.error('Cache write:', e.message); }
}

// ── VISIT TRACKING ────────────────────────────────────────────
// Only refresh categories that users actually visit.
// Unvisited categories keep their old cache data.
let visits = {};

function loadVisits() {
  try {
    if (fs.existsSync(VISIT_FILE)) visits = JSON.parse(fs.readFileSync(VISIT_FILE, 'utf8'));
  } catch { visits = {}; }
}

function recordVisit(cat) {
  visits[cat] = (visits[cat] || 0) + 1;
  try { fs.writeFileSync(VISIT_FILE, JSON.stringify(visits)); } catch {}
}

function getVisitedCategories() {
  // Return cats visited at least once, sorted by visit count desc
  return Object.entries(visits)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);
}

// ── PROMPT CACHING SYSTEM PROMPT ──────────────────────────────
// This block is sent with cache_control so Anthropic caches it.
// On repeat calls within 5 min, this input is 90% cheaper.
const CACHED_SYSTEM = {
  type: 'text',
  text: `You are a product research assistant. When given a product category, search the web for real current products and return ONLY a valid JSON array. No markdown, no explanation, no preamble — just the raw JSON array starting with [ and ending with ].

Each product object must have exactly these fields:
- id: string (brand-name-slug, lowercase, hyphens)
- name: string (exact product name)
- brand: string
- emoji: string (one relevant emoji)
- price: number (USD, no currency symbol)
- retailer: string (store name)
- url: string (direct product page URL, not homepage)
- affiliateUrl: string (empty string "")
- quality: number (0-10, based on materials and reputation)
- rating: number (real customer rating out of 5.0)
- reviewCount: number (integer)
- reviewSource: string (e.g. "Amazon" or brand name)
- expertVerdict: string (under 15 words)
- expertSource: string (publication or reviewer name)
- specs: object (4-5 key-value pairs relevant to the category)
- aspects: array of 2-3 short string tags

Return exactly 8 products. Prioritize the brands listed in the query.`,
  cache_control: { type: 'ephemeral' }
};

// ── CLAUDE SEARCH (MINIMAL TOKENS) ────────────────────────────
async function searchCategory(catKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) throw new Error(`Unknown category: ${catKey}`);

  // Short user prompt — system prompt is cached, so only this costs full input price
  const userMsg = `Find the top 8 ${cat.label} available to buy now (2025-2026). Prioritize these brands: ${cat.brands}. Return only the JSON array.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      max_tokens: 3000,
      system: [CACHED_SYSTEM],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();

  // Log token usage so you can track costs
  if (data.usage) {
    const u = data.usage;
    console.log(`  [${catKey}] tokens — in:${u.input_tokens} out:${u.output_tokens} cache_write:${u.cache_creation_input_tokens||0} cache_read:${u.cache_read_input_tokens||0}`);
  }

  let text = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');

  return JSON.parse(match[0])
    .filter(p => p.name && p.brand && p.price && p.url)
    .slice(0, 8)
    .map((p, i) => ({
      ...p,
      id: p.id || `${p.brand}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      affiliateUrl: p.affiliateUrl || '',
      reviews: [],  // Not fetched at search time — loaded on demand
    }));
}

// ── REVIEW FETCH (ON DEMAND, ~500 tokens) ─────────────────────
// Only called when user clicks "Details". 3 reviews per product.
// Uses a very short prompt — no system prompt needed here.
async function fetchReviews(productName, brand, url) {
  const prompt = `Search for 3 real customer or expert reviews of the "${productName}" by ${brand} (${url}). Return ONLY a JSON array:
[{"author":"Name or publication","text":"Quote under 60 words"}]
Exactly 3 items. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      max_tokens: 600,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Review API ${res.status}`);
  const data = await res.json();

  let text = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text;
  }

  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  return JSON.parse(match[0]).slice(0, 3);
}

// ── REFRESH LOGIC ─────────────────────────────────────────────
let refreshing = false;

async function refreshVisitedCategories() {
  if (refreshing || !ANTHROPIC_API_KEY) return;
  refreshing = true;

  const cache = readCache() || { timestamp: Date.now(), refreshedAt: null, products: {}, errors: [] };
  const visited = getVisitedCategories();

  // First run: if nothing visited yet, seed with first 3 equipment cats
  const toRefresh = visited.length > 0
    ? visited
    : ['benches', 'barbells', 'dumbbells'];

  console.log(`[${new Date().toISOString()}] Refreshing ${toRefresh.length} categories: ${toRefresh.join(', ')}`);

  const errors = [];
  for (const cat of toRefresh) {
    try {
      console.log(`  Fetching: ${cat}…`);
      cache.products[cat] = await searchCategory(cat);
      console.log(`  ✓ ${cat}: ${cache.products[cat].length} products`);
      // 2s pause between calls — avoids rate limit errors which waste a full retry
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ✗ ${cat}: ${err.message}`);
      errors.push({ cat, error: err.message });
    }
  }

  cache.timestamp = Date.now();
  cache.refreshedAt = new Date().toISOString();
  cache.errors = errors;
  writeCache(cache);

  refreshing = false;
  console.log(`[${new Date().toISOString()}] Refresh done. ${toRefresh.length - errors.length}/${toRefresh.length} succeeded.`);
}

// ── ROUTES ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const cache = readCache();
  res.json({
    status: 'ok',
    model: SEARCH_MODEL,
    cacheAge: cache ? Math.round((Date.now() - cache.timestamp) / 60000) + ' min' : 'none',
    refreshedAt: cache?.refreshedAt || null,
    categoriesLoaded: Object.keys(cache?.products || {}).length,
    visitedCategories: getVisitedCategories(),
    refreshing,
  });
});

// Get products for a category
app.get('/api/products/:cat', (req, res) => {
  const cat = req.params.cat;
  if (!CATEGORIES[cat]) return res.status(404).json({ error: `Unknown category: ${cat}` });

  recordVisit(cat);

  const cache = readCache();
  const products = cache?.products?.[cat];

  if (!products) {
    // Trigger a background fetch for this specific category if not already refreshing
    if (!refreshing) {
      console.log(`Cache miss for "${cat}" — triggering background fetch`);
      refreshVisitedCategories().catch(console.error);
    }
    return res.status(503).json({
      error: 'Products loading — please try again in 60 seconds.',
      loading: true,
    });
  }

  res.json({
    products,
    category: cat,
    group: CATEGORIES[cat].group,
    refreshedAt: cache.refreshedAt,
    count: products.length,
  });
});

// Get reviews for a single product (on demand — only called when user clicks Details)
app.post('/api/reviews', async (req, res) => {
  const { productName, brand, url } = req.body;
  if (!productName || !brand) return res.status(400).json({ error: 'Send productName and brand.' });

  try {
    const reviews = await fetchReviews(productName, brand, url || '');
    res.json({ reviews });
  } catch (err) {
    console.error('Review fetch error:', err.message);
    res.status(500).json({ error: 'Could not fetch reviews.', reviews: [] });
  }
});

// Category list
app.get('/api/categories', (req, res) => {
  const cache = readCache();
  res.json({
    categories: Object.entries(CATEGORIES).map(([key, cat]) => ({
      key,
      label: cat.label,
      group: cat.group,
      loaded: !!(cache?.products?.[key]),
      count: cache?.products?.[key]?.length || 0,
    })),
    refreshedAt: cache?.refreshedAt || null,
  });
});

// Comparison summary — pure local math, 0 tokens
app.post('/api/compare', (req, res) => {
  const { p1, p2 } = req.body;
  if (!p1 || !p2) return res.status(400).json({ error: 'Send p1 and p2.' });

  const v1 = p1.quality / p1.price, v2 = p2.quality / p2.price;
  const diff = Math.abs(p1.price - p2.price);
  const qw = p1.quality >= p2.quality ? p1 : p2;
  const cheap = p1.price <= p2.price ? p1 : p2;
  const pricey = cheap === p1 ? p2 : p1;
  const vw = v1 >= v2 ? p1 : p2;

  let summary;
  if (diff === 0) {
    summary = `Same price at $${p1.price}. <strong>${qw.name}</strong> wins on quality (${qw.quality}/10) — easy pick.`;
  } else if (diff < 40) {
    summary = `Only $${diff} apart. The quality difference makes it clear — go with <strong>${qw.name}</strong> (${qw.quality}/10 vs ${(qw===p1?p2:p1).quality}/10).`;
  } else if (vw === cheap) {
    summary = `<strong>${cheap.name}</strong> is $${diff} cheaper AND better value per dollar. Unless you need something specific from the <strong>${pricey.name}</strong>, save the money.`;
  } else {
    summary = `<strong>${pricey.name}</strong> costs $${diff} more but earns it with ${pricey.quality}/10 quality vs ${cheap.quality}/10. Worth the upgrade if budget allows.`;
  }

  res.json({ summary, winnerId: qw.id });
});

// Manual refresh (admin use, origin-protected)
app.post('/api/admin/refresh', (req, res) => {
  if (refreshing) return res.json({ message: 'Already refreshing.' });
  res.json({ message: 'Refresh started.' });
  refreshVisitedCategories().catch(console.error);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── START ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ GymGear backend on port ${PORT}`);
  console.log(`🤖 Model: ${SEARCH_MODEL} ($1/$5 per MTok)`);
  console.log(`🔒 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

  loadVisits();

  const existing = readCache();
  if (existing) {
    const ageH = ((Date.now() - existing.timestamp) / 3600000).toFixed(1);
    const cats = Object.keys(existing.products).length;
    console.log(`📦 Cache loaded: ${cats} categories, ${ageH}h old`);
    if (Date.now() - existing.timestamp > CACHE_TTL) {
      console.log('🔄 Cache stale — refreshing visited categories…');
      refreshVisitedCategories().catch(console.error);
    }
  } else {
    console.log('🔄 No cache — starting initial fetch…');
    refreshVisitedCategories().catch(console.error);
  }

  // Daily refresh — only visited categories
  setInterval(() => {
    console.log('⏰ 24h timer — refreshing visited categories');
    refreshVisitedCategories().catch(console.error);
  }, CACHE_TTL);
});