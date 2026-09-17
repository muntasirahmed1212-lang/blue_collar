// js/components/header.js
export function initHeader() {
  const header = document.querySelector('header');
  if (!header) return;

  // Handle scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Handle mobile menu
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      
      // Toggle icon between menu and close
      const icon = mobileMenuBtn.querySelector('i');
      if (icon) {
        if (isOpen) {
          icon.setAttribute('data-lucide', 'x');
        } else {
          icon.setAttribute('data-lucide', 'menu');
        }
        // Re-render the specific icon if lucide is available
        if (window.lucide) {
          lucide.createIcons({
            attrs: {
              class: 'icon'
            },
            nameAttr: 'data-lucide',
            icons: {
              Menu: window.lucide.icons.Menu,
              X: window.lucide.icons.X
            },
            root: mobileMenuBtn
          });
        }
      }
      
      // Prevent body scrolling when menu is open
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  // Set active link based on current path
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    // Normalize href
    const normalizedHref = href.replace('./', '/').replace('index.html', '');
    const normalizedPath = currentPath.replace('/index.html', '/');
    
    if (normalizedHref !== '/' && normalizedPath.includes(normalizedHref)) {
      link.classList.add('active');
    } else if ((normalizedHref === '/' || normalizedHref === '') && (normalizedPath === '/' || normalizedPath === '')) {
      link.classList.add('active');
    }
  });
}
