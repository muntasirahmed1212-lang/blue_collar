// js/app.js
import { initHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { initGlobalSearch } from './components/searchBar.js';
import { initModals } from './components/modal.js';
import { initScrollAnimations, initPageTransitions } from './utils/animations.js';
import { initThemeToggle } from './utils/theme.js';
import { initLocation } from './components/location.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Global UI Components
  initPageTransitions();
  initThemeToggle();
  initHeader();
  initLocation();
  renderFooter();
  initGlobalSearch();
  initModals();
  initScrollAnimations();
  
  // 2. Routing (Pseudo-routing based on path)
  const path = window.location.pathname;
  
  if (path === '/' || path.endsWith('index.html')) {
    import('./pages/home.js').then(module => {
      module.initHome();
      // Re-initialize icons for dynamically injected content
      if (window.lucide) window.lucide.createIcons();
    });
  } else if (path.includes('services.html')) {
    import('./pages/services.js').then(module => module.initServices());
  } else if (path.includes('category.html')) {
    import('./pages/category.js').then(module => module.initCategory());
  } else if (path.includes('professional.html')) {
    import('./pages/professional.js').then(module => module.initProfessional());
  }
  
  // Render static icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
