import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://gymgear-frontend5.vercel.app';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'Backend running!', time: new Date().toISOString() });
});

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Anthropic-Version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Find 10 ${categoryName} with current prices. Return JSON only: [{"name":"product","brand":"brand","regularPrice":100,"salePrice":80,"discount":"20%","retailer":"Amazon","url":"https://...","quality":8,"rating":4.5}]`,
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

app.post('/api/recommendations', (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ recommendations: [] });
    }

    const recs = [];

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
  if (!ANTHROPIC_API_KEY) console.warn('⚠️ No ANTHROPIC_API_KEY set!');
});