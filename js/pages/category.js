// js/pages/category.js
import { getCategoryBySlug } from '../data/categories.js';
import { getProfessionalsByCategory } from '../data/professionals.js';
import { getQueryParams } from '../utils/helpers.js';

export function initCategory() {
  const params = getQueryParams();
  const catSlug = params.cat;
  
  if (!catSlug) {
    window.location.href = '/services.html';
    return;
  }

  const category = getCategoryBySlug(catSlug);
  if (!category) {
    window.location.href = '/services.html';
    return;
  }

  // Update hero section
  document.getElementById('breadcrumb-current').textContent = category.name;
  document.getElementById('category-title').textContent = `${category.name}s`;
  document.getElementById('category-desc').textContent = category.description;
  document.getElementById('category-icon').innerHTML = `<i data-lucide="${category.icon}"></i>`;
  document.title = `${category.name}s | BlueCollar Connect`;
  if (window.lucide) window.lucide.createIcons();

  // Load professionals
  let allPros = getProfessionalsByCategory(category.id);
  
  // Filter state
  let currentFilters = {
    rating: 4.5,
    verified: true,
    availability: 'all',
    sort: 'recommended'
  };

  const grid = document.getElementById('pros-grid');
  const countEl = document.getElementById('results-count');
  const noMessage = document.getElementById('no-pros-message');

  function renderPros(pros) {
    if (pros.length === 0) {
      grid.innerHTML = '';
      noMessage.classList.remove('hidden');
      countEl.textContent = '0 professionals found';
      return;
    }

    noMessage.classList.add('hidden');
    countEl.textContent = `Showing ${pros.length} professional${pros.length > 1 ? 's' : ''}`;

    const markup = pros.map(pro => `
      <div class="pro-card card">
        <div class="pro-card-header">
          <img src="${pro.photo}" alt="${pro.name}" class="pro-avatar" loading="lazy">
          <div class="pro-info">
            <h3>${pro.name} ${pro.verified ? '<i data-lucide="badge-check" class="icon-sm text-emerald"></i>' : ''}</h3>
            <div class="pro-category">₹${pro.hourlyRate}/hr • ${pro.location}</div>
            <div class="pro-rating">
              <span class="rating-value">${pro.rating.toFixed(1)}</span>
              <div class="rating-stars">
                <i data-lucide="star"></i>
              </div>
              <span class="text-secondary">(${pro.reviewCount})</span>
            </div>
          </div>
        </div>
        <div class="pro-card-body">
          <div class="text-sm text-secondary mb-2 flex items-center gap-1">
            <i data-lucide="clock" class="icon-sm"></i> ${pro.availability}
          </div>
          <div class="pro-skills mt-3">
            ${pro.skills.slice(0, 3).map(skill => `<span class="skill-chip">${skill}</span>`).join('')}
          </div>
        </div>
        <div class="pro-card-footer">
          <a href="/professional.html?id=${pro.id}" class="btn btn-outline" style="flex: 1;">View Profile</a>
          <button class="btn btn-primary" onclick="alert('Booking flow triggered')">Book Now</button>
        </div>
      </div>
    `).join('');

    grid.innerHTML = markup;
    if (window.lucide) window.lucide.createIcons();
  }

  function applyFiltersAndSort() {
    let filtered = [...allPros];

    // Filter by rating
    if (currentFilters.rating !== 'all') {
      filtered = filtered.filter(p => p.rating >= parseFloat(currentFilters.rating));
    }

    // Filter by verification
    if (currentFilters.verified) {
      filtered = filtered.filter(p => p.verified);
    }
    
    // Filter by availability
    if (currentFilters.availability !== 'all') {
      filtered = filtered.filter(p => p.availability === currentFilters.availability);
    }

    // Sort
    switch(currentFilters.sort) {
      case 'rating_desc':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'price_asc':
        filtered.sort((a, b) => a.hourlyRate - b.hourlyRate);
        break;
      case 'reviews_desc':
        filtered.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'recommended':
      default:
        // Mock recommended logic (high rating + verified + many reviews)
        filtered.sort((a, b) => {
          const scoreA = (a.verified ? 5 : 0) + a.rating + Math.min(a.reviewCount / 100, 5);
          const scoreB = (b.verified ? 5 : 0) + b.rating + Math.min(b.reviewCount / 100, 5);
          return scoreB - scoreA;
        });
        break;
    }

    renderPros(filtered);
  }

  // Initial render
  applyFiltersAndSort();

  // Event Listeners for Filters
  document.getElementById('apply-filters-btn').addEventListener('click', () => {
    // Rating
    const ratingChecked = document.querySelector('input[name="rating"]:checked');
    currentFilters.rating = ratingChecked ? ratingChecked.value : 'all';
    
    // Verified
    currentFilters.verified = document.getElementById('filter-verified').checked;
    
    // Availability
    currentFilters.availability = document.getElementById('filter-availability').value;
    
    applyFiltersAndSort();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentFilters.sort = e.target.value;
    applyFiltersAndSort();
  });

  const clearFilters = () => {
    document.querySelector('input[name="rating"][value="all"]').checked = true;
    document.getElementById('filter-verified').checked = false;
    document.getElementById('filter-availability').value = 'all';
    
    currentFilters = { rating: 'all', verified: false, availability: 'all', sort: currentFilters.sort };
    applyFiltersAndSort();
  };

  document.getElementById('reset-filters').addEventListener('click', clearFilters);
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
}
