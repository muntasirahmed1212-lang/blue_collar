// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./server/routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Headers ─────────────────────────
app.use(helmet({
  contentSecurityPolicy: false  // Allow inline scripts in your existing HTML
}));

// ─── CORS ──────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
}));

// ─── Body Parsing ──────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ───────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,         // Set true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));

// ─── Rate Limiting (Global) ───────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                    // 100 requests per window
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', globalLimiter);

// ─── API Routes ────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Serve Static Files (your existing site) ──
app.use(express.static(path.join(__dirname, '.')));

// ─── Fallback to index.html ────────────────────
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ──────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ BlueCollar Connect server running at http://localhost:${PORT}`);
});
