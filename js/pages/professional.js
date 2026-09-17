// js/pages/professional.js
import { getProfessionalById } from '../data/professionals.js';
import { getQueryParams } from '../utils/helpers.js';

export function initProfessional() {
  const params = getQueryParams();
  const proId = params.id;
  
  if (!proId) {
    window.location.href = '/services.html';
    return;
  }

  const pro = getProfessionalById(proId);
  if (!pro) {
    window.location.href = '/services.html';
    return;
  }

  // Populate Breadcrumb
  const catLink = document.getElementById('breadcrumb-cat');
  catLink.textContent = pro.categoryName;
  catLink.href = `/category.html?cat=${pro.categoryId.replace('cat-', '')}`; // Approximate mapping for mock
  document.getElementById('breadcrumb-current').textContent = pro.name;
  
  // Populate Header
  document.getElementById('pro-photo').src = pro.photo;
  
  const nameEl = document.getElementById('pro-name');
  nameEl.textContent = pro.name;
  nameEl.classList.remove('skeleton');

  if (pro.verified) document.getElementById('pro-verified').classList.remove('hidden');
  
  const categoryEl = document.getElementById('pro-category');
  if (categoryEl) {
    categoryEl.textContent = pro.categoryName;
    categoryEl.classList.remove('skeleton');
  }

  document.getElementById('pro-location').innerHTML = `<i data-lucide="map-pin" class="icon-sm"></i> ${pro.location}`;
  document.getElementById('pro-rating-summary').innerHTML = `<i data-lucide="star" class="icon-sm" style="fill:currentColor"></i> ${pro.rating.toFixed(1)} (${pro.reviewCount} reviews)`;
  
  // Stats
  document.getElementById('pro-jobs').textContent = pro.completedJobs + '+';
  document.getElementById('pro-exp').textContent = pro.yearsExperience;
  document.getElementById('pro-rate').textContent = pro.hourlyRate;
  
  // Details
  const bioEl = document.getElementById('pro-bio');
  bioEl.textContent = pro.bio;
  bioEl.classList.remove('skeleton');
  
  // Skills
  const skillsEl = document.getElementById('pro-skills');
  const skillsMarkup = pro.skills.map(s => `<span class="skill-chip">${s}</span>`).join('');
  skillsEl.innerHTML = skillsMarkup;
  skillsEl.classList.remove('skeleton');
  
  // Gallery
  const gallerySection = document.getElementById('gallery-section');
  if (pro.gallery && pro.gallery.length > 0) {
    const galleryMarkup = pro.gallery.map(img => `<img src="${img}" alt="Past work" class="gallery-img" loading="lazy">`).join('');
    document.getElementById('pro-gallery').innerHTML = galleryMarkup;
  } else {
    gallerySection.classList.add('hidden');
  }

  // Reviews
  document.getElementById('review-count').textContent = pro.reviews.length;
  if (pro.reviews && pro.reviews.length > 0) {
    const reviewsMarkup = pro.reviews.map(r => `
      <div class="review-item">
        <div class="review-header">
          <div class="font-medium">${r.user}</div>
          <div class="text-sm text-secondary">${r.date}</div>
        </div>
        <div class="rating-stars mb-2">
          ${Array(5).fill(0).map((_, i) => `<i data-lucide="star" class="icon-sm ${i < r.rating ? 'text-amber' : 'text-muted'}" ${i < r.rating ? 'style="fill:currentColor"' : ''}></i>`).join('')}
        </div>
        <p class="text-secondary text-sm">${r.comment}</p>
      </div>
    `).join('');
    document.getElementById('pro-reviews').innerHTML = reviewsMarkup;
  } else {
    document.getElementById('pro-reviews').innerHTML = '<p class="text-secondary">No reviews yet.</p>';
  }

  // Sidebar
  document.getElementById('sidebar-rate').textContent = pro.hourlyRate;
  document.getElementById('pro-availability').textContent = pro.availability;
  document.getElementById('pro-response').textContent = pro.responseTime;
  
  // Document Title
  document.title = `${pro.name} - ${pro.categoryName} | BlueCollar Connect`;
  
  if (window.lucide) window.lucide.createIcons();

  // Modal Logic (with Accessibility)
  const modal = document.getElementById('booking-modal');
  const bookBtn = document.getElementById('book-now-btn');
  const closeBtn = document.querySelector('.close-modal');
  const confirmBtn = document.getElementById('confirm-booking-btn');
  let previouslyFocusedElement = null;

  function openModal() {
    previouslyFocusedElement = document.activeElement;
    modal.classList.remove('hidden');
    // Set focus to the first input field
    const firstInput = modal.querySelector('input, select, textarea, button');
    if (firstInput) firstInput.focus();
    
    // Trap Focus
    modal.addEventListener('keydown', handleTrapFocus);
    document.addEventListener('keydown', handleEscape);
  }

  function closeModal() {
    modal.classList.add('hidden');
    if (previouslyFocusedElement) previouslyFocusedElement.focus();
    modal.removeEventListener('keydown', handleTrapFocus);
    document.removeEventListener('keydown', handleEscape);
  }

  function handleTrapFocus(e) {
    if (e.key !== 'Tab') return;

    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) { // Shift + Tab
      if (document.activeElement === firstFocusableElement) {
        lastFocusableElement.focus();
        e.preventDefault();
      }
    } else { // Tab
      if (document.activeElement === lastFocusableElement) {
        firstFocusableElement.focus();
        e.preventDefault();
      }
    }
  }

  function handleEscape(e) {
    if (e.key === 'Escape') closeModal();
  }

  bookBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  confirmBtn.addEventListener('click', () => {
    alert(`Booking confirmed for ${pro.name}! We will notify you shortly.`);
    closeModal();
  });
}
