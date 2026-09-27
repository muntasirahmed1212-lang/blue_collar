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
    if (typeof document !== 'undefined') {
      const mobileMenu = document.querySelector('.mobile-menu.open');
      if (mobileMenu) {
        mobileMenu.classList.remove('open');
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        const icon = mobileMenuBtn?.querySelector('i');
        if (icon) {
          icon.setAttribute('data-lucide', 'menu');
          if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
        }
      }
    }

    // 2. Query live authentication status from backend
    const res = await authService.getMe();

    // 3. Unauthenticated check
    if (!res || !res.success || !res.user) {
      showToast("Please log in to post a job.", "info");
      if (typeof window !== 'undefined' && window.authUI && typeof window.authUI.openModal === 'function') {
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
    } else if (typeof window !== 'undefined' && window.jobModal && typeof window.jobModal.openJobModal === 'function') {
      window.jobModal.openJobModal();
    } else if (typeof window !== 'undefined' && window.jobModal && typeof window.jobModal.openModal === 'function') {
      window.jobModal.openModal();
    } else if (typeof window !== 'undefined' && typeof window.openJobModal === 'function') {
      window.openJobModal();
    } else {
      console.error('Job modal is not available');
      showToast("Job posting form is currently unavailable.", "error");
    }

  } catch (err) {
    console.error('Error during post-job authentication check:', err);
    showToast("Please log in to post a job.", "info");
    if (typeof window !== 'undefined' && window.authUI && typeof window.authUI.openModal === 'function') {
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

  if (typeof document === 'undefined') return;

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
