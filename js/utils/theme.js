// js/utils/theme.js

export function initThemeToggle() {
  const dropdownContainers = document.querySelectorAll('.theme-dropdown-container');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  
  function getSystemTheme() {
    return mediaQuery.matches ? 'light' : 'dark';
  }

  function applyTheme(mode) {
    const themeToApply = mode === 'system' ? getSystemTheme() : mode;
    document.documentElement.setAttribute('data-theme', themeToApply);
    updateDropdownUI(mode);
  }

  // Initial setup based on localStorage
  let currentMode = localStorage.getItem('theme') || 'system';
  applyTheme(currentMode);

  // Listen for system changes
  mediaQuery.addEventListener('change', () => {
    if (currentMode === 'system') {
      applyTheme('system');
    }
  });

  // Setup event listeners for all dropdowns (desktop and mobile)
  dropdownContainers.forEach(container => {
    const toggleBtn = container.querySelector('.theme-toggle');
    const options = container.querySelectorAll('.theme-option');

    // Toggle dropdown open/close
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other dropdowns first
      dropdownContainers.forEach(c => {
        if (c !== container) {
          c.classList.remove('open');
          c.querySelector('.theme-toggle').setAttribute('aria-expanded', 'false');
        }
      });
      
      const isOpen = container.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', isOpen);
    });

    // Handle option selection
    options.forEach(option => {
      option.addEventListener('click', () => {
        const selectedMode = option.getAttribute('data-theme-value');
        
        currentMode = selectedMode;
        
        if (currentMode === 'system') {
          localStorage.removeItem('theme');
        } else {
          localStorage.setItem('theme', currentMode);
        }
        
        applyTheme(currentMode);
        
        // Close dropdown
        container.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-dropdown-container')) {
      dropdownContainers.forEach(container => {
        container.classList.remove('open');
        const toggleBtn = container.querySelector('.theme-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      });
    }
  });
}

function updateDropdownUI(activeMode) {
  const dropdownContainers = document.querySelectorAll('.theme-dropdown-container');
  
  dropdownContainers.forEach(container => {
    const toggleBtn = container.querySelector('.theme-toggle');
    
    // Update main toggle button icon (remove old icon/svg, insert new i tag)
    if (toggleBtn) {
      const oldIcon = toggleBtn.querySelector('i, svg');
      if (oldIcon) oldIcon.remove();

      const newIcon = document.createElement('i');
      const span = toggleBtn.querySelector('span'); // For mobile menu text
      
      if (activeMode === 'system') {
        newIcon.setAttribute('data-lucide', 'monitor');
        if (span) span.textContent = 'System Theme';
      } else if (activeMode === 'light') {
        newIcon.setAttribute('data-lucide', 'sun');
        if (span) span.textContent = 'Light Theme';
      } else {
        newIcon.setAttribute('data-lucide', 'moon');
        if (span) span.textContent = 'Dark Theme';
      }
      
      toggleBtn.insertBefore(newIcon, toggleBtn.firstChild);
    }
    
    // Highlight the active option in the dropdown
    const options = container.querySelectorAll('.theme-option');
    options.forEach(option => {
      if (option.getAttribute('data-theme-value') === activeMode) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });
  });
  
  // Re-initialize lucide icons for the newly injected <i> tags
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
