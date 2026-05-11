// GymGear Compare Pro — Secure Backend
// Daily AI refresh with file cache. No secret key in frontend.
// Security: Origin-based allowlist + rate limiting + helmet headers.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CACHE_FILE = '/tmp/gymgear_cache.json';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── ALLOWED ORIGINS ───────────────────────────────────────────
// Only requests from your Vercel frontend are accepted.
// Add localhost for local testing. No secret key needed in HTML.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)
  .concat([
    'https://gymgear-frontend5.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ]);

// ── CATEGORIES TO SEARCH ──────────────────────────────────────
const SEARCH_TASKS = [
  // Equipment
  { key: 'benches',    label: 'weight benches and flat utility benches',         group: 'equipment' },
  { key: 'barbells',   label: 'barbells including Olympic, deadlift, EZ curl',   group: 'equipment' },
  { key: 'dumbbells',  label: 'dumbbells including hex, adjustable, urethane',   group: 'equipment' },
  { key: 'plates',     label: 'weight plates including bumper, cast iron, comp', group: 'equipment' },
  { key: 'racks',      label: 'squat racks, power racks, and half racks',        group: 'equipment' },
  { key: 'cardio',     label: 'cardio equipment: rowers, assault bikes, treadmills, ski ergs', group: 'equipment' },
  // Clothing
  { key: 'shorts',     label: 'gym shorts and athletic shorts for men and women', group: 'clothing' },
  { key: 'compression',label: 'compression leggings and tights for gym training', group: 'clothing' },
  { key: 'hoodies',    label: 'gym hoodies and athletic sweatshirts',             group: 'clothing' },
  { key: 'footwear',   label: 'gym shoes including lifting shoes, cross trainers, and training shoes', group: 'clothing' },
  // Supplements
  { key: 'preworkout', label: 'pre-workout supplements',                          group: 'supplements' },
  { key: 'protein',    label: 'protein powder including whey, casein, plant-based', group: 'supplements' },
  { key: 'creatine',   label: 'creatine supplements',                             group: 'supplements' },
  { key: 'recovery',   label: 'recovery supplements including BCAAs, glutamine, sleep aids', group: 'supplements' },
];

// Preferred brands per group — Claude will try to include these
const PREFERRED_BRANDS = {
  equipment:    ['Rogue Fitness', 'Rep Fitness', 'Titan Fitness', 'Eleiko', 'Bells of Steel', 'Vulcan Strength', 'American Barbell', 'Fringe Sport', 'Concept2', 'Assault Fitness'],
  clothing:     ['Young LA', 'Gymshark', 'NOBULL', 'Alphalete', 'Lululemon', 'Nike', 'Adidas', 'Gasp', 'Better Bodies', 'Under Armour'],
  supplements:  ['Ghost', 'Transparent Labs', 'Optimum Nutrition', 'Gorilla Mind', 'Jym', 'Legion', 'Thorne', 'Nutricost', 'Cellucor', 'Dymatize'],
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

// CORS — origin allowlist only, no wildcard, no key in frontend
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

// Rate limiting — simple in-memory per IP
const ratemap = new Map();
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const window = 60_000; // 1 minute
  const max = 30;
  const hits = (ratemap.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= max) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  hits.push(now);
  ratemap.set(ip, hits);
  next();
});

// Block requests not from allowed origins on API routes
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
  const isAllowedReferer = ALLOWED_ORIGINS.some(o => referer.startsWith(o));
  if (!isAllowedOrigin && !isAllowedReferer) {
    console.warn(`Blocked request from origin: ${origin || 'none'} referer: ${referer || 'none'}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// ── CACHE ─────────────────────────────────────────────────────
let memoryCache = null;  // in-memory fallback for Render's ephemeral filesystem

function readCache() {
  if (memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL) {
    return memoryCache;
  }
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (Date.now() - raw.timestamp > CACHE_TTL) return null;
    memoryCache = raw;
    return raw;
  } catch { return null; }
}

function writeCache(data) {
  memoryCache = data;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch { }
}

// ── CLAUDE SEARCH ──────────────────────────────────────────────
async function searchCategory(task) {
  const brands = PREFERRED_BRANDS[task.group].join(', ');
  const prompt = `Search the web for the top 10 best ${task.label} available to buy right now in 2025-2026.

Preferred brands to include where possible: ${brands}.

Return ONLY a valid JSON array with no markdown or explanation:
[
  {
    "id": "brand-product-slug",
    "name": "Exact product name",
    "brand": "Brand name",
    "emoji": "one relevant emoji",
    "price": 99.99,
    "retailer": "Store name",
    "url": "Full working product URL",
    "affiliateUrl": "",
    "quality": 8.5,
    "rating": 4.7,
    "reviewCount": 1200,
    "reviewSource": "Amazon or brand site",
    "expertVerdict": "One sentence expert verdict under 20 words",
    "expertSource": "Source name",
    "reviews": [
      {"author": "Reviewer or publication name", "text": "Review quote under 80 words"},
      {"author": "Verified Buyer", "text": "Short buyer quote"},
      {"author": "Verified Buyer", "text": "Short buyer quote"}
    ],
    "specs": {"Key": "Value"},
    "aspects": ["Tag1", "Tag2", "Tag3"]
  }
]

Rules:
- Exactly 10 products
- quality: 0-10 based on materials, brand reputation, construction
- rating: real customer star rating out of 5
- url: real direct product page URL (not homepage)
- affiliateUrl: leave as empty string ""
- specs: 4-6 key-value pairs relevant to the category
- aspects: 2-4 short tags`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  let text = '';
  for (const block of data.content) {
    if (block.type === 'text') text += block.text;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');

  const products = JSON.parse(match[0]);
  return products
    .filter(p => p.name && p.brand && p.price && p.url)
    .slice(0, 10)
    .map((p, i) => ({
      ...p,
      id: p.id || `${p.brand}-${i}`.toLowerCase().replace(/\s+/g, '-'),
      affiliateUrl: p.affiliateUrl || '',
    }));
}

// ── REFRESH ALL CATEGORIES ─────────────────────────────────────
let refreshing = false;

async function refreshAll() {
  if (refreshing) {
    console.log('Refresh already in progress, skipping.');
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — skipping refresh.');
    return;
  }

  refreshing = true;
  console.log(`[${new Date().toISOString()}] Starting daily product refresh…`);

  const products = {};
  const errors = [];

  for (const task of SEARCH_TASKS) {
    try {
      console.log(`  Searching: ${task.key}…`);
      products[task.key] = await searchCategory(task);
      console.log(`  ✓ ${task.key}: ${products[task.key].length} products`);
      // Small delay between calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ✗ ${task.key}: ${err.message}`);
      errors.push({ key: task.key, error: err.message });
    }
  }

  const cache = {
    timestamp: Date.now(),
    refreshedAt: new Date().toISOString(),
    products,
    errors,
    categories: SEARCH_TASKS.map(t => ({
      key: t.key,
      label: t.label,
      group: t.group,
    })),
  };

  writeCache(cache);
  refreshing = false;
  console.log(`[${new Date().toISOString()}] Refresh complete. ${Object.keys(products).length}/${SEARCH_TASKS.length} categories loaded.`);
  if (errors.length) console.log('  Errors:', errors);
}

// Schedule daily refresh
function scheduleDailyRefresh() {
  setInterval(() => {
    console.log('24h timer fired — starting refresh.');
    refreshAll().catch(console.error);
  }, CACHE_TTL);
}

// ── ROUTES ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const cache = readCache();
  res.json({
    status: 'ok',
    cacheAge: cache ? Math.round((Date.now() - cache.timestamp) / 60000) + ' min' : 'no cache',
    refreshedAt: cache?.refreshedAt || null,
    categoriesLoaded: cache ? Object.keys(cache.products).length : 0,
    refreshing,
  });
});

// Get all products for a category
app.get('/api/products/:category', (req, res) => {
  const cache = readCache();
  if (!cache) {
    return res.status(503).json({
      error: 'Products are still loading. Please try again in a few minutes.',
      loading: true,
    });
  }
  const cat = req.params.category;
  const products = cache.products[cat];
  if (!products) {
    return res.status(404).json({ error: `Category "${cat}" not found.` });
  }
  res.json({
    products,
    category: cat,
    refreshedAt: cache.refreshedAt,
    count: products.length,
  });
});

// Get category index
app.get('/api/categories', (req, res) => {
  const cache = readCache();
  res.json({
    categories: SEARCH_TASKS.map(t => ({
      key: t.key,
      label: t.label,
      group: t.group,
      count: cache?.products[t.key]?.length || 0,
    })),
    refreshedAt: cache?.refreshedAt || null,
    loading: !cache,
  });
});

// AI comparison summary — uses very few tokens (no web search)
app.post('/api/compare', (req, res) => {
  const { p1, p2 } = req.body;
  if (!p1 || !p2) return res.status(400).json({ error: 'Send p1 and p2 product objects.' });

  // Local algorithm — zero tokens
  const val1 = p1.quality / p1.price;
  const val2 = p2.quality / p2.price;
  const diff = Math.abs(p1.price - p2.price);
  const qualWinner = p1.quality >= p2.quality ? p1 : p2;
  const valWinner = val1 >= val2 ? p1 : p2;
  const cheaper = p1.price <= p2.price ? p1 : p2;
  const pricier = p1.price <= p2.price ? p2 : p1;

  let summary;
  if (diff === 0) {
    summary = `Both are identically priced at $${p1.price}. The <strong>${qualWinner.name}</strong> wins on quality score (${qualWinner.quality}/10) — go with that one.`;
  } else if (diff < 40) {
    summary = `Only $${diff} apart. The <strong>${qualWinner.name}</strong> scores ${qualWinner.quality}/10 vs ${(qualWinner === p1 ? p2 : p1).quality}/10 — for that small a difference, the higher quality pick is worth it.`;
  } else if (valWinner === cheaper) {
    summary = `The <strong>${cheaper.name}</strong> is $${diff} cheaper AND delivers better value per dollar. Unless you have a specific need the <strong>${pricier.name}</strong> solves, the <strong>${cheaper.name}</strong> is the smarter buy.`;
  } else {
    summary = `The <strong>${pricier.name}</strong> costs $${diff} more but earns it with a ${pricier.quality}/10 quality score vs ${cheaper.quality}/10. If budget allows, the <strong>${pricier.name}</strong> will perform better and last longer.`;
  }

  res.json({ summary, winner: qualWinner.id });
});

// Manual refresh trigger (for admin use — no auth needed since origin-blocked)
app.post('/api/admin/refresh', async (req, res) => {
  if (refreshing) {
    return res.json({ message: 'Refresh already in progress.' });
  }
  res.json({ message: 'Refresh started in background.' });
  refreshAll().catch(console.error);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── START ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`✅ GymGear backend running on port ${PORT}`);
  console.log(`🔒 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

  // Load from cache if fresh, otherwise start a refresh
  const existing = readCache();
  if (existing) {
    const ageH = (Date.now() - existing.timestamp) / 3600000;
    console.log(`📦 Loaded cache from ${existing.refreshedAt} (${ageH.toFixed(1)}h ago)`);
  } else {
    console.log('🔄 No fresh cache — starting initial product refresh…');
    refreshAll().catch(console.error);
  }

  scheduleDailyRefresh();
});