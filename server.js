// GymGear Compare Pro  --  Complete Sample Server v6
// All 20 categories. Discount fields. bestChoice flags. No API calls.

import express from 'express';
const app = express();
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
  'rep-bands':          'https://repfitness.com/cdn/shop/products/Shopify-Pull-Up-Bands-Orange-Thumbnail_296715cf-6824-417b-9e5e-68a2e2e6cb32.jpg?v=1653334713',
  'peloton-bike':       'https://images.ctfassets.net/7vk8puwnesgc/2xURCMwD091uJI4uqrh3UN/755365da4bcac7fff2bc5102f5976530/Metadata-Bike_.jpg',
  'nike-club-hoodie':   'https://static.nike.com/a/images/t_default/94f6d19b-8ab6-41da-8dd2-d9b718abfaea/M+NSW+CLUB+HOODIE+PO+BB.png',
  'transparent-stim':   'https://www.transparentlabs.com/cdn/shop/files/TL-127_BULK_BLK_30_BC_1_5.png?v=1769104751',
  'transparent-creatine':'https://www.transparentlabs.com/cdn/shop/files/TL_CreatineHMB_30S_U_1_2.png?v=1745537479',
  'transparent-fat':    'https://www.transparentlabs.com/cdn/shop/files/TL_BodyRecomp_120C.png?v=1745870881',
  'gorilla-mind':       'https://gorillamind.com/cdn/shop/files/GM_HERO_Mode_RainbowSherbet_working_020626_1.png?v=1772215014',
  'gorilla-mind-smooth':'https://gorillamind.com/cdn/shop/files/GM_HERO_Nitric_RainbowSherbet_working_020626_1.png?v=1772215029',
  'momentous-creatine': 'https://www.livemomentous.com/cdn/shop/files/V3_Creatine-90_2000x2000_FEB142025_CC_4.png?v=1755187968&width=800',
  'momentous-omega3':   'https://www.livemomentous.com/cdn/shop/files/Omega3_HERO_Jar.png?v=1776803640&width=800',
  'momentous-recovery': 'https://www.livemomentous.com/cdn/shop/files/Recovery_HERO-Chocolate.png?v=1778013999&width=800',
  'alani-pre':          'https://www.alaninu.com/cdn/shop/files/preworkout_30serve_CosmicStardust_0002_web_600x.png?v=1687464332',

  'rogue-adj-bench':    'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Benches/Adjustable%20Benches/AB2/AB2-H_dh1qbv.png',
  'hydrow-wave':        'https://hydrow.com/cdn/shop/files/hydrow-wave-rower-studio-hero.jpg',
  'nuobell-adj':        'https://m.media-amazon.com/images/I/61X5qkMJoUL._AC_SL1500_.jpg',
  'kaged-elite':        'https://www.kaged.com/cdn/shop/files/pre-kaged-elite-main.jpg',
  'raw-thavage':        'https://getrawnutrition.com/cdn/shop/products/thavage-main.jpg',
  // Benches
  'titan-ab':           'https://cdn.shopify.com/s/files/1/0998/2706/products/adjustable-bench-v2-back-angle.jpg?v=1620753600',
  'bells-bench':        'https://www.bellsofsteel.com/wp-content/uploads/2021/09/BSF-FB-1.jpg',
  'archon-bench':       'https://archonfitness.com/cdn/shop/products/competition-flat-bench-thumbnail.jpg?v=1640000000',

  // Barbells
  'eleiko-iwf':         'https://eleiko.com/cdn/shop/products/3000444-eleiko-iwf-weightlifting-training-bar-men_1_800x.jpg',
  'american-ss':        'https://www.americanbarbell.com/cdn/shop/products/stainless-steel-bar-1_800x.jpg',
  'titan-olympic':      'https://cdn.shopify.com/s/files/1/0998/2706/products/Olympic-barbell-v3_800x.jpg',
  'fringe-wonder':      'https://cdn.shopify.com/s/files/1/0481/2845/files/wonder-bar-v2-main_800x.jpg',
  'vulcan-pro':         'https://www.vulcanstrength.com/cdn/shop/products/pro-olympic-training-bar_800x.jpg',
  'rep-equalizer':      'https://repfitness.com/cdn/shop/products/EZ-Curl-Bar-Thumbnail.jpg?v=1620000000',

  // Dumbbells
  'rep-hex':            'https://repfitness.com/cdn/shop/products/Shopify-Rubber-Hex-Thumbnail_800x.jpg?v=1620000000',
  'bowflex-552':        'https://www.bowflex.com/dw/image/v2/BDBG_PRD/on/demandware.static/-/Sites-nautilus-master/default/dw4a6b9a3b/images/bowflex/products/dumbbells/selecttech/552/BFX_SelectTech552_PDP_Hero.jpg?sw=800',
  'ironmaster-ql':      'https://www.ironmaster.com/cdn/shop/products/quick-lock-dumbbells-main_800x.jpg',
  'fringe-urethane':    'https://cdn.shopify.com/s/files/1/0481/2845/products/urethane-round-dumbbells_800x.jpg',
  'vulcan-db':          'https://www.vulcanstrength.com/cdn/shop/products/vulcan-urethane-dumbbells_800x.jpg',
  'titan-adj':          'https://cdn.shopify.com/s/files/1/0998/2706/products/adjustable-dumbbell-set_800x.jpg',
  'cap-hex':            'https://m.media-amazon.com/images/I/71N0KuXCVIL._AC_SL1500_.jpg',

  // Plates
  'rep-comp':           'https://repfitness.com/cdn/shop/products/Competition-Bumper-Plates-Thumbnail_800x.jpg?v=1620000000',
  'vulcan-alpha':       'https://www.vulcanstrength.com/cdn/shop/products/vulcan-alpha-bumper-plates_800x.jpg',
  'rep-color':          'https://repfitness.com/cdn/shop/products/Color-Bumper-Plates-Thumbnail_800x.jpg?v=1620000000',
  'titan-bumper':       'https://cdn.shopify.com/s/files/1/0998/2706/products/bumper-plates-v3_800x.jpg',
  'cap-iron':           'https://m.media-amazon.com/images/I/71v1S7BZnpL._AC_SL1500_.jpg',

  // Racks
  'rogue-rm6':          'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Power%20Racks%20and%20Rigs/Monster%20Series/RM6/RM6-H_v7l1hq.png',
  'rogue-r3':           'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Power%20Racks%20and%20Rigs/R-Series/R3/R3-H_jm3cmu.png',
  'rep-pr5000':         'https://repfitness.com/cdn/shop/products/PR-5000-Thumbnail_800x.jpg?v=1620000000',
  'titan-x3':           'https://cdn.shopify.com/s/files/1/0998/2706/products/X-3-Power-Rack_800x.jpg',
  'rep-hr100':          'https://repfitness.com/cdn/shop/products/HR-100-Half-Rack-Thumbnail_800x.jpg?v=1620000000',
  'bells-squat':        'https://www.bellsofsteel.com/wp-content/uploads/2020/09/squat-stand-2-0-thumb.jpg',
  'rogue-squat':        'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Strength%20Equipment/Strength%20Training/Power%20Racks%20and%20Rigs/Squat%20Stands/SQ-1/SQ1-H_d5sj6v.png',
  'titan-t2':           'https://cdn.shopify.com/s/files/1/0998/2706/products/T-2-Short-Power-Rack_800x.jpg',

  // Cardio
  'concept2-rower':     'https://www.concept2.com/files/images/products/rowing/rowerg/product/rowerg-sport-black-legs-side-view.jpg',
  'assault-bike':       'https://www.assaultfitness.com/cdn/shop/products/assaultbike-classic-main_800x.jpg',
  'concept2-ski':       'https://www.concept2.com/files/images/products/skiing/skierg/product/skierg-floor-stand-black.jpg',
  'nordictrack-1750':   'https://www.nordictrack.com/content/dam/nordictrack/images/treadmills/nordictrack-commercial-1750-treadmill-hero.jpg',
  'assault-runner':     'https://www.assaultfitness.com/cdn/shop/products/assaultrunner-pro-main_800x.jpg',
  'concept2-bikeerg':   'https://www.concept2.com/files/images/products/biking/bikeerg/product/bikeerg-side-view.jpg',

  // Kettlebells
  'rep-kb':             'https://repfitness.com/cdn/shop/products/Cast-Iron-Kettlebell-Thumbnail_800x.jpg?v=1620000000',
  'onnit-kb':           'https://www.onnit.com/cdn/shop/products/primal-bell-gorilla-main_800x.jpg',
  'dragon-door-kb':     'https://www.dragondoor.com/cdn/shop/products/p10-rkc-kettlebell_800x.jpg',
  'titan-kb':           'https://cdn.shopify.com/s/files/1/0998/2706/products/cast-iron-kettlebell_800x.jpg',
  'vulcan-kb':          'https://www.vulcanstrength.com/cdn/shop/products/vulcan-elite-kettlebell_800x.jpg',
  'cap-kb':             'https://m.media-amazon.com/images/I/71PL1OQYWTL._AC_SL1500_.jpg',
  'yes4all-kb':         'https://m.media-amazon.com/images/I/71LN7V8vYrL._AC_SL1500_.jpg',

  // Bands
  'elitefts-bands':     'https://www.elitefts.com/cdn/shop/products/pro-bands-set_800x.jpg',
  'wodfitters-bands':   'https://m.media-amazon.com/images/I/81cRcj3pj5L._AC_SL1500_.jpg',
  'fit-simplify-bands': 'https://m.media-amazon.com/images/I/71q7QL8MfZL._AC_SL1500_.jpg',
  'ironbull-bands':     'https://m.media-amazon.com/images/I/81n33MVhgIL._AC_SL1500_.jpg',
  'perform-better-mini':'https://www.performbetter.com/cdn/shop/products/mini-bands-set_800x.jpg',
  'amazon-bands':       'https://m.media-amazon.com/images/I/71bS4aS+FGL._AC_SL1500_.jpg',

  // Clothing  --  Shorts
  'youngla-shorts':     'https://youngla.com/cdn/shop/products/215-gotta-go-shorts-main_800x.jpg',
  'gymshark-arrival':   'https://cdn.gymshark.com/images/v2/products/arrival-5-shorts-black.jpg',
  'nobull-shorts':      'https://www.nobullproject.com/cdn/shop/products/mens-training-short-main_800x.jpg',
  'alphalete-shorts':   'https://alphalete.com/cdn/shop/products/amplify-shorts-main_800x.jpg',
  'lululemon-shorts':   'https://images.lululemon.com/is/image/lululemon/LM1BGCS_032334_1',
  'nike-dri-fit':       'https://static.nike.com/a/images/t_default/training-shorts-main.jpg',
  'adidas-shorts':      'https://assets.adidas.com/images/w_600/techfit-shorts-main.jpg',
  'better-bodies-shorts':'https://www.better-bodies.com/cdn/shop/products/mesh-training-shorts_800x.jpg',

  // Compression
  'gymshark-vital':     'https://cdn.gymshark.com/images/v2/products/vital-seamless-leggings-black.jpg',
  'lululemon-align':    'https://images.lululemon.com/is/image/lululemon/LW5CJAS_032343_1',
  'alphalete-surge':    'https://alphalete.com/cdn/shop/products/surge-leggings-main_800x.jpg',
  'youngla-joggers':    'https://youngla.com/cdn/shop/products/tapered-joggers-101-main_800x.jpg',
  'nike-pro':           'https://static.nike.com/a/images/t_default/womens-nike-pro-leggings.jpg',
  'under-armour-leggings':'https://underarmour.scene7.com/is/image/Underarmour/V5-1373838-001_FC?rp=standard-0pad|pdpMainDesktop&scl=1&fmt=jpg&qlt=85&resMode=sharp2&cache=on,on&bgcolor=F0F0F0&wid=566',
  'better-bodies-tights':'https://www.better-bodies.com/cdn/shop/products/pro-tights-main_800x.jpg',
  'gasp-tights':        'https://www.gaspofficial.com/cdn/shop/products/pro-tight-main_800x.jpg',

  // Tanks
  'youngla-tank':       'https://youngla.com/cdn/shop/products/sleeveless-tank-303-main_800x.jpg',
  'gymshark-tank':      'https://cdn.gymshark.com/images/v2/products/training-tank-black.jpg',
  'gasp-stringer':      'https://www.gaspofficial.com/cdn/shop/products/stringer-tank-main_800x.jpg',
  'better-bodies-tank': 'https://www.better-bodies.com/cdn/shop/products/ribbed-tank-main_800x.jpg',
  'alphalete-tank':     'https://alphalete.com/cdn/shop/products/athletic-tank-main_800x.jpg',
  'nike-dri-fit-tank':  'https://static.nike.com/a/images/t_default/mens-dri-fit-tank.jpg',
  'under-armour-tank':  'https://underarmour.scene7.com/is/image/Underarmour/V5-1361518-001_FC?rp=standard-0pad|pdpMainDesktop&scl=1&fmt=jpg&qlt=85',
  'nobull-tank':        'https://www.nobullproject.com/cdn/shop/products/performance-tank-main_800x.jpg',

  // Hoodies
  'youngla-hoodie':     'https://youngla.com/cdn/shop/products/oversized-hoodie-549-main_800x.jpg',
  'gymshark-critical':  'https://cdn.gymshark.com/images/v2/products/critical-hoodie-black.jpg',
  'alphalete-hoodie':   'https://alphalete.com/cdn/shop/products/premium-hoodie-main_800x.jpg',
  'adidas-essentials':  'https://assets.adidas.com/images/w_600/essentials-fleece-hoodie-main.jpg',
  'better-bodies-hoodie':'https://www.better-bodies.com/cdn/shop/products/athlete-hoodie-main_800x.jpg',
  'gasp-hoodie':        'https://www.gaspofficial.com/cdn/shop/products/thermal-hood-main_800x.jpg',
  'lululemon-scuba':    'https://images.lululemon.com/is/image/lululemon/LW4DRFS_064847_1',

  // Footwear
  'nobull-trainer':     'https://www.nobullproject.com/cdn/shop/products/mens-trainer-plus-main_800x.jpg',
  'nike-metcon-9':      'https://static.nike.com/a/images/t_default/metcon-9-training-shoes-main.jpg',
  'adidas-adipower':    'https://assets.adidas.com/images/w_600/adipower-weightlifting-shoe-main.jpg',
  'reebok-nano':        'https://assets.reebok.com/images/w_600/nano-x4-training-shoes-main.jpg',
  'converse-chuck':     'https://www.converse.com/dw/image/v2/BCZC_PRD/on/demandware.static/-/Sites-cnv-master-catalog/default/chuck-taylor-all-star-main.jpg',
  'inov8-bare':         'https://www.inov-8.com/cdn/shop/products/bare-xf-v3-main_800x.jpg',
  'new-balance-minimus':'https://nb.scene7.com/is/image/NB/WTMINTR_REF_SL_I?$pdpflexf2$',
  'nobull-lifter':      'https://www.nobullproject.com/cdn/shop/products/mens-lifter-main_800x.jpg',

  // Sports Bras
  'lululemon-energy':   'https://images.lululemon.com/is/image/lululemon/LW1AHOS_064847_1',
  'gymshark-flex-bra':  'https://cdn.gymshark.com/images/v2/products/flex-sports-bra-black.jpg',
  'nike-indy-bra':      'https://static.nike.com/a/images/t_default/womens-dri-fit-indy-bra.jpg',
  'alphalete-sports-bra':'https://alphalete.com/cdn/shop/products/amplify-sports-bra-main_800x.jpg',
  'ua-infinity-bra':    'https://underarmour.scene7.com/is/image/Underarmour/V5-1376885-001_FC?rp=standard-0pad|pdpMainDesktop&scl=1&fmt=jpg&qlt=85',
  'nobull-sports-bra':  'https://www.nobullproject.com/cdn/shop/products/womens-performance-sports-bra-main_800x.jpg',
  'adidas-bra':         'https://assets.adidas.com/images/w_600/believe-this-sports-bra-main.jpg',
  'youngla-sports-bra': 'https://youngla.com/cdn/shop/products/sports-bra-main_800x.jpg',

  // Supplements  --  Pre-Workout
  'ghost-legend':       'https://ghostlifestyle.com/cdn/shop/products/ghost-legend-pre-workout-main_800x.png',
  'c4-original':        'https://m.media-amazon.com/images/I/71lYAOBRRTL._AC_SL1500_.jpg',
  'legion-pulse':       'https://www.legionathletics.com/cdn/shop/products/pulse-pre-workout-main_800x.png',
  'bucked-up':          'https://buckedup.com/cdn/shop/products/bucked-up-pre-workout-main_800x.png',

  // Protein
  'on-gold-standard':   'https://m.media-amazon.com/images/I/71u8zx0H22L._AC_SL1500_.jpg',
  'transparent-whey':   'https://www.transparentlabs.com/cdn/shop/files/TL_GrassedFed_Whey_V2_1_2.png?v=1745537479',
  'ghost-whey':         'https://ghostlifestyle.com/cdn/shop/products/ghost-whey-protein-main_800x.png',
  'dymatize-iso100':    'https://m.media-amazon.com/images/I/71z5tpB7bEL._AC_SL1500_.jpg',
  'legion-whey':        'https://www.legionathletics.com/cdn/shop/products/whey-plus-protein-main_800x.png',
  'thorne-whey':        'https://www.thorne.com/cdn/shop/products/whey-protein-isolate-main_800x.jpg',
  'nutricost-whey':     'https://m.media-amazon.com/images/I/71bJxGalBUL._AC_SL1500_.jpg',
  'on-casein':          'https://m.media-amazon.com/images/I/71+MZzX1pGL._AC_SL1500_.jpg',

  // Creatine
  'on-creatine':        'https://m.media-amazon.com/images/I/71kN3DcfVHL._AC_SL1500_.jpg',
  'thorne-creatine':    'https://www.thorne.com/cdn/shop/products/creatine-main_800x.jpg',
  'legion-recharge':    'https://www.legionathletics.com/cdn/shop/products/recharge-post-workout-main_800x.png',
  'nutricost-creatine': 'https://m.media-amazon.com/images/I/61SXCF7BWNL._AC_SL1500_.jpg',
  'klean-creatine':     'https://kleanathlete.com/cdn/shop/products/klean-creatine-main_800x.jpg',
  'con-cret-creatine':  'https://m.media-amazon.com/images/I/71rJHrFh7nL._AC_SL1500_.jpg',

  // Recovery
  'transparent-sleep':  'https://www.transparentlabs.com/cdn/shop/files/TL_Sleep_Recovery_V2_1.png?v=1745537479',
  'legion-lunar':       'https://www.legionathletics.com/cdn/shop/products/lunar-sleep-aid-main_800x.png',
  'thorne-amino':       'https://www.thorne.com/cdn/shop/products/amino-complex-main_800x.jpg',
  'on-bcaa':            'https://m.media-amazon.com/images/I/71aUvuBOIAL._AC_SL1500_.jpg',
  'ghost-bcaa':         'https://ghostlifestyle.com/cdn/shop/products/ghost-bcaa-main_800x.png',
  'klean-bcaa':         'https://kleanathlete.com/cdn/shop/products/klean-bcaa-peak-atp-main_800x.jpg',
  'nutricost-glutamine':'https://m.media-amazon.com/images/I/61oEtcl0yQL._AC_SL1500_.jpg',

  // Vitamins
  'thorne-basics':      'https://www.thorne.com/cdn/shop/products/basic-nutrients-2-day-main_800x.jpg',
  'ag1':                'https://www.athleticgreens.com/cdn/shop/products/AG1-canister-main_800x.jpg',
  'legion-triumph':     'https://www.legionathletics.com/cdn/shop/products/triumph-multivitamin-main_800x.png',
  'garden-of-life-mv':  'https://m.media-amazon.com/images/I/71UCH0l2eRL._AC_SL1500_.jpg',
  'opti-men':           'https://m.media-amazon.com/images/I/71lPaAf6wvL._AC_SL1500_.jpg',
  'ritual-men':         'https://www.ritual.com/cdn/shop/products/essential-for-men-main_800x.jpg',
  'klean-mv':           'https://kleanathlete.com/cdn/shop/products/klean-multivitamin-main_800x.jpg',

  // Fat Burners
  'ghost-burn':         'https://ghostlifestyle.com/cdn/shop/products/ghost-burn-main_800x.png',
  'jym-shred':          'https://m.media-amazon.com/images/I/71fNa+dWC3L._AC_SL1500_.jpg',
  'legion-phoenix':     'https://www.legionathletics.com/cdn/shop/products/phoenix-fat-burner-main_800x.png',
  'evl-engn-shred':     'https://m.media-amazon.com/images/I/71-j7fcQDoL._AC_SL1500_.jpg',
  'cellucor-clk':       'https://m.media-amazon.com/images/I/71wf9ZS8OOL._AC_SL1500_.jpg',
  'animal-cuts':        'https://m.media-amazon.com/images/I/71U2YcSVVJL._AC_SL1500_.jpg',
  'mhp-thyro-slim':     'https://m.media-amazon.com/images/I/71oXTdmqr0L._AC_SL1500_.jpg',

  // Gear  --  Belts
  'inzer-forever-belt': 'https://www.inzernet.com/cdn/shop/products/forever-lever-belt-main_800x.jpg',
  'sbd-belt':           'https://www.sbdapparel.com/cdn/shop/products/powerlifting-belt-main_800x.jpg',
  'pioneer-gc-belt':    'https://www.pioneerfitness.net/cdn/shop/products/general-cut-belt-main_800x.jpg',
  'gymreapers-lever-belt':'https://m.media-amazon.com/images/I/71EH3FTBPnL._AC_SL1500_.jpg',
  'schiek-2004-belt':   'https://m.media-amazon.com/images/I/71xqxCv1M8L._AC_SL1500_.jpg',
  'harbinger-foam-belt':'https://m.media-amazon.com/images/I/71Ci3-j3SxL._AC_SL1500_.jpg',
  'element26-belt':     'https://m.media-amazon.com/images/I/71xsO3KTOFL._AC_SL1500_.jpg',
  'dark-iron-belt':     'https://m.media-amazon.com/images/I/71IJSQF8DKL._AC_SL1500_.jpg',
  'bells-lever-belt':   'https://www.bellsofsteel.com/wp-content/uploads/2021/09/lever-belt-10mm-thumb.jpg',

  // Straps
  'versa-gripps-pro':   'https://m.media-amazon.com/images/I/71KWR3vl5sL._AC_SL1500_.jpg',
  'harbinger-padded-straps':'https://m.media-amazon.com/images/I/71pxm4g8lSL._AC_SL1500_.jpg',
  'rogue-lifting-straps':'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Straps/Lifting%20Straps/WL0018/WL0018-H_yoakwd.png',
  'gymreapers-figure8': 'https://m.media-amazon.com/images/I/71ZJa5FJWZL._AC_SL1500_.jpg',
  'schiek-1000ls':      'https://m.media-amazon.com/images/I/71FE0n0E89L._AC_SL1500_.jpg',
  'stoic-straps':       'https://m.media-amazon.com/images/I/71lFcCvxXlL._AC_SL1500_.jpg',
  'ironbull-figure8':   'https://m.media-amazon.com/images/I/71yUl0fHiWL._AC_SL1500_.jpg',
  'dmoose-straps':      'https://m.media-amazon.com/images/I/71L3D0xNt7L._AC_SL1500_.jpg',
  'pioneer-straps':     'https://www.pioneerfitness.net/cdn/shop/products/leather-lifting-straps-main_800x.jpg',
  'serious-steel-straps':'https://m.media-amazon.com/images/I/71bNhJQQ1tL._AC_SL1500_.jpg',

  // Wraps
  'sbd-wrist-wraps':    'https://www.sbdapparel.com/cdn/shop/products/wrist-wraps-main_800x.jpg',
  'rogue-wrist-wraps':  'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Wrist%20Wraps/USA%20Wrist%20Wraps/WL0187/WL0187-H_owlrkc.png',
  'inzer-true-black-wraps':'https://www.inzernet.com/cdn/shop/products/true-black-wrist-wraps-main_800x.jpg',
  'gymreapers-wrist-wraps':'https://m.media-amazon.com/images/I/71djnK9Ot9L._AC_SL1500_.jpg',
  'mark-bell-wraps':    'https://m.media-amazon.com/images/I/71d7hYD-HNL._AC_SL1500_.jpg',
  'schiek-1100tt-wraps':'https://m.media-amazon.com/images/I/71wxhJjI+PL._AC_SL1500_.jpg',
  'iron-bull-wraps':    'https://m.media-amazon.com/images/I/71Wh2jLz3ZL._AC_SL1500_.jpg',
  'stoic-wrist-wraps':  'https://m.media-amazon.com/images/I/71NN0u7MZPL._AC_SL1500_.jpg',
  'harbinger-wraps':    'https://m.media-amazon.com/images/I/71C5l9pXPUL._AC_SL1500_.jpg',
  'wod-nation-wraps':   'https://m.media-amazon.com/images/I/81LXbVPYVaL._AC_SL1500_.jpg',

  // Sleeves
  'sbd-knee-sleeves':   'https://www.sbdapparel.com/cdn/shop/products/knee-sleeves-main_800x.jpg',
  'rehband-rx-sleeves': 'https://m.media-amazon.com/images/I/71Bnf0kQMXL._AC_SL1500_.jpg',
  'stoic-knee-sleeves': 'https://m.media-amazon.com/images/I/71wk0GH7TpL._AC_SL1500_.jpg',
  'rogue-knee-sleeves': 'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_800,b_rgb:ffffff/catalog/Straps%20Wraps%20and%20Support%20/Knee%20Sleeves%20and%20Wraps/5mm%20Knee%20Sleeves/KS0085/KS0085-H_gmdpfl.png',
  'gymreapers-knee-sleeves':'https://m.media-amazon.com/images/I/71EqDrNLXVL._AC_SL1500_.jpg',
  'mark-bell-knee-sleeve':'https://m.media-amazon.com/images/I/71OqPd2NJPL._AC_SL1500_.jpg',
  'bear-komplex-sleeves':'https://m.media-amazon.com/images/I/71hWq5I9tcL._AC_SL1500_.jpg',
  'iron-bull-sleeves':  'https://m.media-amazon.com/images/I/71eVtRHBLXL._AC_SL1500_.jpg',
  'pioneer-knee-sleeves':'https://www.pioneerfitness.net/cdn/shop/products/knee-sleeves-7mm-main_800x.jpg',
  'harbinger-knee-sleeves':'https://m.media-amazon.com/images/I/71tSH9tZ6cL._AC_SL1500_.jpg',

  // Chalk
  'frictionlabs-loose': 'https://frictionlabs.com/cdn/shop/products/unicorn-dust-loose-chalk-main_800x.jpg',
  'frictionlabs-secret-stuff':'https://frictionlabs.com/cdn/shop/products/secret-stuff-liquid-chalk-main_800x.jpg',
  'black-diamond-chalk':'https://m.media-amazon.com/images/I/71VQdOD9YEL._AC_SL1500_.jpg',
  'primo-chalk':        'https://m.media-amazon.com/images/I/71V0xnqdU4L._AC_SL1500_.jpg',
  'tension-chalk':      'https://m.media-amazon.com/images/I/71cJ6s1HQZL._AC_SL1500_.jpg',
  'carbon-black-chalk': 'https://m.media-amazon.com/images/I/71ZxXmfCsqL._AC_SL1500_.jpg',
  'metolius-chalk':     'https://m.media-amazon.com/images/I/71HkWS1tcAL._AC_SL1500_.jpg',
  'spri-chalk-ball':    'https://m.media-amazon.com/images/I/71cDlqHJaRL._AC_SL1500_.jpg',
  'liquid-grip-chalk':  'https://m.media-amazon.com/images/I/71Dv8DRBJSL._AC_SL1500_.jpg',
  'weightlifting-house-chalk':'https://www.weightliftinghouse.com/cdn/shop/products/loose-chalk-1kg-main_800x.jpg',
};

function p(id,name,brand,price,retailer,url,quality,rating,reviewCount,reviewSource,expertVerdict,expertSource,specs,aspects,opts={}){
  const out={id,name,brand,price,retailer,url,affiliateUrl:'',image:IMGS[id]||null,quality,rating,reviewCount,reviewSource,expertVerdict,expertSource,specs,aspects,bestChoice:opts.bestChoice||false};
  if(opts.salePrice){out.salePrice=opts.salePrice;out.discount=Math.round((1-opts.salePrice/price)*100)}
  return out;
}

const PRODUCTS = {

benches:[
  p('rogue-mb2','Monster Utility Bench 2.0','Rogue Fitness',335,'Rogue Fitness','https://www.roguefitness.com/monster-utility-bench-2-0-mg-black',9.4,4.8,104,'Rogue Fitness','The last flat bench you will ever need to buy.','Garage Gym Reviews',{'Capacity':'1,000 lbs','Pad':'Polyurethane','Type':'Flat','Frame':'3×3" 11ga','Made In':'USA'},['American Made','Wheels + Handle','Overbuilt']),
  p('rogue-flat2','Flat Utility Bench 2.0','Rogue Fitness',195,'Rogue Fitness','https://www.roguefitness.com/rogue-flat-utility-bench-2-0',8.8,4.8,635,'Rogue Fitness','Best flat bench for the money, ships fully assembled.','YourWorkoutBook',{'Capacity':'1,000 lbs','Pad':'Polyurethane','Type':'Flat','Weight':'49 lbs','Made In':'USA'},['Ships Assembled','Best Value','American Made']),
  p('rep-fb5000','FB-5000 Competition Bench','Rep Fitness',249,'Rep Fitness','https://repfitness.com/products/fb-5000-competition-flat-bench',9.2,4.9,312,'Rep Fitness','Best flat bench on the market for the money.','Garage Gym Lab',{'Capacity':'1,000 lbs','Pad':'CleanGrip Vinyl','Type':'Flat','IPF Spec':'Yes','Warranty':'10 Years'},['IPF Certified','Tripod Design','Best Value'],{bestChoice:true}),
  p('rep-ab5200','AB-5200 2.0 Adjustable Bench','Rep Fitness',549,'Rep Fitness','https://repfitness.com/products/ab-5200-2-0',9.1,4.8,420,'Rep Fitness','Best adjustable bench  --  11 back positions, 1,000 lb capacity, no wobble.','Garage Gym Lab',{'Capacity':'1,000 lbs','Positions':'11 + Decline','Pad':'CleanGrip Vinyl','Weight':'72 lbs','Warranty':'Lifetime'},['11 Positions','Lifetime Warranty','No Wobble']),
  p('titan-ab','Adjustable Bench V2','Titan Fitness',219,'Titan Fitness','https://www.titanfitness.com/products/adjustable-bench-v2',7.8,4.5,520,'Titan Fitness','Best budget adjustable bench for home gyms.','Garage Gym Reviews',{'Capacity':'600 lbs','Positions':'5','Pad':'Vinyl','Weight':'55 lbs','Made In':'China'},['Budget Pick','5 Positions','Lightweight']),
  p('bells-bench','Utility Bench 2.0','Bells of Steel',329,'Bells of Steel','https://www.bellsofsteel.com/all-products/benches-and-racks/utility-bench/',9.0,4.8,201,'Bells of Steel','Lifetime warranty and grippy pad that rivals Rogue.','Garage Gym Lab',{'Capacity':'1,000 lbs','Pad':'Grippy Vinyl','Type':'Flat','Warranty':'Lifetime','Tripod':'Yes'},['Lifetime Warranty','Tripod Design','Grippy Pad']),
  p('archon-bench','Competition Flat Bench','Archon Fitness',249,'Archon Fitness','https://archonfitness.com/products/flat-bench',8.6,4.7,143,'Archon Fitness','IPF-spec height and solid build under $250.','Barbend',{'Capacity':'1,000 lbs','Pad':'Vinyl','Height':'17"','IPF Spec':'Yes','Type':'Flat'},['IPF Height','Under $250','Tripod']),
  p('rep-ab3000','AB-3000 FID Bench','REP Fitness',329,'REP Fitness','https://repfitness.com/products/ab-3000-fid-bench',9.1,4.8,4200,'Garage Gym Reviews','Best mid-range adjustable bench  --  11 back positions, rock solid, no wobble.',"Garage Gym Reviews",{'Back Positions':'11','Max Weight':'1000 lbs','Width':'12"','Upholstery':'3" Vinyl','Made In':'Taiwan'},['11 Positions','Rock Solid','Best Mid-Range']),
    p('rogue-adj-bench','Adjustable Bench 2.0','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-adjustable-bench-2-0',9.3,4.9,560,'Rogue Fitness','Best adjustable bench from the best brand  --  7 positions, 1,000 lb capacity.','Garage Gym Reviews',{'Capacity':'1,000 lbs','Positions':'7','Pad':'Polyurethane','Weight':'72 lbs','Made In':'USA'},['American Made','7 Positions','Overbuilt']),
  p('rogue-fold','Fold Up Utility Bench','Rogue Fitness',335,'Rogue Fitness','https://www.roguefitness.com/rogue-fold-up-utility-benches',8.5,4.6,78,'Rogue Fitness','Foldable Rogue durability, wall-mountable between sessions.','YourWorkoutBook',{'Capacity':'1,000 lbs','Type':'Foldable','Pad':'Polyurethane','Weight':'48 lbs','Made In':'USA'},['Wall-Mountable','Space Saving','American Made']),
],

barbells:[
  p('rogue-ohio','Ohio Bar','Rogue Fitness',345,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-bar',9.5,4.9,2100,'Rogue Fitness','The best all-around barbell ever made.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28.5mm','PSI':'190,000','Finish':'Options','Made In':'USA'},['American Made','All-Purpose','Gold Standard'],{bestChoice:true}),
  p('rogue-deadlift','Ohio Deadlift Bar','Rogue Fitness',395,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-deadlift-bar',9.6,4.9,870,'Rogue Fitness','Best deadlift bar  --  extra whip, aggressive knurl.','Barbend',{'Weight':'20 kg','Shaft':'27mm','PSI':'190,000','Knurl':'Aggressive','Made In':'USA'},['Deadlift Specific','Extra Whip','Aggressive Knurl']),
  p('rogue-squat-bar','Rogue Squat Bar','Rogue Fitness',625,'Rogue Fitness','https://www.roguefitness.com/rogue-squat-bar',9.7,4.9,480,'Rogue Fitness','The stiffer, thicker bar built specifically for heavy squats.','Garage Gym Reviews',{'Weight':'25 kg','Shaft':'32mm','PSI':'190,000','Knurl':'Center + Dual','Made In':'USA'},['Squat Specific','32mm Shaft','Center Knurl']),
  p('texas-power-bar','The Texas Power Bar','Buddy Capps',299,'Texas Strength Systems','https://www.texasstrengthsystems.com/products/texas-power-bar',9.3,4.9,1100,'Barbend','The powerlifting legend  --  stiff, aggressive knurl, American made since 1980.','Barbend',{'Weight':'20 kg','Shaft':'28.5mm','PSI':'190,000','Knurl':'Aggressive','Made In':'USA'},['Powerlifting Icon','Aggressive Knurl','American Made']),
  p('eleiko-iwf','IWF Weightlifting Bar','Eleiko',999,'Eleiko','https://eleiko.com/products/eleiko-iwf-weightlifting-training-bar',10,5.0,188,'Eleiko','Used at every Olympic Games  --  the absolute best.','Barbend',{'Weight':'20 kg','Shaft':'28mm','Origin':'Sweden','IWF':'Certified','PSI':'215,000'},['Olympic Standard','IWF Certified','Swedish Made']),
  p('rep-alpine-bar','Pyrros Bar','REP Fitness',399,'REP Fitness','https://repfitness.com/products/pyrros-bar',9.1,4.8,620,'Garage Gym Reviews','Best Olympic bar under $400  --  exceptional spin, beautiful finish.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28mm','PSI':'190,000','Finish':'Chrome','Bearings':'Needle'},['Best Under $400','Needle Bearings','Competition Ready']),
  p('american-ss','Stainless Steel Bar','American Barbell',535,'American Barbell','https://www.americanbarbell.com/products/stainless-steel-olympic-bar',9.7,4.9,342,'American Barbell','Finest stainless steel barbell  --  rust-proof, heirloom quality.','Garage Gym Lab',{'Weight':'20 kg','Shaft':'Stainless','Diameter':'28.5mm','PSI':'205,000','Made In':'USA'},['Stainless Steel','Rust Proof','Heirloom Quality']),
  p('titan-olympic','Olympic Barbell','Titan Fitness',199,'Titan Fitness','https://www.titanfitness.com/products/olympic-barbell',7.8,4.5,410,'Titan Fitness','Best budget Olympic bar under $200.','Garage Gym Reviews',{'Weight':'20 kg','Shaft':'28mm','PSI':'150,000','Finish':'Black Oxide','Warranty':'1 Year'},['Budget Pick','Good Whip','Entry Level'],{salePrice:169}),
  p('fringe-wonder','Wonder Bar V2','Fringe Sport',249,'Fringe Sport','https://www.fringesport.com/products/wonder-bar-v2',8.4,4.6,520,'Fringe Sport','Best mid-range bar with 10-year warranty.','Barbend',{'Weight':'20 kg','Diameter':'28.5mm','PSI':'190,000','Finish':'Cerakote','Warranty':'10 Years'},['10 Year Warranty','Cerakote Finish','Mid-Range']),
  p('vulcan-pro','Pro Olympic Bar','Vulcan Strength',295,'Vulcan Strength','https://www.vulcanstrength.com/products/vulcan-pro-olympic-training-bar',9.0,4.8,275,'Vulcan Strength','Underrated  --  195k PSI, lifetime warranty, great spin.','Garage Gym Reviews',{'Weight':'20 kg','Diameter':'28mm','PSI':'195,000','Finish':'Black Oxide','Warranty':'Lifetime'},['Lifetime Warranty','Underrated','195k PSI']),
  p('rep-equalizer','EZ Curl Bar','Rep Fitness',119,'Rep Fitness','https://repfitness.com/products/equalizer-ez-curl-bar',8.2,4.6,284,'Rep Fitness','Best-value EZ curl bar for home gyms.','Garage Gym Reviews',{'Weight':'18 lbs','Length':'47"','Sleeve':'2" Olympic','Knurl':'Medium','PSI':'150,000'},['EZ Curl','Wrist Friendly','Best Value']),
  p('bells-power-bar','Powerlifting Bar 2.0','Bells of Steel',299,'Bells of Steel','https://www.bellsofsteel.com/all-products/barbells/powerlifting-bar-2-0/',9.2,4.9,1800,'Bells of Steel','Best Rogue alternative  --  Canadian made, aggressive knurl, great for powerlifting.',"Garage Gym Reviews",{'Weight':'20 kg','Shaft':'29mm','PSI':'190,000','Knurl':'Aggressive','Made In':'Canada'},['Canadian Made','Rogue Alternative','190k PSI']),
  p('kabuki-power-bar','Kadillac Bar','Kabuki Strength',549,'Kabuki Strength','https://kabukistrength.com/products/kadillac-bar',9.8,5.0,320,'Garage Gym Reviews','The most versatile powerlifting bar ever made  --  adjustable camber, wrist saver.',"Garage Gym Reviews",{'Weight':'25 kg','Shaft':'32mm','Adjustable Camber':'Yes','PSI':'210,000','Made In':'USA'},['Adjustable Camber','Most Versatile','Ultra Premium']),
  p('cap-ob86b','OB-86B Olympic Bar','CAP Barbell',109,'Amazon','https://www.amazon.com/dp/B00JP6LKRY?tag=gymgearcompar-20',6.8,4.2,18000,'Amazon','The most affordable Olympic bar  --  fine for beginners, not for heavy loads.','Barbend',{'Weight':'44 lbs','Shaft':'28mm','PSI':'98,000','Finish':'Chrome','Warranty':'1 Year'},['Budget Entry','Widely Available','Beginner Friendly']),
],

dumbbells:[
  p('rogue-hex','Rubber Hex Dumbbells','Rogue Fitness',475,'Rogue Fitness','https://www.roguefitness.com/rogue-rubber-hex-dumbbells',9.2,4.9,890,'Rogue Fitness','Best rubber hex dumbbells  --  will last decades.','Garage Gym Reviews',{'Handle':'Chrome','Head':'Rubber Hex','Range':'5–100 lbs','Floor Safe':'Yes','Made In':'USA'},['American Made','Chrome Handles','Floor Safe'],{bestChoice:true}),
  p('rep-hex','Rubber Hex Dumbbells','Rep Fitness',295,'Rep Fitness','https://repfitness.com/products/rubber-hex-dumbbells',8.7,4.7,620,'Rep Fitness','Best value rubber hex  --  hard to tell apart from Rogue.','Garage Gym Lab',{'Handle':'Chrome','Head':'Rubber Hex','Range':'5–100 lbs','Floor Safe':'Yes','Warranty':'2 Years'},['Best Value','Chrome Handles','Floor Safe']),
    p('nuobell-adj','NüoBell 80lb Adjustable Dumbbell','Core Health & Fitness',349,'Amazon','https://www.amazon.com/dp/B097TV3GHK?tag=gymgearcompar-20',9.0,4.7,3200,'Wirecutter','Smoothest adjustable dumbbell  --  round shape feels just like a fixed dumbbell.','Wirecutter',{'Range':'5–80 lbs','Increments':'5 lbs','Shape':'Round','System':'Twist Select','Feels Like':'Fixed DB'},['Round Shape','5 lb Increments','Feels Natural']),
  p('bowflex-552','SelectTech 552 Adjustable','Bowflex',449,'Amazon','https://www.amazon.com/dp/B001ARYU58?tag=gymgearcompar-20',8.0,4.7,22500,'Amazon','Best adjustable dumbbell  --  replaces 15 sets.','Wirecutter',{'Range':'5–52.5 lbs','Increments':'2.5 lbs','System':'Dial Select','Replaces':'15 pairs','Warranty':'2 Years'},['Space Saving','15-in-1','Dial System'],{salePrice:399}),
  p('ironmaster-ql','Quick-Lock Adjustable DB','Ironmaster',649,'Ironmaster','https://www.ironmaster.com/products/quick-lock-adjustable-dumbbells/',9.0,4.8,340,'Ironmaster','Most durable adjustable dumbbell  --  solid steel, never wobbles.','Barbend',{'Range':'5–75 lbs','System':'Screw Lock','Material':'Steel','Expandable':'Yes','Warranty':'Lifetime'},['Solid Steel','Lifetime Warranty','Heavy Duty']),
  p('fringe-urethane','Urethane Dumbbells','Fringe Sport',380,'Fringe Sport','https://www.fringesport.com/products/urethane-round-dumbbells',8.9,4.8,180,'Fringe Sport','Best urethane dumbbell  --  odorless and floor-safe.','Garage Gym Lab',{'Handle':'Chrome','Head':'Urethane Round','Floor Safe':'Yes','Odor':'None','Grade':'Commercial'},['Urethane','Odorless','Commercial Grade']),
  p('vulcan-db','Urethane Hex Dumbbells','Vulcan Strength',320,'Vulcan Strength','https://www.vulcanstrength.com/products/vulcan-urethane-dumbbells',9.0,4.8,142,'Vulcan Strength','Commercial quality urethane at competitive home gym price.','Barbend',{'Handle':'Chrome','Head':'Urethane Hex','Floor Safe':'Yes','Warranty':'2 Years','Grade':'Commercial'},['Commercial Grade','Urethane','Precise Weight']),
  p('titan-adj','Adjustable Dumbbell Set','Titan Fitness',349,'Titan Fitness','https://www.titanfitness.com/products/adjustable-dumbbell-set',7.6,4.4,265,'Titan Fitness','Best budget adjustable dumbbell set.','Garage Gym Reviews',{'Range':'5–50 lbs','System':'Pin Select','Material':'Steel + Rubber','Increments':'5 lbs','Warranty':'1 Year'},['Budget Pick','Pin System','Good Value']),
  p('cap-hex','Rubber Coated Hex DB','CAP Barbell',89,'Amazon','https://www.amazon.com/dp/B07D4DJ6M8?tag=gymgearcompar-20',6.0,4.3,14200,'Amazon','Cheapest entry-level option  --  fine for casual use.','Barbend',{'Handle':'Knurled Steel','Head':'Rubber Hex','Range':'3–50 lbs','Ships':'Prime','Smell':'Initially'},['Lowest Price','Amazon Prime','Entry Level']),
],

plates:[
  p('rogue-hg2','HG 2.0 Bumper Plates','Rogue Fitness',295,'Rogue Fitness','https://www.roguefitness.com/rogue-hg-2-0-bumper-plates',9.1,4.8,220,'Rogue Fitness','Top-tier IWF-spec bumper with dead bounce and color coding.','Garage Gym Reviews',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'Yes','IWF Spec':'Yes'},['IWF Certified','Low Bounce','Color Coded'],{bestChoice:true}),
  p('rep-black','Black Bumper Plates','Rep Fitness',215,'Rep Fitness','https://repfitness.com/products/black-bumper-plates',8.5,4.7,410,'Rep Fitness','Best-in-class value  --  dead bounce rivals Eleiko.','GarageGymProducts',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','Hardness':'90A','Bounce':'Dead'},['Best Value','Dead Bounce','Virgin Rubber']),
  p('rep-comp','Competition Bumper Plates','Rep Fitness',385,'Rep Fitness','https://repfitness.com/products/competition-bumper-plates',9.3,4.8,178,'Rep Fitness','Best value competition bumpers, tested to 30,000 drops.','As Many Reviews As Possible',{'Material':'Virgin Rubber','Set':'160 lbs','Diameter':'17.7"','IWF Spec':'Yes','Drop Tested':'30,000+'},['Competition Grade','30k Drop Test','IWF Certified']),
  p('rogue-echo','Echo Bumper Plates','Rogue Fitness',195,'Rogue Fitness','https://www.roguefitness.com/rogue-echo-bumper-plates',8.0,4.6,380,'Rogue Fitness','Rogue entry-level bumper  --  recycled rubber, still quality.','Barbend',{'Material':'Recycled Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'No','Bounce':'Low'},['Budget Rogue','Recycled Rubber','Durable'],{salePrice:165}),
  p('vulcan-alpha','Alpha Bumper Plates','Vulcan Strength',249,'Vulcan Strength','https://www.vulcanstrength.com/products/vulcan-alpha-bumper-plates',8.7,4.7,165,'Vulcan Strength','High durometer rubber  --  deadest bounce on the market.','Garage Gym Reviews',{'Material':'High Durometer Rubber','Diameter':'17.7"','Tolerance':'±1%','Bounce':'Very Low','Color Coded':'No'},['Deadest Bounce','±1% Tolerance','Premium Rubber']),
  p('rep-color','Color Bumper Plates','Rep Fitness',335,'Rep Fitness','https://repfitness.com/products/color-bumper-plates',8.8,4.7,203,'Rep Fitness','Same rubber as Black Bumpers with IWF color coding.','Fit at Midlife',{'Material':'Virgin Rubber','Set':'160 lbs','IWF Spec':'Yes','Color Coded':'Yes','Bounce':'Low'},['Color Coded','IWF Compliant','Virgin Rubber']),
  p('titan-bumper','Bumper Plates V3','Titan Fitness',159,'Titan Fitness','https://www.titanfitness.com/products/bumper-plates',7.5,4.4,290,'Titan Fitness','Cheapest reputable bumper plate  --  good for beginners.','Garage Gym Reviews',{'Material':'Recycled Rubber','Set':'160 lbs','Diameter':'17.7"','Color Coded':'No','Warranty':'1 Year'},['Lowest Price','Beginner Friendly','Ships Fast']),
  p('cap-iron','Cast Iron Olympic Plates','CAP Barbell',89,'Amazon','https://www.amazon.com/dp/B0000ATDSQ?tag=gymgearcompar-20',6.0,4.2,8400,'Amazon','Budget cast iron  --  fine for casual lifting, expect variance.','Barbend',{'Material':'Cast Iron','Standard':'2" Olympic','Color Coded':'No','Ships':'Prime','Warranty':'1 Year'},['Lowest Price','Amazon Prime','Ships Fast']),
],

racks:[
  p('rogue-rm6','RM-6 Monster Rack','Rogue Fitness',1595,'Rogue Fitness','https://www.roguefitness.com/rogue-rm-6-monster-rack',9.8,4.9,310,'Rogue Fitness','The gold standard power rack  --  built for life.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'90"','Weight':'375 lbs','Hole Spacing':'1"','Made In':'USA'},['American Made','Monster Series','Lifetime Warranty'],{bestChoice:true}),
  p('rogue-r3','R-3 Power Rack','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-r-3-power-rack',9.2,4.9,870,'Rogue Fitness','Best mid-range power rack  --  strong, customizable, American-made.','Garage Gym Lab',{'Frame':'2×3" 11ga','Uprights':'90"','Weight':'183 lbs','Hole Spacing':'1"','Made In':'USA'},['American Made','Best Mid-Range','Customizable']),
  p('rep-pr5000','PR-5000 Power Rack','Rep Fitness',695,'Rep Fitness','https://repfitness.com/products/pr-5000-power-rack',9.1,4.8,445,'Rep Fitness','Best value full power rack  --  1" hole spacing, huge ecosystem.','Garage Gym Lab',{'Frame':'3×3" 11ga','Uprights':'90"','Hole Spacing':'1"','Weight':'270 lbs','Warranty':'Lifetime'},['Best Value','1" Spacing','Huge Ecosystem'],{salePrice:595}),
  p('titan-x3','X-3 Power Rack','Titan Fitness',795,'Titan Fitness','https://www.titanfitness.com/products/x-3-flat-foot-power-rack',8.2,4.6,920,'Titan Fitness','Best budget power rack  --  incredibly popular for home gyms.','Garage Gym Reviews',{'Frame':'3×3" 11ga','Uprights':'82"','Hole Spacing':'5/8"','Weight':'215 lbs','Warranty':'10 Year'},['Budget Pick','Most Popular','3×3 Frame']),
  p('rep-hr100','HR-100 Half Rack','Rep Fitness',395,'Rep Fitness','https://repfitness.com/products/hr-100-half-rack',8.5,4.7,280,'Rep Fitness','Best half rack for space-limited gyms.','Barbend',{'Frame':'2×3" 11ga','Height':'83"','Hole Spacing':'2"','Weight':'155 lbs','Warranty':'Lifetime'},['Space Saving','Half Rack','Best Value']),
  p('bells-squat','Squat Stand 2.0','Bells of Steel',449,'Bells of Steel','https://www.bellsofsteel.com/all-products/benches-and-racks/squat-stands/',8.8,4.8,195,'Bells of Steel','Premium squat stands with lifetime warranty.','Garage Gym Lab',{'Frame':'3×3" 11ga','Height':'84"','Hole Spacing':'1"','Weight':'130 lbs','Warranty':'Lifetime'},['Lifetime Warranty','1" Spacing','Premium Build']),
  p('rogue-squat','SQ-1 Squat Stand','Rogue Fitness',345,'Rogue Fitness','https://www.roguefitness.com/rogue-sq-1-squat-stand',8.6,4.8,340,'Rogue Fitness','Compact Rogue quality squat stand  --  American made.','Garage Gym Reviews',{'Frame':'2×3" 11ga','Height':'78"','Footprint':'Small','Weight':'80 lbs','Made In':'USA'},['American Made','Compact','Rogue Quality']),
  p('titan-t2','T-2 Short Power Rack','Titan Fitness',349,'Titan Fitness','https://www.titanfitness.com/products/t-2-series-short-power-rack',7.5,4.5,650,'Titan Fitness','Best entry-level power rack under $350.','Garage Gym Reviews',{'Frame':'2×2" 12ga','Height':'70"','Hole Spacing':'2"','Weight':'115 lbs','Warranty':'1 Year'},['Entry Level','Low Ceiling','Budget Pick']),
],

cardio:[
  p('concept2-rower','RowErg Rowing Machine','Concept2',990,'Concept2','https://www.concept2.com/ergs/rowerg',9.8,4.9,5200,'Concept2','The only rowing machine  --  used in every serious gym on earth.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Folds':'Yes','Weight':'57 lbs','Warranty':'5 Year'},['Industry Standard','PM5 Monitor','Foldable'],{bestChoice:true}),
  p('assault-bike','AssaultBike Classic','Assault Fitness',699,'Assault Fitness','https://www.assaultfitness.com/assaultbike-classic',9.2,4.7,1800,'Assault Fitness','The original fan bike  --  brutally effective, built to last.','Barbend',{'Resistance':'Air','Display':'LCD','Weight':'95 lbs','Drive':'Chain','Warranty':'Lifetime Frame'},['Air Resistance','Fan Bike','Lifetime Frame']),
  p('concept2-ski','SkiErg','Concept2',900,'Concept2','https://www.concept2.com/ergs/skierg',9.5,4.9,890,'Concept2','Best upper body cardio machine ever made.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Wall Mount':'Included','Weight':'53 lbs','Warranty':'5 Year'},['Upper Body','PM5 Monitor','Compact']),
  p('rogue-echo-bike','Echo Bike','Rogue Fitness',795,'Rogue Fitness','https://www.roguefitness.com/rogue-echo-bike',9.0,4.8,2100,'Rogue Fitness','Best built fan bike  --  smoother than Assault with Rogue quality.','Garage Gym Reviews',{'Resistance':'Air','Display':'LCD','Weight':'127 lbs','Drive':'Belt','Made In':'USA'},['Belt Drive','American Made','Smooth Ride']),
  p('nordictrack-1750','Commercial 1750 Treadmill','NordicTrack',1999,'NordicTrack','https://www.nordictrack.com/treadmills/nordictrack-commercial-1750-treadmill',8.5,4.6,4200,'NordicTrack','Best home treadmill with incline, iFit, and 10" screen.','Wirecutter',{'Speed':'0–12 mph','Incline':'-3% to 15%','Screen':'10"','Motor':'3.5 CHP','Warranty':'10 Year Frame'},['iFit Compatible','Auto Incline','10" Screen'],{salePrice:1699}),
  p('peloton-bike','Peloton Bike+','Peloton',2695,'Peloton','https://www.onepeloton.com/bike-plus',8.8,4.7,12000,'Peloton','Best connected cycling experience  --  premium but worth it.','Wirecutter',{'Screen':'24"','Resistance':'Magnetic','Auto Follow':'Yes','Subscription':'$44/mo','Weight':'140 lbs'},['24" Screen','Auto Resistance','Live Classes']),
  p('assault-runner','AssaultRunner Pro','Assault Fitness',2999,'Assault Fitness','https://www.assaultfitness.com/assaultrunner-pro',9.3,4.8,620,'Assault Fitness','Best curved treadmill  --  no motor, self-powered, elite cardio.','Barbend',{'Type':'Curved Manual','Motor':'None','Weight':'287 lbs','Warranty':'10 Year Frame','Belt':'Slat'},['Self-Powered','Curved Belt','No Electricity']),
    p('hydrow-wave','Wave Rower','Hydrow',1495,'Hydrow','https://hydrow.com/products/hydrow-wave-rower',9.1,4.7,8400,'Wirecutter','Best-looking rower with live outdoor reality workouts and a 16" touchscreen.','Wirecutter',{'Resistance':'Electromagnetic','Screen':'16"','Folds':'Yes','Subscription':'$44/mo','Weight':'102 lbs'},['Live Workouts','16" Screen','Folds Upright']),
  p('concept2-bikeerg','BikeErg','Concept2',990,'Concept2','https://www.concept2.com/bikes/bikeerg',9.3,4.8,760,'Concept2','Air-resistance bike from the makers of the best rower.','Garage Gym Reviews',{'Resistance':'Air','Monitor':'PM5','Seat':'Adjustable','Weight':'68 lbs','Warranty':'5 Year'},['PM5 Monitor','Air Resistance','Concept2 Quality']),
],

kettlebells:[
  p('rogue-kb','Powder Coat Kettlebell','Rogue Fitness',54,'Rogue Fitness','https://www.roguefitness.com/rogue-kettlebells',9.2,4.9,1200,'Rogue Fitness','The standard in kettlebells  --  single-cast, perfect balance.','Garage Gym Reviews',{'Material':'Single Cast Iron','Coating':'Powder Coat','Handle':'Smooth','Range':'9–203 lbs','Made In':'USA'},['American Made','Single Cast','Perfect Balance'],{bestChoice:true}),
  p('rep-kb','Cast Iron Kettlebell','Rep Fitness',42,'Rep Fitness','https://repfitness.com/products/cast-iron-kettlebells',8.7,4.8,890,'Rep Fitness','Best value kettlebell  --  smooth handle, precise weight.','Garage Gym Lab',{'Material':'Single Cast Iron','Coating':'Powder Coat','Handle':'Smooth','Range':'4–203 lbs','Warranty':'2 Years'},['Best Value','Smooth Handle','Wide Range']),
  p('onnit-kb','Primal Bell','Onnit',75,'Onnit','https://www.onnit.com/primal-bells/',8.0,4.6,2100,'Onnit','Iconic animal face kettlebells  --  great quality, unique design.','Men\'s Health',{'Material':'Iron Ore','Coating':'Chip Resistant','Design':'Animal Face','Range':'18–90 lbs','Warranty':'1 Year'},['Iconic Design','Chip Resistant','Gift Worthy']),
  p('dragon-door-kb','RKC Kettlebell','Dragon Door',79,'Dragon Door','https://www.dragondoor.com/p10/',9.4,4.9,560,'Dragon Door','The original competition kettlebell  --  used by RKC instructors worldwide.','StrongFirst',{'Material':'Cast Iron','Coating':'E-Coat','Handle':'Textured','Range':'9–203 lbs','Certification':'RKC Standard'},['Competition Standard','RKC Certified','Pro Grade']),
  p('titan-kb','Titan Kettlebell','Titan Fitness',29,'Titan Fitness','https://www.titanfitness.com/products/cast-iron-kettlebell',7.5,4.5,1800,'Titan Fitness','Budget-friendly kettlebell  --  solid for home training.','Garage Gym Reviews',{'Material':'Cast Iron','Coating':'Powder Coat','Handle':'Standard','Range':'5–100 lbs','Warranty':'1 Year'},['Budget Pick','Wide Range','Ships Fast']),
  p('vulcan-kb','Elite Kettlebell','Vulcan Strength',58,'Vulcan Strength','https://www.vulcanstrength.com/products/vulcan-elite-kettlebell',9.0,4.8,340,'Vulcan Strength','Competition-spec kettlebell with smooth enamel finish.','Garage Gym Reviews',{'Material':'Cast Iron','Coating':'Enamel','Style':'Competition','Range':'9–203 lbs','Warranty':'Lifetime'},['Competition Spec','Enamel Finish','Lifetime Warranty']),
  p('cap-kb','Vinyl Coated Kettlebell','CAP Barbell',28,'Amazon','https://www.amazon.com/dp/B07JZR1PBQ?tag=gymgearcompar-20',6.0,4.2,8900,'Amazon','Most affordable entry-level kettlebell  --  fine for beginners.','Barbend',{'Material':'Cast Iron','Coating':'Vinyl','Floor Protection':'Yes','Range':'5–80 lbs','Ships':'Prime'},['Lowest Price','Floor Friendly','Amazon Prime']),
  p('yes4all-kb','Adjustable Kettlebell','Yes4All',129,'Amazon','https://www.amazon.com/dp/B07NPLY4CT?tag=gymgearcompar-20',7.8,4.5,3200,'Amazon','Best adjustable kettlebell  --  6 weights in one.','Barbend',{'Material':'Cast Iron','Range':'12–25 lbs','Weights':'6 in 1','System':'Plate Stack','Ships':'Prime'},['Adjustable','Space Saving','6-in-1']),
],

bands:[
  p('rogue-bands','Monster Bands','Rogue Fitness',25,'Rogue Fitness','https://www.roguefitness.com/monster-bands',9.2,4.9,2100,'Rogue Fitness','The standard in resistance bands  --  used by coaches worldwide.','Barbend',{'Material':'Natural Latex','Resistance':'Light–Monster','Width':'1/2"–2.5"','Uses':'Pull-ups, Mobility','Made In':'USA'},['American Made','Multiple Widths','Coach Approved'],{bestChoice:true}),
  p('rep-bands','Pull-Up Assistance Bands','Rep Fitness',22,'Rep Fitness','https://repfitness.com/products/pull-up-bands',8.7,4.7,890,'Rep Fitness','Best value bands  --  wide range of resistance levels.','Garage Gym Lab',{'Material':'Natural Latex','Set':'5 bands','Resistance':'10–175 lbs','Uses':'Pull-ups, Squats','Warranty':'1 Year'},['Best Value','5 Band Set','High Resistance']),
  p('elitefts-bands','Pro Bands','EliteFTS',30,'EliteFTS','https://www.elitefts.com/shop/bands-chains.html',9.0,4.8,450,'EliteFTS','Powerlifting-grade bands used in elite gyms and meets.','Starting Strength',{'Material':'Natural Latex','Grade':'Competition','Resistance':'5 levels','Uses':'Deadlift, Squat, Bench','Lifespan':'High'},['Powerlifting Grade','Competition Quality','Elite Tested']),
  p('wodfitters-bands','Pull Up Bands','WODFitters',28,'Amazon','https://www.amazon.com/dp/B01LZAUQN1?tag=gymgearcompar-20',8.2,4.6,12000,'Amazon','Best CrossFit bands  --  color coded, durable, great for kipping.','Barbend',{'Material':'Natural Latex','Colors':'4 resistance levels','Width':'1/2"–2"','Uses':'Pull-ups, WODs','Ships':'Prime'},['CrossFit Friendly','Color Coded','Amazon Prime']),
  p('fit-simplify-bands','Resistance Loop Bands','Fit Simplify',12,'Amazon','https://www.amazon.com/dp/B09MJKJYLQ?tag=gymgearcompar-20',7.5,4.6,85000,'Amazon','Most popular loop bands  --  perfect for glute work and rehab.','Wirecutter',{'Material':'Natural Latex','Set':'5 bands','Type':'Loop','Uses':'Glutes, Rehab, Warm-up','Ships':'Prime'},['Best Seller','5 Levels','Loop Design'],{salePrice:9}),
  p('ironbull-bands','Strength Bands','Iron Bull Strength',35,'Amazon','https://www.amazon.com/dp/B0732TCYMY?tag=gymgearcompar-20',8.5,4.7,2800,'Amazon','Heavy-duty bands for accommodating resistance training.','Barbend',{'Material':'Natural Latex','Set':'5 bands','Resistance':'Up to 200 lbs','Uses':'Deadlift, Squat, Bench','Grade':'Heavy Duty'},['Heavy Duty','Up to 200 lbs','Accommodating Resistance']),
  p('perform-better-mini','Mini Bands','Perform Better',18,'Perform Better','https://www.performbetter.com/Mini-Exercise-Band',8.0,4.6,1200,'Perform Better','Physical therapist favorite for warm-up and hip activation.','PT-recommended',{'Material':'Natural Latex','Type':'Mini Loop','Resistance':'3 levels','Uses':'Warm-up, Hips, Rehab','Length':'9"'},['PT Favorite','Hip Activation','Warm-up Essential']),
  p('amazon-bands','Resistance Bands Set','Amazon Basics',10,'Amazon','https://www.amazon.com/dp/B07NY82DX4?tag=gymgearcompar-20',6.5,4.4,45000,'Amazon','Cheapest option  --  acceptable for light exercise and mobility.','Barbend',{'Material':'Latex','Set':'5 bands','Type':'Loop','Uses':'Light Exercise','Ships':'Prime'},['Lowest Price','Amazon Prime','Beginner']),
],

shorts:[
  p('youngla-shorts','215 Gotta Go Shorts','Young LA',42,'Young LA','https://youngla.com/products/215-gotta-go-shorts',8.8,4.8,3200,'Young LA','Best-fitting gym shorts from the fastest growing brand.','Fitness Influencer Reviews',{'Material':'88% Poly 12% Spandex','Length':'5"','Pockets':'2','Liner':'Yes','Fit':'Athletic'},['Athletic Fit','Lined','Best Seller'],{bestChoice:true}),
  p('gymshark-arrival','Arrival 5" Shorts','Gymshark',45,'Gymshark','https://www.gymshark.com/collections/shorts/products/arrival-5-shorts',8.6,4.7,8900,'Gymshark','Most popular gym shorts globally  --  flexible and comfortable.','GQ',{'Material':'86% Poly 14% Elastane','Length':'5"','Pockets':'2','Liner':'No','Fit':'Regular'},['Most Popular','Lightweight','Great Fit']),
  p('nobull-shorts','Training Shorts','NOBULL',68,'NOBULL','https://www.nobullproject.com/products/mens-training-short',9.0,4.7,1200,'NOBULL','Premium training shorts with stretch and durability for CrossFit.','Barbend',{'Material':'92% Poly 8% Spandex','Length':'7"','Pockets':'3','Liner':'Yes','Fit':'Athletic'},['Premium Build','CrossFit Ready','7" Inseam']),
  p('alphalete-shorts','Amplify Shorts','Alphalete',55,'Alphalete','https://alphalete.com/collections/mens-shorts',8.7,4.8,2100,'Alphalete','Buttery soft fabric with a flattering athletic cut.','Fitness Apparel Reviews',{'Material':'Buttery Soft Blend','Length':'5"','Pockets':'2','Liner':'Yes','Fit':'Athletic'},['Buttery Soft','Athletic Cut','Premium Feel'],{salePrice:44}),
  p('lululemon-shorts','Pace Breaker 5" Shorts','Lululemon',78,'Lululemon','https://www.lululemon.com/en-us/p/pace-breaker-linerless-short-5/prod9920053.html',9.1,4.8,5400,'Lululemon','Premium shorts with Swift fabric  --  worth the price for serious athletes.','Wirecutter',{'Material':'Swift Fabric','Length':'5"','Pockets':'3','Liner':'No','Fit':'Relaxed'},['Swift Fabric','Premium Quality','Trusted Brand']),
  p('nike-dri-fit','Dri-FIT Training Shorts','Nike',35,'Nike','https://www.nike.com/w/mens-training-shorts',8.2,4.6,18000,'Nike','Most trusted gym shorts brand  --  moisture wicking and affordable.','Runner\'s World',{'Material':'Dri-FIT Polyester','Length':'7"','Pockets':'2','Liner':'No','Fit':'Regular'},['Dri-FIT Tech','Most Trusted','Affordable']),
  p('adidas-shorts','Techfit Shorts','Adidas',38,'Adidas','https://www.adidas.com/us/training-shorts',8.0,4.5,9800,'Adidas','Compression-style shorts with iconic three-stripe design.','GQ',{'Material':'Techfit Poly-Spandex','Length':'5"','Pockets':'1','Liner':'Yes','Fit':'Compression'},['Compression Fit','Iconic Design','Performance Tech']),
  p('better-bodies-shorts','Mesh Training Shorts','Better Bodies',52,'Better Bodies','https://www.better-bodies.com/collections/mens-shorts',8.4,4.7,870,'Better Bodies','Bodybuilding-focused shorts built for high-rep training.','Generation Iron',{'Material':'Mesh Poly Blend','Length':'5"','Pockets':'2','Liner':'No','Fit':'Relaxed'},['Bodybuilder Brand','Mesh Panels','Relaxed Fit']),
],

compression:[
  p('gymshark-vital','Vital Seamless Leggings','Gymshark',55,'Gymshark','https://www.gymshark.com/collections/leggings/products/vital-seamless-2-0-leggings',8.8,4.8,12400,'Gymshark','Best-selling compression leggings globally  --  soft and sculpting.','Women\'s Health',{'Material':'Seamless Knit','Fit':'Compressive','Pockets':'1','Waistband':'High','Squat Proof':'Yes'},['Seamless','Squat Proof','Best Seller'],{bestChoice:true}),
  p('lululemon-align','Align Pant 25"','Lululemon',128,'Lululemon','https://www.lululemon.com/en-us/p/align-pant-25/prod8560273.html',9.5,4.9,28000,'Lululemon','The legging every other brand tries to replicate.','Vogue',{'Material':'Nulu Fabric','Fit':'Naked Sensation','Pockets':'1','Waistband':'High','Length':'25"'},['Gold Standard','Nulu Fabric','Most Copied']),
  p('alphalete-surge','Surge Leggings','Alphalete',75,'Alphalete','https://alphalete.com/collections/womens-leggings',9.1,4.9,3200,'Alphalete','Cult-favorite leggings  --  flattering cut with premium compression.','Shape Magazine',{'Material':'Nylon-Spandex','Fit':'Compressive','Pockets':'2','Waistband':'High','Squat Proof':'Yes'},['Cult Favorite','High Waist','Premium Compression']),
  p('youngla-joggers','Tapered Joggers 101','Young LA',58,'Young LA','https://youngla.com/collections/bottoms',8.9,4.8,4100,'Young LA','Most popular gym bottoms from the hottest rising brand.','Fitness Reviews',{'Material':'Poly-Spandex Blend','Fit':'Tapered','Pockets':'2','Waistband':'Elastic','Compression':'Light'},['Best Seller','Tapered Fit','Young LA'],{salePrice:46}),
  p('nike-pro','Pro Mid-Rise Leggings','Nike',55,'Nike','https://www.nike.com/w/womens-nike-pro-leggings',8.5,4.7,22000,'Nike','Most trusted compression legging  --  Dri-FIT and durable.','Runner\'s World',{'Material':'Dri-FIT Nylon','Fit':'Compression','Pockets':'1','Waistband':'Mid-Rise','Squat Proof':'Yes'},['Dri-FIT','Most Trusted','Squat Proof']),
  p('under-armour-leggings','HeatGear Leggings','Under Armour',45,'Under Armour','https://www.underarmour.com/en-us/c/womens-leggings/',8.3,4.6,15000,'Under Armour','HeatGear tech keeps you cool during intense training.','Shape Magazine',{'Material':'HeatGear Fabric','Fit':'Compression','Pockets':'1','Waistband':'High','Cooling':'Yes'},['HeatGear','Cooling Tech','Great Value']),
  p('better-bodies-tights','Pro Tights','Better Bodies',62,'Better Bodies','https://www.better-bodies.com/collections/womens-tights',8.5,4.7,940,'Better Bodies','Bodybuilding-grade compression built for heavy lifting.','Generation Iron',{'Material':'Nylon-Spandex','Fit':'Compression','Pockets':'1','Waistband':'High','Squat Proof':'Yes'},['Lifting Focused','Squat Proof','Bodybuilder Brand']),
  p('gasp-tights','Pro Tight','GASP',70,'GASP','https://www.gaspofficial.com/collections/tights',8.6,4.7,560,'GASP','Old-school bodybuilding brand with serious compression.','Generation Iron',{'Material':'Poly-Spandex','Fit':'Compression','Pockets':'0','Waistband':'High','Style':'Bodybuilder'},['Bodybuilder Brand','Hardcore Style','Strong Compression']),
],

tanks:[
  p('youngla-tank','Sleeveless Tank 303','Young LA',32,'Young LA','https://youngla.com/collections/tops',8.8,4.8,4200,'Young LA','Best gym tank  --  wide-cut armholes and athletic fit.','Fitness Reviews',{'Material':'95% Poly 5% Spandex','Fit':'Athletic','Armholes':'Wide Cut','Length':'Standard','Style':'Sleeveless'},['Best Seller','Wide Armholes','Athletic Fit'],{bestChoice:true}),
  p('gymshark-tank','Training Tank','Gymshark',35,'Gymshark','https://www.gymshark.com/collections/tops',8.5,4.7,6800,'Gymshark','Lightweight and breathable  --  Gymshark\'s most popular tank.','GQ',{'Material':'87% Poly 13% Elastane','Fit':'Regular','Armholes':'Standard','Length':'Standard','Style':'Sleeveless'},['Most Popular','Lightweight','Breathable']),
  p('gasp-stringer','Stringer Tank','GASP',45,'GASP','https://www.gaspofficial.com/collections/tanks',8.8,4.8,1200,'GASP','Classic bodybuilder stringer  --  worn in gyms worldwide.','Generation Iron',{'Material':'100% Cotton','Fit':'Bodybuilder','Armholes':'Deep Cut','Style':'Stringer','Culture':'Bodybuilding'},['Classic Stringer','Deep Cut','Bodybuilder Icon']),
  p('better-bodies-tank','Ribbed Tank','Better Bodies',38,'Better Bodies','https://www.better-bodies.com/collections/mens-tanks',8.4,4.7,780,'Better Bodies','Stylish ribbed construction with athletic drape.','Generation Iron',{'Material':'Viscose-Poly Blend','Fit':'Athletic','Style':'Ribbed','Armholes':'Standard','Length':'Long'},['Ribbed Design','Athletic Drape','Bodybuilder Brand']),
  p('alphalete-tank','Athletic Tank','Alphalete',38,'Alphalete','https://alphalete.com/collections/mens-tanks',8.6,4.8,1900,'Alphalete','Ultra-soft fabric in a clean athletic cut.','Fitness Apparel Reviews',{'Material':'Micro Modal Blend','Fit':'Athletic','Armholes':'Standard','Style':'Sleeveless','Texture':'Ultra Soft'},['Ultra Soft','Athletic Cut','Premium Feel']),
  p('nike-dri-fit-tank','Dri-FIT Tank','Nike',28,'Nike','https://www.nike.com/w/mens-training-tanks',8.0,4.6,14000,'Nike','Most reliable gym tank  --  Dri-FIT moisture management.','Runner\'s World',{'Material':'Dri-FIT Polyester','Fit':'Regular','Technology':'Dri-FIT','Armholes':'Standard','Style':'Sleeveless'},['Dri-FIT Tech','Most Trusted','Affordable']),
  p('under-armour-tank','Tech Tank','Under Armour',25,'Under Armour','https://www.underarmour.com/en-us/c/mens-tanks/',7.9,4.5,9200,'Under Armour','Lightweight HeatGear fabric with a relaxed fit.','Shape Magazine',{'Material':'HeatGear','Fit':'Loose','Technology':'HeatGear','Style':'Sleeveless','Wicking':'Anti-Odor'},['HeatGear Tech','Anti-Odor','Affordable'],{salePrice:19}),
  p('nobull-tank','Performance Tank','NOBULL',52,'NOBULL','https://www.nobullproject.com/collections/tanks',8.9,4.7,890,'NOBULL','Premium performance tank built for CrossFit and hard training.','Barbend',{'Material':'Moisture Wicking Blend','Fit':'Athletic','Armholes':'Wide Cut','Style':'Performance','Use':'CrossFit'},['Premium Build','CrossFit Ready','Wide Armholes']),
],

hoodies:[
  p('youngla-hoodie','Oversized Hoodie 549','Young LA',65,'Young LA','https://youngla.com/collections/hoodies',9.0,4.9,5600,'Young LA','Best gym hoodie  --  oversized, soft, iconic.','Fitness Reviews',{'Material':'80% Cotton 20% Poly','Fit':'Oversized','Hood':'Drawstring','Pockets':'Kangaroo','Weight':'Heavyweight'},['Oversized Fit','Best Seller','Heavyweight Cotton'],{bestChoice:true}),
  p('gymshark-critical','Critical Hoodie','Gymshark',70,'Gymshark','https://www.gymshark.com/collections/hoodies/products/critical-hoodie',8.7,4.7,7200,'Gymshark','Globally popular slim-fit hoodie with clean aesthetic.','GQ',{'Material':'72% Cotton 28% Poly','Fit':'Slim','Hood':'Drawstring','Pockets':'Kangaroo','Weight':'Medium'},['Slim Fit','Clean Look','Most Popular']),
  p('alphalete-hoodie','Premium Hoodie','Alphalete',80,'Alphalete','https://alphalete.com/collections/mens-hoodies',8.9,4.8,2800,'Alphalete','Ultra-soft premium hoodie with athletic silhouette.','Fitness Apparel Reviews',{'Material':'French Terry Cotton','Fit':'Athletic','Hood':'Double-lined','Pockets':'Kangaroo','Weight':'Heavyweight'},['Ultra Soft','Athletic Cut','Premium Feel'],{salePrice:64}),
  p('nike-club-hoodie','Club Fleece Hoodie','Nike',65,'Nike','https://www.nike.com/w/mens-nike-club-hoodies',8.5,4.8,35000,'Nike','The most iconic gym hoodie  --  trusted by athletes everywhere.','GQ',{'Material':'80% Cotton 20% Poly','Fit':'Standard','Hood':'Drawstring','Pockets':'Kangaroo','Weight':'Medium'},['Most Iconic','Trusted Brand','Everyday Wear']),
  p('adidas-essentials','Essentials Fleece Hoodie','Adidas',60,'Adidas','https://www.adidas.com/us/hoodies',8.3,4.7,24000,'Adidas','Classic three-stripe hoodie  --  comfortable and timeless.','GQ',{'Material':'70% Cotton 30% Poly','Fit':'Regular','Hood':'Drawstring','Pockets':'Kangaroo','Weight':'Medium'},['Classic Design','Three Stripes','Timeless']),
  p('better-bodies-hoodie','Athlete Hoodie','Better Bodies',68,'Better Bodies','https://www.better-bodies.com/collections/mens-hoodies',8.4,4.7,780,'Better Bodies','Bodybuilding cut with dropped shoulders.','Generation Iron',{'Material':'Cotton-Poly Blend','Fit':'Athletic','Hood':'Drawstring','Pockets':'Kangaroo','Shoulders':'Dropped'},['Bodybuilder Cut','Dropped Shoulders','Athletic Fit']),
  p('gasp-hoodie','Thermal Hood','GASP',75,'GASP','https://www.gaspofficial.com/collections/hoodies',8.5,4.7,490,'GASP','Old-school bodybuilder hoodie  --  heavy, warm, and hardcore.','Generation Iron',{'Material':'Heavy Cotton Blend','Fit':'Relaxed','Hood':'Drawstring','Pockets':'Kangaroo','Weight':'Heavyweight'},['Hardcore Style','Heavyweight','Bodybuilder Brand']),
  p('lululemon-scuba','Scuba Oversized Hoodie','Lululemon',138,'Lululemon','https://www.lululemon.com/en-us/p/scuba-oversized-half-zip-hoodie/prod11120082.html',9.3,4.9,11000,'Lululemon','Cult-status hoodie  --  everyone at the gym has one.','Vogue',{'Material':'Terry Fabric','Fit':'Oversized','Hood':'No Drawstring','Pockets':'2','Style':'Half-Zip'},['Cult Status','Terry Fabric','Half Zip']),
],

footwear:[
  p('nobull-trainer','Trainer+','NOBULL',139,'NOBULL','https://www.nobullproject.com/products/mens-trainer-plus',9.2,4.8,6700,'NOBULL','Best all-around training shoe  --  CrossFit and lifting in one.','Barbend',{'Upper':'SuperFabric','Sole':'Flat Rubber','Drop':'4mm','Weight':'11.5 oz','Use':'Cross-Training'},['CrossFit Ready','SuperFabric','All-Purpose'],{bestChoice:true}),
  p('nike-metcon-9','Metcon 9','Nike',150,'Nike','https://www.nike.com/t/metcon-9-training-shoes',9.0,4.7,9200,'Nike','The trainer Nike athletes trust for WODs and lifting.','Barbend',{'Upper':'Mesh','Sole':'Flat Rubber','Drop':'4mm','Weight':'10.8 oz','Use':'Cross-Training'},['Trusted Brand','Stable Heel','CrossFit Icon']),
  p('adidas-adipower','Adipower Weightlifting Shoe','Adidas',175,'Adidas','https://www.adidas.com/us/adipower-weightlifting-shoes',9.1,4.8,3400,'Adidas','Best weightlifting shoe  --  elevated heel for Olympic lifts.','Barbend',{'Upper':'Synthetic','Heel Raise':'0.75"','Sole':'TPU','Strap':'Double Strap','Use':'Olympic Lifting'},['Lifting Specific','Elevated Heel','Double Strap'],{salePrice:139}),
  p('reebok-nano','Nano X4','Reebok',130,'Reebok','https://www.reebok.com/us/nano-x4-training-shoes',8.8,4.7,7800,'Reebok','Classic CrossFit trainer  --  versatile and trusted since 2011.','Barbend',{'Upper':'Engineered Mesh','Sole':'Rubber','Drop':'4mm','Weight':'10.2 oz','Use':'Cross-Training'},['CrossFit Classic','Versatile','Trusted Since 2011']),
  p('converse-chuck','Chuck Taylor All Star','Converse',65,'Converse','https://www.converse.com/us/en/p/chuck-taylor-all-star',7.5,4.6,45000,'Amazon','Powerlifters love these  --  dead flat sole, zero drop.','Starting Strength',{'Upper':'Canvas','Sole':'Flat Rubber','Drop':'0mm','Weight':'11 oz','Use':'Powerlifting'},['Zero Drop','Powerlifter Favorite','Flat Sole']),
  p('inov8-bare','Bare-XF V3','Inov-8',125,'Inov-8','https://www.inov-8.com/us/bare-xf-v3',8.9,4.7,1200,'Inov-8','Best minimalist training shoe for barefoot-style lifting.','Barbend',{'Upper':'Mesh','Sole':'Bare-XF','Drop':'0mm','Weight':'7.6 oz','Use':'Lifting + WOD'},['Zero Drop','Minimalist','Barefoot Feel']),
  p('new-balance-minimus','Minimus TR V1','New Balance',100,'New Balance','https://www.newbalance.com/pd/minimus-tr-v1-training-shoe',8.4,4.6,2100,'New Balance','Lightweight trainer great for lifting and agility.','Runner\'s World',{'Upper':'Mesh','Sole':'REVlite','Drop':'4mm','Weight':'8.1 oz','Use':'Training'},['Lightweight','REVlite Sole','Versatile']),
  p('nobull-lifter','Lifters','NOBULL',179,'NOBULL','https://www.nobullproject.com/products/mens-lifter',9.0,4.8,1800,'NOBULL','Best modern weightlifting shoe  --  stiff, stable, sleek.','Barbend',{'Upper':'SuperFabric','Heel Raise':'0.75"','Sole':'TPU','Strap':'Single Strap','Use':'Olympic Lifting'},['Lifting Specific','SuperFabric','Sleek Design']),
],

sportsbras:[
  p('lululemon-energy','Energy Bra','Lululemon',68,'Lululemon','https://www.lululemon.com/en-us/p/energy-bra/prod8560290.html',9.4,4.9,18000,'Lululemon','The benchmark for sports bras  --  supportive, comfortable, stylish.','Women\'s Health',{'Support':'Medium','Material':'Luon Fabric','Pads':'Removable','Straps':'Racerback','Cups':'Molded'},['Gold Standard','Luon Fabric','Racerback'],{bestChoice:true}),
  p('gymshark-flex-bra','Flex Sports Bra','Gymshark',38,'Gymshark','https://www.gymshark.com/collections/sports-bras',8.6,4.7,9200,'Gymshark','Best value sports bra  --  comfortable for all workout types.','Women\'s Health',{'Support':'Medium','Material':'Stretch Fabric','Pads':'Removable','Straps':'Crossback','Cups':'Removable'},['Best Value','Crossback','All-Purpose']),
  p('nike-indy-bra','Dri-FIT Indy Bra','Nike',45,'Nike','https://www.nike.com/w/womens-sports-bras',8.5,4.7,24000,'Nike','Light support bra with Dri-FIT  --  perfect for yoga and low impact.','Runner\'s World',{'Support':'Light','Material':'Dri-FIT','Pads':'Removable','Straps':'Standard','Cups':'Shelf'},['Dri-FIT','Light Support','Yoga Friendly']),
  p('alphalete-sports-bra','Amplify Sports Bra','Alphalete',52,'Alphalete','https://alphalete.com/collections/sports-bras',8.8,4.8,2800,'Alphalete','Matching the Amplify shorts  --  buttery soft with great support.','Shape Magazine',{'Support':'Medium','Material':'Buttery Soft','Pads':'Removable','Straps':'Racerback','Cups':'Molded'},['Matching Sets','Buttery Soft','Medium Support']),
  p('ua-infinity-bra','Infinity High Bra','Under Armour',55,'Under Armour','https://www.underarmour.com/en-us/c/womens-sports-bras/',8.7,4.7,8900,'Under Armour','High-impact bra for running and HIIT  --  locks everything in place.','Runner\'s World',{'Support':'High','Material':'HeatGear','Cups':'Underwire','Straps':'Adjustable','Impact':'High'},['High Impact','Underwire','Running Ready']),
  p('nobull-sports-bra','Performance Sports Bra','NOBULL',68,'NOBULL','https://www.nobullproject.com/collections/womens-sports-bras',8.9,4.7,780,'NOBULL','CrossFit-ready bra with premium support for heavy training.','Barbend',{'Support':'Medium-High','Material':'Performance Blend','Pads':'Removable','Straps':'Racerback','Use':'CrossFit'},['CrossFit Ready','Premium Build','Performance Support']),
  p('adidas-bra','Believe This 3-Bar Bra','Adidas',40,'Adidas','https://www.adidas.com/us/womens-sports-bras',8.2,4.6,12000,'Adidas','Iconic three-stripe sports bra  --  comfortable for all activities.','GQ',{'Support':'Medium','Material':'Climalite','Pads':'Removable','Straps':'Standard','Style':'Three-Stripe'},['Iconic Design','Climalite','All-Activity']),
  p('youngla-sports-bra','Sports Bra','Young LA',36,'Young LA','https://youngla.com/collections/womens-sports-bras',8.7,4.8,3100,'Young LA','Young LA\'s take on the sports bra  --  soft fabric, great fit.','Fitness Reviews',{'Support':'Medium','Material':'Poly-Spandex','Pads':'Removable','Straps':'Racerback','Fit':'Athletic'},['Young LA','Athletic Fit','Great Value'],{salePrice:28}),
],

preworkout:[
  p('ghost-legend','Ghost Legend Pre-Workout','Ghost',49,'Ghost','https://ghostlifestyle.com/products/ghost-legend',9.0,4.8,14200,'Ghost','Most popular pre-workout of the decade  --  transparent label.','Barbend',{'Caffeine':'250mg','L-Citrulline':'4g','Beta-Alanine':'3.2g','Servings':'40','Collab':'Yes'},['Transparent Label','40 Servings','Collab Flavors'],{bestChoice:true}),
  p('transparent-stim','Bulk Pre-Workout','Transparent Labs',49,'Transparent Labs','https://www.transparentlabs.com/products/bulk-black-pre-workout',9.5,4.9,8900,'Transparent Labs','Cleanest formula on the market  --  fully disclosed, no fillers.','Examine.com',{'Caffeine':'275mg','L-Citrulline':'8g','Beta-Alanine':'4g','Servings':'30','Third Party':'Yes'},['Cleanest Formula','8g Citrulline','Third Party Tested']),
  p('gorilla-mind','Gorilla Mode Pre-Workout','Gorilla Mind',49,'Gorilla Mind','https://gorillamind.com/products/gorilla-mode',9.2,4.8,11000,'Gorilla Mind','Highest dosed pre-workout on the market  --  not for beginners.','More Plates More Dates',{'Caffeine':'350mg','L-Citrulline':'9g','Creatine':'5g','Servings':'40','Stim':'Very High'},['Highest Dose','9g Citrulline','Includes Creatine']),
  p('c4-original','C4 Original Pre-Workout','Cellucor',35,'Amazon','https://www.amazon.com/dp/B01N272UAI?tag=gymgearcompar-20',7.8,4.6,89000,'Amazon','Most sold pre-workout ever  --  beginner-friendly and affordable.','Barbend',{'Caffeine':'150mg','Beta-Alanine':'1.6g','Arginine':'1g','Servings':'30','Flavor':'Many'},['Beginner Friendly','Best Seller','Affordable'],{salePrice:25}),
  p('legion-pulse','Pulse Pre-Workout','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/pulse/',9.1,4.8,9800,'Legion','Science-based formula with natural caffeine from green tea.','Examine.com',{'Caffeine':'350mg Natural','L-Citrulline':'8g','Beta-Alanine':'4.8g','Servings':'21','Synthetic':'None'},['Natural Caffeine','Science Based','No Synthetics']),
  p('alani-pre','Pre-Workout','Alani Nu',44,'Alani Nu','https://alaninu.com/collections/pre-workout',8.2,4.7,21000,'Alani Nu','Best women-focused pre-workout  --  great taste, smooth energy.','Shape Magazine',{'Caffeine':'200mg','L-Citrulline':'6g','Beta-Alanine':'1.6g','Servings':'30','Focus':'Women'},['Women Focused','Great Taste','Smooth Energy']),
  p('bucked-up','Bucked Up Pre-Workout','Bucked Up',49,'Bucked Up','https://buckedup.com/products/bucked-up-pre-workout',8.5,4.7,7600,'Bucked Up','Deer antler velvet formula with strong pump and focus.','Fitness Reviews',{'Caffeine':'200mg','L-Citrulline':'6g','Beta-Alanine':'3.2g','Deer Antler':'Yes','Servings':'30'},['Pump Formula','Deer Antler','Focus Blend']),
    p('kaged-elite','Pre-Kaged Elite','Kaged',59,'Kaged','https://www.kaged.com/products/pre-kaged-elite',9.3,4.8,5600,'Barbend','Most complete pre-workout formula  --  patented ingredients, no proprietary blends.','Barbend',{'Caffeine':'388mg','L-Citrulline':'9g','Beta-Alanine':'3.2g','Servings':'20','Third Party':'Yes'},['No Prop Blends','388mg Caffeine','Third Party Tested']),
    p('raw-thavage','Thavage Pre-Workout','Raw Nutrition',49,'Raw Nutrition','https://getrawnutrition.com/products/thavage-pre-workout',8.9,4.8,12000,'Barbend','Chris Bumstead signature pre-workout  --  great taste, solid clinical doses.','Barbend',{'Caffeine':'200mg','L-Citrulline':'8g','Beta-Alanine':'3.2g','Servings':'40','Collab':'CBUM'},['CBUM Signature','40 Servings','Smooth Energy']),
  p('gorilla-mind-smooth','Gorilla Mode Nitric','Gorilla Mind',49,'Gorilla Mind','https://gorillamind.com/products/gorilla-mode-nitric',8.8,4.7,4200,'Gorilla Mind','Stim-free pump pre-workout  --  max vascularity without jitters.','More Plates More Dates',{'Caffeine':'0mg','L-Citrulline':'10g','Nitric Oxide':'Max','Servings':'40','Stim Free':'Yes'},['Stim Free','10g Citrulline','Max Pump']),
],

protein:[
  p('on-gold-standard','Gold Standard 100% Whey','Optimum Nutrition',54,'Amazon','https://www.amazon.com/dp/B000GISU1M?tag=gymgearcompar-20',9.0,4.8,125000,'Amazon','The best-selling protein of all time  --  proven, affordable, effective.','Examine.com',{'Protein':'24g','Calories':'120','Carbs':'3g','Fat':'1.5g','Servings':'74'},['Best Seller','24g Protein','74 Servings'],{bestChoice:true}),
  p('transparent-whey','100% Whey Protein Isolate','Transparent Labs',59,'Transparent Labs','https://www.transparentlabs.com/products/100-grass-fed-whey-protein-isolate',9.6,4.9,7800,'Transparent Labs','Cleanest whey  --  grass-fed, no artificial anything.','Examine.com',{'Protein':'28g','Calories':'120','Carbs':'1g','Fat':'0.5g','Source':'Grass-Fed'},['Grass Fed','Cleanest Formula','28g Protein']),
  p('ghost-whey','Ghost Whey Protein','Ghost',54,'Ghost','https://ghostlifestyle.com/products/ghost-whey',8.8,4.8,18000,'Ghost','Best tasting protein  --  collab flavors and transparent label.','Barbend',{'Protein':'25g','Calories':'150','Carbs':'5g','Fat':'3.5g','Servings':'25'},['Best Taste','Collab Flavors','Transparent Label']),
  p('dymatize-iso100','ISO100 Hydrolyzed Whey','Dymatize',56,'Amazon','https://www.amazon.com/dp/B002N6F2UW?tag=gymgearcompar-20',9.2,4.8,34000,'Amazon','Hydrolyzed isolate for fastest absorption  --  serious athletes.','Barbend',{'Protein':'25g','Calories':'120','Carbs':'2g','Fat':'0.5g','Type':'Hydrolyzed Isolate'},['Hydrolyzed','Fastest Absorption','Isolate'],{salePrice:44}),
  p('legion-whey','Whey+ Protein','Legion',59,'Legion','https://www.legionathletics.com/products/supplements/whey-protein/',9.1,4.8,8200,'Legion','Natural, science-based protein with excellent taste.','Examine.com',{'Protein':'22g','Calories':'100','Carbs':'3g','Fat':'0g','Sweeteners':'Stevia'},['100% Natural','No Artificial','Science Based']),
  p('thorne-whey','Whey Protein Isolate','Thorne',75,'Thorne','https://www.thorne.com/products/dp/whey-protein-isolate',9.4,4.8,2100,'Thorne','NSF Certified for Sport  --  the choice of professional athletes.','NSF',{'Protein':'21g','Calories':'110','Carbs':'2g','Fat':'1g','NSF Certified':'Yes'},['NSF Certified','Pro Athlete Choice','Pharmaceutical Grade']),
  p('nutricost-whey','Whey Protein Concentrate','Nutricost',39,'Amazon','https://www.amazon.com/dp/B01KITQG0A?tag=gymgearcompar-20',7.5,4.5,28000,'Amazon','Best budget protein  --  simple, effective, no frills.','Barbend',{'Protein':'25g','Calories':'130','Carbs':'5g','Fat':'2g','Servings':'75'},['Best Budget','75 Servings','No Frills']),
  p('momentous-protein','Essential Plant Protein','Momentous',50,'Momentous','https://livemomentous.com/products/essential-plant-protein',9.3,4.9,3200,'Momentous','NSF certified plant protein used by NFL + NBA  --  trusted by pro athletes.',"Examine.com",{'Protein':'20g','Source':'Pea + Rice','NSF Certified':'Yes','Calories':'120','Athletes':'NFL/NBA'},['NSF Certified','Pro Athlete','Plant Based']),
  p('on-casein','Gold Standard Casein','Optimum Nutrition',52,'Amazon','https://www.amazon.com/dp/B002DYJ0M0?tag=gymgearcompar-20',8.8,4.7,19000,'Amazon','Best slow-release protein  --  ideal before bed for recovery.','Examine.com',{'Protein':'24g','Calories':'130','Carbs':'4g','Fat':'1g','Absorption':'Slow'},['Slow Release','Overnight Recovery','Best Casein']),
],

creatine:[
  p('transparent-creatine','Creatine HMB','Transparent Labs',49,'Transparent Labs','https://www.transparentlabs.com/products/creatine-hmb',9.5,4.9,12000,'Transparent Labs','Best creatine formula  --  monohydrate plus HMB for muscle retention.','Examine.com',{'Creatine':'5g','HMB':'1.5g','Type':'Monohydrate','Servings':'30','Third Party':'Yes'},['Plus HMB','Third Party Tested','Cleanest Formula'],{bestChoice:true}),
  p('on-creatine','Micronized Creatine Powder','Optimum Nutrition',29,'Amazon','https://www.amazon.com/dp/B002DYIZEO?tag=gymgearcompar-20',9.0,4.8,67000,'Amazon','Most popular creatine  --  micronized for better mixing.','Examine.com',{'Creatine':'5g','Type':'Micronized Monohydrate','Servings':'60','Calories':'0','Mixability':'Excellent'},['Micronized','Best Seller','Excellent Value']),
  p('thorne-creatine','Creatine','Thorne',42,'Thorne','https://www.thorne.com/products/dp/creatine',9.4,4.9,3400,'Thorne','NSF Certified creatine  --  pharmaceutical grade for pro athletes.','NSF',{'Creatine':'5g','Type':'Monohydrate','Servings':'90','NSF Certified':'Yes','Filler':'None'},['NSF Certified','No Fillers','Pharmaceutical Grade']),
  p('legion-recharge','Recharge Post-Workout','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/recharge/',9.0,4.8,6800,'Legion','Creatine plus L-carnitine for recovery  --  best post-workout creatine.','Examine.com',{'Creatine':'5g','L-Carnitine':'2.1g','Type':'Monohydrate','Servings':'30','Recovery':'Enhanced'},['Plus L-Carnitine','Recovery Focused','Natural Flavors']),
  p('nutricost-creatine','Creatine Monohydrate','Nutricost',22,'Amazon','https://www.amazon.com/dp/B00GL2HMES?tag=gymgearcompar-20',7.8,4.6,31000,'Amazon','Cheapest reputable creatine  --  pure monohydrate, nothing else.','Barbend',{'Creatine':'5g','Type':'Monohydrate','Servings':'100','Calories':'0','Price Per Serving':'$0.22'},['Cheapest Option','100 Servings','Pure Monohydrate']),
  p('momentous-creatine','Creatine Monohydrate','Momentous',44,'Momentous','https://livemomentous.com/products/creatine',9.2,4.9,2200,'Momentous','NSF Certified creatine trusted by NFL and NBA athletes.','NFL Players',{'Creatine':'5g','Type':'Monohydrate','NSF Certified':'Yes','Servings':'30','Athletes':'NFL/NBA'},['Pro Athlete Choice','NSF Certified','Premium Brand']),
  p('klean-creatine','Klean Creatine','Klean Athlete',38,'Klean Athlete','https://kleanathlete.com/products/klean-creatine',9.0,4.8,1800,'Klean Athlete','NSF Certified and Informed Sport  --  clean for drug-tested athletes.','Informed Sport',{'Creatine':'5g','Type':'Monohydrate','NSF':'Yes','Informed Sport':'Yes','Servings':'60'},['Informed Sport','Drug Test Safe','NSF Certified']),
  p('con-cret-creatine','CON-CRET Creatine HCl','ProMera Sports',35,'Amazon','https://www.amazon.com/dp/B0BKCVLYGX?tag=gymgearcompar-20',8.2,4.5,4100,'Amazon','HCl form needs smaller dose  --  good for those who bloat on monohydrate.','Examine.com',{'Creatine':'750mg HCl','Dose':'Small','Bloating':'Reduced','Servings':'64','Type':'Hydrochloride'},['No Bloating','Small Dose','HCl Form']),
],

recovery:[
  p('transparent-sleep','Sleep & Recovery','Transparent Labs',59,'Transparent Labs','https://www.transparentlabs.com/products/sleep-and-recovery',9.4,4.9,5600,'Transparent Labs','Best sleep supplement  --  melatonin, ashwagandha, and zinc in one.','Examine.com',{'Melatonin':'3mg','Ashwagandha':'600mg','Zinc':'15mg','GABA':'500mg','Servings':'30'},['Best Formula','Sleep + Recovery','Third Party Tested'],{bestChoice:true}),
  p('legion-lunar','Lunar Sleep Aid','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/lunar/',9.0,4.8,3200,'Legion','Science-based sleep formula with lemon balm and melatonin.','Examine.com',{'Melatonin':'2mg','L-Theanine':'400mg','Lemon Balm':'600mg','GABA':'600mg','Servings':'30'},['Science Based','Natural Ingredients','Non-Habit Forming']),
  p('thorne-amino','Amino Complex','Thorne',55,'Thorne','https://www.thorne.com/products/dp/amino-complex',9.3,4.8,2100,'Thorne','NSF Certified BCAA + EAA complex for elite athlete recovery.','NSF',{'BCAAs':'7g','EAAs':'Yes','NSF Certified':'Yes','Leucine':'3.5g','Servings':'30'},['NSF Certified','Full EAA Profile','Pro Athlete']),
  p('momentous-recovery','Recovery Protein','Momentous',69,'Momentous','https://livemomentous.com/products/recovery',9.1,4.8,1800,'Momentous','Used by NFL teams  --  tart cherry, whey, and creatine combined.','NFL Players',{'Protein':'25g','Tart Cherry':'480mg','Creatine':'3g','NSF Certified':'Yes','Servings':'30'},['NFL Trusted','Tart Cherry','3-in-1 Formula']),
  p('on-bcaa','BCAA 1000 Caps','Optimum Nutrition',28,'Amazon','https://www.amazon.com/dp/B002DYIZIU?tag=gymgearcompar-20',8.5,4.7,22000,'Amazon','Most trusted BCAA  --  convenient capsule form, great price.','Barbend',{'Leucine':'500mg','Isoleucine':'250mg','Valine':'250mg','Servings':'60','Form':'Capsule'},['Capsule Form','Best Seller','Trusted Brand']),
  p('ghost-bcaa','BCAA','Ghost',39,'Ghost','https://ghostlifestyle.com/products/ghost-bcaa',8.7,4.8,8900,'Ghost','Best-tasting BCAA with collab flavors.','Barbend',{'Leucine':'4g','Isoleucine':'2g','Valine':'2g','Hydration':'Yes','Servings':'30'},['Best Taste','Collab Flavors','Plus Hydration'],{salePrice:29}),
  p('klean-bcaa','BCAA + Peak ATP','Klean Athlete',49,'Klean Athlete','https://kleanathlete.com/products/klean-bcaa-peak-atp',9.1,4.8,1200,'Klean Athlete','Informed Sport certified BCAA plus ATP for power output.','Informed Sport',{'BCAAs':'5g','Peak ATP':'400mg','Informed Sport':'Yes','Drug Test Safe':'Yes','Servings':'30'},['Informed Sport','Drug Test Safe','Plus ATP']),
  p('nutricost-glutamine','L-Glutamine Powder','Nutricost',22,'Amazon','https://www.amazon.com/dp/B00SHXE7VK?tag=gymgearcompar-20',7.8,4.5,14000,'Amazon','Cheapest glutamine for gut health and muscle recovery.','Examine.com',{'Glutamine':'5g','Type':'L-Glutamine','Servings':'100','Calories':'0','Price Per Serving':'$0.22'},['Cheapest Option','100 Servings','Pure Glutamine']),
],

vitamins:[
  p('thorne-basics','Basic Nutrients 2/Day','Thorne',45,'Thorne','https://www.thorne.com/products/dp/basic-nutrients-2-day',9.4,4.9,3200,'Thorne','NSF Certified multivitamin trusted by pro sports teams.','NSF',{'Servings':'60 capsules','NSF Certified':'Yes','Athletes':'Pro Sports','Form':'Capsule','Third Party':'Yes'},['NSF Certified','Pro Sports Teams','Clean Formula'],{bestChoice:true}),
  p('ag1','Athletic Greens AG1','AG1',99,'AG1','https://www.athleticgreens.com/products/athletic-greens',9.0,4.7,28000,'AG1','75 vitamins, minerals, and whole-food ingredients in one scoop.','Huberman Lab',{'Ingredients':'75 nutrients','Probiotics':'Yes','Adaptogens':'Yes','Servings':'30','Form':'Powder'},['75 Nutrients','Probiotics Included','All-in-One']),
  p('legion-triumph','Triumph Multivitamin','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/triumph/',9.1,4.8,4100,'Legion','Science-based multivitamin with clinically effective doses.','Examine.com',{'Servings':'30','Form':'Capsule','Evidence Based':'Yes','D3':'Yes','Third Party':'Yes'},['Science Based','Clinically Dosed','Evidence Based']),
  p('momentous-omega3','Omega-3 Fish Oil','Momentous',44,'Momentous','https://livemomentous.com/products/omega-3',9.2,4.9,1800,'Momentous','NSF Certified omega-3 used by NFL and NBA athletes.','NFL Players',{'EPA':'690mg','DHA':'310mg','NSF Certified':'Yes','Source':'Wild Fish','Servings':'45'},['NSF Certified','Pro Athlete','Wild Sourced']),
  p('garden-of-life-mv','Sport Multivitamin','Garden of Life',42,'Amazon','https://www.amazon.com/dp/B00280M14I?tag=gymgearcompar-20',8.8,4.7,12000,'Amazon','Certified for Sport  --  whole-food multivitamin for athletes.','Informed Sport',{'Servings':'30 tablets','Certified Sport':'Yes','Whole Food':'Yes','Non-GMO':'Yes','Probiotics':'Yes'},['Certified Sport','Whole Food','Non-GMO']),
  p('opti-men','Opti-Men Multivitamin','Optimum Nutrition',28,'Amazon','https://www.amazon.com/dp/B00K2RJAR0?tag=gymgearcompar-20',8.0,4.6,45000,'Amazon','Most popular men\'s multivitamin  --  comprehensive and affordable.','Barbend',{'Servings':'90 tablets','Form':'Tablet','Blends':'4 proprietary','Vitamins':'75+ nutrients','Ships':'Prime'},['Most Popular','Men\'s Formula','Affordable'],{salePrice:22}),
  p('ritual-men','Essential for Men','Ritual',45,'Ritual','https://www.ritual.com/products/essential-for-men-multivitamin',8.7,4.7,8900,'Ritual','Minimal ingredient multivitamin with full traceability.','Wirecutter',{'Servings':'30 capsules','Traceable':'Yes','Delayed Release':'Yes','Non-GMO':'Yes','Vegan':'Yes'},['Traceable Ingredients','Delayed Release','Clean Formula']),
  p('klean-mv','Klean Multivitamin','Klean Athlete',38,'Klean Athlete','https://kleanathlete.com/products/klean-multivitamin',9.0,4.8,1200,'Klean Athlete','NSF Certified and Informed Sport  --  safe for drug-tested athletes.','Informed Sport',{'Servings':'60 tablets','NSF Certified':'Yes','Informed Sport':'Yes','Drug Test Safe':'Yes','Athletes':'Olympic'},['Informed Sport','Drug Test Safe','Olympic Athletes']),
],

fatburners:[
  p('transparent-fat','PhysiqueSeries Fat Burner','Transparent Labs',49,'Transparent Labs','https://www.transparentlabs.com/products/physiqueseries-fat-burner',9.3,4.8,8900,'Transparent Labs','Cleanest fat burner  --  fully disclosed, clinically dosed ingredients.','Examine.com',{'Caffeine':'300mg','Green Tea':'500mg','Glucomannan':'3g','Servings':'30','Third Party':'Yes'},['Cleanest Formula','Clinically Dosed','Third Party Tested'],{bestChoice:true}),
  p('ghost-burn','Ghost Burn','Ghost',49,'Ghost','https://ghostlifestyle.com/products/ghost-burn',8.8,4.7,6200,'Ghost','Best tasting fat burner  --  collab flavors with real ingredients.','Barbend',{'Caffeine':'150mg','L-Carnitine':'750mg','Acetyl-L-Carnitine':'750mg','Servings':'60','Flavors':'Collab'},['Best Taste','Stim Lite','Collab Flavors']),
  p('jym-shred','Shred JYM','JYM',40,'Amazon','https://www.amazon.com/dp/B01HGQZZUK?tag=gymgearcompar-20',8.5,4.7,12000,'Amazon','Science-based formula by Dr. Jim Stoppani  --  no proprietary blends.','Dr. Jim Stoppani',{'Caffeine':'200mg','CLA':'1.5g','L-Carnitine':'2g','Servings':'30','Blends':'None'},['Science Based','No Prop Blends','Dr. Stoppani Formula']),
  p('legion-phoenix','Phoenix Fat Burner','Legion',49,'Legion','https://www.legionathletics.com/products/supplements/phoenix/',9.0,4.8,5400,'Legion','Stim-free fat burner with clinically effective doses.','Examine.com',{'Caffeine':'0mg','Synephrine':'25mg','Forskolin':'50mg','Servings':'30','Stim Free':'Yes'},['Stim Free','Clinically Dosed','Science Based']),
  p('evl-engn-shred','ENGN Shred Pre-Workout','Evlution Nutrition',35,'Amazon','https://www.amazon.com/dp/B01N7HT0F0?tag=gymgearcompar-20',7.8,4.5,8900,'Amazon','Pre-workout plus fat burner combo  --  two products in one.','Barbend',{'Caffeine':'250mg','L-Carnitine':'500mg','CLA':'500mg','Servings':'30','Combo':'Pre + Fat Burner'},['2-in-1 Formula','Pre+Fat Burner','Affordable'],{salePrice:25}),
  p('cellucor-clk','CLK Stimulant-Free','Cellucor',35,'Amazon','https://www.amazon.com/dp/B00ULNW9UK?tag=gymgearcompar-20',7.5,4.4,6700,'Amazon','Stimulant-free fat burner focused on CLA and L-carnitine.','Barbend',{'Caffeine':'0mg','CLA':'1g','L-Carnitine':'1.5g','Servings':'90','Stim Free':'Yes'},['Stim Free','CLA + Carnitine','90 Servings']),
  p('animal-cuts','Animal Cuts','Animal',49,'Amazon','https://www.amazon.com/dp/B000GOO00Q?tag=gymgearcompar-20',8.2,4.6,22000,'Amazon','Bodybuilder-favorite thermogenic  --  comprehensive stacked formula.','Generation Iron',{'Caffeine':'200mg','Thermogenics':'8 compounds','Diuretics':'Yes','Servings':'42','Culture':'Bodybuilding'},['Bodybuilder Favorite','Thermogenic Stack','Comprehensive Formula']),
  p('mhp-thyro-slim','Thyro-Slim AM PM','MHP',42,'Amazon','https://www.amazon.com/dp/B005JMT1K4?tag=gymgearcompar-20',7.8,4.4,2100,'Amazon','Day/night formula targeting metabolism around the clock.','Barbend',{'AM Caffeine':'200mg','PM Caffeine':'0mg','System':'AM/PM Split','Servings':'30 days','Thyroid Support':'Yes'},['AM/PM System','Thyroid Support','24hr Metabolism']),
],

belts:[
  p('inzer-forever-belt','Forever Lever Belt','Inzer',129,'Inzer','https://www.inzernet.com/products/forever-lever-belt',9.6,4.9,4200,'Inzer','The gold standard powerlifting belt  --  used by world record holders.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','IPF Approved':'Yes'},['IPF Approved','10mm Thick','Lever Buckle'],{bestChoice:true}),
  p('rogue-ohio-belt','Ohio Lifting Belt','Rogue Fitness',170,'Rogue Fitness','https://www.roguefitness.com/rogue-ohio-lifting-belt',9.3,4.8,1800,'Rogue Fitness','Premium American-made leather belt, perfectly broken in.','Garage Gym Reviews',{'Thickness':'10mm','Width':'4"','Closure':'Prong','Material':'Leather','Made In':'USA'},['American Made','10mm Thick','2-Prong Buckle']),
  p('sbd-belt','Powerlifting Belt','SBD',175,'SBD','https://www.sbdapparel.com/collections/belts',9.5,4.9,2100,'SBD','The preferred belt of world champion powerlifters  --  built to last a lifetime.','Barbend',{'Thickness':'13mm','Width':'4"','Closure':'Lever','Material':'Leather','IPF Approved':'Yes'},['IPF World Record Use','13mm Thick','Lever Buckle']),
  p('pioneer-gc-belt','General Cut Belt','Pioneer Fitness',115,'Pioneer Fitness','https://www.pioneerfitness.net/collections/powerlifting-belts',9.1,4.9,890,'Pioneer Fitness','Handcrafted in USA  --  custom sizing available, exceptional quality.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Prong','Material':'Leather','Custom Sizing':'Yes'},['Handcrafted USA','Custom Sizes','Premium Leather']),
  p('gymreapers-lever-belt','10mm Lever Belt','Gymreapers',89,'Amazon','https://www.amazon.com/dp/B081VVFSJF?tag=gymgearcompar-20',8.8,4.7,9500,'Amazon','Best value lever belt under $100  --  thick leather, solid hardware.','Barbend',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','Break-In':'Minimal'},['Best Under $100','Lever Buckle','Thick Leather']),
  p('schiek-2004-belt','Model 2004 Contour Belt','Schiek Sports',65,'Amazon','https://www.amazon.com/dp/B08LHDJK6F?tag=gymgearcompar-20',8.6,4.7,15000,'Amazon','Contoured nylon belt  --  best for Olympic lifting and CrossFit.','Garage Gym Reviews',{'Thickness':'6mm','Width':'4" back / 2.5" front','Closure':'Double Prong','Material':'Nylon','Type':'Contoured'},['Contoured Shape','Olympic Lifting','CrossFit Popular']),
  p('harbinger-foam-belt','Padded Nylon Belt','Harbinger',30,'Amazon','https://www.amazon.com/dp/B00074H7PA?tag=gymgearcompar-20',8.0,4.6,32000,'Amazon','Best beginner belt  --  comfortable, affordable, widely available.','Bodybuilding.com',{'Thickness':'4mm','Width':'6" back','Closure':'Velcro + Prong','Material':'Nylon','Padding':'Foam'},['Great For Beginners','Most Affordable','Foam Padded']),
  p('element26-belt','Self-Locking Belt','Element 26',75,'Amazon','https://www.amazon.com/dp/B079ZP3MH1?tag=gymgearcompar-20',8.7,4.8,6200,'Amazon','Unique self-locking mechanism  --  quickest on and off of any belt.','Garage Gym Reviews',{'Thickness':'10mm','Width':'4"','Closure':'Self-Lock','Material':'Leather','Release':'One-Hand'},['Self-Locking','One-Hand Release','10mm Leather']),
  p('dark-iron-belt','Premium Genuine Leather Belt','Dark Iron Fitness',35,'Amazon','https://www.amazon.com/dp/B0DQDV5PBF?tag=gymgearcompar-20',7.8,4.5,18000,'Amazon','Genuine leather at a budget price  --  solid entry-level belt.','Barbend',{'Thickness':'6mm','Width':'4"','Closure':'Prong','Material':'Genuine Leather','Sizes':'S-XXXL'},['Budget Leather','Genuine Hide','Entry Level'],{salePrice:28}),
  p('bells-lever-belt','Lever Belt 10mm','Bells of Steel',89,'Bells of Steel','https://www.bellsofsteel.com/all-products/accessories/lifting-belts/',8.9,4.8,760,'Bells of Steel','Canadian-made lever belt with lifetime warranty at a fair price.','Garage Gym Lab',{'Thickness':'10mm','Width':'4"','Closure':'Lever','Material':'Leather','Warranty':'Lifetime'},['Lifetime Warranty','Canadian Made','Lever Buckle']),
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
  p('pioneer-straps','Leather Lifting Straps','Pioneer Fitness',35,'Pioneer Fitness','https://www.pioneerfitness.net',8.8,4.8,420,'Pioneer Fitness','Handcrafted leather straps  --  virtually indestructible, last decades.','Garage Gym Reviews',{'Material':'Leather','Length':'24"','Width':'2"','Type':'Loop','Made In':'USA'},['Handcrafted USA','Leather Built','Indestructible']),
  p('serious-steel-straps','Cotton Lifting Straps','Serious Steel',12,'Amazon','https://www.amazon.com/dp/B00S553RMK?tag=gymgearcompar-20',7.9,4.5,3800,'Amazon','No-frills heavy cotton  --  best value per dollar for basic straps.','Garage Gym Reviews',{'Material':'Cotton','Length':'24"','Width':'1.5"','Type':'Loop','Pack':'Pair'},['Best Value','Heavy Cotton','No Frills']),
],

wraps:[
  p('sbd-wrist-wraps','Wrist Wraps','SBD',65,'SBD','https://www.sbdapparel.com/collections/wrist-wraps',9.4,4.9,3100,'SBD','Used by the world\'s top powerlifters  --  stiff, supportive, IPF approved.','Barbend',{'Stiffness':'Stiff','Length':'50cm','IPF Approved':'Yes','Material':'Cotton/Elastic','Warranty':'5 Year'},['IPF Approved','Competition Grade','World Record Use'],{bestChoice:true}),
  p('rogue-wrist-wraps','USA Wrist Wraps','Rogue Fitness',35,'Rogue Fitness','https://www.roguefitness.com/rogue-wrist-wraps',9.0,4.8,2800,'Rogue Fitness','American-made cotton wraps with solid stiffness  --  Rogue quality.','Garage Gym Reviews',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton','Made In':'USA','Thumb Loop':'Yes'},['American Made','Medium-Stiff','Rogue Quality']),
  p('inzer-true-black-wraps','True Black Wrist Wraps','Inzer',28,'Inzer','https://www.inzernet.com/products/true-black-wrist-wraps',9.1,4.9,1900,'Inzer','Competition-grade elastic wraps from a trusted powerlifting brand.','Barbend',{'Stiffness':'Stiff','Length':'20"','Material':'Elastic Cotton','IPF Approved':'Yes','Type':'Competition'},['IPF Approved','Very Stiff','Inzer Quality']),
  p('gymreapers-wrist-wraps','Wrist Wraps 18"','Gymreapers',25,'Amazon','https://www.amazon.com/dp/B07BSQSWJF?tag=gymgearcompar-20',8.7,4.7,14000,'Amazon','Best budget competition-style wraps  --  stiff support at half the price.','Barbend',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton/Elastic','Thumb Loop':'Yes','Value':'High'},['Best Budget','Medium-Stiff','Great Value']),
  p('mark-bell-wraps','Gangsta Wrist Wraps','Mark Bell Sling Shot',30,'Amazon','https://www.amazon.com/dp/B07CQQ73TX?tag=gymgearcompar-20',8.8,4.8,7500,'Amazon','Extra stiff wraps designed by powerlifting legend Mark Bell.','Barbend',{'Stiffness':'Extra Stiff','Length':'18"','Material':'Cotton/Elastic','Endorsed':'Mark Bell','Type':'Powerlifting'},['Extra Stiff','Mark Bell Design','Powerlifting']),
  p('schiek-1100tt-wraps','Platinum Series Wrist Wraps','Schiek Sports',25,'Amazon','https://www.amazon.com/dp/B0011802YO?tag=gymgearcompar-20',8.5,4.7,9200,'Amazon','Firm elastic wraps popular with bodybuilders and powerlifters alike.','Bodybuilding.com',{'Stiffness':'Firm','Length':'18"','Material':'Elastic','Colors':'Multiple','Type':'Universal'},['Firm Support','Universal Use','Color Options']),
  p('iron-bull-wraps','Extreme Wrist Wraps','Iron Bull Strength',20,'Amazon','https://www.amazon.com/dp/B07C4HKMMD?tag=gymgearcompar-20',8.3,4.6,8800,'Amazon','Thick elastic wraps with a thumb loop  --  solid budget option.','Barbend',{'Stiffness':'Medium','Length':'18"','Material':'Elastic Cotton','Thumb Loop':'Yes','Velcro':'Heavy Duty'},['Budget Pick','Thick Elastic','Thumb Loop'],{salePrice:16}),
  p('stoic-wrist-wraps','Wrist Wraps','Stoic',22,'Amazon','https://www.amazon.com/dp/B09PVL69L3?tag=gymgearcompar-20',8.4,4.7,4600,'Amazon','Clean minimalist wraps with great stiffness-to-price ratio.','Garage Gym Reviews',{'Stiffness':'Medium-Stiff','Length':'18"','Material':'Cotton/Elastic','Design':'Minimal','Colors':'Black'},['Clean Design','Medium-Stiff','Great Value']),
  p('harbinger-wraps','Wrist Wraps Pro','Harbinger',12,'Amazon','https://www.amazon.com/dp/B09PVL69L3?tag=gymgearcompar-20',7.8,4.5,22000,'Amazon','Most accessible wraps  --  found everywhere, great for casual lifters.','Bodybuilding.com',{'Stiffness':'Light-Medium','Length':'18"','Material':'Cotton/Elastic','Type':'General Training','Beginner':'Yes'},['Widely Available','Beginner Friendly','Affordable']),
  p('wod-nation-wraps','Wrist Wraps','WOD Nation',18,'Amazon','https://www.amazon.com/dp/B017BO1MGI?tag=gymgearcompar-20',8.0,4.6,11000,'Amazon','CrossFit-focused wraps  --  flexible support for high-rep movements.','Barbend',{'Stiffness':'Flexible','Length':'18"','Material':'Cotton/Elastic','Sport':'CrossFit','Thumb Loop':'Yes'},['CrossFit Focused','Flexible Support','Thumb Loop']),
],

sleeves:[
  p('sbd-knee-sleeves','Knee Sleeves 7mm','SBD',90,'SBD','https://www.sbdapparel.com/collections/knee-sleeves',9.5,4.9,2900,'SBD','The gold standard powerlifting sleeve  --  maximal support, IPF approved.','Barbend',{'Thickness':'7mm','Material':'Neoprene','IPF Approved':'Yes','Stiffness':'Very Stiff','Warranty':'Lifetime'},['IPF Approved','Maximum Support','World Record Use'],{bestChoice:true}),
  p('rehband-rx-sleeves','RX Knee Sleeve 7mm','Rehband',80,'Amazon','https://www.amazon.com/dp/B01LDGLA5I?tag=gymgearcompar-20',9.2,4.8,12000,'Amazon','Medical-grade neoprene  --  the most trusted knee sleeve in CrossFit.','Garage Gym Reviews',{'Thickness':'7mm','Material':'Medical Neoprene','Sport':'CrossFit/PL','Compression':'High','Swedish Made':'Yes'},['Medical Grade','CrossFit Favorite','Swedish Quality']),
  p('sbd-sleeves','Knee Sleeves 7mm','SBD',109,'SBD','https://sbdapparel.com/products/sbd-knee-sleeves',10,5.0,1800,'Powerlifting.sport','IPF world record sleeves  --  the gold standard for competitive powerlifting.','Powerlifting.sport',{'Thickness':'7mm','IPF Approved':'Yes','IWF Approved':'Yes','Stiffness':'Max','Origin':'UK'},['IPF Approved','Competition Gold Standard','Max Stiffness'],{bestChoice:true}),
  p('stoic-knee-sleeves','Knee Sleeves 7mm','Stoic',55,'Amazon','https://www.amazon.com/dp/B07BZR9365?tag=gymgearcompar-20',8.9,4.8,6700,'Amazon','Best value 7mm sleeve  --  rivals SBD and Rehband at a fraction of the cost.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Stiff','Value':'Excellent','Sport':'Powerlifting'},['Best Value','7mm Thick','Rivals Premium Brands']),
  p('rogue-knee-sleeves','Knee Sleeves 5mm','Rogue Fitness',50,'Rogue Fitness','https://www.roguefitness.com/rogue-knee-sleeves',8.7,4.7,3200,'Rogue Fitness','5mm sleeves ideal for Olympic lifting and moderate support during squats.','Garage Gym Reviews',{'Thickness':'5mm','Material':'Neoprene','Stiffness':'Moderate','Sport':'Olympic/CrossFit','Made In':'USA'},['American Made','5mm Moderate','Olympic Lifting']),
  p('gymreapers-knee-sleeves','Knee Sleeves 7mm','Gymreapers',40,'Amazon','https://www.amazon.com/dp/B01G6C1R9I?tag=gymgearcompar-20',8.6,4.7,18000,'Amazon','Best budget 7mm sleeve  --  stiff neoprene support at an unbeatable price.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Stiff','Value':'High','Pack':'Pair'},['Best Budget','7mm Thick','Best Price'],{salePrice:32}),
  p('mark-bell-knee-sleeve','Hip Circle Knee Sleeve','Mark Bell Sling Shot',60,'Amazon','https://www.amazon.com/dp/B01C7EJSK4?tag=gymgearcompar-20',8.8,4.8,5400,'Amazon','Stiffer than average  --  designed for max knee support on heavy squats.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Extra Stiff','Designer':'Mark Bell','Use':'Heavy Squat'},['Extra Stiff','Heavy Squat','Mark Bell Design']),
  p('bear-komplex-sleeves','Knee Sleeves 7mm','Bear Komplex',45,'Amazon','https://www.amazon.com/dp/B016NF2CKG?tag=gymgearcompar-20',8.5,4.7,7800,'Amazon','CrossFit-popular sleeve with good compression and a clean design.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Sport':'CrossFit','Design':'Clean','Colors':'Multiple'},['CrossFit Popular','Clean Design','Multiple Colors']),
  p('iron-bull-sleeves','Knee Sleeves 7mm','Iron Bull Strength',30,'Amazon','https://www.amazon.com/dp/B01H434BQY?tag=gymgearcompar-20',8.1,4.6,9300,'Amazon','Great entry-level 7mm sleeve  --  solid compression without the premium price.','Barbend',{'Thickness':'7mm','Material':'Neoprene','Stiffness':'Moderate-Stiff','Value':'Best Budget','Pack':'Pair'},['Entry Level','7mm Budget','Good Compression'],{salePrice:22}),
  p('pioneer-knee-sleeves','Knee Sleeves 7mm','Pioneer Fitness',65,'Pioneer Fitness','https://www.pioneerfitness.net',8.9,4.8,380,'Pioneer Fitness','Handcrafted USA sleeves  --  extremely dense neoprene, built to outlast anything.','Garage Gym Reviews',{'Thickness':'7mm','Material':'Dense Neoprene','Made In':'USA','Stiffness':'Very Stiff','Durability':'Excellent'},['Handcrafted USA','Dense Neoprene','Extremely Durable']),
  p('harbinger-knee-sleeves','Knee Sleeve 5mm','Harbinger',20,'Amazon','https://www.amazon.com/dp/B0DDK4P8QL?tag=gymgearcompar-20',7.8,4.5,14000,'Amazon','Light 5mm sleeve  --  best for warmth and mild support during general training.','Bodybuilding.com',{'Thickness':'5mm','Material':'Neoprene','Stiffness':'Light','Use':'General Training','Beginner':'Yes'},['Beginner Friendly','Mild Support','Widely Available']),
],

chalk:[
  p('frictionlabs-loose','Unicorn Dust Loose Chalk','Friction Labs',20,'Friction Labs','https://frictionlabs.com/products/unicorn-dust',9.5,4.9,7800,'Friction Labs','The purest, driest chalk on the market  --  used by Olympic athletes worldwide.','Barbend',{'Type':'Loose','Weight':'250g','Purity':'Ultra-Pure MgCO3','Format':'Loose Powder','Pro Athletes':'Yes'},['Olympic Athletes','Ultra Pure','Driest Chalk'],{bestChoice:true}),
  p('frictionlabs-secret-stuff','Secret Stuff Liquid Chalk','Friction Labs',28,'Friction Labs','https://frictionlabs.com/products/secret-stuff-liquid-chalk',9.3,4.8,5200,'Friction Labs','Best liquid chalk available  --  goes on dry, lasts all session without reapplying.','Garage Gym Reviews',{'Type':'Liquid','Volume':'1 fl oz','Dries':'Fast','Mess':'Minimal','Reapply':'Rarely'},['Liquid Formula','Long Lasting','No Mess']),
  p('black-diamond-chalk','Super Chalk Loose','Black Diamond',8,'Amazon','https://www.amazon.com/dp/B001A5TD70?tag=gymgearcompar-20',8.8,4.8,31000,'Amazon','The climber\'s favorite  --  ultra-fine, trusted by athletes in every sport.','Barbend',{'Type':'Loose','Weight':'100g','Purity':'High','Format':'Chalk Ball Option','Origin':'Climbing'},['Most Popular','Climber Tested','Ultra Fine'],{salePrice:6}),
  p('primo-chalk','Primo Chalk Block','Primo Chalk',20,'Amazon','https://www.amazon.com/dp/B00EWOD96C?tag=gymgearcompar-20',9.0,4.8,4100,'Amazon','Virtually dustless chalk blocks  --  stay whiter, last longer, less waste.','Garage Gym Reviews',{'Type':'Block','Weight':'8 x 2oz blocks','Dust':'Minimal','Format':'Block','Value':'High'},['Virtually Dustless','Block Format','Lasts Longer']),
  p('tension-chalk','Chalk Block 2oz','Tension Climbing',16,'Amazon','https://www.amazon.com/dp/B004HXDFSK?tag=gymgearcompar-20',8.7,4.7,3600,'Amazon','Dry, high-purity chalk from a climbing brand trusted by gym athletes.','Barbend',{'Type':'Block','Weight':'2oz','Purity':'High','Format':'Block','Dust':'Low'},['Dry Formula','Low Dust','High Purity']),
  p('carbon-black-chalk','Liquid Chalk','Carbon Black',15,'Amazon','https://www.amazon.com/dp/B009M3OEV2?tag=gymgearcompar-20',8.5,4.6,6800,'Amazon','Budget liquid chalk  --  fast drying, works great for lifting and CrossFit.','Barbend',{'Type':'Liquid','Volume':'200ml','Dries':'Fast','Mess':'None','Sport':'Lifting/CrossFit'},['Budget Liquid','Fast Drying','No Mess'],{salePrice:11}),
  p('metolius-chalk','Super Chalk Block','Metolius',10,'Amazon','https://www.amazon.com/dp/B004HXDFSK?tag=gymgearcompar-20',8.6,4.7,12000,'Amazon','Classic chalk block  --  reliable, widely used, very affordable.','Barbend',{'Type':'Block','Weight':'1lb block','Purity':'Standard','Format':'Block','Value':'High'},['Classic Block','1lb Value','Reliable']),
  p('spri-chalk-ball','Chalk Ball','SPRI',12,'Amazon','https://www.amazon.com/dp/B07R92TWRJ?tag=gymgearcompar-20',8.0,4.5,9400,'Amazon','Mesh chalk ball  --  controlled application, less mess than loose chalk.','Bodybuilding.com',{'Type':'Ball','Weight':'50g','Mess':'Minimal','Format':'Ball','Reusable':'Yes'},['Chalk Ball','Mess-Free Apply','Gym Friendly']),
  p('liquid-grip-chalk','Liquid Grip','Liquid Grip',18,'Amazon','https://www.amazon.com/dp/B007WTQIDU?tag=gymgearcompar-20',8.4,4.6,8700,'Amazon','Rosin-based liquid grip  --  exceptional tackiness outlasting traditional chalk.','Barbend',{'Type':'Liquid','Base':'Rosin + Chalk','Tackiness':'Very High','Volume':'250ml','Sport':'Multi-Sport'},['Rosin Based','Extra Tacky','Multi-Sport']),
  p('weightlifting-house-chalk','Loose Chalk 1kg','Weightlifting House',15,'Weightlifting House','https://www.weightliftinghouse.com',8.3,4.7,1200,'Weightlifting House','Bulk chalk for serious lifters  --  pure magnesium carbonate by the kilo.','Garage Gym Reviews',{'Type':'Loose','Weight':'1kg','Purity':'Pure MgCO3','Format':'Bulk','Value':'Best Bulk'},['Bulk Value','1kg Block','Pure MgCO3']),
],

yogamats:[
  p('lululemon-mat','The Reversible Mat 5mm','Lululemon',88,'Lululemon','https://shop.lululemon.com/p/yoga-mats/The-Reversible-Mat-5mm',9.4,4.8,14000,'Lululemon','Best overall yoga mat  --  grippy, durable, two-sided texture.','Yoga Journal',{'Thickness':'5mm','Material':'Natural Rubber','Length':'71"','Width':'26"','Weight':'4.5 lbs'},['Best Overall','Two-Sided','Natural Rubber'],{bestChoice:true}),
  p('manduka-pro','PRO Yoga Mat','Manduka',120,'Manduka','https://www.manduka.com/products/pro-yoga-mat-6mm',9.6,4.9,8200,'Manduka','Lifetime guarantee  --  the last mat you will ever buy.','Yoga Journal',{'Thickness':'6mm','Material':'PVC','Length':'71"','Width':'26"','Guarantee':'Lifetime'},['Lifetime Guarantee','Ultra Dense','Professional Grade']),
  p('jade-harmony','Harmony Yoga Mat','Jade Yoga',79,'Jade Yoga','https://jadeyoga.com/products/harmony-mat',9.0,4.8,6400,'Jade Yoga','Best eco-friendly mat  --  natural rubber, plants a tree per mat sold.','Yoga Journal',{'Thickness':'3/16"','Material':'Natural Rubber','Length':'68"','Width':'24"','Eco':'Yes'},['Eco Friendly','Plants A Tree','Natural Rubber']),
  p('gaiam-premium','Premium Solid Yoga Mat','Gaiam',35,'Amazon','https://www.amazon.com/dp/B078P4H7VN?tag=gymgearcompar-20',7.8,4.5,42000,'Amazon','Best budget mat  --  lightweight, sticky, great for beginners.','Wirecutter',{'Thickness':'6mm','Material':'PVC','Length':'68"','Width':'24"','Weight':'2.5 lbs'},['Best Budget','Lightweight','Beginner Friendly'],{salePrice:28}),
  p('alo-warrior','Warrior Mat','Alo Yoga',114,'Alo Yoga','https://www.aloyoga.com/products/warrior-yoga-mat',8.8,4.7,3200,'Alo Yoga','Premium polyurethane top layer  --  exceptional grip even when sweaty.','Yoga Journal',{'Thickness':'5mm','Material':'Polyurethane/Rubber','Length':'72"','Width':'26"','Grip':'Excellent'},['Sweat Proof Grip','PU Top Layer','Premium Feel']),
  p('liforme-original','Original Yoga Mat','Liforme',150,'Liforme','https://liforme.com/products/original-yoga-mat',9.2,4.8,2100,'Yoga Journal',{'Thickness':'4.2mm','Material':'Natural Rubber','Length':'73"','Width':'27"','Alignment Lines':'Yes'},'Widest mat with alignment markers  --  best for beginners learning positioning.','Yoga Journal',['Alignment Markers','Widest Mat','Natural Rubber']),
  p('yune-tohi','Tohi Yoga Mat','Yune Yoga',69,'Yune Yoga','https://yuneyoga.com/products/tohi-yoga-mat',8.4,4.6,1800,'Yoga Journal',{'Thickness':'4mm','Material':'TPE','Length':'72"','Width':'24"','Foldable':'Yes'},'Lightweight TPE mat  --  best for travel and studio-to-gym.','Yoga Journal',['Travel Friendly','Lightweight','TPE Material']),
  p('amazon-basics-mat','Extra Thick Yoga Mat','Amazon Basics',25,'Amazon','https://www.amazon.com/dp/B0116Q6WRW?tag=gymgearcompar-20',6.5,4.3,89000,'Amazon','Thickest budget mat  --  great for floor exercises and low-impact workouts.','Wirecutter',{'Thickness':'13mm','Material':'NBR Foam','Length':'71"','Width':'24"','Weight':'3 lbs'},['Thickest Budget','Cushioned','Floor Exercises']),
],

foamrollers:[
  p('trigger-point-grid','GRID Foam Roller','TriggerPoint',37,'Amazon','https://www.amazon.com/dp/B0040EGNIU?tag=gymgearcompar-20',9.2,4.7,38000,'Amazon','Best overall foam roller  --  patented GRID surface, hollow core, built to last.','Wirecutter',{'Diameter':'5.5"','Length':'13"','Density':'Firm','Core':'Hollow','Made In':'USA'},['Best Overall','GRID Surface','Hollow Core'],{bestChoice:true}),
  p('rumble-roller','Original Rumble Roller','RumbleRoller',55,'Amazon','https://www.amazon.com/dp/B00BKPQXPQ?tag=gymgearcompar-20',9.0,4.7,12000,'Amazon','Deepest tissue massage  --  firm nubs dig into knots like no flat roller can.','Barbend',{'Diameter':'6"','Length':'12"','Nubs':'Yes','Density':'Extra Firm','Best For':'Deep Tissue'},['Deep Tissue','Firm Nubs','Intense Relief']),
  p('hyperice-vyper','Vyper 3 Vibrating Roller','Hyperice',199,'Hyperice','https://hyperice.com/products/vyper-3',9.4,4.7,4200,'Wirecutter','Best vibrating foam roller  --  3 speed settings, dramatically speeds recovery.','Wirecutter',{'Vibration':'3 Speeds','Battery':'2 hrs','Diameter':'6"','Length':'13"','Charge':'USB-C'},['Vibrating','3 Speeds','Tech Recovery']),
  p('lux-fit-roller','Premium High Density Roller','LuxFit',18,'Amazon','https://www.amazon.com/dp/B00MKEH2OC?tag=gymgearcompar-20',7.8,4.5,67000,'Amazon','Best budget roller  --  simple, firm, does the job.','Wirecutter',{'Diameter':'6"','Length':'12"','Density':'High','Core':'EVA Foam','Colors':'Multiple'},['Best Budget','High Density','Simple & Effective'],{salePrice:14}),
  p('the-stick','Stick Body Massager','The Stick',30,'Amazon','https://www.amazon.com/dp/B000F9HBJ6?tag=gymgearcompar-20',8.5,4.6,8900,'Amazon','Best travel recovery tool  --  roller stick for targeted muscle groups on the go.','Barbend',{'Type':'Stick','Length':'17"','Spindles':'19','Flexible':'Yes','Best For':'Travel'},['Travel Friendly','Targeted Massage','Classic Design']),
  p('tptherapy-mb1','Massage Ball','TriggerPoint',12,'Amazon','https://www.amazon.com/dp/B00GPKBFGU?tag=gymgearcompar-20',8.8,4.7,22000,'Amazon','Best massage ball  --  pinpoint trigger points in shoulders, hips, feet.','Barbend',{'Type':'Ball','Diameter':'2.6"','Material':'EVA Foam','Best For':'Trigger Points','Portable':'Yes'},['Pinpoint Relief','Portable','Trigger Points']),
  p('amazon-basics-roller','Foam Roller 36"','Amazon Basics',22,'Amazon','https://www.amazon.com/dp/B00XM2MRGI?tag=gymgearcompar-20',7.5,4.4,31000,'Amazon','Full-length budget roller  --  36 inch covers whole back in one pass.','Barbend',{'Diameter':'6"','Length':'36"','Density':'Medium','Material':'EVA','Best For':'Back'},['Full Length 36"','Back Coverage','Budget Pick']),
  p('theraband-roller','Foam Roller','TheraBand',29,'Amazon','https://www.amazon.com/dp/B006XLUP72?tag=gymgearcompar-20',8.2,4.6,15000,'Amazon','Physical therapist recommended  --  trusted by clinics and home users alike.','Physical Therapy Choice',{'Diameter':'6"','Length':'12"','Density':'Firm','Texture':'Smooth','PT Approved':'Yes'},['PT Recommended','Smooth Surface','Clinic Trusted']),
],

gymbags:[
  p('nike-hoops-elite','Hoops Elite Backpack','Nike',90,'Nike','https://www.nike.com/t/hoops-elite-backpack',8.8,4.7,18000,'Nike','Best overall gym backpack  --  laptop sleeve, wet/dry pockets, handles everything.','Wirecutter',{'Volume':'32L','Laptop':'Yes','Wet Pocket':'Yes','Material':'Polyester','Weight':'1.8 lbs'},['Best Overall','Laptop Sleeve','Wet/Dry Pocket'],{bestChoice:true}),
  p('ua-undeniable','Undeniable 5.0 Duffle','Under Armour',45,'Amazon','https://www.amazon.com/dp/B08N3PDRJF?tag=gymgearcompar-20',8.5,4.7,24000,'Amazon','Best duffel bag  --  water-resistant, vented shoe pocket, tons of room.','Wirecutter',{'Volume':'Medium','Shoe Pocket':'Yes','Water Resistant':'Yes','Carry':'Duffel + Straps','Sizes':'XS-XL'},['Best Duffel','Shoe Pocket','Water Resistant'],{salePrice:38}),
  p('gymshark-gym-bag','Everyday Gym Bag','Gymshark',55,'Gymshark','https://www.gymshark.com/products/gymshark-everyday-gym-bag',8.4,4.6,6200,'Gymshark','Cleanest aesthetic bag  --  minimal logo, 40L capacity.','Barbend',{'Volume':'40L','Laptop':'No','Shoe Pocket':'No','Material':'Polyester','Carry':'Duffle'},['Clean Aesthetic','40L Capacity','Minimalist']),
  p('adidas-defender','Defender 4 Duffel','Adidas',35,'Amazon','https://www.amazon.com/dp/B08JV38DFR?tag=gymgearcompar-20',7.8,4.5,31000,'Amazon','Best budget gym bag  --  tough, spacious, fits everything.','Wirecutter',{'Volume':'Large','Shoe Pocket':'No','Water Resistant':'Some','Carry':'Duffel','Material':'100% Polyester'},['Best Budget','Extra Large','Tough Build']),
  p('lululemon-belt-bag','Everywhere Belt Bag 1L','Lululemon',38,'Lululemon','https://shop.lululemon.com/p/bags/Everywhere-Belt-Bag-1L',8.9,4.8,47000,'Lululemon','Best belt bag  --  crossbody or waist, water-repellent, fits essentials.','Wirecutter',{'Volume':'1L','Water Repellent':'Yes','Carry':'Belt or Crossbody','Pockets':'2','Strap':'Adjustable'},['Belt or Crossbody','Water Repellent','Compact']),
  p('osprey-daylite','Daylite Backpack','Osprey',65,'Amazon','https://www.amazon.com/dp/B07TWCCLKC?tag=gymgearcompar-20',9.0,4.8,14000,'Amazon','Best hiking-to-gym backpack  --  suspension system, laptop sleeve, ultralight.','Wirecutter',{'Volume':'13L','Laptop':'Yes','Suspension':'AirScoop','Weight':'0.97 lbs','Attach System':'Yes'},['Ultralight','AirScoop Suspension','Versatile']),
  p('nike-brasilia','Brasilia 9.5 Training Duffle','Nike',35,'Amazon','https://www.amazon.com/dp/B094HB7TVD?tag=gymgearcompar-20',8.0,4.6,28000,'Amazon','Best entry-level Nike bag  --  shoe compartment, adjustable strap, classic.','Barbend',{'Volume':'Medium','Shoe Compartment':'Yes','Carry':'Duffel','Material':'Polyester','Zipper':'Dual'},['Shoe Compartment','Affordable Nike','Classic Look']),
  p('goruck-kit-bag','Kit Bag','GORUCK',150,'GORUCK','https://www.goruck.com/products/kit-bag',9.5,4.9,2100,'Barbend','Most durable gym bag ever made  --  mil-spec 1000D Cordura, lifetime guarantee.','Barbend',{'Volume':'34L','Material':'1000D Cordura','Made In':'USA','Guarantee':'Lifetime','Carry':'Duffel + Backpack'},['Mil-Spec Build','Lifetime Guarantee','American Made']),
],

jumpropes:[
  p('rx-smart-gear-rope','Elite EVO Jump Rope','RX Smart Gear',59,'RX Smart Gear','https://www.rxsmartgear.com/products/elite-evo-jump-rope',9.3,4.8,4200,'Barbend','Best rope for double-unders  --  weighted handles, customizable cable length.','Barbend',{'Handle':'Weighted','Cable':'Steel','Bearings':'Sealed','Customizable':'Yes','Best For':'Double Unders'},['Best for DUs','Weighted Handles','Customizable'],{bestChoice:true}),
  p('crossrope-get-lean','Get Lean Set','Crossrope',108,'Crossrope','https://www.crossrope.com/products/get-lean-bundle',9.0,4.8,6800,'Wirecutter','Best weighted rope system  --  interchangeable rope weights for progressive overload.','Wirecutter',{'Weights':'1/4 lb + 1/2 lb','Handle':'Locking Clip','Cable':'Steel','App':'Yes','Swappable':'Yes'},['Interchangeable','Progressive Overload','App Connected']),
  p('wod-nation-speed-rope','Speed Jump Rope','WOD Nation',15,'Amazon','https://www.amazon.com/dp/B01LYH50VD?tag=gymgearcompar-20',8.2,4.5,42000,'Amazon','Best budget speed rope  --  ball bearings, adjustable, 3 cables included.','Barbend',{'Cable':'Steel','Bearings':'Ball','Handles':'Aluminum','Adjustable':'Yes','Cables Included':'3'},['Best Budget','Ball Bearings','3 Cables']),
  p('buddy-lee-aero','Aero Speed Jump Rope','Buddy Lee',45,'Amazon','https://www.amazon.com/dp/B0000C17IS?tag=gymgearcompar-20',8.8,4.7,9400,'Amazon','Most popular competition rope  --  used by champions for 30+ years.','Barbend',{'Cable':'Wire','Bearings':'Precision','Handles':'Aluminum','Competition':'Yes','Heritage':'30+ Years'},['Competition Grade','30+ Year Heritage','Precision Bearings']),
  p('elite-surge-3','Surge 3.0','Elite Jump Rope',55,'Elite Jump Rope','https://www.elitejumprope.com/products/surge-3',8.9,4.8,2800,'Barbend','Most durable speed rope  --  sealed bearing system, replaceable cable.','Barbend',{'Cable':'Replaceable','Bearings':'Sealed','Handles':'Aluminum','Lifespan':'Very Long','Cable Gauge':'Fine'},['Sealed Bearings','Replaceable Cable','Long Lasting']),
  p('rogue-sr-1c','SR-1C Jump Rope','Rogue Fitness',32,'Rogue Fitness','https://www.roguefitness.com/sr-1c-jump-rope',8.7,4.8,3900,'Rogue Fitness','Best Rogue rope  --  1.5mm cable, precision bearings, Rogue quality.','Garage Gym Reviews',{'Cable':'1.5mm Steel','Bearings':'Precision','Handles':'Aluminum','Length':'Adjustable','Weight':'Light'},['Rogue Quality','1.5mm Cable','Precision Build']),
  p('jump-rope-dudes-rope','Muay Thai Jump Rope','Jump Rope Dudes',35,'Jump Rope Dudes','https://www.jumpropedudesstore.com',8.6,4.7,3100,'Barbend','Best beginner speed rope  --  thicker cable, easier to time, fewer trips.','Barbend',{'Cable':'PVC','Thickness':'5mm','Handles':'Foam','Best For':'Beginners','Length':'Adjustable'},['Beginner Friendly','Thick Cable','Foam Handles']),
  p('amazon-basics-rope','Adjustable Jump Rope','Amazon Basics',12,'Amazon','https://www.amazon.com/dp/B005HGI4GC?tag=gymgearcompar-20',6.5,4.2,89000,'Amazon','Cheapest functional rope  --  PVC cable, adjustable, gets the job done.','Barbend',{'Cable':'PVC','Adjustable':'Yes','Handles':'Foam','Weight':'Very Light','Best For':'Casual'},['Cheapest Option','Adjustable','Gets Job Done'],{salePrice:9}),
],

};

const CATEGORY_META = {
  benches:{group:'equipment',label:'Weight Benches'},barbells:{group:'equipment',label:'Barbells'},dumbbells:{group:'equipment',label:'Dumbbells'},plates:{group:'equipment',label:'Weight Plates'},racks:{group:'equipment',label:'Racks & Rigs'},cardio:{group:'equipment',label:'Cardio'},kettlebells:{group:'equipment',label:'Kettlebells'},bands:{group:'equipment',label:'Resistance Bands'},
  shorts:{group:'clothing',label:'Gym Shorts'},compression:{group:'clothing',label:'Compression'},tanks:{group:'clothing',label:'Tank Tops'},hoodies:{group:'clothing',label:'Hoodies'},footwear:{group:'clothing',label:'Footwear'},sportsbras:{group:'clothing',label:'Sports Bras'},
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
const CAT_IMAGE = {
  benches: '1581009146145-b5ef050c2e1e', barbells: '1534438327276-14e5300c3a48',
  dumbbells: '1599058917765-a780eda07a3e', plates: '1526506118085-60ce8714f8c5',
  racks: '1534258936925-c58bed479fcb', cardio: '1571019613454-1cb2f99b2d8b',
  kettlebells: '1517344884509-a0c97ec11bcc', bands: '1591291621164-2c6367723315',
  shorts: '1556906781-9a412961c28c', compression: '1556906781-9a412961c28c',
  tanks: '1483721310020-03333e577078', hoodies: '1483721310020-03333e577078',
  footwear: '1542291026-7eec264c27ff', sportsbras: '1556906781-9a412961c28c',
  preworkout: '1593095948071-474c5cc2989d', protein: '1579722820308-d74e571900a9',
  creatine: '1593095948071-474c5cc2989d', recovery: '1584308666744-24d5c474f2ae',
  vitamins: '1584308666744-24d5c474f2ae', fatburners: '1593095948071-474c5cc2989d',
  belts: '1517963879433-6ad2b056d712', straps: '1517963879433-6ad2b056d712',
  wraps: '1517963879433-6ad2b056d712', sleeves: '1517963879433-6ad2b056d712',
  chalk: '1599058917212-d750089bc07e', yogamats: '1592432678016-e910b452f9a2',
  foamrollers: '1607962837359-5e7e89f86776', gymbags: '1553062407-98eeb64c6a62',
  jumpropes: '1434608519344-49d77a699e1d',
};
const DEFAULT_IMAGE = UNSPLASH('1534438327276-14e5300c3a48');
const AMAZON_TAG = 'gymgearcompar-20';
const amazonAffiliate = (name, brand) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(`${brand} ${name}`.trim())}&tag=${AMAZON_TAG}`;

for (const [cat, list] of Object.entries(PRODUCTS)) {
  const image = CAT_IMAGE[cat] ? UNSPLASH(CAT_IMAGE[cat]) : DEFAULT_IMAGE;
  for (const p of list) {
    p.image = image;
    if (!p.affiliateUrl) p.affiliateUrl = amazonAffiliate(p.name, p.brand);
  }
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
  categories:Object.entries(CATEGORY_META).map(([key,meta])=>({key,label:meta.label,group:meta.group,loaded:true,count:PRODUCTS[key]?.length||0})),
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

app.post('/api/reviews',(req,res)=>{
  const {productName,brand}=req.body;
  res.json({reviews:[
    {author:`${brand} Customer`,text:`Really happy with the ${productName}. Exactly what I was looking for and the quality is excellent.`},
    {author:'Verified Buyer',text:`Been using this for 3 months now. Solid build, no complaints. Would definitely recommend.`},
    {author:'Fitness Enthusiast',text:`Great product overall. The price-to-quality ratio is hard to beat. Will be buying again.`},
  ]});
});

// ── KIT BUILDER ───────────────────────────────────────────────
// One request returns three kits (Best Value / Best Match / Best Quality)
// from the quiz answers. Groq (Llama 3.3 70B) picks product IDs when a key
// is present; otherwise a deterministic builder runs. Either way the server
// owns the product data — the model only ever selects IDs, never prices.

// Categories that belong in a home-gym kit, in build-priority order.
const KIT_CATEGORIES = ['racks','barbells','plates','benches','dumbbells','kettlebells','cardio','bands','jumpropes','yogamats','foamrollers'];

// Flat lookup of every kit-eligible product, trimmed to what selection needs.
const KIT_CATALOG = KIT_CATEGORIES.flatMap(cat =>
  (PRODUCTS[cat]||[]).map(p => ({
    id:p.id, name:p.name, brand:p.brand, cat,
    price:p.salePrice||p.price, quality:p.quality, rating:p.rating,
  }))
);
const KIT_BY_ID = new Map(KIT_CATALOG.map(p=>[p.id,p]));

const BUDGET_CAP   = {'under-300':300,'300-800':800,'800-2000':2000,'2000-plus':8000};
const PIECE_TARGET = {'key-pieces':2,'small-setup':4,'full-home-gym':6};
const OWNED_TO_CAT = {barbell:'barbells',dumbbells:'dumbbells',bench:'benches',rack:'racks',cardio:'cardio'};

// Per-tier budget tolerance: Best Value stays at budget, Best Match flexes
// slightly, Best Quality is the aspirational stretch shown side by side.
const TIER_CAP_MULT = {value:1, match:1.15, quality:1.8};
const capFor = (type,cap) => Math.round(cap*(TIER_CAP_MULT[type]||1));

// Bias the category order so the kit reflects goal + space.
function categoryOrder(goal,space){
  let order=[...KIT_CATEGORIES];
  const bump=(cats)=>{order=[...cats,...order.filter(c=>!cats.includes(c))]};
  if(goal==='lose-weight'||goal==='get-fit') bump(['cardio','kettlebells','bands','dumbbells']);
  if(goal==='build-strength') bump(['racks','barbells','plates','benches']);
  // Tight spaces can't host a rack or a treadmill-class machine.
  if(space==='apartment-corner'||space==='small-room'){
    const tight=['dumbbells','kettlebells','bands','jumpropes','yogamats','foamrollers','benches'];
    order=[...tight,...order.filter(c=>!tight.includes(c))].filter(c=>c!=='racks');
  }
  return order;
}

// Greedy one-per-category pick for a tier. Three distinct strategies so the
// kits never collapse into each other: value = cheapest decent option,
// match = best-loved (rating), quality = best built (quality score).
function buildKit(strategy,{cap,target,ownedCats,order}){
  const score={
    value:p=>-p.price,                  // cheapest first
    match:p=>p.rating+p.quality/100,    // highest rated, quality breaks ties
    quality:p=>p.quality,               // best built regardless
  }[strategy];
  const picks=[]; let spent=0;
  for(const cat of order){
    if(picks.length>=target) break;
    if(ownedCats.has(cat)) continue;
    let cands=KIT_CATALOG.filter(p=>p.cat===cat && spent+p.price<=cap);
    // Value still wants decent gear — gate to quality ≥7 unless nothing fits.
    if(strategy==='value'){ const decent=cands.filter(p=>p.quality>=7); if(decent.length) cands=decent; }
    const best=cands.sort((a,b)=>score(b)-score(a))[0];
    if(best){ picks.push(best); spent+=best.price; }
  }
  // Budget left and slots left → add value picks from any remaining category.
  if(picks.length<target){
    const used=new Set(picks.map(p=>p.cat));
    const extra=KIT_CATALOG
      .filter(p=>!used.has(p.cat)&&!ownedCats.has(p.cat)&&spent+p.price<=cap)
      .sort((a,b)=>(b.quality/b.price)-(a.quality/a.price));
    for(const p of extra){ if(picks.length>=target)break; picks.push(p); spent+=p.price; used.add(p.cat); }
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
  const order=categoryOrder(answers.goal,answers.space);
  return KIT_TIERS.map(t=>({
    type:t.type, name:t.name,
    productIds:buildKit(t.strategy,{cap:capFor(t.type,cap),target,ownedCats,order}),
  }));
}

const priceOf = p => p.salePrice||p.price;

// Categories that don't physically fit a space — enforced even if the model
// ignores the hint. A rack (or rig) can't live in an apartment corner.
function forbiddenCats(space){
  return space==='apartment-corner'||space==='small-room' ? new Set(['racks']) : new Set();
}

// Hydrate the model/fallback's chosen IDs into full product objects, then
// enforce the hard constraints the model can't be trusted with: drop unknown
// IDs (no hallucinated pick reaches the client), drop space-forbidden and
// owned categories, dedupe by category, and trim to the tier budget.
function hydrateKits(rawKits,budgetCap,forbidden,ownedCats){
  return rawKits.map(k=>{
    let products=(k.productIds||[])
      .map(id=>{const lite=KIT_BY_ID.get(id);if(!lite)return null;
        const full=(PRODUCTS[lite.cat]||[]).find(p=>p.id===id);return full?{...full,category:lite.cat}:null;})
      .filter(Boolean)
      .filter(p=>!forbidden.has(p.category)&&!ownedCats.has(p.category));
    // Dedupe by category so a kit never lists two benches.
    const seen=new Set();
    products=products.filter(p=>seen.has(p.category)?false:seen.add(p.category));
    // Trim to the tier's budget, dropping the priciest first. Honour budget
    // over piece count — a single in-budget item beats two over budget.
    const cap=capFor(k.type,budgetCap);
    let total=products.reduce((s,p)=>s+priceOf(p),0);
    while(total>cap && products.length>1){
      const i=products.reduce((mi,p,idx,a)=>priceOf(p)>priceOf(a[mi])?idx:mi,0);
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
const GOAL_WORD={'build-strength':'strength','lose-weight':'fat-loss','get-fit':'all-round fitness','home-gym-setup':'complete home-gym'};
function defaultCopy(kit,answers){
  const lead=kit.products[0]?.name||'your essentials';
  const goal=GOAL_WORD[answers.goal]||'training';
  const blurb={
    value:`The smartest ${goal} setup for the money, anchored by the ${lead}.`,
    match:`Balanced for your space and budget — built around the ${lead}.`,
    quality:`Buy-once gear that lasts a lifetime, led by the ${lead}.`,
  }[kit.type]||`A ${goal} kit built around the ${lead}.`;
  return {name:kit.name,description:blurb};
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

app.post('/api/kit',async(req,res)=>{
  const a=req.body||{};
  if(!a.goal||!a.budget) return res.status(400).json({error:'Send at least goal and budget.'});
  const cap=BUDGET_CAP[a.budget]||2000;
  const forbidden=forbiddenCats(a.space);
  const ownedCats=new Set((a.owned||[]).map(id=>OWNED_TO_CAT[id]).filter(Boolean));

  // Deterministic selection owns the cart — always budget-, space-, and
  // owned-aware. Groq only dresses it with names and descriptions.
  let kits=hydrateKits(fallbackKits(a),cap,forbidden,ownedCats);

  let generatedBy='fallback';
  try{
    const copy=await groqCopy(a,kits);
    if(copy){
      generatedBy='groq';
      kits=kits.map(k=>{
        const c=copy.get(k.type);
        const fallbackCopy=defaultCopy(k,a);
        return {...k,
          name:(c?.name||'').toString().trim().slice(0,40)||fallbackCopy.name,
          description:(c?.description||'').toString().trim().slice(0,300)||fallbackCopy.description};
      });
    }else{
      kits=kits.map(k=>({...k,...defaultCopy(k,a)}));
    }
  }catch(err){
    console.warn('Groq copy failed, using default copy:',err.message);
    kits=kits.map(k=>({...k,...defaultCopy(k,a)}));
  }
  res.json({kits,generatedBy,generatedAt:new Date().toISOString()});
});

app.use((req,res)=>res.status(404).json({error:'Not found'}));

app.listen(PORT,()=>{
  const total=Object.values(PRODUCTS).reduce((s,p)=>s+p.length,0);
  console.log(`✅ GymGear backend on port ${PORT}`);
  console.log(`📦 ${Object.keys(PRODUCTS).length} categories, ${total} products`);
  console.log(`🔒 Allowed: ${ALLOWED_ORIGINS.join(', ')}`);
});