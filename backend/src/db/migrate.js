require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');

    // ── users ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('Admin','Seller','Buyer')),
        company_name VARCHAR(255),
        bio TEXT,
        profile_picture_url VARCHAR(500),
        address TEXT,
        is_email_verified BOOLEAN NOT NULL DEFAULT false,
        email_verification_code VARCHAR(10),
        email_verification_expiry TIMESTAMPTZ,
        two_factor_otp_code VARCHAR(10),
        two_factor_otp_expiry TIMESTAMPTZ,
        lockout_end TIMESTAMPTZ,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── categories ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        icon VARCHAR(100) NOT NULL DEFAULT 'bi-tag',
        description TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── auctions ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS auctions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        starting_bid NUMERIC(14,2) NOT NULL,
        current_bid NUMERIC(14,2) NOT NULL,
        minimum_increment NUMERIC(14,2) NOT NULL,
        bid_count INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        image_url VARCHAR(500) NOT NULL DEFAULT '',
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        auctioneer_name VARCHAR(255) NOT NULL DEFAULT '',
        is_featured BOOLEAN NOT NULL DEFAULT false,
        is_live BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','live','ended','cancelled')),
        winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add new columns to existing auctions table if upgrading from old schema
    await client.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
    `);

    // ── New feature columns (safe to run on existing DB) ─────────────────────
    // Reserve price: hidden minimum the seller requires before the item sells
    await client.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS reserve_price NUMERIC(14,2) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS reserve_met   BOOLEAN NOT NULL DEFAULT false;
    `);

    // Item condition grading
    await client.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS condition VARCHAR(20) NOT NULL DEFAULT 'Not Specified'
          CHECK (condition IN ('Mint','Excellent','Good','Fair','Poor','For Parts','Not Specified'));
    `);

    // Lot number (auto-assigned sequential per seller, or manually set)
    await client.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS lot_number VARCHAR(20) DEFAULT NULL;
    `);

    // Anti-sniping: extend auction by this many minutes if a bid lands in the
    // final window. 0 = disabled. Default 3 minutes.
    await client.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS anti_snipe_minutes INTEGER NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS snipe_extensions   INTEGER NOT NULL DEFAULT 0;
    `);

    // Allow 'preview' status — visible to public but not biddable
    await client.query(`
      ALTER TABLE auctions
        DROP CONSTRAINT IF EXISTS auctions_status_check;
    `);
    await client.query(`
      ALTER TABLE auctions
        ADD CONSTRAINT auctions_status_check
          CHECK (status IN ('pending','preview','live','ended','cancelled'));
    `);

    // ── watchlists — buyers save auctions they want to track ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id          SERIAL PRIMARY KEY,
        user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        auction_id  INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, auction_id)
      );
    `);

    // ── bids ──────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id SERIAL PRIMARY KEY,
        amount NUMERIC(14,2) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        auction_item_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE
      );
    `);

    // ── disputes ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        raised_by_user_id UUID NOT NULL REFERENCES users(id),
        auction_item_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved','Closed')),
        admin_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
    `);

    // ── platform_settings ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value VARCHAR(255) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── auction_results — permanent record of every closed auction ────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_results (
        id SERIAL PRIMARY KEY,
        auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        winning_bid NUMERIC(14,2) NOT NULL,
        commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
        commission_amount NUMERIC(14,2) NOT NULL,
        seller_payout NUMERIC(14,2) NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notified_at TIMESTAMPTZ
      );
    `);

    // Payment tracking on auction results (winner pays BuyerPaymentPercent of winning bid)
    await client.query(`
      ALTER TABLE auction_results
        ADD COLUMN IF NOT EXISTS amount_due  NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid';
    `);
    await client.query(`
      UPDATE auction_results
      SET amount_due = ROUND(winning_bid * 0.80, 2)
      WHERE amount_due IS NULL AND winner_id IS NOT NULL
    `);
    // Keep unpaid balances in sync with 80% rule (do not touch paid/partial already settled)
    await client.query(`
      UPDATE auction_results
      SET amount_due = ROUND(winning_bid * 0.80, 2)
      WHERE winner_id IS NOT NULL
        AND payment_status = 'unpaid'
        AND COALESCE(amount_paid, 0) = 0
    `);
    await client.query(`
      ALTER TABLE auction_results
        DROP CONSTRAINT IF EXISTS auction_results_payment_status_check
    `);
    await client.query(`
      ALTER TABLE auction_results
        ADD CONSTRAINT auction_results_payment_status_check
          CHECK (payment_status IN ('unpaid','partial','pending','paid'))
    `);

    // ── notifications — in-app alerts for buyers & sellers ───────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        auction_id INTEGER REFERENCES auctions(id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed default platform settings if missing
    await client.query(`
      INSERT INTO platform_settings (key, value, description) VALUES
        ('CommissionRate', '5', 'Platform commission percentage per sale'),
        ('BuyerPaymentPercent', '80', 'Percent of winning bid the buyer must pay'),
        ('MinBidIncrement', '10', 'Minimum bid increment in RWF'),
        ('AuctionDurationDays', '7', 'Default auction duration in days'),
        ('MinNoBidWaitMinutes', '1440', 'Minutes to wait after end time before closing an auction with no bids (default 1440 = 24 hours)'),
        ('AntiSnipeMinutes', '3', 'Extend auction by this many minutes when a bid lands in the final window (0 = disabled)')
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log('Migrations completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
