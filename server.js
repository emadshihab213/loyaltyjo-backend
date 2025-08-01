// LoyaltyJO Backend API - Updated for Supabase
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = {
query: async () => ({ rows: [] })
};
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://loyaltyjoscan.netlify.app'],
  credentials: true
}));

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
    const { businessCode, mobile, password } = req.body; // Changed mobile to mobile
    
    // For demo purposes, accept any staff credentials
    const token = jwt.sign(
      { 
        staffId: 'demo-staff-id',
        mobile: mobile, // Changed email to mobile
        role: 'staff',
        businessCode: businessCode
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      staff: {
        name: mobile, // Use mobile instead of email
        role: 'staff'
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
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
    
    // Get card details
    const cardResult = await db.query(
      'SELECT * FROM loyalty_cards WHERE card_code = $1 OR id = $1',
      [cardId]
    );
    
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }
    
    const card = cardResult.rows[0];
    
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
    
    // Create customer card link
    const qrData = `LJO-${customer.id}-${card.id}-${Date.now()}`;
    await db.query(
      `INSERT INTO customer_cards 
       (customer_id, card_id, business_id, qr_code_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (customer_id, card_id) DO NOTHING`,
      [customer.id, card.id, card.business_id, qrData]
    );
    
    res.json({
      success: true,
      customer: customer,
      card: card,
      qrCode: qrData
    });
  } catch (error) {
    console.error('Error registering customer:', error);
    res.status(500).json({ message: 'Server error' });
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

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/api-docs`);
});

module.exports = app;
