import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Backend running!', time: new Date().toISOString() });
});

// Search products
app.post('/api/search-products', async (req, res) => {
  try {
    const { category } = req.body;

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    if (!category || !['benches', 'weights'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    console.log(`Searching for ${category}...`);

    const categoryName = category === 'benches' ? 'weight benches' : 'weight plates';
    const query = category === 'benches'
      ? 'best weight benches 2025 price amazon rogue titan rep'
      : 'best weight plates 2025 price amazon rogue titan';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Anthropic-Version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Search the web RIGHT NOW for top 15 ${categoryName} currently for sale with real prices.

Search: ${query}

Return ONLY valid JSON array (no markdown, no explanation):
[
  {
    "id": "unique_id",
    "name": "Product name",
    "brand": "Brand",
    "regularPrice": 299.99,
    "salePrice": 249.99,
    "discount": "17%",
    "retailer": "Amazon/Rogue/Titan/etc",
    "url": "Full product URL",
    "quality": 8.5,
    "rating": 4.5,
    "inStock": true,
    "specs": {"spec": "value"},
    "keyAspects": ["aspect1", "aspect2"]
  }
]

Requirements:
1. REAL current prices from web search
2. REAL products only
3. Full working URLs
4. Current sales/discounts
5. Real ratings
6. Stock status`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude error:', error);
      return res.status(500).json({ error: 'Claude API error' });
    }

    const data = await response.json();
    let textContent = '';

    for (let block of data.content) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      try {
        const products = JSON.parse(jsonMatch[0]).map((p, i) => ({
          ...p,
          id: p.id || `product_${i}`,
        }));

        return res.json({
          success: true,
          products: products,
          count: products.length,
        });
      } catch (e) {
        console.error('Parse error:', e);
        return res.status(400).json({ error: 'Failed to parse products' });
      }
    } else {
      return res.status(400).json({ error: 'No products found' });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Recommendations
app.post('/api/recommendations', (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ recommendations: [] });
    }

    const recs = [];

    // Best value
    const bestValue = [...products].sort((a, b) => {
      const pa = a.salePrice || a.regularPrice;
      const pb = b.salePrice || b.regularPrice;
      return (b.quality / pb) - (a.quality / pa);
    })[0];

    if (bestValue) {
      recs.push({
        type: 'Best Value',
        product: bestValue,
        reason: `Quality ${bestValue.quality}/10 at $${(bestValue.salePrice || bestValue.regularPrice).toFixed(2)}`,
      });
    }

    // Best deal
    const bestDeal = [...products]
      .filter(p => p.salePrice && p.salePrice < p.regularPrice)
      .sort((a, b) => parseFloat(b.discount || 0) - parseFloat(a.discount || 0))[0];

    if (bestDeal && bestDeal.id !== bestValue?.id) {
      recs.push({
        type: 'Hot Deal 🔥',
        product: bestDeal,
        reason: `${bestDeal.discount} off!`,
      });
    }

    // Best rated
    const bestRated = [...products].sort((a, b) => b.rating - a.rating)[0];
    if (bestRated && bestRated.id !== bestValue?.id && bestRated.id !== bestDeal?.id) {
      recs.push({
        type: 'Top Rated ⭐',
        product: bestRated,
        reason: `${bestRated.rating}/5.0 rating`,
      });
    }

    res.json({ recommendations: recs });
  } catch (err) {
    res.status(500).json({ error: 'Recommendation error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  if (!ANTHROPIC_API_KEY) console.warn('⚠️ No ANTHROPIC_API_KEY set!');
});
