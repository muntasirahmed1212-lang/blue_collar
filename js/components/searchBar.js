// js/components/searchBar.js
export function initGlobalSearch() {
  const searchInputs = document.querySelectorAll('#service-search, .filter-input');
  const searchButtons = document.querySelectorAll('.search-btn');

  searchButtons.forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const container = btn.closest('.search-container') || btn.closest('.filters-container') || btn.parentElement;
      const input = container.querySelector('input');
      if (input && input.value) {
        const query = encodeURIComponent(input.value.trim());
        // Redirect to services page with search query
        window.location.href = `./services.html?search=${query}`;
      }
    });
  });

  // Handle enter key
  searchInputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = encodeURIComponent(input.value.trim());
        window.location.href = `./services.html?search=${query}`;
      }
    });
  });
}
