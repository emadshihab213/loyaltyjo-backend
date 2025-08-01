const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'LoyaltyJO API is running!',
    version: '2.0',
    endpoints: {
      businesses: '/api/businesses',
      auth: '/api/auth/login',
      cards: '/api/cards',
      customers: '/api/customers'
    }
  });
});

// Mock auth endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Mock response for testing
  if (email && password) {
    res.json({
      success: true,
      token: 'mock-jwt-token',
      user: {
        id: 1,
        email: email,
        businessName: 'Test Business'
      }
    });
  } else {
    res.status(400).json({ error: 'Email and password required' });
  }
});

// Mock businesses endpoint  
app.get('/api/businesses', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Sunshine Cafe', plan: 'Premium Plus' },
      { id: 2, name: 'Modern Barber', plan: 'Premium' }
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test the API at: http://localhost:${PORT}`);
});