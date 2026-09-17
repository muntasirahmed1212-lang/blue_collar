// js/components/modal.js
import { showToast } from '../utils/helpers.js';

export function initModals() {
  // Common logic for modal handling
  const loginBtns = document.querySelectorAll('.btn-ghost'); // Assuming login button uses this class in header
  
  loginBtns.forEach(btn => {
    if(btn.textContent.trim().toLowerCase() === 'login') {
      btn.addEventListener('click', () => {
        showToast("Login feature coming soon!", "info");
      });
    }
  });

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
