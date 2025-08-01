require('dotenv').config();
const { Pool } = require('pg');

console.log('🔍 Checking environment variables...');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL format:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET');

// Create pool with detailed SSL configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');
    console.log('📡 Attempting to connect to database...');

    // Test connection with timeout
    const client = await pool.connect();
    console.log('✅ Successfully connected to database!');
    
    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database responded at:', result.rows[0].now);
    client.release();

    // Create businesses table
    console.log('\n📋 Creating tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_name VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        business_type VARCHAR(50),
        plan_type VARCHAR(50) DEFAULT 'premium',
        status VARCHAR(50) DEFAULT 'trial',
        trial_ends_at TIMESTAMP DEFAULT NOW() + INTERVAL '60 days',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Businesses table created');

    // Create loyalty_cards table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_cards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
        card_name VARCHAR(255) NOT NULL,
        description TEXT,
        stamps_required INTEGER DEFAULT 10,
        reward_description TEXT,
        background_color VARCHAR(7) DEFAULT '#6366f1',
        text_color VARCHAR(7) DEFAULT '#ffffff',
        logo_text VARCHAR(10),
        card_code VARCHAR(50) UNIQUE,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Loyalty cards table created');

    // Create customers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Customers table created');

    // Create customer_cards table (links customers to cards)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_cards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
        card_id UUID REFERENCES loyalty_cards(id) ON DELETE CASCADE,
        business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
        stamps_count INTEGER DEFAULT 0,
        rewards_earned INTEGER DEFAULT 0,
        rewards_redeemed INTEGER DEFAULT 0,
        last_stamp_date TIMESTAMP,
        qr_code_data TEXT UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(customer_id, card_id)
      )
    `);
    console.log('✅ Customer cards table created');

    // Create staff_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'staff',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Staff users table created');

    // Create stamp_transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stamp_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_card_id UUID REFERENCES customer_cards(id) ON DELETE CASCADE,
        business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
        staff_id UUID REFERENCES staff_users(id),
        transaction_type VARCHAR(50), -- 'stamp' or 'redeem'
        stamps_added INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Stamp transactions table created');

    // Create indexes for better performance
    console.log('\n🔧 Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cards_business ON loyalty_cards(business_id);
      CREATE INDEX IF NOT EXISTS idx_customer_cards_customer ON customer_cards(customer_id);
      CREATE INDEX IF NOT EXISTS idx_customer_cards_business ON customer_cards(business_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_customer_card ON stamp_transactions(customer_card_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON stamp_transactions(created_at DESC);
    `);
    console.log('✅ Indexes created');

    // Insert sample data for testing
    console.log('\n📝 Inserting sample data...');
    const sampleBusiness = await pool.query(`
      INSERT INTO businesses (
        business_name, 
        owner_name, 
        email, 
        password_hash, 
        phone, 
        business_type
      ) VALUES (
        'Sunshine Cafe', 
        'Ahmad Al-Zahra', 
        'demo@sunshine.com', 
        '$2b$10$YourHashedPasswordHere', 
        '+962-79-123-4567', 
        'Coffee Shop'
      ) 
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `);

    if (sampleBusiness.rows.length > 0) {
      const businessId = sampleBusiness.rows[0].id;
      
      // Create sample loyalty card
      await pool.query(`
        INSERT INTO loyalty_cards (
          business_id,
          card_name,
          description,
          stamps_required,
          reward_description,
          card_code
        ) VALUES (
          $1,
          'Coffee Lovers Card',
          'Buy 10 coffees, get 1 free!',
          10,
          'Free Coffee',
          'COFFEE10'
        )
        ON CONFLICT (card_code) DO NOTHING
      `, [businessId]);

      console.log('✅ Sample data inserted');
    }

    console.log('\n🎉 Database setup complete!');
    console.log('📝 Note: Default demo login: demo@sunshine.com');
    
  } catch (error) {
    console.error('\n❌ Error setting up database:');
    console.error('Error type:', error.constructor.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.error('\n🔍 This appears to be a DNS/connection issue.');
      console.error('Please check:');
      console.error('1. Your DATABASE_URL is correct');
      console.error('2. You have internet connection');
      console.error('3. The Supabase project is active');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n🔍 Connection was refused.');
      console.error('Make sure you\'re using the correct port (5432 for direct, 6543 for pooler)');
    } else if (error.message.includes('SSL')) {
      console.error('\n🔍 SSL connection issue detected.');
      console.error('Try using the connection pooler or direct connection from Supabase dashboard');
    }
    
    console.error('\nFull error details:', error);
  } finally {
    await pool.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the setup
setupDatabase();