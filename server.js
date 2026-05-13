// GymGear Compare Pro — Backend v4
// Persistent cache via GitHub — survives server restarts and sleep.
// Weekly refresh (not daily) — products don't change that fast.
// Cost: ~$0.10-0.15/week total.

import express from 'express';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;         // Personal Access Token
const GITHUB_REPO  = process.env.GITHUB_CACHE_REPO;   // e.g. "starcrock7-lab/gymgear-cache"
const GITHUB_FILE  = 'cache.json';
const CACHE_TTL    = 7 * 24 * 60 * 60 * 1000;         // 7 days
const LOCAL_BACKUP = '/tmp/gymgear_cache.json';        // fallback if GitHub is slow
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

// ── CATEGORIES ────────────────────────────────────────────────
const CATEGORIES = {
  benches:     { label:'weight benches',              group:'equipment',    brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness,American Barbell' },
  barbells:    { label:'barbells',                    group:'equipment',    brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,American Barbell,Fringe Sport,Vulcan Strength' },
  dumbbells:   { label:'dumbbells',                   group:'equipment',    brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Ironmaster,Fringe Sport,Bowflex,Vulcan Strength' },
  plates:      { label:'weight plates',               group:'equipment',    brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,Vulcan Strength,CAP Barbell' },
  racks:       { label:'squat racks and power racks', group:'equipment',    brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness' },
  cardio:      { label:'cardio machines',             group:'equipment',    brands:'Concept2,Assault Fitness,Rogue Fitness,NordicTrack,Peloton,SkiErg' },
  shorts:      { label:'gym shorts',                  group:'clothing',     brands:'Young LA,Gymshark,NOBULL,Alphalete,Nike,Adidas,Lululemon,Under Armour' },
  compression: { label:'compression leggings',        group:'clothing',     brands:'Young LA,Gymshark,Alphalete,Lululemon,Nike,Under Armour,Better Bodies' },
  hoodies:     { label:'gym hoodies',                 group:'clothing',     brands:'Young LA,Gymshark,Alphalete,GASP,Better Bodies,Nike,Adidas' },
  footwear:    { label:'gym and lifting shoes',        group:'clothing',     brands:'NOBULL,Nike,Adidas,Reebok,New Balance,Converse,Inov-8' },
  preworkout:  { label:'pre-workout supplements',     group:'supplements',  brands:'Ghost,Transparent Labs,Gorilla Mind,C4,Legion,Jym,Bucked Up,Alani Nu' },
  protein:     { label:'protein powder',              group:'supplements',  brands:'Optimum Nutrition,Ghost,Transparent Labs,Dymatize,Jym,Legion,Thorne,Nutricost' },
  creatine:    { label:'creatine supplements',        group:'supplements',  brands:'Transparent Labs,Optimum Nutrition,Thorne,Legion,Nutricost,Klean Athlete,Momentous' },
  recovery:    { label:'recovery supplements',        group:'supplements',  brands:'Transparent Labs,Legion,Thorne,Klean Athlete,Momentous,Optimum Nutrition,Ghost' },
};

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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

// Block non-allowed origins on /api
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.some(o => referer.startsWith(o));
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  next();
});

// ── IN-MEMORY CACHE ───────────────────────────────────────────
let mem = null;  // Always check this first — fastest

function getCache() { return mem; }

function setCache(data) {
  mem = data;
  // Also write local backup
  try { fs.writeFileSync(LOCAL_BACKUP, JSON.stringify(data)); } catch {}
}

function isCacheFresh() {
  return mem && (Date.now() - mem.timestamp < CACHE_TTL);
}

// ── GITHUB CACHE ──────────────────────────────────────────────
// Reads and writes cache.json in a GitHub repo.
// This means the data survives server restarts, sleep, and redeployments.

async function readFromGitHub() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.log('GitHub cache not configured — using local only.');
    return null;
  }
  try {
    console.log(`Reading cache from GitHub: ${GITHUB_REPO}/${GITHUB_FILE}`);
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.status === 404) { console.log('No cache file in GitHub yet.'); return null; }
    if (!res.ok) throw new Error(`GitHub read ${res.status}`);
    const meta = await res.json();
    // Content is base64 encoded
    const content = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
    console.log(`GitHub cache loaded — ${Object.keys(content.products||{}).length} categories, written ${content.refreshedAt}`);
    // Store the sha so we can update the file (not create a new one)
    content._githubSha = meta.sha;
    return content;
  } catch (err) {
    console.error('GitHub read error:', err.message);
    return null;
  }
}

async function writeToGitHub(data) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return;
  try {
    // Don't store internal sha field in the actual file
    const { _githubSha, ...cleanData } = data;
    const content = Buffer.from(JSON.stringify(cleanData, null, 2)).toString('base64');
    const body = {
      message: `Cache update ${new Date().toISOString()}`,
      content,
      ...(data._githubSha ? { sha: data._githubSha } : {}),
    };
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`GitHub write ${res.status}: ${err.message}`);
    }
    const result = await res.json();
    // Update sha for next write
    if (result.content?.sha) mem._githubSha = result.content.sha;
    console.log('Cache written to GitHub successfully.');
  } catch (err) {
    console.error('GitHub write error:', err.message);
  }
}

// ── CACHED SYSTEM PROMPT (token caching) ─────────────────────
const SYSTEM_PROMPT = {
  type: 'text',
  text: `You are a product research assistant. Search the web and return ONLY a valid JSON array — no markdown, no explanation, just raw JSON starting with [ and ending with ].

Each object must have exactly:
- id: string (brand-name-slug, lowercase hyphens)
- name: string (exact product name)
- brand: string
- emoji: string (one emoji)
- price: number (USD)
- retailer: string
- url: string (direct product page, not homepage)
- affiliateUrl: string (empty string "")
- quality: number 0-10
- rating: number 0-5 (real customer rating)
- reviewCount: number
- reviewSource: string
- expertVerdict: string (under 15 words)
- expertSource: string
- specs: object (4-5 relevant key-value pairs)
- aspects: array of 2-3 short tags

Return exactly 8 products. Prioritize the listed brands.`,
  cache_control: { type: 'ephemeral' },
};

// ── SEARCH ONE CATEGORY ───────────────────────────────────────
async function searchCategory(catKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) throw new Error(`Unknown: ${catKey}`);

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
      system: [SYSTEM_PROMPT],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Top 8 ${cat.label} available now (2025-2026). Preferred brands: ${cat.brands}. JSON array only.`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  if (data.usage) {
    const u = data.usage;
    console.log(`  [${catKey}] in:${u.input_tokens} out:${u.output_tokens} cache_read:${u.cache_read_input_tokens||0}`);
  }

  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in response');

  return JSON.parse(match[0])
    .filter(p => p.name && p.brand && p.price && p.url)
    .slice(0, 8)
    .map((p, i) => ({
      ...p,
      id: p.id || `${p.brand}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      affiliateUrl: '',
    }));
}

// ── FULL REFRESH ──────────────────────────────────────────────
let refreshing = false;

async function refreshAll() {
  if (refreshing || !ANTHROPIC_API_KEY) return;
  refreshing = true;

  console.log(`\n[${new Date().toISOString()}] Starting weekly refresh of all ${Object.keys(CATEGORIES).length} categories…`);

  // Start from existing cache so partial failures don't wipe good data
  const existing = getCache() || { products: {} };
  const products = { ...existing.products };
  const errors = [];

  for (const catKey of Object.keys(CATEGORIES)) {
    try {
      console.log(`  Searching: ${catKey}…`);
      products[catKey] = await searchCategory(catKey);
      console.log(`  ✓ ${catKey}: ${products[catKey].length} products`);
      await new Promise(r => setTimeout(r, 2500)); // pause between calls
    } catch (err) {
      console.error(`  ✗ ${catKey}: ${err.message}`);
      errors.push({ cat: catKey, error: err.message });
      // Keep existing data for failed categories
      if (existing.products[catKey]) {
        products[catKey] = existing.products[catKey];
        console.log(`  → Kept existing data for ${catKey}`);
      }
    }
  }

  const newCache = {
    timestamp: Date.now(),
    refreshedAt: new Date().toISOString(),
    nextRefresh: new Date(Date.now() + CACHE_TTL).toISOString(),
    products,
    errors,
    _githubSha: existing._githubSha, // preserve sha for GitHub update
  };

  setCache(newCache);
  await writeToGitHub(newCache);

  refreshing = false;
  const good = Object.keys(CATEGORIES).length - errors.length;
  console.log(`[${new Date().toISOString()}] Refresh complete: ${good}/${Object.keys(CATEGORIES).length} categories. Next refresh: ${newCache.nextRefresh}\n`);
}

// ── ON-DEMAND REVIEW FETCH ────────────────────────────────────
async function fetchReviews(productName, brand, url) {
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
      messages: [{
        role: 'user',
        content: `Find 3 real reviews of "${productName}" by ${brand}. Return ONLY a JSON array: [{"author":"Name","text":"Quote under 60 words"}]. Exactly 3 items. No markdown.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Review API ${res.status}`);
  const data = await res.json();
  let text = '';
  for (const block of data.content || []) { if (block.type === 'text') text += block.text; }
  const match = text.match(/\[[\s\S]*?\]/);
  return match ? JSON.parse(match[0]).slice(0, 3) : [];
}

// ── ROUTES ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const cache = getCache();
  res.json({
    status: 'ok',
    model: SEARCH_MODEL,
    githubCache: !!(GITHUB_TOKEN && GITHUB_REPO),
    cacheAge: cache ? `${Math.round((Date.now() - cache.timestamp) / 3600000)}h` : 'none',
    refreshedAt: cache?.refreshedAt || null,
    nextRefresh: cache?.nextRefresh || null,
    categoriesLoaded: Object.keys(cache?.products || {}).length,
    refreshing,
  });
});

app.get('/api/products/:cat', (req, res) => {
  const cat = req.params.cat;
  if (!CATEGORIES[cat]) return res.status(404).json({ error: `Unknown category: ${cat}` });

  const cache = getCache();
  const products = cache?.products?.[cat];

  if (!products || !products.length) {
    // Trigger background refresh if not already running
    if (!refreshing) {
      console.log(`Cache miss for "${cat}" — triggering background refresh`);
      refreshAll().catch(console.error);
    }
    return res.status(503).json({
      error: 'Products are loading for the first time. This takes 3-5 minutes. Please try again shortly.',
      loading: true,
      refreshing: true,
    });
  }

  res.json({ products, category: cat, group: CATEGORIES[cat].group, refreshedAt: cache.refreshedAt, nextRefresh: cache.nextRefresh, count: products.length });
});

app.get('/api/categories', (req, res) => {
  const cache = getCache();
  res.json({
    categories: Object.entries(CATEGORIES).map(([key, cat]) => ({
      key, label: cat.label, group: cat.group,
      loaded: !!(cache?.products?.[key]?.length),
      count: cache?.products?.[key]?.length || 0,
    })),
    refreshedAt: cache?.refreshedAt || null,
    nextRefresh: cache?.nextRefresh || null,
  });
});

// On-demand reviews — fetched when user opens Details modal
app.post('/api/reviews', async (req, res) => {
  const { productName, brand, url } = req.body;
  if (!productName || !brand) return res.status(400).json({ error: 'Send productName and brand.' });
  try {
    const reviews = await fetchReviews(productName, brand, url || '');
    res.json({ reviews });
  } catch (err) {
    console.error('Review fetch error:', err.message);
    res.json({ reviews: [] });
  }
});

// Zero-token comparison summary
app.post('/api/compare', (req, res) => {
  const { p1, p2 } = req.body;
  if (!p1 || !p2) return res.status(400).json({ error: 'Send p1 and p2.' });
  const v1 = p1.quality / p1.price, v2 = p2.quality / p2.price;
  const diff = Math.abs(p1.price - p2.price);
  const qw = p1.quality >= p2.quality ? p1 : p2;
  const cheap = p1.price <= p2.price ? p1 : p2;
  const pricey = cheap.id === p1.id ? p2 : p1;
  const vw = v1 >= v2 ? p1 : p2;
  let summary;
  if (diff === 0) summary = `Same price at $${p1.price}. <strong>${qw.name}</strong> wins on quality (${qw.quality}/10) — easy pick.`;
  else if (diff < 40) summary = `Only $${diff} apart. Quality makes it clear — go with <strong>${qw.name}</strong> (${qw.quality}/10 vs ${(qw.id===p1.id?p2:p1).quality}/10).`;
  else if (vw.id === cheap.id) summary = `<strong>${cheap.name}</strong> is $${diff} cheaper AND better value per dollar. Unless you need something specific from <strong>${pricey.name}</strong>, save the money.`;
  else summary = `<strong>${pricey.name}</strong> costs $${diff} more but earns it — ${pricey.quality}/10 vs ${cheap.quality}/10 quality. Worth the upgrade if budget allows.`;
  res.json({ summary, winnerId: qw.id });
});

// Admin manual refresh
app.post('/api/admin/refresh', (req, res) => {
  if (refreshing) return res.json({ message: 'Already refreshing.' });
  res.json({ message: 'Full refresh started in background.' });
  refreshAll().catch(console.error);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── START ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n✅ GymGear backend on port ${PORT}`);
  console.log(`🤖 Model: ${SEARCH_MODEL}`);
  console.log(`🔒 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`📦 GitHub cache: ${GITHUB_REPO || 'NOT CONFIGURED — set GITHUB_TOKEN + GITHUB_CACHE_REPO'}\n`);

  // 1. Try in-memory (already empty on cold start)
  // 2. Try local /tmp backup (survives warm restarts)
  // 3. Try GitHub (survives everything)
  // 4. If nothing works, trigger a fresh search

  let loaded = false;

  // Check /tmp backup first (fast, free)
  try {
    if (fs.existsSync(LOCAL_BACKUP)) {
      const local = JSON.parse(fs.readFileSync(LOCAL_BACKUP, 'utf8'));
      if (Date.now() - local.timestamp < CACHE_TTL) {
        setCache(local);
        console.log(`📦 Loaded from /tmp backup (${Object.keys(local.products).length} categories)`);
        loaded = true;
      }
    }
  } catch {}

  // Even if /tmp was fine, still pull from GitHub to get the definitive version
  // (in case this is a fresh Render instance with empty /tmp)
  if (!loaded) {
    const gh = await readFromGitHub();
    if (gh && Date.now() - gh.timestamp < CACHE_TTL) {
      setCache(gh);
      // Also write to /tmp so subsequent warm restarts are faster
      try { fs.writeFileSync(LOCAL_BACKUP, JSON.stringify(gh)); } catch {}
      console.log(`✅ Loaded from GitHub (${Object.keys(gh.products).length} categories, ${gh.refreshedAt})`);
      loaded = true;
    } else if (gh) {
      // GitHub data exists but is stale — load it anyway so users see something,
      // then refresh in background
      setCache(gh);
      console.log(`⚠️  GitHub cache stale (${gh.refreshedAt}) — loading it while refreshing in background`);
      loaded = true;
      refreshAll().catch(console.error);
    }
  }

  if (!loaded) {
    console.log('🔄 No cache found anywhere — starting fresh search (takes ~3-5 min)…');
    refreshAll().catch(console.error);
  }

  // Weekly refresh timer — runs even when no users are active
  setInterval(() => {
    console.log('\n⏰ Weekly refresh timer fired');
    refreshAll().catch(console.error);
  }, CACHE_TTL);
});