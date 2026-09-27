# Architecture & Implementation Plan: "Post a Job" Button Wiring & Auth Check

**Target File**: `js/components/modal.js`  
**Author**: `explorer_m2_3`  
**Target Milestone**: Milestone 2 (M2)  
**Workspace Root**: `c:\Users\munta\Downloads\blue_collar`  
**Date**: 2026-09-26  
**Status**: Ready for Drop-In Implementation  

---

## 1. Executive Summary & Scope Compliance

This plan specifies the complete redesign and production wiring of all "Post a Job" buttons across the BlueCollar Connect web platform. It replaces the temporary "Post a Job feature coming soon!" toast in `js/components/modal.js` with an intelligent, session-aware authentication gate and role-authorization workflow that opens the Job Posting Modal (`openJobModal()`) for verified customers, or prompts unauthenticated users to log in via the existing login modal (`window.authUI.openModal('login-modal')`).

### Strict Scope Boundaries:
1. **Read-Only Exploration**: No source code files outside `.agents/teamwork/explorer_m2_3/` are modified during this investigation.
2. **Strictly Protected Files**:
   - `js/components/authUI.js` remains **100% UNMODIFIED** (0 lines altered).
   - `js/services/authService.js` remains **100% UNMODIFIED** (0 lines altered).
3. **Zero Regressions**: Existing navigation, mobile drawer behavior, search, theme toggling, and location modals remain fully functional without interference.
4. **Vanilla ES Module Architecture**: Standard browser ES modules without bundlers, transpilers, or external runtime dependencies.

---

## 2. Current State Analysis (`js/components/modal.js:9-19`)

### 2.1 Existing Implementation
Currently, `js/components/modal.js` contains lines 1–21:

```javascript
// js/components/modal.js
import { showToast } from '../utils/helpers.js';

let modalsInitialized = false;

export function initModals() {
  if (modalsInitialized) return;
  modalsInitialized = true;
  const postJobBtns = document.querySelectorAll('.btn-primary');
  postJobBtns.forEach(btn => {
    if(btn.textContent.trim().toLowerCase() === 'post a job') {
      btn.addEventListener('click', (e) => {
        if(e.target.tagName !== 'A') { // Avoid if it's already a link
          e.preventDefault();
          showToast("Post a Job feature coming soon!", "info");
        }
      });
    }
  });
}
```

### 2.2 Audit of "Post a Job" Buttons Across All 6 HTML Pages
Every existing page in the platform features two distinct "Post a Job" buttons: one in the desktop header (`.header-actions`) and one in the mobile navigation drawer (`.mobile-actions`):

| Page | Desktop Header Button | Mobile Drawer Button | HTML Tag & Classes |
|---|---|---|---|
| `index.html` | Line 87 | Line 125 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `services.html` | Line 85 | Line 123 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `category.html` | Line 85 | Line 123 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `professional.html` | Line 84 | Line 122 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `about.html` | Line 86 | Line 123 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `how-it-works.html` | Line 86 | Line 123 | `<button class="btn btn-primary">Post a Job</button>` / `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` |
| `jobs.html` *(Milestone 3)* | In Hero Banner | In Mobile Drawer | Any `.btn-primary` or `[data-action="post-job"]` button |

### 2.3 Identified Deficiencies of Current Implementation
1. **Static Placeholder Toast**: It displays `showToast("Post a Job feature coming soon!", "info")`, blocking the core Post Jobs functionality.
2. **Zero Authentication Check**: It never verifies whether the user is logged in or what role they possess.
3. **Flawed Link Guard (`if(e.target.tagName !== 'A')`)**: If a CTA is rendered as an anchor tag styled with `.btn-primary` (e.g. in the future `jobs.html` hero banner), clicks would bypass `e.preventDefault()`, causing unintended page navigation.
4. **No Dynamic Element Support**: Only buttons present in the DOM when `DOMContentLoaded` triggers are bound. Dynamic buttons (e.g., inside job listing empty states or dynamically loaded cards) would not be captured unless `initModals()` is re-called.
5. **No Mobile Drawer Auto-Dismissal**: On mobile viewports, clicking "Post a Job" inside `.mobile-actions` leaves the full-screen mobile menu drawer open, obscuring toasts and modals behind it.

---

## 3. Replacement Logic & Authentication Workflow

### 3.1 Step-by-Step Replacement Workflow

When ANY "Post a Job" button is clicked on any page (desktop header, mobile drawer, or page CTA):

```
                        [User clicks "Post a Job"]
                                    │
                                    ▼
                        [Intercept click: e.preventDefault()]
                                    │
                                    ▼
                     [Debounce check: isCheckingAuth?]
                           ├── Yes ──> [Ignore duplicate click]
                           └── No  ──> [Set isCheckingAuth = true]
                                    │
                                    ▼
                     [Dismiss mobile menu drawer if open]
                                    │
                                    ▼
                     [Query Live Auth: await authService.getMe()]
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
        [!res.success || !res.user]          [res.success && res.user]
        (Unauthenticated)                     (Authenticated)
                 │                                     │
                 ▼                                     ▼
     1. showToast("Please log in              [Check res.user.role]
        to post a job.", "info")                       │
     2. window.authUI.openModal(         ┌─────────────┴─────────────┐
        'login-modal')                   ▼                           ▼
                 │             [role !== 'customer']      [role === 'customer']
                 ▼             (Professional / Admin)     (Verified Customer)
              [End]                      │                           │
                                         ▼                           ▼
                              showToast("Only customers       openJobModal()
                              can post jobs.", "error")              │
                                         │                           ▼
                                         ▼                   [Job Modal Opens]
                                       [End]
```

### 3.2 Detailed Logic Components

#### A. Event Interception (`e.preventDefault()`)
Unconditionally halts any native link navigation, anchor hash jumping, or form submission:
```javascript
if (e) {
  e.preventDefault();
}
```

#### B. Concurrent Request Debounce Guard
Prevents double-toasts or race conditions from rapid multi-clicks while an authentication network request is in flight:
```javascript
if (isCheckingAuth) return;
isCheckingAuth = true;
```

#### C. Mobile Drawer Closure
On mobile devices (`< 768px`), the navigation menu `.mobile-menu` is a fixed full-screen overlay (`z-index: calc(var(--z-header) - 1)`). To prevent UI overlap when a toast or modal opens, we gracefully close the mobile drawer and restore the hamburger toggle icon:
```javascript
const mobileMenu = document.querySelector('.mobile-menu.open');
if (mobileMenu) {
  mobileMenu.classList.remove('open');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const icon = mobileMenuBtn?.querySelector('i');
  if (icon) {
    icon.setAttribute('data-lucide', 'menu');
    if (window.lucide) window.lucide.createIcons();
  }
}
```

#### D. Live Authentication Verification
Authentication status is queried directly from the backend via the existing `authService.getMe()` method. Wrapping this in `try...catch` guarantees resilience against network loss or reverse-proxy anomalies:
```javascript
let res;
try {
  res = await authService.getMe();
} catch (err) {
  console.warn('Network error during auth check:', err);
  res = { success: false };
}
```

#### E. Unauthenticated State Handling
If `res.success` is false or `!res.user`, the user has no active session:
1. Display an informational toast: `showToast("Please log in to post a job.", "info");`
2. Open the login modal using the global API exposed by `authUI.js`:
   ```javascript
   if (window.authUI && typeof window.authUI.openModal === 'function') {
     window.authUI.openModal('login-modal');
   }
   ```
3. Terminate the flow (`return`).

#### F. Role Verification (Customer Authorization)
In BlueCollar Connect, users with a valid session (`res.success === true`) are already email-verified (as enforced by `server/controllers/authController.js:168-179`).
If `res.user.role !== 'customer'` (e.g. user is logged in as a `professional` or `admin`):
1. Display an error toast: `showToast("Only customers can post jobs.", "error");`
2. Do not open the job posting modal or login modal.
3. Terminate the flow (`return`).

#### G. Authorized Customer: Open Job Modal
When `res.user.role === 'customer'`:
1. Trigger `openJobModal()`.
2. Fallback cascade ensures seamless operation regardless of whether `openJobModal` was statically imported or dynamically exposed on `window.jobModal`:
   ```javascript
   if (typeof openJobModal === 'function') {
     openJobModal();
   } else if (window.jobModal && typeof window.jobModal.openJobModal === 'function') {
     window.jobModal.openJobModal();
   } else if (window.jobModal && typeof window.jobModal.openModal === 'function') {
     window.jobModal.openModal();
   } else if (typeof window.openJobModal === 'function') {
     window.openJobModal();
   }
   ```

---

## 4. Interaction Contract Between `modal.js` and `jobModal.js`

### 4.1 Interface Contract
`modal.js` interacts with `jobModal.js` through standard ES module import:
```javascript
import { openJobModal } from './jobModal.js';
```

### 4.2 Responsibilities Division
| Concern | Handled by `modal.js` | Handled by `jobModal.js` |
|---|---|---|
| Intercepting click on "Post a Job" buttons | **YES** | NO |
| Debouncing / Click locking | **YES** | NO (form submit button has its own spinner) |
| Live session query (`authService.getMe()`) | **YES** | Optional pre-flight check on form submission |
| Login modal invocation (`authUI.openModal`) | **YES** | NO |
| Customer role rejection toast | **YES** | NO |
| Modal DOM injection (`#post-job-modal`) | NO | **YES** |
| Modal glassmorphism animation & backdrop | NO | **YES** |
| Mutual exclusion (`authUI.closeAllAuthModals`) | NO | **YES** (inside `openJobModal()`) |
| Form inputs, validation, categories, submit | NO | **YES** |
| Calling `jobService.createJob()` | NO | **YES** |

### 4.3 Mutual Exclusion Coordination
In `blue_collar`, only one modal may be visible at any given time.
When `jobModal.openJobModal()` executes, it must perform:
```javascript
// Mutual exclusion inside jobModal.js:
if (window.authUI?.closeAllAuthModals) {
  window.authUI.closeAllAuthModals();
}
if (window.locationUI?.closeModal) {
  window.locationUI.closeModal();
}
```
Similarly, `authUI.js` closes other modals, and `locationUI.js` closes auth modals.

---

## 5. Exact Drop-In Implementation for `js/components/modal.js`

Below is the complete, production-ready replacement for `js/components/modal.js`:

```javascript
// js/components/modal.js
import { showToast } from '../utils/helpers.js';
import { authService } from '../services/authService.js';
import { openJobModal } from './jobModal.js';

let modalsInitialized = false;
let isCheckingAuth = false;

/**
 * Handles click on any "Post a Job" button across desktop/mobile headers and pages.
 * Flow:
 * 1. Intercepts click (e.preventDefault())
 * 2. Dismisses open mobile menu drawer
 * 3. Checks live session via authService.getMe()
 * 4. If unauthenticated -> displays info toast and opens login modal
 * 5. If authenticated but not customer -> displays error toast
 * 6. If authenticated verified customer -> opens job posting modal
 *
 * @param {Event} [e] - Click event
 */
export async function handlePostJobClick(e) {
  if (e) {
    e.preventDefault();
  }

  // Prevent duplicate concurrent requests if user rapidly clicks
  if (isCheckingAuth) return;
  isCheckingAuth = true;

  try {
    // 1. Close mobile drawer if open to prevent UI overlap
    const mobileMenu = document.querySelector('.mobile-menu.open');
    if (mobileMenu) {
      mobileMenu.classList.remove('open');
      const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
      const icon = mobileMenuBtn?.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        if (window.lucide) window.lucide.createIcons();
      }
    }

    // 2. Query live authentication status from backend
    const res = await authService.getMe();

    // 3. Unauthenticated check
    if (!res || !res.success || !res.user) {
      showToast("Please log in to post a job.", "info");
      if (window.authUI && typeof window.authUI.openModal === 'function') {
        window.authUI.openModal('login-modal');
      }
      return;
    }

    // 4. Role verification check
    if (res.user.role !== 'customer') {
      showToast("Only customers can post jobs.", "error");
      return;
    }

    // 5. Authenticated verified customer -> open job posting modal
    if (typeof openJobModal === 'function') {
      openJobModal();
    } else if (window.jobModal && typeof window.jobModal.openJobModal === 'function') {
      window.jobModal.openJobModal();
    } else if (window.jobModal && typeof window.jobModal.openModal === 'function') {
      window.jobModal.openModal();
    } else if (typeof window.openJobModal === 'function') {
      window.openJobModal();
    } else {
      console.error('Job modal is not available');
      showToast("Job posting form is currently unavailable.", "error");
    }

  } catch (err) {
    console.error('Error during post-job authentication check:', err);
    showToast("Please log in to post a job.", "info");
    if (window.authUI && typeof window.authUI.openModal === 'function') {
      window.authUI.openModal('login-modal');
    }
  } finally {
    isCheckingAuth = false;
  }
}

/**
 * Initializes listeners for all "Post a Job" buttons.
 * Hooks both static header buttons and provides document delegation for dynamic buttons.
 */
export function initModals() {
  if (modalsInitialized) return;
  modalsInitialized = true;

  // 1. Static buttons present at DOMContentLoaded
  const postJobBtns = document.querySelectorAll('.btn-primary');
  postJobBtns.forEach(btn => {
    if (btn.textContent.trim().toLowerCase() === 'post a job') {
      btn.dataset.postJobBound = 'true';
      btn.addEventListener('click', handlePostJobClick);
    }
  });

  // 2. Global event delegation for dynamically inserted "Post a Job" buttons
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a');
    if (target && target.textContent.trim().toLowerCase() === 'post a job') {
      // If button was already directly bound, the direct handler handles it
      if (target.dataset.postJobBound === 'true') return;
      handlePostJobClick(e);
    }
  });
}
```

---

## 6. Code Diff Analysis

```diff
--- a/js/components/modal.js
+++ b/js/components/modal.js
@@ -1,21 +1,91 @@
 // js/components/modal.js
 import { showToast } from '../utils/helpers.js';
+import { authService } from '../services/authService.js';
+import { openJobModal } from './jobModal.js';
 
 let modalsInitialized = false;
+let isCheckingAuth = false;
+
+/**
+ * Handles click on any "Post a Job" button across desktop/mobile headers and pages.
+ */
+export async function handlePostJobClick(e) {
+  if (e) {
+    e.preventDefault();
+  }
+
+  // Prevent duplicate concurrent requests if user rapidly clicks
+  if (isCheckingAuth) return;
+  isCheckingAuth = true;
+
+  try {
+    // 1. Close mobile drawer if open to prevent UI overlap
+    const mobileMenu = document.querySelector('.mobile-menu.open');
+    if (mobileMenu) {
+      mobileMenu.classList.remove('open');
+      const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
+      const icon = mobileMenuBtn?.querySelector('i');
+      if (icon) {
+        icon.setAttribute('data-lucide', 'menu');
+        if (window.lucide) window.lucide.createIcons();
+      }
+    }
+
+    // 2. Query live authentication status from backend
+    const res = await authService.getMe();
+
+    // 3. Unauthenticated check
+    if (!res || !res.success || !res.user) {
+      showToast("Please log in to post a job.", "info");
+      if (window.authUI && typeof window.authUI.openModal === 'function') {
+        window.authUI.openModal('login-modal');
+      }
+      return;
+    }
+
+    // 4. Role verification check
+    if (res.user.role !== 'customer') {
+      showToast("Only customers can post jobs.", "error");
+      return;
+    }
+
+    // 5. Authenticated verified customer -> open job posting modal
+    if (typeof openJobModal === 'function') {
+      openJobModal();
+    } else if (window.jobModal && typeof window.jobModal.openJobModal === 'function') {
+      window.jobModal.openJobModal();
+    } else if (window.jobModal && typeof window.jobModal.openModal === 'function') {
+      window.jobModal.openModal();
+    } else if (typeof window.openJobModal === 'function') {
+      window.openJobModal();
+    } else {
+      console.error('Job modal is not available');
+      showToast("Job posting form is currently unavailable.", "error");
+    }
+
+  } catch (err) {
+    console.error('Error during post-job authentication check:', err);
+    showToast("Please log in to post a job.", "info");
+    if (window.authUI && typeof window.authUI.openModal === 'function') {
+      window.authUI.openModal('login-modal');
+    }
+  } finally {
+    isCheckingAuth = false;
+  }
+}
 
 export function initModals() {
   if (modalsInitialized) return;
   modalsInitialized = true;
+
   const postJobBtns = document.querySelectorAll('.btn-primary');
   postJobBtns.forEach(btn => {
     if(btn.textContent.trim().toLowerCase() === 'post a job') {
-      btn.addEventListener('click', (e) => {
-        if(e.target.tagName !== 'A') { // Avoid if it's already a link
-          e.preventDefault();
-          showToast("Post a Job feature coming soon!", "info");
-        }
-      });
+      btn.dataset.postJobBound = 'true';
+      btn.addEventListener('click', handlePostJobClick);
     }
   });
+
+  // Global event delegation for dynamically inserted "Post a Job" buttons
+  document.addEventListener('click', (e) => {
+    const target = e.target.closest('button, a');
+    if (target && target.textContent.trim().toLowerCase() === 'post a job') {
+      if (target.dataset.postJobBound === 'true') return;
+      handlePostJobClick(e);
+    }
+  });
 }
```

---

## 7. Verification & Testing Strategy

### 7.1 Automated & Manual Test Scenarios

| Test Case | Precondition | Trigger | Expected Outcome |
|---|---|---|---|
| **TC-1: Unauthenticated Desktop** | No session cookie | Click desktop header "Post a Job" on any page | `e.preventDefault()` halts click. Info toast appears: `"Please log in to post a job."`. `#login-modal` opens with `.visible` class. |
| **TC-2: Unauthenticated Mobile** | No session cookie, viewport < 768px | Open hamburger menu, click mobile "Post a Job" | Mobile drawer closes. Hamburger toggles back to `menu`. Info toast appears. `#login-modal` opens. |
| **TC-3: Authenticated Customer** | Session cookie for customer (`role: 'customer'`) | Click "Post a Job" on any page | `authService.getMe()` returns `{ success: true, user: { role: 'customer' } }`. `openJobModal()` is called. `#post-job-modal` opens. |
| **TC-4: Authenticated Non-Customer (Pro)** | Session cookie for professional (`role: 'professional'`) | Click "Post a Job" on any page | `authService.getMe()` returns `{ role: 'professional' }`. Error toast appears: `"Only customers can post jobs."`. No modal opens. |
| **TC-5: Authenticated Admin** | Session cookie for admin (`role: 'admin'`) | Click "Post a Job" on any page | `authService.getMe()` returns `{ role: 'admin' }`. Error toast appears: `"Only customers can post jobs."`. No modal opens. |
| **TC-6: Concurrency Debounce** | Rapid double/triple click on "Post a Job" | Fast multi-click | Only 1 `getMe()` network request in Flight. No duplicate toasts or modal animations. |
| **TC-7: Network Failure Recovery** | Network drops / backend down | Click "Post a Job" | Catch block safely intercepts error. Friendly info toast `"Please log in to post a job."` shown. No uncaught JavaScript exceptions. |
| **TC-8: Dynamic Button Delegation** | Dynamically injected button `<button class="btn btn-primary">Post a Job</button>` | Click dynamic button | Document delegation catches event, runs `handlePostJobClick(e)` without needing re-init. |

### 7.2 Zero Regression Safeguards
Run `node tests/verify-jobs.js` to assert that:
- `js/components/authUI.js` has 0 modifications (checksum / line count match).
- `js/services/authService.js` has 0 modifications (checksum / line count match).
- All 34 automated unit/integration tests pass.

---

## 8. Summary for Implementer (Coder)
When Milestone 2 implementation begins:
1. `explorer_m2_1` provides `js/services/jobService.js`.
2. `explorer_m2_2` provides `js/components/jobModal.js` (with `openJobModal()` exported).
3. The implementer replaces `js/components/modal.js` with the code in **Section 5**.
4. Both desktop and mobile headers across all 6 pages instantly become fully functional, secure, and authenticated!
