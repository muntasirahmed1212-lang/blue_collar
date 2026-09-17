// js/pages/home.js
import { categories } from '../data/categories.js';
import { getFeaturedProfessionals } from '../data/professionals.js';

export function initHome() {
  renderCategories();
  renderFeaturedPros();
}

function renderCategories() {
  const grid = document.getElementById('home-categories-grid');
  if (!grid) return;

  // Render first 8 categories on homepage
  const homeCategories = categories.slice(0, 8);
  
  const markup = homeCategories.map(cat => `
    <a href="/category.html?cat=${cat.slug}" class="category-card card" style="text-decoration: none; color: inherit;">
      <div class="category-icon-wrapper">
        <i data-lucide="${cat.icon}"></i>
      </div>
      <h3>${cat.name}</h3>
      <span>${cat.serviceCount} Pros <i data-lucide="chevron-right" class="icon-sm"></i></span>
    </a>
  `).join('');

  grid.innerHTML = markup;
}

function renderFeaturedPros() {
  const grid = document.getElementById('featured-pros-grid');
  if (!grid) return;

  const featuredPros = getFeaturedProfessionals(6);
  
  const markup = featuredPros.map(pro => `
    <div class="pro-card card">
      <div class="pro-card-header">
        <img src="${pro.photo}" alt="${pro.name}" class="pro-avatar" loading="lazy">
        <div class="pro-info">
          <h3>${pro.name} ${pro.verified ? '<i data-lucide="badge-check" class="icon-sm text-emerald"></i>' : ''}</h3>
          <div class="pro-category">${pro.categoryName} • ${pro.location}</div>
          <div class="pro-rating">
            <span class="rating-value">${pro.rating.toFixed(1)}</span>
            <div class="rating-stars">
              <i data-lucide="star"></i>
            </div>
            <span class="text-secondary">(${pro.reviewCount} reviews)</span>
          </div>
        </div>
      </div>
      <div class="pro-card-body">
        <p class="pro-bio">${pro.bio}</p>
        <div class="pro-skills">
          ${pro.skills.slice(0, 3).map(skill => `<span class="skill-chip">${skill}</span>`).join('')}
          ${pro.skills.length > 3 ? `<span class="skill-chip">+${pro.skills.length - 3}</span>` : ''}
        </div>
      </div>
      <div class="pro-card-footer">
        <button class="btn btn-outline" onclick="window.location.href='/professional.html?id=${pro.id}'">View Profile</button>
        <button class="btn btn-primary" onclick="alert('Booking modal would open here')">Book Now</button>
      </div>
    </div>
  `).join('');

  grid.innerHTML = markup;
}
