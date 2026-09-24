function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
  
  const db = require('../db/database');
  const users = db.readUsers();
  const user = users.find(u => u.id === req.session.userId);
  
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  
  next();
}

module.exports = { requireAuth, requireAdmin };
