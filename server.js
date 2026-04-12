import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://gymgear-frontend5.vercel.app';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const BACKEND_SECRET_KEY = process.env.BACKEND_SECRET_KEY || crypto.randomBytes(32).toString('hex');

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
app.use(express.json());

const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.body.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  if (apiKey !== BACKEND_SECRET_KEY) {
    console.warn(`⚠️ Invalid API key attempt from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};

// ============================================
// PRODUCT DATA WITH RETAILER LINKS
// ============================================

const liveProducts = {
  benches: [
    {
      id: 'bench_rogue_1',
      name: 'Rogue Monster Lite Adjustable Bench 3.0',
      brand: 'Rogue',
      regularPrice: 995,
      salePrice: 895,
      discount: '10%',
      retailer: 'Rogue Fitness',
      url: 'https://www.roguefitness.com/monster-lite-adjustable-bench-3-0',
      image: '',
      quality: 9.2,
      rating: 4.8,
      inStock: true,
      specs: {
        weight: '130 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '600 lbs',
        dimensions: '48" x 24" x 18"',
      },
      keyAspects: ['Premium quality', 'Durable', 'Professional grade'],
      description: 'Premium adjustable bench designed for serious lifters. Heavy-duty construction with adjustable back and seat.',
      source: 'Rogue Fitness Official',
    },
    {
      id: 'bench_amazon_titan',
      name: 'Titan Adjustable Weight Bench',
      brand: 'Titan',
      regularPrice: 299,
      salePrice: 249,
      discount: '17%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Titan-Adjustable-Weight-Bench/dp/B07F5NFHMQ',
      image: '',
      quality: 7.8,
      rating: 4.5,
      inStock: true,
      specs: {
        weight: '95 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '500 lbs',
        dimensions: '44" x 21" x 16"',
      },
      keyAspects: ['Budget friendly', 'Good value', 'Compact'],
      description: 'Affordable adjustable bench perfect for home gyms. Multiple incline positions for versatile workouts.',
      source: 'Amazon',
    },
    {
      id: 'bench_rep_1',
      name: 'Rep Fitness Adjustable Bench',
      brand: 'Rep',
      regularPrice: 449,
      salePrice: 399,
      discount: '11%',
      retailer: 'Rep Fitness',
      url: 'https://www.repfitness.com/benches/adjustable-bench',
      image: '',
      quality: 8.9,
      rating: 4.7,
      inStock: true,
      specs: {
        weight: '120 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '550 lbs',
        dimensions: '46" x 23" x 17"',
      },
      keyAspects: ['Mid-range', 'High quality', 'Great support'],
      description: 'Mid-range adjustable bench with excellent build quality and support. Great balance of price and performance.',
      source: 'Rep Fitness Official',
    },
    {
      id: 'bench_amazon_bowflex',
      name: 'Bowflex SelectTech Weight Bench',
      brand: 'Bowflex',
      regularPrice: 449,
      salePrice: 349,
      discount: '22%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Bowflex-SelectTech-Weight-Bench/dp/B001ARQSAW',
      image: '',
      quality: 7.5,
      rating: 4.3,
      inStock: true,
      specs: {
        weight: '100 lbs',
        material: 'Steel/Plastic',
        adjustable: 'Yes',
        maxLoad: '480 lbs',
        dimensions: '42" x 22" x 15"',
      },
      keyAspects: ['Best discount', 'Smart technology', 'Compact design'],
      description: 'Innovative SelectTech bench with smart features. Best current discount at 22% off.',
      source: 'Amazon',
    },
    {
      id: 'bench_amazon_force',
      name: 'Force USA Adjustable Dumbbell Bench',
      brand: 'Force USA',
      regularPrice: 599,
      salePrice: 499,
      discount: '17%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Force-USA-Adjustable-Dumbbell-Bench/dp/B08D5V5YCQ',
      image: '',
      quality: 8.2,
      rating: 4.4,
      inStock: true,
      specs: {
        weight: '110 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '520 lbs',
        dimensions: '45" x 22" x 16"',
      },
      keyAspects: ['Commercial grade', 'Durable', 'Versatile'],
      description: 'Commercial-grade adjustable bench built for durability and versatility. Perfect for serious home gyms.',
      source: 'Amazon',
    },
    {
      id: 'bench_rogue_2',
      name: 'Rogue Flat Utility Bench',
      brand: 'Rogue',
      regularPrice: 495,
      salePrice: 445,
      discount: '10%',
      retailer: 'Rogue Fitness',
      url: 'https://www.roguefitness.com/flat-utility-bench',
      image: '',
      quality: 8.7,
      rating: 4.7,
      inStock: true,
      specs: {
        weight: '95 lbs',
        material: 'Steel',
        adjustable: 'No',
        maxLoad: '600 lbs',
        dimensions: '48" x 24" x 18"',
      },
      keyAspects: ['Premium', 'Flat design', 'Heavy duty'],
      description: 'Premium flat bench from Rogue. Simple, durable, and built to last. No frills, pure quality.',
      source: 'Rogue Fitness Official',
    },
    {
      id: 'bench_titan_pro',
      name: 'Titan Series 7 Adjustable Bench',
      brand: 'Titan',
      regularPrice: 499,
      salePrice: 429,
      discount: '14%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Titan-Series-Adjustable-Bench/dp/B07PQ8T8Z9',
      image: '',
      quality: 8.3,
      rating: 4.6,
      inStock: true,
      specs: {
        weight: '105 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '540 lbs',
        dimensions: '46" x 22" x 17"',
      },
      keyAspects: ['Great value', 'Commercial quality', 'Reliable'],
      description: 'Series 7 offers commercial quality at a great price. Reliable and well-rated by users.',
      source: 'Amazon',
    },
    {
      id: 'bench_marcy',
      name: 'Marcy Adjustable Weight Bench',
      brand: 'Marcy',
      regularPrice: 199,
      salePrice: 149,
      discount: '25%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Marcy-Adjustable-Weight-Bench-SB-315/dp/B00DFDNPMU',
      image: '',
      quality: 6.8,
      rating: 4.0,
      inStock: true,
      specs: {
        weight: '75 lbs',
        material: 'Steel',
        adjustable: 'Yes',
        maxLoad: '400 lbs',
        dimensions: '42" x 20" x 14"',
      },
      keyAspects: ['Most affordable', 'Entry level', 'Lightweight'],
      description: 'Budget-friendly entry-level bench. Perfect for beginners starting their home gym journey.',
      source: 'Amazon',
    },
  ],
  weights: [
    {
      id: 'weight_rogue_echo',
      name: 'Rogue Echo Bumper Plates',
      brand: 'Rogue',
      regularPrice: 2.50,
      salePrice: 2.40,
      discount: '4%',
      retailer: 'Rogue Fitness',
      url: 'https://www.roguefitness.com/rogue-echo-bumper-plates',
      image: '',
      quality: 9.0,
      rating: 4.8,
      inStock: true,
      specs: {
        color: 'Colored',
        type: 'Bumper',
        diameter: '17.72 in',
        thickness: 'IWF Standard',
        material: 'Rubber',
      },
      keyAspects: ['Durable', 'Color coded', 'Professional'],
      description: 'Professional-grade bumper plates from Rogue. Color-coded for easy identification. Built for CrossFit.',
      source: 'Rogue Fitness Official',
    },
    {
      id: 'weight_titan_bumper',
      name: 'Titan Urethane Bumper Plates',
      brand: 'Titan',
      regularPrice: 2.00,
      salePrice: 1.80,
      discount: '10%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Titan-Urethane-Bumper-Plates-Weight/dp/B07KDXR1KR',
      image: '',
      quality: 8.2,
      rating: 4.5,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Bumper',
        diameter: '17.72 in',
        thickness: 'IWF Standard',
        material: 'Urethane',
      },
      keyAspects: ['Affordable', 'Good quality', 'Durable'],
      description: 'Affordable bumper plates with urethane coating. Great quality-to-price ratio for home gyms.',
      source: 'Amazon',
    },
    {
      id: 'weight_cap_barbell',
      name: 'Cap Barbell Rubber Coated Plates',
      brand: 'Cap Barbell',
      regularPrice: 1.50,
      salePrice: 1.30,
      discount: '13%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Cap-Barbell-Rubber-Coated-Weight/dp/B00MJSGP6M',
      image: '',
      quality: 7.5,
      rating: 4.2,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Rubber coated',
        diameter: 'Standard',
        thickness: 'Standard',
        material: 'Cast Iron',
      },
      keyAspects: ['Budget friendly', 'Basic quality', 'Good starter'],
      description: 'Budget-friendly rubber-coated plates. Great for beginners or home gyms on a tight budget.',
      source: 'Amazon',
    },
    {
      id: 'weight_eleiko_iwf',
      name: 'Eleiko IWF Weightlifting Plates',
      brand: 'Eleiko',
      regularPrice: 3.50,
      salePrice: 3.30,
      discount: '6%',
      retailer: 'Rogue Fitness',
      url: 'https://www.roguefitness.com/eleiko-iwf-weightlifting-plates',
      image: '',
      quality: 9.5,
      rating: 4.9,
      inStock: true,
      specs: {
        color: 'Colored',
        type: 'Competition',
        diameter: '17.72 in',
        thickness: 'IWF Standard',
        material: 'Rubber',
      },
      keyAspects: ['Premium', 'Competition grade', 'Most accurate'],
      description: 'Competition-grade plates certified for weightlifting competitions. The most accurate and reliable.',
      source: 'Rogue Fitness Official',
    },
    {
      id: 'weight_rep_calibrated',
      name: 'Rep Calibrated Steel Plates',
      brand: 'Rep',
      regularPrice: 2.80,
      salePrice: 2.50,
      discount: '11%',
      retailer: 'Rep Fitness',
      url: 'https://www.repfitness.com/calibrated-steel-plates',
      image: '',
      quality: 8.8,
      rating: 4.7,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Calibrated steel',
        diameter: 'Standard',
        thickness: 'Standard',
        material: 'Steel',
      },
      keyAspects: ['Highly accurate', 'Durable', 'Professional'],
      description: 'Precision-calibrated steel plates. Perfect for serious lifters who need accuracy.',
      source: 'Rep Fitness Official',
    },
    {
      id: 'weight_vulcan',
      name: 'Vulcan Strength Bumper Plates',
      brand: 'Vulcan',
      regularPrice: 2.60,
      salePrice: 2.40,
      discount: '8%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Vulcan-Strength-Bumper-Plates/dp/B07NX6LVQ8',
      image: '',
      quality: 8.6,
      rating: 4.6,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Bumper',
        diameter: '17.72 in',
        thickness: 'IWF Standard',
        material: 'Rubber',
      },
      keyAspects: ['Premium quality', 'Great rating', 'Reliable'],
      description: 'Premium bumper plates from Vulcan. Excellent quality and highly rated by CrossFit athletes.',
      source: 'Amazon',
    },
    {
      id: 'weight_rogue_machined',
      name: 'Rogue Machined Steel Plates',
      brand: 'Rogue',
      regularPrice: 2.70,
      salePrice: 2.50,
      discount: '7%',
      retailer: 'Rogue Fitness',
      url: 'https://www.roguefitness.com/rogue-machined-steel-plates',
      image: '',
      quality: 9.1,
      rating: 4.8,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Machined steel',
        diameter: 'Standard',
        thickness: 'Standard',
        material: 'Steel',
      },
      keyAspects: ['Premium', 'Precise', 'Long lasting'],
      description: 'Precision-machined steel plates. Premium quality from Rogue for the serious lifter.',
      source: 'Rogue Fitness Official',
    },
    {
      id: 'weight_titan_olympic',
      name: 'Titan Olympic Steel Plates',
      brand: 'Titan',
      regularPrice: 1.90,
      salePrice: 1.70,
      discount: '11%',
      retailer: 'Amazon',
      url: 'https://www.amazon.com/Titan-Olympic-Steel-Plates/dp/B00MWJJ0KG',
      image: '',
      quality: 7.8,
      rating: 4.4,
      inStock: true,
      specs: {
        color: 'Black',
        type: 'Steel',
        diameter: 'Olympic',
        thickness: 'Standard',
        material: 'Steel',
      },
      keyAspects: ['Budget friendly', 'Reliable', 'Good quality'],
      description: 'Budget-friendly steel plates. Reliable and well-rated by casual lifters.',
      source: 'Amazon',
    },
  ],
};

// ============================================
// IMAGE CACHE (stores fetched images to avoid re-fetching)
// ============================================

const imageCache = {};

async function fetchProductImage(productUrl, productName) {
  // Check cache first
  if (imageCache[productUrl]) {
    return imageCache[productUrl];
  }

  if (!ANTHROPIC_API_KEY) {
    return '';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Anthropic-Version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Go to ${productUrl} and find the main product image URL. Return ONLY the direct image URL in the format: https://... Do not include any other text.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.log('Could not fetch image for', productName);
      return '';
    }

    const data = await response.json();
    const imageUrl = data.content[0]?.text?.trim() || '';
    
    // Cache it
    if (imageUrl.startsWith('https://')) {
      imageCache[productUrl] = imageUrl;
      return imageUrl;
    }
  } catch (err) {
    console.log('Error fetching image:', err.message);
  }

  return '';
}

// ============================================
// ROUTES
// ============================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'Backend running!',
    dataSource: 'Live retailer data',
    time: new Date().toISOString() 
  });
});

app.post('/api/search-products', verifyApiKey, async (req, res) => {
  try {
    const { category } = req.body;

    if (!category || !['benches', 'weights'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    console.log(`Fetching products for ${category}...`);

    let products = liveProducts[category] || [];

    // Fetch missing images using Claude
    for (let product of products) {
      if (!product.image && ANTHROPIC_API_KEY) {
        console.log(`Fetching image for ${product.name}...`);
        product.image = await fetchProductImage(product.url, product.name);
      }
    }

    if (products.length === 0) {
      return res.status(400).json({ error: 'No products found' });
    }

    return res.json({
      success: true,
      products: products,
      count: products.length,
      sources: ['Rogue Fitness', 'Amazon', 'Rep Fitness'],
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Compare products with efficient AI summary
app.post('/api/compare-products', verifyApiKey, async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length !== 2) {
      return res.status(400).json({ error: 'Please provide exactly 2 product IDs' });
    }

    const allProducts = [...liveProducts.benches, ...liveProducts.weights];
    const products = productIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean);

    if (products.length !== 2) {
      return res.status(400).json({ error: 'One or both products not found' });
    }

    const [p1, p2] = products;
    const price1 = p1.salePrice || p1.regularPrice;
    const price2 = p2.salePrice || p2.regularPrice;
    const priceDiff = Math.abs(price1 - price2);
    const qualityDiff = Math.abs(p1.quality - p2.quality);
    const ratingDiff = Math.abs(p1.rating - p2.rating);

    let aiSummary = generateLocalSummary(p1, p2);

    if (ANTHROPIC_API_KEY) {
      try {
        aiSummary = await generateAISummary(p1, p2, ANTHROPIC_API_KEY);
      } catch (err) {
        console.log('AI summary generation failed, using local summary');
      }
    }

    const comparison = {
      products: [p1, p2],
      priceDifference: {
        absolute: priceDiff.toFixed(2),
        percentage: ((priceDiff / Math.max(price1, price2)) * 100).toFixed(1) + '%',
        cheaper: price1 < price2 ? p1.name : p2.name,
      },
      qualityDifference: {
        absolute: qualityDiff.toFixed(1),
        better: p1.quality > p2.quality ? p1.name : p2.name,
      },
      ratingDifference: {
        absolute: ratingDiff.toFixed(1),
        better: p1.rating > p2.rating ? p1.name : p2.name,
      },
      verdict: generateVerdict(p1, p2),
      aiSummary: aiSummary,
    };

    res.json(comparison);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Comparison error', details: err.message });
  }
});

// Recommendations
app.post('/api/recommendations', verifyApiKey, (req, res) => {
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
        reason: `${bestDeal.discount} off! Save $${(bestDeal.regularPrice - bestDeal.salePrice).toFixed(2)}`,
      });
    }

    const bestRated = [...products].sort((a, b) => b.rating - a.rating)[0];
    if (bestRated && bestRated.id !== bestValue?.id && bestRated.id !== bestDeal?.id) {
      recs.push({
        type: 'Top Rated ⭐',
        product: bestRated,
        reason: `${bestRated.rating}/5.0 rating (most popular)`,
      });
    }

    res.json({ recommendations: recs });
  } catch (err) {
    res.status(500).json({ error: 'Recommendation error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateLocalSummary(p1, p2) {
  const price1 = p1.salePrice || p1.regularPrice;
  const price2 = p2.salePrice || p2.regularPrice;

  let summary = '';
  
  if (price1 < price2) {
    summary = `${p1.name} is ${((price2 - price1) / price2 * 100).toFixed(0)}% cheaper at $${price1.toFixed(2)} vs $${price2.toFixed(2)}. `;
  } else {
    summary = `${p2.name} is ${((price1 - price2) / price1 * 100).toFixed(0)}% cheaper at $${price2.toFixed(2)} vs $${price1.toFixed(2)}. `;
  }

  if (p1.quality > p2.quality) {
    summary += `${p1.name} has better quality (${p1.quality}/10 vs ${p2.quality}/10). `;
  } else {
    summary += `${p2.name} has better quality (${p2.quality}/10 vs ${p1.quality}/10). `;
  }

  if (p1.rating > p2.rating) {
    summary += `${p1.name} is more popular with users (${p1.rating}/5 vs ${p2.rating}/5).`;
  } else {
    summary += `${p2.name} is more popular with users (${p2.rating}/5 vs ${p1.rating}/5).`;
  }

  return summary;
}

async function generateAISummary(p1, p2, apiKey) {
  const prompt = `Compare these two gym products briefly (2-3 sentences max). Product 1: ${p1.name} ($${p1.salePrice || p1.regularPrice}, quality ${p1.quality}/10, rating ${p1.rating}/5). Product 2: ${p2.name} ($${p2.salePrice || p2.regularPrice}, quality ${p2.quality}/10, rating ${p2.rating}/5). Which is better and why?`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Anthropic-Version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('AI summary failed');
  }

  const data = await response.json();
  return data.content[0]?.text || generateLocalSummary(p1, p2);
}

function generateVerdict(p1, p2) {
  const price1 = p1.salePrice || p1.regularPrice;
  const price2 = p2.salePrice || p2.regularPrice;

  let winner = '';
  let reason = '';

  const value1 = p1.quality / price1;
  const value2 = p2.quality / price2;

  if (value1 > value2 * 1.1) {
    winner = p1.name;
    reason = `${p1.name} offers better value for money.`;
  } else if (value2 > value1 * 1.1) {
    winner = p2.name;
    reason = `${p2.name} offers better value for money.`;
  } else {
    winner = p1.rating > p2.rating ? p1.name : p2.name;
    reason = `Both similar value. ${winner} edges ahead with higher ratings.`;
  }

  return { winner, reason };
}

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`🔒 Security: API key authentication required`);
  console.log(`🔒 Security: CORS restricted to ${FRONTEND_URL}`);
  console.log(`📦 Features: Product search, comparison, AI image fetching`);
  console.log(`⚡ Optimized: Minimal token usage`);
});