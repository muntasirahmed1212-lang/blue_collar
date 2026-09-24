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
