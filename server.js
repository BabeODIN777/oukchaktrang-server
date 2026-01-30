// server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Use Railway's PORT (defaults to 8080)
const PORT = process.env.PORT || 8080;

// In-memory database for testing (replace with real DB later)
const users = [];

// JWT secret (set this in Railway environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Helper to hash password
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

// Helper to compare password
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Ouk Chaktrang Server is running',
        timestamp: new Date().toISOString(),
        port: PORT,
        usersCount: users.length
    });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Verify password
        const validPassword = await comparePassword(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user.userId, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Update last login
        user.lastLogin = new Date();
        
        res.json({ 
            token, 
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                coins: user.coins,
                diamonds: user.diamonds,
                totalWins: user.totalWins,
                totalLosses: user.totalLosses,
                totalDraws: user.totalDraws,
                currentLevel: user.currentLevel,
                highestLevel: user.highestLevel,
                experiencePoints: user.experiencePoints,
                guildName: user.guildName,
                country: user.country,
                isDeveloper: user.isDeveloper,
                isPremium: user.isPremium,
                achievements: user.achievements,
                stats: user.stats,
                createdDate: user.createdDate,
                lastLogin: user.lastLogin
            }
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
        if (users.some(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        if (users.some(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Create new user
        const newUser = {
            userId: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            username,
            email,
            passwordHash,
            displayName: displayName || username,
            avatarUrl: 'default_avatar',
            coins: 1000,
            diamonds: 10,
            totalWins: 0,
            totalLosses: 0,
            totalDraws: 0,
            currentLevel: 1,
            highestLevel: 1,
            experiencePoints: 0,
            guildName: '',
            country: 'Cambodia',
            isDeveloper: false,
            isPremium: false,
            achievements: [],
            stats: {
                rating: 1200,
                streak: 0,
                gamesPlayed: 0,
                winRate: 0
            },
            createdDate: new Date(),
            lastLogin: new Date()
        };
        
        users.push(newUser);
        
        // Create JWT token
        const token = jwt.sign(
            { userId: newUser.userId, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({ 
            token, 
            user: {
                userId: newUser.userId,
                username: newUser.username,
                email: newUser.email,
                displayName: newUser.displayName,
                avatarUrl: newUser.avatarUrl,
                coins: newUser.coins,
                diamonds: newUser.diamonds,
                totalWins: newUser.totalWins,
                totalLosses: newUser.totalLosses,
                totalDraws: newUser.totalDraws,
                currentLevel: newUser.currentLevel,
                highestLevel: newUser.highestLevel,
                experiencePoints: newUser.experiencePoints,
                guildName: newUser.guildName,
                country: newUser.country,
                isDeveloper: newUser.isDeveloper,
                isPremium: newUser.isPremium,
                achievements: newUser.achievements,
                stats: newUser.stats,
                createdDate: newUser.createdDate,
                lastLogin: newUser.lastLogin
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user profile
app.get('/api/user/profile/:userId', (req, res) => {
    const user = users.find(u => u.userId === req.params.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        userId: user.userId,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        coins: user.coins,
        diamonds: user.diamonds,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalDraws: user.totalDraws,
        currentLevel: user.currentLevel,
        highestLevel: user.highestLevel,
        experiencePoints: user.experiencePoints,
        guildName: user.guildName,
        country: user.country,
        isDeveloper: user.isDeveloper,
        isPremium: user.isPremium,
        achievements: user.achievements,
        stats: user.stats,
        createdDate: user.createdDate,
        lastLogin: user.lastLogin
    });
});

// Update user profile
app.put('/api/user/update/:userId', (req, res) => {
    const userIndex = users.findIndex(u => u.userId === req.params.userId);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const updates = req.body;
    const user = users[userIndex];
    
    // Update fields
    if (updates.displayName) user.displayName = updates.displayName;
    if (updates.avatarUrl) user.avatarUrl = updates.avatarUrl;
    if (updates.country) user.country = updates.country;
    if (updates.guildName) user.guildName = updates.guildName;
    
    res.json({
        userId: user.userId,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        coins: user.coins,
        diamonds: user.diamonds,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalDraws: user.totalDraws,
        currentLevel: user.currentLevel,
        highestLevel: user.highestLevel,
        experiencePoints: user.experiencePoints,
        guildName: user.guildName,
        country: user.country,
        isDeveloper: user.isDeveloper,
        isPremium: user.isPremium,
        achievements: user.achievements,
        stats: user.stats,
        createdDate: user.createdDate,
        lastLogin: user.lastLogin
    });
});

// Save game results
app.post('/api/game/result', (req, res) => {
    const { userId, win, level, coinsEarned, diamondsEarned } = req.body;
    
    const user = users.find(u => u.userId === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user stats
    if (win) {
        user.totalWins++;
        user.experiencePoints += 100;
    } else {
        user.totalLosses++;
        user.experiencePoints += 25;
    }
    
    user.coins += coinsEarned;
    user.diamonds += diamondsEarned;
    
    if (win && level > 0) {
        if (level == user.currentLevel && level < 50) {
            user.currentLevel++;
        }
        if (level > user.highestLevel) {
            user.highestLevel = level;
        }
    }
    
    res.json({ success: true, message: 'Game result saved' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ouk Chaktrang Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`🔑 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
    console.log(`👥 Preloaded users: ${users.length}`);
});
