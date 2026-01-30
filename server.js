// server.js for Railway
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB (Railway provides MONGODB_URI)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oukchaktrang';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String },
  avatarUrl: { type: String, default: 'default_avatar' },
  country: { type: String, default: 'Cambodia' },
  coins: { type: Number, default: 1000 },
  diamonds: { type: Number, default: 10 },
  totalWins: { type: Number, default: 0 },
  totalLosses: { type: Number, default: 0 },
  totalDraws: { type: Number, default: 0 },
  currentLevel: { type: Number, default: 1 },
  highestLevel: { type: Number, default: 1 },
  experiencePoints: { type: Number, default: 0 },
  guildName: { type: String, default: '' },
  isDeveloper: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  achievements: { type: Array, default: [] },
  stats: {
    rating: { type: Number, default: 1200 },
    streak: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 }
  },
  createdDate: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// JWT Secret (set in Railway environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function to hash password
const hashPassword = (password) => {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
};

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data (excluding password)
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    
    res.json({ 
      token, 
      user: userResponse 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email ? 
          'Email already registered' : 
          'Username already taken' 
      });
    }
    
    // Create new user
    const newUser = new User({
      userId: require('crypto').randomUUID(),
      username,
      email,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
      createdDate: new Date(),
      lastLogin: new Date()
    });
    
    await newUser.save();
    
    // Create JWT token
    const token = jwt.sign(
      { userId: newUser.userId, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data (excluding password)
    const userResponse = newUser.toObject();
    delete userResponse.passwordHash;
    
    res.status(201).json({ 
      token, 
      user: userResponse 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/user/profile/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    
    res.json(userResponse);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
app.put('/api/user/update/:userId', async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: updates },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    
    res.json(userResponse);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user stats
app.post('/api/user/stats', async (req, res) => {
  try {
    const { userId, ...stats } = req.body;
    
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update stats
    Object.keys(stats).forEach(key => {
      if (key in user) {
        user[key] = stats[key];
      }
    });
    
    await user.save();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
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
  res.json({ message: 'Protected data', user: req.user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
