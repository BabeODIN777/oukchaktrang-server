require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// CRITICAL: Railway needs proper CORS for health checks
app.use(cors({
  origin: '*', // Allow all origins for now
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON with limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// SIMPLE HEALTH CHECK - Railway looks for this
app.get('/', (req, res) => {
  console.log('Health check received');
  res.status(200).json({ 
    status: 'online',
    service: 'Ouk Chaktrang Game Server',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Add a dedicated health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Database connection with fallback
let dbPool = null;
let isDatabaseConnected = false;

async function initializeDatabase() {
  try {
    console.log('Initializing database connection...');
    
    // Check what database Railway provides
    console.log('Environment variables:', {
      DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set',
      MYSQLHOST: process.env.MYSQLHOST || 'Not set',
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'Not set'
    });
    
    // For Railway, always use DATABASE_URL if available
    if (process.env.DATABASE_URL) {
      console.log('Using PostgreSQL with DATABASE_URL');
      
      // Parse DATABASE_URL for PostgreSQL
      const { Pool } = require('pg');
      dbPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      // Test connection
      const client = await dbPool.connect();
      console.log('PostgreSQL connected successfully');
      client.release();
      
    } else if (process.env.MYSQLHOST) {
      console.log('Using MySQL with individual variables');
      dbPool = mysql.createPool({
        host: process.env.MYSQLHOST || 'localhost',
        user: process.env.MYSQLUSER || 'root',
        password: process.env.MYSQLPASSWORD || '',
        database: process.env.MYSQLDATABASE || 'railway',
        port: process.env.MYSQLPORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      
      // Test connection
      await dbPool.getConnection();
      console.log('MySQL connected successfully');
      
    } else {
      console.log('No database configuration found, running in memory-only mode');
      isDatabaseConnected = false;
      return;
    }
    
    isDatabaseConnected = true;
    
    // Create tables if they don't exist
    await createTables();
    
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    console.log('Running without database (in-memory mode)');
    isDatabaseConnected = false;
  }
}

async function createTables() {
  if (!isDatabaseConnected) return;
  
  try {
    // Create users table
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(50),
          coins INTEGER DEFAULT 1000,
          diamonds INTEGER DEFAULT 10,
          level INTEGER DEFAULT 1,
          total_wins INTEGER DEFAULT 0,
          total_losses INTEGER DEFAULT 0,
          total_draws INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        );
      `);
    } else {
      // MySQL
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(50),
          coins INT DEFAULT 1000,
          diamonds INT DEFAULT 10,
          level INT DEFAULT 1,
          total_wins INT DEFAULT 0,
          total_losses INT DEFAULT 0,
          total_draws INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        );
      `);
    }
    
    console.log('Database tables created/verified');
    
  } catch (error) {
    console.error('Table creation error:', error.message);
  }
}

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    // If database not connected, return error
    if (!isDatabaseConnected) {
      return res.status(503).json({ 
        error: 'Database temporarily unavailable',
        mode: 'offline'
      });
    }
    
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    // ... rest of registration code from previous version ...
    // For now, return success without database
    res.json({
      success: true,
      message: 'Registration endpoint working',
      database: isDatabaseConnected ? 'connected' : 'offline'
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Login endpoint working',
      database: isDatabaseConnected ? 'connected' : 'offline'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// CRITICAL: Handle all unhandled routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  // Initialize database (but don't block server start)
  initializeDatabase().then(() => {
    console.log('Database initialization attempt completed');
  }).catch(console.error);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: http://0.0.0.0:${PORT}/`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️ Database: ${isDatabaseConnected ? 'Connected' : 'Not connected'}`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down');
  process.exit(0);
});

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
