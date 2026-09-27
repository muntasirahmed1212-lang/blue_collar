// api/auth.js — Vercel Serverless Function entry point
// This wraps the Express app for Vercel's serverless runtime.
// Local development still uses server.js (unchanged).

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { jwtSessionMiddleware } = require('../server/middleware/jwtSession');
const authRoutes = require('../server/routes/auth');

const app = express();

// ─── CORS (allow Vercel domain + localhost) ────
app.use(cors({
  origin: true,
  credentials: true
}));

// ─── Body Parsing ──────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Cookie Parser ─────────────────────────────
app.use(cookieParser());

// ─── JWT Cookie Session (replaces express-session) ─
app.use(jwtSessionMiddleware(process.env.SESSION_SECRET || 'fallback_secret_key'));

// ─── Routes ────────────────────────────────────
app.use('/api/auth', authRoutes);

module.exports = app;
