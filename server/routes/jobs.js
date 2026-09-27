// server/routes/jobs.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { requireAuth, requireCustomer } = require('../middleware/authMiddleware');

// ─── Public Endpoints ────────────────────────────────────────────────────────
// GET /api/jobs - List, search, filter open jobs
router.get('/', jobController.getJobs);

// GET /api/jobs/:id - Single job details
router.get('/:id', jobController.getJobById);

// ─── Protected Endpoints ─────────────────────────────────────────────────────
// POST /api/jobs - Only verified customers can create jobs
router.post('/', requireCustomer, jobController.createJob);

// PATCH /api/jobs/:id - Only authenticated owner/admin can update job
router.patch('/:id', requireAuth, jobController.updateJob);

// DELETE /api/jobs/:id - Only authenticated owner/admin can cancel job
router.delete('/:id', requireAuth, jobController.deleteJob);

module.exports = router;
