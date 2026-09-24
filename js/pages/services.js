// js/pages/services.js
import { categories } from '../data/categories.js';
import { observeNewElements } from '../utils/animations.js';

export function initServices() {
  const grid = document.getElementById('all-categories-grid');
  const searchInput = document.getElementById('category-filter');
  const noResults = document.getElementById('no-results');
  
  if (!grid) return;

  function renderGrid(data) {
    if (data.length === 0) {
      grid.innerHTML = '';
      noResults.classList.remove('hidden');
      return;
    }
    
    noResults.classList.add('hidden');
    const markup = data.map(cat => `
      <a href="/category.html?cat=${cat.slug}" class="service-card-full" data-animate="fade-up">
        <div class="service-icon-box">
          <i data-lucide="${cat.icon}"></i>
        </div>
        <h3>${cat.name}</h3>
        <p>${cat.description}</p>
        
        <div class="service-popular">
          <div class="service-popular-title">Popular Services</div>
          <div class="service-popular-list">
            ${cat.popularServices.map(service => `<span class="service-popular-tag">${service}</span>`).join('')}
          </div>
        </div>
      </a>
    `).join('');

    grid.innerHTML = markup;
    if (window.lucide) window.lucide.createIcons();
    observeNewElements(grid);
  }

  // Initial render
  renderGrid(categories);

  // Search filter
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = categories.filter(cat => 
        cat.name.toLowerCase().includes(term) || 
        cat.description.toLowerCase().includes(term) ||
        cat.popularServices.some(s => s.toLowerCase().includes(term))
      );
      renderGrid(filtered);
    });
  }
}
