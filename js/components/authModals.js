// js/components/authModals.js

export function getAuthModalsHTML() {
  return `
    <!-- Login Modal -->
    <div id="login-modal" class="modal-overlay hidden" data-auth-modal>
      <div class="modal-container auth-modal">
        <div class="modal-header">
          <h3>Welcome Back</h3>
          <button class="modal-close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <div id="login-error" class="auth-error-msg"></div>
          <form id="login-form">
            <div class="input-group">
              <label class="input-label" for="login-email">Email</label>
              <input type="email" id="login-email" class="input-field" placeholder="your@email.com" required>
            </div>
            <div class="input-group">
              <label class="input-label" for="login-password">Password</label>
              <input type="password" id="login-password" class="input-field" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn btn-primary" id="login-submit-btn">Login</button>
          </form>
          <div class="auth-links">
            <a id="link-forgot-password">Forgot Password?</a>
            <span class="text-secondary">Don't have an account? <a id="link-register">Create one</a></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Register Modal -->
    <div id="register-modal" class="modal-overlay hidden" data-auth-modal>
      <div class="modal-container auth-modal">
        <div class="modal-header">
          <h3>Create Account</h3>
          <button class="modal-close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <div id="register-error" class="auth-error-msg"></div>
          <form id="register-form">
            <div class="input-group">
              <label class="input-label" for="register-name">Full Name</label>
              <input type="text" id="register-name" class="input-field" placeholder="John Doe" required>
            </div>
            <div class="input-group">
              <label class="input-label" for="register-email">Email</label>
              <input type="email" id="register-email" class="input-field" placeholder="your@email.com" required>
            </div>
            <div class="input-group">
              <label class="input-label" for="register-password">Password</label>
              <input type="password" id="register-password" class="input-field" placeholder="••••••••" minlength="8" required>
            </div>
            <button type="submit" class="btn btn-primary" id="register-submit-btn">Sign Up</button>
          </form>
          <div class="auth-links">
            <span class="text-secondary">Already have an account? <a id="link-login">Login</a></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Forgot Password Modal -->
    <div id="forgot-password-modal" class="modal-overlay hidden" data-auth-modal>
      <div class="modal-container auth-modal">
        <div class="modal-header">
          <h3>Reset Password</h3>
          <button class="modal-close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <p class="text-secondary mb-4 text-sm text-center">Enter your email and we'll send you a code to reset your password.</p>
          <div id="forgot-error" class="auth-error-msg"></div>
          <form id="forgot-form">
            <div class="input-group">
              <label class="input-label" for="forgot-email">Email</label>
              <input type="email" id="forgot-email" class="input-field" placeholder="your@email.com" required>
            </div>
            <button type="submit" class="btn btn-primary" id="forgot-submit-btn">Send Reset Code</button>
          </form>
          <div class="auth-links">
            <a id="link-back-login">Back to Login</a>
          </div>
        </div>
      </div>
    </div>

    <!-- OTP Modal -->
    <div id="otp-modal" class="modal-overlay hidden" data-auth-modal>
      <div class="modal-container auth-modal">
        <div class="modal-header">
          <h3>Verification Code</h3>
          <button class="modal-close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <p class="text-secondary mb-2 text-sm text-center">We've sent a 6-digit code to <br><strong id="otp-email-display" class="text-primary"></strong></p>
          <div id="otp-error" class="auth-error-msg"></div>
          <div id="otp-success" class="auth-success-msg"></div>
          
          <form id="otp-form">
            <div class="otp-inputs">
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
              <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
            </div>
            <button type="submit" class="btn btn-primary" id="otp-submit-btn">Verify Code</button>
          </form>
          
          <div class="resend-text">
            Didn't receive it? <a id="link-resend-otp" style="color: var(--accent-blue); cursor: pointer;">Resend Code</a> <span id="resend-timer"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- New Password Modal (After Forgot Password OTP) -->
    <div id="reset-password-modal" class="modal-overlay hidden" data-auth-modal>
      <div class="modal-container auth-modal">
        <div class="modal-header">
          <h3>Set New Password</h3>
          <button class="modal-close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <div id="reset-error" class="auth-error-msg"></div>
          <form id="reset-password-form">
            <div class="input-group">
              <label class="input-label" for="new-password">New Password</label>
              <input type="password" id="new-password" class="input-field" placeholder="••••••••" minlength="8" required>
            </div>
            <button type="submit" class="btn btn-primary" id="reset-submit-btn">Update Password</button>
          </form>
        </div>
      </div>
    </div>
  `;
}
