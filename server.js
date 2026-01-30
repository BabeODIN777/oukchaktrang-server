// server.js for Railway with MySQL/PostgreSQL
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Database connection - Railway automatically provides DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

let db;
if (DATABASE_URL.includes('mysql')) {
    // MySQL
    const mysql = require('mysql2/promise');
    db = mysql.createPool(DATABASE_URL);
} else {
    // PostgreSQL (Railway default)
    const { Pool } = require('pg');
    db = new Pool({ connectionString: DATABASE_URL });
}

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Helper function to hash password
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

// Helper function to compare password
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Initialize database tables
async function initDatabase() {
    try {
        let createTableQuery;
        
        if (DATABASE_URL.includes('mysql')) {
            // MySQL table creation
            createTableQuery = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    userId VARCHAR(255) UNIQUE,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    passwordHash TEXT NOT NULL,
                    displayName VARCHAR(255),
                    avatarUrl VARCHAR(255) DEFAULT 'default_avatar',
                    country VARCHAR(100) DEFAULT 'Cambodia',
                    coins INT DEFAULT 1000,
                    diamonds INT DEFAULT 10,
                    totalWins INT DEFAULT 0,
                    totalLosses INT DEFAULT 0,
                    totalDraws INT DEFAULT 0,
                    currentLevel INT DEFAULT 1,
                    highestLevel INT DEFAULT 1,
                    experiencePoints INT DEFAULT 0,
                    guildName VARCHAR(255) DEFAULT '',
                    isDeveloper BOOLEAN DEFAULT FALSE,
                    isPremium BOOLEAN DEFAULT FALSE,
                    achievements TEXT,
                    stats TEXT,
                    createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    lastLogin TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_email (email),
                    INDEX idx_username (username),
                    INDEX idx_userId (userId)
                )`;
        } else {
            // PostgreSQL table creation
            createTableQuery = `
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    userId VARCHAR(255) UNIQUE,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    passwordHash TEXT NOT NULL,
                    displayName VARCHAR(255),
                    avatarUrl VARCHAR(255) DEFAULT 'default_avatar',
                    country VARCHAR(100) DEFAULT 'Cambodia',
                    coins INT DEFAULT 1000,
                    diamonds INT DEFAULT 10,
                    totalWins INT DEFAULT 0,
                    totalLosses INT DEFAULT 0,
                    totalDraws INT DEFAULT 0,
                    currentLevel INT DEFAULT 1,
                    highestLevel INT DEFAULT 1,
                    experiencePoints INT DEFAULT 0,
                    guildName VARCHAR(255) DEFAULT '',
                    isDeveloper BOOLEAN DEFAULT FALSE,
                    isPremium BOOLEAN DEFAULT FALSE,
                    achievements TEXT,
                    stats TEXT,
                    createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    lastLogin TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_username ON users(username);
                CREATE INDEX IF NOT EXISTS idx_userId ON users(userId);`;
        }
        
        await db.query(createTableQuery);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Convert database row to user object
function rowToUser(row) {
    return {
        userId: row.userid || row.userId,
        username: row.username,
        email: row.email,
        passwordHash: row.passwordhash || row.passwordHash,
        displayName: row.displayname || row.displayName || row.username,
        avatarUrl: row.avatarurl || row.avatarUrl || 'default_avatar',
        country: row.country || 'Cambodia',
        coins: parseInt(row.coins) || 1000,
        diamonds: parseInt(row.diamonds) || 10,
        totalWins: parseInt(row.totalwins || row.totalWins) || 0,
        totalLosses: parseInt(row.totallosses || row.totalLosses) || 0,
        totalDraws: parseInt(row.totaldraws || row.totalDraws) || 0,
        currentLevel: parseInt(row.currentlevel || row.currentLevel) || 1,
        highestLevel: parseInt(row.highestlevel || row.highestLevel) || 1,
        experiencePoints: parseInt(row.experiencepoints || row.experiencePoints) || 0,
        guildName: row.guildname || row.guildName || '',
        isDeveloper: Boolean(row.isdeveloper || row.isDeveloper),
        isPremium: Boolean(row.ispremium || row.isPremium),
        achievements: row.achievements ? JSON.parse(row.achievements) : [],
        stats: row.stats ? JSON.parse(row.stats) : {
            rating: 1200,
            streak: 0,
            gamesPlayed: 0,
            winRate: 0
        },
        createdDate: row.createddate || row.createdDate || new Date(),
        lastLogin: row.lastlogin || row.lastLogin || new Date()
    };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: DATABASE_URL ? 'Connected' : 'Not connected'
    });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        // Find user by email
        let query, params;
        if (DATABASE_URL.includes('mysql')) {
            query = 'SELECT * FROM users WHERE email = ?';
            params = [email];
        } else {
            query = 'SELECT * FROM users WHERE email = $1';
            params = [email];
        }
        
        const [rows] = await db.query(query, params);
        
        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        const userObj = rowToUser(user);
        
        // Verify password
        const validPassword = await comparePassword(password, userObj.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        const updateQuery = DATABASE_URL.includes('mysql') 
            ? 'UPDATE users SET lastLogin = NOW() WHERE userId = ?'
            : 'UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE userId = $1';
        
        await db.query(updateQuery, [userObj.userId]);
        
        // Create JWT token
        const token = jwt.sign(
            { userId: userObj.userId, email: userObj.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password hash from response
        delete userObj.passwordHash;
        
        res.json({ 
            token, 
            user: userObj 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }
        
        // Check if user exists
        let checkQuery, checkParams;
        if (DATABASE_URL.includes('mysql')) {
            checkQuery = 'SELECT * FROM users WHERE email = ? OR username = ?';
            checkParams = [email, username];
        } else {
            checkQuery = 'SELECT * FROM users WHERE email = $1 OR username = $2';
            checkParams = [email, username];
        }
        
        const [existingUsers] = await db.query(checkQuery, checkParams);
        
        if (existingUsers && existingUsers.length > 0) {
            const existing = existingUsers[0];
            if (existing.email === email) {
                return res.status(400).json({ error: 'Email already registered' });
            }
            if (existing.username === username) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }
        
        // Hash password
        const passwordHash = await hashPassword(password);
        const userId = require('crypto').randomUUID();
        
        // Insert new user
        let insertQuery, insertParams;
        if (DATABASE_URL.includes('mysql')) {
            insertQuery = `
                INSERT INTO users (
                    userId, username, email, passwordHash, displayName, 
                    achievements, stats
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            insertParams = [
                userId, username, email, passwordHash, displayName || username,
                JSON.stringify([]), 
                JSON.stringify({ rating: 1200, streak: 0, gamesPlayed: 0, winRate: 0 })
            ];
        } else {
            insertQuery = `
                INSERT INTO users (
                    userId, username, email, passwordHash, displayName, 
                    achievements, stats
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
            insertParams = [
                userId, username, email, passwordHash, displayName || username,
                JSON.stringify([]), 
                JSON.stringify({ rating: 1200, streak: 0, gamesPlayed: 0, winRate: 0 })
            ];
        }
        
        await db.query(insertQuery, insertParams);
        
        // Get the created user
        let getUserQuery, getUserParams;
        if (DATABASE_URL.includes('mysql')) {
            getUserQuery = 'SELECT * FROM users WHERE userId = ?';
            getUserParams = [userId];
        } else {
            getUserQuery = 'SELECT * FROM users WHERE userId = $1';
            getUserParams = [userId];
        }
        
        const [newUserRows] = await db.query(getUserQuery, getUserParams);
        const newUser = rowToUser(newUserRows[0]);
        
        // Create JWT token
        const token = jwt.sign(
            { userId: newUser.userId, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password hash from response
        delete newUser.passwordHash;
        
        res.status(201).json({ 
            token, 
            user: newUser 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user profile
app.get('/api/user/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        let query, params;
        if (DATABASE_URL.includes('mysql')) {
            query = 'SELECT * FROM users WHERE userId = ?';
            params = [userId];
        } else {
            query = 'SELECT * FROM users WHERE userId = $1';
            params = [userId];
        }
        
        const [rows] = await db.query(query, params);
        
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = rowToUser(rows[0]);
        delete user.passwordHash;
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user profile
app.put('/api/user/update/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        
        // Build update query dynamically
        const fields = [];
        const values = [];
        let paramIndex = 1;
        
        Object.keys(updates).forEach(key => {
            if (key !== 'userId' && key !== 'id') {
                fields.push(key);
                values.push(updates[key]);
            }
        });
        
        if (fields.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }
        
        let updateQuery;
        if (DATABASE_URL.includes('mysql')) {
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            updateQuery = `UPDATE users SET ${setClause} WHERE userId = ?`;
            values.push(userId);
        } else {
            const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
            updateQuery = `UPDATE users SET ${setClause} WHERE userId = $${fields.length + 1}`;
            values.push(userId);
        }
        
        await db.query(updateQuery, values);
        
        // Get updated user
        let getUserQuery, getUserParams;
        if (DATABASE_URL.includes('mysql')) {
            getUserQuery = 'SELECT * FROM users WHERE userId = ?';
            getUserParams = [userId];
        } else {
            getUserQuery = 'SELECT * FROM users WHERE userId = $1';
            getUserParams = [userId];
        }
        
        const [rows] = await db.query(getUserQuery, getUserParams);
        const user = rowToUser(rows[0]);
        delete user.passwordHash;
        
        res.json(user);
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user stats
app.post('/api/user/stats', async (req, res) => {
    try {
        const { userId, ...stats } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }
        
        // Get current user
        let query, params;
        if (DATABASE_URL.includes('mysql')) {
            query = 'SELECT * FROM users WHERE userId = ?';
            params = [userId];
        } else {
            query = 'SELECT * FROM users WHERE userId = $1';
            params = [userId];
        }
        
        const [rows] = await db.query(query, params);
        
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = rowToUser(rows[0]);
        
        // Update stats
        if (stats.wins !== undefined) user.totalWins = stats.wins;
        if (stats.losses !== undefined) user.totalLosses = stats.losses;
        if (stats.draws !== undefined) user.totalDraws = stats.draws;
        if (stats.coins !== undefined) user.coins = stats.coins;
        if (stats.diamonds !== undefined) user.diamonds = stats.diamonds;
        if (stats.currentLevel !== undefined) user.currentLevel = stats.currentLevel;
        if (stats.experience !== undefined) user.experiencePoints = stats.experience;
        
        // Update database
        let updateQuery, updateParams;
        if (DATABASE_URL.includes('mysql')) {
            updateQuery = `
                UPDATE users SET 
                    totalWins = ?, totalLosses = ?, totalDraws = ?,
                    coins = ?, diamonds = ?, currentLevel = ?, experiencePoints = ?,
                    stats = ?
                WHERE userId = ?`;
            updateParams = [
                user.totalWins, user.totalLosses, user.totalDraws,
                user.coins, user.diamonds, user.currentLevel, user.experiencePoints,
                JSON.stringify(user.stats),
                userId
            ];
        } else {
            updateQuery = `
                UPDATE users SET 
                    totalWins = $1, totalLosses = $2, totalDraws = $3,
                    coins = $4, diamonds = $5, currentLevel = $6, experiencePoints = $7,
                    stats = $8
                WHERE userId = $9`;
            updateParams = [
                user.totalWins, user.totalLosses, user.totalDraws,
                user.coins, user.diamonds, user.currentLevel, user.experiencePoints,
                JSON.stringify(user.stats),
                userId
            ];
        }
        
        await db.query(updateQuery, updateParams);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Stats update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// JWT verification middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Protected route example
app.get('/api/user/protected', verifyToken, (req, res) => {
    res.json({ 
        message: 'Protected data', 
        user: req.user 
    });
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API Base URL: http://localhost:${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
});
