// GymGear Compare - Backend Server for Render.com
// This server handles all Claude API calls securely

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

// Middleware
app.use(cors({
  origin: FRONTEND_URL
}));
app.use(express.json());

// ============================================
// ROUTES
// ============================================

// Health check endpoint (for monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Backend is running!',
    time: new Date().toISOString()
  });
});

// Search products endpoint
app.post('/api/search-products', async (req, res) => {
  try {
    const { category } = req.body;

    // Validate API key
    if (!ANTHROPIC_API_KEY) {
      console.error('ERROR: ANTHROPIC_API_KEY environment variable not set!');
      return res.status(500).json({ 
        error: 'Server configuration error: API key not found',
        hint: 'Make sure ANTHROPIC_API_KEY is set in Render environment variables'
      });
    }

    // Validate category
    if (!category || (category !== 'benches' && category !== 'weights')) {
      return res.status(400).json({ 
        error: 'Invalid category. Must be "benches" or "weights"'
      });
    }

    console.log(`Searching for ${category}...`);

    const categoryName = category === 'benches' ? 'weight benches' : 'weight plates';
    const categoryQuery = category === 'benches'
      ? 'best weight benches 2024 2025 price amazon rogue titan rep fitness'
      : 'best weight plates 2024 2025 price amazon rogue titan eleiko calibrated';

    // Call Claude API with web search
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
            content: `Search the internet RIGHT NOW for the top 15 ${categoryName} currently available for sale. Find REAL current pricing and sales from major retailers.

Search for: ${categoryQuery}

Return ONLY a valid JSON array with this exact structure (no markdown, no explanation, just JSON):
[
  {
    "name": "Exact product name",
    "brand": "Brand name",
    "regularPrice": 299.99,
    "salePrice": 249.99,
    "discount": "17%",
    "retailer": "Retailer name (Amazon, Rogue, Titan, etc)",
    "url": "Full working URL to the product",
    "quality": 8.5,
    "rating": 4.5,
    "inStock": true,
    "specs": {
      "spec1": "value1",
      "spec2": "value2"
    },
    "keyAspects": ["aspect1", "aspect2"]
  }
]

IMPORTANT:
1. Find REAL products with REAL current prices from web search
2. Include actual sale prices if on sale
3. Calculate discount percentage
4. Provide full working URLs
5. Include all relevant specs
6. Use real ratings from websites
7. Check stock status
8. Be specific and accurate`,
          },
        ],
      }),
    });

    // Check if API call was successful
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API error:', errorData);
      return res.status(response.status).json({
        error: `Claude API error: ${errorData.error?.message || 'Unknown error'}`,
        status: response.status
      });
    }

    const data = await response.json();

    if (data.content && data.content.length > 0) {
      let textContent = '';

      // Collect all text content from response
      for (let block of data.content) {
        if (block.type === 'text') {
          textContent += block.text;
        }
      }

      // Extract JSON array from response
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        try {
          const parsedProducts = JSON.parse(jsonMatch[0]);
          
          // Validate and sanitize products
          const productsWithIds = parsedProducts
            .filter(p => p.name && p.brand && p.regularPrice)
            .map((p, idx) => ({
              ...p,
              id: Math.random().toString(36).substr(2, 9),
              priceUnit: category === 'weights' ? 'per lb' : '',
            }));

          console.log(`Found ${productsWithIds.length} products`);

          return res.json({
            success: true,
            products: productsWithIds,
            timestamp: new Date().toISOString(),
            count: productsWithIds.length
          });
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          return res.status(400).json({
            error: 'Failed to parse product data from AI response',
            details: parseError.message,
            hint: 'Claude may have returned invalid JSON'
          });
        }
      } else {
        console.error('No JSON array found in response');
        return res.status(400).json({
          error: 'No products found in search results',
          hint: 'Try searching again or check your API key'
        });
      }
    } else {
      console.error('No content in Claude response');
      return res.status(400).json({
        error: 'Empty response from Claude API',
      });
    }
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message,
      type: error.constructor.name
    });
  }
});

// Get recommendations endpoint (runs on server for efficiency)
app.post('/api/recommendations', (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ recommendations: [] });
    }

    const recommendations = [];

    // Best value (quality/price ratio)
    const bestValue = [...products].sort((a, b) => {
      const priceA = a.salePrice || a.regularPrice;
      const priceB = b.salePrice || b.regularPrice;
      const ratioA = a.quality / priceA;
      const ratioB = b.quality / priceB;
      return ratioB - ratioA;
    })[0];

    if (bestValue) {
      const price = bestValue.salePrice || bestValue.regularPrice;
      recommendations.push({
        type: 'Best Value',
        product: bestValue,
        reason: `Highest quality-to-price ratio. Get ${bestValue.quality}/10 quality at just $${price.toFixed(2)}.`,
      });
    }

    // Best sale/discount
    const bestDeal = [...products]
      .filter((p) => p.discount && parseFloat(p.discount) > 0)
      .sort((a, b) => parseFloat(b.discount) - parseFloat(a.discount))[0];

    if (bestDeal && bestDeal.id !== bestValue?.id) {
      const savings = (bestDeal.regularPrice - bestDeal.salePrice).toFixed(2);
      recommendations.push({
        type: 'Hot Deal 🔥',
        product: bestDeal,
        reason: `${bestDeal.discount} OFF! Save $${savings}. Was $${bestDeal.regularPrice.toFixed(2)}, now $${bestDeal.salePrice.toFixed(2)}.`,
      });
    }

    // Best rated
    const bestRated = [...products].sort((a, b) => b.rating - a.rating)[0];
    if (bestRated && bestRated.id !== bestValue?.id && bestRated.id !== bestDeal?.id) {
      recommendations.push({
        type: 'Top Rated ⭐',
        product: bestRated,
        reason: `Highest customer rating at ${bestRated.rating}/5.0. Users love this product!`,
      });
    }

    res.json({ recommendations });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      details: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Search endpoint: POST http://localhost:${PORT}/api/search-products`);
  console.log(`⚙️  Recommendations endpoint: POST http://localhost:${PORT}/api/recommendations`);
  
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY environment variable not set!');
    console.warn('Set it in Render dashboard → Environment Variables');
  }
});
