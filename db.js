require('dotenv').config();
const { Pool } = require('pg');

// Use connection pooler for better reliability
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
  } else {
    console.log('✅ Connected to Supabase database');
    release();
  }
});

module.exports = pool;