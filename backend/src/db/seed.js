require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Return a random float between min and max (2 decimal places) */
function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

/** Return a random integer between min and max (inclusive) */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Return a Date offset from now by the given number of days (negative = past) */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Build a realistic bid ladder from startingBid up to finalBid.
 * Returns an array of { amount, offsetMinutes } objects.
 * Bids cluster near the end (sniping behaviour).
 */
function buildBidLadder(startingBid, finalBid, increment, durationMinutes, bidCount) {
  if (bidCount === 0) return [];
  const bids = [];
  const step = (finalBid - startingBid) / bidCount;
  for (let i = 0; i < bidCount; i++) {
    const amount = Math.round((startingBid + step * (i + 1)) * 100) / 100;
    // Earlier bids spread out; last 40% cluster in the final 10% of time
    const isSnipe = i >= bidCount * 0.6;
    const offsetMinutes = isSnipe
      ? randInt(Math.floor(durationMinutes * 0.9), durationMinutes - 1)
      : randInt(i * Math.floor(durationMinutes / bidCount), (i + 1) * Math.floor(durationMinutes / bidCount));
    bids.push({ amount, offsetMinutes });
  }
  // Sort chronologically
  return bids.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
}

// ─── Auction templates per category ─────────────────────────────────────────
// multiplierRange: realistic final/starting price ratio for this category
// bidRange: typical number of bids an auction in this category receives

const AUCTION_TEMPLATES = [
  // ── Electronics (multiplier 1.4 – 2.8, bids 4–18) ──────────────────────
  {
    category: 'Electronics',
    items: [
      { title: 'Apple MacBook Pro 14" M3 (2024)', startingBid: 800, multiplier: [1.6, 2.2], bids: [8, 16], duration: 5 },
      { title: 'Sony PlayStation 5 Console Bundle', startingBid: 350, multiplier: [1.5, 2.5], bids: [10, 18], duration: 4 },
      { title: 'Samsung 65" QLED 4K Smart TV', startingBid: 500, multiplier: [1.4, 1.9], bids: [5, 12], duration: 7 },
      { title: 'DJI Mavic 3 Pro Drone', startingBid: 600, multiplier: [1.5, 2.1], bids: [6, 14], duration: 6 },
      { title: 'iPhone 15 Pro Max 256GB', startingBid: 700, multiplier: [1.4, 2.0], bids: [7, 15], duration: 5 },
      { title: 'Bose QuietComfort Ultra Headphones', startingBid: 150, multiplier: [1.6, 2.4], bids: [5, 11], duration: 7 },
      { title: 'NVIDIA RTX 4090 Graphics Card', startingBid: 900, multiplier: [1.5, 2.8], bids: [8, 20], duration: 6 },
      { title: 'iPad Pro 12.9" M2 Wi-Fi + Cellular', startingBid: 600, multiplier: [1.4, 2.0], bids: [5, 13], duration: 5 },
      { title: 'Canon EOS R5 Mirrorless Camera', startingBid: 1800, multiplier: [1.3, 1.8], bids: [4, 10], duration: 7 },
      { title: 'Nintendo Switch OLED Limited Edition', startingBid: 200, multiplier: [1.7, 2.6], bids: [9, 18], duration: 4 },
      { title: 'Garmin Fenix 7X Sapphire Watch', startingBid: 400, multiplier: [1.4, 2.0], bids: [4, 10], duration: 6 },
      { title: 'Samsung Galaxy S24 Ultra 512GB', startingBid: 700, multiplier: [1.5, 2.1], bids: [6, 14], duration: 5 },
    ],
  },
  // ── Art & Collectibles (multiplier 1.8 – 4.5, bids 6–25) ────────────────
  {
    category: 'Art & Collectibles',
    items: [
      { title: 'Original Oil Painting — Coastal Seascape', startingBid: 300, multiplier: [2.0, 4.0], bids: [8, 22], duration: 7 },
      { title: 'First Edition "Harry Potter" Hardcover', startingBid: 500, multiplier: [2.5, 4.5], bids: [12, 25], duration: 10 },
      { title: 'Signed Banksy Print — Limited Run', startingBid: 1200, multiplier: [2.0, 3.5], bids: [10, 20], duration: 7 },
      { title: '1952 Topps Mickey Mantle Baseball Card', startingBid: 2000, multiplier: [1.8, 3.2], bids: [8, 18], duration: 10 },
      { title: 'Hand-Painted Porcelain Vase — Ming Dynasty Style', startingBid: 800, multiplier: [1.9, 3.8], bids: [7, 16], duration: 7 },
      { title: 'Bronze Sculpture — Abstract Figure', startingBid: 600, multiplier: [2.0, 3.5], bids: [8, 18], duration: 7 },
      { title: 'Pokemon 1st Edition Charizard Holo', startingBid: 1500, multiplier: [2.2, 4.0], bids: [14, 25], duration: 7 },
      { title: 'Watercolor Cityscape by Local Artist', startingBid: 150, multiplier: [1.8, 3.0], bids: [6, 14], duration: 5 },
      { title: 'Vintage Sports Memorabilia Collection', startingBid: 400, multiplier: [1.9, 3.2], bids: [7, 16], duration: 7 },
      { title: 'Rare Coin Set — 19th Century American', startingBid: 700, multiplier: [2.0, 3.5], bids: [8, 18], duration: 7 },
    ],
  },
  // ── Jewelry (multiplier 1.8 – 3.8, bids 5–20) ───────────────────────────
  {
    category: 'Jewelry',
    items: [
      { title: 'Rolex Submariner Date 41mm Stainless', startingBid: 8000, multiplier: [1.8, 2.8], bids: [8, 18], duration: 7 },
      { title: '18K Gold Diamond Engagement Ring 2.1ct', startingBid: 3000, multiplier: [1.9, 3.2], bids: [7, 16], duration: 7 },
      { title: 'Vintage Cartier Love Bracelet', startingBid: 2500, multiplier: [2.0, 3.5], bids: [8, 18], duration: 7 },
      { title: 'Natural Ruby & Diamond Pendant Necklace', startingBid: 1200, multiplier: [1.9, 3.0], bids: [6, 14], duration: 5 },
      { title: 'Patek Philippe Calatrava Watch', startingBid: 12000, multiplier: [1.8, 2.6], bids: [6, 14], duration: 10 },
      { title: 'Emerald Cut Sapphire Earrings 3ct each', startingBid: 2000, multiplier: [2.0, 3.5], bids: [7, 15], duration: 7 },
      { title: 'Art Deco Pearl & Diamond Brooch', startingBid: 800, multiplier: [2.0, 3.8], bids: [8, 18], duration: 7 },
      { title: 'Tiffany & Co. Diamond Tennis Bracelet', startingBid: 4000, multiplier: [1.8, 2.8], bids: [7, 15], duration: 7 },
      { title: 'Sterling Silver Engraved Locket Antique', startingBid: 200, multiplier: [2.0, 3.5], bids: [5, 12], duration: 5 },
      { title: 'Men\'s Audemars Piguet Royal Oak', startingBid: 15000, multiplier: [1.7, 2.5], bids: [5, 12], duration: 10 },
    ],
  },
  // ── Vehicles (multiplier 1.05 – 1.3, bids 2–10) ─────────────────────────
  {
    category: 'Vehicles',
    items: [
      { title: '2019 Ford Mustang GT 5.0 Manual', startingBid: 22000, multiplier: [1.05, 1.2], bids: [3, 8], duration: 7 },
      { title: '2020 Tesla Model 3 Long Range AWD', startingBid: 28000, multiplier: [1.05, 1.18], bids: [3, 9], duration: 7 },
      { title: '1967 Chevrolet Camaro SS Restored', startingBid: 35000, multiplier: [1.08, 1.28], bids: [4, 10], duration: 10 },
      { title: '2022 Harley-Davidson Sportster S', startingBid: 12000, multiplier: [1.05, 1.22], bids: [2, 7], duration: 7 },
      { title: '2018 BMW M3 Competition Package', startingBid: 40000, multiplier: [1.06, 1.2], bids: [3, 8], duration: 7 },
      { title: '2021 Toyota Land Cruiser 200 Series', startingBid: 55000, multiplier: [1.04, 1.15], bids: [2, 6], duration: 10 },
      { title: '2015 Jeep Wrangler Unlimited Rubicon', startingBid: 25000, multiplier: [1.05, 1.2], bids: [3, 8], duration: 7 },
      { title: '1985 Porsche 911 Carrera Coupe', startingBid: 45000, multiplier: [1.08, 1.3], bids: [4, 10], duration: 10 },
    ],
  },
  // ── Real Estate (multiplier 1.02 – 1.12, bids 2–8) ──────────────────────
  {
    category: 'Real Estate',
    items: [
      { title: '3-Bed Bungalow — Quiet Suburb 850sqm', startingBid: 180000, multiplier: [1.03, 1.1], bids: [2, 6], duration: 14 },
      { title: 'Commercial Retail Unit — City Centre', startingBid: 250000, multiplier: [1.02, 1.08], bids: [2, 5], duration: 14 },
      { title: '1-Acre Vacant Land — Residential Zone', startingBid: 80000, multiplier: [1.04, 1.12], bids: [2, 7], duration: 14 },
      { title: 'Beachfront Apartment 2BR Sea View', startingBid: 320000, multiplier: [1.03, 1.1], bids: [2, 6], duration: 14 },
      { title: 'Industrial Warehouse 5000sqft', startingBid: 400000, multiplier: [1.02, 1.08], bids: [2, 5], duration: 14 },
      { title: 'Luxury Penthouse — Downtown 3BR', startingBid: 600000, multiplier: [1.02, 1.07], bids: [2, 5], duration: 14 },
    ],
  },
  // ── Antiques (multiplier 1.5 – 3.5, bids 5–18) ──────────────────────────
  {
    category: 'Antiques',
    items: [
      { title: 'Victorian Mahogany Writing Desk 1880s', startingBid: 400, multiplier: [1.6, 2.8], bids: [5, 14], duration: 7 },
      { title: 'Antique Persian Rug 9×12 Wool Hand-knotted', startingBid: 1200, multiplier: [1.5, 2.5], bids: [5, 12], duration: 7 },
      { title: 'WWI German Officer\'s Sword & Scabbard', startingBid: 600, multiplier: [1.7, 3.2], bids: [6, 16], duration: 7 },
      { title: '18th Century French Mantel Clock', startingBid: 800, multiplier: [1.8, 3.5], bids: [7, 16], duration: 7 },
      { title: 'Tiffany Studios Dragonfly Lamp Original', startingBid: 2500, multiplier: [2.0, 3.5], bids: [8, 18], duration: 10 },
      { title: 'Stoneware Crock Collection 1850–1900', startingBid: 300, multiplier: [1.5, 2.8], bids: [5, 12], duration: 7 },
      { title: 'Victorian Parlour Chair Set (2) Carved Oak', startingBid: 500, multiplier: [1.6, 2.6], bids: [5, 12], duration: 7 },
      { title: 'Early American Quilt Handstitched c.1890', startingBid: 250, multiplier: [1.6, 3.0], bids: [5, 14], duration: 7 },
      { title: 'Chinese Export Porcelain Dinner Service', startingBid: 900, multiplier: [1.7, 3.2], bids: [6, 15], duration: 7 },
      { title: 'Antique Brass Telescope — 1900s Maritime', startingBid: 350, multiplier: [1.6, 2.8], bids: [5, 12], duration: 7 },
    ],
  },
];

// ─── Seed function ───────────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    // ── 1. Admin user ────────────────────────────────────────────────────────
    const adminEmail = 'admin@gavelpro.com';
    const adminPassword = 'admin@123';
    const hash = await bcrypt.hash(adminPassword, 10);

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    let adminId;
    if (existing.rows.length === 0) {
      const r = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_email_verified)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [adminEmail, hash, 'GavelPro Admin', 'Admin', true]
      );
      adminId = r.rows[0].id;
      console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
    } else {
      adminId = existing.rows[0].id;
      console.log('Admin user already exists.');
    }

    // ── 2. Categories ────────────────────────────────────────────────────────
    const cats = [
      { name: 'Electronics',       icon: 'bi-laptop',       description: 'Computers, phones, and gadgets' },
      { name: 'Art & Collectibles', icon: 'bi-palette',      description: 'Paintings, sculptures, and rare collectibles' },
      { name: 'Jewelry',            icon: 'bi-gem',          description: 'Fine jewelry, watches, and accessories' },
      { name: 'Vehicles',           icon: 'bi-car-front',    description: 'Cars, motorcycles, and other vehicles' },
      { name: 'Real Estate',        icon: 'bi-house',        description: 'Land, residential, and commercial properties' },
      { name: 'Antiques',           icon: 'bi-clock-history',description: 'Vintage and antique items' },
    ];

    for (const cat of cats) {
      await client.query(
        `INSERT INTO categories (name, icon, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
        [cat.name, cat.icon, cat.description]
      );
    }
    console.log('Categories seeded.');

    // ── 3. Demo seller + buyer users ─────────────────────────────────────────
    const demoUsers = [
      { email: 'seller1@demo.com', name: 'Alice Carter',    role: 'Seller' },
      { email: 'seller2@demo.com', name: 'Bob Harrington',  role: 'Seller' },
      { email: 'seller3@demo.com', name: 'Clara Nguyen',    role: 'Seller' },
      { email: 'buyer1@demo.com',  name: 'David Osei',      role: 'Buyer'  },
      { email: 'buyer2@demo.com',  name: 'Emma Fischer',    role: 'Buyer'  },
      { email: 'buyer3@demo.com',  name: 'Frank Mbeki',     role: 'Buyer'  },
      { email: 'buyer4@demo.com',  name: 'Grace Tanaka',    role: 'Buyer'  },
      { email: 'buyer5@demo.com',  name: 'Henry Volkov',    role: 'Buyer'  },
    ];

    const demoPassword = await bcrypt.hash('demo@123', 10);
    const userIds = {};

    for (const u of demoUsers) {
      const r = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (r.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, is_email_verified)
           VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [u.email, demoPassword, u.name, u.role]
        );
        userIds[u.email] = ins.rows[0].id;
      } else {
        userIds[u.email] = r.rows[0].id;
      }
    }
    console.log('Demo users seeded. Password for all demo accounts: demo@123');

    const sellerIds = [
      userIds['seller1@demo.com'],
      userIds['seller2@demo.com'],
      userIds['seller3@demo.com'],
    ];

    const buyerIds = [
      userIds['buyer1@demo.com'],
      userIds['buyer2@demo.com'],
      userIds['buyer3@demo.com'],
      userIds['buyer4@demo.com'],
      userIds['buyer5@demo.com'],
    ];

    // ── 4. Historical ended auctions + bids ──────────────────────────────────
    // Skip if we already have substantial historical data
    const histCheck = await client.query(
      `SELECT COUNT(*) FROM auctions WHERE ends_at < NOW() AND bid_count > 0`
    );
    if (parseInt(histCheck.rows[0].count) >= 20) {
      console.log('Historical auction data already present — skipping auction seed.');
    } else {
      let totalAuctions = 0;
      let totalBids = 0;

      for (const group of AUCTION_TEMPLATES) {
        for (const item of group.items) {
          // Pick a random seller
          const sellerId = sellerIds[randInt(0, sellerIds.length - 1)];
          const sellerRes = await client.query('SELECT full_name FROM users WHERE id = $1', [sellerId]);
          const sellerName = sellerRes.rows[0].full_name;

          // Randomise the multiplier within the template's range
          const multiplier = rand(item.multiplier[0], item.multiplier[1]);
          const bidCount   = randInt(item.bids[0], item.bids[1]);
          const finalBid   = Math.round(item.startingBid * multiplier * 100) / 100;
          const increment  = Math.max(1, Math.round(item.startingBid * 0.02 * 100) / 100);

          // Auction ended between 1 and 60 days ago
          const endedDaysAgo = randInt(1, 60);
          const endsAt  = daysAgo(endedDaysAgo);
          const startsAt = new Date(endsAt.getTime() - item.duration * 24 * 60 * 60 * 1000);

          // Insert the auction
          const aRes = await client.query(
            `INSERT INTO auctions
               (title, description, category, starting_bid, current_bid, minimum_increment,
                bid_count, starts_at, ends_at, image_url, seller_id, auctioneer_name,
                is_featured, is_live)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING id`,
            [
              item.title,
              `${item.title} — in excellent condition. Fully verified and ready to ship. Bidding starts at $${item.startingBid.toLocaleString()}.`,
              group.category,
              item.startingBid,
              finalBid,
              increment,
              bidCount,
              startsAt,
              endsAt,
              'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80',
              sellerId,
              sellerName,
              false,
              false, // ended — not live
            ]
          );

          const auctionId = aRes.rows[0].id;

          // Build and insert a realistic bid ladder
          const durationMinutes = item.duration * 24 * 60;
          const ladder = buildBidLadder(item.startingBid, finalBid, increment, durationMinutes, bidCount);

          for (const bid of ladder) {
            const bidderId = buyerIds[randInt(0, buyerIds.length - 1)];
            const bidTime  = new Date(startsAt.getTime() + bid.offsetMinutes * 60 * 1000);
            await client.query(
              `INSERT INTO bids (amount, timestamp, user_id, auction_item_id) VALUES ($1,$2,$3,$4)`,
              [bid.amount, bidTime, bidderId, auctionId]
            );
          }

          totalAuctions++;
          totalBids += bidCount;
        }
      }

      console.log(`Historical data seeded: ${totalAuctions} ended auctions, ${totalBids} bids.`);
    }

    // ── 5. A few live auctions for the homepage ───────────────────────────────
    const liveCheck = await client.query(`SELECT COUNT(*) FROM auctions WHERE is_live = true AND ends_at > NOW()`);
    if (parseInt(liveCheck.rows[0].count) >= 6) {
      console.log('Live auctions already present — skipping live auction seed.');
    } else {
      const liveItems = [
        { title: 'MacBook Air M2 Space Grey 256GB',       category: 'Electronics',       startingBid: 600,   increment: 15,  featured: true  },
        { title: 'Original Abstract Canvas Painting',      category: 'Art & Collectibles', startingBid: 250,   increment: 10,  featured: false },
        { title: '14K Gold & Diamond Cocktail Ring',       category: 'Jewelry',            startingBid: 800,   increment: 25,  featured: true  },
        { title: '2020 Honda CB500F Motorcycle',           category: 'Vehicles',           startingBid: 4500,  increment: 100, featured: false },
        { title: 'Art Deco Walnut Sideboard 1930s',        category: 'Antiques',           startingBid: 450,   increment: 15,  featured: false },
        { title: 'Studio Apartment — City Centre Leasehold', category: 'Real Estate',      startingBid: 95000, increment: 1000,featured: true  },
        { title: 'Sony WH-1000XM5 Wireless Headphones',   category: 'Electronics',        startingBid: 150,   increment: 5,   featured: false },
        { title: 'Handmade Silk Persian Rug 6×9',         category: 'Antiques',           startingBid: 700,   increment: 20,  featured: false },
      ];

      for (const item of liveItems) {
        const sellerId = sellerIds[randInt(0, sellerIds.length - 1)];
        const sellerRes = await client.query('SELECT full_name FROM users WHERE id = $1', [sellerId]);
        const sellerName = sellerRes.rows[0].full_name;

        const startsAt = daysAgo(randInt(0, 2));               // started 0–2 days ago
        const endsAt   = new Date(Date.now() + randInt(1, 6) * 24 * 60 * 60 * 1000); // ends in 1–6 days

        await client.query(
          `INSERT INTO auctions
             (title, description, category, starting_bid, current_bid, minimum_increment,
              bid_count, starts_at, ends_at, image_url, seller_id, auctioneer_name,
              is_featured, is_live)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            item.title,
            `${item.title} — excellent condition, fully verified. Bidding starts at $${item.startingBid.toLocaleString()}.`,
            item.category,
            item.startingBid,
            item.increment,
            0,
            startsAt,
            endsAt,
            'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80',
            sellerId,
            sellerName,
            item.featured,
            true,
          ]
        );
      }
      console.log(`Live auctions seeded: ${liveItems.length} active listings.`);
    }

    console.log('\nSeeding complete.');
    console.log('─────────────────────────────────────────');
    console.log('  Admin:   admin@gavelpro.com / admin@123');
    console.log('  Sellers: seller1@demo.com  / demo@123');
    console.log('           seller2@demo.com  / demo@123');
    console.log('           seller3@demo.com  / demo@123');
    console.log('  Buyers:  buyer1@demo.com   / demo@123');
    console.log('           buyer2–5@demo.com / demo@123');
    console.log('─────────────────────────────────────────');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
