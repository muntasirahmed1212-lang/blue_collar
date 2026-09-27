/**
 * server/middleware/authMiddleware.js
 * Authentication & Role Authorization Middleware for BlueCollar Connect
 */

const db = require('../db/database');

/**
 * Ensures request has an active session with a valid userId.
 */
async function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const users = await db.readUsers();
    if (Array.isArray(users)) {
      req.user = users.find(u => u && u.id === req.session.userId);
    }
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

/**
 * Ensures request is from an authenticated user with 'admin' role.
 */
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const users = await db.readUsers();
  const user = Array.isArray(users) ? users.find(u => u && u.id === req.session.userId) : null;

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  req.user = user;
  next();
}

/**
 * Gating middleware for Job Creation (POST /api/jobs).
 * Enforces:
 *  1. Active session (req.session && req.session.userId) -> 401
 *  2. Existing user record in database -> 401
 *  3. user.isVerified === true -> 403
 *  4. user.role === 'customer' -> 403
 * Attaches req.user = user for downstream controllers.
 */
async function requireCustomer(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please log in.'
    });
  }

  const users = await db.readUsers();
  const user = Array.isArray(users) ? users.find(u => u && u.id === req.session.userId) : null;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please log in.'
    });
  }

  if (user.isVerified !== true || user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      error: 'Only verified customers can post jobs.'
    });
  }

  req.user = user;
  next();
}

/**
 * Checks whether the currently logged-in user is the owner of the job
 * or possesses an 'admin' role.
 *
 * @param {object} req - Express request object
 * @param {object} job - Target job record
 * @returns {boolean}
 */
async function isJobOwnerOrAdmin(req, job) {
  if (!req || !req.session || !req.session.userId || !job) {
    return false;
  }

  const userId = req.session.userId;
  if (job.customerId === userId || job.userId === userId) {
    return true;
  }

  const users = await db.readUsers();
  const user = req.user || (Array.isArray(users) ? users.find(u => u && u.id === userId) : null);
  return Boolean(user && user.role === 'admin');
}

/**
 * Verification helper for job ownership authorization.
 * Handles 401 (not logged in), 404 (job not found), and 403 (unauthorized).
 *
 * @param {object} req - Express request object
 * @param {object} job - Job record
 * @param {string} [action='modify'] - Action description ('modify' or 'delete'/'cancel')
 * @returns {{ authorized: boolean, status?: number, error?: string }}
 */
async function verifyJobOwnership(req, job, action = 'modify') {
  if (!req || !req.session || !req.session.userId) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized. Please log in.'
    };
  }

  if (!job) {
    return {
      authorized: false,
      status: 404,
      error: 'Job not found'
    };
  }

  const isOwnerOrAdmin = await isJobOwnerOrAdmin(req, job);
  if (isOwnerOrAdmin) {
    return { authorized: true };
  }

  const verb = action === 'delete' ? 'cancel' : action;
  return {
    authorized: false,
    status: 403,
    error: `Forbidden. You do not have permission to ${verb} this job.`
  };
}

/**
 * Route-level middleware for checking job ownership or admin privileges.
 * Automatically looks up job by req.params.id and attaches req.job.
 */
async function requireJobOwnerOrAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const jobId = req.params.id;
  const job = typeof db.findJobById === 'function' ? await db.findJobById(jobId) : null;

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const isOwnerOrAdmin = await isJobOwnerOrAdmin(req, job);
  if (!isOwnerOrAdmin) {
    const action = req.method === 'DELETE' ? 'cancel' : 'modify';
    return res.status(403).json({
      success: false,
      error: `Forbidden. You do not have permission to ${action} this job.`
    });
  }

  req.job = job;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireCustomer,
  isJobOwnerOrAdmin,
  verifyJobOwnership,
  requireJobOwnerOrAdmin
};
