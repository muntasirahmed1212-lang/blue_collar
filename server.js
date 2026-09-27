// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./server/routes/auth');
const jobRoutes = require('./server/routes/jobs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Headers ─────────────────────────
app.use(helmet({
  contentSecurityPolicy: false  // Allow inline scripts in your existing HTML
}));

// ─── CORS & Trust Proxy ────────────────────────
// In 3-tier Vercel -> Render proxying, requests pass through 2 reverse proxies (Render LB + Vercel Edge).
// Trusting 2 hops ensures req.ip resolves to the end-user client IP instead of Vercel's edge IP,
// preventing shared global rate-limit throttling across all frontend users.
const trustProxyHops = process.env.TRUST_PROXY
  ? (isNaN(process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : parseInt(process.env.TRUST_PROXY, 10))
  : (process.env.NODE_ENV === 'production' ? 2 : 1);
app.set('trust proxy', trustProxyHops);

const frontendUrls = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim().replace(/^["']|["']$/g, '').trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...frontendUrls,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

const allowedOriginsLower = allowedOrigins.map(url => url.toLowerCase());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    const normalizedOriginLower = normalizedOrigin.toLowerCase();
    if (
      allowedOrigins.includes(origin) ||
      allowedOrigins.includes(normalizedOrigin) ||
      allowedOriginsLower.includes(normalizedOriginLower)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));

// ─── Body Parsing ──────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session ───────────────────────────────────
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
sessionPool.on('error', (err) => {
  console.error('Unexpected error on idle pgSession client:', err.message);
});

app.use(session({
  store: new pgSession({
    pool: sessionPool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'fallback_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
app.use('/api/jobs', jobRoutes);

// ─── Serve Static Files (your existing site) ──
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '.')));

  // ─── Fallback to index.html ────────────────────
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
}

// ─── Global Error Handler ──────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

// ─── Start Server ──────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ BlueCollar Connect server running at http://localhost:${PORT}`);
});
