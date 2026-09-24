// js/services/authService.js

const API_BASE = '/api/auth';

async function fetchWithJSON(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });
  
  return response.json();
}

export const authService = {
  async register(fullName, email, password) {
    return fetchWithJSON('/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password })
    });
  },

  async login(email, password) {
    return fetchWithJSON('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async sendOtp(email, purpose = 'verification') {
    return fetchWithJSON('/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose })
    });
  },

  async verifyOtp(email, otp) {
    return fetchWithJSON('/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });
  },

  async forgotPassword(email) {
    return fetchWithJSON('/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async resetPassword(email, password) {
    return fetchWithJSON('/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async getMe() {
    return fetchWithJSON('/me', {
      method: 'GET'
    });
  },

  async logout() {
    return fetchWithJSON('/logout', {
      method: 'POST'
    });
  }
};
