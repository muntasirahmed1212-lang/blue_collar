// server/middleware/jwtSession.js
// Drop-in replacement for express-session in serverless environments.
// Stores session data in a signed JWT cookie, making it fully stateless.
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'bc_session';

function jwtSessionMiddleware(secret) {
  return (req, res, next) => {
    // ── Read existing session from cookie ──
    const sessionData = {};
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        const decoded = jwt.verify(token, secret);
        if (decoded.data && typeof decoded.data === 'object') {
          Object.assign(sessionData, decoded.data);
        }
      } catch (e) {
        // Token expired or invalid — start fresh session
      }
    }

    let destroyed = false;
    let dirty = false;

    // ── Cookie options ──
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    };

    // ── Create Proxy to detect mutations ──
    const handler = {
      set(target, prop, value) {
        if (prop === 'destroy') return true;
        target[prop] = value;
        dirty = true;
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop];
        dirty = true;
        return true;
      }
    };

    const sessionProxy = new Proxy(sessionData, handler);

    // ── destroy() clears the session cookie ──
    sessionProxy.destroy = function(cb) {
      destroyed = true;
      Object.keys(sessionData).forEach(k => delete sessionData[k]);
      res.clearCookie(COOKIE_NAME, cookieOpts);
      if (typeof cb === 'function') cb();
    };

    req.session = sessionProxy;

    // ── Override res.json to persist session before sending ──
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (dirty && !destroyed) {
        // Serialize session data (exclude the destroy method)
        const toSave = {};
        Object.keys(sessionData).forEach(k => {
          if (k !== 'destroy' && typeof sessionData[k] !== 'function') {
            toSave[k] = sessionData[k];
          }
        });
        const token = jwt.sign({ data: toSave }, secret, { expiresIn: '24h' });
        res.cookie(COOKIE_NAME, token, cookieOpts);
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = { jwtSessionMiddleware };
