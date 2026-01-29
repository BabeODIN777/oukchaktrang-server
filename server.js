require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection - Railway provides these env vars
const getDatabaseConfig = () => {
  // Railway provides DATABASE_URL or separate variables
  if (process.env.DATABASE_URL) {
    // PostgreSQL URL format
    return { connectionString: process.env.DATABASE_URL };
  }
  
  // MySQL configuration
  return {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'oukchaktrang',
    port: process.env.MYSQLPORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
};

let dbPool;

// Initialize database connection
async function initializeDatabase() {
  try {
    const config = getDatabaseConfig();
    
    if (config.connectionString) {
      // PostgreSQL
      const { Pool } = require('pg');
      dbPool = new Pool({ connectionString: config.connectionString });
      console.log('Connected to PostgreSQL via Railway');
    } else {
      // MySQL
      dbPool = mysql.createPool(config);
      console.log('Connected to MySQL via Railway');
    }
    
    // Create tables if they don't exist
    await createTables();
    
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

async function createTables() {
  const isPostgres = process.env.DATABASE_URL;
  
  if (isPostgres) {
    // PostgreSQL tables
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
        experience_points INTEGER DEFAULT 0,
        guild_id INTEGER,
        country VARCHAR(50),
        avatar_url VARCHAR(255),
        is_developer BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS guilds (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        leader_id INTEGER REFERENCES users(id),
        level INTEGER DEFAULT 1,
        total_wins INTEGER DEFAULT 0,
        member_limit INTEGER DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
  } else {
    // MySQL tables
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
        experience_points INT DEFAULT 0,
        guild_id INT,
        country VARCHAR(50),
        avatar_url VARCHAR(255),
        is_developer BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email)
      );
    `);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS guilds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        leader_id INT,
        level INT DEFAULT 1,
        total_wins INT DEFAULT 0,
        member_limit INT DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (leader_id) REFERENCES users(id)
      );
    `);
  }
  
  console.log('Database tables ready');
}

// Health check endpoint - Railway needs this
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'Ouk Chaktrang Game Server',
    version: '1.0.0'
  });
});

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists
    let existingUser;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );
      existingUser = result.rows;
    } else {
      // MySQL
      const [rows] = await dbPool.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );
      existingUser = rows;
    }
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const finalDisplayName = display_name || username;
    
    // Create user
    let newUser;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        `INSERT INTO users (username, email, password_hash, display_name, coins, diamonds) 
         VALUES ($1, $2, $3, $4, 1000, 10) 
         RETURNING id, username, email, display_name, coins, diamonds, level`,
        [username, email, hashedPassword, finalDisplayName]
      );
      newUser = result.rows[0];
    } else {
      // MySQL
      const [result] = await dbPool.query(
        `INSERT INTO users (username, email, password_hash, display_name, coins, diamonds) 
         VALUES (?, ?, ?, ?, 1000, 10)`,
        [username, email, hashedPassword, finalDisplayName]
      );
      
      const [userRows] = await dbPool.query(
        'SELECT id, username, email, display_name, coins, diamonds, level FROM users WHERE id = ?',
        [result.insertId]
      );
      newUser = userRows[0];
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      token,
      user: newUser
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Find user
    let user;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        'SELECT * FROM users WHERE username = $1 OR email = $1',
        [username]
      );
      user = result.rows[0];
    } else {
      // MySQL
      const [rows] = await dbPool.query(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username]
      );
      user = rows[0];
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    if (process.env.DATABASE_URL) {
      await dbPool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );
    } else {
      await dbPool.query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
      );
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '30d' }
    );
    
    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      token,
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get user profile (protected)
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    
    let user;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        `SELECT id, username, email, display_name, coins, diamonds, level,
                total_wins, total_losses, total_draws, created_at, last_login,
                guild_id, country, avatar_url
         FROM users WHERE id = $1`,
        [req.params.userId]
      );
      user = result.rows[0];
    } else {
      // MySQL
      const [rows] = await dbPool.query(
        `SELECT id, username, email, display_name, coins, diamonds, level,
                total_wins, total_losses, total_draws, created_at, last_login,
                guild_id, country, avatar_url
         FROM users WHERE id = ?`,
        [req.params.userId]
      );
      user = rows[0];
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, user });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update game results
app.post('/api/game/result', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { userId, won, level, coins_earned, diamonds_earned } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token
    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    
    if (won) {
      if (process.env.DATABASE_URL) {
        // PostgreSQL
        await dbPool.query(
          `UPDATE users 
           SET total_wins = total_wins + 1,
               coins = coins + $1,
               diamonds = diamonds + $2,
               level = CASE WHEN level = $3 AND level < 50 THEN level + 1 ELSE level END
           WHERE id = $4`,
          [coins_earned || 100, diamonds_earned || 1, level, userId]
        );
      } else {
        // MySQL
        await dbPool.query(
          `UPDATE users 
           SET total_wins = total_wins + 1,
               coins = coins + ?,
               diamonds = diamonds + ?,
               level = CASE WHEN level = ? AND level < 50 THEN level + 1 ELSE level END
           WHERE id = ?`,
          [coins_earned || 100, diamonds_earned || 1, level, userId]
        );
      }
    } else {
      if (process.env.DATABASE_URL) {
        await dbPool.query(
          `UPDATE users 
           SET total_losses = total_losses + 1,
               coins = coins + $1,
               diamonds = diamonds + $2
           WHERE id = $3`,
          [coins_earned || 10, diamonds_earned || 0, userId]
        );
      } else {
        await dbPool.query(
          `UPDATE users 
           SET total_losses = total_losses + 1,
               coins = coins + ?,
               diamonds = diamonds + ?
           WHERE id = ?`,
          [coins_earned || 10, diamonds_earned || 0, userId]
        );
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Game result error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    let players;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        `SELECT id, username, display_name, level, total_wins, 
                total_losses, total_draws, coins, diamonds,
                ROUND((total_wins * 100.0 / GREATEST(total_wins + total_losses + total_draws, 1)), 1) as win_rate
         FROM users 
         ORDER BY total_wins DESC 
         LIMIT 100`
      );
      players = result.rows;
    } else {
      // MySQL
      const [rows] = await dbPool.query(
        `SELECT id, username, display_name, level, total_wins, 
                total_losses, total_draws, coins, diamonds,
                ROUND((total_wins * 100.0 / GREATEST(total_wins + total_losses + total_draws, 1)), 1) as win_rate
         FROM users 
         ORDER BY total_wins DESC 
         LIMIT 100`
      );
      players = rows;
    }
    
    res.json({ success: true, players });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Guilds list
app.get('/api/guilds', async (req, res) => {
  try {
    let guilds;
    if (process.env.DATABASE_URL) {
      // PostgreSQL
      const result = await dbPool.query(
        `SELECT g.*, COUNT(gu.user_id) as member_count
         FROM guilds g
         LEFT JOIN guild_users gu ON g.id = gu.guild_id
         GROUP BY g.id
         ORDER BY g.level DESC, g.total_wins DESC
         LIMIT 50`
      );
      guilds = result.rows;
    } else {
      // MySQL
      const [rows] = await dbPool.query(
        `SELECT g.*, COUNT(gu.user_id) as member_count
         FROM guilds g
         LEFT JOIN guild_users gu ON g.id = gu.guild_id
         GROUP BY g.id
         ORDER BY g.level DESC, g.total_wins DESC
         LIMIT 50`
      );
      guilds = rows;
    }
    
    res.json({ success: true, guilds });
    
  } catch (error) {
    console.error('Guilds error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/`);
  });
}

startServer().catch(console.error);
