// GymGear Compare Pro  --  Complete Sample Server v6
// All 20 categories. Discount fields. bestChoice flags. No API calls.

import express from 'express';
const app = express();
// Render sits behind a proxy: without this, req.ip is the LB address and every
// visitor shares ONE rate-limit bucket (2026-07-09 security review).
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean)
  .concat([
    'https://gymgear-frontend5.vercel.app',
    'https://gymgearcompare.com',
    'https://www.gymgearcompare.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ]);

app.use(express.json());
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');next()});
app.use((req,res,next)=>{
  const o=req.headers.origin||'';
  if(ALLOWED_ORIGINS.includes(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin')}
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Site-Key');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
});
const ratemap=new Map();
// Evict idle IPs so the map can't grow unbounded on a public endpoint.
setInterval(()=>{
  const cut=Date.now()-60000;
  for(const [ip,hits] of ratemap){const live=hits.filter(t=>t>cut);if(live.length)ratemap.set(ip,live);else ratemap.delete(ip);}
},5*60000).unref();
app.use((req,res,next)=>{
  if(req.path==='/health')return next();
  const ip=req.ip||'x',now=Date.now();
  const hits=(ratemap.get(ip)||[]).filter(t=>now-t<60000);
  if(hits.length>=60)return res.status(429).json({error:'Too many requests.'});
  hits.push(now);ratemap.set(ip,hits);next();
});
app.use('/api',(req,res,next)=>{
  const o=req.headers.origin||'',r=req.headers.referer||'';
  const originOk=ALLOWED_ORIGINS.includes(o)||ALLOWED_ORIGINS.some(x=>r.startsWith(x));
  if(!originOk)return res.status(403).json({error:'Forbidden'});
  // Secret key check  --  rejects requests not coming from our frontend
  const SITE_KEY=process.env.SITE_KEY||'';
  if(SITE_KEY&&req.headers['x-site-key']!==SITE_KEY)return res.status(403).json({error:'Forbidden'});
  next();
});

// Helper: build a product entry
// bestChoice:true  → shows "Best Choice" green badge
// salePrice set    → shows red discount badge + original price struck through
// Product image URLs  --  sourced from brand CDNs (Cloudinary, Shopify, etc.)
const IMGS = {
  'rogue-mb2':          'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Weight%20Benches/MONSTERBENCH2-0-MG/RF0853-Premium-Textured-Foam-Standard_wcnr4b.png',
  'rogue-flat2':        'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Weight%20Benches/Flat%20Utility%20Benches/RA1362/RA1362-Textured-Pad-H_r6qelt.png',
  'rogue-ohio':         'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Weightlifting%20Bars%20and%20Plates/Barbells/Mens%2020KG%20Barbells/RA0539-BLOX/RA0539-BLOX-TH_ekloct.png',
  'rogue-deadlift':     'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Weightlifting%20Bars%20and%20Plates/Barbells/Mens%2020KG%20Barbells/RA0963-BLBR/RA0963-BLBR-h_y5edwu.png',
  'rogue-fold':         'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Weight%20Benches/RA1929/RA1929-H_aagpvs.png',
  'rogue-hg2':          'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Weightlifting%20Bars%20and%20Plates/Plates/Bumper%20Plates/HG22908/HG22908-H_ihyr6o.png',
  'rogue-echo':         'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/2025%20Plate%20Header%20Update/Rogue-Echo-Bumper-Plate-GFX_sy8kz2.png',
  'rogue-hex':          'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Conditioning/Strength%20Equipment/Dumbbells/XX7125/XX7125-WEB3_rglczm.png',
  'rogue-kb':           'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Conditioning/Strength%20Equipment/Kettlebells/IP0670/IP0670-H_j6gkfw.png',
  'rogue-echo-bike':    'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Conditioning/Endurance%20/Bikes/ECHOBIKE/ECHOBIKE-H_t5871p.png',
  'rep-fb5000':         'https://repfitness.com/cdn/shop/products/FB-5000-Matte-Thumbnail.jpg?v=1660236706',
  'rep-ab5200':         'https://repfitness.com/cdn/shop/products/AB-5202-MetallicBlack-Thumbnail.jpg?v=1676921578',
  'rep-black':          'https://repfitness.com/cdn/shop/products/Shopify-BP-1000-45-Thumbnail_663c22df-766d-4ea0-be35-d0b4400488cd.jpg?v=1635876002',
  'rep-bands':          'https://repfitness.com/cdn/shop/products/Shopify-Pull-Up-Bands-Yellow-Thumbnail_1d885469-3377-43cb-9a04-d1d634d6a32d.jpg',
  'peloton-bike':       'https://images.ctfassets.net/7vk8puwnesgc/2xURCMwD091uJI4uqrh3UN/755365da4bcac7fff2bc5102f5976530/Metadata-Bike_.jpg',

  'transparent-stim':   'https://www.transparentlabs.com/cdn/shop/files/TL-127_BULK_BLK_30_BC_1_5.png?v=1769104751',
  'transparent-creatine':'https://www.transparentlabs.com/cdn/shop/files/TL_CreatineHMB_30S_U_1_2.png?v=1745537479',
  'transparent-fat':    'https://www.transparentlabs.com/cdn/shop/files/tl_bodyrecomp_120c_1.png',
  'gorilla-mind':       'https://cdn.shopify.com/s/files/1/0369/2580/0493/files/GM_HERO_Mode_CandyApple_1500x1500-_1_2135ba7f-b213-43d3-897c-2348f94042f3.png',
  'gorilla-mind-smooth':'https://cdn.shopify.com/s/files/1/0369/2580/0493/files/GM_HERO_Nitric_FruitPunch_working_020626_1_1.png',
  'momentous-creatine': 'https://www.livemomentous.com/cdn/shop/files/V3_Creatine-90_2000x2000_FEB142025_CC_4.png?v=1755187968&width=800',
  'momentous-omega3':   'https://www.livemomentous.com/cdn/shop/files/Omega3_HERO_Jar.png?v=1776803640&width=800',
  'momentous-recovery': 'https://www.livemomentous.com/cdn/shop/files/Recovery_HERO-Chocolate.png?v=1778013999&width=800',
  'alani-pre':          'https://cdn.shopify.com/s/files/1/0035/4654/6274/files/Stretch_AN-Website-30serv-PWO-PDP-CSD-01_V2.png',

  'rogue-adj-bench':    'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Weight%20Benches/Adjustable%20:%20Incline%20Benches/AB2-0/RA0646-H_usdgje.png',
  'kaged-elite':        'https://www.kaged.com/cdn/shop/files/PWE-FruitPunchFront.png?v=1777643412&width=480',
  'raw-thavage':        'https://cdn.shopify.com/s/files/1/0932/3141/5614/files/thavage-dragon_fruit.webp?v=1767970668',
  // Benches
  'bells-bench':        'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/UTIL-FLT-BEN_Carousel_8_c4dd2ae6-0492-4148-a04e-59caf572266e.jpg',

  // Barbells

  'rep-equalizer':      'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-Curl-HC-Thumbnail.jpg',

  // Dumbbells
  'rep-hex':            'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-DB-3000-35-Thumbnail.jpg',
  'ironmaster-ql':      'https://www.ironmaster.com/mm5/graphics/00000001/1/75_white_2000_5.jpg',
  'cap-hex':            'https://m.media-amazon.com/images/I/81vdmohIw7L._AC_SL1500_.jpg',

  // Plates
  'rep-comp':           'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-BP-5000-45-Thumbnail.jpg?v=1665071877',
  'rep-color':          'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-BP-3000-55-Thumbnail.jpg?v=1665602714',
  'cap-iron':           'https://m.media-amazon.com/images/I/91iC2SXDHuL._AC_SL1500_.jpg',

  // Racks
  'rogue-rm6':          'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Rigs%20and%20Racks/Power%20Racks%20/Monster%20Racks/RM-6/RM-6-SATIN-BLACK-H_hib3ej.png',
  'rogue-r3':           'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Rigs%20and%20Racks/Power%20Racks%20/R-Series%20Racks/XX3803/XX3803-H_xarpcp.png',
  'rep-pr5000':         'https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Pre-ConfiguredPR-50006-PostHigh-End-Thumbnail_3f0eec68-922f-4d0d-b1b1-2c0705bfd3da.jpg',
  'bells-squat':        'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/SS-PR-carousel-primary_adab8745-03c7-4deb-95e1-ce7e91c6948d.jpg',
  'rogue-squat':        'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Rigs%20and%20Racks/Squat%20Stands/S1SQUAT2-0/S1SQUAT2-0-H_peoqgo.png',

  // Cardio
  'concept2-rower':     'https://cms.concept2.com/sites/default/files/2024-02/RowERG_Standard_FlyFrontAngle_Gator_1920px.png',
  'assault-bike':       'https://www.assaultfitness.com/_astro/assault_bike_classic_1_2x_374e588b-597b-4525-926f-5c93e3c1c615.Dt52bxOo_2lIWxK.webp',
  'concept2-ski':       'https://cms.concept2.com/sites/default/files/2026-04/SkiErg.png',
  'nordictrack-1750':   'https://images.contentstack.io/v3/assets/blt40913d6edfec40cc/bltb547cc369ed92033/69fc12c305f910d23c95eb18/C1750_C1250_Sizzle.png',
  'assault-runner':     'https://www.assaultfitness.com/_astro/assault_runner_pro_1_2x_61e19690-ea36-4fe3-94af-e7ed669f8d6d.DPCL6yUh_124t1o.webp',
  'concept2-bikeerg':   'https://cms.concept2.com/sites/default/files/2024-02/BikeErg_Approach_EmptyArm_PM5_Home_1920px.png',

  // Kettlebells
  'rep-kb':             'https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Shopify-KB-3002-20-Thumbnail.jpg',

  // Bands

  'fit-simplify-bands': 'https://m.media-amazon.com/images/I/71S4-NjoTDL._AC_SL1500_.jpg',
  'ironbull-bands':     'https://m.media-amazon.com/images/I/61Nws-24csL._AC_SL1000_.jpg',

  // Clothing  --  Shorts

  // Compression

  // Tanks

  // Hoodies

  // Footwear

  // Sports Bras

  // Supplements  --  Pre-Workout
  'ghost-legend':       'https://cdn.shopify.com/s/files/1/2060/6331/files/LegendBlueRaspberry.webp?v=1739820789',
  'c4-original':        'https://cdn.shopify.com/s/files/1/1492/2278/files/C4AN_1002_Brand_C4YellowLabel_Transition_C4Original_CoreFlavors_BasicPDPs-OG-IBR-Hero-Grey.png?v=1773235672',
  'legion-pulse':       'https://legionathletics.com/wp-content/uploads/2024/03/Pulse-20S-Blue-Raspb.png',

  // Protein
  'on-gold-standard':   'https://m.media-amazon.com/images/I/71UwaEaQBXL._AC_SL1500_.jpg',
  'transparent-whey':   'https://cdn.shopify.com/s/files/1/0866/7664/files/01_chocolate.png',
  'ghost-whey':         'https://www.ghostlifestyle.com/cdn/shop/files/WheyCinnabon_dad4ea71-9343-49a0-ae71-1e0d7d75a8c0.webp',
  'dymatize-iso100':    'https://m.media-amazon.com/images/I/81dCh2H3dZL._AC_SL1500_.jpg',
  'legion-whey':        'https://legionathletics.com/wp-content/uploads/2025/12/Image-1-Carousel-Whey-Concentrate-Chocolate.png',
  'nutricost-whey':     'https://cdn.shopify.com/s/files/1/0222/4128/0074/files/NTC_WPC_Chocolate_2LB_2750CC_Front_Square_906cc793-3c2c-497a-ac90-c8265275b423.jpg?v=1784149278',
  'on-casein':          'https://m.media-amazon.com/images/I/81Q9+v4u60L._AC_SL1500_.jpg',

  // Creatine
  'legion-recharge':    'https://legionathletics.com/wp-content/uploads/2026/04/Image-1-Carousel-Recharge-30S-Strw-Lemonade-Front-1000x1000-Transp.png',
  'nutricost-creatine': 'https://cdn.shopify.com/s/files/1/0222/4128/0074/files/NTC_CreatineMonohydrate_Unflavored_500G_Front_SQUARE_98526928-e1cc-4ff6-9918-430654760159.jpg?v=1760650358',
  'con-cret-creatine':  'https://m.media-amazon.com/images/I/614HxpyhpcL._AC_SL1500_.jpg',

  // Recovery
  'transparent-sleep':  'https://www.transparentlabs.com/cdn/shop/files/TL_SLEEP-RECOVER_120_1_1.png?v=1746018822',
  'legion-lunar':       'https://legionathletics.com/wp-content/uploads/2024/02/Image-1-Carousel-Lunar-MB-Roman-Berezecky.png',
  'on-bcaa':            'https://m.media-amazon.com/images/I/71IbRBLz6yL._AC_SL1500_.jpg',
  'ghost-bcaa':         'https://www.ghostlifestyle.com/cdn/shop/files/BCAAStrawberryWatermelon_94b7d5d6-f695-4ef3-974d-60721ffb8833.webp',
  'nutricost-glutamine':'https://cdn.shopify.com/s/files/1/0222/4128/0074/files/NTC_L-GlutaminePowder_250GMS_Front1.jpg?v=1731089392',

  // Vitamins
  'legion-triumph':     'https://legionathletics.com/wp-content/uploads/2015/08/Image-1-Triumph_carousel-front-transp.png',
  'garden-of-life-mv':  'https://m.media-amazon.com/images/I/81dsMgxMRBL._AC_SL1500_.jpg',
  'opti-men':           'https://m.media-amazon.com/images/I/71UX5bRF74L._AC_SL1500_.jpg',

  // Fat Burners
  'ghost-burn':         'https://www.ghostlifestyle.com/cdn/shop/files/BurnKiwiStrawberry_940c4e1f-5484-4ce3-9e3d-6b724d950323.webp',
  'legion-phoenix':     'https://legionathletics.com/wp-content/uploads/2025/02/Image-1-Carousel-PhoenixSF-v3.0.png',
  'cellucor-clk':       'https://cdn.shopify.com/s/files/1/1492/2278/products/CLK.jpg?v=1652393995',
  'animal-cuts':        'https://cdn.shopify.com/s/files/1/0675/6882/8736/files/Cuts_42packs_1200x1200_455add57-603d-4579-8fdf-c4162d76e1aa.webp?v=1778247475',

  // Gear  --  Belts
  'inzer-forever-belt': 'https://cdn.shopify.com/s/files/1/0078/1192/4053/files/L10_Image.jpg?v=1763613376',
  'gymreapers-lever-belt':'https://cdn.shopify.com/s/files/1/0752/5585/files/10mm-lever-belt-black-black-main.jpg?v=1722021076',
  'schiek-2004-belt':   'https://m.media-amazon.com/images/I/61g1EYqZN3L._AC_SL1477_.jpg',
  'harbinger-foam-belt':'https://m.media-amazon.com/images/I/81OSqX-mqcL._AC_SL1500_.jpg',
  'element26-belt':     'https://cdn.shopify.com/s/files/1/2178/4143/files/1_6e7823c1-767a-4e21-8cdf-e63eecdbaa76.png?v=1743704334',
  'dark-iron-belt':     'https://m.media-amazon.com/images/I/81wGm436LoL._AC_SL1500_.jpg',
  'bells-lever-belt':   'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/LEVR-BLT-PRNT-Carousel-primary_25bf2495-f147-4af0-9dc4-6d2916cde1bc.jpg',

  // Straps
  'versa-gripps-pro':   'https://m.media-amazon.com/images/I/71nNSz9ql2L._AC_SL1500_.jpg',
  'harbinger-padded-straps':'https://cdn.shopify.com/s/files/1/0918/3022/3129/files/g85pzy3nf4fu0scndpcb_6295270b-80fb-4f02-ad56-6f17511f59ab.jpg?v=1784292580',
  'rogue-lifting-straps':'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Straps%20and%20Wraps/Lifting%20Straps/RA0662-Black/RA0662-Black-H_msigpd.png',
  'gymreapers-figure8': 'https://cdn.shopify.com/s/files/1/0752/5585/files/EQUIPMENT-Figure8LiftingStraps-Black-PDP-1-2026-A.jpg?v=1778788066',
  'schiek-1000ls':      'https://m.media-amazon.com/images/I/81D4KnbLcjL._AC_SL1500_.jpg',
  'stoic-straps':       'https://m.media-amazon.com/images/I/71pGvx+AoyL._AC_SL1191_.jpg',
  'ironbull-figure8':   'https://m.media-amazon.com/images/I/71I9fYpFZ6L._AC_SL1500_.jpg',
  'dmoose-straps':      'https://m.media-amazon.com/images/I/71vWlAJYUdL._AC_SL1500_.jpg',
  'serious-steel-straps':'https://m.media-amazon.com/images/I/617ShUAgP2L._AC_SL1500_.jpg',

  // Wraps
  'sbd-wrist-wraps':    'https://cdn.shopify.com/s/files/1/0550/7278/4591/products/6681432719567-1659458832576_711ad6ff-2dcf-4c3a-add5-b276120842a7.jpg',
  'rogue-wrist-wraps':  'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Straps%20and%20Wraps/Wrist%20Wraps/PS000W/PS0015-H_ckrksu.png',
  'inzer-true-black-wraps':'https://inzer.com/cdn/shop/products/TrueBlackWristWrapINZERNET.jpg?crop=center&height=1200&v=1763614364&width=1200',
  'gymreapers-wrist-wraps':'https://cdn.shopify.com/s/files/1/0752/5585/files/wrist-wraps-black-main.jpg?v=1702586698',
  'mark-bell-wraps':    'https://m.media-amazon.com/images/I/91GtjCRNLWL._AC_SL1500_.jpg',
  'schiek-1100tt-wraps':'https://m.media-amazon.com/images/I/71IKg5iOe3L._AC_SL1500_.jpg',
  'harbinger-wraps':    'https://cdn.shopify.com/s/files/1/0918/3022/3129/files/onzwgyohgtsxqqaovtny_1afca7ce-5f00-4f04-9373-6ffdce7cbd87.jpg?v=1745291328',

  // Sleeves
  'sbd-knee-sleeves':   'https://sbdapparel.com/cdn/shop/files/7mmKneeSleeves-1_1024x1024.jpg?v=1755507477',
  'rehband-rx-sleeves': 'https://m.media-amazon.com/images/I/61nxDwPIi6L._AC_SL1000_.jpg',
  'stoic-knee-sleeves': 'https://m.media-amazon.com/images/I/91nXMsoU4zL._SL1500_.jpg',
  'rogue-knee-sleeves': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Protection%20and%20Supports/Knee/TEC0021-BLK/TEC0021-BLK-H_heyjmk.png',
  'gymreapers-knee-sleeves':'https://cdn.shopify.com/s/files/1/0752/5585/files/Knee-Sleeve-Black-Black-side-by-side_efc37093-5a6f-4b58-ae38-da47bf68f168.jpg?v=1721678826',
  'mark-bell-knee-sleeve':'https://m.media-amazon.com/images/I/61iB4GLMOqL._SL1000_.jpg',
  'bear-komplex-sleeves':'https://cdn.shopify.com/s/files/1/0939/5400/files/GreenCamo2.png?v=1742231232',
  'iron-bull-sleeves':  'https://cdn.shopify.com/s/files/1/0268/4682/2569/products/7mmKneeSleeves-Charcoal.webp?v=1671408265',
  'harbinger-knee-sleeves':'https://m.media-amazon.com/images/I/71BovGiDwFL._AC_SL1500_.jpg',

  // Chalk
  'frictionlabs-loose': 'https://cdn.shopify.com/s/files/1/0666/3291/products/6ozFamilyStones_600x600_a17c0c6b-9886-45e6-82c8-99bebd481e64.jpg',
  'frictionlabs-secret-stuff':'https://frictionlabs.com/cdn/shop/files/liquid_chalk_main.png?v=1745861426',
  'black-diamond-chalk':'https://m.media-amazon.com/images/I/61lt6camceL._AC_SL1500_.jpg',
  'primo-chalk':        'https://m.media-amazon.com/images/I/81VC6AASPOL._AC_SL1500_.jpg',
  'metolius-chalk':     'https://m.media-amazon.com/images/I/81kJyR6BtyL._AC_SL1500_.jpg',
  'liquid-grip-chalk':  'https://m.media-amazon.com/images/I/71Gn4krQ9BL._AC_SL1500_.jpg',
  'weightlifting-house-chalk':'https://store.weightliftinghouse.com/cdn/shop/files/WH_Black.png?height=628&pad_color=ffffff&v=1701873092&width=1200',
  // --- harvested 2026-07-19 (brand-first, Amazon fallback) ---
  'rep-ab3000': 'https://cdn.shopify.com/s/files/1/0574/1215/7598/files/AB3002MetallicBlack-Thumbnail.jpg?v=1689106061',
  'rogue-squat-bar': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Weightlifting%20Bars%20and%20Plates/Barbells/Specialty%20Barbells/RA1045-SSDC/RA1045-SSDC-H_ta378p.png',
  'texas-power-bar': 'https://texasstrengthsystems.com/cdn/shop/products/BC-TPB.jpg?v=1531160651',
  'rep-alpine-bar': 'https://repfitness.com/cdn/shop/products/Alpine-20KG-HardChrome-thumbnail.jpg?v=1685639078&width=1920',
  'ironmaster-superbench': 'https://www.ironmaster.com/mm5/graphics/00000001/woo/2016/08/Super-Bench-1.jpg',
  'bells-power-bar': 'https://bellsofsteel.com/cdn/shop/files/POB2-01.jpg?v=1779995445&width=2000',
  'rogue-opb': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Weightlifting%20Bars%20and%20Plates/Barbells/Mens%2020KG%20Barbells/RA0586-BLBR/2024%20Update/RA2895-BLBR-H_ua63b3.png',
  'powerblock-elite': 'https://powerblock.com/cdn/shop/files/elite-usa-knurled-stage-3.jpg?v=1779478753',
  'rep-hex-set': 'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-DB-3000-550-Thumbnail.jpg',
  'rogue-rml390f': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Rigs%20and%20Racks/Power%20Racks%20/Monster%20Lite%20Racks/XX12047/XX12047-h_r4wtbo_uyzuar.png',
  'rogue-sml2': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Rigs%20and%20Racks/Squat%20Stands/Monster%20Lite%20Squat%20Stands/XX7993/XX7993-H_w0rpns.png',
  'rep-pr4000': 'https://repfitness.com/cdn/shop/files/Pre-ConfiguredPR-40006-PostHigh-End-Thumbnail_6bd04dc5-5c47-4376-a1fc-cb0a5b6401a9.jpg?v=1686320455&width=1920',
  'prx-profile-pro': 'https://prxperformance.com/cdn/shop/collections/orange-rack.png?v=1746016588',
  'schwinn-ic4': 'https://www.schwinnfitness.com/cdn/shop/files/schwinn-ic4-indoor-cycling-bike.png?v=1765321048&width=1200',
  'waterrower-oak': 'https://www.waterrower.com/pub/media/catalog/product/cache/e82c7eebeec99833f60e6c91fe77d316/w/a/waterrower-eiche-grey-1.jpg',
  'lifefitness-t3': 'https://shop.lifefitness.com/cdn/shop/products/T3-Treadmill-Go-L.jpg?v=1748945395&width=1024',
  'lf-club-elliptical': 'https://shop.lifefitness.com/cdn/shop/files/club-series-elliptical-se4-black-1000x1000.jpg?v=1748945426',
  'lf-club-treadmill': 'https://shop.lifefitness.com/cdn/shop/files/club-series-treadmill-life-fitness-black-se4-console-black-onyx-1000x1000.jpg?v=1775831264&width=1024',
  'force-usa-g3': 'https://www.forceusa.com/cdn/shop/files/F-G3-V2-02_c7eedc63-4a70-4f74-bb3a-d481a62cf2fb.jpg?v=1757608446&width=1920',
  'force-usa-g6': 'https://www.forceusa.com/cdn/shop/files/F-G6-B-02_d6c91c36-6d0b-4931-8941-f2980b8e3bf4.jpg?v=1757608433&width=1920',
  'force-usa-g20': 'https://www.forceusa.com/cdn/shop/files/F-G20-01.jpg?v=1757613181&width=1920',
  'rep-arcadia': 'https://repfitness.com/cdn/shop/files/FT3500-Studio-product-Thumbnail_jpg.jpg?v=1698271039&width=1920',
  'bells-cable-tower': 'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/pult5-ma-set-revamp-01_3a520045-8547-49e8-ba88-3f3e0864eda4.jpg',
  'bells-ft': 'https://bellsofsteel.us/cdn/shop/files/bos-fct-set-01.jpg?v=1775300833&width=2000',
  'titan-ft': 'https://titan.fitness/cdn/shop/files/400868_01.jpg?v=1740701389&width=1920',
  'bowflex-x2se': 'https://www.bowflex.com/on/demandware.static/-/Sites-nautilus-master-catalog/default/dwca89cc1d/images/bfx/home-gyms/100334/bowflex-xtreme-2-se-home-gym-hero-sqr.png',
  'lifefitness-g7': 'https://shop.lifefitness.com/cdn/shop/products/life-fitness-g7-home-gym-adjustable-bench-1000x1000.jpg?v=1748945422&width=1024',
  'tonal-2': 'https://tonal.com/cdn/shop/files/PDP-Tonal-2-Main.jpg?v=1778252033&width=2000',
  'hs-iso-row': 'https://shop.lifefitness.com/cdn/shop/products/hammer-strength-plate-loaded-iso-later-rowing-machine-charcoal-charcoal-front-1000x1000.jpg?v=1748945275&width=1024',
  'rogue-ghd': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/RF0594-H_mtskwz.jpg',
  'hs-leg-press': 'https://shop.lifefitness.com/cdn/shop/files/plate-loaded-linear-leg-press-charcoalframe-blackuph_1000x1000_5c4d5373-804c-4c7c-9f66-9abcfbde43b8.jpg?v=1748945307&width=1024',
  'rogue-mat-bundle': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Gear%20and%20Accessories/Gym%20Essentials%20/Flooring%20and%20Rubber/HM0001/HM0001-web6_rvwq1u.png',
  'bodysolid-slp500': 'https://strengthwarehouseusa.com/cdn/shop/files/body-solid-sglp500-pro-clubline-leg-press.jpg?v=1709146355',
  'rep-floor-mat': 'https://repfitness.com/cdn/shop/files/Flooring-gf3100-thumbnail.jpg?v=1696621363&width=1801',
  'rogue-bands': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Strength%20Equipment/Training%20Accessories%20/Bands/XX1731/XX1731-H_oqgfv4.png',
  'trx-pro4': 'https://www.trxtraining.com/cdn/shop/files/ASC05291-Final-PRO4-Laydown.jpg?v=1774534307',
  'momentous-protein': 'https://www.livemomentous.com/cdn/shop/files/V3_Chocolate-Plant-Protein_Plant-Protein_Jar_2000x2000_FEB142025_CC.png?v=1740008868&width=2000',
  'rogue-ohio-belt': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Belts%20/Powerlifting/WL0044/WL0044/UPDATED%20WL0044/WL0042-H_kv2rcv.png',
  'sbd-sleeves': 'https://sbdapparel.com/cdn/shop/files/7mmKneeSleeves-1_1024x1024.jpg?v=1755507477',
  'manduka-pro': 'https://www.manduka.com/cdn/shop/files/111011880-PRO71-CAFFE_01.jpg',
  'jade-harmony': 'https://jadeyoga.com/cdn/shop/products/Jade-Yoga-Harmony-Mat-Cover.jpg?v=1631573421',
  'alo-warrior': 'https://cdn.shopify.com/s/files/1/2185/2813/products/W7092R_01.jpg',
  'yune-tohi': 'https://yuneyoga.com/cdn/shop/products/the-rowan-yoga-mat-cotton-exercise-fitness-product-health-yune-co-298.jpg?v=1758305451&width=1024',
  'liforme-original': 'https://liforme.com/cdn/shop/files/Liforme_Classic_Black_Yoga_Mat_Frontview.png?v=1772447172&width=1920',
  'hyperice-vyper': 'https://hyperice.com/cdn/shop/files/vyper-3-pdp-1.png?v=1769126521&width=1200',

  'goruck-kit-bag': 'https://www.goruck.com/cdn/shop/files/kit_bag_black.jpg?v=1776701022&width=480',
  'rx-smart-gear-rope': 'https://cdn.shopify.com/s/files/1/0715/0098/8732/files/99275467-2025-47ca-bef1-80708dd244f4.jpg',
  'crossrope-get-lean': 'https://cdn.shopify.com/s/files/1/0316/7810/3691/products/JRD_4_Lean_820px-4__84175_29aa18d5-ab63-4dff-be89-f24500254655.jpg',
  'rogue-sr-1c': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/catalog/Conditioning/Jump%20Ropes%20/SR%20Series/SR-1/AD0061-XX/AD0061-XX-H_lymkdv.png',
  'bodysolid-exm2500': 'https://m.media-amazon.com/images/I/61b-PBr0OVL._AC_SL1028_.jpg',
  'marcy-mwm990': 'https://m.media-amazon.com/images/I/71E3caZAXOL._AC_SL1500_.jpg',
  'trigger-point-grid': 'https://m.media-amazon.com/images/I/71-MhWa5jWL._AC_SL1500_.jpg',
  "bells-blitz-ski-trainer": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/SKI-BTZ-SET_Carousel_4_b52684d0-5217-4a79-b4f6-7b6bad93a763.jpg?v=1764593515",
  "bells-crumb-bumper-plates": 'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/UMBP-10-carousel-primary.jpg',
  "bells-rackable-ez-curl-bar": 'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/REZC2-BAR_Carousel_3.jpg',
  "bells-ez-curl-bar": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/B43A3090.jpg?v=1764593816",
  "bells-alex-leonidas-onyx-bar": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/Alex-Leonidas-bar-hero_fbfddb92-34e6-4abb-a1f1-efe7bddb385f.jpg?v=1764590965",
  "bells-blitz-mountain-climber-treadmill": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/Mountain_20Climber_20Hero.jpg?v=1764594252",
  "bells-colour-bumper-plates": 'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/CLR-BP-10-carousel-primary.jpg',
  "bells-puzzle-mat-set": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/8-24-pzl-mat-carousel-primary.jpg?v=1764594208",
  "bells-sisyphean-stepper": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/man-climber-01.jpg?v=1764590874",
  "bells-omni-bar": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/omni-arch-carousel-primary.jpg?v=1764595154",
  "bells-functional-trainer-cable-tower": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/STK-FTC-PULT-SET-carousel-primary.jpg?v=1770465995",
  "bells-nuobell-s-adjustable-dumbbells": 'https://cdn.shopify.com/s/files/1/0654/3346/9125/files/nb-s560-pair-thumbnail.jpg',
  "bells-manticore-collegiate-power-rack-prebui": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/MANTICORE-COLLEGIATE-BUILDER-carousel-primary_1a8f47b2-7a5f-453c-8e61-f313722a1695.jpg?v=1766759154",
  "bells-manticore-half-rack-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/HALF-RCK-MTC-PREBLT-BNDL-01.jpg?v=1783681714",
  "bells-manctiore-folding-power-rack-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/FOL-MTC-PREBLT-01.jpg?v=1777374519",
  "bells-roc-foldable-two-post-cage-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/hydra_20folding_20half_20rack_201_3b81694c-330d-420f-8cc1-9d9294f4ae6e.jpg?v=1766759374",
  "bells-hydra-collegiate-power-rack-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/HYDRA-COLLEGIATE-BUILDER-carousel-primary_9be39dec-1b11-46ab-bd25-0e57af6a277b.jpg?v=1766759409",
  "bells-roc-foldable-four-post-cage-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/hydra_20folding_204_20post_201_7b39428e-0149-48d9-829d-604f1dd719df.jpg?v=1764595164",
  "bells-manticore-four-post-power-rack-prebuil": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/4-PST-MTC-PREBLT-BNDL-01.jpg?v=1783681474",
  "bells-manticore-folding-half-rack-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/HLF-FLD-MTC-PREBLT-01.jpg?v=1777374367",
  "bells-manticore-six-post-power-rack-prebuilt": "https://cdn.shopify.com/s/files/1/0654/3346/9125/files/MANTICORE-6POST-carousel-primary_50ec1441-59a1-4060-bedd-cf2e9b4b89dc.jpg?v=1766758768",
  "rep-open-trap-bar": 'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/BB-4210-Wide1-thumbnail.jpg',
  "rep-rep-nighthawk-adjustable-bench": "https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Bench_-_AB-4102_-_Matte_Black_-_thumbnail.jpg?v=1739811408",
  "rep-ghd-glute-ham-developer": "https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-GHD-3000-Thumbnail.jpg?v=1635875992",
  "rep-blackwing-adjustable-bench": 'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/AB-5300-Metallic-Thumbnail.jpg',
  "rep-wall-mounted-rig-pre-selected": "https://cdn.shopify.com/s/files/1/0574/1215/7598/files/black4K10.png?v=1726687661",
  "rep-rig-pre-selected": "https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Rig4000Series14_inMetallicBlackthumbnail.jpg?v=1693328505",
  "rep-pull-up-band": 'https://cdn.shopify.com/s/files/1/0574/1215/7598/products/Shopify-Pull-Up-Bands-Yellow-Thumbnail_1d885469-3377-43cb-9a04-d1d634d6a32d.jpg',
  "rep-short-resistance-bands": 'https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Bands12in-XXXLight-thumbnail.jpg',
  "rep-teton-training-bar-15kg": "https://cdn.shopify.com/s/files/1/0574/1215/7598/files/Teton-15KG-Nickel-thumbnail.jpg?v=1725383893",
  'titan-x3': 'https://cdn.shopify.com/s/files/1/0802/1508/1237/files/401391_01.jpg',
  'titan-t2': 'https://cdn.shopify.com/s/files/1/0802/1508/1237/files/401835_01.jpg',

  'ritual-men': 'https://cdn.shopify.com/s/files/1/0626/8842/8126/files/PDP_EFM18_Pills_Animated.gif',
  'pioneer-gc-belt': 'https://cdn.shopify.com/s/files/1/0693/3060/0182/files/Stock_4_10mm.png',
  'pioneer-straps': 'https://cdn.shopify.com/s/files/1/0693/3060/0182/files/Pioneer-Fitness-Treated-Leather-Lifting-Straps.jpg',
  'pioneer-knee-sleeves': 'https://cdn.shopify.com/s/files/1/0693/3060/0182/files/Pioneer-Competition-Knee-Sleeves-jpg.webp',
  'thorne-whey': '/product-images/thorne-whey.png',
  'thorne-creatine': '/product-images/thorne-creatine.png',
  'thorne-basics': '/product-images/thorne-basics.png',
  "titan-90-lb-straight-stainless-steel-hex-dum": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/421211_01.jpg?v=1777925680",
  "titan-80-lb-straight-stainless-steel-hex-dum": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/421209_01.jpg?v=1777925457",
  "titan-115-lb-straight-stainless-steel-hex-du": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/421216_01.jpg?v=1777927042",
  "titan-plate-loaded-linear-hack-squat-machine": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/401231_01.jpg?v=1779301309",
  "titan-leg-press-hack-squat-machine": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/401486_01.jpg?v=1764184061",
  "titan-110-lb-straight-stainless-steel-hex-du": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/421215_01.jpg?v=1777926988",
  "pioneerfit-leather-oly-lifting-straps-by-pio": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/LeatherOly.png?v=1717448672",
  "pioneerfit-adjustable-heavy-duty-lifting-str": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/HDliftingstraps.png?v=1717448047",
  "pioneerfit-heavy-duty-oly-lifting-straps-by-": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/HDOly.png?v=1717447812",
  "pioneerfit-pioneer-knee-wraps-heavy": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/Pioneer-Knee-Wraps-Heavy.jpg?v=1714068710",
  "pioneerfit-pioneer-guardian-wrist-wraps": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/GuardianWrist_1c6830c2-e3cc-4fb1-bb8e-5fb299c437f0.png?v=1717431535",
  "pioneerfit-pioneer-guardian-knee-wraps": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/GuardianKnee.png?v=1717431506",
  "titan-powerlifting-lever-belt": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/429971_01.jpg?v=1767733747",
  "titan-titan-maxxum-lifting-belts": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/429961_01.jpg?v=1767812677",
  "titan-90-lb-cast-iron-kettlebell": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/422090_01.jpg?v=1777923297",
  "titan-10-kg-cast-iron-kettlebell": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/422152_01.jpg?v=1777919594",
  "titan-22-kg-competition-kettlebell": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/422166_01_3a449211-4926-4d47-9673-843e6fe9335a.jpg?v=1731084111",
  "titan-6-kg-cast-iron-kettlebell": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/422150_01.jpg?v=1777919384",
  "frictionlabs-the-chalk-disc": "https://cdn.shopify.com/s/files/1/0666/3291/files/chalk-discs-hero_1b2003b0-a9dd-4dab-b564-a370be59f844.png?v=1746645594",
  "fringesport-gym-chalk-1lb-8-2oz-blocks": "https://cdn.shopify.com/s/files/1/0049/4272/files/Gym-Chalk-Fringe-Sport-106782973.jpg?v=1718668848",
  "pioneerfit-pioneer-power-chalk-by-bare-grip-": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/IMG_0735-1.jpg?v=1714069703",
  "frictionlabs-alcohol-free-secret-stuff": "https://cdn.shopify.com/s/files/1/0666/3291/files/SSAFShopifyFront.png?v=1716240766",
  "frictionlabs-secret-stuff-80-alcohol-hygieni": "https://cdn.shopify.com/s/files/1/0666/3291/files/SSHShopifyFront.png?v=1706654438",
  "jadeyoga-travel-mat": "https://cdn.shopify.com/s/files/1/0763/3069/products/Jade-Yoga-Mat-Travel-Midnight-Blue.jpg?v=1631574685",
  "jadeyoga-jade-extra-yoga-mat": "https://cdn.shopify.com/s/files/1/0763/3069/files/group_0d5eb761-1c1e-456a-bc94-de4ceef55a14.jpg?v=1725894520",
  "jadeyoga-jade-cork-yoga-mat": "https://cdn.shopify.com/s/files/1/0763/3069/files/2818.jpg?v=1724787182",
  "jadeyoga-fusion-mat": "https://cdn.shopify.com/s/files/1/0763/3069/products/Jade-Yoga-Mat-Fusion-Midnight-Blue.jpg?v=1637350470",
  "jadeyoga-xw-fusion": "https://cdn.shopify.com/s/files/1/0763/3069/products/Jade-Yoga-Fusion-Extra-Wide-Cover.jpg?v=1631576344",
  "fringesport-foam-massage-ball": "https://cdn.shopify.com/s/files/1/0049/4272/files/Foam-Massage-Ball-Fringe-Sport-107002728.jpg?v=1718674869",
  "fringesport-double-lacrosse-ball-peanut": "https://cdn.shopify.com/s/files/1/0049/4272/files/Peanut-Lacrosse-Ball-Fringe-Sport-106964758.jpg?v=1718673696",
  "fringesport-premium-molded-foam-roller-36-x-": "https://cdn.shopify.com/s/files/1/0049/4272/files/Premium-Molded-Foam-Roller-Fringe-Sport-106790196.jpg?v=1718669071",
  "fringesport-liftopus-weightlifting-shoes": "https://cdn.shopify.com/s/files/1/0049/4272/files/Liftopus-Weightlifting-Shoes-Fringe-Sport-107054525.jpg?v=1718676400",
  "goruck-macv-2-safety-boot": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/macv2_coy_lead.jpg?v=1767723117",
  "goruck-macv-2-safety-boot-high-top": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/MACV-2_safety_boot_black_2.jpg?v=1778706696",
  "goruck-shoe-bag": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/16_shoe_bag_1.jpg?v=1767722822",
  "goruck-performance-brief": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Slick_Compression_Shorts.jpg?v=1771901965",
  "goruck-womens-biker-shorts-toughflex": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio77.jpg?v=1767722454",
  "goruck-mens-training-shorts-toughstretch": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/DSC04116.jpg?v=1777485098",
  "goruck-mens-usa-training-shorts-toughstretch": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Men_sUSATrainingShortsCharcoal.webp?v=1782144512",
  "goruck-gym-bag-mesh": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Mesh_Duffel_Black_Lead_first_image.jpg?v=1771964794",
  "goruck-gym-bag-cordura": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Gym_Bag_38L_Black1.jpg?v=1776700302",
  "goruck-gym-bag-waxed-canvas": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GBWC38-0101GymBag38L-WaxedCanvas_Black_NEW_1copy.jpg?v=1773927996",
  "goruck-kit-bag-waxed-canvas": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Kit_Bag_VN_Dark_Oak_1_copy.jpg?v=1767722746",
  "goruck-mens-performance-tank-tough-mesh": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/mens-performance-tank-Black-pdp-1.jpg?v=1767724457",
  "goruck-womens-racerback-tank": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio13.jpg?v=1767725843",
  "goruck-womens-long-sleeve-mock-neck-toughmes": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio67.jpg?v=1767725481",
  "goruck-womens-performance-tank": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio24.jpg?v=1767723703",
  "pioneerfit-dusty-blue-womens-crop-tank": "https://cdn.shopify.com/s/files/1/0693/3060/0182/files/Dusty-blue-crop-front.png?v=1713971985",
  "goruck-training-leggings": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio82.jpg?v=1767720523",
  "goruck-womens-cropped-training-leggings-usa": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio128.jpg?v=1767721024",
  "goruck-womens-training-leggings-usa": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio62.jpg?v=1767720501",
  "goruck-mens-base-layer-bottom": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/Men_sBottomBaseLayer-MerinoWool.jpg?v=1767725421",
  "goruck-stealth-bra-toughflex": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio12.jpg?v=1767724412",
  "goruck-power-bra-toughflex": "https://cdn.shopify.com/s/files/1/0275/4985/9940/files/GORUCKJune2025Studio113.jpg?v=1767724388",
  "fringesport-fringe-crest-zipper-hoodie": "https://cdn.shopify.com/s/files/1/0049/4272/files/Fringe-Crest-Zipper-Hoodie-Fringe-Sport-107066828.jpg?v=1718676868",
  "titan-titan-fitness-hoodie": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/401770_01.jpg?v=1772651256",
  "titan-25-lb-rubber-hex-pair": "https://cdn.shopify.com/s/files/1/0802/1508/1237/files/421025_01.jpg",
};

function p(id,name,brand,price,retailer,url,quality,rating,reviewCount,reviewSource,expertVerdict,expertSource,specs,aspects,opts={}){
  const out={id,name,brand,price,retailer,url,affiliateUrl:'',image:IMGS[id]||null,quality,rating,reviewCount,reviewSource,expertVerdict,expertSource,specs,aspects,bestChoice:opts.bestChoice||false};
  if(opts.salePrice){out.salePrice=opts.salePrice;out.discount=Math.round((1-opts.salePrice/price)*100)}
  // Deals v2: optional hand-curated sale end date (ISO string). Set it only
  // when the real end date is known — never invented. The frontend drops the
  // deal (and its countdown) once this passes; the LLM never sees or writes
  // dates (deals-engine hard rule).
  if(opts.saleEndsAt)out.saleEndsAt=opts.saleEndsAt;
  // Machines/cardio/racks only: compact=true marks units that physically fit
  // a small room / apartment corner (cable tower, rod gyms, folding rowers,
  // bikes, wall-folding racks). The kit builder gates the rest out of tight
  // spaces at product level.
  if(opts.compact)out.compact=true;
  // pro=true marks full/light-commercial gear the GYM PLANNER may spec for a
  // real facility (also stamped in bulk via PRO_IDS below). coverage = sq ft
  // a flooring product covers, so the planner can size an order to a room.
  if(opts.pro)out.pro=true;
  if(opts.coverage)out.coverageSqFt=opts.coverage;
  return out;
}

const PRODUCTS = {

benches:[
  p('rogue-mb2','Monster Utility Bench 2.0','Rogue Fitness',335,'Rogue Fitness','https://www.roguefitness.com/monster-utility-bench-2-0-mg-black',9.4,4.8,104,'Rogue Fitness','The last flat bench you will ever need to buy.','Garage Gym Reviews',{'Capacity':'1,000 lbs','Pad':'Polyurethane','Type':'Flat','Frame':'3×3" 11ga','Made In':'USA'},['American Made','Wheels + Handle','Overbuilt']),
  p('rogue-flat2','Flat Utility Bench 2.0','Rogue Fitness',195,'Rogue Fitness','https://www.roguefitness.com/rogue-flat-utility-bench-2-0',8.8,4.8,635,'Rogue Fitness','Best flat bench for the money, ships fully assembled.','YourWorkoutBook',{'Capacity':'1,000 lbs','Pad':'Polyurethane','Type':'Flat','Weight':'49 lbs','Made In':'USA'},['Ships Assembled','Best Value','American Made']),
  p('rep-fb5000','FB-5000 Competition Bench','Rep Fitness',249,'Rep Fitness','https://repfitness.com/products/fb-5000-competition-flat-bench',9.2,4.9,312,'Rep Fitness','Best flat bench on the market for the money.','Garage Gym Lab',{'Capacity':'1,000 lbs','Pad':'CleanGrip Vinyl','Type':'Flat','IPF Spec':'Yes','Warranty':'10 Years'},['IPF Certified','Tripod Design','Best Value'],{bestChoice:true}),
  p('rep-ab5200','AB-5200 2.0 Adjustable Bench','Rep Fitness',549,'Rep Fitness','https://repfitness.com/products/ab-5200-2-0',9.1,4.8,420,'Rep Fitness','Best adjustable bench  --  11 back positions, 1,000 lb capacity, no wobble.','Garage Gym Lab',{'Capacity':'1,000 lbs','Positions':'11 + Decline','Pad':'CleanGrip Vinyl','Weight':'72 lbs','Warranty':'Lifetime'},['11 Positions','Lifetime Warranty','No Wobble']),
  p('titan-ab','Adjustable Bench V2','Titan Fitness',219,'Titan Fitness','https://www.titanfitness.com/products/adjustable-bench-v2',7.8,4.5,520,'Titan Fitness','Best budget adjustable bench for home gyms.','Garage Gym Reviews',{'Capacity':'600 lbs','Positions':'5','Pad':'Vinyl','Weight':'55 lbs','Made In':'China'},['Budget Pick','5 Positions','Lightweight']),
  p('bells-bench','Utility Bench 2.0','Bells of Steel',173.99,'Bells of Steel','https://bellsofsteel.us/products/flat-utility-bench',9.0,4.8,201,'Bells of Steel','Lifetime warranty and grippy pad that rivals Rogue.','Garage Gym Lab',{'Capacity':'1,000 lbs','Pad':'Grippy Vinyl','Type':'Flat','Warranty':'Lifetime','Tripod':'Yes'},['Lifetime Warranty','Tripod Design','Grippy Pad']),
  p('rep-ab3000','AB-3000 FID Bench','REP Fitness',349.99,'REP Fitness','https://repfitness.com/products/ab-3000-fid-adjustable-bench',9.1,4.8,4200,'Garage Gym Reviews','Best mid-range adjustable bench  --  11 back positions, rock solid, no wobble.',"Garage Gym Reviews",{'Back Positions':'11','Max Weight':'1000 lbs','Width':'12"','Upholstery':'3" Vinyl','Made In':'Taiwan'},['11 Positions','Rock Solid','Best Mid-Range']),
    p('rogue-adj-bench','Adjustable Bench 2.0','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-adjustable-bench-2-0',9.3,4.9,560,'Rogue Fitness','Best adjustable bench from the best brand  --  7 positions, 1,000 lb capacity.','Garage Gym Reviews',{'Capacity':'1,000 lbs','Positions':'7','Pad':'Polyurethane','Weight':'72 lbs','Made In':'USA'},['American Made','7 Positions','Overbuilt']),
  p('rogue-fold','Fold Up Utility Bench','Rogue Fitness',335,'Rogue Fitness','https://www.roguefitness.com/rogue-fold-up-utility-benches',8.5,4.6,78,'Rogue Fitness','Foldable Rogue durability, wall-mountable between sessions.','YourWorkoutBook',{'Capacity':'1,000 lbs','Type':'Foldable','Pad':'Polyurethane','Weight':'48 lbs','Made In':'USA'},['Wall-Mountable','Space Saving','American Made']),
  p('ironmaster-superbench','Super Bench Pro V2','Ironmaster',449,'Ironmaster','https://www.ironmaster.com/products/super-bench-pro/',8.9,4.9,340,'Ironmaster','The most versatile adjustable bench  --  11 angles and a whole attachment ecosystem.','Garage Gym Reviews',{'Capacity':'1,000 lbs','Positions':'11 (0–85°)','Pad':'Firm Vinyl','Attachments':'Dip/Crunch/Leg','Warranty':'10 Years'},['11 Angles','Attachment Ecosystem','Space Efficient']),
  p("rep-rep-nighthawk-adjustable-bench","REP® Nighthawk™ - Adjustable Bench","REP Fitness",449.99,"REP Fitness","https://repfitness.com/products/rep-nighthawk-adjustable-bench",8.9,4.9,375,"REP Fitness","IPF-height ladder bench with 700lb capacity and a 1.57-inch pad gap, for home and light-commercial use.","GymGear Compare",{"Weight Capacity":"700 lbs","Frame Material":"7- and 14-gauge steel","Bench Height":"16.7\" (IPF compliant)","Back Pad Angles":"0, 15, 30, 45, 60, 75, 85 degrees","Pad Gap":"1.57\""},["IPF Height","700lb Capacity","Vertical Storage"]),
  p("rep-blackwing-adjustable-bench","BlackWing™ - Adjustable Bench — Metallic Black / Standard","REP Fitness",599.99,"REP Fitness","https://repfitness.com/products/blackwing-adjustable-bench?variant=42458934542494",9.2,4.9,672,"REP Fitness","A 1,000lb-capacity 11-gauge bench with 72 angle combinations and IPF-legal height, built for serious pressing.","GymGear Compare",{"Weight Capacity":"1,000 lbs","Frame Material":"11-Gauge Steel","Back Pad Angles":"12 positions (-8° to 85°)","Seat Pad Angles":"6 positions (-10° to 45°)","Assembled Weight":"131 lbs"},["1,000lb Capacity","72 Angle Combos","Vertical Storage"]),
],

barbells:[
  p('rogue-ohio','Ohio Bar','Rogue Fitness',305,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-bar',9.5,4.9,2100,'Rogue Fitness','The best all-around barbell ever made.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28.5mm','PSI':'190,000','Finish':'Options','Made In':'USA'},['American Made','All-Purpose','Gold Standard'],{bestChoice:true}),
  p('rogue-deadlift','Ohio Deadlift Bar','Rogue Fitness',395,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-deadlift-bar',9.6,4.9,870,'Rogue Fitness','Best deadlift bar  --  extra whip, aggressive knurl.','Barbend',{'Weight':'20 kg','Shaft':'27mm','PSI':'190,000','Knurl':'Aggressive','Made In':'USA'},['Deadlift Specific','Extra Whip','Aggressive Knurl']),
  p('rogue-squat-bar','Rogue Squat Bar','Rogue Fitness',625,'Rogue Fitness','https://www.roguefitness.com/rogue-squat-bar',9.7,4.9,480,'Rogue Fitness','The stiffer, thicker bar built specifically for heavy squats.','Garage Gym Reviews',{'Weight':'25 kg','Shaft':'32mm','PSI':'190,000','Knurl':'Center + Dual','Made In':'USA'},['Squat Specific','32mm Shaft','Center Knurl']),
  p('texas-power-bar','The Texas Power Bar','Buddy Capps',339,'Texas Strength Systems','https://www.texasstrengthsystems.com/products/texas-power-bar',9.3,4.9,1100,'Barbend','The powerlifting legend  --  stiff, aggressive knurl, American made since 1980.','Barbend',{'Weight':'20 kg','Shaft':'28.5mm','PSI':'190,000','Knurl':'Aggressive','Made In':'USA'},['Powerlifting Icon','Aggressive Knurl','American Made']),
  p('rep-alpine-bar','Pyrros Bar','REP Fitness',399,'REP Fitness','https://repfitness.com/products/alpine-weightlifting-bar-20kg',9.1,4.8,620,'Garage Gym Reviews','Best Olympic bar under $400  --  exceptional spin, beautiful finish.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28mm','PSI':'190,000','Finish':'Chrome','Bearings':'Needle'},['Best Under $400','Needle Bearings','Competition Ready']),
  p('titan-olympic','Olympic Barbell','Titan Fitness',199,'Titan Fitness','https://www.titanfitness.com/products/olympic-barbell',7.8,4.5,410,'Titan Fitness','Best budget Olympic bar under $200.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28mm','PSI':'150,000','Finish':'Black Oxide','Warranty':'1 Year'},['Budget Pick','Good Whip','Entry Level'],{salePrice:169}),
  p('fringe-wonder','Wonder Bar V2','Fringe Sport',249,'Fringe Sport','https://www.fringesport.com/products/wonder-bar-v2',8.4,4.6,520,'Fringe Sport','Best mid-range bar with 10-year warranty.','Barbend',{'Weight':'20 kg','Diameter':'28.5mm','PSI':'190,000','Finish':'Cerakote','Warranty':'10 Years'},['10 Year Warranty','Cerakote Finish','Mid-Range']),
  p('rep-equalizer','EZ Curl Bar','Rep Fitness',119,'Rep Fitness','https://repfitness.com/products/curl-bar',8.2,4.6,284,'Rep Fitness','Best-value EZ curl bar for home gyms.','Garage Gym Reviews',{'Weight':'18 lbs','Length':'47"','Sleeve':'2" Olympic','Knurl':'Medium','PSI':'150,000'},['EZ Curl','Wrist Friendly','Best Value']),
  p('bells-power-bar','Powerlifting Bar 2.0','Bells of Steel',267.99,'Bells of Steel','https://bellsofsteel.us/products/powerlifting-bar?variant=44100586799301',9.2,4.9,1800,'Bells of Steel','Best Rogue alternative  --  Canadian made, aggressive knurl, great for powerlifting.',"Garage Gym Reviews",{'Weight':'20 kg','Shaft':'29mm','PSI':'190,000','Knurl':'Aggressive','Made In':'Canada'},['Canadian Made','Rogue Alternative','190k PSI'],{salePrice:240.96}),
  p('kabuki-power-bar','Kadillac Bar','Kabuki Strength',549,'Kabuki Strength','https://kabukistrength.com/products/kadillac-bar',9.8,5.0,320,'Garage Gym Reviews','The most versatile powerlifting bar ever made  --  adjustable camber, wrist saver.',"Garage Gym Reviews",{'Weight':'25 kg','Shaft':'32mm','Adjustable Camber':'Yes','PSI':'210,000','Made In':'USA'},['Adjustable Camber','Most Versatile','Ultra Premium']),
  p('cap-ob86b','OB-86B Olympic Bar','CAP Barbell',109,'Amazon','https://www.amazon.com/dp/B00JP6LKRY?tag=gymgearcompar-20',6.8,4.2,18000,'Amazon','The most affordable Olympic bar  --  fine for beginners, not for heavy loads.','Barbend',{'Weight':'44 lbs','Shaft':'28mm','PSI':'98,000','Finish':'Chrome','Warranty':'1 Year'},['Budget Entry','Widely Available','Beginner Friendly']),
  p('rogue-opb','Ohio Power Bar 45LB','Rogue Fitness',315,'Rogue Fitness','https://www.roguefitness.com/rogue-45lb-ohio-power-bar-black-zinc',9.6,4.9,732,'Rogue Fitness','The default powerlifting bar in home gyms everywhere  --  stiff, aggressive, lifetime warranty.','Garage Gym Reviews',{'Weight':'45 lbs','Shaft':'29mm','PSI':'205,000','Knurl':'Aggressive + Center','Made In':'USA'},['Powerlifting Default','Center Knurl','American Made']),
  p("bells-rackable-ez-curl-bar","Rackable EZ Curl Bar — Black E-Coat Shaft + Bright Zinc Sleeves","Bells of Steel",154.99,"Bells of Steel","https://bellsofsteel.us/products/rackable-ez-curl-bar?variant=43316236615877",8,4.8,67,"Bells of Steel","A rackable EZ curl bar with a lifetime warranty and center knurl for easier loading from J-cups.","GymGear Compare",{"Shaft diameter":"1.1\" / 28 mm","Bar weight":"31.31 lb / 14.2 kg","Max capacity":"661 lb / 300 kg","Tensile strength":"70,000 PSI","Warranty":"Limited lifetime"},["Lifetime Warranty","Rackable Design","Center Knurl"],{salePrice:139.96}),
  p("bells-ez-curl-bar","EZ Curl Bar (54.5\") — Black E-Coat Shaft + Bright Zinc Sleeves","Bells of Steel",151.99,"Bells of Steel","https://bellsofsteel.us/products/ez-curl-bar?variant=43316303167685",8,4.8,91,"Bells of Steel","Rotating-sleeve EZ curl bar with lifetime warranty and moderate knurl; easier on wrists during curls.","GymGear Compare",{"Diameter":"1.1\" / 28mm","Length":"54.49\" / 1,384mm","Max Capacity":"661 lbs / 300 kg","Tensile Strength":"100,000 PSI","Warranty":"Limited Lifetime"},["Lifetime Warranty","Bushing Sleeves","Wrist Friendly"],{salePrice:105.96}),
  p("bells-alex-leonidas-onyx-bar","Alex Leonidas Onyx Bar","Bells of Steel",383.99,"Bells of Steel","https://bellsofsteel.us/products/alex-leonidas-onyx-bar",9,null,null,"Bells of Steel","Cerakote power bar with 210,000 PSI tensile strength, 1,500-pound capacity and aggressive powerlifting knurl.","GymGear Compare",{"Diameter":"1.14\" / 29mm","Tensile Strength":"210,000 PSI","Max Capacity":"1,500 lbs / 680 kg","Shaft Finish":"Black Cerakote","Warranty":"Lifetime Limited"},["Lifetime Warranty","Cerakote Shaft","210k PSI"],{salePrice:307.97}),
  p("bells-omni-bar","Omni Bar","Bells of Steel",258.99,"Bells of Steel","https://bellsofsteel.us/products/omni-bar",7.5,4.9,12,"Bells of Steel","Arched specialty bar for presses, rows and neutral-grip pull-ups; non-rotating sleeves, cosmetic logo blemish.","GymGear Compare",{"Diameter":"1.26\" / 32mm","Length":"80\" / 2,032mm","Max Capacity":"600 lbs / 272 kg","Loadable Sleeve":"13.94\" / 354mm","Warranty":"Limited Lifetime"},["Lifetime Warranty","Arched Bar","Non-Rotating Sleeves"],{salePrice:207.97}),
  p("rep-open-trap-bar","Open Trap Bar — Wide","REP Fitness",399.99,"REP Fitness","https://repfitness.com/products/open-trap-bar?variant=42225129423006",8.6,4.9,481,"REP Fitness","Open-frame trap bar with a built-in deadlift jack and swappable stainless handles; home use only.","GymGear Compare",{"Static Rating":"1350 lbs","Frame Weight":"58.4 lbs","Usable Sleeve Length":"16.5\"","Handle Width (Wide)":"27.3\" handle to handle","Warranty":"5 years"},["Rackable Design","Deadlift Jack","5-Year Warranty"]),
  p("rep-teton-training-bar-15kg","Teton™ Training Bar - 15kg","REP Fitness",229.99,"REP Fitness","https://repfitness.com/products/teton-training-bar-15kg",8.5,null,null,"REP Fitness","A 25mm needle-bearing weightlifting bar built to IWF female-lifter specs for cleans, snatches and jerks.","GymGear Compare",{"Bar weight":"15kg (33.1 lbs)","Shaft diameter":"25mm","Sleeve rotation":"Needle bearing","Tensile strength":"190ksi","Warranty":"5 years"},["Needle Bearings","IWF Spec","5-Year Warranty"],{salePrice:183.99}),
],

dumbbells:[
  p('rogue-hex','Rubber Hex Dumbbells','Rogue Fitness',475,'Rogue Fitness','https://www.roguefitness.com/rogue-rubber-hex-dumbbells',9.2,4.9,890,'Rogue Fitness','Best rubber hex dumbbells  --  will last decades.','Garage Gym Reviews',{'Handle':'Chrome','Head':'Rubber Hex','Range':'5–100 lbs','Floor Safe':'Yes','Made In':'USA'},['American Made','Chrome Handles','Floor Safe'],{bestChoice:true}),
  p('rep-hex','Rubber Hex Dumbbells','Rep Fitness',295,'Rep Fitness','https://repfitness.com/products/rubber-hex-dumbbell-pairs',8.7,4.7,620,'Rep Fitness','Best value rubber hex  --  hard to tell apart from Rogue.','Garage Gym Lab',{'Handle':'Chrome','Head':'Rubber Hex','Range':'5–100 lbs','Floor Safe':'Yes','Warranty':'2 Years'},['Best Value','Chrome Handles','Floor Safe']),
    p('nuobell-adj','NüoBell 80lb Adjustable Dumbbell','Core Health & Fitness',349,'Amazon','https://www.amazon.com/dp/B097TV3GHK?tag=gymgearcompar-20',9.0,4.7,3200,'Wirecutter','Smoothest adjustable dumbbell  --  round shape feels just like a fixed dumbbell.','Wirecutter',{'Range':'5–80 lbs','Increments':'5 lbs','Shape':'Round','System':'Twist Select','Feels Like':'Fixed DB'},['Round Shape','5 lb Increments','Feels Natural']),
  p('bowflex-552','SelectTech 552 Adjustable','Bowflex',449,'Amazon','https://www.amazon.com/dp/B001ARYU58?tag=gymgearcompar-20',8.0,4.7,22500,'Amazon','Best adjustable dumbbell  --  replaces 15 sets.','Wirecutter',{'Range':'5–52.5 lbs','Increments':'2.5 lbs','System':'Dial Select','Replaces':'15 pairs','Warranty':'2 Years'},['Space Saving','15-in-1','Dial System'],{salePrice:399}),
  p('ironmaster-ql','Quick-Lock Adjustable DB','Ironmaster',649,'Ironmaster','https://www.ironmaster.com/products/quick-lock-adjustable-dumbbells/',9.0,4.8,340,'Ironmaster','Most durable adjustable dumbbell  --  solid steel, never wobbles.','Barbend',{'Range':'5–75 lbs','System':'Screw Lock','Material':'Steel','Expandable':'Yes','Warranty':'Lifetime'},['Solid Steel','Lifetime Warranty','Heavy Duty']),
  p('fringe-urethane','Urethane Dumbbells','Fringe Sport',380,'Fringe Sport','https://www.fringesport.com/products/urethane-round-dumbbells',8.9,4.8,180,'Fringe Sport','Best urethane dumbbell  --  odorless and floor-safe.','Garage Gym Lab',{'Handle':'Chrome','Head':'Urethane Round','Floor Safe':'Yes','Odor':'None','Grade':'Commercial'},['Urethane','Odorless','Commercial Grade']),
  p('titan-adj','Adjustable Dumbbell Set','Titan Fitness',349,'Titan Fitness','https://www.titanfitness.com/products/adjustable-dumbbell-set',7.6,4.4,265,'Titan Fitness','Best budget adjustable dumbbell set.','Garage Gym Reviews',{'Range':'5–50 lbs','System':'Pin Select','Material':'Steel + Rubber','Increments':'5 lbs','Warranty':'1 Year'},['Budget Pick','Pin System','Good Value']),
  p('cap-hex','Rubber Coated Hex DB','CAP Barbell',89,'Amazon','https://www.amazon.com/dp/B07D4DJ6M8?tag=gymgearcompar-20',6.0,4.3,14200,'Amazon','Cheapest entry-level option  --  fine for casual use.','Barbend',{'Handle':'Knurled Steel','Head':'Rubber Hex','Range':'3–50 lbs','Ships':'Prime','Smell':'Initially'},['Lowest Price','Amazon Prime','Entry Level']),
  p('powerblock-elite','Elite USA 50 Adjustable Dumbbells','PowerBlock',469,'PowerBlock','https://powerblock.com/products/elite-usa-90-adjustable-dumbbells',8.8,4.7,10200,'Amazon','The iconic adjustable dumbbell  --  expandable to 90 lb per hand as you grow.','Garage Gym Reviews',{'Range':'5–50 lbs','Increments':'2.5/5 lbs','Expandable':'To 90 lbs','Replaces':'28 dumbbells','Warranty':'5 Years'},['Expandable','Iconic Design','Made In USA']),
  p('rep-hex-set','Rubber Hex Dumbbell Set 5-50 lb','REP Fitness',1100,'REP Fitness','https://repfitness.com/products/rubber-hex-dumbbell-sets',8.9,4.9,135,'REP Fitness','A full 5-50 dumbbell run in one order  --  commercial-quality hex at home-gym price.','Garage Gym Reviews',{'Range':'5–50 lbs (10 Pairs)','Head':'Rubber Hex','Handle':'Knurled','Grade':'Light Commercial','Warranty':'Lifetime (Home)'},['Full Run','10 Pairs','Gym Staple'],{pro:true}),
  p("bells-nuobell-s-adjustable-dumbbells","NÜOBELL-S Adjustable Dumbbells — 5-60 LB (Pair) / Silver","Bells of Steel",1364.99,"Bells of Steel","https://bellsofsteel.us/products/nuobell-s-adjustable-dumbbells?variant=44827891957957",8.9,null,null,"Bells of Steel","Twist-to-select dumbbells that swap 5 to 60 pounds in seconds and feel like fixed dumbbells.","GymGear Compare",{"Weight range":"5–60 lb per dumbbell (pair)","Handle diameter":"1.26\" / 32mm","Knurling":"Medium","Adjustment":"Twist-and-click selector","Warranty":"2 years (void if dropped)"},["Fast Adjustment","Compact Footprint","2-Year Warranty"],{}),
  p("titan-90-lb-straight-stainless-steel-hex-dum","90 LB Straight Stainless Steel Hex Dumbbells","Titan Fitness",504.99,"titan.fitness","https://titan.fitness/products/90-lb-straight-stainless-steel-hex-dumbbells",7.8,null,null,"titan.fitness","A 90 lb pair with stainless handles and rubber hex heads, for pressing and rowing heavy.","GymGear Compare",{"Product Weight":"90 lb. Each","Quantity":"2 (Sold as a Pair)","Handle Diameter":"32 mm","Handle Material":"Stainless Steel","Warranty":"1 Year"},["Stainless Handle","Sold In Pairs","Rubber Hex Head"],{salePrice:349.97}),
  p("titan-80-lb-straight-stainless-steel-hex-dum","80 LB Straight Stainless Steel Hex Dumbbells","Titan Fitness",444.99,"titan.fitness","https://titan.fitness/products/80-lb-straight-stainless-steel-hex-dumbbells",7.8,null,null,"titan.fitness","An 80 lb pair with stainless handles and rubber hex heads, sold as the pair not a set.","GymGear Compare",{"Product Weight":"80 lb. Each","Quantity":"2 (Sold as a Pair)","Handle Diameter":"32 mm","Handle Material":"Stainless Steel","Warranty":"1 Year"},["Stainless Handle","Sold In Pairs","Rubber Hex Head"],{salePrice:299.97}),
  p("titan-115-lb-straight-stainless-steel-hex-du","115 LB Straight Stainless Steel Hex Dumbbells","Titan Fitness",619.99,"titan.fitness","https://titan.fitness/products/115-lb-straight-stainless-steel-hex-dumbbells",7.8,null,null,"titan.fitness","A heavy 115 lb pair with stainless handles, for lifters topping out on their existing dumbbell rack.","GymGear Compare",{"Product Weight":"115 lb. Each","Quantity":"2 (Sold as a Pair)","Handle Diameter":"32 mm","Handle Material":"Stainless Steel","Warranty":"1 Year"},["Stainless Handle","Sold In Pairs","Rubber Hex Head"],{salePrice:399.97}),
  p("titan-110-lb-straight-stainless-steel-hex-du","110 LB Straight Stainless Steel Hex Dumbbells","Titan Fitness",589.99,"titan.fitness","https://titan.fitness/products/110-lb-straight-stainless-steel-hex-dumbbells",8.2,null,null,"titan.fitness","Rubber-coated hex pair with rust-resistant stainless straight handles, sold as two 110 lb dumbbells.","GymGear Compare",{"Material":"Stainless Steel","Product Weight":"110 lb. each","Quantity":"2 (sold as a pair)","Handle Diameter":"32 mm","Handle Length":"5-in."},["Stainless Handles","Sold As Pair","Knurled Grip"],{salePrice:324.97}),
  p("titan-25-lb-rubber-hex-pair","25 LB Rubber Hex Dumbbells — Pair (50 lb total)","Titan Fitness",114.99,"Titan Fitness","https://titan.fitness/products/25-lb-rubber-hex-dumbbells",7.5,null,null,"Titan Fitness","A rubber-coated 25 lb pair with a knurled 34 mm chrome handle — the cheap way to own real dumbbells.","GymGear Compare",{"Sold as":"Pair (2 x 25 lb)","Total weight":"50 lb","Handle diameter":"34 mm","Material":"Solid steel","Finish":"Chrome handle, black matte head"},["Sold In Pairs","Rubber Coated","Budget Pick"],{salePrice:99.97}),
],

plates:[
  p('rogue-hg2','HG 2.0 Bumper Plates','Rogue Fitness',295,'Rogue Fitness','https://www.roguefitness.com/rogue-hg-2-0-bumper-plates',9.1,4.8,220,'Rogue Fitness','Top-tier IWF-spec bumper with dead bounce and color coding.','Garage Gym Reviews',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'Yes','IWF Spec':'Yes'},['IWF Certified','Low Bounce','Color Coded'],{bestChoice:true}),
  p('rep-black','Black Bumper Plates','Rep Fitness',215,'Rep Fitness','https://repfitness.com/products/black-bumper-plate-pairs',8.5,4.7,410,'Rep Fitness','Best-in-class value  --  dead bounce rivals Eleiko.','GarageGymProducts',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','Hardness':'90A','Bounce':'Dead'},['Best Value','Dead Bounce','Virgin Rubber']),
  p('rep-comp','Competition Bumper Plates','Rep Fitness',385,'Rep Fitness','https://repfitness.com/products/competition-bumper-plate-pairs-lb',9.3,4.8,178,'Rep Fitness','Best value competition bumpers, tested to 30,000 drops.','As Many Reviews As Possible',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','IWF Spec':'Yes','Drop Tested':'30,000+'},['Competition Grade','30k Drop Test','IWF Certified']),
  p('rogue-echo','Echo Bumper Plates','Rogue Fitness',195,'Rogue Fitness','https://www.roguefitness.com/rogue-echo-bumper-plates',8.0,4.6,380,'Rogue Fitness','Rogue entry-level bumper  --  recycled rubber, still quality.','Barbend',{'Material':'Recycled Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'No','Bounce':'Low'},['Budget Rogue','Recycled Rubber','Durable'],{salePrice:165}),
  p('rep-color','Color Bumper Plates','Rep Fitness',335,'Rep Fitness','https://repfitness.com/products/color-bumper-plate-pairs',8.8,4.7,203,'Rep Fitness','Same rubber as Black Bumpers with IWF color coding.','Fit at Midlife',{'Material':'Virgin Rubber','Set':'160 lbs','IWF Spec':'Yes','Color Coded':'Yes','Bounce':'Low'},['Color Coded','IWF Compliant','Virgin Rubber']),
  p('titan-bumper','Bumper Plates V3','Titan Fitness',159,'Titan Fitness','https://www.titanfitness.com/products/bumper-plates',7.5,4.4,290,'Titan Fitness','Cheapest reputable bumper plate  --  good for beginners.','Garage Gym Reviews',{'Material':'Recycled Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'No','Warranty':'1 Year'},['Lowest Price','Beginner Friendly','Ships Fast']),
  p('cap-iron','Cast Iron Olympic Plates','CAP Barbell',89,'Amazon','https://www.amazon.com/dp/B0000ATDSQ?tag=gymgearcompar-20',6.0,4.2,8400,'Amazon','Budget cast iron  --  fine for casual lifting, expect variance.','Barbend',{'Material':'Cast Iron','Standard':'2" Olympic','Color Coded':'No','Ships':'Prime','Warranty':'1 Year'},['Lowest Price','Amazon Prime','Ships Fast']),
  p("bells-crumb-bumper-plates","Crumb Bumper Plates — 10 LB (Pair)","Bells of Steel",80.99,"Bells of Steel","https://bellsofsteel.us/products/crumb-bumper-plates?variant=43316094271685",7.4,4.9,89,"Bells of Steel","Quiet crumb bumpers with a stainless insert and 1% weight tolerance, but only a 90-day warranty.","GymGear Compare",{"Diameter":"17.7\" / 450 mm","Plate material":"50% virgin / 50% recycled rubber","Insert material":"Stainless steel","Weight tolerance":"±1% of claimed weight","Warranty":"90 days (10 & 15 lb) / 1 year (25–55 lb)"},["Stainless Insert","1% Tolerance","Quiet Drops"],{salePrice:64.96}),
  p("bells-colour-bumper-plates","Colored Bumper Plates — 10 LB (Pair)","Bells of Steel",80.99,"Bells of Steel","https://bellsofsteel.us/products/colour-bumper-plates?variant=43912291123397",7.9,4.9,22,"Bells of Steel","Virgin-rubber bumper plates with stainless steel inserts, low bounce and one-percent weight tolerance.","GymGear Compare",{"Material":"100% Virgin Rubber","Insert":"Stainless Steel","Weight Tolerance":"1%","Durometer":"88 (10–15 lb) / 85 (25–55 lb)","Warranty":"90 Day (10–15 lb) / 1 Yr (25–55 lb)"},["Virgin Rubber","Stainless Insert","Low Bounce"],{salePrice:56.96}),
],

racks:[
  p('rogue-rm6','RM-6 Monster Rack','Rogue Fitness',1595,'Rogue Fitness','https://www.roguefitness.com/rogue-rm-6-monster-rack',9.8,4.9,310,'Rogue Fitness','The gold standard power rack  --  built for life.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'90"','Weight':'375 lbs','Hole Spacing':'1"','Made In':'USA'},['American Made','Monster Series','Lifetime Warranty'],{bestChoice:true}),
  p('rogue-r3','R-3 Power Rack','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-r-3-power-rack',9.2,4.9,870,'Rogue Fitness','Best mid-range power rack  --  strong, customizable, American-made.','Garage Gym Lab',{'Frame':'2×3" 11ga','Uprights':'90"','Weight':'183 lbs','Hole Spacing':'1"','Made In':'USA'},['American Made','Best Mid-Range','Customizable']),
  p('rep-pr5000','PR-5000 Power Rack','Rep Fitness',919.99,'Rep Fitness','https://repfitness.com/products/pr-5000-power-rack-pre-selected',9.1,4.8,445,'Rep Fitness','Best value full power rack  --  1" hole spacing, huge ecosystem.','Garage Gym Lab',{'Frame':'3×3" 11ga','Uprights':'90"','Hole Spacing':'1"','Weight':'270 lbs','Warranty':'Lifetime'},['Best Value','1" Spacing','Huge Ecosystem'],{}),
  p('titan-x3','X-3 Power Rack','Titan Fitness',795,'Titan Fitness','https://titan.fitness/products/x3-series-flat-foot-power-rack',8.2,4.6,920,'Titan Fitness','Best budget power rack  --  incredibly popular for home gyms.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'82"','Hole Spacing':'5/8"','Weight':'215 lbs','Warranty':'10 Year'},['Budget Pick','Most Popular','3×3 Frame']),
  p('bells-squat','Squat Stand 2.0','Bells of Steel',329.99,'Bells of Steel','https://bellsofsteel.us/products/squat-stands',8.8,4.8,195,'Bells of Steel','Premium squat stands with lifetime warranty.','Garage Gym Lab',{'Frame':'3×3" 11ga','Height':'84"','Hole Spacing':'1"','Weight':'130 lbs','Warranty':'Lifetime'},['Lifetime Warranty','1" Spacing','Premium Build']),
  p('rogue-squat','SQ-1 Squat Stand','Rogue Fitness',345,'Rogue Fitness','https://www.roguefitness.com/rogue-sq-1-squat-stand',8.6,4.8,340,'Rogue Fitness','Compact Rogue quality squat stand  --  American made.','Garage Gym Reviews',{'Frame':'2×3" 11ga','Height':'78"','Footprint':'Small','Weight':'80 lbs','Made In':'USA'},['American Made','Compact','Rogue Quality']),
  p('titan-t2','T-2 Short Power Rack','Titan Fitness',349,'Titan Fitness','https://titan.fitness/products/t2-series-power-rack',7.5,4.5,650,'Titan Fitness','Best entry-level power rack under $350.','Garage Gym Reviews',{'Frame':'2×2" 12ga','Height':'70"','Hole Spacing':'2"','Weight':'115 lbs','Warranty':'1 Year'},['Entry Level','Low Ceiling','Budget Pick']),
  p('rogue-rml390f','RML-390F Flat Foot Rack','Rogue Fitness',935,'Rogue Fitness','https://www.roguefitness.com/rml-390f-flat-foot-monster-lite-rack',9.4,4.9,443,'Rogue Fitness','No-bolt-down Monster Lite  --  the garage gym default power rack.','Garage Gym Lab',{'Frame':'3×3" 11ga','Uprights':'90"','Hole Spacing':'5/8"','Weight':'313 lbs','Made In':'USA'},['No Bolting Needed','American Made','Monster Lite']),
  p('rep-pr4000','PR-4000 Power Rack','Rep Fitness',799.94,'Rep Fitness','https://repfitness.com/products/pr-4000-power-rack-pre-selected',9.2,4.9,671,'Rep Fitness','Most customizable mid-price rack  --  1" bench-zone spacing, huge attachment ecosystem.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'80" or 93"','Hole Spacing':'1" bench zone','Weight':'250 lbs','Warranty':'Lifetime'},['Rack Builder','1" Spacing','Best Ecosystem']),
  p('rogue-sml2','SML-2 Monster Lite Squat Stand','Rogue Fitness',525,'Rogue Fitness','https://www.roguefitness.com/sml-2-rogue-90-monster-lite-squat-stand',9.1,4.9,954,'Rogue Fitness','The garage classic squat stand  --  3×3" Monster Lite steel with a pull-up bar.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'92"','Hole Spacing':'Westside','Footprint':'49×48"','Made In':'USA'},['Garage Classic','Pull-Up Bar','American Made']),
  p('prx-profile-pro','Profile PRO Folding Squat Rack','PRx Performance',1050,'PRx Performance','https://prxperformance.com/collections/profile-pro-racks',9.0,4.9,419,'PRx Performance','Folds to 4 inches off the wall  --  the Shark Tank rack for garages that still park cars.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Capacity':'1,000 lbs','Folded Depth':'4" From Wall','Mount':'Wall (Stud)','Made In':'USA'},['Folds To Wall','Shark Tank Famous','Small Space King'],{compact:true}),
  p("bells-manticore-collegiate-power-rack-prebui","Manticore Collegiate Power Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",1615.87,"Bells of Steel","https://bellsofsteel.us/products/manticore-collegiate-power-rack-prebuilt",8.9,null,null,"Bells of Steel","Tall 90-inch Manticore cage with front stabilizers and heavy plate storage; safeties sold separately.","GymGear Compare",{"Upright tubing":"3\" x 3\" (76.2mm)","Weight capacity":"1,000 lb","Hole size":"1\"","Upright height":"90\"","Warranty":"Limited lifetime frame and welds"},["90\" Uprights","1\" Hole Spacing","Plate Storage"],{salePrice:1576.82}),
  p("bells-manticore-half-rack-prebuilt","Manticore Half Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",1764.87,"Bells of Steel","https://bellsofsteel.us/products/manticore-half-rack-prebuilt",8.8,null,null,"Bells of Steel","Flat-foot Manticore half rack with safety straps, plate storage and 84-inch front uprights.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"1\"","Upright height":"84\" front / 72\" rear","Warranty":"Limited lifetime frame and welds"},["Flat Foot Design","Safety Straps Included","1\" Hole Spacing"],{salePrice:1744.84}),
  p("bells-manctiore-folding-power-rack-prebuilt","Manticore Folding Power Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",1403.92,"Bells of Steel","https://bellsofsteel.us/products/manctiore-folding-power-rack-prebuilt",8.8,null,null,"Bells of Steel","Four-post Manticore that folds flat to the wall, with 1-inch hole spacing and 1,000-pound capacity.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"1\"","Mounting":"Wall-mounted, folds flat","Warranty":"Limited lifetime frame and welds"},["Folds Flat","84\" Uprights","1\" Hole Spacing"],{salePrice:1275.86}),
  p("bells-roc-foldable-two-post-cage-prebuilt","Roc Foldable 2 Post Cage - Prebuilt (3\" x 3\", ⅝\" Holes)","Bells of Steel",723.95,"Bells of Steel","https://bellsofsteel.us/products/roc-foldable-two-post-cage-prebuilt",8,null,null,"Bells of Steel","Wall-folding two-post squat rack for the smallest rooms; no safeties or crossmembers in the box.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"5/8\"","Mounting":"Wall-mounted, folds flat","Warranty":"Limited lifetime frame and welds"},["Folds Flat","90\" Uprights","Smallest Footprint"],{salePrice:613.89}),
  p("bells-hydra-collegiate-power-rack-prebuilt","Hydra Collegiate Power Rack - Prebuilt (3\" x 3\", ⅝\" Holes)","Bells of Steel",1361.88,"Bells of Steel","https://bellsofsteel.us/products/hydra-collegiate-power-rack-prebuilt",8.6,null,null,"Bells of Steel","Tall 90-inch Hydra cage with plate storage and front stabilizers; 5/8-inch holes keep attachments cheaper.","GymGear Compare",{"Upright tubing":"3\" x 3\" (76.2mm)","Weight capacity":"1,000 lb","Hole size":"5/8\"","Upright height":"90\"","Warranty":"Limited lifetime frame and welds"},["Lifetime Frame Warranty","90\" Uprights","Plate Storage"],{salePrice:1343.86}),
  p("bells-roc-foldable-four-post-cage-prebuilt","Roc Foldable 4 Post Cage - Prebuilt (3\" x 3\", ⅝\" Holes)","Bells of Steel",1263.9,"Bells of Steel","https://bellsofsteel.us/products/roc-foldable-four-post-cage-prebuilt",8.5,null,null,"Bells of Steel","Folding four-post cage on 90-inch uprights that flattens to the wall; safeties sold separately.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"5/8\"","Mounting":"Wall-mounted, folds flat","Warranty":"Limited lifetime frame and welds"},["Folds Flat","90\" Uprights","1,000 lb Capacity"],{salePrice:1164.84}),
  p("bells-manticore-four-post-power-rack-prebuil","Manticore Four Post Power Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",1417.9,"Bells of Steel","https://bellsofsteel.us/products/manticore-four-post-power-rack-prebuilt",9,null,null,"Bells of Steel","Full four-post Manticore cage with safety straps, 1,000 lb capacity and 1-inch hole spacing throughout.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"1\"","Upright height":"84\"","Warranty":"Limited lifetime frame and welds"},["Lifetime Frame Warranty","1\" Hole Spacing","Safety Straps Included"],{salePrice:1400.87}),
  p("bells-manticore-folding-half-rack-prebuilt","Manticore Folding Half Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",876.95,"Bells of Steel","https://bellsofsteel.us/products/manticore-folding-half-rack-prebuilt",8.3,null,null,"Bells of Steel","Wall-folding Manticore half rack for tiny rooms; same 3x3 11-gauge steel, but needs stud mounting.","GymGear Compare",{"Weight capacity":"1,000 lb","Upright tubing":"3\" x 3\" (76.2mm) 11-gauge steel","Hole size":"1\"","Mounting":"Wall-mounted, folds flat","Warranty":"Limited lifetime frame and welds"},["Folds Flat","84\" Uprights","Lifetime Frame Warranty"],{salePrice:730.89}),
  p("bells-manticore-six-post-power-rack-prebuilt","Manticore Six Post Power Rack - Prebuilt (3\" x 3\", 1\" Holes)","Bells of Steel",2315.82,"Bells of Steel","https://bellsofsteel.us/products/manticore-six-post-power-rack-prebuilt",9.1,null,null,"Bells of Steel","Six-post Manticore cage with 1,000 lb capacity and enough plate storage that floor bolting is unnecessary.","GymGear Compare",{"Upright tubing":"3\" x 3\" (76.2mm)","Weight capacity":"1,000 lb","Hole size":"1\"","Upright height":"84\"","Warranty":"Limited lifetime frame and welds"},["Lifetime Frame Warranty","1,000 lb Capacity","No Floor Bolting"],{salePrice:2298.79}),
  p("rep-wall-mounted-rig-pre-selected","Wall-Mounted Rig (Pre-Selected) — 4000 / 4' / Metallic Black","REP Fitness",1055.99,"REP Fitness","https://repfitness.com/products/wall-mounted-rig-pre-selected?variant=42706337464478",8.6,null,null,"REP Fitness","Commercial 3x3-inch 11-gauge steel in a wall-mounted footprint, for one barbell station where floor space is scarce.","GymGear Compare",{"Material":"3x3\" 11-Gauge Steel","Rackable Capacity":"1,000 lbs","Upright Height":"108\"","Depth":"48.5\"","Hole Spacing":"1\" within bench zone, 2\" elsewhere"},["11-Gauge Steel","Wall Mounted","Space Saving"]),
  p("rep-rig-pre-selected","Rig (Pre-Selected) — 4000 / 14' / Metallic Black","REP Fitness",2434.99,"REP Fitness","https://repfitness.com/products/rig-pre-selected?variant=42703619621022",9.2,null,null,"REP Fitness","A complete four-station commercial rig on 3x3 eleven-gauge steel, shipped pre-configured so nothing needs specifying.","GymGear Compare",{"Steel":"3x3\" 11-gauge","Rackable capacity":"1,000 lb","Dimensions":"14' wide x 6' deep x 108\" tall","Hole spacing":"1\" in bench zone, 2\" elsewhere (5/8\" pins)","Included":"8 uprights, 4 pairs J-cups, 2 pull-up connectors"},["Commercial Grade","Four Lifting Stations","11-Gauge Steel"]),
],

cardio:[
  p('concept2-rower','RowErg Rowing Machine','Concept2',990,'Concept2','https://www.concept2.com/ergs/rowerg',9.8,4.9,5200,'Concept2','The only rowing machine  --  used in every serious gym on earth.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Folds':'Yes','Weight':'57 lbs','Warranty':'5 Year'},['Industry Standard','PM5 Monitor','Foldable'],{bestChoice:true,compact:true}),
  p('assault-bike','AssaultBike Classic','Assault Fitness',699,'Assault Fitness','https://www.assaultfitness.com/bikes/assault-bike-classic/',9.2,4.7,1800,'Assault Fitness','The original fan bike  --  brutally effective, built to last.','Barbend',{'Resistance':'Air','Display':'LCD','Weight':'95 lbs','Drive':'Chain','Warranty':'Lifetime Frame'},['Air Resistance','Fan Bike','Lifetime Frame']),
  p('concept2-ski','SkiErg','Concept2',900,'Concept2','https://www.concept2.com/ergs/skierg',9.5,4.9,890,'Concept2','Best upper body cardio machine ever made.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Wall Mount':'Included','Weight':'53 lbs','Warranty':'5 Year'},['Upper Body','PM5 Monitor','Compact'],{compact:true}),
  p('rogue-echo-bike','Echo Bike','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-echo-bike',9.0,4.8,2100,'Rogue Fitness','Best built fan bike  --  smoother than Assault with Rogue quality.','Garage Gym Reviews',{'Resistance':'Air','Display':'LCD','Weight':'127 lbs','Drive':'Belt','Made In':'USA'},['Belt Drive','American Made','Smooth Ride']),
  p('nordictrack-1750','Commercial 1750 Treadmill','NordicTrack',1999,'NordicTrack','https://www.nordictrack.com/product/commercial-1750-treadmill',8.5,4.6,4200,'NordicTrack','Best home treadmill with incline, iFit, and 10" screen.','Wirecutter',{'Speed':'0–12 mph','Incline':'-3% to 15%','Screen':'10"','Motor':'3.5 CHP','Warranty':'10 Year Frame'},['iFit Compatible','Auto Incline','10" Screen'],{salePrice:1699}),
  p('peloton-bike','Peloton Bike+','Peloton',2695,'Peloton','https://www.onepeloton.com/bike-plus',8.8,4.7,12000,'Peloton','Best connected cycling experience  --  premium but worth it.','Wirecutter',{'Screen':'24"','Resistance':'Magnetic','Auto Follow':'Yes','Subscription':'$44/mo','Weight':'140 lbs'},['24" Screen','Auto Resistance','Live Classes'],{compact:true}),
  p('assault-runner','AssaultRunner Pro','Assault Fitness',2999,'Assault Fitness','https://www.assaultfitness.com/treadmills/assault-runner-pro/',9.3,4.8,620,'Assault Fitness','Best curved treadmill  --  no motor, self-powered, elite cardio.','Barbend',{'Type':'Curved Manual','Motor':'None','Weight':'287 lbs','Warranty':'10 Year Frame','Belt':'Slat'},['Self-Powered','Curved Belt','No Electricity']),
    p('hydrow-wave','Wave Rower','Hydrow',1495,'Hydrow','https://hydrow.com/products/hydrow-wave-rower',9.1,4.7,8400,'Wirecutter','Best-looking rower with live outdoor reality workouts and a 16" touchscreen.','Wirecutter',{'Resistance':'Electromagnetic','Screen':'16"','Folds':'Yes','Subscription':'$44/mo','Weight':'102 lbs'},['Live Workouts','16" Screen','Folds Upright']),
  p('concept2-bikeerg','BikeErg','Concept2',990,'Concept2','https://www.concept2.com/ergs/bikeerg',9.3,4.8,760,'Concept2','Air-resistance bike from the makers of the best rower.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Seat':'Adjustable','Weight':'68 lbs','Warranty':'5 Year'},['PM5 Monitor','Air Resistance','Concept2 Quality'],{compact:true}),
  p('schwinn-ic4','IC4 Indoor Cycling Bike','Schwinn',999,'Schwinn','https://www.schwinnfitness.com/products/schwinn-ic4-indoor-cycling-bike',8.4,4.7,5100,'Amazon','The Peloton-app bike without the Peloton price  --  100 magnetic levels.','Wirecutter',{'Resistance':'Magnetic','Display':'Backlit LCD','Pedals':'Dual SPD + Cage','Weight':'106 lbs','Warranty':'10 Year Frame'},['App Compatible','Quiet Magnetic','Value Pick'],{compact:true}),
  p('sunny-rower','SF-RW5515 Magnetic Rower','Sunny Health & Fitness',299,'Amazon','https://www.amazon.com/dp/B0DQ6QTLJH?tag=gymgearcompar-20',6.8,4.5,13400,'Amazon','The best-selling budget rower  --  quiet magnetic resistance under $300.','Garage Gym Reviews',{'Resistance':'Magnetic','Display':'LCD','Folds':'Yes','Weight':'59 lbs','Warranty':'3 Year Frame'},['Under $300','Best Seller','Quiet'],{compact:true}),
  p('lifefitness-t3','T3 Treadmill','Life Fitness',3499,'Life Fitness','https://shop.lifefitness.com/products/t3-treadmill',9.1,4.8,64,'Life Fitness','Health-club belt feel at home  --  the treadmill brand gyms actually buy.','Life Fitness',{'Speed':'0.5–12 mph','Incline':'0–15%','Motor':'3.0 CHP','Weight':'254 lbs','Warranty':'Lifetime Frame'},['Club Quality','FlexDeck Shock','Commercial Brand']),
  p('waterrower-oak','Original Oak Rowing Machine','WaterRower',1199,'WaterRower','https://www.waterrower.com/us/products/waterrower-oak-rowing-machine-with-s4-monitor',9.0,4.8,640,'WaterRower','Furniture-grade oak and real water resistance  --  stores upright against the wall.','Garage Gym Reviews',{'Resistance':'Water','Monitor':'S4','Stores':'Upright','Material':'Solid Oak','Made In':'USA'},['Real Water Feel','Stores Upright','Furniture Grade'],{compact:true}),
  p('lf-club-treadmill','Club Series+ Treadmill','Life Fitness',10999,'Life Fitness','https://shop.lifefitness.com/products/club-series-plus-treadmill',9.5,3.8,33,'Life Fitness','The exact treadmill on big-box gym floors  --  4 HP AC motor, lifetime frame.','Garage Gym Reviews',{'Motor':'4.0 HP AC','Deck':'60×22"','Incline':'0–15%','Grade':'Full Commercial','Warranty':'Lifetime Frame'},['Club Standard','AC Motor','Full Commercial'],{pro:true}),
  p('lf-club-elliptical','Club Series+ Elliptical','Life Fitness',6499,'Life Fitness','https://shop.lifefitness.com/collections/ellipticals',9.3,4.5,48,'Life Fitness','Club-floor elliptical with a 20-inch stride  --  the cardio-row workhorse.','Life Fitness',{'Stride':'20"','Resistance':'25 Levels','Step-Up':'9.5"','Grade':'Full Commercial','Warranty':'Lifetime Frame'},['Club Standard','WhisperStride','Full Commercial'],{pro:true}),
  p("bells-blitz-ski-trainer","Blitz Ski Trainer","Bells of Steel",1292.99,"Bells of Steel","https://bellsofsteel.us/products/blitz-ski-trainer",7.6,null,null,"Bells of Steel","An air-flywheel ski trainer with adjustable damper and included floor stand, a cheaper alternative to commercial ergs.","GymGear Compare",{"Resistance":"Air flywheel with adjustable damper","Footprint":"49.75\" L × 24\" W × 85\" H","Machine weight":"105.7 lb","User capacity":"330 lb / 150 kg","Warranty":"5 years frame / 2 years parts"},["Full-Body Cardio","Adjustable Damper","Stand Included"],{salePrice:870.99}),
  p("bells-blitz-mountain-climber-treadmill","Blitz Mountain Climber Treadmill","Bells of Steel",3407.99,"Bells of Steel","https://bellsofsteel.us/products/blitz-mountain-climber-treadmill",7.3,4.8,6,"Bells of Steel","Walking-only incline trainer reaching a 50% grade, with 24-inch touchscreen and Bluetooth app connectivity.","GymGear Compare",{"Incline Range":"+50% to -5%","Speed Range":"0.5–8 km/h","Motor":"2.5 CHP","Running Deck":"43.31\" × 20.08\"","Warranty":"5 Yr Frame / 1 Yr Motor & Parts"},["50% Incline","24\" Touchscreen","Bluetooth FTMS"],{salePrice:2726.97}),
  p("bells-sisyphean-stepper","Sisyphean Stepper - Manual Stair Climber","Bells of Steel",3149.99,"Bells of Steel","https://bellsofsteel.us/products/sisyphean-stepper",7.4,null,null,"Bells of Steel","Manual magnetic stair climber needing no outlet; eight resistance levels and 8.5-foot minimum ceiling.","GymGear Compare",{"Resistance":"Magnetic","Resistance Levels":"8","Max User Weight":"308 lbs / 140 kg","Footprint":"45.3\" × 30.7\"","Warranty":"5 Yr Frame / 1 Yr Moving Parts"},["No Power Needed","Magnetic Resistance","8 Levels"],{salePrice:2519.96}),
],

// All-in-one trainers, functional trainers and cable machines. The efficient
// path for small setups (one machine = rack + smith + cables) and the anchor
// option the kit builder trades off against separate iron. Prices/URLs
// researched live 2026-07-09; compact:true = fits a small room.
machines:[
  p('rep-arcadia','Arcadia Functional Trainer','REP Fitness',2199.99,'REP Fitness','https://repfitness.com/products/arcadia-functional-trainer',9.3,4.9,111,'REP Fitness','Best functional trainer for most home gyms  --  commercial build in two-thirds the usual space.','Garage Gym Reviews',{'Type':'Functional Trainer','Resistance':'Dual 170 lb Stacks','Cable Ratio':'2:1','Footprint':'55×36"','Warranty':'Lifetime Frame'},['32 Cable Positions','Compact Build','Pre-Assembled Uprights'],{bestChoice:true}),
  p('force-usa-g3','G3 All-In-One Trainer','Force USA',1999,'Force USA','https://www.forceusa.com/products/g3',8.7,4.8,540,'Force USA','Rack, smith machine and cables in one footprint  --  the best-value all-in-one.','Barbend',{'Type':'All-In-One','Resistance':'Plate-Loaded','Cable Ratio':'2:1','Footprint':'78×61"','Warranty':'Lifetime Frame'},['3-in-1 Machine','Plate Loaded','Best Value']),
  p('force-usa-g6','G6 All-In-One Trainer','Force USA',3499,'Force USA','https://www.forceusa.com/products/g6',9.0,4.8,310,'Force USA','Selectorized stacks plus smith, rack, leg press and low row  --  the mid-tier sweet spot.','King of the Gym',{'Type':'All-In-One','Resistance':'Dual 220 lb Stacks','Cable Ratio':'2:1','Footprint':'72×64"','Warranty':'Lifetime Frame'},['Leg Press Built In','8 Stations','Selectorized Stacks']),
  p('force-usa-g20','G20 Pro All-In-One Trainer','Force USA',5999,'Force USA','https://www.forceusa.com/products/g20',9.6,4.9,150,'Force USA','The ultimate all-in-one gym  --  selectorized stacks, smith, rack and cables.','King of the Gym',{'Type':'All-In-One','Resistance':'Dual Weight Stacks','Cable Ratio':'2:1','Footprint':'80×65"','Warranty':'Lifetime Frame'},['Flagship','Selectorized Stacks','Every Station']),
  p('bells-ft','Functional Trainer','Bells of Steel',2144.99,'Bells of Steel','https://bellsofsteel.us/products/functional-trainer?variant=43316171145413',9.0,4.9,47,'Bells of Steel','Same features as trainers twice the price, with a lifetime frame warranty.','Garage Gym Reviews',{'Type':'Functional Trainer','Resistance':'Dual 160 lb Stacks','Cable Ratio':'2:1','Footprint':'11 sq ft','Warranty':'Lifetime Frame'},['16 Height Settings','Smooth Pulleys','Value Pick']),
  p('bells-cable-tower','Plate-Loaded Cable Tower 2.0','Bells of Steel',434.99,'Bells of Steel','https://bellsofsteel.us/products/cable-tower?variant=45552311992517',8.0,4.7,210,'Bells of Steel','A real cable machine in 6 square feet  --  the budget pick to beat.','Garage Gym Reviews',{'Type':'Cable Tower','Resistance':'Plate-Loaded','Cable Ratio':'2:1 + 1:1','Footprint':'6.1 sq ft','Config':'Without Upright','Warranty':'Limited'},['Tiny Footprint','Budget Pick','550 lb Capacity'],{compact:true}),
  p('titan-ft','Plate-Loaded Functional Trainer','Titan Fitness',1264.99,'Titan Fitness','https://titan.fitness/products/plate-loaded-functional-trainer',7.7,4.5,180,'Titan Fitness','Most machine for the money  --  660 lb capacity and every attachment in the box.','Garage Gym Reviews',{'Type':'Functional Trainer','Resistance':'Plate-Loaded','Cable Ratio':'2:1 + 1:1','Footprint':'61×53"','Warranty':'1 Year'},['Attachments Included','660 lb Capacity','Budget Pick'],{salePrice:819.97}),
  p('lifefitness-g7','G7 Home Gym','Life Fitness',3999,'Life Fitness','https://shop.lifefitness.com/products/g7-home-gym',9.2,4.8,89,'Life Fitness','Commercial-club cable motion for the home  --  the brand every gym floor trusts.','Life Fitness',{'Type':'Functional Trainer','Resistance':'Dual 160 lb Stacks','Cable Ratio':'2:1','Footprint':'60×54"','Warranty':'10 Year Frame'},['Commercial Grade','Bench Included','Club Standard']),
  p('bodysolid-exm2500','EXM2500S Home Gym','Body-Solid',1995,'Amazon','https://www.amazon.com/dp/B00332ARK0?tag=gymgearcompar-20',8.4,4.6,1100,'Amazon','The classic single-stack home gym  --  210 lb stack and a true lifetime warranty.','Garage Gym Reviews',{'Type':'Multi-Station','Resistance':'210 lb Stack','Stations':'Press / Pec / Lat / Leg','Footprint':'83×51"','Warranty':'Lifetime'},['Lifetime Warranty','No Plate Loading','Multi-Station']),
  p('bowflex-x2se','Xtreme 2 SE Home Gym','Bowflex',1499,'Bowflex','https://www.bowflex.com/product/x2se-home-gym/100334.html',7.3,4.5,3400,'Amazon','70+ exercises from folding resistance rods  --  apartment-friendly strength.','Barbend',{'Type':'Home Gym','Resistance':'210 lb Power Rods','Exercises':'70+','Footprint':'53×49"','Warranty':'7 Year'},['Apartment Friendly','No Spotter Needed','70+ Exercises'],{salePrice:999,compact:true}),
  p('marcy-mwm990','MWM-990 150 lb Stack Home Gym','Marcy',399,'Amazon','https://www.amazon.com/dp/B00JGRBSS6?tag=gymgearcompar-20',6.5,4.4,6900,'Amazon','The best-selling budget home gym  --  30+ exercises for under $400.','Barbend',{'Type':'Multi-Station','Resistance':'150 lb Stack','Exercises':'30+','Footprint':'68×42"','Warranty':'2 Year'},['Under $400','Best Seller','Compact Stack'],{compact:true}),
  p('tonal-2','Tonal 2 Smart Home Gym','Tonal',4295,'Tonal','https://tonal.com/products/tonal-2',9.4,4.8,2100,'Tonal','The wall-mounted smart gym  --  250 lb of digital resistance and an AI coach in a screen.','Garage Gym Reviews',{'Type':'Smart Gym','Resistance':'250 lb Digital','Mount':'Wall','Subscription':'$59.95/mo','Footprint':'Zero Floor Space'},['Wall Mounted','AI Coaching','Digital Weight'],{compact:true}),
  // Full-commercial machines below are gym-planner stock (pro:true) — they
  // still browse/compare like any product but never enter the home kit.
  p('hs-iso-row','Iso-Lateral Row','Hammer Strength',4135,'Life Fitness','https://shop.lifefitness.com/products/hammer-strength-plate-loaded-iso-lateral-row',9.5,4.9,41,'Life Fitness','The gym-floor standard plate-loaded row  --  independent arms, built like a tank.','Garage Gym Reviews',{'Type':'Plate-Loaded','Movement':'Row','Arms':'Iso-Lateral','Grade':'Full Commercial','Warranty':'10 Year Frame'},['Club Standard','Iso-Lateral','Plate Loaded'],{pro:true}),
  p('hs-leg-press','Linear Leg Press','Hammer Strength',7883,'Life Fitness','https://shop.lifefitness.com/products/hammer-strength-plate-loaded-linear-leg-press',9.4,4.8,28,'Life Fitness','The leg press serious gyms buy  --  1,800 lb of plate capacity on linear bearings.','Garage Gym Reviews',{'Type':'Plate-Loaded','Movement':'Leg Press','Capacity':'40 × 45 lb Plates','Grade':'Full Commercial','Warranty':'10 Year Frame'},['Club Standard','Linear Bearings','Made In USA'],{pro:true}),
  p('bodysolid-slp500','Pro Clubline SGLP500 Leg Press','Body-Solid',4060,'Strength Warehouse USA','https://strengthwarehouseusa.com/products/body-solid-sglp500-pro-clubline-leg-press',8.6,4.7,60,'Strength Warehouse USA','Commercial-rated 45-degree leg press at half the big-brand price  --  lifetime commercial warranty.','Garage Gym Reviews',{'Type':'Plate-Loaded 45°','Movement':'Leg Press','Capacity':'1,500 lbs','Grade':'Full Commercial','Warranty':'Lifetime Frame'},['Commercial Rated','Value Pick','Lifetime Warranty'],{pro:true,salePrice:3420}),
  p('rogue-ghd','Abram GHD 2.0','Rogue Fitness',775,'Rogue Fitness','https://www.roguefitness.com/rogue-abram-glute-ham-developer-2-0',9.2,4.9,180,'Rogue Fitness','The benchmark glute-ham developer  --  every serious strength room has one.','Garage Gym Reviews',{'Type':'GHD','Movement':'Posterior Chain','Adjustment':'Precision Pin','Grade':'Full Commercial','Made In':'USA'},['Strength Room Staple','American Made','Portable'],{pro:true}),
  p("bells-functional-trainer-cable-tower","Functional Trainer Cable Tower — Weight Stack Functional Trainer / 80.75\" Cable Tower","Bells of Steel",3449.99,"Bells of Steel","https://bellsofsteel.us/products/functional-trainer-cable-tower?variant=44646012190917",8.5,null,null,"Bells of Steel","Dual 210-pound stacks in two wall-mounted towers; a full cable gym that must be bolted down.","GymGear Compare",{"Resistance":"Dual 210 lb weight stacks","Cable ratio":"2:1 (1:1 with adapter)","Max cable capacity":"250 lb / 113 kg","Tubing":"2.3\" x 2.3\" (60mm) 14-gauge steel","Warranty":"Limited lifetime frame, 1 year parts"},["Dual 210lb Stacks","33 Height Settings","Lifetime Frame Warranty"],{salePrice:3104.96}),
  p("rep-ghd-glute-ham-developer","Glute Ham Developer (GHD)","REP Fitness",479.99,"REP Fitness","https://repfitness.com/products/ghd-glute-ham-developer",7.8,4.9,147,"REP Fitness","A 150lb glute-ham developer with 13 adjustment points and wheels, priced far below commercial GHDs.","GymGear Compare",{"Weight":"150 lbs","Footprint":"70\" L x 36\" W x 42\" H (top of leg pads)","Frame Material":"Mostly 16-gauge steel","Adjustment Points":"13","Footplate":"20\" x 13\""},["13 Adjustment Points","Wheeled Frame","Band Pegs"]),
  p("titan-plate-loaded-linear-hack-squat-machine","Plate-Loaded Linear Hack Squat Machine","Titan Fitness",939.99,"titan.fitness","https://titan.fitness/products/plate-loaded-linear-hack-squat-machine",7.4,null,null,"titan.fitness","A dedicated 700 lb hack squat on linear bearings, for quad work without buying a combo unit.","GymGear Compare",{"Carriage Capacity":"700 lb.","Footprint Dimensions":"46.75-in. x 60.5-in.","Overall Height":"45.5-in.","Product Weight":"190 lb.","Warranty":"1 Year"},["700 lb Capacity","Linear Bearings","Single Station"],{salePrice:599.97}),
  p("titan-leg-press-hack-squat-machine","Leg Press Hack Squat Machine","Titan Fitness",2399.99,"titan.fitness","https://titan.fitness/products/leg-press-hack-squat-machine",7.9,null,null,"titan.fitness","Two leg movements in one 1,000 lb frame, for lifters who want machine work without commercial pricing.","GymGear Compare",{"Weight Capacity":"1,000 lb.","Carriage Bar Weight":"80 lb.","Overall Dimensions":"84-in. L x 40-in. W x 53-in. H","Product Weight":"325 lb.","Warranty":"1 Year"},["1,000 lb Capacity","Two Movements","Plate-Loaded"],{salePrice:1499.97}),
],

// Rubber flooring — the planner sizes an order to the room via coverageSqFt.
flooring:[
  p('rogue-mat-bundle','Gym Mats 25-Pack','Rogue Fitness',1495,'Rogue Fitness','https://www.roguefitness.com/rogue-gym-mat-25-piece-bundle-black',8.5,3.2,5,'Rogue Fitness','600 square feet of 3/4-inch rubber in one order  --  the fastest way to floor a gym.','Rogue Fitness',{'Coverage':'~600 sq ft','Thickness':'3/4"','Mat Size':'6×4 ft','Count':'25 Mats','Material':'Recycled Rubber'},['Bulk Coverage','3/4" Thick','Facility Grade'],{pro:true,coverage:600}),
  p('rep-floor-mat','4×6 Floor Mat','REP Fitness',77,'REP Fitness','https://repfitness.com/products/4x6-floor-mats',8.8,4.8,38,'REP Fitness','Dense 3/4-inch USA-made rubber that will not curl  --  quiet, stable, bacteria-resistant.','Garage Gym Reviews',{'Coverage':'~23 sq ft','Thickness':'3/4"','Size':'4×6 ft','Weight':'88 lbs','Made In':'USA'},['No Curl','Low Odor','American Made'],{pro:true,coverage:23}),
  p("bells-puzzle-mat-set","Rubber Flooring Puzzle Gym Mat 24\" x 24\" (Set of 8)","Bells of Steel",125.99,"Bells of Steel","https://bellsofsteel.us/products/puzzle-mat-set",7,null,null,"Bells of Steel","Interlocking 6mm recycled-rubber tiles; an economical floor guard best suited to racks, benches and cardio.","GymGear Compare",{"Mat Size":"24\" × 24\"","Thickness":"6mm / 0.25\"","Material":"Recycled Rubber","Count":"8 Mats","Warranty":"1 Year"},["Interlocking Tiles","Set of 8","Finishing Edges"],{salePrice:112.96}),
],

kettlebells:[
  p('rogue-kb','Powder Coat Kettlebell','Rogue Fitness',54,'Rogue Fitness','https://www.roguefitness.com/rogue-kettlebells',9.2,4.9,1200,'Rogue Fitness','The standard in kettlebells  --  single-cast, perfect balance.','Garage Gym Reviews',{'Material':'Single Cast Iron','Coating':'Powder Coat','Handle':'Smooth','Range':'9–203 lbs','Made In':'USA'},['American Made','Single Cast','Perfect Balance'],{bestChoice:true}),
  p('rep-kb','Cast Iron Kettlebell','Rep Fitness',42,'Rep Fitness','https://repfitness.com/products/kettlebells-lb',8.7,4.8,890,'Rep Fitness','Best value kettlebell  --  smooth handle, precise weight.','Garage Gym Lab',{'Material':'Single Cast Iron','Coating':'Powder Coat','Handle':'Smooth','Range':'4–203 lbs','Warranty':'2 Years'},['Best Value','Smooth Handle','Wide Range']),
  p('onnit-kb','Primal Bell','Onnit',75,'Onnit','https://www.onnit.com/primal-bells/',8.0,4.6,2100,'Onnit','Iconic animal face kettlebells  --  great quality, unique design.','Men\'s Health',{'Material':'Iron Ore','Coating':'Chip Resistant','Design':'Animal Face','Range':'18–90 lbs','Warranty':'1 Year'},['Iconic Design','Chip Resistant','Gift Worthy']),
  p('dragon-door-kb','RKC Kettlebell','Dragon Door',79,'Dragon Door','https://www.dragondoor.com/p10/',9.4,4.9,560,'Dragon Door','The original competition kettlebell  --  used by RKC instructors worldwide.','StrongFirst',{'Material':'Cast Iron','Coating':'E-Coat','Handle':'Textured','Range':'9–203 lbs','Certification':'RKC Standard'},['Competition Standard','RKC Certified','Pro Grade']),
  p('titan-kb','Titan Kettlebell','Titan Fitness',29,'Titan Fitness','https://www.titanfitness.com/products/cast-iron-kettlebell',7.5,4.5,1800,'Titan Fitness','Budget-friendly kettlebell  --  solid for home training.','Garage Gym Reviews',{'Material':'Cast Iron','Coating':'Powder Coat','Handle':'Standard','Range':'5–100 lbs','Warranty':'1 Year'},['Budget Pick','Wide Range','Ships Fast']),
  p('cap-kb','Vinyl Coated Kettlebell','CAP Barbell',28,'Amazon','https://www.amazon.com/dp/B07JZR1PBQ?tag=gymgearcompar-20',6.0,4.2,8900,'Amazon','Most affordable entry-level kettlebell  --  fine for beginners.','Barbend',{'Material':'Cast Iron','Coating':'Vinyl','Floor Protection':'Yes','Range':'5–80 lbs','Ships':'Prime'},['Lowest Price','Floor Friendly','Amazon Prime']),
  p('kbkings-powder','Powder Coat Kettlebell 53 lb','Kettlebell Kings',145,'Kettlebell Kings','https://www.kettlebellkings.com/products/powder-coat-kettlebell-in-lb',9.2,4.9,2900,'Kettlebell Kings','The best powder coat kettlebell  --  single-piece cast, chip-proof finish, lifetime warranty.','Garage Gym Reviews',{'Weight':'53 lbs','Cast':'Single Piece','Finish':'Powder Coat','Handle':'Smooth Wide','Warranty':'Lifetime'},['Best Powder Coat','Lifetime Warranty','Single-Piece Cast']),
  p('yes4all-kb','Adjustable Kettlebell','Yes4All',129,'Amazon','https://www.amazon.com/dp/B07NPLY4CT?tag=gymgearcompar-20',7.8,4.5,3200,'Amazon','Best adjustable kettlebell  --  6 weights in one.','Barbend',{'Material':'Cast Iron','Range':'12–25 lbs','Weights':'6 in 1','System':'Plate Stack','Ships':'Prime'},['Adjustable','Space Saving','6-in-1']),
  p("titan-90-lb-cast-iron-kettlebell","90 LB Cast Iron Kettlebell","Titan Fitness",189.99,"titan.fitness","https://titan.fitness/products/90-lb-cast-iron-kettlebell",7.5,null,null,"titan.fitness","Heavy 90 lb cast-iron bell with a 48mm handle, built for loaded carries and swings.","GymGear Compare",{"Material":"Cast-Iron","Product Weight":"90 lb.","Handle Diameter":"48 mm","Overall Height":"12.6-in.","Base Width":"8.25-in."},["Heavy Load","48mm Handle","Flat Base"],{salePrice:149.97}),
  p("titan-10-kg-cast-iron-kettlebell","10 KG Cast Iron Kettlebell","Titan Fitness",64.99,"titan.fitness","https://titan.fitness/products/10-kg-cast-iron-kettlebell",7.6,null,null,"titan.fitness","Single-cast iron kettlebell with a flat machined base and 32mm handle for two-hand swings.","GymGear Compare",{"Material":"Cast Iron","Product Weight":"10 KG / 22 lb.","Handle Diameter":"32 mm","Overall Height":"8.5-in.","Finish":"Powder-Coated Black"},["Flat Base","Single-Piece Cast","1-Year Warranty"],{}),
  p("titan-22-kg-competition-kettlebell","22 KG Competition Kettlebell","Titan Fitness",159.99,"titan.fitness","https://titan.fitness/products/22-kg-competition-kettlebell",8,null,null,"titan.fitness","A single 22 kg competition bell with steel dimensions that stay constant as you move up.","GymGear Compare",{"Weight":"22 KG / 48.5 lb (single kettlebell)","Material":"Steel, hollow core","Handle diameter":"35 mm","Dimensions":"11.4 in tall x 8.3 in diameter","Warranty":"1 year"},["Single Bell","Competition Spec","35mm Handle"],{}),
  p("titan-6-kg-cast-iron-kettlebell","6 KG Cast Iron Kettlebell","Titan Fitness",49.99,"titan.fitness","https://titan.fitness/products/6-kg-cast-iron-kettlebell",7.4,null,null,"titan.fitness","A single 6 kg cast iron bell, one-piece cast with a flat base and wide handle.","GymGear Compare",{"Weight":"6 KG / 13 lb (single kettlebell)","Material":"Cast iron, one-piece cast","Finish":"Powder-coated black","Handle diameter":"31 mm","Warranty":"1 year"},["Single Bell","One-Piece Cast","Flat Base"],{salePrice:34.97}),
],

bands:[
  p('rogue-bands','Monster Bands','Rogue Fitness',25,'Rogue Fitness','https://www.roguefitness.com/monster-bands',9.2,4.9,2100,'Rogue Fitness','The standard in resistance bands  --  used by coaches worldwide.','Barbend',{'Material':'Natural Latex','Resistance':'Light–Monster','Width':'1/2"–2.5"','Uses':'Pull-ups, Mobility','Made In':'USA'},['American Made','Multiple Widths','Coach Approved'],{bestChoice:true}),
  p('rep-bands','Pull-Up Assistance Bands','Rep Fitness',22,'Rep Fitness','https://repfitness.com/products/pull-up-band',8.7,4.7,890,'Rep Fitness','Best value bands  --  wide range of resistance levels.','Garage Gym Lab',{'Material':'Natural Latex','Set':'5 bands','Resistance':'10–175 lbs','Uses':'Pull-ups, Squats','Warranty':'1 Year'},['Best Value','5 Band Set','High Resistance']),
  p('wodfitters-bands','Pull Up Bands','WODFitters',28,'Amazon','https://www.amazon.com/dp/B01LZAUQN1?tag=gymgearcompar-20',8.2,4.6,12000,'Amazon','Best CrossFit bands  --  color coded, durable, great for kipping.','Barbend',{'Material':'Natural Latex','Colors':'4 resistance levels','Width':'1/2"–2"','Uses':'Pull-ups, WODs','Ships':'Prime'},['CrossFit Friendly','Color Coded','Amazon Prime']),
  p('fit-simplify-bands','Resistance Loop Bands','Fit Simplify',12,'Amazon','https://www.amazon.com/dp/B09MJKJYLQ?tag=gymgearcompar-20',7.5,4.6,85000,'Amazon','Most popular loop bands  --  perfect for glute work and rehab.','Wirecutter',{'Material':'Natural Latex','Set':'5 bands','Type':'Loop','Uses':'Glutes, Rehab, Warm-up','Ships':'Prime'},['Best Seller','5 Levels','Loop Design'],{salePrice:9}),
  p('ironbull-bands','Strength Bands','Iron Bull Strength',35,'Amazon','https://www.amazon.com/dp/B0732TCYMY?tag=gymgearcompar-20',8.5,4.7,2800,'Amazon','Heavy-duty bands for accommodating resistance training.','Barbend',{'Material':'Natural Latex','Set':'5 bands','Resistance':'Up to 200 lbs','Uses':'Deadlift, Squat, Bench','Grade':'Heavy Duty'},['Heavy Duty','Up to 200 lbs','Accommodating Resistance']),
  p('trx-pro4','PRO4 Suspension Trainer System','TRX',289.95,'TRX','https://www.trxtraining.com/products/pro',8.9,4.9,1216,'TRX','The original suspension trainer  --  a full-body gym that packs into a mesh bag.','Garage Gym Reviews',{'Type':'Suspension Trainer','Anchors':'Door + Suspension','Handles':'Rubber','Capacity':'350 lbs','Warranty':'1 Year'},['Original Suspension','Packs Tiny','Full Body']),
  p('amazon-bands','Resistance Bands Set','Amazon Basics',10,'Amazon','https://www.amazon.com/dp/B07NY82DX4?tag=gymgearcompar-20',6.5,4.4,45000,'Amazon','Cheapest option  --  acceptable for light exercise and mobility.','Barbend',{'Material':'Latex','Set':'5 bands','Type':'Loop','Uses':'Light Exercise','Ships':'Prime'},['Lowest Price','Amazon Prime','Beginner']),
  p("rep-pull-up-band","Resistance Bands — 3X-Light","REP Fitness",14.99,"REP Fitness","https://repfitness.com/products/pull-up-band?variant=41067594940574",7.8,4.9,485,"REP Fitness","The lightest of REP's 38-inch layered-latex bands, best for mobility work and light barbell tension.","GymGear Compare",{"Length":"38\"","Band width (3X-Light)":"0.25\"","Resistance":"5-15 lb","Construction":"Layered elastic latex","Warranty":"1 year home use, 6 months commercial"},["Layered Elastic","Mobility Work","1-Year Warranty"],{salePrice:11.99}),
  p("rep-short-resistance-bands","Short Resistance Bands — XXX-Light","REP Fitness",15.99,"REP Fitness","https://repfitness.com/products/short-resistance-bands?variant=42919516373150",7.7,5,12,"REP Fitness","The 12-inch length loops straight onto band pegs, so light banded barbell work needs no doubling up.","GymGear Compare",{"Length":"12\"","Band width (XXX-Light)":"0.25\"","Resistance":"5-15 lb","Material":"Molded latex","Warranty":"1 year home use, 6 months commercial"},["Sold In Pairs","Banded Barbell Work","1-Year Warranty"],{salePrice:12.79}),
],

preworkout:[
  p('ghost-legend','Ghost Legend Pre-Workout','Ghost',49,'Ghost','https://ghostlifestyle.com/products/ghost-legend',9.0,4.8,14200,'Ghost','Most popular pre-workout of the decade  --  transparent label.','Barbend',{'Caffeine':'250mg','L-Citrulline':'4g','Beta-Alanine':'3.2g','Servings':'40','Collab':'Yes'},['Transparent Label','40 Servings','Collab Flavors'],{bestChoice:true}),
  p('transparent-stim','Bulk Pre-Workout','Transparent Labs',54.99,'Transparent Labs','https://www.transparentlabs.com/products/bulk-black-pre-workout',9.5,4.9,8900,'Transparent Labs','Cleanest formula on the market  --  fully disclosed, no fillers.','Examine.com',{'Caffeine':'275mg','L-Citrulline':'8g','Beta-Alanine':'4g','Servings':'30','Third Party':'Yes'},['Cleanest Formula','8g Citrulline','Third Party Tested']),
  p('gorilla-mind','Gorilla Mode Pre-Workout','Gorilla Mind',59.99,'Gorilla Mind','https://gorillamind.com/products/gorilla-mode',9.2,4.8,11000,'Gorilla Mind','Highest dosed pre-workout on the market  --  not for beginners.','More Plates More Dates',{'Caffeine':'350mg','L-Citrulline':'9g','Creatine':'5g','Servings':'40','Stim':'Very High'},['Highest Dose','9g Citrulline','Includes Creatine']),
  p('c4-original','C4 Original Pre-Workout','Cellucor',35,'Amazon','https://www.amazon.com/dp/B01N272UAI?tag=gymgearcompar-20',7.8,4.6,89000,'Amazon','Most sold pre-workout ever  --  beginner-friendly and affordable.','Barbend',{'Caffeine':'150mg','Beta-Alanine':'1.6g','Arginine':'1g','Servings':'30','Flavor':'Many'},['Beginner Friendly','Best Seller','Affordable'],{salePrice:25}),
  p('legion-pulse','Pulse Pre-Workout','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/pulse/',9.1,4.8,9800,'Legion','Science-based formula with natural caffeine from green tea.','Examine.com',{'Caffeine':'350mg Natural','L-Citrulline':'8g','Beta-Alanine':'4.8g','Servings':'21','Synthetic':'None'},['Natural Caffeine','Science Based','No Synthetics']),
  p('alani-pre','Pre-Workout','Alani Nu',39.99,'Alani Nu','https://alaninu.com/products/pre-workout-cosmic-stardust',8.2,4.7,21000,'Alani Nu','Best women-focused pre-workout  --  great taste, smooth energy.','Shape Magazine',{'Caffeine':'200mg','L-Citrulline':'6g','Beta-Alanine':'1.6g','Servings':'30','Focus':'Women'},['Women Focused','Great Taste','Smooth Energy']),
  p('bucked-up','Bucked Up Pre-Workout','Bucked Up',49,'Bucked Up','https://buckedup.com/products/bucked-up-pre-workout',8.5,4.7,7600,'Bucked Up','Deer antler velvet formula with strong pump and focus.','Fitness Reviews',{'Caffeine':'200mg','L-Citrulline':'6g','Beta-Alanine':'3.2g','Deer Antler':'Yes','Servings':'30'},['Pump Formula','Deer Antler','Focus Blend']),
    p('kaged-elite','Pre-Kaged Elite','Kaged',59.99,'Kaged','https://www.kaged.com/products/pre-workout-elite',9.3,4.8,5600,'Barbend','Most complete pre-workout formula  --  patented ingredients, no proprietary blends.','Barbend',{'Caffeine':'388mg','L-Citrulline':'9g','Beta-Alanine':'3.2g','Servings':'20','Third Party':'Yes'},['No Prop Blends','388mg Caffeine','Third Party Tested']),
    p('raw-thavage','Thavage Pre-Workout','Raw Nutrition',49,'Raw Nutrition','https://getrawnutrition.com/products/cbum-series-thavage-pre-workout',8.9,4.8,12000,'Barbend','Chris Bumstead signature pre-workout  --  great taste, solid clinical doses.','Barbend',{'Caffeine':'200mg','L-Citrulline':'8g','Beta-Alanine':'3.2g','Servings':'40','Collab':'CBUM'},['CBUM Signature','40 Servings','Smooth Energy']),
  p('gorilla-mind-smooth','Gorilla Mode Nitric','Gorilla Mind',59.99,'Gorilla Mind','https://gorillamind.com/products/gorilla-mode-nitric',8.8,4.7,4200,'Gorilla Mind','Stim-free pump pre-workout  --  max vascularity without jitters.','More Plates More Dates',{'Caffeine':'0mg','L-Citrulline':'10g','Nitric Oxide':'Max','Servings':'40','Stim Free':'Yes'},['Stim Free','10g Citrulline','Max Pump']),
],

protein:[
  p('on-gold-standard','Gold Standard 100% Whey','Optimum Nutrition',54,'Amazon','https://www.amazon.com/dp/B000GISU1M?tag=gymgearcompar-20',9.0,4.8,125000,'Amazon','The best-selling protein of all time  --  proven, affordable, effective.','Examine.com',{'Protein':'24g','Calories':'120','Carbs':'3g','Fat':'1.5g','Servings':'74'},['Best Seller','24g Protein','74 Servings'],{bestChoice:true}),
  p('transparent-whey','100% Whey Protein Isolate','Transparent Labs',59,'Transparent Labs','https://www.transparentlabs.com/products/whey-protein-isolate',9.6,4.9,7800,'Transparent Labs','Cleanest whey  --  grass-fed, no artificial anything.','Examine.com',{'Protein':'28g','Calories':'120','Carbs':'1g','Fat':'0.5g','Source':'Grass-Fed'},['Grass Fed','Cleanest Formula','28g Protein']),
  p('ghost-whey','Ghost Whey Protein','Ghost',44.99,'Ghost','https://ghostlifestyle.com/products/ghost-whey',8.8,4.8,18000,'Ghost','Best tasting protein  --  collab flavors and transparent label.','Barbend',{'Protein':'25g','Calories':'150','Carbs':'5g','Fat':'3.5g','Servings':'25'},['Best Taste','Collab Flavors','Transparent Label']),
  p('dymatize-iso100','ISO100 Hydrolyzed Whey','Dymatize',56,'Amazon','https://www.amazon.com/dp/B002N6F2UW?tag=gymgearcompar-20',9.2,4.8,34000,'Amazon','Hydrolyzed isolate for fastest absorption  --  serious athletes.','Barbend',{'Protein':'25g','Calories':'120','Carbs':'2g','Fat':'0.5g','Type':'Hydrolyzed Isolate'},['Hydrolyzed','Fastest Absorption','Isolate'],{salePrice:44}),
  p('legion-whey','Whey+ Protein','Legion',59,'Legion','https://legionathletics.com/products/supplements/whey/',9.1,4.8,8200,'Legion','Natural, science-based protein with excellent taste.','Examine.com',{'Protein':'22g','Calories':'100','Carbs':'3g','Fat':'0g','Sweeteners':'Stevia'},['100% Natural','No Artificial','Science Based']),
  p('thorne-whey','Whey Protein Isolate','Thorne',75,'Thorne','https://www.thorne.com/products/dp/whey-protein-isolate',9.4,4.8,2100,'Thorne','NSF Certified for Sport  --  the choice of professional athletes.','NSF',{'Protein':'21g','Calories':'110','Carbs':'2g','Fat':'1g','NSF Certified':'Yes'},['NSF Certified','Pro Athlete Choice','Pharmaceutical Grade']),
  p('nutricost-whey','Whey Protein Concentrate','Nutricost',39,'Amazon','https://www.amazon.com/dp/B01KITQG0A?tag=gymgearcompar-20',7.5,4.5,28000,'Amazon','Best budget protein  --  simple, effective, no frills.','Barbend',{'Protein':'25g','Calories':'130','Carbs':'5g','Fat':'2g','Servings':'75'},['Best Budget','75 Servings','No Frills']),
  p('momentous-protein','Essential Plant Protein','Momentous',49.99,'Momentous','https://www.livemomentous.com/products/100-plant-protein-powder',9.3,4.9,3200,'Momentous','NSF certified plant protein used by NFL + NBA  --  trusted by pro athletes.',"Examine.com",{'Protein':'20g','Source':'Pea + Rice','NSF Certified':'Yes','Calories':'120','Athletes':'NFL/NBA'},['NSF Certified','Pro Athlete','Plant Based']),
  p('on-casein','Gold Standard Casein','Optimum Nutrition',52,'Amazon','https://www.amazon.com/dp/B002DYJ0M0?tag=gymgearcompar-20',8.8,4.7,19000,'Amazon','Best slow-release protein  --  ideal before bed for recovery.','Examine.com',{'Protein':'24g','Calories':'130','Carbs':'4g','Fat':'1g','Absorption':'Slow'},['Slow Release','Overnight Recovery','Best Casein']),
],

creatine:[
  p('transparent-creatine','Creatine HMB','Transparent Labs',49,'Transparent Labs','https://www.transparentlabs.com/products/creatine-hmb',9.5,4.9,12000,'Transparent Labs','Best creatine formula  --  monohydrate plus HMB for muscle retention.','Examine.com',{'Creatine':'5g','HMB':'1.5g','Type':'Monohydrate','Servings':'30','Third Party':'Yes'},['Plus HMB','Third Party Tested','Cleanest Formula'],{bestChoice:true}),
  p('on-creatine','Micronized Creatine Powder','Optimum Nutrition',29,'Amazon','https://www.amazon.com/dp/B002DYIZEO?tag=gymgearcompar-20',9.0,4.8,67000,'Amazon','Most popular creatine  --  micronized for better mixing.','Examine.com',{'Creatine':'5g','Type':'Micronized Monohydrate','Servings':'60','Calories':'0','Mixability':'Excellent'},['Micronized','Best Seller','Excellent Value']),
  p('thorne-creatine','Creatine','Thorne',42,'Thorne','https://www.thorne.com/products/dp/creatine',9.4,4.9,3400,'Thorne','NSF Certified creatine  --  pharmaceutical grade for pro athletes.','NSF',{'Creatine':'5g','Type':'Monohydrate','Servings':'90','NSF Certified':'Yes','Filler':'None'},['NSF Certified','No Fillers','Pharmaceutical Grade']),
  p('legion-recharge','Recharge Post-Workout','Legion',49,'Legion','https://legionathletics.com/products/supplements/recharge-post-workout/',9.0,4.8,6800,'Legion','Creatine plus L-carnitine for recovery  --  best post-workout creatine.','Examine.com',{'Creatine':'5g','L-Carnitine':'2.1g','Type':'Monohydrate','Servings':'30','Recovery':'Enhanced'},['Plus L-Carnitine','Recovery Focused','Natural Flavors']),
  p('nutricost-creatine','Creatine Monohydrate','Nutricost',22,'Amazon','https://www.amazon.com/dp/B00GL2HMES?tag=gymgearcompar-20',7.8,4.6,31000,'Amazon','Cheapest reputable creatine  --  pure monohydrate, nothing else.','Barbend',{'Creatine':'5g','Type':'Monohydrate','Servings':'100','Calories':'0','Price Per Serving':'$0.22'},['Cheapest Option','100 Servings','Pure Monohydrate']),
  p('momentous-creatine','Creatine Monohydrate','Momentous',44,'Momentous','https://livemomentous.com/products/creatine',9.2,4.9,2200,'Momentous','NSF Certified creatine trusted by NFL and NBA athletes.','NFL Players',{'Creatine':'5g','Type':'Monohydrate','NSF Certified':'Yes','Servings':'30','Athletes':'NFL/NBA'},['Pro Athlete Choice','NSF Certified','Premium Brand']),
  p('klean-creatine','Klean Creatine','Klean Athlete',38,'Klean Athlete','https://kleanathlete.com/products/klean-creatine',9.0,4.8,1800,'Klean Athlete','NSF Certified and Informed Sport  --  clean for drug-tested athletes.','Informed Sport',{'Creatine':'5g','Type':'Monohydrate','NSF':'Yes','Informed Sport':'Yes','Servings':'60'},['Informed Sport','Drug Test Safe','NSF Certified']),
  p('con-cret-creatine','CON-CRET Creatine HCl','ProMera Sports',35,'Amazon','https://www.amazon.com/dp/B0BKCVLYGX?tag=gymgearcompar-20',8.2,4.5,4100,'Amazon','HCl form needs smaller dose  --  good for those who bloat on monohydrate.','Examine.com',{'Creatine':'750mg HCl','Dose':'Small','Bloating':'Reduced','Servings':'64','Type':'Hydrochloride'},['No Bloating','Small Dose','HCl Form']),
],

recovery:[
  p('transparent-sleep','Sleep & Recovery','Transparent Labs',29.99,'Transparent Labs','https://www.transparentlabs.com/products/sleep-supplement',9.4,4.9,5600,'Transparent Labs','Best sleep supplement  --  melatonin, ashwagandha, and zinc in one.','Examine.com',{'Melatonin':'3mg','Ashwagandha':'600mg','Zinc':'15mg','GABA':'500mg','Servings':'30'},['Best Formula','Sleep + Recovery','Third Party Tested'],{bestChoice:true}),
  p('legion-lunar','Lunar Sleep Aid','Legion',49,'Legion','https://legionathletics.com/products/supplements/lunar-sleep-aid/',9.0,4.8,3200,'Legion','Science-based sleep formula with lemon balm and melatonin.','Examine.com',{'Melatonin':'2mg','L-Theanine':'400mg','Lemon Balm':'600mg','GABA':'600mg','Servings':'30'},['Science Based','Natural Ingredients','Non-Habit Forming']),
  p('thorne-amino','Amino Complex','Thorne',55,'Thorne','https://www.thorne.com/products/dp/amino-complex',9.3,4.8,2100,'Thorne','NSF Certified BCAA + EAA complex for elite athlete recovery.','NSF',{'BCAAs':'7g','EAAs':'Yes','NSF Certified':'Yes','Leucine':'3.5g','Servings':'30'},['NSF Certified','Full EAA Profile','Pro Athlete']),
  p('momentous-recovery','Recovery Protein','Momentous',54.99,'Momentous','https://www.livemomentous.com/products/recovery-grass-fed-whey-isolate',9.1,4.8,1800,'Momentous','Used by NFL teams  --  tart cherry, whey, and creatine combined.','NFL Players',{'Protein':'25g','Tart Cherry':'480mg','Creatine':'3g','NSF Certified':'Yes','Servings':'30'},['NFL Trusted','Tart Cherry','3-in-1 Formula']),
  p('on-bcaa','BCAA 1000 Caps','Optimum Nutrition',28,'Amazon','https://www.amazon.com/dp/B0057Y50AO?tag=gymgearcompar-20',8.5,4.7,22000,'Amazon','Most trusted BCAA  --  convenient capsule form, great price.','Barbend',{'Leucine':'500mg','Isoleucine':'250mg','Valine':'250mg','Servings':'60','Form':'Capsule'},['Capsule Form','Best Seller','Trusted Brand']),
  p('ghost-bcaa','BCAA','Ghost',27.99,'Ghost','https://ghostlifestyle.com/products/ghost-bcaa',8.7,4.8,8900,'Ghost','Best-tasting BCAA with collab flavors.','Barbend',{'Leucine':'4g','Isoleucine':'2g','Valine':'2g','Hydration':'Yes','Servings':'30'},['Best Taste','Collab Flavors','Plus Hydration'],{}),
  p('klean-bcaa','BCAA + Peak ATP','Klean Athlete',49,'Klean Athlete','https://kleanathlete.com/products/klean-bcaa-peak-atp',9.1,4.8,1200,'Klean Athlete','Informed Sport certified BCAA plus ATP for power output.','Informed Sport',{'BCAAs':'5g','Peak ATP':'400mg','Informed Sport':'Yes','Drug Test Safe':'Yes','Servings':'30'},['Informed Sport','Drug Test Safe','Plus ATP']),
  p('nutricost-glutamine','L-Glutamine Powder','Nutricost',22,'Amazon','https://www.amazon.com/dp/B00SHXE7VK?tag=gymgearcompar-20',7.8,4.5,14000,'Amazon','Cheapest glutamine for gut health and muscle recovery.','Examine.com',{'Glutamine':'5g','Type':'L-Glutamine','Servings':'100','Calories':'0','Price Per Serving':'$0.22'},['Cheapest Option','100 Servings','Pure Glutamine']),
],

vitamins:[
  p('thorne-basics','Basic Nutrients 2/Day','Thorne',45,'Thorne','https://www.thorne.com/products/dp/basic-nutrients-2-day',9.4,4.9,3200,'Thorne','NSF Certified multivitamin trusted by pro sports teams.','NSF',{'Servings':'60 capsules','NSF Certified':'Yes','Athletes':'Pro Sports','Form':'Capsule','Third Party':'Yes'},['NSF Certified','Pro Sports Teams','Clean Formula'],{bestChoice:true}),
  p('ag1','Athletic Greens AG1','AG1',99,'AG1','https://www.athleticgreens.com/products/athletic-greens',9.0,4.7,28000,'AG1','75 vitamins, minerals, and whole-food ingredients in one scoop.','Huberman Lab',{'Ingredients':'75 nutrients','Probiotics':'Yes','Adaptogens':'Yes','Servings':'30','Form':'Powder'},['75 Nutrients','Probiotics Included','All-in-One']),
  p('legion-triumph','Triumph Multivitamin','Legion',49,'Legion','https://legionathletics.com/products/supplements/triumph-multivitamin-for-men/',9.1,4.8,4100,'Legion','Science-based multivitamin with clinically effective doses.','Examine.com',{'Servings':'30','Form':'Capsule','Evidence Based':'Yes','D3':'Yes','Third Party':'Yes'},['Science Based','Clinically Dosed','Evidence Based']),
  p('momentous-omega3','Omega-3 Fish Oil','Momentous',39.99,'Momentous','https://livemomentous.com/products/omega-3',9.2,4.9,1800,'Momentous','NSF Certified omega-3 used by NFL and NBA athletes.','NFL Players',{'EPA':'690mg','DHA':'310mg','NSF Certified':'Yes','Source':'Wild Fish','Servings':'45'},['NSF Certified','Pro Athlete','Wild Sourced']),
  p('garden-of-life-mv','Sport Multivitamin','Garden of Life',42,'Amazon','https://www.amazon.com/dp/B00280M14I?tag=gymgearcompar-20',8.8,4.7,12000,'Amazon','Certified for Sport  --  whole-food multivitamin for athletes.','Informed Sport',{'Servings':'30 tablets','Certified Sport':'Yes','Whole Food':'Yes','Non-GMO':'Yes','Probiotics':'Yes'},['Certified Sport','Whole Food','Non-GMO']),
  p('opti-men','Opti-Men Multivitamin','Optimum Nutrition',28,'Amazon','https://www.amazon.com/dp/B00K2RJAR0?tag=gymgearcompar-20',8.0,4.6,45000,'Amazon','Most popular men\'s multivitamin  --  comprehensive and affordable.','Barbend',{'Servings':'90 tablets','Form':'Tablet','Blends':'4 proprietary','Vitamins':'75+ nutrients','Ships':'Prime'},['Most Popular','Men\'s Formula','Affordable'],{salePrice:22}),
  p('ritual-men','Essential for Men','Ritual',37.5,'Ritual','https://www.ritual.com/products/essential-multivitamin-for-men',8.7,4.7,8900,'Ritual','Minimal ingredient multivitamin with full traceability.','Wirecutter',{'Servings':'30 capsules','Traceable':'Yes','Delayed Release':'Yes','Non-GMO':'Yes','Vegan':'Yes'},['Traceable Ingredients','Delayed Release','Clean Formula']),
  p('klean-mv','Klean Multivitamin','Klean Athlete',38,'Klean Athlete','https://kleanathlete.com/products/klean-multivitamin',9.0,4.8,1200,'Klean Athlete','NSF Certified and Informed Sport  --  safe for drug-tested athletes.','Informed Sport',{'Servings':'60 tablets','NSF Certified':'Yes','Informed Sport':'Yes','Drug Test Safe':'Yes','Athletes':'Olympic'},['Informed Sport','Drug Test Safe','Olympic Athletes']),
],

fatburners:[
  p('transparent-fat','PhysiqueSeries Fat Burner','Transparent Labs',54.99,'Transparent Labs','https://www.transparentlabs.com/products/fat-burner',9.3,4.8,8900,'Transparent Labs','Cleanest fat burner  --  fully disclosed, clinically dosed ingredients.','Examine.com',{'Caffeine':'300mg','Green Tea':'500mg','Glucomannan':'3g','Servings':'30','Third Party':'Yes'},['Cleanest Formula','Clinically Dosed','Third Party Tested'],{bestChoice:true}),
  p('ghost-burn','Ghost Burn','Ghost',49.99,'Ghost','https://ghostlifestyle.com/products/ghost-burn',8.8,4.7,6200,'Ghost','Best tasting fat burner  --  collab flavors with real ingredients.','Barbend',{'Caffeine':'150mg','L-Carnitine':'750mg','Acetyl-L-Carnitine':'750mg','Servings':'60','Flavors':'Collab'},['Best Taste','Stim Lite','Collab Flavors']),
  p('jym-shred','Shred JYM','JYM',40,'Amazon','https://www.amazon.com/dp/B01HGQZZUK?tag=gymgearcompar-20',8.5,4.7,12000,'Amazon','Science-based formula by Dr. Jim Stoppani  --  no proprietary blends.','Dr. Jim Stoppani',{'Caffeine':'200mg','CLA':'1.5g','L-Carnitine':'2g','Servings':'30','Blends':'None'},['Science Based','No Prop Blends','Dr. Stoppani Formula']),
  p('legion-phoenix','Phoenix Fat Burner','Legion',49,'Legion','https://legionathletics.com/products/supplements/phoenix-stim-free-fat-burner/',9.0,4.8,5400,'Legion','Stim-free fat burner with clinically effective doses.','Examine.com',{'Caffeine':'0mg','Synephrine':'25mg','Forskolin':'50mg','Servings':'30','Stim Free':'Yes'},['Stim Free','Clinically Dosed','Science Based']),
  p('evl-engn-shred','ENGN Shred Pre-Workout','Evlution Nutrition',35,'Amazon','https://www.amazon.com/dp/B01N7HT0F0?tag=gymgearcompar-20',7.8,4.5,8900,'Amazon','Pre-workout plus fat burner combo  --  two products in one.','Barbend',{'Caffeine':'250mg','L-Carnitine':'500mg','CLA':'500mg','Servings':'30','Combo':'Pre + Fat Burner'},['2-in-1 Formula','Pre+Fat Burner','Affordable'],{salePrice:25}),
  p('cellucor-clk','CLK Stimulant-Free','Cellucor',35,'Amazon','https://www.amazon.com/dp/B00ULNW9UK?tag=gymgearcompar-20',7.5,4.4,6700,'Amazon','Stimulant-free fat burner focused on CLA and L-carnitine.','Barbend',{'Caffeine':'0mg','CLA':'1g','L-Carnitine':'1.5g','Servings':'90','Stim Free':'Yes'},['Stim Free','CLA + Carnitine','90 Servings']),
  p('animal-cuts','Animal Cuts','Animal',49,'Amazon','https://www.amazon.com/dp/B000GOO00Q?tag=gymgearcompar-20',8.2,4.6,22000,'Amazon','Bodybuilder-favorite thermogenic  --  comprehensive stacked formula.','Generation Iron',{'Caffeine':'200mg','Thermogenics':'8 compounds','Diuretics':'Yes','Servings':'42','Culture':'Bodybuilding'},['Bodybuilder Favorite','Thermogenic Stack','Comprehensive Formula']),
  p('mhp-thyro-slim','Thyro-Slim AM PM','MHP',42,'Amazon','https://www.amazon.com/dp/B005JMT1K4?tag=gymgearcompar-20',7.8,4.4,2100,'Amazon','Day/night formula targeting metabolism around the clock.','Barbend',{'AM Caffeine':'200mg','PM Caffeine':'0mg','System':'AM/PM Split','Servings':'30 days','Thyroid Support':'Yes'},['AM/PM System','Thyroid Support','24hr Metabolism']),
],

belts:[
  p('inzer-forever-belt','Forever Lever Belt','Inzer',129.95,'Inzer','https://inzer.com/products/forever-lever-lifting-belt%E2%84%A2-10mm',9.6,4.9,4200,'Inzer','The gold standard powerlifting belt  --  used by world record holders.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','IPF Approved':'Yes'},['IPF Approved','10mm Thick','Lever Buckle'],{bestChoice:true}),
  p('rogue-ohio-belt','Ohio Lifting Belt','Rogue Fitness',170,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-lifting-belt',9.3,4.8,1800,'Rogue Fitness','Premium American-made leather belt, perfectly broken in.','Garage Gym Reviews',{'Thickness':'10mm','Width':'4"','Closure':'Prong','Material':'Leather','Made In':'USA'},['American Made','10mm Thick','2-Prong Buckle']),
  p('sbd-belt','Powerlifting Belt','SBD',175,'SBD','https://www.sbdapparel.com/collections/belts',9.5,4.9,2100,'SBD','The preferred belt of world champion powerlifters  --  built to last a lifetime.','Barbend',{'Thickness':'13mm','Width':'4"','Closure':'Lever','Material':'Leather','IPF Approved':'Yes'},['IPF World Record Use','13mm Thick','Lever Buckle']),
  p('pioneer-gc-belt','General Cut Belt','Pioneer Fitness',115,'Pioneer Fitness','https://pioneerfit.com/products/stock-4in-10mm-pioneer-cut-power-lifting-belt',9.1,4.9,890,'Pioneer Fitness','Handcrafted in USA  --  custom sizing available, exceptional quality.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Prong','Material':'Leather','Custom Sizing':'Yes'},['Handcrafted USA','Custom Sizes','Premium Leather']),
  p('gymreapers-lever-belt','10mm Lever Belt','Gymreapers',89,'Amazon','https://www.amazon.com/dp/B081VVFSJF?tag=gymgearcompar-20',8.8,4.7,9500,'Amazon','Best value lever belt under $100  --  thick leather, solid hardware.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','Break-In':'Minimal'},['Best Under $100','Lever Buckle','Thick Leather']),
  p('schiek-2004-belt','Model 2004 Contour Belt','Schiek Sports',65,'Amazon','https://www.amazon.com/dp/B08LHDJK6F?tag=gymgearcompar-20',8.6,4.7,15000,'Amazon','Contoured nylon belt  --  best for Olympic lifting and CrossFit.','Garage Gym Reviews',{'Thickness':'6mm','Width':'4" back / 2.5" front','Closure':'Double Prong','Material':'Nylon','Type':'Contoured'},['Contoured Shape','Olympic Lifting','CrossFit Popular']),
  p('harbinger-foam-belt','Padded Nylon Belt','Harbinger',30,'Amazon','https://www.amazon.com/dp/B00074H7PA?tag=gymgearcompar-20',8.0,4.6,32000,'Amazon','Best beginner belt  --  comfortable, affordable, widely available.','Bodybuilding.com',{'Thickness':'4mm','Width':'6" back','Closure':'Velcro + Prong','Material':'Nylon','Padding':'Foam'},['Great For Beginners','Most Affordable','Foam Padded']),
  p('element26-belt','Self-Locking Belt','Element 26',75,'Amazon','https://www.amazon.com/dp/B079ZP3MH1?tag=gymgearcompar-20',8.7,4.8,6200,'Amazon','Unique self-locking mechanism  --  quickest on and off of any belt.','Garage Gym Reviews',{'Thickness':'10mm','Width':'4"','Closure':'Self-Lock','Material':'Leather','Release':'One-Hand'},['Self-Locking','One-Hand Release','10mm Leather']),
  p('dark-iron-belt','Premium Genuine Leather Belt','Dark Iron Fitness',35,'Amazon','https://www.amazon.com/dp/B0DQDV5PBF?tag=gymgearcompar-20',7.8,4.5,18000,'Amazon','Genuine leather at a budget price  --  solid entry-level belt.','Barbend',{'Thickness':'6mm','Width':'4"','Closure':'Prong','Material':'Genuine Leather','Sizes':'S-XXXL'},['Budget Leather','Genuine Hide','Entry Level'],{salePrice:28}),
  p('bells-lever-belt','Lever Belt 10mm','Bells of Steel',99.99,'Bells of Steel','https://bellsofsteel.us/products/lever-belt',8.9,4.8,760,'Bells of Steel','Canadian-made lever belt with lifetime warranty at a fair price.','Garage Gym Lab',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','Warranty':'Lifetime'},['Lifetime Warranty','Canadian Made','Lever Buckle']),
  p("titan-powerlifting-lever-belt","Powerlifting Lever Belt — Small (21\"-28\")","Titan Fitness",139.99,"titan.fitness","https://titan.fitness/products/powerlifting-lever-belt?variant=47796663320853",8,null,null,"titan.fitness","Laminated 10mm leather lever belt, 4 inches wide, locking you in for maximal squats and deadlifts.","GymGear Compare",{"Material":"10mm thick Leather","Finish":"Black Laminated","Overall Width":"4-in.","Belt Size":"21-in - 28-in.","Product Weight":"3.3 lb."},["Lever Buckle","10mm Laminated","4-Inch Width"],{salePrice:119.97}),
  p("titan-titan-maxxum-lifting-belts","Titan MAXXUM Lifting Belts — Small (21\"-28\")","Titan Fitness",89.99,"titan.fitness","https://titan.fitness/products/titan-maxxum-lifting-belts?variant=47796660961557",7.4,null,null,"titan.fitness","Vegetable-tanned 10mm leather belt at a 4-inch width, with a quick single-prong buckle.","GymGear Compare",{"Material":"10mm Thick Leather","Finish":"Brown Vegetable Tanned","Overall Width":"4-in.","Belt Size":"21-in. - 28-in.","Product Weight":"1.6 lb."},["10mm Leather","Single-Prong Buckle","4-Inch Width"],{salePrice:64.97}),
],

straps:[
  p('versa-gripps-pro','Versa Gripps PRO','Versa Gripps',60,'Amazon','https://www.amazon.com/dp/B002Y2S6K8?tag=gymgearcompar-20',9.2,4.8,6500,'Amazon','No-wrap grip aid  --  lock in instantly, release in an emergency.','Garage Gym Reviews',{'Material':'Anti-Slip Polymer','Type':'No-Wrap','Wrist Support':'Built-In','Quick Release':'Yes','Patent':'Patented'},['No Wrapping','Emergency Release','Patented Design'],{bestChoice:true}),
  p('harbinger-padded-straps','Padded Cotton Straps','Harbinger',15,'Amazon','https://www.amazon.com/dp/B07T9GS5DZ?tag=gymgearcompar-20',8.4,4.7,28000,'Amazon','Best-selling lifting straps  --  padded wrist, super comfortable.','Barbend',{'Material':'Cotton','Length':'21.5"','Padding':'Yes','Wrist Width':'2"','Washable':'Yes'},['Best Seller','Padded Wrist','Most Popular']),
  p('rogue-lifting-straps','Lifting Straps','Rogue Fitness',18,'Rogue Fitness','https://www.roguefitness.com/rogue-lifting-straps',8.8,4.8,3400,'Rogue Fitness','Heavy cotton straps with Rogue durability  --  simple and reliable.','Garage Gym Reviews',{'Material':'Cotton','Length':'22"','Width':'1.5"','Type':'Loop','Made In':'USA'},['American Made','Heavy Cotton','Rogue Durability']),
  p('gymreapers-figure8','Figure 8 Lifting Straps','Gymreapers',22,'Amazon','https://www.amazon.com/dp/B07R6V2KVJ?tag=gymgearcompar-20',8.9,4.8,11000,'Amazon','Figure-8 design locks the bar to your hand  --  best for heavy deadlifts.','Barbend',{'Material':'Cotton/Neoprene','Type':'Figure-8','Padding':'Neoprene','Max Weight':'700+ lbs','Wrist Wrap':'Built-In'},['Figure-8 Lock','Heavy Deadlifts','No Slip']),
  p('schiek-1000ls','Model 1000-LS Power Straps','Schiek Sports',28,'Amazon','https://www.amazon.com/dp/B000XRE6SW?tag=gymgearcompar-20',8.7,4.7,8900,'Amazon','Neoprene-padded straps  --  best comfort for high-rep training.','Bodybuilding.com',{'Material':'Cotton + Neoprene','Length':'14"','Padding':'Yes','Width':'1.5"','Type':'Loop'},['Neoprene Padded','High Reps','Premium Comfort']),
  p('stoic-straps','Lifting Straps','Stoic',14,'Amazon','https://www.amazon.com/dp/B0771JX4Y3?tag=gymgearcompar-20',8.3,4.6,5200,'Amazon','Simple, affordable cotton straps that outlast their price tag.','Barbend',{'Material':'Cotton','Length':'23"','Width':'1.5"','Type':'Loop','Value':'Excellent'},['Best Budget','Simple Design','Long Length']),
  p('ironbull-figure8','Figure 8 Power Straps','Iron Bull Strength',20,'Amazon','https://www.amazon.com/dp/B08HSHNPRT?tag=gymgearcompar-20',8.5,4.7,6700,'Amazon','Heavy-duty figure-8  --  great for 500+ lb pulls at a low price.','Barbend',{'Material':'Cotton','Type':'Figure-8','Max Weight':'600 lbs','Padding':'Minimal','Sizes':'S/M/L'},['Heavy Duty','Figure-8','Budget Pick'],{salePrice:16}),
  p('dmoose-straps','Premium Lifting Straps','DMoose',14,'Amazon','https://www.amazon.com/dp/B0C8DMXJ53?tag=gymgearcompar-20',8.1,4.6,14000,'Amazon','Budget cotton straps with a neoprene wrist pad  --  great entry-level option.','Barbend',{'Material':'Cotton + Neoprene','Length':'23"','Padding':'Neoprene','Type':'Loop','Washable':'Yes'},['Budget Friendly','Neoprene Wrist','Beginner Pick']),
  p('pioneer-straps','Leather Lifting Straps','Pioneer Fitness',35,'Pioneer Fitness','https://pioneerfit.com/products/pioneer-leather-lifting-straps',8.8,4.8,420,'Pioneer Fitness','Handcrafted leather straps  --  virtually indestructible, last decades.','Garage Gym Reviews',{'Material':'Leather','Length':'24"','Width':'2"','Type':'Loop','Made In':'USA'},['Handcrafted USA','Leather Built','Indestructible']),
  p('serious-steel-straps','Cotton Lifting Straps','Serious Steel',12,'Amazon','https://www.amazon.com/dp/B00S553RMK?tag=gymgearcompar-20',7.9,4.5,3800,'Amazon','No-frills heavy cotton  --  best value per dollar for basic straps.','Garage Gym Reviews',{'Material':'Cotton','Length':'24"','Width':'1.5"','Type':'Loop','Pack':'Pair'},['Best Value','Heavy Cotton','No Frills']),
  p("pioneerfit-leather-oly-lifting-straps-by-pio","Leather Oly Lifting Straps by Pioneer — Natural Leather","Pioneer Fitness | General Leathercraft Mfg.",25.5,"pioneerfit.com","https://pioneerfit.com/products/leather-oly-lifting-straps-by-pioneer?variant=46755740647670",7.2,null,null,"pioneerfit.com","Box-stitched natural leather loop straps rated light to moderate, best for higher-rep grip assistance.","GymGear Compare",{"Material":"100% genuine leather","Dimensions":"1.5 in. W x 24 in. L","Strength Rating":"Light/Moderate","Construction":"Box stitched","Made In":"USA"},["Genuine Leather","Made In USA","Box Stitched"]),
  p("pioneerfit-adjustable-heavy-duty-lifting-str","Heavy Duty Adjustable Lifting Straps by Pioneer","Pioneer Fitness | General Leathercraft Mfg.",33.95,"pioneerfit.com","https://pioneerfit.com/products/adjustable-heavy-duty-lifting-straps-by-pioneer",7.8,null,null,"pioneerfit.com","Thick adjustable cotton straps that cinch tight to the bar for maximal deadlifts and rows.","GymGear Compare",{"Style":"Adjustable","Material":"Durable cotton","Made In":"USA","Sold As":"Pair","Strength":"Heavy duty"},["Adjustable Fit","Made In USA","Heavy Duty"]),
  p("pioneerfit-heavy-duty-oly-lifting-straps-by-","Heavy Duty Oly Lifting Straps by Pioneer","Pioneer Fitness | General Leathercraft Mfg.",33.95,"pioneerfit.com","https://pioneerfit.com/products/heavy-duty-oly-lifting-straps-by-pioneer-oly",7.6,null,null,"pioneerfit.com","Thick closed-loop cotton Olympic straps, made in the USA, for quick on-and-off heavy pulls.","GymGear Compare",{"Style":"Closed-loop (Olympic)","Material":"Durable cotton","Made In":"USA","Sold As":"Pair","Strength":"Heavy duty"},["Closed Loop","Made In USA","Heavy Duty"]),
],

wraps:[
  p('sbd-wrist-wraps','Wrist Wraps','SBD',65,'SBD','https://sbdapparel.com/products/original-wrist-wraps',9.4,4.9,3100,'SBD','Used by the world\'s top powerlifters  --  stiff, supportive, IPF approved.','Barbend',{'Stiffness':'Stiff','Length':'50cm','IPF Approved':'Yes','Material':'Cotton/Elastic','Warranty':'5 Year'},['IPF Approved','Competition Grade','World Record Use'],{bestChoice:true}),
  p('rogue-wrist-wraps','USA Wrist Wraps','Rogue Fitness',35,'Rogue Fitness','https://www.roguefitness.com/rogue-wrist-wraps',9.0,4.8,2800,'Rogue Fitness','American-made cotton wraps with solid stiffness  --  Rogue quality.','Garage Gym Reviews',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton','Made In':'USA','Thumb Loop':'Yes'},['American Made','Medium-Stiff','Rogue Quality']),
  p('inzer-true-black-wraps','True Black Wrist Wraps','Inzer',22,'Inzer','https://www.inzernet.com/products/true-black-wrist-wraps',9.1,4.9,1900,'Inzer','Competition-grade elastic wraps from a trusted powerlifting brand.','Barbend',{'Stiffness':'Stiff','Length':'20"','Material':'Elastic Cotton','IPF Approved':'Yes','Type':'Competition'},['IPF Approved','Very Stiff','Inzer Quality']),
  p('gymreapers-wrist-wraps','Wrist Wraps 18"','Gymreapers',25,'Amazon','https://www.amazon.com/dp/B07BSQSWJF?tag=gymgearcompar-20',8.7,4.7,14000,'Amazon','Best budget competition-style wraps  --  stiff support at half the price.','Barbend',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton/Elastic','Thumb Loop':'Yes','Value':'High'},['Best Budget','Medium-Stiff','Great Value']),
  p('mark-bell-wraps','Gangsta Wrist Wraps','Mark Bell Sling Shot',30,'Amazon','https://www.amazon.com/dp/B017BO1MGI?tag=gymgearcompar-20',8.8,4.8,7500,'Amazon','Extra stiff wraps designed by powerlifting legend Mark Bell.','Barbend',{'Stiffness':'Extra Stiff','Length':'18"','Material':'Cotton/Elastic','Endorsed':'Mark Bell','Type':'Powerlifting'},['Extra Stiff','Mark Bell Design','Powerlifting']),
  p('schiek-1100tt-wraps','Platinum Series Wrist Wraps','Schiek Sports',25,'Amazon','https://www.amazon.com/dp/B0011802YO?tag=gymgearcompar-20',8.5,4.7,9200,'Amazon','Firm elastic wraps popular with bodybuilders and powerlifters alike.','Bodybuilding.com',{'Stiffness':'Firm','Length':'18"','Material':'Elastic','Colors':'Multiple','Type':'Universal'},['Firm Support','Universal Use','Color Options']),
  p('iron-bull-wraps','Extreme Wrist Wraps','Iron Bull Strength',20,'Amazon','https://www.amazon.com/dp/B07C4HKMMD?tag=gymgearcompar-20',8.3,4.6,8800,'Amazon','Thick elastic wraps with a thumb loop  --  solid budget option.','Barbend',{'Stiffness':'Medium','Length':'18"','Material':'Elastic Cotton','Thumb Loop':'Yes','Velcro':'Heavy Duty'},['Budget Pick','Thick Elastic','Thumb Loop'],{salePrice:16}),
  p('stoic-wrist-wraps','Wrist Wraps','Stoic',22,'Amazon','https://www.amazon.com/dp/B09PVL69L3?tag=gymgearcompar-20',8.4,4.7,4600,'Amazon','Clean minimalist wraps with great stiffness-to-price ratio.','Garage Gym Reviews',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton/Elastic','Design':'Minimal','Colors':'Black'},['Clean Design','Medium-Stiff','Great Value']),
  p('harbinger-wraps','Wrist Wraps Pro','Harbinger',12,'Amazon','https://www.amazon.com/dp/B09PVL69L3?tag=gymgearcompar-20',7.8,4.5,22000,'Amazon','Most accessible wraps  --  found everywhere, great for casual lifters.','Bodybuilding.com',{'Stiffness':'Light-Medium','Length':'18"','Material':'Cotton/Elastic','Type':'General Training','Beginner':'Yes'},['Widely Available','Beginner Friendly','Affordable']),
  p('wod-nation-wraps','Wrist Wraps','WOD Nation',18,'Amazon','https://www.amazon.com/dp/B01MU4NFQE?tag=gymgearcompar-20',8.0,4.6,11000,'Amazon','CrossFit-focused wraps  --  flexible support for high-rep movements.','Barbend',{'Stiffness':'Flexible','Length':'18"','Material':'Cotton/Elastic','Sport':'CrossFit','Thumb Loop':'Yes'},['CrossFit Focused','Flexible Support','Thumb Loop']),
  p("pioneerfit-pioneer-knee-wraps-heavy","Pioneer Knee Wraps-Heavy","Pioneer Fitness | General Leathercraft Mfg.",54,"pioneerfit.com","https://pioneerfit.com/products/pioneer-knee-wraps-heavy",8.3,5,8,"pioneerfit.com","Pioneer's stiffest elastic knee wrap at 3mm thick, aimed at intermediate and advanced squatters.","GymGear Compare",{"Thickness":"3mm","Width":"8cm","Stretch":"120%","Elastic":"Strongest rubber in Pioneer's new line","Available Lengths":"2m, 2.5m, 3m"},["3mm Thick","Strongest Elastic","120% Stretch"]),
  p("pioneerfit-pioneer-guardian-wrist-wraps","Guardian Wrist Wraps — 12\"","Pioneer Fitness | General Leathercraft Mfg.",28.95,"pioneerfit.com","https://pioneerfit.com/products/pioneer-guardian-wrist-wraps?variant=46471196573942",7.5,null,null,"pioneerfit.com","Competition-quality elastic wrist wrap in a short 12-inch length for pressing support without bulk.","GymGear Compare",{"Length":"12 in.","Closure":"Heavy-duty elastic and hook-and-loop","Made In":"USA","Sold As":"Pair","Available Lengths":"12 in., 24 in., 36 in."},["Made In USA","Velcro Closure","Sold In Pairs"],{salePrice:17.37}),
  p("pioneerfit-pioneer-guardian-knee-wraps","Guardian Knee Wraps — 2m","Pioneer Fitness | General Leathercraft Mfg.",38.95,"pioneerfit.com","https://pioneerfit.com/products/pioneer-guardian-knee-wraps?variant=46471197655286",7.7,5,6,"pioneerfit.com","Softer competition-grade elastic knee wrap, made in Texas, forgiving enough for a lifter's first wraps.","GymGear Compare",{"Length":"2m","Stiffness":"5th stiffest elastic in Pioneer's line","Made In":"USA (Texas)","Sold As":"Pair","Available Lengths":"2m, 2.5m, 3m"},["Made In USA","Beginner Friendly","Sold In Pairs"],{salePrice:23.37}),
],

sleeves:[
  p('sbd-knee-sleeves','Knee Sleeves 7mm','SBD',90,'SBD','https://sbdapparel.com/products/7mm-knee-sleeves',9.5,4.9,2900,'SBD','The gold standard powerlifting sleeve  --  maximal support, IPF approved.','Barbend',{'Thickness':'7mm','Material':'Neoprene','IPF Approved':'Yes','Stiffness':'Very Stiff','Warranty':'Lifetime'},['IPF Approved','Maximum Support','World Record Use'],{bestChoice:true}),
  p('rehband-rx-sleeves','RX Knee Sleeve 7mm','Rehband',80,'Amazon','https://www.amazon.com/dp/B01LDGLA5I?tag=gymgearcompar-20',9.2,4.8,12000,'Amazon','Medical-grade neoprene  --  the most trusted knee sleeve in CrossFit.','Garage Gym Reviews',{'Thickness':'7mm','Material':'Medical Neoprene','Sport':'CrossFit/PL','Compression':'High','Swedish Made':'Yes'},['Medical Grade','CrossFit Favorite','Swedish Quality']),
  p('sbd-sleeves','Knee Sleeves 7mm','SBD',109,'SBD','https://sbdapparel.com/products/7mm-knee-sleeves',10,5.0,1800,'Powerlifting.sport','IPF world record sleeves  --  the gold standard for competitive powerlifting.','Powerlifting.sport',{'Thickness':'7mm','IPF Approved':'Yes','IWF Approved':'Yes','Stiffness':'Max','Origin':'UK'},['IPF Approved','Competition Gold Standard','Max Stiffness'],{bestChoice:true}),
  p('stoic-knee-sleeves','Knee Sleeves 7mm','Stoic',55,'Amazon','https://www.amazon.com/dp/B07BZR9365?tag=gymgearcompar-20',8.9,4.8,6700,'Amazon','Best value 7mm sleeve  --  rivals SBD and Rehband at a fraction of the cost.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Stiff','Value':'Excellent','Sport':'Powerlifting'},['Best Value','7mm Thick','Rivals Premium Brands']),
  p('rogue-knee-sleeves','Knee Sleeves 5mm','Rogue Fitness',50,'Rogue Fitness','https://www.roguefitness.com/rogue-knee-sleeves',8.7,4.7,3200,'Rogue Fitness','5mm sleeves ideal for Olympic lifting and moderate support during squats.','Garage Gym Reviews',{'Thickness':'5mm','Material':'Neoprene','Stiffness':'Moderate','Sport':'Olympic/CrossFit','Made In':'USA'},['American Made','5mm Moderate','Olympic Lifting']),
  p('gymreapers-knee-sleeves','Knee Sleeves 7mm','Gymreapers',40,'Amazon','https://www.amazon.com/dp/B01G6C1R9I?tag=gymgearcompar-20',8.6,4.7,18000,'Amazon','Best budget 7mm sleeve  --  stiff neoprene support at an unbeatable price.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Stiff','Value':'High','Pack':'Pair'},['Best Budget','7mm Thick','Best Price'],{salePrice:32}),
  p('mark-bell-knee-sleeve','Hip Circle Knee Sleeve','Mark Bell Sling Shot',60,'Amazon','https://www.amazon.com/dp/B01C7EJSK4?tag=gymgearcompar-20',8.8,4.8,5400,'Amazon','Stiffer than average  --  designed for max knee support on heavy squats.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Extra Stiff','Designer':'Mark Bell','Use':'Heavy Squat'},['Extra Stiff','Heavy Squat','Mark Bell Design']),
  p('bear-komplex-sleeves','Knee Sleeves 7mm','Bear Komplex',45,'Amazon','https://www.amazon.com/dp/B016NF2CKG?tag=gymgearcompar-20',8.5,4.7,7800,'Amazon','CrossFit-popular sleeve with good compression and a clean design.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Sport':'CrossFit','Design':'Clean','Colors':'Multiple'},['CrossFit Popular','Clean Design','Multiple Colors']),
  p('iron-bull-sleeves','Knee Sleeves 7mm','Iron Bull Strength',30,'Amazon','https://www.amazon.com/dp/B01H434BQY?tag=gymgearcompar-20',8.1,4.6,9300,'Amazon','Great entry-level 7mm sleeve  --  solid compression without the premium price.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Moderate-Stiff','Value':'Best Budget','Pack':'Pair'},['Entry Level','7mm Budget','Good Compression'],{salePrice:22}),
  p('pioneer-knee-sleeves','Knee Sleeves 7mm','Pioneer Fitness',81.99,'Pioneer Fitness','https://pioneerfit.com/products/pioneer-7mm-competition-knee-sleeve',8.9,4.8,380,'Pioneer Fitness','Handcrafted USA sleeves  --  extremely dense neoprene, built to outlast anything.','Garage Gym Reviews',{'Thickness':'7mm','Material':'Dense Neoprene','Made In':'USA','Stiffness':'Very Stiff','Durability':'Excellent'},['Handcrafted USA','Dense Neoprene','Extremely Durable']),
  p('harbinger-knee-sleeves','Knee Sleeve 5mm','Harbinger',20,'Amazon','https://www.amazon.com/dp/B0DDK4P8QL?tag=gymgearcompar-20',7.8,4.5,14000,'Amazon','Light 5mm sleeve  --  best for warmth and mild support during general training.','Bodybuilding.com',{'Thickness':'5mm','Material':'Neoprene','Stiffness':'Light','Use':'General Training','Beginner':'Yes'},['Beginner Friendly','Mild Support','Widely Available']),
],

chalk:[
  p('frictionlabs-loose','Unicorn Dust Loose Chalk','Friction Labs',20,'Friction Labs','https://frictionlabs.com/products/friction-labs-loose-chalk-in-new-recyclable-packaging',9.5,4.9,7800,'Friction Labs','The purest, driest chalk on the market  --  used by Olympic athletes worldwide.','Barbend',{'Type':'Loose','Weight':'250g','Purity':'Ultra-Pure MgCO3','Format':'Loose Powder','Pro Athletes':'Yes'},['Olympic Athletes','Ultra Pure','Driest Chalk'],{bestChoice:true}),
  p('frictionlabs-secret-stuff','Secret Stuff Liquid Chalk','Friction Labs',19,'Friction Labs','https://frictionlabs.com/products/secret-stuff-liquid-chalk',9.3,4.8,5200,'Friction Labs','Best liquid chalk available  --  goes on dry, lasts all session without reapplying.','Garage Gym Reviews',{'Type':'Liquid','Volume':'1 fl oz','Dries':'Fast','Mess':'Minimal','Reapply':'Rarely'},['Liquid Formula','Long Lasting','No Mess']),
  p('black-diamond-chalk','Super Chalk Loose','Black Diamond',8,'Amazon','https://www.amazon.com/dp/B001A5TD70?tag=gymgearcompar-20',8.8,4.8,31000,'Amazon','The climber\'s favorite  --  ultra-fine, trusted by athletes in every sport.','Barbend',{'Type':'Loose','Weight':'100g','Purity':'High','Format':'Chalk Ball Option','Origin':'Climbing'},['Most Popular','Climber Tested','Ultra Fine'],{salePrice:6}),
  p('primo-chalk','Primo Chalk Block','Primo Chalk',20,'Amazon','https://www.amazon.com/dp/B00EWOD96C?tag=gymgearcompar-20',9.0,4.8,4100,'Amazon','Virtually dustless chalk blocks  --  stay whiter, last longer, less waste.','Garage Gym Reviews',{'Type':'Block','Weight':'8 x 2oz blocks','Dust':'Minimal','Format':'Block','Value':'High'},['Virtually Dustless','Block Format','Lasts Longer']),
  p('tension-chalk','Chalk Block 2oz','Tension Climbing',16,'Amazon','https://www.amazon.com/dp/B004HXDFSK?tag=gymgearcompar-20',8.7,4.7,3600,'Amazon','Dry, high-purity chalk from a climbing brand trusted by gym athletes.','Barbend',{'Type':'Block','Weight':'2oz','Purity':'High','Format':'Block','Dust':'Low'},['Dry Formula','Low Dust','High Purity']),
  p('carbon-black-chalk','Liquid Chalk','Carbon Black',15,'Amazon','https://www.amazon.com/dp/B009M3OEV2?tag=gymgearcompar-20',8.5,4.6,6800,'Amazon','Budget liquid chalk  --  fast drying, works great for lifting and CrossFit.','Barbend',{'Type':'Liquid','Volume':'200ml','Dries':'Fast','Mess':'None','Sport':'Lifting/CrossFit'},['Budget Liquid','Fast Drying','No Mess'],{salePrice:11}),
  p('metolius-chalk','Super Chalk Block','Metolius',10,'Amazon','https://www.amazon.com/dp/B004HXDFSK?tag=gymgearcompar-20',8.6,4.7,12000,'Amazon','Classic chalk block  --  reliable, widely used, very affordable.','Barbend',{'Type':'Block','Weight':'1lb block','Purity':'Standard','Format':'Block','Value':'High'},['Classic Block','1lb Value','Reliable']),
  p('spri-chalk-ball','Chalk Ball','SPRI',12,'Amazon','https://www.amazon.com/dp/B07R92TWRJ?tag=gymgearcompar-20',8.0,4.5,9400,'Amazon','Mesh chalk ball  --  controlled application, less mess than loose chalk.','Bodybuilding.com',{'Type':'Ball','Weight':'50g','Mess':'Minimal','Format':'Ball','Reusable':'Yes'},['Chalk Ball','Mess-Free Apply','Gym Friendly']),
  p('liquid-grip-chalk','Liquid Grip','Liquid Grip',18,'Amazon','https://www.amazon.com/dp/B007WTQIDU?tag=gymgearcompar-20',8.4,4.6,8700,'Amazon','Rosin-based liquid grip  --  exceptional tackiness outlasting traditional chalk.','Barbend',{'Type':'Liquid','Base':'Rosin + Chalk','Tackiness':'Very High','Volume':'250ml','Sport':'Multi-Sport'},['Rosin Based','Extra Tacky','Multi-Sport']),
  p('weightlifting-house-chalk','Loose Chalk 1kg','Weightlifting House',15,'Weightlifting House','https://www.weightliftinghouse.com',8.3,4.7,1200,'Weightlifting House','Bulk chalk for serious lifters  --  pure magnesium carbonate by the kilo.','Garage Gym Reviews',{'Type':'Loose','Weight':'1kg','Purity':'Pure MgCO3','Format':'Bulk','Value':'Best Bulk'},['Bulk Value','1kg Block','Pure MgCO3']),
  p("frictionlabs-the-chalk-disc","The Chalk Disc","Friction Labs",14.99,"frictionlabs.com","https://frictionlabs.com/products/the-chalk-disc",8.5,null,null,"frictionlabs.com","Five pressed chalk discs of pharmaceutical-grade magnesium carbonate, shaped for precise low-dust application.","GymGear Compare",{"Contents":"5 discs, 0.85 oz each","Net weight":"4.25 oz (120 g)","Chalk grade":"Pharmaceutical grade","Origin":"Made in the USA","Packaging":"Resealable, curbside recyclable tube"},["Low Dust","Made in USA","Precision Application"]),
  p("fringesport-gym-chalk-1lb-8-2oz-blocks","Gym Chalk","Fringe Sport",18,"fringesport.com","https://fringesport.com/products/gym-chalk-1lb-8-2oz-blocks",7.6,4.69,26,"fringesport.com","A pound of pure magnesium carbonate in eight two-ounce blocks, so you can keep one in every gym bag.","GymGear Compare",{"Contents":"8 blocks, 2 oz each","Total weight":"1 lb","Material":"Magnesium carbonate","Purity":"100% pure chalk","Form":"Block chalk"},["Bulk Value","Pure Magnesium Carbonate","Block Chalk"]),
  p("pioneerfit-pioneer-power-chalk-by-bare-grip-","Pioneer Power Chalk- 8oz","Pioneer Fitness | General Leathercraft Mfg.",18.99,"pioneerfit.com","https://pioneerfit.com/products/pioneer-power-chalk-by-bare-grip-6oz",6.9,null,null,"pioneerfit.com","An eight-ounce bottle of American-made liquid chalk aimed at powerlifters who want quick-drying grip.","GymGear Compare",{"Size":"8 oz","Type":"Liquid chalk","Origin":"Made in the USA","Application":"Quick drying","Bottle":"Clog proof"},["Made in USA","Quick Drying","Large Bottle"]),
  p("frictionlabs-alcohol-free-secret-stuff","Alcohol Free Secret Stuff® Liquid Chalk","FrictionLabs",19,"frictionlabs.com","https://frictionlabs.com/products/alcohol-free-secret-stuff",8.4,4.84,465,"frictionlabs.com","Gel-based liquid chalk without alcohol, made for sensitive skin and dry climates, but slower to dry.","GymGear Compare",{"Type":"Gel based liquid chalk","Alcohol":"Alcohol free","Scent":"Odor free","Dry time":"About 90 seconds","Best for":"Sensitive skin, dry and arid climates"},["Alcohol Free","Sensitive Skin","Odor Free"]),
  p("frictionlabs-secret-stuff-80-alcohol-hygieni","Secret Stuff® Hygienic - 80% Alcohol Liquid Chalk","FrictionLabs",19,"frictionlabs.com","https://frictionlabs.com/products/secret-stuff-80-alcohol-hygienic-chalk",8.8,4.84,465,"frictionlabs.com","An 80% alcohol liquid chalk that dries in about twenty seconds and cuts germ transfer.","GymGear Compare",{"Type":"Liquid chalk","Base":"80% ethyl alcohol","Formula":"Pure magnesium carbonate","Dry time":"About 20 seconds","Benefit":"Hygienic, reduces spread of germs"},["Fast Drying","Hygienic Formula","Low Dust"]),
],

yogamats:[
  p('lululemon-mat','The Reversible Mat 5mm','Lululemon',88,'Lululemon','https://shop.lululemon.com/p/yoga-mats/The-Reversible-Mat-5mm',9.4,4.8,14000,'Lululemon','Best overall yoga mat  --  grippy, durable, two-sided texture.','Yoga Journal',{'Thickness':'5mm','Material':'Natural Rubber','Length':'71"','Width':'26"','Weight':'4.5 lbs'},['Best Overall','Two-Sided','Natural Rubber'],{bestChoice:true}),
  p('manduka-pro','PRO Yoga Mat','Manduka',144,'Manduka','https://www.manduka.com/products/manduka-pro-yoga-mat?variant=31221554118714',9.6,4.9,8200,'Manduka','Lifetime guarantee  --  the last mat you will ever buy.','Yoga Journal',{'Thickness':'6mm','Material':'PVC','Length':'71"','Width':'26"','Guarantee':'Lifetime'},['Lifetime Guarantee','Ultra Dense','Professional Grade']),
  p('jade-harmony','Harmony Yoga Mat','Jade Yoga',79,'Jade Yoga','https://jadeyoga.com/products/harmony-mat',9.0,4.8,6400,'Jade Yoga','Best eco-friendly mat  --  natural rubber, plants a tree per mat sold.','Yoga Journal',{'Thickness':'3/16"','Material':'Natural Rubber','Length':'68"','Width':'24"','Eco':'Yes'},['Eco Friendly','Plants A Tree','Natural Rubber']),
  p('gaiam-premium','Premium Solid Yoga Mat','Gaiam',35,'Amazon','https://www.amazon.com/dp/B078P4H7VN?tag=gymgearcompar-20',7.8,4.5,42000,'Amazon','Best budget mat  --  lightweight, sticky, great for beginners.','Wirecutter',{'Thickness':'6mm','Material':'PVC','Length':'68"','Width':'24"','Weight':'2.5 lbs'},['Best Budget','Lightweight','Beginner Friendly'],{salePrice:28}),
  p('alo-warrior','Warrior Mat','Alo Yoga',148,'Alo Yoga','https://www.aloyoga.com/products/w7092r-warrior-mat-black',8.8,4.7,3200,'Alo Yoga','Premium polyurethane top layer  --  exceptional grip even when sweaty.','Yoga Journal',{'Thickness':'5mm','Material':'Polyurethane/Rubber','Length':'72"','Width':'26"','Grip':'Excellent'},['Sweat Proof Grip','PU Top Layer','Premium Feel']),
  p('liforme-original','Original Yoga Mat','Liforme',150,'Liforme','https://liforme.com/products/liforme-classic-yoga-mat',9.2,4.8,2100,'Yoga Journal','Widest mat with alignment markers  --  best for beginners learning positioning.','Yoga Journal',{'Thickness':'4.2mm','Material':'Natural Rubber','Length':'73"','Width':'27"','Alignment Lines':'Yes'},['Alignment Markers','Widest Mat','Natural Rubber']),
  p('yune-tohi','Tohi Yoga Mat','Yune Yoga',69,'Yune Yoga','https://yuneyoga.com/products/tohi-yoga-mat',8.4,4.6,1800,'Yoga Journal','Lightweight TPE mat  --  best for travel and studio-to-gym.','Yoga Journal',{'Thickness':'4mm','Material':'TPE','Length':'72"','Width':'24"','Foldable':'Yes'},['Travel Friendly','Lightweight','TPE Material']),
  p('amazon-basics-mat','Extra Thick Yoga Mat','Amazon Basics',25,'Amazon','https://www.amazon.com/dp/B0116Q6WRW?tag=gymgearcompar-20',6.5,4.3,89000,'Amazon','Thickest budget mat  --  great for floor exercises and low-impact workouts.','Wirecutter',{'Thickness':'13mm','Material':'NBR Foam','Length':'71"','Width':'24"','Weight':'3 lbs'},['Thickest Budget','Cushioned','Floor Exercises']),
  p("jadeyoga-travel-mat","Best-Selling Travel Yoga Mat  – Lightweight, Portable and Durable — 68\" Length / Midnight Blue","JadeYoga",79.95,"jadeyoga.com","https://jadeyoga.com/products/travel-mat?variant=1225840084",8.2,4.39,23,"jadeyoga.com","Folds into a suitcase and still grips, a natural rubber mat for practicing away from home.","GymGear Compare",{"Thickness":"1/8 in","Dimensions":"68 in long x 24 in wide","Weight":"Just over 3 lb","Material":"Open cell natural rubber","Made in":"United States"},["Packs Flat","Natural Rubber","Travel Ready"]),
  p("jadeyoga-jade-extra-yoga-mat","Jade Extra Yoga Mat - JadeYoga","JadeYoga",79.95,"jadeyoga.com","https://jadeyoga.com/products/jade-extra-yoga-mat",8.4,4.73,11,"jadeyoga.com","A textured polyurethane surface that absorbs sweat, with an antimicrobial finish, on a natural rubber base.","GymGear Compare",{"Thickness":"4.5 mm","Dimensions":"71 in long x 26 in wide","Weight":"About 5 lb","Surface":"Textured polyurethane (PU)","Treatment":"Antimicrobial (silver nitrate)"},["Sweat Absorbing","Antimicrobial Surface","Extra Grip"]),
  p("jadeyoga-jade-cork-yoga-mat","Jade Cork Yoga Mat - Hot Yoga - Eco Friendly - JadeYoga","JadeYoga",99.95,"jadeyoga.com","https://jadeyoga.com/products/jade-cork-yoga-mat",8.6,4.7,10,"jadeyoga.com","Cork over a natural rubber base, the grip holds up when your hands and mat get sweaty.","GymGear Compare",{"Thickness":"4.5 mm","Dimensions":"72 in long x 24 in wide","Weight":"About 5 lb","Surface":"Sustainably harvested cork","Base":"Natural rubber, no PVC"},["Hot Yoga","Cork Surface","Eco Friendly"]),
  p("jadeyoga-fusion-mat","Jade Fusion Yoga & Pilates Mat – Extra Thick Natural Rubber Yoga & Pilates Mat - JadeYoga — 68\" Length / Midnight Blue","JadeYoga",174.95,"jadeyoga.com","https://jadeyoga.com/products/fusion-mat?variant=1225775176",9,4.64,81,"jadeyoga.com","An 8mm natural rubber mat, the cushioned pick for restorative yoga, Pilates and sore joints.","GymGear Compare",{"Thickness":"8 mm (5/16 in)","Dimensions":"68 in long x 24 in wide","Weight":"About 8.5 lb","Material":"Open cell natural rubber","Made in":"United States"},["Extra Thick","Natural Rubber","Made in USA"]),
  p("jadeyoga-xw-fusion","XW Fusion Yoga Mat - Extra Wide and Thick for Grip - JadeYoga","JadeYoga",249.95,"jadeyoga.com","https://jadeyoga.com/products/xw-fusion",9,4.91,32,"jadeyoga.com","The thickest and widest Jade mat, 8mm of natural rubber for taller or larger practitioners.","GymGear Compare",{"Thickness":"8 mm (5/16 in)","Dimensions":"80 in long x 28 in wide","Material":"Open cell natural rubber","Made in":"United States","Contains":"No PVC, EVA or synthetic rubber"},["Extra Wide","Natural Rubber","Made in USA"]),
],

foamrollers:[
  p('trigger-point-grid','GRID Foam Roller','TriggerPoint',37,'Amazon','https://www.amazon.com/dp/B0040EGNIU?tag=gymgearcompar-20',9.2,4.7,38000,'Amazon','Best overall foam roller  --  patented GRID surface, hollow core, built to last.','Wirecutter',{'Diameter':'5.5"','Length':'13"','Density':'Firm','Core':'Hollow','Made In':'USA'},['Best Overall','GRID Surface','Hollow Core'],{bestChoice:true}),
  p('rumble-roller','Original Rumble Roller','RumbleRoller',55,'Amazon','https://www.amazon.com/dp/B00BKPQXPQ?tag=gymgearcompar-20',9.0,4.7,12000,'Amazon','Deepest tissue massage  --  firm nubs dig into knots like no flat roller can.','Barbend',{'Diameter':'6"','Length':'12"','Nubs':'Yes','Density':'Extra Firm','Best For':'Deep Tissue'},['Deep Tissue','Firm Nubs','Intense Relief']),
  p('hyperice-vyper','Vyper 3 Vibrating Roller','Hyperice',209,'Hyperice','https://hyperice.com/products/vyper-3',9.4,4.7,4200,'Wirecutter','Best vibrating foam roller  --  3 speed settings, dramatically speeds recovery.','Wirecutter',{'Vibration':'3 Speeds','Battery':'2 hrs','Diameter':'6"','Length':'13"','Charge':'USB-C'},['Vibrating','3 Speeds','Tech Recovery']),
  p('lux-fit-roller','Premium High Density Roller','LuxFit',18,'Amazon','https://www.amazon.com/dp/B00MKEH2OC?tag=gymgearcompar-20',7.8,4.5,67000,'Amazon','Best budget roller  --  simple, firm, does the job.','Wirecutter',{'Diameter':'6"','Length':'12"','Density':'High','Core':'EVA Foam','Colors':'Multiple'},['Best Budget','High Density','Simple & Effective'],{salePrice:14}),
  p('the-stick','Stick Body Massager','The Stick',30,'Amazon','https://www.amazon.com/dp/B000F9HBJ6?tag=gymgearcompar-20',8.5,4.6,8900,'Amazon','Best travel recovery tool  --  roller stick for targeted muscle groups on the go.','Barbend',{'Type':'Stick','Length':'17"','Spindles':'19','Flexible':'Yes','Best For':'Travel'},['Travel Friendly','Targeted Massage','Classic Design']),
  p('tptherapy-mb1','Massage Ball','TriggerPoint',12,'Amazon','https://www.amazon.com/dp/B00GPKBFGU?tag=gymgearcompar-20',8.8,4.7,22000,'Amazon','Best massage ball  --  pinpoint trigger points in shoulders, hips, feet.','Barbend',{'Type':'Ball','Diameter':'2.6"','Material':'EVA Foam','Best For':'Trigger Points','Portable':'Yes'},['Pinpoint Relief','Portable','Trigger Points']),
  p('amazon-basics-roller','Foam Roller 36"','Amazon Basics',22,'Amazon','https://www.amazon.com/dp/B00XM2MRGI?tag=gymgearcompar-20',7.5,4.4,31000,'Amazon','Full-length budget roller  --  36 inch covers whole back in one pass.','Barbend',{'Diameter':'6"','Length':'36"','Density':'Medium','Material':'EVA','Best For':'Back'},['Full Length 36"','Back Coverage','Budget Pick']),
  p('theraband-roller','Foam Roller','TheraBand',29,'Amazon','https://www.amazon.com/dp/B006XLUP72?tag=gymgearcompar-20',8.2,4.6,15000,'Amazon','Physical therapist recommended  --  trusted by clinics and home users alike.','Physical Therapy Choice',{'Diameter':'6"','Length':'12"','Density':'Firm','Texture':'Smooth','PT Approved':'Yes'},['PT Recommended','Smooth Surface','Clinic Trusted']),
  p("fringesport-foam-massage-ball","Foam Massage Ball","Fringe Sport",10,"fringesport.com","https://fringesport.com/products/foam-massage-ball",6.5,null,null,"fringesport.com","A soft 2-inch foam ball for targeting feet, neck and arms a roller cannot reach.","GymGear Compare",{"Diameter":"2 in","Weight":"6 oz","Material":"Foam","Contents":"1 massage ball","Use":"Myofascial / trigger point release"},["Budget Pick","Softer Than Lacrosse","Travel Sized"]),
  p("fringesport-double-lacrosse-ball-peanut","Peanut Lacrosse Ball","Fringe Sport",14,"fringesport.com","https://fringesport.com/products/double-lacrosse-ball-peanut",6.8,4.6,5,"fringesport.com","A rubber double-ball peanut that straddles the spine, the cheapest useful tool for neck and back release.","GymGear Compare",{"Contents":"1 double (peanut) lacrosse ball","Material":"Rubber","Ball Diameter":"2.25\"","Overall Dimensions":"4.5\" x 2.25\"","Color":"Neon Yellow"},["Budget Pick","Travel Friendly","Rubber Build"]),
  p("fringesport-premium-molded-foam-roller-36-x-","Premium Molded Foam Roller — 18\"","Fringe Sport",22,"fringesport.com","https://fringesport.com/products/premium-molded-foam-roller-36-x-6?variant=249950270",7,5,9,"fringesport.com","Molded closed-cell roller that will not flatten like open-cell foam, at a genuinely cheap entry price.","GymGear Compare",{"Length":"18 inches","Diameter":"6 inches","Weight":"1 pound","Construction":"Molded closed-cell foam","Warranty":"1 Year"},["Closed-Cell Foam","Budget Pick","One-Year Warranty"]),
],

gymbags:[
  p('ua-undeniable','Undeniable 5.0 Duffle','Under Armour',45,'Amazon','https://www.amazon.com/dp/B08N3PDRJF?tag=gymgearcompar-20',8.5,4.7,24000,'Amazon','Best duffel bag  --  water-resistant, vented shoe pocket, tons of room.','Wirecutter',{'Volume':'Medium','Shoe Pocket':'Yes','Water Resistant':'Yes','Carry':'Duffel + Straps','Sizes':'XS-XL'},['Best Duffel','Shoe Pocket','Water Resistant'],{salePrice:38}),
  p('adidas-defender','Defender 4 Duffel','Adidas',35,'Amazon','https://www.amazon.com/dp/B08JV38DFR?tag=gymgearcompar-20',7.8,4.5,31000,'Amazon','Best budget gym bag  --  tough, spacious, fits everything.','Wirecutter',{'Volume':'Large','Shoe Pocket':'No','Water Resistant':'Some','Carry':'Duffel','Material':'100% Polyester'},['Best Budget','Extra Large','Tough Build']),
  p('lululemon-belt-bag','Everywhere Belt Bag 1L','Lululemon',38,'Lululemon','https://shop.lululemon.com/p/bags/Everywhere-Belt-Bag-1L',8.9,4.8,47000,'Lululemon','Best belt bag  --  crossbody or waist, water-repellent, fits essentials.','Wirecutter',{'Volume':'1L','Water Repellent':'Yes','Carry':'Belt or Crossbody','Pockets':'2','Strap':'Adjustable'},['Belt or Crossbody','Water Repellent','Compact']),
  p('osprey-daylite','Daylite Backpack','Osprey',65,'Amazon','https://www.amazon.com/dp/B07TWCCLKC?tag=gymgearcompar-20',9.0,4.8,14000,'Amazon','Best hiking-to-gym backpack  --  suspension system, laptop sleeve, ultralight.','Wirecutter',{'Volume':'13L','Laptop':'Yes','Suspension':'AirScoop','Weight':'0.97 lbs','Attach System':'Yes'},['Ultralight','AirScoop Suspension','Versatile']),
  p('nike-brasilia','Brasilia 9.5 Training Duffle','Nike',35,'Amazon','https://www.amazon.com/dp/B094HB7TVD?tag=gymgearcompar-20',8.0,4.6,28000,'Amazon','Best entry-level Nike bag  --  shoe compartment, adjustable strap, classic.','Barbend',{'Volume':'Medium','Shoe Compartment':'Yes','Carry':'Duffel','Material':'Polyester','Zipper':'Dual'},['Shoe Compartment','Affordable Nike','Classic Look']),
  p('goruck-kit-bag','Kit Bag','GORUCK',150,'GORUCK','https://www.goruck.com/products/kit-bag',9.5,4.9,2100,'Barbend','Most durable gym bag ever made  --  mil-spec 1000D Cordura, lifetime guarantee.','Barbend',{'Volume':'34L','Material':'1000D Cordura','Made In':'USA','Guarantee':'Lifetime','Carry':'Duffel + Backpack'},['Mil-Spec Build','Lifetime Guarantee','American Made']),
  p("goruck-shoe-bag","(For Your Muddy, Dirty) Shoe Bag","GORUCK",45,"goruck.com","https://goruck.com/products/shoe-bag",7.4,5,24,"goruck.com","Water-resistant 420D ripstop shoe bag with mesh venting that keeps muddy trainers away from clean kit.","GymGear Compare",{"Primary Material":"420D Robic Ripstop Nylon","Dimensions":"16\" L x 9\" W x 4\" D","Zippers":"YKK AquaGuard","Pockets":"1 internal mesh pocket","Warranty":"SCARS Lifetime Guarantee"},["Lifetime Warranty","Water Resistant","Ventilated Mesh"],{}),
  p("goruck-gym-bag-mesh","Mesh Duffel Bag","GORUCK",95,"goruck.com","https://goruck.com/products/gym-bag-mesh",7.8,null,null,"goruck.com","Coated-mesh 38L duffel with anti-rust zippers, made for wet, sweaty kit that needs to air out.","GymGear Compare",{"Volume":"38L","Primary Material":"Coated Mesh, Poly + Non-Phthalate PVC, 360G","Dimensions":"24\" W x 12\" H x 10\" D","Zippers":"Anti-Rust Vislon","Warranty":"SCARS Lifetime Guarantee"},["Lifetime Warranty","Ventilated Mesh","38L Capacity"]),
  p("goruck-gym-bag-cordura","Gym Bag - Cordura","GORUCK",135,"goruck.com","https://goruck.com/products/gym-bag-cordura",8.7,null,null,"goruck.com","Same 38L layout in 1000D Cordura at under two pounds, the practical everyday pick over waxed canvas.","GymGear Compare",{"Volume":"38L","Primary Material":"1000D CORDURA","Dimensions":"24\" W x 12\" H x 10\" D","Weight":"1.9 lb","Warranty":"SCARS Lifetime Guarantee"},["Lifetime Warranty","1000D Cordura","38L Capacity"]),
  p("goruck-gym-bag-waxed-canvas","Heritage Gym Bag - Waxed Canvas","GORUCK",175,"goruck.com","https://goruck.com/products/gym-bag-waxed-canvas",8.6,null,null,"goruck.com","Overbuilt 38L duffel in heavy Army duck canvas for lifters who want a bag that outlasts them.","GymGear Compare",{"Volume":"38L","Primary Material":"10.10 Army Duck Canvas","Dimensions":"24\" W x 12\" H x 10\" D","Pockets":"2 external side, 1 internal","Warranty":"SCARS Lifetime Guarantee"},["Lifetime Warranty","Waxed Canvas","38L Capacity"]),
  p("goruck-kit-bag-waxed-canvas","Kit Bag - Waxed Canvas","GORUCK",195,"goruck.com","https://goruck.com/products/kit-bag-waxed-canvas",8.8,null,null,"goruck.com","A 32L waxed-canvas carry-on with a leather base and lifetime guarantee, built for travel and gear hauling.","GymGear Compare",{"Volume":"32L","Primary Material":"10.10 oz Army Duck Waxed Canvas (Martexin wax)","Dimensions":"17.5\" W x 11.5\" H x 9\" D","Weight":"3 lbs","Warranty":"SCARS Lifetime Guarantee"},["Lifetime Warranty","Waxed Canvas","TSA Carry-On"]),
],

jumpropes:[
  p('rx-smart-gear-rope','Elite EVO Jump Rope','RX Smart Gear',175,'RX Smart Gear','https://www.rxsmartgear.com/products/evo-g2-rxsg-jump-rope',9.3,4.8,4200,'Barbend','Best rope for double-unders  --  weighted handles, customizable cable length.','Barbend',{'Handle':'Weighted','Cable':'Steel','Bearings':'Sealed','Customizable':'Yes','Best For':'Double Unders'},['Best for DUs','Weighted Handles','Customizable'],{bestChoice:true}),
  p('crossrope-get-lean','Get Lean Set','Crossrope',108,'Crossrope','https://www.crossrope.com/products/jrd-iv-get-lean-set',9.0,4.8,6800,'Wirecutter','Best weighted rope system  --  interchangeable rope weights for progressive overload.','Wirecutter',{'Weights':'1/4 lb + 1/2 lb','Handle':'Locking Clip','Cable':'Steel','App':'Yes','Swappable':'Yes'},['Interchangeable','Progressive Overload','App Connected']),
  p('wod-nation-speed-rope','Speed Jump Rope','WOD Nation',15,'Amazon','https://www.amazon.com/dp/B01LYH50VD?tag=gymgearcompar-20',8.2,4.5,42000,'Amazon','Best budget speed rope  --  ball bearings, adjustable, 3 cables included.','Barbend',{'Cable':'Steel','Bearings':'Ball','Handles':'Aluminum','Adjustable':'Yes','Cables Included':'3'},['Best Budget','Ball Bearings','3 Cables']),
  p('buddy-lee-aero','Aero Speed Jump Rope','Buddy Lee',45,'Amazon','https://www.amazon.com/dp/B0000C17IS?tag=gymgearcompar-20',8.8,4.7,9400,'Amazon','Most popular competition rope  --  used by champions for 30+ years.','Barbend',{'Cable':'Wire','Bearings':'Precision','Handles':'Aluminum','Competition':'Yes','Heritage':'30+ Years'},['Competition Grade','30+ Year Heritage','Precision Bearings']),
  p('elite-surge-3','Surge 3.0','Elite Jump Rope',55,'Elite Jump Rope','https://www.elitejumprope.com/products/surge-3',8.9,4.8,2800,'Barbend','Most durable speed rope  --  sealed bearing system, replaceable cable.','Barbend',{'Cable':'Replaceable','Bearings':'Sealed','Handles':'Aluminum','Lifespan':'Very Long','Cable Gauge':'Fine'},['Sealed Bearings','Replaceable Cable','Long Lasting']),
  p('rogue-sr-1c','SR-1C Jump Rope','Rogue Fitness',32,'Rogue Fitness','https://www.roguefitness.com/sr-1c-jump-rope',8.7,4.8,3900,'Rogue Fitness','Best Rogue rope  --  1.5mm cable, precision bearings, Rogue quality.','Garage Gym Reviews',{'Cable':'1.5mm Steel','Bearings':'Precision','Handles':'Aluminum','Length':'Adjustable','Weight':'Light'},['Rogue Quality','1.5mm Cable','Precision Build']),
  p('jump-rope-dudes-rope','Muay Thai Jump Rope','Jump Rope Dudes',35,'Jump Rope Dudes','https://www.jumpropedudesstore.com',8.6,4.7,3100,'Barbend','Best beginner speed rope  --  thicker cable, easier to time, fewer trips.','Barbend',{'Cable':'PVC','Thickness':'5mm','Handles':'Foam','Best For':'Beginners','Length':'Adjustable'},['Beginner Friendly','Thick Cable','Foam Handles']),
  p('amazon-basics-rope','Adjustable Jump Rope','Amazon Basics',12,'Amazon','https://www.amazon.com/dp/B005HGI4GC?tag=gymgearcompar-20',6.5,4.2,89000,'Amazon','Cheapest functional rope  --  PVC cable, adjustable, gets the job done.','Barbend',{'Cable':'PVC','Adjustable':'Yes','Handles':'Foam','Weight':'Very Light','Best For':'Casual'},['Cheapest Option','Adjustable','Gets Job Done'],{salePrice:9}),
],

};

const CATEGORY_META = {
  benches:{group:'equipment',label:'Weight Benches'},machines:{group:'equipment',label:'All-in-One Machines'},flooring:{group:'equipment',label:'Gym Flooring'},barbells:{group:'equipment',label:'Barbells'},dumbbells:{group:'equipment',label:'Dumbbells'},plates:{group:'equipment',label:'Weight Plates'},racks:{group:'equipment',label:'Racks & Rigs'},cardio:{group:'equipment',label:'Cardio'},kettlebells:{group:'equipment',label:'Kettlebells'},bands:{group:'equipment',label:'Resistance Bands'},
  preworkout:{group:'supplements',label:'Pre-Workout'},protein:{group:'supplements',label:'Protein'},creatine:{group:'supplements',label:'Creatine'},recovery:{group:'supplements',label:'Recovery'},vitamins:{group:'supplements',label:'Vitamins'},fatburners:{group:'supplements',label:'Fat Burners'},
  belts:{group:'gear',label:'Lifting Belts'},straps:{group:'gear',label:'Lifting Straps'},wraps:{group:'gear',label:'Wrist Wraps'},sleeves:{group:'gear',label:'Knee Sleeves'},chalk:{group:'gear',label:'Chalk'},
  yogamats:{group:'accessories',label:'Yoga Mats'},foamrollers:{group:'accessories',label:'Foam Rollers'},gymbags:{group:'accessories',label:'Gym Bags'},jumpropes:{group:'accessories',label:'Jump Ropes'},
};

// Unify the spec matrix per category: every product in a category gets the
// same spec rows so they compare apples-to-apples in the result, detail, and
// swap views. Use the category's most-common spec keys (capped, ordered most-
// common first), filling "—" where a product lacks that spec. Capping keeps
// the sheet tidy — rare one-off specs are dropped from the shared matrix.
const SPEC_NA = '—';
const SPEC_MATRIX_MAX = 8;
for (const list of Object.values(PRODUCTS)) {
  const order = [], freq = {};
  for (const p of list) for (const k of Object.keys(p.specs || {})) {
    if (!(k in freq)) order.push(k);
    freq[k] = (freq[k] || 0) + 1;
  }
  order.sort((a, b) => freq[b] - freq[a]); // stable: ties keep first-seen order
  const matrix = order.slice(0, SPEC_MATRIX_MAX);
  for (const p of list) {
    const full = {};
    for (const k of matrix) full[k] = p.specs && p.specs[k] != null ? p.specs[k] : SPEC_NA;
    p.specs = full;
  }
}

// Imagery + affiliate links. Brand-CDN images mostly 404 or are referer-
// blocked in the browser, so every product gets a hotlink-friendly Unsplash
// photo keyed by category (verified to load). Every product also gets an
// Amazon affiliate search link with our tag, so the Buy button (affiliateUrl
// || url) always lands on a real, shoppable, commission-earning page.
const UNSPLASH = (id) =>
  `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`;
// Each category gets a POOL of verified photo ids (every id below curl-checked
// 200 + eyeballed for subject). Products hash onto a pool entry, so a category
// grid shows varied photos instead of one image repeated on every card.
const CAT_IMAGE = {
  benches: ['1558611848-73f7eb4001a1', '1579758629938-03607ccdbaba'],
  barbells: ['1605296867304-46d5465a13f1', '1517836357463-d25dfeac3438', '1620188467120-5042ed1eb5da', '1549060279-7e168fcee0c2', '1517838277536-f5f99be501cd'],
  dumbbells: ['1599058917765-a780eda07a3e', '1544033527-b192daee1f5b', '1576678927484-cc907957088c', '1638536532686-d610adfc8e5c', '1583454110551-21f2fa2afe61'],
  plates: ['1526506118085-60ce8714f8c5', '1526401485004-46910ecc8e51', '1517964603305-11c0f6f66012'],
  racks: ['1534258936925-c58bed479fcb', '1590487988256-9ed24133863e', '1541534741688-6078c6bfb5c5'],
  // Reuses already-verified rack/cardio photo ids (machines look the part).
  machines: ['1534258936925-c58bed479fcb', '1590487988256-9ed24133863e', '1571902943202-507ec2618e8f'],
  flooring: ['1534258936925-c58bed479fcb', '1541534741688-6078c6bfb5c5'],
  cardio: ['1571019613454-1cb2f99b2d8b', '1571902943202-507ec2618e8f', '1593079831268-3381b0db4a77'],
  kettlebells: ['1517344884509-a0c97ec11bcc', '1601422407692-ec4eeec1d9b3'],
  bands: ['1591291621164-2c6367723315', '1517130038641-a774d04afb3c'],
  preworkout: ['1693996045899-7cf0ac0229c7'],
  protein: ['1693996045899-7cf0ac0229c7'],
  creatine: ['1693996045899-7cf0ac0229c7'],
  recovery: ['1584308666744-24d5c474f2ae'],
  vitamins: ['1584308666744-24d5c474f2ae'],
  fatburners: ['1593095948071-474c5cc2989d'],
  belts: ['1532382708467-d720b918f0da'],
  straps: ['1517963879433-6ad2b056d712'],
  wraps: ['1517963879433-6ad2b056d712'],
  sleeves: ['1517963879433-6ad2b056d712'],
  chalk: ['1595078475328-1ab05d0a6a0e'],
  yogamats: ['1592432678016-e910b452f9a2', '1601925260368-ae2f83cf8b7f', '1518611012118-696072aa579a', '1575052814086-f385e2e2ad1b'],
  foamrollers: ['1607962837359-5e7e89f86776'],
  gymbags: ['1708622833152-924c6e364138', '1553062407-98eeb64c6a62'],
  jumpropes: ['1434608519344-49d77a699e1d', '1584735935682-2f2b69dff9d2'],
};
const DEFAULT_IMAGE = UNSPLASH('1534438327276-14e5300c3a48');
const AMAZON_TAG = 'gymgearcompar-20';
// Links that do NOT reach the product's own page, from the last
// `node scripts/check-links.mjs` run (2026-08-04): 35 dead, 14 category or
// collection listings, 12 that answer with the retailer's home page, 5 whose
// domain is now parked and for sale. See docs/plans/buy-links.md.
//
// These rows are NOT served. The site used to send these buyers to an Amazon
// search for the product name instead, which is the same lie as a stock photo:
// we showed one retailer's price and photo, then handed the shopper a search
// box. A row with no working product link does not belong on the site until it
// has one — regenerate this list after re-sourcing.
// Sold out at the retailer, per the last `npm run check:prices` run. The
// daily job maintains this list itself — it adds a row it read as out of
// stock and removes one it read as available again, and never touches a row
// it could not read. Stock is the one fact that flips back on its own, so it
// would rot fastest if a human owned it.
//
// Shelved rather than shown: a Buy button that lands on a sold-out page wastes
// the click, and the price we advertised is not one anybody can pay today.
// Rows whose price we cannot verify AND which disagree with the retailer.
// That pair matters. Plenty of rows are UNREADABLE — Rogue blocks us, Amazon
// is off limits — and we keep publishing those, because nothing suggests the
// price is wrong. These are different: the page says one number, the catalog
// says another, and the source is too weak to write from.
//
//   legion-*        Legion publishes no price in its product markup, and the
//                   page carries both a one-time and a subscription figure;
//                   legion-whey read $64.99 against our $59.
//   liforme-*       the shop is London-based and quotes GBP, even on its us.
//                   subdomain — the same trap that put a CAD bench in here at
//                   nearly twice its real price.
//   rep-black/bands weight- and strength-graded lines with no set SKU to point
//                   at; rep-bands is superseded by rep-pull-up-band, which is
//                   pinned to a variant and verifies clean.
//
// Un-shelve by re-sourcing to a page we can read, then re-running check-prices.
const UNVERIFIED_PRICE_IDS = new Set([
  'legion-lunar', 'legion-phoenix', 'legion-recharge', 'legion-triumph',
  'legion-whey', 'liforme-original', 'rep-bands', 'rep-black',
]);

const SOLD_OUT_IDS = new Set([
  'crossrope-get-lean', 'force-usa-g3', 'force-usa-g6', 'legion-pulse',
]);

const BAD_LINK_IDS = new Set([
  'adidas-defender', 'ag1', 'amazon-bands', 'amazon-basics-mat',
  'amazon-basics-rope', 'bowflex-552', 'buddy-lee-aero', 'cap-ob86b',
  'fringe-urethane', 'fringe-wonder', 'gaiam-premium', 'ghost-legend',
  'ironmaster-ql', 'ironmaster-superbench', 'jump-rope-dudes-rope', 'kabuki-power-bar',
  'kbkings-powder', 'klean-bcaa', 'klean-creatine', 'klean-mv',
  'lf-club-elliptical', 'lux-fit-roller', 'mhp-thyro-slim', 'momentous-creatine',
  'nike-brasilia', 'nuobell-adj', 'onnit-kb', 'osprey-daylite',
  'prx-profile-pro', 'rumble-roller', 'sbd-belt', 'the-stick',
  'theraband-roller', 'titan-ab', 'titan-adj', 'titan-bumper',
  'titan-kb', 'titan-olympic', 'tptherapy-mb1', 'ua-undeniable',
  'weightlifting-house-chalk', 'wod-nation-speed-rope', 'yune-tohi',
]);

/* ── Product taxonomy ─────────────────────────────────────────────
   One source of truth powering BOTH the kit builder's cross-sell and the
   "frequently bought together" recommendations (build the taxonomy once).
   Stamped onto every product in the hydration loop below, so productType /
   kitRole / pairsWith ride along in every API response.
     productType "primary"  = something a kit is built around
     productType "accessory" = a cross-sell add-on
     kitRole core|recommended|optional
     pairsWith = the PRIMARY categories an accessory completes; an empty list
                 means it never surfaces in an equipment kit (e.g. clothing —
                 too generic, per the cross-sell guardrail). */
const EQUIPMENT_CATS = ['racks', 'machines', 'barbells', 'benches', 'plates', 'dumbbells', 'kettlebells', 'cardio', 'bands'];
const CATEGORY_TAGS = {
  // Primary — the kit is built around these.
  racks:       { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  machines:    { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  // Facility-only: browsable/comparable, but never in the HOME kit builder
  // (not in KIT_CATEGORIES) — the gym planner is what specs flooring.
  flooring:    { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  barbells:    { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  benches:     { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  plates:      { productType: 'primary', kitRole: 'core',        pairsWith: [] },
  dumbbells:   { productType: 'primary', kitRole: 'recommended', pairsWith: [] },
  kettlebells: { productType: 'primary', kitRole: 'recommended', pairsWith: [] },
  cardio:      { productType: 'primary', kitRole: 'recommended', pairsWith: [] },
  bands:       { productType: 'primary', kitRole: 'recommended', pairsWith: [] },
  // Accessory — lifting gear.
  chalk:   { productType: 'accessory', kitRole: 'optional', pairsWith: ['barbells', 'racks', 'plates', 'kettlebells', 'dumbbells'] },
  straps:  { productType: 'accessory', kitRole: 'optional', pairsWith: ['barbells', 'racks', 'dumbbells'] },
  wraps:   { productType: 'accessory', kitRole: 'optional', pairsWith: ['barbells', 'racks', 'plates'] },
  sleeves: { productType: 'accessory', kitRole: 'optional', pairsWith: ['racks', 'barbells', 'plates'] },
  belts:   { productType: 'accessory', kitRole: 'optional', pairsWith: ['barbells', 'racks', 'plates'] },
  // Accessory — training accessories.
  foamrollers: { productType: 'accessory', kitRole: 'optional', pairsWith: ['racks', 'barbells', 'cardio', 'kettlebells', 'dumbbells'] },
  yogamats:    { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS }, // mats = universal flooring (floor protect, noise, grip) per research
  jumpropes:   { productType: 'accessory', kitRole: 'optional', pairsWith: ['cardio', 'kettlebells'] },
  gymbags:     { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  // Accessory — supplements (universal "fuel your training").
  protein:    { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  creatine:   { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  preworkout: { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  recovery:   { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  vitamins:   { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  fatburners: { productType: 'accessory', kitRole: 'optional', pairsWith: EQUIPMENT_CATS },
  // Clothing — tagged accessory, but pairsWith:[] so it never surfaces in an
  // equipment kit. Still browsable in its own categories / the separate finder.
};
const DEFAULT_TAGS = { productType: 'accessory', kitRole: 'optional', pairsWith: [] };

// Existing catalog items that are genuinely commercial-suitable (full or
// light commercial build) — the GYM PLANNER only specs pro gear. New
// commercial SKUs set {pro:true} directly in p(); this set upgrades the
// home-catalog crossovers without touching 30 product lines.
const PRO_IDS = new Set([
  'rogue-rm6', 'rogue-r3', 'rogue-rml390f', 'rep-pr5000',
  'rep-pr4000', 'rogue-sml2', 'rogue-ohio', 'rogue-opb',
  'rogue-deadlift', 'rogue-squat-bar', 'texas-power-bar', 'kabuki-power-bar',
  'bells-power-bar', 'rep-alpine-bar', 'rogue-hg2', 'rep-comp',
  'rep-black', 'rogue-echo', 'rogue-mb2', 'rogue-flat2',
  'rep-fb5000', 'rep-ab5200', 'rogue-adj-bench', 'bells-bench',
  'rogue-hex', 'rep-hex', 'fringe-urethane', 'rogue-kb',
  'rep-kb', 'dragon-door-kb', 'kbkings-powder', 'concept2-rower',
  'concept2-ski', 'concept2-bikeerg', 'assault-bike', 'assault-runner',
  'rogue-echo-bike', 'lifefitness-t3', 'lifefitness-g7', 'force-usa-g20',
  'rep-arcadia', 'bells-ft', 'rogue-bands', 'trx-pro4',
  'manduka-pro', 'frictionlabs-loose', 'trigger-point-grid', 'rogue-sr-1c',
]);

for (const [cat, list] of Object.entries(PRODUCTS)) {
  const tags = CATEGORY_TAGS[cat] || DEFAULT_TAGS;
  for (const p of list) {
    // Only that product's own photo, or nothing. The stock-photo pool used to
    // fill this gap, which put a generic gym shot on a specific hoodie — one
    // wrong image makes every correct one look staged too. A product with no
    // verified photo now renders the brand tile the frontend already draws.
    // Category thumbnails still use the pool below; a category is not a product.
    p.image = p.image || null;
    // Buy link: the product's own page, always. A row whose link does not
    // reach the product is shelved below rather than redirected somewhere else.
    p.affiliateUrl = p.url;
    // Taxonomy for the kit cross-sell + recommendations (one source of truth).
    p.productType = tags.productType;
    p.kitRole = tags.kitRole;
    p.pairsWith = tags.pairsWith;
    // Commercial-suitability stamp for the gym planner (see PRO_IDS above).
    p.pro = !!p.pro || PRO_IDS.has(p.id);
  }
}

// ── Published vs shelved ──────────────────────────────────────────
// Amazon rows are never published. Their price cannot be read — the Associates
// terms rule out scraping, and PA-API needs keys we do not have — so the number
// on the card is whatever it was when a human last typed it. A Dark Iron belt
// sat on the site at $28 with a 20% OFF badge while Amazon charged $49.99, and
// its rating claimed 4.5 from 18,000 against a real 4.7 from 24,918.
//
// This is a rule, not a list, because a list is exactly how 48 of them crept
// back: they were shelved for want of a photo, then a photo turned up.
const isAmazon = (p) => /(^|\.)amazon\.[a-z.]+\//i.test(p.url || '');
// A row with no verified photo of that exact product does not go on the site.
// It stays in this file — nothing is deleted — it simply is not served, so it
// cannot appear in a listing, a kit, a plan, search or the sitemap.
//
// One rule covers every case that made the catalog look unfinished:
//   · Amazon rows, whose images need PA-API through the Associates account.
//     Shelved on purpose until we have keys — the affiliate links stay in the
//     file and come straight back the day an image can be verified.
//   · Rows whose retailer page is dead (Titan, Klean, YoungLA, AG1…). A Buy
//     button that 404s is worse than an absent product.
//   · Rows pointing at a collection page rather than a product, where no image
//     can be correct by construction.
// It is self-maintaining: verify a photo, and the product publishes itself.
const SHELVED = new Map();
for (const [cat, list] of Object.entries(PRODUCTS)) {
  const keep = [];
  for (const p of list) {
    if (
      p.image &&
      !isAmazon(p) &&
      !BAD_LINK_IDS.has(p.id) &&
      !SOLD_OUT_IDS.has(p.id) &&
      !UNVERIFIED_PRICE_IDS.has(p.id)
    )
      keep.push(p);
    else
      SHELVED.set(
        p.id,
        isAmazon(p)
          ? 'amazon, unverifiable until PA-API'
          : !p.image
            ? 'no verified photo'
            : BAD_LINK_IDS.has(p.id)
              ? 'broken link'
              : SOLD_OUT_IDS.has(p.id)
                ? 'sold out'
                : 'unverifiable price',
      );
  }
  PRODUCTS[cat] = keep;
}
const PUBLISHED_COUNT = Object.values(PRODUCTS).reduce((n, l) => n + l.length, 0);
const shelvedFor = (reason) => [...SHELVED.values()].filter((r) => r === reason).length;
console.log(
  `catalog: ${PUBLISHED_COUNT} published, ${SHELVED.size} shelved ` +
    `(${shelvedFor('amazon, unverifiable until PA-API')} amazon, ` +
    `${shelvedFor('no verified photo')} without a verified photo, ${shelvedFor('broken link')} with a link that misses the product, ` +
    `${shelvedFor('sold out')} sold out, ${shelvedFor('unverifiable price')} with a price we cannot stand behind)`,
);

// ── GymGear Score + segmented "best for X" awards ─────────────────
// A transparent 0-100 score from the signals we can stand behind: expert
// build quality, user rating, value-per-dollar, and review confidence. It is
// data/spec-derived, NOT hands-on — the /methodology page says so plainly.
// Per-category weights are tunable here; scoreBreakdown lets the UI show the
// working (the RTINGS trust move). No external API, no hardcoded magic scores.
const SCORE_WEIGHTS = {
  // Quality-led so "Top Pick" = the genuinely best product; value is a facet
  // (and gets its own "Best Value" award) but never dominates the overall score.
  default:  { build: 0.42, rated: 0.30, value: 0.15, trust: 0.13 },
  // Precision/heavy iron — build quality dominates.
  barbells: { build: 0.55, rated: 0.25, value: 0.10, trust: 0.10 },
  racks:    { build: 0.55, rated: 0.25, value: 0.10, trust: 0.10 },
  machines: { build: 0.50, rated: 0.28, value: 0.12, trust: 0.10 },
  benches:  { build: 0.50, rated: 0.25, value: 0.15, trust: 0.10 },
  // Commodity iron — value weighs a bit more, but build still leads.
  plates:   { build: 0.38, rated: 0.27, value: 0.25, trust: 0.10 },
  dumbbells:{ build: 0.40, rated: 0.27, value: 0.23, trust: 0.10 },
  // Consumables/apparel — the user verdict (rating + volume) leads.
  protein:    { build: 0.20, rated: 0.45, value: 0.15, trust: 0.20 },
  preworkout: { build: 0.20, rated: 0.45, value: 0.15, trust: 0.20 },
  creatine:   { build: 0.20, rated: 0.45, value: 0.15, trust: 0.20 },
};
const SCORE_FACETS = { build: 'Build quality', rated: 'User rating', value: 'Value for money', trust: 'Review confidence' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const norm = (v, lo, hi) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);

for (const [cat, list] of Object.entries(PRODUCTS)) {
  if (!list.length) continue;
  const w = SCORE_WEIGHTS[cat] || SCORE_WEIGHTS.default;
  const valOf = (p) => p.quality / (p.salePrice || p.price);   // quality per $
  const trustOf = (p) => Math.log10((p.reviewCount || 0) + 1); // diminishing returns
  const vs = list.map(valOf), ts = list.map(trustOf);
  const vLo = Math.min(...vs), vHi = Math.max(...vs), tLo = Math.min(...ts), tHi = Math.max(...ts);

  for (const p of list) {
    // Retailer rating is OPTIONAL - most retailers publish no aggregateRating,
    // and inventing one fabricates social proof. OUR quality score is always
    // present, so `build` always carries.
    const hasRating = typeof p.rating === 'number' && p.rating > 0;
    const hasReviews = typeof p.reviewCount === 'number' && p.reviewCount > 0;
    const f = {
      build: clamp01(p.quality / 10),
      rated: hasRating ? clamp01(p.rating / 5) : null,
      value: clamp01(norm(valOf(p), vLo, vHi)),
      // "Review confidence" is unknowable without a published review count -
      // scoring it 0 punishes the product for the retailer's silence.
      trust: hasReviews ? clamp01(norm(trustOf(p), tLo, tHi)) : null,
    };
    p._f = f; // scored in a second pass, once category medians are known
    p.awards = [];
  }

  // Second pass. A facet the retailer never published is neither a strength
  // nor a flaw, so it scores at the category median for that facet: absence is
  // neutral. Redistributing its weight instead let an unrated product outrank
  // a better-reviewed one purely by having fewer dimensions to be judged on.
  const median = (arr) => {
    const s = arr.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0.5;
  };
  const med = {};
  for (const k of Object.keys(SCORE_FACETS)) med[k] = median(list.map((p) => p._f[k]));

  for (const p of list) {
    const f = p._f;
    p.gymgearScore = Math.round(100 * Object.keys(SCORE_FACETS)
      .reduce((s, k) => s + w[k] * (f[k] ?? med[k]), 0));
    // Breakdown for "how we score": each facet's 0-100 strength + its weight.
    // Unpublished facets report null so the UI can say "not published"
    // instead of rendering a zero the product did not earn.
    p.scoreBreakdown = Object.keys(SCORE_FACETS).map((k) => ({
      key: k, label: SCORE_FACETS[k],
      score: f[k] === null ? null : Math.round(f[k] * 100), weight: w[k],
    }));
    delete p._f;
  }

  // Segmented picks — each product collects the awards it wins in its category.
  const decent = list.filter((p) => p.quality >= 7);
  const pool = decent.length ? decent : list;
  const best = (arr, fn) => (arr.length ? arr.reduce((a, b) => (fn(b) > fn(a) ? b : a)) : null);
  const give = (winner, name) => { if (winner && !winner.awards.includes(name)) winner.awards.push(name); };
  give(best(list, (p) => p.gymgearScore), 'Top Pick');
  give(best(pool, valOf), 'Best Value');
  give(best(pool, (p) => -(p.salePrice || p.price)), 'Best Budget');
  give(best(list.filter((p) => (p.reviewCount || 0) >= 500), (p) => p.rating), 'Best Rated');
}

// ── ROUTES ────────────────────────────────────────────────────
app.get('/health',(req,res)=>res.json({status:'ok',mode:'sample-data',categories:Object.keys(PRODUCTS).length}));

app.get('/api/products/:cat',(req,res)=>{
  const cat=req.params.cat;
  const products=PRODUCTS[cat];
  if(!products)return res.status(404).json({error:`Unknown category: ${cat}`});
  res.json({products,category:cat,group:CATEGORY_META[cat]?.group,refreshedAt:new Date().toISOString(),count:products.length});
});

app.get('/api/categories',(req,res)=>res.json({
  // image = the category's lead pool photo, for browse-page thumbnails.
  // A category with nothing publishable is left out entirely: a "Best Hoodies,
  // ranked" page with no products is worse than not offering the page, and the
  // frontend builds its nav, browse grid and sitemap from this list. Shelved
  // rows come back the moment they have a photo and a working link, and the
  // category returns with them.
  categories:Object.entries(CATEGORY_META)
    .filter(([key])=>(PRODUCTS[key]?.length||0)>0)
    .map(([key,meta])=>({key,label:meta.label,group:meta.group,loaded:true,count:PRODUCTS[key]?.length||0,image:CAT_IMAGE[key]?UNSPLASH(CAT_IMAGE[key][0]):DEFAULT_IMAGE})),
}));

app.post('/api/compare',(req,res)=>{
  const {p1,p2}=req.body;
  if(!p1||!p2)return res.status(400).json({error:'Send p1 and p2.'});

  const qw=p1.quality>=p2.quality?p1:p2;
  const ql=qw.id===p1.id?p2:p1;
  const cheap=p1.price<=p2.price?p1:p2;
  const pricey=cheap.id===p1.id?p2:p1;
  const p1eff=p1.quality/(p1.salePrice||p1.price);
  const p2eff=p2.quality/(p2.salePrice||p2.price);
  const vw=p1eff>=p2eff?p1:p2;
  const diff=Math.abs((p1.salePrice||p1.price)-(p2.salePrice||p2.price));

  // Build pros for winner
  const winnerPros=[];
  const loserPros=[];
  if(qw.quality>ql.quality) winnerPros.push(`Higher quality score (${qw.quality}/10 vs ${ql.quality}/10)`);
  if((qw.salePrice||qw.price)<(ql.salePrice||ql.price)) winnerPros.push(`$${diff} cheaper`);
  if(qw.rating>ql.rating) winnerPros.push(`Better customer rating (${qw.rating}★ vs ${ql.rating}★)`);
  if(qw.reviewCount>ql.reviewCount) winnerPros.push(`More reviews (${qw.reviewCount.toLocaleString()} vs ${ql.reviewCount.toLocaleString()})`);
  if(vw.id===qw.id) winnerPros.push('Better value per dollar');
  if(qw.aspects?.length) winnerPros.push(...qw.aspects.slice(0,2));

  // Loser still has some good points
  if((ql.salePrice||ql.price)<(qw.salePrice||qw.price)) loserPros.push(`$${diff} cheaper`);
  if(ql.rating>qw.rating) loserPros.push(`Better customer rating (${ql.rating}★)`);
  if(ql.aspects?.length) loserPros.push(...ql.aspects.slice(0,2));

  const summary=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
      <div>
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#15803d;margin-bottom:6px">✓ ${qw.name}</div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:4px">
          ${winnerPros.map(p=>`<li style="font-size:0.8rem;color:var(--text-2);display:flex;gap:6px"><span style="color:#15803d;flex-shrink:0">✓</span>${p}</li>`).join('')}
        </ul>
      </div>
      <div>
        <div style="font-size:0.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px"> --  ${ql.name}</div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:4px">
          ${loserPros.length?loserPros.map(p=>`<li style="font-size:0.8rem;color:var(--text-2);display:flex;gap:6px"><span style="color:var(--text-3);flex-shrink:0">·</span>${p}</li>`).join(''):'<li style="font-size:0.8rem;color:var(--text-3)">No clear advantages</li>'}
        </ul>
      </div>
    </div>
    <div style="background:var(--accent-l);border-left:3px solid var(--accent);padding:10px 14px;border-radius:0 4px 4px 0;font-size:0.84rem;color:var(--text)">
      <strong>Verdict:</strong> ${
        diff===0
          ? `Both are the same price. <strong>${qw.name}</strong> wins on quality  --  easy pick.`
          : vw.id===cheap.id
            ? `<strong>${cheap.name}</strong> is cheaper AND better value. No reason to pay more.`
            : `<strong>${pricey.name}</strong> costs $${diff} more but delivers ${pricey.quality}/10 quality vs ${cheap.quality}/10. ${diff<100?'Probably worth it.':'Only worth it if budget allows.'}`
      }
    </div>`;

  res.json({summary,winnerId:qw.id});
});

// ── COVERAGE MODEL ────────────────────────────────────────────
// Can you actually train every muscle group with this kit?
//
// A kit used to be judged on whether its pieces made sense together (a bar has
// plates, free weights have a bench). That let genuinely useless kits pass: an
// $8,548 "strength" kit anchored by a commercial leg press, with no rack, no
// pull-up bar and nothing to train your back with.
//
// Trainability is a property of the COMBINATION, not of any product — a barbell
// trains nothing without plates, and pressing needs a bench. So we model what
// each piece unlocks, union it across the kit, and check the result against
// what the goal requires. Levels: 2 = properly trainable, 1 = limited
// (assistance bands, floor pressing), 0 = not at all.
//
// Everything here is derivable from what a product IS (its category, or the
// type its own listing states) — we never claim a capability the equipment
// doesn't plainly have.
// LOCKSTEP: mirrored in the frontend's src/lib/coverage.ts.
const PATTERNS=['push-h','push-v','pull-h','pull-v','squat','hinge','core','conditioning'];
const PATTERN_LABEL={'push-h':'Chest press','push-v':'Overhead press','pull-h':'Rows',
  'pull-v':'Pull-ups & pulldowns',squat:'Squats',hinge:'Deadlifts & hinges',core:'Core',conditioning:'Conditioning'};

// What each category lets you train on its own, before enablers. Anything not
// listed is 0 — plates, benches and foam rollers train nothing by themselves,
// which is the point: they are enablers and recovery, not training.
const CAT_TRAINS={
  // Presses go to 2 once a bench is in the kit (see coverageFromTrains).
  dumbbells:{'push-h':1,'push-v':2,'pull-h':2,squat:2,hinge:2,core:1},
  // Squat is 1 without a rack — you can only train what you can clean to your
  // shoulders, which caps a barbell squat well below a racked one.
  barbells:{'push-h':1,'push-v':2,'pull-h':2,squat:1,hinge:2,core:1},
  kettlebells:{'push-h':1,'push-v':2,'pull-h':1,squat:2,hinge:2,core:2,conditioning:2},
  // A rack's own contribution is the pull-up bar; its real job is unlocking
  // the barbell squat, handled as an enabler below.
  racks:{'pull-v':2},
  bands:{'push-h':1,'push-v':1,'pull-h':1,'pull-v':1,squat:1,hinge:1,core:1},
  cardio:{conditioning:2,squat:1},
  jumpropes:{conditioning:2},
  yogamats:{core:1},
};

// Machines vary more than any other category — a functional trainer covers most
// of a gym, a linear leg press covers one joint. Read what the listing itself
// states rather than assuming the category means anything.
function machineTrains(specs){
  const type=String((specs||{}).Type||''), move=String((specs||{}).Movement||'');
  if(/Leg Press/i.test(move)) return {squat:2};
  if(/Row/i.test(move)) return {'pull-h':2};
  if(/Posterior/i.test(move)||/GHD/i.test(type)) return {hinge:2,core:2};
  if(/All-In-One/i.test(type)) return {'push-h':2,'push-v':2,'pull-h':2,'pull-v':2,squat:2,hinge:1,core:2};
  if(/Functional Trainer|Cable Tower/i.test(type)) return {'push-h':2,'push-v':1,'pull-h':2,'pull-v':2,core:2,squat:1};
  if(/Multi-Station|Home Gym|Smart Gym/i.test(type)) return {'push-h':2,'push-v':1,'pull-h':2,'pull-v':2,squat:1,core:1};
  return {};
}

// Products the category default overstates. An EZ curl bar sits in `barbells`
// but is a 47" accessory bar: it will not sit in a rack, will not bench and
// will not squat. Treating it as the kit's barbell produced kits pairing a
// squat stand and bumper plates with a curl bar.
const PRODUCT_TRAINS={'rep-equalizer':{'pull-h':1}};
// Bars that cannot anchor a barbell setup — excluded from the kit's barbell
// slot entirely (they stay in the catalog as the accessory bars they are).
const SPECIALTY_BARS=new Set(['rep-equalizer']);

function trainsOf(id,category,specs){
  return PRODUCT_TRAINS[id]||(category==='machines'?machineTrains(specs):(CAT_TRAINS[category]||{}));
}

// A machine only makes a rack redundant when it IS one: uprights plus cables.
// A leg press, an iso-lateral row or a GHD is a single station — letting those
// block the rack is what left $8k kits with nothing to squat in or pull from.
function replacesRack(category,specs){
  if(category!=='machines')return false;
  const t=machineTrains(specs);
  return (t['pull-v']||0)>=2 && (t['push-h']||0)>=2;
}

// Union of what the kit can train, with the enablers that only exist at kit
// level: a bench turns floor pressing into real pressing, and a rack turns a
// barbell into a squat you can unrack and bail out of.
function coverageFromTrains(items){
  const cats=new Set(items.map(p=>p.category));
  const cov={}; for(const k of PATTERNS) cov[k]=0;
  const put=(k,v)=>{if(v>cov[k])cov[k]=v};
  for(const p of items){
    // Barbell gear is inert without plates to load onto it.
    if(p.category==='barbells'&&!cats.has('plates'))continue;
    for(const k of Object.keys(p.trains||{})) put(k,p.trains[k]);
  }
  const hasWeight=['dumbbells','barbells','kettlebells'].some(c=>cats.has(c));
  if(cats.has('benches')&&hasWeight) put('push-h',2);
  if(cats.has('benches')&&cats.has('dumbbells')) put('pull-h',2);
  if(cats.has('racks')&&cats.has('barbells')&&cats.has('plates')) put('squat',2);
  return cov;
}
// Gear the buyer already owns counts. The kit deliberately doesn't re-sell you
// a rack you have, so judging coverage on the kit alone would conclude you
// can't do pull-ups and bolt a resistance band on to "fix" it. Owning a barbell
// means owning a loaded one — nobody answers "I have a barbell" about a bare
// shaft — so it brings its plates with it.
function ownedTrains(ownedCats){
  const cats=[...(ownedCats||[])];
  const rows=cats.map(c=>({category:c,trains:CAT_TRAINS[c]||{}}));
  if(cats.includes('barbells')&&!cats.includes('plates')) rows.push({category:'plates',trains:{}});
  return rows;
}
const coverageOf=(products,ownedCats)=>coverageFromTrains([
  ...products.map(p=>({category:p.category,trains:trainsOf(p.id,p.category,p.specs)})),
  ...ownedTrains(ownedCats)]);

// What each goal has to be able to train before the kit is honest about
// itself. Strength and a full home gym must cover the whole body; fat-loss and
// general fitness lead with conditioning but still can't skip a muscle group.
const GOAL_NEEDS={
  'build-strength':{'push-h':2,'push-v':1,'pull-h':2,'pull-v':1,squat:2,hinge:2,core:1},
  'home-gym-setup':{'push-h':2,'push-v':1,'pull-h':2,'pull-v':1,squat:2,hinge:2,core:1},
  'get-fit':{'push-h':1,'push-v':1,'pull-h':1,'pull-v':1,squat:1,hinge:1,core:1,conditioning:2},
  'lose-weight':{'push-h':1,'pull-h':1,squat:1,hinge:1,core:1,conditioning:2},
};
const needsFor=goal=>GOAL_NEEDS[goal]||GOAL_NEEDS['get-fit'];
const coverageGaps=(products,goal,ownedCats)=>{
  const cov=coverageOf(products,ownedCats), need=needsFor(goal);
  return Object.keys(need).filter(k=>cov[k]<need[k]);
};

// Users think in muscles, not movement patterns. Each group lists the movements
// that train it, so the UI can say WHY a group is covered ("Back — rows,
// pulldowns") instead of asking anyone to trust a checkmark.
const MUSCLE_GROUPS=[
  {key:'chest',label:'Chest',patterns:['push-h']},
  {key:'back',label:'Back',patterns:['pull-h','pull-v']},
  {key:'shoulders',label:'Shoulders',patterns:['push-v','push-h']},
  // Arms need a push AND a pull — triceps and biceps are not the same job.
  {key:'arms',label:'Arms',patterns:['push-h','push-v','pull-h','pull-v'],needsBoth:[['push-h','push-v'],['pull-h','pull-v']]},
  {key:'quads',label:'Quads',patterns:['squat']},
  {key:'posterior',label:'Hamstrings & glutes',patterns:['hinge','squat']},
  {key:'core',label:'Core',patterns:['core']},
  {key:'conditioning',label:'Conditioning',patterns:['conditioning']},
];
function muscleCoverage(products,ownedCats){
  const cov=coverageOf(products,ownedCats);
  const maxOf=ps=>ps.reduce((m,p)=>Math.max(m,cov[p]),0);
  return MUSCLE_GROUPS.map(g=>({
    key:g.key, label:g.label,
    level:g.needsBoth?Math.min(maxOf(g.needsBoth[0]),maxOf(g.needsBoth[1])):maxOf(g.patterns),
    via:g.patterns.filter(p=>cov[p]>0).map(p=>PATTERN_LABEL[p]),
  }));
}
function coverageSummary(products,ownedCats){
  const groups=muscleCoverage(products,ownedCats), missing=groups.filter(g=>g.level===0);
  if(!missing.length) return `Trains all ${groups.length} muscle groups.`;
  const names=missing.map(g=>g.label.toLowerCase());
  const list=names.length===1?names[0]:`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
  return `Covers everything except ${list}.`;
}

// ── KIT BUILDER ───────────────────────────────────────────────
// One request returns three kits (Best Value / Best Match / Best Quality)
// from the quiz answers. Groq (Llama 3.3 70B) picks product IDs when a key
// is present; otherwise a deterministic builder runs. Either way the server
// owns the product data — the model only ever selects IDs, never prices.

// Categories that belong in a home-gym kit, in build-priority order.
const KIT_CATEGORIES = ['racks','machines','barbells','plates','benches','dumbbells','kettlebells','cardio','bands','jumpropes','yogamats','foamrollers'];

// Flat lookup of every kit-eligible product, trimmed to what selection needs.
// gs = gymgearScore (computed above), compact = fits a tight space (machines).
const KIT_CATALOG = KIT_CATEGORIES.flatMap(cat =>
  (PRODUCTS[cat]||[]).map(p => ({
    id:p.id, name:p.name, brand:p.brand, cat,
    // price = what the kit is charged; list = undiscounted, so the builder can
    // tell a real deal from a product that is merely cheap.
    price:p.salePrice||p.price, list:p.price, quality:p.quality, rating:p.rating,
    gs:p.gymgearScore||0, compact:!!p.compact,
    // What this piece lets you train, and whether it stands in for a rack.
    // See COVERAGE MODEL — the kit is judged on the union of these.
    trains:trainsOf(p.id,cat,p.specs), rackLike:replacesRack(cat,p.specs),
  }))
);
const KIT_BY_ID = new Map(KIT_CATALOG.map(p=>[p.id,p]));

const BUDGET_CAP   = {'under-300':300,'300-800':800,'800-2000':2000,'2000-plus':8000};
// 'key-pieces' still means a bench and something to lift — two slots could not
// hold both an anchor and what makes it usable. (Lockstep: frontend route.ts.)
const PIECE_TARGET = {'key-pieces':3,'small-setup':4,'full-home-gym':6};
const OWNED_TO_CAT = {barbell:'barbells',dumbbells:'dumbbells',bench:'benches',rack:'racks',cardio:'cardio'};

// Per-tier budget tolerance: Best Value stays at budget, Best Match flexes
// slightly, Best Quality is the aspirational stretch shown side by side.
const TIER_CAP_MULT = {value:1, match:1.15, quality:1.8};
const capFor = (type,cap) => Math.round(cap*(TIER_CAP_MULT[type]||1));

// Bias the category order so the kit reflects goal + space + kit size.
// Machines placement is the small-vs-big trade: a small setup leads with one
// efficient all-in-one; a full home gym prefers the variety of separates and
// only reaches a machine after the core iron is in.
function categoryOrder(goal,space,pieces,experience){
  let order=[...KIT_CATEGORIES];
  const bump=(cats)=>{order=[...cats,...order.filter(c=>!cats.includes(c))]};
  if(goal==='lose-weight'||goal==='get-fit') bump(['cardio','kettlebells','bands','dumbbells']);
  if(goal==='build-strength') bump(['racks','barbells','plates','benches']);
  if(goal==='home-gym-setup') bump(['machines','racks','barbells','benches']);
  // Experience shapes the path: beginners get guided, adjustable, machine-led
  // gear; advanced lifters get the barbell + rack path reinforced.
  if(experience==='beginner') bump(['machines','dumbbells','kettlebells','bands']);
  if(experience==='advanced'&&goal!=='lose-weight') bump(['racks','barbells','plates','benches']);
  // Few pieces + strength-ish goal → the all-in-one anchors the whole kit.
  if(pieces<=4 && (goal==='build-strength'||goal==='home-gym-setup')) bump(['machines']);
  // Big builds: machine drops to the back — separates give the variety.
  if(pieces>=6 && goal!=='home-gym-setup'){
    order=order.filter(c=>c!=='machines'); order.push('machines');
  }
  // Tight spaces can't host a normal rack or a treadmill-class machine, but
  // compact units (cable tower, rod gyms, wall-folding rack, folding rower)
  // still qualify — buildKit gates non-compact ones at product level.
  if(space==='apartment-corner'||space==='small-room'){
    const strengthy=goal==='build-strength'||goal==='home-gym-setup';
    const tight=strengthy
      ? ['machines','racks','dumbbells','kettlebells','bands','benches','jumpropes','yogamats','foamrollers']
      : ['dumbbells','kettlebells','cardio','bands','machines','racks','jumpropes','yogamats','foamrollers','benches'];
    order=[...tight.filter(c=>order.includes(c)),...order.filter(c=>!tight.includes(c))];
  }
  return order;
}

// Ceiling gate (quiz: ceiling === 'under-8ft'). Full racks and most
// all-in-ones stand 86-91" — they don't clear an 8 ft (96") ceiling once
// flooring and pull-up clearance are in. Only these fit a low room.
const LOW_CEIL_RACKS=new Set(['titan-t2','rogue-squat','rep-hr100','bells-squat']);
const LOW_CEIL_MACHINES=new Set(['marcy-mwm990','bowflex-x2se','bells-cable-tower','tonal-2','bodysolid-exm2500']);

// How much of the per-slot budget a category deserves. Anchors (machine,
// rack, cardio) soak up multiples of an even share; small accessories a
// fraction. This is what lets a $300 kit and a $2,000 kit pick DIFFERENT
// products in the same category instead of always the same list-topper.
const CAT_SHARE={machines:2.6,racks:2.2,cardio:2.2,plates:1.6,barbells:1.4,dumbbells:1.4,benches:1.2,kettlebells:0.6,yogamats:0.3,bands:0.25,foamrollers:0.25,jumpropes:0.2};

// Usability floor. A kit has to be trainable, not merely affordable: free
// weights with nowhere to press them, or a single $295 pile of dumbbells that
// happened to fill the budget exactly, is not a gym. These rules may push a kit
// modestly past its tier cap — a little over budget beats unusable.
// (Lockstep: frontend src/app/api/kit/route.ts.)
const MIN_PIECES=3;
const ESSENTIAL_OVERFLOW=1.35;
const RESERVE_PER_SLOT=45;            // held back per still-unfilled slot
const NEEDS_BENCH=new Set(['dumbbells','barbells','plates','racks']);
// Wider than NEEDS_BENCH: kettlebells don't oblige a bench but do use one.
// Only a bench with no weight at all beside it is dead weight.
const BENCH_USABLE_WITH=new Set([...NEEDS_BENCH,'kettlebells','machines']);
// Useless without their partner — buy the partner or drop the orphan.
const HARD_PAIRS={racks:['barbells','plates'],barbells:['plates'],plates:['barbells']};
const DROP_FOR_BENCH=new Set(['jumpropes','foamrollers','yogamats','bands','kettlebells','plates','barbells']);

// Discount preference. The site's promise is the best price, so a genuine sale
// should win ties and beat marginal alternatives — but never drag in a
// materially worse product, which would turn "best value" into "most stuff on
// sale". Bounded by the discount itself: a 25% cut moves the quality score by
// 0.5, so it decides between near-equals and nothing more.
const DEAL_WEIGHT_MATCH=1.5;
const DEAL_WEIGHT_QUALITY=2.0;
// How much built-quality a same-category swap may give up to land a deal.
const DEAL_SWAP_MAX_QUALITY_DROP=1;

// Greedy one-per-category pick for a tier. Three distinct strategies so the
// kits never collapse into each other: value = cheapest decent option,
// match = personalised (GymGear Score + rating + budget fit), quality = best
// built. `tight` gates non-compact machines out of small spaces at product
// level (a cable tower fits an apartment corner; a G20 does not).
function buildKit(strategy,{cap,target,ownedCats,order,tight,lowCeil,needs}){
  const perSlot=cap/Math.max(target,1);
  // 1.0 when the price sits at the category's ideal share of budget, falling
  // off above (over budget hurts fast) and below (a $10 item isn't an anchor).
  const fit=p=>{
    const ideal=perSlot*(CAT_SHARE[p.cat]||1);
    const r=p.price/Math.max(ideal,1);
    return r>1?Math.max(0,2-r):0.4+0.6*r;
  };
  // Fraction off list, 0 when not on sale. Value already prefers a discount
  // implicitly — its score IS the sale price — so only match and quality need
  // it made explicit.
  const dealBoost=p=>(p.list>0?Math.max(0,(p.list-p.price)/p.list):0);
  const score={
    value:p=>-p.price,                            // cheapest first (sale price)
    // Unrated products fall back to our own score on the same 0-1 scale -
    // gs already absorbs rating and re-weights when it is absent. Using 0
    // would bury every unrated product out of the match tier permanently.
    match:p=>(p.gs/100)*2+(p.rating!=null?p.rating/5:p.gs/100)+fit(p)*1.5+dealBoost(p)*DEAL_WEIGHT_MATCH,
    quality:p=>p.quality+fit(p)*0.5+dealBoost(p)*DEAL_WEIGHT_QUALITY,
  }[strategy];
  const picks=[]; let spent=0; const blocked=new Set();
  // A rack and the machine that IS one (uprights + cables) are redundant
  // together — but only a genuine all-in-one replaces a rack. Deriving this per
  // product instead of per category is what stops a single-station leg press
  // from blocking the rack and gutting the kit.
  const conflicted=p=>(p.cat==='racks'&&picks.some(q=>q.rackLike))
    ||(p.rackLike&&picks.some(q=>q.cat==='racks'));
  // The gates that come from the buyer's own answers: it doesn't fit the room,
  // it doesn't clear the ceiling, they already own it, or it isn't the kind of
  // bar a kit can be built on. These hold for ANY slot — separated from
  // allowed() because the deal swap replaces a product in a slot that is
  // already taken, so it can't use the blocked-category test but absolutely
  // must still respect these (it was swapping a compact all-in-one for a
  // discounted commercial leg press that then failed the room filter, leaving
  // a two-item "kit").
  const eligible=p=>!ownedCats.has(p.cat)
    // An EZ curl bar is not a barbell you can rack, bench or squat.
    &&!SPECIALTY_BARS.has(p.id)
    &&!(tight&&(p.cat==='machines'||p.cat==='cardio'||p.cat==='racks')&&!p.compact)
    &&!(lowCeil&&p.cat==='racks'&&!LOW_CEIL_RACKS.has(p.id))
    &&!(lowCeil&&p.cat==='machines'&&!LOW_CEIL_MACHINES.has(p.id));
  // Everything except the budget test — reused by the usability passes below.
  const allowed=p=>!blocked.has(p.cat)&&!conflicted(p)&&eligible(p);
  const fitsIn=(p,budget)=>spent+p.price<=budget;
  // Hold budget back for the slots still to fill: one greedy anchor must not be
  // able to eat the whole kit (a $295 dumbbell under a $300 cap left users
  // looking at a one-item "kit").
  const reserve=()=>Math.max(0,target-picks.length-1)*RESERVE_PER_SLOT;
  const cheapestIn=cat=>{
    const all=KIT_CATALOG.filter(q=>q.cat===cat);
    const good=all.filter(q=>q.quality>=7);
    return (good.length?good:all).reduce((m,q)=>(!m||q.price<m.price)?q:m,undefined);
  };
  // Cheapest bench the kit could seat, held back while shopping for anything
  // that will need one — held once ANY pick needs a bench, or the accessories
  // that follow quietly spend the bench money.
  const cheapestBench=cheapestIn('benches');
  const benchHeld=p=>{
    if(!cheapestBench||p.cat==='benches')return 0;
    if(ownedCats.has('benches')||picks.some(q=>q.cat==='benches'))return 0;
    return (NEEDS_BENCH.has(p.cat)||picks.some(q=>NEEDS_BENCH.has(q.cat)))?cheapestBench.price:0;
  };
  // Same idea for hard pairs: don't buy a rack you can't afford a bar and
  // plates for, or it just gets thrown away again later.
  const cheapestByCat={};
  for(const need of new Set(Object.values(HARD_PAIRS).flat())) cheapestByCat[need]=cheapestIn(need);
  const pairHeld=p=>(HARD_PAIRS[p.cat]||[]).reduce((s,need)=>
    (picks.some(q=>q.cat===need)||ownedCats.has(need))?s:s+((cheapestByCat[need]||{}).price||0),0);
  const pickable=p=>allowed(p)&&fitsIn(p,cap-reserve()-benchHeld(p)-pairHeld(p));
  const take=p=>{picks.push(p);spent+=p.price;blocked.add(p.cat);};
  const drop=i=>{spent-=picks[i].price;blocked.delete(picks[i].cat);picks.splice(i,1);};
  for(const cat of order){
    if(picks.length>=target) break;
    if(blocked.has(cat)||ownedCats.has(cat)) continue;
    let cands=KIT_CATALOG.filter(p=>p.cat===cat&&pickable(p));
    // Nothing clears the reserve? Fall back to the plain cap, so holding budget
    // back can never silently drop a category entirely.
    if(!cands.length) cands=KIT_CATALOG.filter(p=>p.cat===cat&&allowed(p)&&fitsIn(p,cap-benchHeld(p)-pairHeld(p)));
    // Value still wants decent gear — gate to quality ≥7 unless nothing fits.
    if(strategy==='value'){ const decent=cands.filter(p=>p.quality>=7); if(decent.length) cands=decent; }
    const best=cands.sort((a,b)=>score(b)-score(a))[0];
    if(best) take(best);
  }

  // Usability passes. benchHeld() reserved the money while picking, so
  // seatBench() can afford itself even though it runs last — and running last
  // is what lets it judge the FINAL composition.
  const stretch=cap*ESSENTIAL_OVERFLOW;
  const seatBench=()=>{
    if(!picks.some(p=>NEEDS_BENCH.has(p.cat))||picks.some(p=>p.cat==='benches')||ownedCats.has('benches'))return;
    const benches=KIT_CATALOG.filter(p=>p.cat==='benches'&&allowed(p));
    const decent=benches.filter(p=>p.quality>=7);
    const bench=(decent.length?decent:benches).sort((a,b)=>a.price-b.price)[0];
    if(!bench)return;
    // Plan the trades, then apply them only if the bench actually lands.
    // Shedding as we went used to drop the very barbell that required the
    // bench, then decline the bench because nothing needed it any more.
    const cut=new Set(); let sim=spent;
    while(sim+bench.price>stretch){
      let worst=-1;
      picks.forEach((p,i)=>{
        if(cut.has(i)||!DROP_FOR_BENCH.has(p.cat))return;
        if(NEEDS_BENCH.has(p.cat)&&!picks.some((q,j)=>j!==i&&!cut.has(j)&&NEEDS_BENCH.has(q.cat)))return;
        if(worst<0||p.price>picks[worst].price)worst=i;
      });
      if(worst<0)break;
      cut.add(worst); sim-=picks[worst].price;
    }
    if(sim+bench.price<=stretch){ [...cut].sort((a,b)=>b-a).forEach(drop); take(bench); }
  };

  // Barbell gear is all-or-nothing. A rack with no bar, or plates with no bar
  // to load them on, is money spent on something you physically cannot use.
  for(let pass=0;pass<6;pass++){
    let changed=false;
    for(const [cat,needs] of Object.entries(HARD_PAIRS)){
      if(!picks.some(p=>p.cat===cat))continue;
      for(const need of needs){
        if(picks.some(p=>p.cat===need)||ownedCats.has(need))continue;
        const cands=KIT_CATALOG.filter(p=>p.cat===need&&allowed(p)&&fitsIn(p,stretch));
        const decent=cands.filter(p=>p.quality>=7);
        const partner=(decent.length?decent:cands).sort((a,b)=>a.price-b.price)[0];
        if(partner) take(partner);
        else { const i=picks.findIndex(p=>p.cat===cat); if(i>=0) drop(i); }
        changed=true; break;
      }
    }
    if(!changed)break;
  }

  // Budget left and slots left → add value picks from any remaining category.
  if(picks.length<target){
    // Fill the remaining slots the way this tier picks everything else — a
    // filler slot is still a slot the buyer sees, and value-per-dollar
    // regardless of tier would put the cheapest thing that clears the bar into
    // a Best Quality kit. Latent today (the greedy pass almost always reaches
    // `target` on its own, and this changed no kit across the 8,640 the audit
    // builds), but the sort is wrong on its own terms. The coverage repair
    // below stays deliberately cheapest-first: that one is closing a gap, not
    // expressing the tier.
    const extra=KIT_CATALOG
      .filter(pickable)
      .sort((a,b)=>score(b)-score(a));
    for(const p of extra){ if(picks.length>=target)break; if(!pickable(p))continue; take(p); }
  }
  // Filler only: standalone gear. Benches are seatBench()'s call, and barbell
  // gear drags its partners along — topping up on pure value-per-dollar kept
  // adding cheap plates with no bar, which the orphan prune then stripped.
  while(picks.length<MIN_PIECES){
    const next=KIT_CATALOG
      .filter(p=>p.cat!=='benches'&&!HARD_PAIRS[p.cat]&&allowed(p)&&fitsIn(p,stretch))
      .sort((a,b)=>(b.quality/b.price)-(a.quality/a.price))[0];
    if(!next)break;
    take(next);
  }
  seatBench();

  // Coverage repair — the pass that makes a kit a gym rather than a coherent
  // pile. Everything above only checks that the pieces work TOGETHER; a rack, a
  // bar and plates pass every one of those rules and still cannot train your
  // chest. So: for each movement the goal needs and the kit can't deliver, buy
  // the cheapest piece that fixes it, spending against the same stretched cap
  // the other usability rules use. Cheapest-that-fixes-it (not best) keeps the
  // repair from quietly rebuilding the tier's character — a $54 kettlebell
  // restores the hinge, it doesn't turn Best Value into Best Quality.
  // Owned gear counts toward what the buyer can train — the kit doesn't
  // re-sell you the rack you already have, and without this the repair pass
  // would "fix" your missing pull-up bar with a resistance band.
  const owned=ownedTrains(ownedCats);
  const coverNow=()=>coverageFromTrains([...picks.map(p=>({category:p.cat,trains:p.trains})),...owned]);
  for(let pass=0;pass<PATTERNS.length;pass++){
    const cov=coverNow();
    // Deepest hole first: a pattern at 0 is a muscle group you cannot train at
    // all, which beats topping a 1 up to a 2.
    const missing=Object.keys(needs||{}).filter(k=>cov[k]<needs[k]).sort((a,b)=>cov[a]-cov[b]);
    if(!missing.length)break;
    const pat=missing[0], want=needs[pat];
    // Simulate: only take a piece that genuinely moves this pattern once the
    // kit's own enablers are applied — a bench "covers" chest press only
    // alongside something to press.
    const fixes=KIT_CATALOG
      .filter(p=>allowed(p)&&!picks.some(q=>q.cat===p.cat)&&fitsIn(p,stretch))
      .filter(p=>coverageFromTrains([...[...picks,p].map(q=>({category:q.cat,trains:q.trains})),...owned])[pat]>=want)
      .sort((a,b)=>a.price-b.price);
    if(!fixes.length)break;
    take(fixes[0]);
  }
  // Repair can bring in the free weights that make a bench worth having.
  seatBench();

  // Last look: a kit with no deal in it, when a comparable discounted product
  // was sitting right there, is a missed claim on a site that promises the best
  // price. Swaps are same-category and same-slot, so the kit's shape is
  // untouched — but same CATEGORY is not the same FUNCTION. A leg press and an
  // all-in-one trainer are both `machines`, and swapping one for the other on
  // the strength of a 16% discount is what silently removed every pulling
  // movement from the $4,549 "strength" kit. So the swap has to leave the kit
  // able to train everything it could before. The swap may never make the kit
  // dearer either: a "deal" that costs more than what it replaced is not a
  // deal, and it was shuffling Best Value above Best Match on the results page.
  const covBefore=coverNow();
  const keepsCoverage=(i,alt)=>{
    const after=coverageFromTrains([...picks.map((q,j)=>({category:j===i?alt.cat:q.cat,trains:j===i?alt.trains:q.trains})),...owned]);
    return PATTERNS.every(k=>after[k]>=((needs||{})[k]||0)&&!(covBefore[k]>0&&after[k]===0));
  };
  if(!picks.some(p=>dealBoost(p)>0)){
    for(let i=0;i<picks.length;i++){
      const cur=picks[i];
      const alt=KIT_CATALOG
        .filter(p=>p.cat===cur.cat&&p.id!==cur.id&&dealBoost(p)>0
          &&p.quality>=cur.quality-DEAL_SWAP_MAX_QUALITY_DROP
          &&p.price<=cur.price
          &&spent-cur.price+p.price<=stretch
          &&eligible(p)
          // An all-in-one swapped in next to a rack is the redundancy the
          // rack-like rule exists to prevent.
          &&!(p.rackLike&&picks.some((q,j)=>j!==i&&q.cat==='racks'))
          &&keepsCoverage(i,p))
        .sort((a,b)=>(b.quality+dealBoost(b)*2)-(a.quality+dealBoost(a)*2))[0];
      if(alt){ spent+=alt.price-cur.price; picks[i]=alt; break; }
    }
  }
  return picks.map(p=>p.id);
}

const KIT_TIERS=[
  {type:'value',  name:'Best Value',  strategy:'value'},
  {type:'match',  name:'Best Match',  strategy:'match'},
  {type:'quality',name:'Best Quality',strategy:'quality'},
];

function fallbackKits(answers){
  const cap=BUDGET_CAP[answers.budget]||2000;
  const target=PIECE_TARGET[answers.equipmentCount]||4;
  const ownedCats=new Set((answers.owned||[]).map(id=>OWNED_TO_CAT[id]).filter(Boolean));
  const order=categoryOrder(answers.goal,answers.space,target,answers.experience);
  const tight=answers.space==='apartment-corner'||answers.space==='small-room';
  const lowCeil=answers.ceiling==='under-8ft';
  const needs=needsFor(answers.goal);
  return KIT_TIERS.map(t=>({
    type:t.type, name:t.name,
    productIds:buildKit(t.strategy,{cap:capFor(t.type,cap),target,ownedCats,order,tight,lowCeil,needs}),
  }));
}

const priceOf = p => p.salePrice||p.price;

// Space fit is enforced per-product via the compact flag (see hydrateKits) —
// a wall-folding rack IS apartment-friendly, so no category is banned
// wholesale anymore. Kept as a hook for future hard category bans.
function forbiddenCats(space){
  return new Set();
}

// Hydrate the model/fallback's chosen IDs into full product objects, then
// enforce the hard constraints the model can't be trusted with: drop unknown
// IDs (no hallucinated pick reaches the client), drop space-forbidden and
// owned categories, dedupe by category, and trim to the tier budget.
function hydrateKits(rawKits,budgetCap,forbidden,ownedCats,tight,lowCeil,goal){
  return rawKits.map(k=>{
    let products=(k.productIds||[])
      .map(id=>{const lite=KIT_BY_ID.get(id);if(!lite)return null;
        const full=(PRODUCTS[lite.cat]||[]).find(p=>p.id===id);return full?{...full,category:lite.cat}:null;})
      .filter(Boolean)
      .filter(p=>!forbidden.has(p.category)&&!ownedCats.has(p.category))
      // Full-size machines, treadmill-class cardio and normal racks can't
      // live in a tight space (compact units — cable tower, folding rower,
      // wall-folding rack — can). Low ceilings gate tall racks/machines too.
      .filter(p=>!(tight&&(p.category==='machines'||p.category==='cardio'||p.category==='racks')&&!p.compact))
      .filter(p=>!(lowCeil&&p.category==='racks'&&!LOW_CEIL_RACKS.has(p.id)))
      .filter(p=>!(lowCeil&&p.category==='machines'&&!LOW_CEIL_MACHINES.has(p.id)));
    // Dedupe by category so a kit never lists two benches — and never a rack
    // AND the all-in-one that already is one (single-station machines like a
    // leg press are not rack replacements and may sit beside a rack).
    const seen=new Set(); let rackSeen=false, allInOneSeen=false;
    products=products.filter(p=>{
      if(seen.has(p.category))return false;
      const isRackLike=replacesRack(p.category,p.specs);
      if(p.category==='racks'&&allInOneSeen)return false;
      if(isRackLike&&rackSeen)return false;
      if(p.category==='racks')rackSeen=true;
      if(isRackLike)allInOneSeen=true;
      seen.add(p.category); return true;
    });
    // Trim against the same budget buildKit composed to. Trimming to the bare
    // tier cap dismantled coherent kits from the outside: it dropped the
    // barbell (dearest, and the bench is protected) and left a bench with
    // nothing to lift. Never trim below a usable kit either — this loop used
    // to happily strip a kit down to a single item.
    const cap=capFor(k.type,budgetCap)*ESSENTIAL_OVERFLOW;
    let total=products.reduce((s,p)=>s+priceOf(p),0);
    const needsBench=products.some(p=>NEEDS_BENCH.has(p.category));
    for(;;){
      if(total<=cap||products.length<=MIN_PIECES)break;
      // Trimming for budget must never re-open a coverage gap: a cheaper kit
      // that can no longer train your back isn't cheaper, it's broken.
      const gapsNow=coverageGaps(products,goal,ownedCats).length;
      const droppable=products.map((p,idx)=>({p,idx}))
        .filter(({p})=>!(needsBench&&p.category==='benches'))
        .filter(({idx})=>coverageGaps(products.filter((_,i)=>i!==idx),goal,ownedCats).length<=gapsNow);
      if(!droppable.length)break;
      const worst=droppable.reduce((m,c)=>priceOf(c.p)>priceOf(m.p)?c:m);
      total-=priceOf(worst.p); products.splice(worst.idx,1);
    }
    // The trim can orphan a hard pair — drop the bar and the plates are
    // suddenly unusable. Prune whatever is left without its partner.
    for(let pass=0;pass<3;pass++){
      const cats=new Set(products.map(p=>p.category));
      const orphan=products.findIndex(p=>(HARD_PAIRS[p.category]||[]).some(n=>!cats.has(n)&&!ownedCats.has(n)));
      if(orphan<0)break;
      total-=priceOf(products[orphan]); products.splice(orphan,1);
    }
    // A bench with no weight of any kind beside it is the same dead weight.
    if(products.some(p=>p.category==='benches')&&!products.some(p=>BENCH_USABLE_WITH.has(p.category))){
      const i=products.findIndex(p=>p.category==='benches');
      total-=priceOf(products[i]); products.splice(i,1);
    }
    return {
      type:k.type, name:k.name,
      description:typeof k.description==='string'?k.description.trim().slice(0,300):'',
      products, totalPrice:total,
    };
  }).filter(k=>k.products.length>0);
}

// Default copy when Groq is absent or fails — never blank.
const ownedCatsOf=answers=>new Set((answers.owned||[]).map(id=>OWNED_TO_CAT[id]).filter(Boolean));
const GOAL_WORD={'build-strength':'strength','lose-weight':'fat-loss','get-fit':'all-round fitness','home-gym-setup':'complete home-gym'};
function defaultCopy(kit,answers){
  const lead=kit.products[0]?.name||'your essentials';
  const goal=GOAL_WORD[answers.goal]||'training';
  const blurb={
    value:`The smartest ${goal} setup for the money, anchored by the ${lead}.`,
    match:`Balanced for your space and budget — built around the ${lead}.`,
    quality:`Buy-once gear that lasts a lifetime, led by the ${lead}.`,
  }[kit.type]||`A ${goal} kit built around the ${lead}.`;
  // State the coverage in the blurb — it is the strongest thing we can say
  // about a kit, and saying it here keeps the claim honest when it isn't
  // complete (coverageSummary names what's missing rather than hiding it).
  // (Lockstep: frontend route.ts defaultCopy.)
  return {name:kit.name,description:`${blurb} ${coverageSummary(kit.products,ownedCatsOf(answers))}`};
}

// Groq writes only the name + description for already-chosen kits. It cannot
// touch product selection, so it can never produce a bad or over-budget cart.
async function groqCopy(answers,kits){
  const key=process.env.GROQ_API_KEY;
  if(!key) return null;
  const owned=(answers.owned||[]).map(id=>OWNED_TO_CAT[id]).filter(Boolean);
  const summary=kits.map(k=>
    `${k.type} ($${k.totalPrice}): ${k.products.map(p=>`${p.name} (${p.brand})`).join(', ')}`
  ).join('\n');
  const sys=`You write punchy marketing copy for pre-built home-gym kits. Return strict JSON {"kits":[{"type":"value|match|quality","name":string,"description":string}]} for all three kits. name = a short punchy kit name, max 4 words. description = two short sentences (max 30 words) on why this exact set of products fits the buyer. Do not invent products or prices; describe only what is listed.`;
  const user=`Buyer — goal: ${answers.goal}, budget tier: ${answers.budget}, space: ${answers.space}, already owns: ${owned.join(', ')||'nothing'}.\n\nThe three kits and their products:\n${summary}`;
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',temperature:0.7,
      response_format:{type:'json_object'},
      messages:[{role:'system',content:sys},{role:'user',content:user}]}),
  });
  if(!r.ok) throw new Error(`Groq ${r.status}`);
  const parsed=JSON.parse((await r.json()).choices[0].message.content);
  if(!Array.isArray(parsed.kits)) throw new Error('Groq: bad shape');
  const byType=new Map(parsed.kits.map(k=>[k.type,k]));
  return byType;
}

// ── Frequently-bought-together accessory recommender ──────────────
// Research-backed priority of accessory categories for a home gym (flooring
// first, then grip/support, then recovery/bag, then supplements). Filtered to
// what is actually relevant to the kit (pairsWith ∩ the kit's categories),
// best-rated product per category. Fully deterministic + owned — no Amazon API,
// no per-request LLM. (// TODO: optional Groq re-rank of this pool when
// GROQ_API_KEY is set — additive only, must stay constrained to pool ids.)
// (fatburners deliberately excluded — won't push fat burners as a cross-sell.)
const ACCESSORY_PRIORITY = ['yogamats', 'chalk', 'belts', 'sleeves', 'straps', 'wraps', 'foamrollers', 'jumpropes', 'gymbags', 'protein', 'creatine', 'preworkout', 'recovery', 'vitamins'];

function accessoryPool(kits, ownedCats = new Set(), max = 8) {
  const kitCats = new Set();
  for (const k of kits) for (const p of k.products) kitCats.add(p.category);
  if (!kitCats.size) return [];
  const pool = [];
  for (const cat of ACCESSORY_PRIORITY) {
    if (pool.length >= max) break;
    if (kitCats.has(cat) || ownedCats.has(cat)) continue; // already in the kit / owned
    const list = PRODUCTS[cat];
    if (!list || !list.length) continue;
    const pw = list[0].pairsWith || [];
    if (!pw.some(c => kitCats.has(c))) continue; // not relevant to this kit
    // quality/2 maps our 0-10 onto the 0-5 rating scale, so an unrated
    // accessory sorts on merit instead of NaN-ing the comparator.
    const rk = (p) => (p.rating != null ? p.rating : p.quality / 2);
    const best = [...list].sort((a, b) => (rk(b) - rk(a)) || (b.quality - a.quality))[0];
    if (best) pool.push({ ...best, category: cat });
  }
  return pool;
}

// Short "why add this" line per accessory category. The deterministic base
// (always present, no dash punctuation) that Groq enhances when a key is set.
// Each names the gap the item fills in a strength setup and the payoff.
const WHY_FALLBACK = {
  yogamats: "Your setup is built for standing lifts with nothing for floor core, mobility, or stretching. The mat fills that gap, it is the cheapest piece here, and you will use it every session.",
  chalk: "Heavy pulls and presses slip at the grip long before the muscle gives out. A little chalk keeps the bar locked in and adds clean reps to every working set.",
  belts: "As your squat and deadlift climb, your lower back becomes the limit. A belt braces your core so you can load heavier with confidence and keep progressing.",
  sleeves: "Heavy squats and leg work wear on the knees over time. Sleeves add warmth, support, and rebound out of the bottom so you train harder and recover faster.",
  straps: "Your back and legs will outwork your grip on rows and pulls. Straps remove grip as the weak link so you can drive the target muscle all the way to failure.",
  wraps: "Heavy pressing loads the wrists hard. Wraps keep the joint stacked and stable so you can push your bench and overhead work without holding back.",
  foamrollers: "Hard sessions leave tight, sore muscles that drag into the next one. A few minutes on the roller restores range of motion and keeps you training pain free.",
  jumpropes: "Your kit has no fast conditioning option. A rope packs high intensity cardio into almost no space and pairs cleanly with your strength work.",
  gymbags: "Plates, belt, sleeves, and chalk add up quickly. A dedicated bag keeps your gear organized and ready so nothing slows your session down.",
  protein: "Building muscle needs more protein than most meals deliver. One scoop after training hits your daily target and turns the work into real results.",
  creatine: "Creatine is the most proven supplement for strength and size. A few grams a day buys extra reps, faster recovery, and lean mass for pocket change.",
  preworkout: "Some days the drive just is not there. A single scoop sharpens focus and energy so even the flat days turn into productive sessions.",
  recovery: "Your training is only as good as how well you recover from it. This keeps soreness down and gets you back under the bar sooner.",
  vitamins: "Consistent training raises what your body needs to perform. Covering the basics keeps your energy, recovery, and immunity steady so you never miss a session.",
};
function defaultWhy(accessory) {
  return WHY_FALLBACK[accessory.category] ||
    "A smart, low cost addition that rounds out your setup and earns its place fast.";
}

// Groq writes a grounded one-line "why add this" for each FBT accessory, using
// the buyer's actual kit as context. Same pattern as groqCopy: AI when a key is
// present, deterministic WHY_FALLBACK otherwise. Returns a Map(id -> text).
async function accessoryWhy(answers, kits, accessories) {
  const key = process.env.GROQ_API_KEY;
  if (!key || !accessories.length) return null;
  const matchKit = kits.find(k => k.type === 'match') || kits[0];
  const setup = matchKit.products.map(p => p.name).join(', ');
  const items = accessories.map(a => `${a.id} = ${a.name}`).join('\n');
  const sys = `You are a confident strength coach writing one punchy reason to add each accessory to a buyer's home gym order. Return strict JSON {"why":[{"id":string,"text":string}]} with an entry for every id provided. Each text is exactly one or two full sentences, 25 to 38 words, and follows this shape: first name the specific gap in THEIR listed setup that this item fills, then give the payoff such as it is the cheapest piece, you will use it every session, or it lets you lift heavier and safer. Be concrete and specific to the equipment they listed. Professional but plain everyday words, no fancy vocabulary. Never use a dash or hyphen character. Match the depth and style of this yoga mat example exactly: "Your setup is all standing barbell work with nothing for floor core, stretching, or mobility. The mat fixes that, it is the cheapest piece here, and you will use it every session." Only selling information, no filler.`;
  const user = `Buyer goal: ${answers.goal}. Space: ${answers.space}. Their kit already includes: ${setup}.\n\nWrite a reason for each accessory id:\n${items}`;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}`);
  const parsed = JSON.parse((await r.json()).choices[0].message.content);
  if (!Array.isArray(parsed.why)) throw new Error('Groq: bad why shape');
  return new Map(parsed.why.map(w => [w.id, (w.text || '').toString()]));
}

app.post('/api/kit',async(req,res)=>{
  const a=req.body||{};
  if(!a.goal||!a.budget) return res.status(400).json({error:'Send at least goal and budget.'});
  const cap=BUDGET_CAP[a.budget]||2000;
  const forbidden=forbiddenCats(a.space);
  const ownedCats=new Set((a.owned||[]).map(id=>OWNED_TO_CAT[id]).filter(Boolean));

  // Deterministic selection owns the cart — always budget-, space-, and
  // owned-aware. Groq only dresses it with names and descriptions.
  const tight=a.space==='apartment-corner'||a.space==='small-room';
  const lowCeil=a.ceiling==='under-8ft';
  let kits=hydrateKits(fallbackKits(a),cap,forbidden,ownedCats,tight,lowCeil,a.goal);

  let generatedBy='fallback';
  try{
    const copy=await groqCopy(a,kits);
    if(copy){
      generatedBy='groq';
      kits=kits.map(k=>{
        const c=copy.get(k.type);
        const fallbackCopy=defaultCopy(k,a);
        const written=(c?.description||'').toString().trim().slice(0,300);
        return {...k,
          name:(c?.name||'').toString().trim().slice(0,40)||fallbackCopy.name,
          // The coverage sentence is measured, never written: append ours to
          // whatever the model produced so the claim can't be hallucinated
          // (and can't be dropped) by the copy pass.
          description:written?`${written} ${coverageSummary(k.products,ownedCats)}`:fallbackCopy.description};
      });
    }else{
      kits=kits.map(k=>({...k,...defaultCopy(k,a)}));
    }
  }catch(err){
    console.warn('Groq copy failed, using default copy:',err.message);
    kits=kits.map(k=>({...k,...defaultCopy(k,a)}));
  }
  // What the kit can actually train — rendered as the coverage panel, and the
  // site's proof that "complete" is a measurement, not a slogan.
  kits=kits.map(k=>({...k,
    coverage:coverageOf(k.products,ownedCats),
    coverageGaps:coverageGaps(k.products,a.goal,ownedCats),
    muscles:muscleCoverage(k.products,ownedCats)}));
  // "Frequently bought together" — top complementary accessories for this kit,
  // each with a short "why add this" line. Deterministic copy first (always
  // present), then enhanced by Groq when available; AI dashes are stripped to
  // honour the plain, dash-free house style. Frontend renders one add per item.
  let accessories = accessoryPool(kits, ownedCats).slice(0, 4)
    .map(x => ({ ...x, whyAdd: defaultWhy(x) }));
  try {
    const why = await accessoryWhy(a, kits, accessories);
    if (why) accessories = accessories.map(x => {
      const t = (why.get(x.id) || '').replace(/[-—–]/g, ' ').replace(/\s+/g, ' ').trim();
      return t ? { ...x, whyAdd: t.slice(0, 240) } : x;
    });
  } catch (err) {
    console.warn('Groq accessory why failed, using fallback:', err.message);
  }
  res.json({kits,accessories,generatedBy,generatedAt:new Date().toISOString()});
});

// ── GYM PLANNER (/api/gym-plan) ───────────────────────────────────
// Commercial track: outfit a real facility (new build or renovation).
// Same trust model as the home kit builder — this code owns every product,
// quantity and price deterministically; Groq only writes the prose plan.
const GYM_BUDGET={'10-25k':25000,'25-75k':75000,'75-200k':200000,'200k-plus':400000};
const GYM_AREA={'under-1500':1200,'1500-3000':2200,'3000-6000':4500,'6000-plus':8000};
const GYM_PEAK={'under-15':12,'15-30':25,'30-60':45,'60-plus':80};
const ZONE_LABEL={strength:'Strength Zone',machines:'Machine Row',cardio:'Cardio Row',functional:'Functional Zone',flooring:'Flooring',accessories:'Accessories'};
// Budget share per zone by facility type. Rows sum to 1.
const ZONE_SPLIT={
  'strength-club':   {strength:.50,machines:.20,cardio:.10,functional:.07,flooring:.10,accessories:.03},
  'crossfit-box':    {strength:.45,machines:.05,cardio:.22,functional:.15,flooring:.10,accessories:.03},
  'boutique-studio': {strength:.28,machines:.12,cardio:.22,functional:.22,flooring:.12,accessories:.04},
  'general-fitness': {strength:.30,machines:.22,cardio:.30,functional:.08,flooring:.08,accessories:.02},
};
// Renovation drivers → which zones lean heavier before reallocation.
const RENO_SCOPE_BIAS={
  'replace-gear': {},                                   // like-for-like, no lean
  'add-capacity': {strength:1.3, machines:1.2, cardio:1.2},
  'add-training': {functional:1.7, machines:1.2},
  'reconfigure':  {flooring:1.5, functional:1.15},
  'modernize':    {cardio:1.3, machines:1.25},
};
const clampN=(x,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(x)));
const GP_BY_ID=(()=>{const m=new Map();for(const [cat,list] of Object.entries(PRODUCTS))for(const p of list)if(!m.has(p.id))m.set(p.id,{...p,category:cat});return m;})();
const gpPrice=p=>p.salePrice||p.price;

// Push qty × product into a zone (no budget check — callers size the qty).
function gpAdd(zone,id,qty){
  const p=GP_BY_ID.get(id); if(!p||qty<1) return 0;
  const cost=gpPrice(p)*qty;
  zone.items.push({id:p.id,name:p.name,brand:p.brand,category:p.category,qty,
    unitPrice:gpPrice(p),subtotal:cost,url:p.url,affiliateUrl:p.affiliateUrl,image:p.image});
  zone.subtotal+=cost;
  return cost;
}
// Greedy fill: walk candidates in order, buying up to maxQty of each while
// the zone budget holds. cands = [[id, maxQty], ...] — order = priority.
function gpFill(zone,cands){
  for(const [id,max] of cands){
    const p=GP_BY_ID.get(id); if(!p||max<1) continue;
    const can=Math.min(max,Math.floor((zone.budget-zone.subtotal)/gpPrice(p)));
    if(can>0) gpAdd(zone,id,can);
  }
}
// Score-ranked pool of eligible catalog products across categories (pro/full-
// commercial only by default). Ranked by GymGear Score, then value per dollar —
// so "how the site comes up with machines" is data-driven: a new high-scoring
// machine in the catalog flows in automatically, no hardcoded list to edit.
function gpPool(cats,{proOnly=true,exclude=new Set()}={}){
  const out=[];
  for(const cat of cats) for(const p of (PRODUCTS[cat]||[]))
    if((!proOnly||p.pro)&&!exclude.has(p.id)) out.push({...p,category:cat});
  return out.sort((x,y)=>
    ((y.gymgearScore||0)-(x.gymgearScore||0)) ||
    ((y.gymgearScore||0)/gpPrice(y)-(x.gymgearScore||0)/gpPrice(x)));
}
// Fill a zone from a ranked pool, up to perMax of each, while budget holds.
function gpFillPool(zone,pool,perMax){
  for(const p of pool){
    const can=Math.min(perMax,Math.floor((zone.budget-zone.subtotal)/gpPrice(p)));
    if(can>0) gpAdd(zone,p.id,can);
  }
}
// Which plan zone a product belongs to (mirrors how the zones add gear) — used
// to pin must-have machines into the right zone.
const GP_ZONE_OF=id=>{
  if(id==='rogue-ghd') return 'functional';
  const p=GP_BY_ID.get(id); if(!p) return null;
  const c=p.category;
  if(['racks','barbells','plates','benches','dumbbells'].includes(c)) return 'strength';
  if(c==='machines') return 'machines';
  if(c==='cardio') return 'cardio';
  if(['kettlebells','bands'].includes(c)) return 'functional';
  if(c==='flooring') return 'flooring';
  return null;
};

function buildGymPlan(a){
  const budget=GYM_BUDGET[a.budget]||75000;
  const peak=GYM_PEAK[a.capacity]||25;
  const lowCeil=a.ceilingHeight==='under-9ft';
  const type=ZONE_SPLIT[a.gymType]?a.gymType:'general-fitness';
  // Per-zone sizes (renovation): each redone area gets its own floor size, so
  // quantities are sized off THAT room, not one total. Falls back to the single
  // `space` figure (new build / legacy). ZONE_DEFAULT_SQFT covers a targeted
  // zone the user left unsized.
  const ZONE_DEFAULT_SQFT=800;
  // Empty {} (new build) counts as "no per-zone sizes" → total-area behaviour.
  const zs=(a.zoneSizes&&typeof a.zoneSizes==='object'&&Object.keys(a.zoneSizes).length)?a.zoneSizes:null;
  const area=zs
    ? (Object.values(zs).map(Number).filter(v=>v>0).reduce((s,v)=>s+v,0)||2200)
    : (GYM_AREA[a.space]||2200);
  const za=z=>{ if(!zs) return area; const v=Number(zs[z]); return v>0?v:ZONE_DEFAULT_SQFT; };
  // Must-have machines the owner named (specific models, incl. matching what
  // they already run). Reserve their cost up front so the heuristics leave
  // room, then pin them in after — guaranteed in the plan when budget allows.
  const mustHave=(Array.isArray(a.mustHave)?a.mustHave:[]).filter(id=>GP_BY_ID.get(id));
  let reserve=0; for(const id of mustHave) reserve+=gpPrice(GP_BY_ID.get(id));
  reserve=Math.min(reserve,Math.round(budget*0.6));
  const buildBudget=Math.max(0,budget-reserve);
  let split={...ZONE_SPLIT[type]};
  // renoScope (what's driving the reno) nudges where the budget leans, before
  // anything is zeroed. Multi-select: every chosen driver stacks.
  if(a.projectType==='renovation'&&Array.isArray(a.renoScope)){
    for(const s of a.renoScope){const b=RENO_SCOPE_BIAS[s];if(b)for(const [z,m] of Object.entries(b))if(z in split)split[z]*=m;}
    const sum=Object.values(split).reduce((x,y)=>x+y,0)||1;
    for(const k of Object.keys(split))split[k]/=sum;   // renormalise to 1
  }
  // Renovation: the owner picks which zones to (re)do (renoTargets); every
  // other zone is left as-is and its budget flows into the chosen ones.
  // Accessories always stay in. Falls back to the legacy keepZones field.
  const renoTargets=Array.isArray(a.renoTargets)?a.renoTargets.filter(z=>z in split):[];
  let keepList;
  if(a.projectType==='renovation'&&renoTargets.length){
    const build=new Set([...renoTargets,'accessories']);
    keepList=Object.keys(split).filter(z=>!build.has(z));
  }else{
    keepList=(Array.isArray(a.keepZones)?a.keepZones:[]).filter(z=>z in split);
  }
  const keep=new Set(keepList);
  let freed=0;
  for(const z of keep){freed+=split[z];split[z]=0;}
  const live=Object.keys(split).filter(z=>split[z]>0);
  if(freed>0&&freed<1&&live.length)
    for(const z of live) split[z]+=freed*(split[z]/(1-freed));

  const zones=[];
  const mkZone=key=>{const z={key,label:ZONE_LABEL[key],budget:Math.round(buildBudget*split[key]),items:[],subtotal:0};zones.push(z);return z;};
  const box=type==='crossfit-box', club=type==='strength-club', studio=type==='boutique-studio';

  // Strength — racks anchor everything: sized by the STRENGTH area (za), capped
  // by peak load (one lifter per rack, ~1 rack per 3 concurrent members).
  if(split.strength>0){
    const z=mkZone('strength');
    const racks=clampN(Math.min(za('strength')/450,peak/3),2,14);
    // Under a 9 ft slab, 90"+ uprights leave no pull-up clearance — spec the
    // PR-4000 in its 80" configuration regardless of budget.
    const rackId=lowCeil?'rep-pr4000':budget>=200000?'rogue-rm6':budget>=75000?'rogue-rml390f':'rep-pr4000';
    gpAdd(z,rackId,racks);
    gpAdd(z,'rogue-opb',racks);                                  // a power bar per rack
    if((club||box)&&budget>=75000){gpAdd(z,'rogue-deadlift',1);gpAdd(z,'rogue-squat-bar',1);}
    gpAdd(z,box?'rogue-hg2':'rep-black',racks);                  // a bumper set per rack
    gpAdd(z,'rep-fb5000',Math.max(1,Math.ceil(racks*0.5)));
    gpAdd(z,'rep-ab5200',Math.max(1,Math.ceil(racks*0.25)));
    gpAdd(z,'rep-hex-set',clampN(za('strength')/1500,1,4));      // dumbbell runs
    // Leftover strength budget → depth: more bumpers, premium bars.
    gpFill(z,[['rep-comp',Math.ceil(racks/2)],['eleiko-iwf',club?2:1],['kabuki-power-bar',club?2:0]]);
  }

  // Machine row — drawn from a GymGear-Score-ranked pool of full-commercial
  // machines (gpPool), so the best pieces float up and new catalog machines
  // flow in automatically. GHD is functional, not a machine-row unit. The
  // number of distinct machines scales with the machine-zone area.
  if(split.machines>0){
    const z=mkZone('machines');
    const pool=gpPool(['machines'],{exclude:new Set(['rogue-ghd'])});
    const distinct=clampN(za('machines')/220,3,pool.length);
    gpFillPool(z,pool.slice(0,distinct),studio?1:2);
  }

  // Cardio row — box floors run ergs and air bikes; club floors run
  // treadmill-class units. Unit counts scale with peak occupancy.
  if(split.cardio>0){
    const z=mkZone('cardio');
    const order=box
      ? [['concept2-rower',clampN(peak/5,2,10)],['rogue-echo-bike',clampN(peak/6,2,8)],['concept2-ski',2],['assault-runner',2]]
      : studio
      ? [['concept2-rower',clampN(peak/6,2,8)],['schwinn-ic4',clampN(peak/6,2,8)],['lf-club-treadmill',2],['waterrower-oak',2]]
      : [['lf-club-treadmill',clampN(peak/8,1,6)],['lf-club-elliptical',clampN(peak/10,1,4)],['schwinn-ic4',clampN(peak/8,2,8)],['concept2-rower',clampN(peak/8,1,6)]];
    gpFill(z,order);
  }

  // Functional zone — GHD, kettlebell rack-fill, suspension, bands.
  if(split.functional>0){
    const z=mkZone('functional');
    gpFill(z,[
      ['rogue-ghd',box||club?2:1],
      ['kbkings-powder',clampN(peak/2,6,24)],
      ['trx-pro4',clampN(peak/6,2,8)],
      ['rogue-bands',clampN(peak/4,4,12)],
      ...(studio?[['manduka-pro',clampN(peak,10,30)]]:[]),
    ]);
  }

  // Flooring — need-driven: cover ~65% of the floor plate, bundles first,
  // singles for the remainder, clipped to the zone budget.
  if(split.flooring>0){
    const z=mkZone('flooring');
    const need=Math.round(area*0.65);
    const bundle=GP_BY_ID.get('rogue-mat-bundle'), single=GP_BY_ID.get('rep-floor-mat');
    const bundles=Math.min(Math.floor(need/bundle.coverageSqFt),Math.floor(z.budget/gpPrice(bundle)));
    if(bundles>0) gpAdd(z,'rogue-mat-bundle',bundles);
    const remainder=need-bundles*bundle.coverageSqFt;
    const singles=Math.min(Math.ceil(remainder/single.coverageSqFt),Math.floor((z.budget-z.subtotal)/gpPrice(single)));
    if(singles>0) gpAdd(z,'rep-floor-mat',singles);
    z.coverageSqFt=bundles*bundle.coverageSqFt+singles*single.coverageSqFt;
    z.coverageTarget=need;
  }

  // Accessories — chalk, recovery, ropes in member-count quantities.
  if(split.accessories>0){
    const z=mkZone('accessories');
    gpFill(z,[['frictionlabs-loose',clampN(peak/3,4,12)],['trigger-point-grid',clampN(peak/5,3,10)],['rogue-sr-1c',clampN(peak/5,3,10)]]);
  }

  // Pin the owner's must-have machines into their zones — if that zone is being
  // built and the overall budget still allows (their cost was reserved up
  // front, so there's room). Skips ones already chosen by the heuristics.
  const present=new Set(zones.flatMap(z=>z.items.map(i=>i.id)));
  let running=zones.reduce((s,z)=>s+z.subtotal,0);
  const mustHavePinned=[];
  for(const id of mustHave){
    if(present.has(id)) continue;
    const z=zones.find(x=>x.key===GP_ZONE_OF(id));
    if(!z) continue;                                   // that area isn't being redone
    const price=gpPrice(GP_BY_ID.get(id));
    if(running+price>budget) continue;
    gpAdd(z,id,1); present.add(id); running+=price;
    // A must-have can exceed its zone's soft allocation (it's user-demanded and
    // funded from the reserve) — grow the shown zone budget so it reads sanely.
    z.budget=Math.max(z.budget,z.subtotal);
    mustHavePinned.push(GP_BY_ID.get(id).name);
  }

  const totalPrice=zones.reduce((s,z)=>s+z.subtotal,0);
  const reno=a.projectType==='renovation';
  const MAIN=['strength','machines','cardio','functional','flooring'];
  return {zones:zones.filter(z=>z.items.length),totalPrice,budgetCap:budget,
    areaSqFt:area,peakCapacity:peak,gymType:type,lowCeiling:lowCeil,
    renovatedZones: reno ? MAIN.filter(z=>!keep.has(z)).map(z=>ZONE_LABEL[z]) : [],
    keptZones: reno ? [...keep].map(z=>ZONE_LABEL[z]) : [],
    mustHavePinned,
    contingency:Math.max(0,budget-totalPrice)};
}

// Deterministic written plan — never blank, used when Groq is absent/fails.
function defaultGymCopy(a,plan){
  const reno=a.projectType==='renovation';
  const z=k=>plan.zones.find(x=>x.key===k);
  const lines=[];
  lines.push(`THE SHAPE OF YOUR ${reno?'RENOVATION':'BUILD'}`);
  lines.push(`Across ~${plan.areaSqFt.toLocaleString()} sq ft ${reno?'of renovated floor':'of floor'} with a $${plan.budgetCap.toLocaleString()} budget, this plan allocates $${plan.totalPrice.toLocaleString()} of equipment and keeps $${plan.contingency.toLocaleString()} back for delivery, install and first repairs — real facilities should hold 10-15% for exactly that.`);
  if(reno&&plan.renovatedZones&&plan.renovatedZones.length) lines.push(`You're redoing the ${plan.renovatedZones.join(', ')} — everything else stays put, so the whole budget lands on those areas.${plan.keptZones&&plan.keptZones.length?` Kept as-is: ${plan.keptZones.join(', ')}.`:''}`);
  if(plan.mustHavePinned&&plan.mustHavePinned.length) lines.push(`Your must-have picks are locked in: ${plan.mustHavePinned.join(', ')}. The rest of the plan is built around them.`);
  if(z('strength')) lines.push(`Anchor the room with the strength zone: ${z('strength').items[0].qty}× ${z('strength').items[0].name} along a wall, bars and bumpers racked between stations so plates never cross walkways.`);
  if(z('cardio')) lines.push(`Cardio sits at the front by natural light where possible; leave 3 ft between units and a 6 ft walkway behind treadmill-class machines.`);
  if(z('machines')) lines.push(`The machine row runs the opposite wall from free weights — beginners get a clear lane that never crosses the barbell area.`);
  if(z('flooring')) lines.push(`Flooring covers ~${(z('flooring').coverageSqFt||0).toLocaleString()} of the ~${(z('flooring').coverageTarget||0).toLocaleString()} sq ft target; floor the strength and functional zones first, cardio row last.`);
  if(plan.lowCeiling) lines.push(`Your ceiling is under 9 ft: the plan specs 80-inch uprights, and you should skip wall balls, jump-rope stations and overhead-press platforms near beams.`);
  lines.push(`BUYING ORDER: flooring first (everything sits on it), racks and bars second, cardio third, machines last — they have the longest lead times (5-7 weeks on commercial pieces).`);
  return lines.join('\n\n');
}

// Groq writes ONLY the prose plan around the already-chosen equipment.
async function groqGymPlan(a,plan){
  const key=process.env.GROQ_API_KEY;
  if(!key) return null;
  const summary=plan.zones.map(z=>
    `${z.label} ($${z.subtotal.toLocaleString()}): ${z.items.map(i=>`${i.qty}x ${i.name} (${i.brand})`).join(', ')}`
  ).join('\n');
  const sys=`You are a gym facility planner. Return strict JSON {"plan": string}. The plan is 4 short sections with UPPERCASE headers on their own lines: LAYOUT, BUYING ORDER, WHY THIS GEAR, WATCH OUT. Max 320 words total, plain text (no markdown symbols, no dashes as bullets — write sentences). Ground every claim in the provided equipment list and numbers; never invent products, prices or brands not listed.`;
  const renoBits=a.projectType==='renovation'
    ? ` This is a RENOVATION: the owner is redoing ${(plan.renovatedZones||[]).join(', ')||'selected areas'} and keeping ${(plan.keptZones||[]).join(', ')||'the rest'} as-is (so the whole budget lands on the redone areas — do not spec or re-plan the kept areas).${Array.isArray(a.renoScope)&&a.renoScope.length?` Drivers: ${a.renoScope.join(', ')}.`:''} The floor area given is the RENOVATED section, not the whole building.`
    : '';
  const mustBits=plan.mustHavePinned&&plan.mustHavePinned.length
    ? ` The owner specifically requested these machines and they ARE in the plan — call them out as chosen on purpose: ${plan.mustHavePinned.join(', ')}.`
    : '';
  const user=`Project: ${a.projectType==='renovation'?'renovation of an existing facility':'brand-new gym build'}. Facility type: ${a.gymType}. Floor area: ~${plan.areaSqFt} sq ft. Peak concurrent members: ~${plan.peakCapacity}.${renoBits}${mustBits}${plan.lowCeiling?' Ceiling is UNDER 9 FT — mention low-ceiling constraints (80-inch uprights are specced; no overhead wall-ball or jump-rope zones).':''} Equipment budget: $${plan.budgetCap.toLocaleString()} (plan spends $${plan.totalPrice.toLocaleString()}, leaving $${plan.contingency.toLocaleString()} contingency).\n\nZones and equipment:\n${summary}`;
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',temperature:0.6,
      response_format:{type:'json_object'},
      messages:[{role:'system',content:sys},{role:'user',content:user}]}),
  });
  if(!r.ok) throw new Error(`Groq ${r.status}`);
  const parsed=JSON.parse((await r.json()).choices[0].message.content);
  return typeof parsed.plan==='string'&&parsed.plan.trim()?parsed.plan.trim().slice(0,2400):null;
}

app.post('/api/gym-plan',async(req,res)=>{
  const a=req.body||{};
  // Renovation sizes each area with zoneSizes, so a single `space` isn't sent.
  const hasSize=a.space||(a.zoneSizes&&typeof a.zoneSizes==='object'&&Object.values(a.zoneSizes).some(v=>Number(v)>0));
  if(!a.gymType||!a.budget||!hasSize)
    return res.status(400).json({error:'Send at least gymType, budget and a size (space or zoneSizes).'});
  const plan=buildGymPlan(a);
  let writtenPlan='',generatedBy='fallback';
  try{
    const w=await groqGymPlan(a,plan);
    if(w){writtenPlan=w;generatedBy='groq';}
  }catch(err){
    console.warn('Groq gym plan failed, using default copy:',err.message);
  }
  if(!writtenPlan) writtenPlan=defaultGymCopy(a,plan);
  res.json({...plan,writtenPlan,generatedBy,generatedAt:new Date().toISOString()});
});

app.use((req,res)=>res.status(404).json({error:'Not found'}));

// JSON error handler — without this, a malformed JSON body falls through to
// Express's default handler, which answers in HTML (with a stack trace unless
// NODE_ENV=production). Never echo err.message to the client.
app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  const status=err.status||err.statusCode||500;
  if(status>=500)console.error('Unhandled error:',err.message);
  res.status(status).json({error:status<500?'Bad request.':'Server error.'});
});

app.listen(PORT,()=>{
  const total=Object.values(PRODUCTS).reduce((s,p)=>s+p.length,0);
  console.log(`✅ GymGear backend on port ${PORT}`);
  console.log(`📦 ${Object.keys(PRODUCTS).length} categories, ${total} products`);
  console.log(`🔒 Allowed: ${ALLOWED_ORIGINS.join(', ')}`);
});