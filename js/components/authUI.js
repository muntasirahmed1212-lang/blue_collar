// js/components/authUI.js
import { authService } from '../services/authService.js';
import { showToast } from '../utils/helpers.js';
import { getAuthModalsHTML } from './authModals.js';

let currentUser = null;
let otpContext = { email: '', purpose: '' }; // To keep track during flow

let authInitialized = false;

export function initAuth() {
  // Expose authUI globally for compatibility
  window.authUI = { openModal, closeAllAuthModals };

  if (!document.body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initAuth(), { once: true });
    }
    return;
  }

  // Inject modals into body if not already present
  if (!document.getElementById('login-modal')) {
    document.body.insertAdjacentHTML('beforeend', getAuthModalsHTML());
    
    // Re-initialize icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  if (authInitialized) {
    return;
  }
  authInitialized = true;

  setupEventListeners();
  updateHeaderState(null);
  checkAuthStatus();
}

let openModalRafId = null;

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Prevent visual flash and transition re-trigger if modal is already open and visible
  if (modal.classList.contains('visible') && !modal.classList.contains('hidden')) {
    clearErrors();
    return;
  }

  closeAllAuthModals();

  // Close non-auth location modal if open for mutual exclusion
  if (window.locationUI?.closeModal) {
    window.locationUI.closeModal();
  } else {
    const locModal = document.getElementById('location-modal');
    if (locModal) {
      locModal.classList.remove('visible');
      locModal.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  if (document.hidden) {
    modal.classList.add('visible');
  } else {
    openModalRafId = requestAnimationFrame(() => {
      modal.classList.add('visible');
      openModalRafId = null;
    });
  }
  clearErrors();
  if (document.body) {
    document.body.style.overflow = 'hidden';
  }
}

export function closeAllAuthModals() {
  if (openModalRafId) {
    cancelAnimationFrame(openModalRafId);
    openModalRafId = null;
  }
  const modals = document.querySelectorAll('[data-auth-modal]');
  modals.forEach(modal => {
    modal.classList.remove('visible');
    modal.classList.add('hidden');
  });

  // Restore body scroll only if mobile menu and location modal are not open
  const mobileMenu = document.querySelector('.mobile-menu.open');
  const locModal = document.getElementById('location-modal');
  const isLocOpen = locModal && !locModal.classList.contains('hidden');
  if (!mobileMenu && !isLocOpen && document.body) {
    document.body.style.overflow = '';
  }
}

function clearErrors() {
  document.querySelectorAll('.auth-error-msg').forEach(el => {
    el.style.display = 'none';
    el.textContent = '';
  });
  document.querySelectorAll('.auth-success-msg').forEach(el => {
    el.style.display = 'none';
    el.textContent = '';
  });
}

function showError(formId, message) {
  const errorEl = document.getElementById(`${formId}-error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function showSuccess(formId, message) {
  const successEl = document.getElementById(`${formId}-success`);
  if (successEl) {
    successEl.textContent = message;
    successEl.style.display = 'block';
  }
}

function setLoading(btnId, isLoading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:1rem;height:1rem;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Ensure spin animation exists globally
if (!document.getElementById('spin-keyframes')) {
  const style = document.createElement('style');
  style.id = 'spin-keyframes';
  style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

function setupEventListeners() {
  // Close buttons
  document.querySelectorAll('[data-auth-modal] .modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllAuthModals);
  });
  
  // Close on overlay click
  document.querySelectorAll('[data-auth-modal]').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAllAuthModals();
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllAuthModals();
  });

  // Navigation Links
  document.getElementById('link-register')?.addEventListener('click', () => openModal('register-modal'));
  document.getElementById('link-login')?.addEventListener('click', () => openModal('login-modal'));
  document.getElementById('link-forgot-password')?.addEventListener('click', () => openModal('forgot-password-modal'));
  document.getElementById('link-back-login')?.addEventListener('click', () => openModal('login-modal'));

  // Forms
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('forgot-form')?.addEventListener('submit', handleForgotPassword);
  document.getElementById('otp-form')?.addEventListener('submit', handleVerifyOTP);
  document.getElementById('reset-password-form')?.addEventListener('submit', handleResetPassword);
  document.getElementById('link-resend-otp')?.addEventListener('click', handleResendOTP);

  // OTP Input behavior
  setupOTPInputs();
}

function setupOTPInputs() {
  const inputs = document.querySelectorAll('.otp-input');
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      if (e.target.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        inputs[index - 1].focus();
      }
    });
  });
}

// --- Handlers ---

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  setLoading('login-submit-btn', true);
  clearErrors();
  
  try {
    const res = await authService.login(email, password);
    if (res.success) {
      closeAllAuthModals();
      showToast('Logged in successfully', 'success');
      updateHeaderState(res.user);
    } else {
      if (res.needsVerification) {
        // Automatically request an OTP
        await authService.sendOtp(email, 'verification');
        startOTPFlow(email, 'verification');
      } else {
        showError('login', res.error || 'Login failed');
      }
    }
  } catch (err) {
    showError('login', 'Network error. Please try again.');
  } finally {
    setLoading('login-submit-btn', false, 'Login');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  
  setLoading('register-submit-btn', true);
  clearErrors();
  
  try {
    const res = await authService.register(name, email, password);
    if (res.success) {
      startOTPFlow(email, 'verification');
    } else {
      showError('register', res.error || 'Registration failed');
    }
  } catch (err) {
    showError('register', 'Network error. Please try again.');
  } finally {
    setLoading('register-submit-btn', false, 'Sign Up');
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value;
  
  setLoading('forgot-submit-btn', true);
  clearErrors();
  
  try {
    const res = await authService.forgotPassword(email);
    if (res.success) {
      startOTPFlow(email, 'password-reset');
    } else {
      showError('forgot', res.error || 'Failed to request reset');
    }
  } catch (err) {
    showError('forgot', 'Network error. Please try again.');
  } finally {
    setLoading('forgot-submit-btn', false, 'Send Reset Code');
  }
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  const inputs = Array.from(document.querySelectorAll('.otp-input'));
  const otp = inputs.map(input => input.value).join('');
  
  if (otp.length < 6) {
    showError('otp', 'Please enter all 6 digits');
    return;
  }
  
  setLoading('otp-submit-btn', true);
  clearErrors();
  
  try {
    const res = await authService.verifyOtp(otpContext.email, otp);
    if (res.success) {
      if (otpContext.purpose === 'password-reset') {
        openModal('reset-password-modal');
      } else {
        closeAllAuthModals();
        showToast('Email verified successfully', 'success');
        if (res.user) updateHeaderState(res.user);
      }
    } else {
      showError('otp', res.error || 'Invalid OTP');
    }
  } catch (err) {
    showError('otp', 'Network error. Please try again.');
  } finally {
    setLoading('otp-submit-btn', false, 'Verify Code');
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const password = document.getElementById('new-password').value;
  
  setLoading('reset-submit-btn', true);
  clearErrors();
  
  try {
    const res = await authService.resetPassword(otpContext.email, password);
    if (res.success) {
      closeAllAuthModals();
      showToast('Password updated successfully. Please login.', 'success');
      setTimeout(() => openModal('login-modal'), 1000);
    } else {
      showError('reset', res.error || 'Failed to update password');
    }
  } catch (err) {
    showError('reset', 'Network error. Please try again.');
  } finally {
    setLoading('reset-submit-btn', false, 'Update Password');
  }
}

let resendInterval;
function startOTPFlow(email, purpose) {
  otpContext = { email, purpose };
  document.getElementById('otp-email-display').textContent = email;
  
  // Clear inputs
  document.querySelectorAll('.otp-input').forEach(input => input.value = '');
  
  openModal('otp-modal');
  
  // Start resend timer
  const resendLink = document.getElementById('link-resend-otp');
  const timerDisplay = document.getElementById('resend-timer');
  let timeLeft = 60;
  
  resendLink.style.pointerEvents = 'none';
  resendLink.style.color = 'var(--text-muted)';
  
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `(${timeLeft}s)`;
    if (timeLeft <= 0) {
      clearInterval(resendInterval);
      timerDisplay.textContent = '';
      resendLink.style.pointerEvents = 'auto';
      resendLink.style.color = 'var(--accent-blue)';
    }
  }, 1000);
}

async function handleResendOTP() {
  clearErrors();
  showSuccess('otp', 'Sending new OTP...');
  
  try {
    const res = await authService.sendOtp(otpContext.email, otpContext.purpose);
    if (res.success) {
      showSuccess('otp', 'New OTP sent!');
      startOTPFlow(otpContext.email, otpContext.purpose); // restart timer
    } else {
      showError('otp', res.error || 'Failed to resend');
    }
  } catch (err) {
    showError('otp', 'Network error while resending');
  }
}

export async function checkAuthStatus() {
  try {
    const res = await authService.getMe();
    if (res.success && res.user) {
      updateHeaderState(res.user);
    } else {
      updateHeaderState(null);
    }
  } catch (e) {
    updateHeaderState(null);
  }
}

export function updateHeaderState(user) {
  currentUser = user;
  const loginBtns = document.querySelectorAll('.header-actions .btn-ghost, .mobile-menu .btn-outline, .btn-ghost, .btn-outline');
  
  if (user) {
    // Modify header for logged in state
    loginBtns.forEach(btn => {
      if (btn.classList.contains('global-location-btn')) return;
      if(btn.textContent.trim().toLowerCase() === 'login' || btn.textContent.trim().toLowerCase() === 'logout') {
        btn.innerHTML = `<i data-lucide="log-out"></i> Logout`;
        // Replace event listener by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          await authService.logout();
          window.location.reload();
        });
      }
    });
    
    // Add user greeting if not already there
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('user-greeting')) {
      const greeting = document.createElement('span');
      greeting.id = 'user-greeting';
      greeting.style.marginRight = 'var(--spacing-3)';
      greeting.style.fontWeight = '500';
      greeting.style.display = 'inline-flex';
      greeting.style.alignItems = 'center';
      greeting.style.gap = '8px';
      
      const firstName = user.fullName.split(' ')[0];
      
      if (user.role === 'admin') {
        greeting.innerHTML = `<span style="background-color: var(--accent-blue); color: white; padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 600;">Admin</span> Hi, ${firstName}`;
      } else {
        greeting.textContent = `Hi, ${firstName}`;
      }
      
      headerActions.insertBefore(greeting, headerActions.lastElementChild);
    }
    
  } else {
    // Reset to login
    loginBtns.forEach(btn => {
      if (btn.classList.contains('global-location-btn')) return;
      if(btn.textContent.trim().toLowerCase() === 'logout' || btn.textContent.trim().toLowerCase() === 'login') {
        btn.innerHTML = `Login`;
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openModal('login-modal');
        });
      }
    });
    
    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.remove();
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
