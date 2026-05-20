// search.js — run by GitHub Action weekly
// Searches all 14 categories and writes cache.json to the cache repo.
// The Render server never searches — it just reads this file.

import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CACHE_PATH = './cache.json';
const MODEL = 'claude-haiku-4-5-20251001';
const DELAY_MS = 8000; // 8s between calls — safe for Tier 1

const CATEGORIES = {
  benches:     { label:'weight benches',               group:'equipment',   brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness' },
  barbells:    { label:'barbells',                     group:'equipment',   brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,American Barbell,Vulcan Strength' },
  dumbbells:   { label:'dumbbells',                    group:'equipment',   brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Ironmaster,Bowflex,Fringe Sport' },
  plates:      { label:'weight plates',                group:'equipment',   brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Eleiko,Vulcan Strength,CAP Barbell' },
  racks:       { label:'squat racks and power racks',  group:'equipment',   brands:'Rogue Fitness,Rep Fitness,Titan Fitness,Bells of Steel,Archon Fitness' },
  cardio:      { label:'cardio machines',              group:'equipment',   brands:'Concept2,Assault Fitness,Rogue Fitness,NordicTrack,Peloton' },
  shorts:      { label:'gym shorts',                   group:'clothing',    brands:'Young LA,Gymshark,NOBULL,Alphalete,Nike,Adidas,Lululemon' },
  compression: { label:'compression leggings',         group:'clothing',    brands:'Young LA,Gymshark,Alphalete,Lululemon,Nike,Under Armour,Better Bodies' },
  hoodies:     { label:'gym hoodies',                  group:'clothing',    brands:'Young LA,Gymshark,Alphalete,GASP,Better Bodies,Nike,Adidas' },
  footwear:    { label:'gym and lifting shoes',         group:'clothing',    brands:'NOBULL,Nike,Adidas,Reebok,New Balance,Converse,Inov-8' },
  preworkout:  { label:'pre-workout supplements',      group:'supplements', brands:'Ghost,Transparent Labs,Gorilla Mind,C4,Legion,Alani Nu,Bucked Up' },
  protein:     { label:'protein powder',               group:'supplements', brands:'Optimum Nutrition,Ghost,Transparent Labs,Dymatize,Legion,Thorne,Nutricost' },
  creatine:    { label:'creatine supplements',         group:'supplements', brands:'Transparent Labs,Optimum Nutrition,Thorne,Legion,Nutricost,Momentous' },
  recovery:    { label:'recovery supplements',         group:'supplements', brands:'Transparent Labs,Legion,Thorne,Momentous,Optimum Nutrition,Ghost' },
};

const SYSTEM_PROMPT = `You are a product research assistant. Search the web and return ONLY a valid JSON array — no markdown, no explanation, just raw JSON starting with [ and ending with ].

Each object must have exactly:
- id: string (brand-name-slug, lowercase hyphens)
- name: string (exact product name)
- brand: string
- emoji: string (one emoji)
- price: number (USD, number only)
- retailer: string
- url: string (direct product page URL, not homepage)
- affiliateUrl: string (empty string "")
- quality: number 0-10
- rating: number 0-5
- reviewCount: number
- reviewSource: string
- expertVerdict: string (under 15 words)
- expertSource: string
- specs: object (4-5 key-value pairs)
- aspects: array of 2-3 short tags

Return exactly 8 products. Prioritize the listed brands.`;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function searchCategory(catKey, attempt = 1) {
  const cat = CATEGORIES[catKey];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Top 8 ${cat.label} available now in 2025-2026. Preferred brands: ${cat.brands}. JSON array only.`,
      }],
    }),
  });

  if (res.status === 429) {
    if (attempt >= 5) throw new Error('Rate limit: max retries exceeded');
    const wait = attempt * 45000;
    console.log(`  [${catKey}] Rate limited — waiting ${wait/1000}s (attempt ${attempt}/5)…`);
    await sleep(wait);
    return searchCategory(catKey, attempt + 1);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  if (data.usage) {
    const u = data.usage;
    console.log(`  [${catKey}] tokens — in:${u.input_tokens} out:${u.output_tokens} cache_read:${u.cache_read_input_tokens || 0}`);
  }

  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in response');

  const products = JSON.parse(match[0])
    .filter(p => p.name && p.brand && p.price && p.url)
    .slice(0, 8)
    .map((p, i) => ({
      ...p,
      id: p.id || `${p.brand}-${i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      affiliateUrl: '',
    }));

  if (!products.length) throw new Error('No valid products parsed');
  return products;
}

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  console.log(`\nGymGear Weekly Refresh — ${new Date().toISOString()}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Categories: ${Object.keys(CATEGORIES).length}\n`);

  // Load existing cache so failures keep old data
  let existing = { products: {} };
  try {
    if (fs.existsSync(CACHE_PATH)) {
      existing = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      console.log(`Loaded existing cache: ${Object.keys(existing.products).length} categories\n`);
    }
  } catch (e) {
    console.warn('Could not read existing cache:', e.message);
  }

  const products = { ...existing.products };
  const errors = [];
  const catKeys = Object.keys(CATEGORIES);

  for (let i = 0; i < catKeys.length; i++) {
    const catKey = catKeys[i];
    console.log(`[${i + 1}/${catKeys.length}] Searching: ${catKey}…`);

    try {
      products[catKey] = await searchCategory(catKey);
      console.log(`  ✓ ${products[catKey].length} products found\n`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      errors.push({ cat: catKey, error: err.message });
      // Keep old data if available
      if (existing.products[catKey]) {
        products[catKey] = existing.products[catKey];
        console.log(`  → Using previous data for ${catKey}\n`);
      }
    }

    // Wait between searches (skip delay after last one)
    if (i < catKeys.length - 1) {
      console.log(`  Waiting ${DELAY_MS / 1000}s…`);
      await sleep(DELAY_MS);
    }
  }

  const cache = {
    timestamp: Date.now(),
    refreshedAt: new Date().toISOString(),
    nextRefresh: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    categoriesLoaded: Object.keys(products).length,
    errors,
    products,
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  const good = catKeys.length - errors.length;
  console.log(`\n✅ Done: ${good}/${catKeys.length} categories refreshed`);
  console.log(`Cache written to ${CACHE_PATH}`);
  if (errors.length) {
    console.log(`Failed: ${errors.map(e => e.cat).join(', ')}`);
    console.log('These will use old data until next refresh.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});