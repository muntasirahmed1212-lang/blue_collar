/**
 * tests/verify-jobs.js
 * Comprehensive Automated Verification Suite for BlueCollar Connect "Post Jobs" Feature
 *
 * Covers Tiers 1-4:
 * - Tier 1: Feature Coverage (POST /api/jobs, GET /api/jobs, GET /api/jobs/:id, PATCH /api/jobs/:id, DELETE /api/jobs/:id, category filter, urgency filter)
 * - Tier 2: Boundary & Corner Cases (401 unauthenticated, 403 unverified/non-customer, 403 non-owner, 404 nonexistent ID, 400 validation errors)
 * - Tier 3: Cross-Feature & Persistence (Disk serialization in server/db/jobs.json, server restart persistence, multi-user isolation & ownership)
 * - Tier 4: Regression Checks (Existing auth endpoints /api/auth/register, /login, /me, /logout, zero modifications to authUI.js and authService.js)
 *
 * Execution:
 * node tests/verify-jobs.js
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');
const JOBS_ROUTE_PATH = path.join(PROJECT_ROOT, 'server', 'routes', 'jobs.js');

const authRoutes = require('../server/routes/auth');
const emailService = require('../server/services/emailService');

// ─── Pristine Database Backup & Restore ──────────────────────────────────────
const PRISTINE_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const PRISTINE_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : null;
const originalSendOTPEmail = emailService.sendOTPEmail;

let dbRestored = false;

function restoreDb() {
  if (dbRestored) return;
  dbRestored = true;
  try {
    if (PRISTINE_USERS) {
      fs.writeFileSync(USERS_JSON_PATH, PRISTINE_USERS, 'utf8');
    }
    if (PRISTINE_JOBS !== null) {
      fs.writeFileSync(JOBS_JSON_PATH, PRISTINE_JOBS, 'utf8');
    } else if (fs.existsSync(JOBS_JSON_PATH)) {
      try { fs.unlinkSync(JOBS_JSON_PATH); } catch {}
    }
    emailService.sendOTPEmail = originalSendOTPEmail;
  } catch (err) {
    console.error('Error during database restore:', err.message);
  }
}

process.on('exit', restoreDb);
process.on('SIGINT', () => { restoreDb(); process.exit(1); });
process.on('SIGTERM', () => { restoreDb(); process.exit(1); });

// ─── HTTP Fetch Client Helper ───────────────────────────────────────────────
async function httpRequest(baseUrl, method, endpoint, body = null, cookie = null) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) {
    headers['Cookie'] = cookie.split(';')[0].trim();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });

  const status = res.status;
  const setCookie = res.headers.get('set-cookie');
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status, data, cookie: setCookie || cookie };
}

// ─── Ephemeral Server Factory ───────────────────────────────────────────────
function createExpressApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: 'verify_jobs_session_secret_778899',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  }));

  // Test-only session helper: sets req.session.userId directly for unverified customer testing
  app.post('/__test__/session', (req, res) => {
    if (req.body && req.body.userId) {
      req.session.userId = req.body.userId;
    }
    res.json({ success: true, userId: req.session.userId });
  });

  // Mount existing auth routes
  app.use('/api/auth', authRoutes);

  // Mount jobs routes if implemented; otherwise mount diagnostic 404 handler
  if (fs.existsSync(JOBS_ROUTE_PATH)) {
    try {
      delete require.cache[require.resolve('../server/routes/jobs')];
      const jobRoutes = require('../server/routes/jobs');
      app.use('/api/jobs', jobRoutes);
    } catch (err) {
      app.use('/api/jobs', (req, res) => {
        res.status(500).json({
          success: false,
          error: `Error loading server/routes/jobs.js: ${err.message}`
        });
      });
    }
  } else {
    app.use('/api/jobs', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Job routes not implemented yet (server/routes/jobs.js missing)'
      });
    });
  }

  return app;
}

async function startServer() {
  const app = createExpressApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

// ─── Test Runner ────────────────────────────────────────────────────────────
async function run() {
  console.log('=================================================================');
  console.log('BLUECOLLAR CONNECT — POST JOBS AUTOMATED TEST SUITE');
  console.log('Tiers 1-4: Feature, Boundary, Persistence, & Regression Checks');
  console.log('=================================================================\n');

  // Stub email service during testing to avoid external network dependencies
  emailService.sendOTPEmail = async () => ({ messageId: 'test-mock-otp-success' });

  // Ensure jobs.json exists and is clean
  fs.writeFileSync(JOBS_JSON_PATH, '[]', 'utf8');

  // Pre-seed test users in users.json with known password
  const TEST_PASSWORD = 'TestPassword123!';
  const testPasswordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const existingUsers = JSON.parse(PRISTINE_USERS);
  const testUsers = [
    ...existingUsers.filter(u => !u.email.endsWith('@jobs-test.example.com')),
    {
      id: 'cust-verified-alice-101',
      fullName: 'Alice VerifiedCustomer',
      email: 'alice@jobs-test.example.com',
      password: testPasswordHash,
      role: 'customer',
      isVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cust-verified-bob-102',
      fullName: 'Bob VerifiedCustomer',
      email: 'bob@jobs-test.example.com',
      password: testPasswordHash,
      role: 'customer',
      isVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cust-unverified-charlie-103',
      fullName: 'Charlie UnverifiedCustomer',
      email: 'charlie@jobs-test.example.com',
      password: testPasswordHash,
      role: 'customer',
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'pro-verified-dan-104',
      fullName: 'Dan Professional',
      email: 'dan@jobs-test.example.com',
      password: testPasswordHash,
      role: 'professional',
      isVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(testUsers, null, 2), 'utf8');

  let { server, baseUrl } = await startServer();

  const results = [];

  async function testCase(tier, id, name, fn) {
    try {
      await fn();
      results.push({ tier, id, name, status: 'PASS', error: null });
      console.log(`  ✅ [PASS] ${id}: ${name}`);
    } catch (err) {
      results.push({ tier, id, name, status: 'FAIL', error: err.message });
      console.log(`  ❌ [FAIL] ${id}: ${name}`);
      console.log(`     Error: ${err.message}`);
    }
  }

  try {
    // ─── Authenticate Test Users to Obtain Sessions ───────────────────────────
    console.log('--- Initializing Test User Sessions ---');

    // Alice (Customer 1) Login
    const aliceLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      email: 'alice@jobs-test.example.com',
      password: TEST_PASSWORD
    });
    assert.equal(aliceLogin.status, 200, `Alice login failed: ${JSON.stringify(aliceLogin.data)}`);
    const aliceCookie = aliceLogin.cookie;
    assert.ok(aliceCookie, 'Alice session cookie must be present');

    // Bob (Customer 2) Login
    const bobLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      email: 'bob@jobs-test.example.com',
      password: TEST_PASSWORD
    });
    assert.equal(bobLogin.status, 200, `Bob login failed: ${JSON.stringify(bobLogin.data)}`);
    const bobCookie = bobLogin.cookie;
    assert.ok(bobCookie, 'Bob session cookie must be present');

    // Dan (Professional) Login
    const danLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      email: 'dan@jobs-test.example.com',
      password: TEST_PASSWORD
    });
    assert.equal(danLogin.status, 200, `Dan login failed: ${JSON.stringify(danLogin.data)}`);
    const danCookie = danLogin.cookie;
    assert.ok(danCookie, 'Dan session cookie must be present');

    // Charlie (Unverified Customer) Session via test endpoint
    const charlieSession = await httpRequest(baseUrl, 'POST', '/__test__/session', {
      userId: 'cust-unverified-charlie-103'
    });
    const charlieCookie = charlieSession.cookie;
    assert.ok(charlieCookie, 'Charlie session cookie must be present');

    console.log('  Sessions established for Alice (customer), Bob (customer), Dan (pro), Charlie (unverified).\n');

    let createdJob = null;
    let categoryJob1 = null;
    let categoryJob2 = null;
    let urgencyJobLow = null;
    let urgencyJobHigh = null;

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 1: FEATURE COVERAGE (CRUD & FILTERS)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('=== TIER 1: FEATURE COVERAGE (CRUD & FILTERS) ===');

    await testCase('Tier 1', 'T1.1', 'POST /api/jobs creates job with all fields', async () => {
      const payload = {
        title: 'Repair Master Bathroom Leaks',
        description: 'Water leaking under master bathroom sink and toilet base requires urgent pipe replacement and sealant.',
        category: 'cat-2',
        location: 'Downtown, Seattle',
        budget: { min: 800, max: 1500, currency: '₹' },
        urgency: 'high',
        photos: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a'],
        preferredDate: '2026-09-30T10:00:00Z'
      };

      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', payload, aliceCookie);
      assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.success, true, 'Response success must be true');
      assert.ok(res.data.job, 'Response must include job object');

      const j = res.data.job;
      assert.ok(j.id && typeof j.id === 'string', 'Job ID must be a non-empty string');
      assert.equal(j.title, payload.title, 'Job title must match');
      assert.equal(j.description, payload.description, 'Job description must match');
      assert.ok(j.category === 'cat-2' || (j.categorySlug && j.categorySlug === 'plumber'), 'Job category must match');
      assert.equal(j.location, payload.location, 'Job location must match');
      assert.equal(j.urgency, 'high', 'Job urgency must match');
      assert.equal(j.status, 'open', 'Job initial status must be open');
      assert.equal(j.customerId, 'cust-verified-alice-101', 'Job customerId must match logged-in user');
      assert.ok(j.createdAt, 'Job must have createdAt timestamp');
      assert.ok(j.updatedAt, 'Job must have updatedAt timestamp');

      createdJob = j;
    });

    await testCase('Tier 1', 'T1.2', 'GET /api/jobs lists open jobs without authentication', async () => {
      const res = await httpRequest(baseUrl, 'GET', '/api/jobs');
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      assert.equal(res.data.success, true, 'Expected success true');
      assert.ok(Array.isArray(res.data.jobs), 'Expected res.data.jobs to be an array');
      assert.ok(res.data.jobs.length >= 1, 'Expected at least 1 job in listing');

      if (createdJob) {
        const found = res.data.jobs.find(j => j.id === createdJob.id);
        assert.ok(found, `Newly created job ${createdJob.id} must be in public jobs listing`);
        assert.equal(found.title, createdJob.title);
      }
    });

    await testCase('Tier 1', 'T1.3', 'GET /api/jobs/:id returns single job details', async () => {
      assert.ok(createdJob, 'Prerequisite createdJob missing');
      const res = await httpRequest(baseUrl, 'GET', `/api/jobs/${createdJob.id}`);
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      assert.equal(res.data.success, true, 'Expected success true');
      assert.ok(res.data.job, 'Expected job object');
      assert.equal(res.data.job.id, createdJob.id, 'Job ID must match');
      assert.equal(res.data.job.title, createdJob.title, 'Job title must match');
    });

    await testCase('Tier 1', 'T1.4', 'PATCH /api/jobs/:id allows owner to update job fields', async () => {
      assert.ok(createdJob, 'Prerequisite createdJob missing');
      const updatePayload = {
        title: 'Updated Bathroom Plumbing Repairs',
        urgency: 'urgent'
      };

      const res = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${createdJob.id}`, updatePayload, aliceCookie);
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.success, true, 'Expected success true');
      assert.ok(res.data.job, 'Expected updated job object');
      assert.equal(res.data.job.title, 'Updated Bathroom Plumbing Repairs');
      assert.equal(res.data.job.urgency, 'urgent');

      // Verify update is observable via public GET
      const verifyRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${createdJob.id}`);
      assert.equal(verifyRes.data.job.title, 'Updated Bathroom Plumbing Repairs');
    });

    await testCase('Tier 1', 'T1.5', 'DELETE /api/jobs/:id allows owner to cancel/delete job', async () => {
      assert.ok(createdJob, 'Prerequisite createdJob missing');
      const res = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${createdJob.id}`, null, aliceCookie);
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.success, true, 'Expected success true');

      // Subsequent public listing of open jobs should no longer include this cancelled job
      const listRes = await httpRequest(baseUrl, 'GET', '/api/jobs');
      const foundInOpenList = listRes.data.jobs ? listRes.data.jobs.find(j => j.id === createdJob.id && j.status === 'open') : null;
      assert.equal(foundInOpenList, undefined, 'Cancelled job must not appear in open jobs listing');
    });

    await testCase('Tier 1', 'T1.6', 'GET /api/jobs?category=cat-1 filters by category', async () => {
      // Create job in cat-1 (Electrician)
      const res1 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Install Modular Switchboard & LED Lights',
        description: 'Need certified electrician to wire living room switchboards and LED fixtures.',
        category: 'cat-1',
        location: 'Indiranagar, Bangalore',
        budget: { min: 1000, max: 2000, currency: '₹' },
        urgency: 'medium'
      }, aliceCookie);
      assert.ok([200, 201].includes(res1.status), `Failed creating cat-1 job: ${res1.status}`);
      categoryJob1 = res1.data.job;

      // Create job in cat-2 (Plumber)
      const res2 = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Kitchen Sink Drainage Replacement',
        description: 'Under-sink PVC drainage assembly cracked, water backing up continuously.',
        category: 'cat-2',
        location: 'Koramangala, Bangalore',
        budget: { min: 500, max: 900, currency: '₹' },
        urgency: 'high'
      }, aliceCookie);
      assert.ok([200, 201].includes(res2.status), `Failed creating cat-2 job: ${res2.status}`);
      categoryJob2 = res2.data.job;

      // Filter by cat-1
      const filterRes = await httpRequest(baseUrl, 'GET', '/api/jobs?category=cat-1');
      assert.equal(filterRes.status, 200, `Expected 200, got ${filterRes.status}`);
      assert.ok(Array.isArray(filterRes.data.jobs), 'Expected jobs array');

      const matchesCat1 = filterRes.data.jobs.some(j => j.id === categoryJob1.id);
      const matchesCat2 = filterRes.data.jobs.some(j => j.id === categoryJob2.id);

      assert.ok(matchesCat1, 'Filtered results must contain cat-1 job');
      assert.ok(!matchesCat2, 'Filtered results must NOT contain cat-2 job');
    });

    await testCase('Tier 1', 'T1.7', 'GET /api/jobs?urgency=high filters by urgency', async () => {
      // Create Low urgency job
      const resLow = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Paint Guest Bedroom Wooden Door',
        description: 'Repaint wooden door with white enamel coating at any convenient time.',
        category: 'cat-4',
        location: 'Whitefield, Bangalore',
        budget: { min: 400, max: 800, currency: '₹' },
        urgency: 'low'
      }, aliceCookie);
      assert.ok([200, 201].includes(resLow.status), `Failed creating low urgency job: ${resLow.status}`);
      urgencyJobLow = resLow.data.job;

      // Create High urgency job
      const resHigh = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Emergency Main Breaker Tripping Repair',
        description: 'Whole house power trips when AC turns on, urgent diagnostics required.',
        category: 'cat-1',
        location: 'Whitefield, Bangalore',
        budget: { min: 1200, max: 2500, currency: '₹' },
        urgency: 'high'
      }, aliceCookie);
      assert.ok([200, 201].includes(resHigh.status), `Failed creating high urgency job: ${resHigh.status}`);
      urgencyJobHigh = resHigh.data.job;

      // Filter by urgency=high
      const filterRes = await httpRequest(baseUrl, 'GET', '/api/jobs?urgency=high');
      assert.equal(filterRes.status, 200, `Expected 200, got ${filterRes.status}`);
      assert.ok(Array.isArray(filterRes.data.jobs), 'Expected jobs array');

      const foundHigh = filterRes.data.jobs.some(j => j.id === urgencyJobHigh.id);
      const foundLow = filterRes.data.jobs.some(j => j.id === urgencyJobLow.id);

      assert.ok(foundHigh, 'Filtered results must contain high urgency job');
      assert.ok(!foundLow, 'Filtered results must NOT contain low urgency job');
    });

    console.log('');

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 2: BOUNDARY & CORNER CASES (AUTH, ROLES, VALIDATION, 404)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('=== TIER 2: BOUNDARY & CORNER CASES ===');

    const sampleValidPayload = {
      title: 'Valid Boundary Check Job Title',
      description: 'Comprehensive description meeting all length requirements for testing purposes.',
      category: 'cat-1',
      location: 'Bellandur, Bangalore',
      budget: { min: 600, max: 1200, currency: '₹' },
      urgency: 'medium'
    };

    await testCase('Tier 2', 'T2.1', '401 Unauthorized for unauthenticated POST /api/jobs', async () => {
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', sampleValidPayload, null);
      assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.2', '401 Unauthorized for unauthenticated PATCH /api/jobs/:id', async () => {
      const targetId = categoryJob1 ? categoryJob1.id : 'fake-id';
      const res = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${targetId}`, { title: 'Hacked' }, null);
      assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.3', '401 Unauthorized for unauthenticated DELETE /api/jobs/:id', async () => {
      const targetId = categoryJob1 ? categoryJob1.id : 'fake-id';
      const res = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${targetId}`, null, null);
      assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.4', '403 Forbidden for authenticated unverified customer on POST /api/jobs', async () => {
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', sampleValidPayload, charlieCookie);
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.5', '403 Forbidden for authenticated non-customer role (pro) on POST /api/jobs', async () => {
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', sampleValidPayload, danCookie);
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.6', '403 Forbidden for non-owner attempting PATCH /api/jobs/:id', async () => {
      assert.ok(categoryJob1, 'Prerequisite categoryJob1 missing');
      // Bob attempts to modify Alice's job
      const res = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${categoryJob1.id}`, { title: 'Bob Hijack' }, bobCookie);
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.7', '403 Forbidden for non-owner attempting DELETE /api/jobs/:id', async () => {
      assert.ok(categoryJob1, 'Prerequisite categoryJob1 missing');
      // Bob attempts to delete Alice's job
      const res = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${categoryJob1.id}`, null, bobCookie);
      assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.8', '404 Not Found for GET /api/jobs/:id with nonexistent ID', async () => {
      const res = await httpRequest(baseUrl, 'GET', '/api/jobs/00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.9', '404 Not Found for PATCH /api/jobs/:id with nonexistent ID', async () => {
      const res = await httpRequest(baseUrl, 'PATCH', '/api/jobs/00000000-0000-0000-0000-000000000000', { title: 'No Job' }, aliceCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.10', '404 Not Found for DELETE /api/jobs/:id with nonexistent ID', async () => {
      const res = await httpRequest(baseUrl, 'DELETE', '/api/jobs/00000000-0000-0000-0000-000000000000', null, aliceCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.11', '400 Bad Request on POST /api/jobs with missing title', async () => {
      const { title, ...badPayload } = sampleValidPayload;
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.12', '400 Bad Request on POST /api/jobs with title too short (< 3 chars)', async () => {
      const badPayload = { ...sampleValidPayload, title: 'ab' };
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.13', '400 Bad Request on POST /api/jobs with missing category', async () => {
      const { category, ...badPayload } = sampleValidPayload;
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.14', '400 Bad Request on POST /api/jobs with invalid category (cat-999)', async () => {
      const badPayload = { ...sampleValidPayload, category: 'cat-999' };
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.15', '400 Bad Request on POST /api/jobs with missing description', async () => {
      const { description, ...badPayload } = sampleValidPayload;
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.16', '400 Bad Request on POST /api/jobs with description too short (< 10 chars)', async () => {
      const badPayload = { ...sampleValidPayload, description: 'Too short' };
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.17', '400 Bad Request on POST /api/jobs with invalid urgency level', async () => {
      const badPayload = { ...sampleValidPayload, urgency: 'super-turbo-urgent' };
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    await testCase('Tier 2', 'T2.18', '400 Bad Request on POST /api/jobs with invalid budget (min > max)', async () => {
      const badPayload = { ...sampleValidPayload, budget: { min: 2500, max: 500, currency: '₹' } };
      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', badPayload, aliceCookie);
      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
      assert.equal(res.data.success, false);
    });

    console.log('');

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 3: CROSS-FEATURE & PERSISTENCE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('=== TIER 3: CROSS-FEATURE & PERSISTENCE ===');

    let persistenceJob = null;

    await testCase('Tier 3', 'T3.1', 'Disk persistence: POST /api/jobs serializes to server/db/jobs.json', async () => {
      const payload = {
        title: 'Persistence Test Fan Installation',
        description: 'Testing that this job is immediately written to disk in server/db/jobs.json.',
        category: 'cat-1',
        location: 'HSR Layout, Bangalore',
        budget: { min: 500, max: 1000, currency: '₹' },
        urgency: 'medium'
      };

      const res = await httpRequest(baseUrl, 'POST', '/api/jobs', payload, aliceCookie);
      assert.ok([200, 201].includes(res.status), `Job creation failed: ${res.status}`);
      persistenceJob = res.data.job;

      // Verify directly on disk
      assert.ok(fs.existsSync(JOBS_JSON_PATH), 'jobs.json must exist on disk');
      const diskContent = fs.readFileSync(JOBS_JSON_PATH, 'utf8');
      const diskJobs = JSON.parse(diskContent);
      const foundOnDisk = diskJobs.find(j => j.id === persistenceJob.id);

      assert.ok(foundOnDisk, `Job ${persistenceJob.id} must be serialized to disk in jobs.json`);
      assert.equal(foundOnDisk.title, payload.title);
      assert.equal(foundOnDisk.customerId, 'cust-verified-alice-101');
    });

    await testCase('Tier 3', 'T3.2', 'Restart persistence: Job persists across server restart', async () => {
      assert.ok(persistenceJob, 'Prerequisite persistenceJob missing');

      // Shutdown currently running server
      await new Promise(resolve => server.close(resolve));

      // Start fresh server instance on new ephemeral port
      const freshInstance = await startServer();
      server = freshInstance.server;
      baseUrl = freshInstance.baseUrl;

      // Query the newly started server for the job created before shutdown
      const res = await httpRequest(baseUrl, 'GET', `/api/jobs/${persistenceJob.id}`);
      assert.equal(res.status, 200, `Expected 200 on fresh server, got ${res.status}`);
      assert.equal(res.data.success, true);
      assert.equal(res.data.job.id, persistenceJob.id);
      assert.equal(res.data.job.title, persistenceJob.title);
    });

    await testCase('Tier 3', 'T3.3', 'Multi-user isolation: Owner can cancel, other users cannot', async () => {
      // Re-authenticate Alice and Bob on fresh server instance
      const freshAliceLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
        email: 'alice@jobs-test.example.com',
        password: TEST_PASSWORD
      });
      const freshAliceCookie = freshAliceLogin.cookie;

      const freshBobLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
        email: 'bob@jobs-test.example.com',
        password: TEST_PASSWORD
      });
      const freshBobCookie = freshBobLogin.cookie;

      // Alice creates a private job
      const resCreate = await httpRequest(baseUrl, 'POST', '/api/jobs', {
        title: 'Alice Private Carpentry Request',
        description: 'Custom bookshelf construction in living room study corner with pine wood.',
        category: 'cat-3',
        location: 'Koramangala, Bangalore',
        budget: { min: 3000, max: 6000, currency: '₹' },
        urgency: 'low'
      }, freshAliceCookie);
      assert.ok([200, 201].includes(resCreate.status));
      const isolationJob = resCreate.data.job;

      // Bob tries to cancel Alice's job -> MUST FAIL 403
      const bobCancelRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${isolationJob.id}`, null, freshBobCookie);
      assert.equal(bobCancelRes.status, 403, `Bob must be blocked with 403: got ${bobCancelRes.status}`);

      // Bob tries to patch Alice's job -> MUST FAIL 403
      const bobPatchRes = await httpRequest(baseUrl, 'PATCH', `/api/jobs/${isolationJob.id}`, { title: 'Bob vandalism' }, freshBobCookie);
      assert.equal(bobPatchRes.status, 403, `Bob must be blocked with 403: got ${bobPatchRes.status}`);

      // Job must still be open
      const checkRes = await httpRequest(baseUrl, 'GET', `/api/jobs/${isolationJob.id}`);
      assert.equal(checkRes.data.job.status, 'open');

      // Alice cancels her own job -> MUST SUCCEED 200
      const aliceCancelRes = await httpRequest(baseUrl, 'DELETE', `/api/jobs/${isolationJob.id}`, null, freshAliceCookie);
      assert.equal(aliceCancelRes.status, 200, `Alice must cancel with 200: got ${aliceCancelRes.status}`);
    });

    console.log('');

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 4: REGRESSION CHECKS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('=== TIER 4: REGRESSION CHECKS ===');

    await testCase('Tier 4', 'T4.1', 'Existing auth endpoint GET /api/auth/me returns 401 unauthenticated', async () => {
      const res = await httpRequest(baseUrl, 'GET', '/api/auth/me');
      assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      assert.equal(res.data.error, 'Not authenticated');
    });

    await testCase('Tier 4', 'T4.2', 'Existing auth endpoint POST /api/auth/register functions normally', async () => {
      const regRes = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
        fullName: 'Regression Test User',
        email: 'reg-test-user@jobs-test.example.com',
        password: 'ValidPassword123!'
      });
      assert.equal(regRes.status, 200, `Expected 200, got ${regRes.status}: ${JSON.stringify(regRes.data)}`);
      assert.equal(regRes.data.success, true);
    });

    await testCase('Tier 4', 'T4.3', 'Existing auth endpoint POST /api/auth/login returns session cookie and user', async () => {
      const loginRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
        email: 'alice@jobs-test.example.com',
        password: TEST_PASSWORD
      });
      assert.equal(loginRes.status, 200, `Expected 200, got ${loginRes.status}`);
      assert.equal(loginRes.data.success, true);
      assert.ok(loginRes.cookie, 'Expected session cookie');
      assert.equal(loginRes.data.user.email, 'alice@jobs-test.example.com');
    });

    await testCase('Tier 4', 'T4.4', 'Existing auth endpoint GET /api/auth/me returns user data (no password)', async () => {
      const loginRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
        email: 'alice@jobs-test.example.com',
        password: TEST_PASSWORD
      });
      const res = await httpRequest(baseUrl, 'GET', '/api/auth/me', null, loginRes.cookie);
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      assert.equal(res.data.success, true);
      assert.equal(res.data.user.fullName, 'Alice VerifiedCustomer');
      assert.equal(res.data.user.email, 'alice@jobs-test.example.com');
      assert.equal(res.data.user.role, 'customer');
      assert.equal(res.data.user.password, undefined, 'Security: password must not be exposed');
    });

    await testCase('Tier 4', 'T4.5', 'Existing auth endpoint POST /api/auth/logout terminates session', async () => {
      const loginRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
        email: 'alice@jobs-test.example.com',
        password: TEST_PASSWORD
      });
      const logoutRes = await httpRequest(baseUrl, 'POST', '/api/auth/logout', null, loginRes.cookie);
      assert.equal(logoutRes.status, 200, `Expected 200, got ${logoutRes.status}`);
      assert.equal(logoutRes.data.success, true);

      // Follow-up me request with same cookie must fail 401
      const meRes = await httpRequest(baseUrl, 'GET', '/api/auth/me', null, loginRes.cookie);
      assert.equal(meRes.status, 401, `Expected 401 after logout, got ${meRes.status}`);
    });

    await testCase('Tier 4', 'T4.6', 'Zero modifications to protected frontend files: authUI.js & authService.js', async () => {
      const gitStatus = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      }).trim();

      assert.equal(gitStatus, '', `Protected frontend files have modifications:\n${gitStatus}`);
    });

    console.log('');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    restoreDb();
  }

  // ─── Summary Report ─────────────────────────────────────────────────────────
  console.log('=================================================================');
  console.log('POST JOBS TEST SUITE EXECUTION SUMMARY');
  console.log('=================================================================');

  const tiers = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'];
  const tierNames = {
    'Tier 1': 'Feature Coverage (CRUD & Filters)',
    'Tier 2': 'Boundary & Corner Cases (Auth, Roles, Validation, 404)',
    'Tier 3': 'Cross-Feature & Persistence (Disk, Restart, Multi-User)',
    'Tier 4': 'Regression Checks (Auth Endpoints, Protected Files)'
  };

  let totalPassed = 0;
  let totalFailed = 0;

  for (const t of tiers) {
    const tierResults = results.filter(r => r.tier === t);
    const passed = tierResults.filter(r => r.status === 'PASS').length;
    const failed = tierResults.filter(r => r.status === 'FAIL').length;
    totalPassed += passed;
    totalFailed += failed;

    console.log(`  ${t}: ${tierNames[t]}`);
    console.log(`    Passed: ${passed} / ${tierResults.length}  ${failed > 0 ? `(${failed} FAILED)` : '✅'}`);
  }

  console.log('-----------------------------------------------------------------');
  console.log(`TOTAL: ${results.length} tests | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log('=================================================================\n');

  if (totalFailed > 0) {
    console.log('Failed Tests Summary:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - [${r.id}] ${r.name}`);
      console.log(`    ${r.error}`);
    });
    console.log('\n❌ Verification Failed. Please address the errors above.\n');
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED! Post Jobs feature verification complete.\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('\n❌ CRITICAL HARNESS ERROR:', err);
  restoreDb();
  process.exit(1);
});
