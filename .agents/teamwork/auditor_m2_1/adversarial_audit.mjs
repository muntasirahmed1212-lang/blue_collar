// .agents/teamwork/auditor_m2_1/adversarial_audit.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { jobService, JobApiError } from '../../../js/services/jobService.js';
import { categories } from '../../../js/data/categories.js';

console.log('====================================================');
console.log('ADVERSARIAL FORENSIC AUDIT: Milestone M2');
console.log('====================================================\n');

let passCount = 0;
let totalCount = 0;

function check(title, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${title}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function checkAsync(title, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${title}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function runAudit() {
  // Test 1: Category consistency
  check('Canonical 12 categories are present and valid in categories.js', () => {
    assert.equal(categories.length, 12, 'Must have exactly 12 categories');
    const ids = categories.map(c => c.id);
    for (let i = 1; i <= 12; i++) {
      assert.ok(ids.includes(`cat-${i}`), `Missing cat-${i}`);
    }
    categories.forEach(c => {
      assert.ok(c.name && typeof c.name === 'string', `Category ${c.id} missing name`);
      assert.ok(c.slug && typeof c.slug === 'string', `Category ${c.id} missing slug`);
    });
  });

  // Test 2: jobService API Contract
  check('jobService exports complete and expected methods', () => {
    assert.equal(typeof jobService.createJob, 'function');
    assert.equal(typeof jobService.getJobs, 'function');
    assert.equal(typeof jobService.getJobById, 'function');
    assert.equal(typeof jobService.updateJob, 'function');
    assert.equal(typeof jobService.cancelJob, 'function');
    assert.equal(typeof jobService.deleteJob, 'function');
    assert.equal(jobService.cancelJob, jobService.deleteJob, 'deleteJob must alias cancelJob');
  });

  // Test 3: jobService input validation on IDs
  await checkAsync('jobService rejects empty or invalid job ID without throwing when throwOnError is false', async () => {
    const res1 = await jobService.getJobById('');
    assert.equal(res1.success, false);
    assert.equal(res1.status, 400);

    const res2 = await jobService.updateJob('   ', { title: 'New' });
    assert.equal(res2.success, false);
    assert.equal(res2.status, 400);

    const res3 = await jobService.cancelJob(null);
    assert.equal(res3.success, false);
    assert.equal(res3.status, 400);
  });

  await checkAsync('jobService throws JobApiError when throwOnError is true on invalid ID', async () => {
    await assert.rejects(
      async () => {
        await jobService.getJobById('', { throwOnError: true });
      },
      (err) => {
        return err instanceof JobApiError && err.status === 400;
      }
    );
  });

  // Test 4: Mock server to verify HTTP dispatch, headers, query string serialization
  let receivedRequests = [];
  const testServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? JSON.parse(body) : null
      });

      if (req.url.startsWith('/api/jobs')) {
        if (req.method === 'POST') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, job: { id: 'job-123', ...JSON.parse(body) } }));
          return;
        }
        if (req.method === 'GET' && req.url.includes('cat-1')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: 1, jobs: [{ id: 'job-1', category: 'cat-1' }] }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/jobs/job-123') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, job: { id: 'job-123', title: 'Test Job' } }));
          return;
        }
        if (req.method === 'PATCH' && req.url === '/api/jobs/job-123') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, job: { id: 'job-123', ...JSON.parse(body) } }));
          return;
        }
        if (req.method === 'DELETE' && req.url === '/api/jobs/job-123') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Job cancelled successfully' }));
          return;
        }
        if (req.url.includes('nonexistent')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Job not found' }));
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Not found' }));
    });
  });

  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  const originalFetch = globalThis.fetch;

  // Intercept fetch to point to our test server
  globalThis.fetch = (url, opts) => {
    const fullUrl = `http://127.0.0.1:${port}${url}`;
    return originalFetch(fullUrl, opts);
  };

  try {
    await checkAsync('jobService.createJob sends proper POST payload and headers', async () => {
      receivedRequests = [];
      const payload = { title: 'Fix leak', category: 'cat-2', budget: { min: 100, max: 200 } };
      const res = await jobService.createJob(payload);
      assert.equal(res.success, true);
      assert.equal(res.status, 201);
      assert.equal(receivedRequests.length, 1);
      assert.equal(receivedRequests[0].method, 'POST');
      assert.equal(receivedRequests[0].url, '/api/jobs');
      assert.equal(receivedRequests[0].headers['content-type'], 'application/json');
      assert.deepEqual(receivedRequests[0].body, payload);
    });

    await checkAsync('jobService.getJobs properly builds query parameters', async () => {
      receivedRequests = [];
      const res = await jobService.getJobs({ category: 'cat-1', urgency: 'high', emptyVal: '', nullVal: null });
      assert.equal(res.success, true);
      assert.equal(res.status, 200);
      assert.equal(receivedRequests.length, 1);
      assert.equal(receivedRequests[0].method, 'GET');
      assert.ok(receivedRequests[0].url.includes('category=cat-1'));
      assert.ok(receivedRequests[0].url.includes('urgency=high'));
      assert.ok(!receivedRequests[0].url.includes('emptyVal'));
      assert.ok(!receivedRequests[0].url.includes('nullVal'));
    });

    await checkAsync('jobService.getJobById fetches specific job', async () => {
      receivedRequests = [];
      const res = await jobService.getJobById('job-123');
      assert.equal(res.success, true);
      assert.equal(res.status, 200);
      assert.equal(res.job.id, 'job-123');
      assert.equal(receivedRequests[0].method, 'GET');
      assert.equal(receivedRequests[0].url, '/api/jobs/job-123');
    });

    await checkAsync('jobService.updateJob sends PATCH with payload', async () => {
      receivedRequests = [];
      const res = await jobService.updateJob('job-123', { title: 'Updated' });
      assert.equal(res.success, true);
      assert.equal(res.status, 200);
      assert.equal(receivedRequests[0].method, 'PATCH');
      assert.equal(receivedRequests[0].url, '/api/jobs/job-123');
      assert.deepEqual(receivedRequests[0].body, { title: 'Updated' });
    });

    await checkAsync('jobService.cancelJob sends DELETE', async () => {
      receivedRequests = [];
      const res = await jobService.cancelJob('job-123');
      assert.equal(res.success, true);
      assert.equal(res.status, 200);
      assert.equal(receivedRequests[0].method, 'DELETE');
      assert.equal(receivedRequests[0].url, '/api/jobs/job-123');
    });

    await checkAsync('jobService handles 404 cleanly and preserves error envelope', async () => {
      const res = await jobService.getJobById('nonexistent');
      assert.equal(res.success, false);
      assert.equal(res.status, 404);
      assert.equal(res.error, 'Job not found');
    });

  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => testServer.close(resolve));
  }

  console.log('\n====================================================');
  console.log(`ADVERSARIAL AUDIT COMPLETE: ${passCount} / ${totalCount} passed`);
  console.log('====================================================\n');

  if (passCount !== totalCount) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
