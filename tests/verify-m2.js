/**
 * tests/verify-m2.js
 * Verification test suite for Milestone M2: Job Posting Form UI & Modal Wiring
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('=================================================================');
console.log('MILESTONE M2 COMPONENT & INTEGRATION VERIFICATION');
console.log('=================================================================\n');

let passCount = 0;
let totalCount = 0;

function test(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runTests() {
  // ─── 1. jobService.js verification ──────────────────────────────────────────
  test('M2.1: js/services/jobService.js exists and exports required methods', () => {
    const jobServicePath = path.join(ROOT, 'js', 'services', 'jobService.js');
    assert.ok(fs.existsSync(jobServicePath), 'jobService.js file must exist');
    const content = fs.readFileSync(jobServicePath, 'utf8');

    assert.ok(content.includes('export async function createJob'), 'createJob must be exported');
    assert.ok(content.includes('export async function getJobs'), 'getJobs must be exported');
    assert.ok(content.includes('export async function getJobById'), 'getJobById must be exported');
    assert.ok(content.includes('export async function updateJob'), 'updateJob must be exported');
    assert.ok(content.includes('export async function cancelJob'), 'cancelJob must be exported');
    assert.ok(content.includes('export const deleteJob = cancelJob'), 'deleteJob alias must be exported');
    assert.ok(content.includes("credentials: 'include'"), "must include credentials: 'include'");
    assert.ok(content.includes("const API_BASE = '/api/jobs'"), 'must target /api/jobs endpoint');
  });

  // ─── 2. jobModal.js verification ───────────────────────────────────────────
  test('M2.2: js/components/jobModal.js exists and contains complete modal markup', () => {
    const jobModalPath = path.join(ROOT, 'js', 'components', 'jobModal.js');
    assert.ok(fs.existsSync(jobModalPath), 'jobModal.js file must exist');
    const content = fs.readFileSync(jobModalPath, 'utf8');

    assert.ok(content.includes('id="post-job-modal"'), 'must include #post-job-modal');
    assert.ok(content.includes('id="job-title"'), 'must include #job-title input');
    assert.ok(content.includes('id="job-category"'), 'must include #job-category select');
    assert.ok(content.includes('id="job-description"'), 'must include #job-description textarea');
    assert.ok(content.includes('id="job-location"'), 'must include #job-location input');
    assert.ok(content.includes('id="job-budget-min"'), 'must include #job-budget-min');
    assert.ok(content.includes('id="job-budget-max"'), 'must include #job-budget-max');
    assert.ok(content.includes('name="urgency"'), 'must include urgency radio group');
    assert.ok(content.includes('value="low"'), 'urgency must support low');
    assert.ok(content.includes('value="medium"'), 'urgency must support medium');
    assert.ok(content.includes('value="high"'), 'urgency must support high');
    assert.ok(content.includes('value="urgent"'), 'urgency must support urgent');
    assert.ok(content.includes('id="job-datetime"'), 'must include #job-datetime input');
    assert.ok(content.includes('id="job-photos"'), 'must include #job-photos input');
    assert.ok(content.includes('id="job-submit-btn"'), 'must include submit button');
    assert.ok(content.includes('job:created'), 'must dispatch job:created custom event');
    assert.ok(content.includes('export function openJobModal'), 'must export openJobModal');
    assert.ok(content.includes('export function closeJobModal'), 'must export closeJobModal');
    assert.ok(content.includes('export function initJobModal'), 'must export initJobModal');
  });

  // ─── 3. categories.js verification ────────────────────────────────────────
  test('M2.3: Categories data contains all 12 canonical service categories', () => {
    const categoriesPath = path.join(ROOT, 'js', 'data', 'categories.js');
    const content = fs.readFileSync(categoriesPath, 'utf8');
    for (let i = 1; i <= 12; i++) {
      assert.ok(content.includes(`cat-${i}`), `categories must contain cat-${i}`);
    }
  });

  // ─── 4. modal.js button wiring verification ───────────────────────────────
  test('M2.4: js/components/modal.js wires Post a Job buttons with auth & role check', () => {
    const modalPath = path.join(ROOT, 'js', 'components', 'modal.js');
    assert.ok(fs.existsSync(modalPath), 'modal.js file must exist');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(!content.includes('Post a Job feature coming soon!'), 'Must NOT contain coming soon placeholder');
    assert.ok(content.includes('authService.getMe()'), 'Must call authService.getMe()');
    assert.ok(content.includes('Please log in to post a job.'), 'Must show info toast when unauthenticated');
    assert.ok(content.includes("openModal('login-modal')"), 'Must trigger login modal when unauthenticated');
    assert.ok(content.includes('Only customers can post jobs.'), 'Must reject non-customer roles');
    assert.ok(content.includes('openJobModal'), 'Must open job modal for customers');
    assert.ok(content.includes('handlePostJobClick'), 'Must define handlePostJobClick handler');
    assert.ok(content.includes('initModals'), 'Must export initModals');
  });

  // ─── 5. css/components.css verification ───────────────────────────────────
  test('M2.5: css/components.css contains required styling rules for job modal', () => {
    const cssPath = path.join(ROOT, 'css', 'components.css');
    const content = fs.readFileSync(cssPath, 'utf8');

    assert.ok(content.includes('.job-modal-container'), 'Must define .job-modal-container');
    assert.ok(content.includes('.job-modal-body'), 'Must define .job-modal-body');
    assert.ok(content.includes('.urgency-grid'), 'Must define .urgency-grid');
    assert.ok(content.includes('.urgency-card'), 'Must define .urgency-card');
    assert.ok(content.includes('.job-modal-banner-error'), 'Must define .job-modal-banner-error');
    assert.ok(content.includes('jobModalSpin'), 'Must define spin animation keyframes');
  });

  // ─── 6. js/app.js initialization verification ──────────────────────────────
  test('M2.6: js/app.js imports and initializes initJobModal', () => {
    const appPath = path.join(ROOT, 'js', 'app.js');
    const content = fs.readFileSync(appPath, 'utf8');

    assert.ok(content.includes("import { initJobModal } from './components/jobModal.js';"), 'Must import initJobModal');
    assert.ok(content.includes('initJobModal();'), 'Must invoke initJobModal()');
  });

  // ─── 7. Forbidden files check ─────────────────────────────────────────────
  test('M2.7: Strictly protected files (authUI.js and authService.js) are completely untouched', () => {
    const { execSync } = require('child_process');
    const status = execSync('git status --porcelain js/components/authUI.js js/services/authService.js', {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
    assert.equal(status, '', `Protected files must have zero git modifications. Got:\n${status}`);
  });

  console.log('\n=================================================================');
  console.log(`SUMMARY: ${passCount} / ${totalCount} tests passed`);
  console.log('=================================================================\n');

  if (passCount !== totalCount) {
    process.exit(1);
  }
}

runTests();
