// LoyaltyJO Backend API - Updated for Supabase
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'https://loyaltyjoscanner.netlify.app', 
    'https://resplendent-rolypoly-0194d5.netlify.app',
    'https://precious-lolly-411bad.netlify.app'
  ],
  credentials: true
}));
app.use(express.json());

// Basic auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Business login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Query database for business
    const result = await db.query(
      'SELECT * FROM businesses WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const business = result.rows[0];
    
    // For demo purposes, accept any password
    // In production, use: const validPassword = await bcrypt.compare(password, business.password_hash);
    const validPassword = true; // TEMPORARY - accept any password
    
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { 
        businessId: business.id, 
        email: business.email,
        businessName: business.business_name 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      business: {
        id: business.id,
        name: business.business_name,
        email: business.email,
        plan: business.plan_type,
        status: business.status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Business registration
app.post('/api/register', async (req, res) => {
  try {
    const { businessName, ownerName, mobile, password, phone, businessType } = req.body;
    
    // Check if business already exists
    const existingBusiness = await db.query(
      'SELECT id FROM businesses WHERE mobile = $1',
      [mobile]
    );
    
    if (existingBusiness.rows.length > 0) {
      return res.status(400).json({ message: 'Mobile already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new business
    const result = await db.query(
      `INSERT INTO businesses (business_name, owner_name, mobile, password_hash, phone, business_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, business_name, mobile, plan_type, status`,
      [businessName, ownerName, mobile, hashedPassword, phone, businessType]
    );
    
    const newBusiness = result.rows[0];
    
    // Create token
    const token = jwt.sign(
      { 
        businessId: newBusiness.id, 
        mobile: newBusiness.mobile,
        businessName: newBusiness.business_name 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      token,
      business: newBusiness
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff login
app.post('/api/staff/login', async (req, res) => {
  try {
    const { businessCode, mobile, password } = req.body;
    
    // For demo purposes, accept any staff credentials
    const token = jwt.sign(
      { 
        staffId: 'demo-staff-id',
        mobile: mobile,
        role: 'staff',
        businessCode: businessCode
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      staff: {
        name: mobile,
        role: 'staff'
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin auth middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Admin access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid admin token' });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    req.admin = user;
    next();
  });
};

// ============================================================================
// ADMIN PANEL ENDPOINTS
// ============================================================================

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Query database for admin user
    const result = await db.query(
      'SELECT * FROM admin_users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }
    
    const admin = result.rows[0];
    
    // For demo purposes, accept any password
    // In production, use: const validPassword = await bcrypt.compare(password, admin.password_hash);
    const validPassword = true; // TEMPORARY - accept any password
    
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }
    
    // Update last login
    await db.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [admin.id]
    );
    
    const token = jwt.sign(
      { 
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
        fullName: admin.full_name
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard overview stats
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Get total businesses
    const businessesResult = await db.query(
      'SELECT COUNT(*) as total, COUNT(CASE WHEN status = $1 THEN 1 END) as active FROM businesses',
      ['active']
    );
    
    // Get total customers
    const customersResult = await db.query('SELECT COUNT(*) as total FROM customers');
    
    // Get active subscriptions
    const subscriptionsResult = await db.query(
      'SELECT COUNT(*) as total FROM business_subscriptions WHERE status = $1',
      ['active']
    );
    
    // Get monthly revenue
    const revenueResult = await db.query(
      `SELECT SUM(amount_paid) as total FROM business_subscriptions 
       WHERE status = 'active' AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)`
    );
    
    res.json({
      totalBusinesses: parseInt(businessesResult.rows[0].total),
      activeBusinesses: parseInt(businessesResult.rows[0].active),
      totalCustomers: parseInt(customersResult.rows[0].total),
      activeSubscriptions: parseInt(subscriptionsResult.rows[0].total),
      monthlyRevenue: parseFloat(revenueResult.rows[0].total || 0)
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all businesses for admin panel
app.get('/api/admin/businesses', authenticateAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    
    let query = `
      SELECT 
        b.id,
        b.business_name,
        b.email,
        b.phone,
        b.status,
        b.created_at,
        bs.status as subscription_status,
        bs.end_date,
        sp.plan_name,
        sp.price,
        (SELECT COUNT(*) FROM customer_cards cc WHERE cc.business_id = b.id) as customer_count
      FROM businesses b
      LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
      LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (status && status !== 'all') {
      conditions.push(`b.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (search) {
      conditions.push(`(b.business_name ILIKE $${params.length + 1} OR b.email ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY b.created_at DESC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new business
app.post('/api/admin/businesses', authenticateAdmin, async (req, res) => {
  try {
    const { businessName, ownerName, email, phone, planId, subscriptionType } = req.body;
    
    // Check if business already exists
    const existingBusiness = await db.query(
      'SELECT id FROM businesses WHERE email = $1',
      [email]
    );
    
    if (existingBusiness.rows.length > 0) {
      return res.status(400).json({ message: 'Business email already exists' });
    }
    
    // Create business
    const hashedPassword = await bcrypt.hash('defaultPassword123', 10);
    const businessResult = await db.query(
      `INSERT INTO businesses (business_name, owner_name, email, password_hash, phone, status, plan_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [businessName, ownerName, email, hashedPassword, phone, 'active', subscriptionType]
    );
    
    const business = businessResult.rows[0];
    
    // Create subscription
    const plan = await db.query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    const planData = plan.rows[0];
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + planData.duration_months);
    
    await db.query(
      `INSERT INTO business_subscriptions (business_id, plan_id, status, start_date, end_date, amount_paid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [business.id, planId, 'active', startDate, endDate, planData.price]
    );
    
    res.status(201).json({
      message: 'Business created successfully',
      business: {
        id: business.id,
        businessName: business.business_name,
        email: business.email,
        status: business.status
      }
    });
  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get subscription plans
app.get('/api/admin/plans', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get subscriptions for admin panel
app.get('/api/admin/subscriptions', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        bs.*,
        b.business_name,
        b.email,
        sp.plan_name,
        sp.price
      FROM business_subscriptions bs
      JOIN businesses b ON bs.business_id = b.id
      JOIN subscription_plans sp ON bs.plan_id = sp.id
      ORDER BY bs.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update business status
app.put('/api/admin/businesses/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await db.query(
      'UPDATE businesses SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
    
    res.json({ message: 'Business status updated successfully' });
  } catch (error) {
    console.error('Update business status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Analytics endpoint for charts
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const { period } = req.query; // 'week', 'month', 'year'
    
    // Get revenue and customer growth data
    const revenueResult = await db.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(amount_paid) as revenue,
        COUNT(*) as subscriptions
      FROM business_subscriptions 
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `);
    
    // Get business status distribution
    const statusResult = await db.query(`
      SELECT status, COUNT(*) as count
      FROM businesses
      GROUP BY status
    `);
    
    res.json({
      revenueGrowth: revenueResult.rows,
      businessStatus: statusResult.rows
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// ============================================================================
// BUSINESS ROUTES
// ============================================================================

// Get businesses (protected)
app.get('/api/businesses', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, business_name, mobile, plan_type, status FROM businesses WHERE id = $1',
      [req.user.businessId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// LOYALTY CARD ROUTES
// ============================================================================

// Get loyalty cards for a business
app.get('/api/loyalty-cards', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM loyalty_cards WHERE business_id = $1 ORDER BY created_at DESC',
      [req.user.businessId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create/Update loyalty card
app.post('/api/loyalty-cards', authenticateToken, async (req, res) => {
  try {
    const { 
      cardName, 
      description, 
      stampsRequired, 
      rewardDescription, 
      backgroundColor, 
      textColor,
      logoText 
    } = req.body;
    
    // Check if card already exists
    const existingCard = await db.query(
      'SELECT id FROM loyalty_cards WHERE business_id = $1',
      [req.user.businessId]
    );
    
    let result;
    if (existingCard.rows.length > 0) {
      // Update existing card
      result = await db.query(
        `UPDATE loyalty_cards 
         SET card_name = $2, description = $3, stamps_required = $4, 
             reward_description = $5, background_color = $6, text_color = $7,
             logo_text = $8, updated_at = NOW()
         WHERE business_id = $1
         RETURNING *`,
        [req.user.businessId, cardName, description, stampsRequired, 
         rewardDescription, backgroundColor, textColor, logoText]
      );
    } else {
      // Create new card
      const cardCode = `CARD-${Date.now().toString(36).toUpperCase()}`;
      result = await db.query(
        `INSERT INTO loyalty_cards 
         (business_id, card_name, description, stamps_required, reward_description, 
          background_color, text_color, logo_text, card_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.businessId, cardName, description, stampsRequired, 
         rewardDescription, backgroundColor, textColor, logoText, cardCode]
      );
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving card:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// CUSTOMER ROUTES
// ============================================================================

// Get customers for a business
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, cc.stamps_count, cc.rewards_earned, cc.last_stamp_date
       FROM customers c
       JOIN customer_cards cc ON c.id = cc.customer_id
       WHERE cc.business_id = $1
       ORDER BY cc.last_stamp_date DESC`,
      [req.user.businessId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register customer (from customer app)
app.post('/api/customers/register', async (req, res) => {
  try {
    const { name, phone, cardId } = req.body;
    
    // For now, skip card validation and use default card data
    const defaultCard = {
  id: '00000000-0000-0000-0000-000000000001', // Valid UUID format
  stamps_required: 10,
  business_id: 'c913afc0-05fd-4b85-8261-e10e836e18b1' // Valid UUID format
};
    
    // Check if customer exists
    let customer;
    const existingCustomer = await db.query(
      'SELECT * FROM customers WHERE phone = $1',
      [phone]
    );
    
    if (existingCustomer.rows.length > 0) {
      customer = existingCustomer.rows[0];
    } else {
      // Create new customer
      const newCustomer = await db.query(
        'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING *',
        [name, phone]
      );
      customer = newCustomer.rows[0];
    }
    
    // Generate QR code data
    const qrData = `LOYALTYJO-${phone}-${cardId}-${customer.id}`;
    
    // Check if customer_card relationship exists
    const existingCustomerCard = await db.query(
      'SELECT * FROM customer_cards WHERE customer_id = $1',
      [customer.id]
    );
    
    let customerCard;
    if (existingCustomerCard.rows.length > 0) {
      customerCard = existingCustomerCard.rows[0];
    } else {
      // Create customer_card relationship
      const newCustomerCard = await db.query(
        `INSERT INTO customer_cards (customer_id, card_id, business_id, stamps_count, qr_code_data)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [customer.id, defaultCard.id, defaultCard.business_id, 0, qrData]
      );
      customerCard = newCustomerCard.rows[0];
    }
    
    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        stamps: customerCard.stamps_count,
        totalStamps: defaultCard.stamps_required,
        qrData: qrData
      }
    });
    
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// ============================================================================
// STAMP ROUTES
// ============================================================================

// Add stamp
app.post('/api/stamps/add', authenticateToken, async (req, res) => {
  try {
    const { customerCardId, customerId } = req.body;
    
    // Get customer card
    const cardResult = await db.query(
      `SELECT * FROM customer_cards 
       WHERE (id = $1 OR qr_code_data = $1) 
       AND business_id = $2`,
      [customerCardId, req.user.businessId]
    );
    
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer card not found' });
    }
    
    const customerCard = cardResult.rows[0];
    
    // Add stamp
    await db.query(
      `INSERT INTO stamp_transactions 
       (customer_card_id, business_id, staff_id, transaction_type)
       VALUES ($1, $2, $3, 'stamp')`,
      [customerCard.id, req.user.businessId, req.user.staffId || null]
    );
    
    // Update stamp count
    await db.query(
      `UPDATE customer_cards 
       SET stamps_count = stamps_count + 1, 
           last_stamp_date = NOW()
       WHERE id = $1`,
      [customerCard.id]
    );
    
    res.json({ success: true, message: 'Stamp added successfully' });
  } catch (error) {
    console.error('Error adding stamp:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// ANALYTICS ROUTES
// ============================================================================

// Get dashboard analytics
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
  try {
    // Get total customers
    const customersResult = await db.query(
      `SELECT COUNT(DISTINCT customer_id) as total
       FROM customer_cards
       WHERE business_id = $1`,
      [req.user.businessId]
    );
    
    // Get stamps this month
    const stampsResult = await db.query(
      `SELECT COUNT(*) as total
       FROM stamp_transactions
       WHERE business_id = $1 
       AND transaction_type = 'stamp'
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [req.user.businessId]
    );
    
    // Get rewards redeemed this month
    const rewardsResult = await db.query(
      `SELECT COUNT(*) as total
       FROM stamp_transactions
       WHERE business_id = $1 
       AND transaction_type = 'redeem'
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [req.user.businessId]
    );
    
    res.json({
      totalCustomers: parseInt(customersResult.rows[0].total),
      stampsThisMonth: parseInt(stampsResult.rows[0].total),
      rewardsRedeemed: parseInt(rewardsResult.rows[0].total),
      activeCards: 1 // Placeholder
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// PUBLIC ROUTES (Customer-facing)
// ============================================================================

// Get card details by ID (for customer app)
app.get('/api/public/card/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    
    const result = await db.query(
      `SELECT lc.*, b.business_name, b.logo_url as business_logo
       FROM loyalty_cards lc
       JOIN businesses b ON lc.business_id = b.id
       WHERE lc.card_code = $1 OR lc.id = $1`,
      [cardId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching card:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// SCANNER ROUTES
// ============================================================================

// Get today's stats for scanner
app.get('/api/analytics/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get stamps given today
    const stampsResult = await db.query(
      `SELECT COUNT(*) as total
       FROM stamp_transactions
       WHERE business_id = $1 
       AND transaction_type = 'stamp'
       AND created_at >= $2`,
      [req.user.businessId || 'demo-business-id', today]
    );
    
    // Get unique customers served today
    const customersResult = await db.query(
      `SELECT COUNT(DISTINCT customer_card_id) as total
       FROM stamp_transactions
       WHERE business_id = $1 
       AND created_at >= $2`,
      [req.user.businessId || 'demo-business-id', today]
    );
    
    // Get rewards redeemed today
    const rewardsResult = await db.query(
      `SELECT COUNT(*) as total
       FROM stamp_transactions
       WHERE business_id = $1 
       AND transaction_type = 'redeem'
       AND created_at >= $2`,
      [req.user.businessId || 'demo-business-id', today]
    );
    
    res.json({
      stampsGiven: parseInt(stampsResult.rows[0]?.total || 0),
      customersServed: parseInt(customersResult.rows[0]?.total || 0),
      rewardsRedeemed: parseInt(rewardsResult.rows[0]?.total || 0)
    });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Scan customer QR code
app.post('/api/customers/scan', authenticateToken, async (req, res) => {
  try {
    const { qrCode, phone, cardId } = req.body;
    
    // Get customer info
    const customerResult = await db.query(
      `SELECT c.*, cc.stamps_count, cc.id as customer_card_id, cc.last_stamp_date,
              lc.stamps_required, lc.reward_description
       FROM customers c
       JOIN customer_cards cc ON c.id = cc.customer_id
       JOIN loyalty_cards lc ON cc.card_id = lc.id
       WHERE c.phone = $1 OR cc.qr_code_data = $2
       LIMIT 1`,
      [phone, qrCode]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    const customer = customerResult.rows[0];
    
    // Format last visit
    let lastVisit = 'First visit';
    if (customer.last_stamp_date) {
      const daysDiff = Math.floor((new Date() - new Date(customer.last_stamp_date)) / (1000 * 60 * 60 * 24));
      if (daysDiff === 0) lastVisit = 'Today';
      else if (daysDiff === 1) lastVisit = 'Yesterday';
      else lastVisit = `${daysDiff} days ago`;
    }
    
    res.json({
      customerId: customer.id,
      customerCardId: customer.customer_card_id,
      name: customer.name,
      phone: customer.phone,
      currentStamps: customer.stamps_count,
      maxStamps: customer.stamps_required,
      lastVisit: lastVisit,
      rewardDescription: customer.reward_description
    });
  } catch (error) {
    console.error('Error scanning customer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Redeem reward
app.post('/api/stamps/redeem', authenticateToken, async (req, res) => {
  try {
    const { customerCardId } = req.body;
    
    // Start transaction
    await db.query('BEGIN');
    
    // Add redemption transaction
    await db.query(
      `INSERT INTO stamp_transactions 
       (customer_card_id, business_id, staff_id, transaction_type, stamps_added)
       VALUES ($1, $2, $3, 'redeem', 0)`,
      [customerCardId, req.user.businessId || 'demo-business-id', req.user.staffId || null]
    );
    
    // Reset stamp count and increment rewards
    await db.query(
      `UPDATE customer_cards 
       SET stamps_count = 0, 
           rewards_redeemed = rewards_redeemed + 1,
           rewards_earned = rewards_earned + 1,
           last_stamp_date = NOW()
       WHERE id = $1`,
      [customerCardId]
    );
    
    await db.query('COMMIT');
    
    res.json({ success: true, message: 'Reward redeemed successfully' });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error redeeming reward:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ADMIN PANEL ENDPOINTS
// ============================================

// Admin Authentication
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // For demo purposes, use hardcoded admin credentials
    if (email === 'admin@loyaltyjo.com' && password === 'admin123') {
      const token = jwt.sign(
        { 
          id: 'admin-001',
          email: email,
          role: 'admin'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        admin: {
          id: 'admin-001',
          email: email,
          name: 'Admin User',
          role: 'admin'
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin login'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(\`🚀 Server is running on port \${PORT}\`);
  console.log(\`📚 API documentation available at http://localhost:\${PORT}/api-docs\`);
});" >> server.js
