// js/utils/animations.js
export function initScrollAnimations() {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const elementsToAnimate = document.querySelectorAll('.category-card, .service-card, .step-card, .feature-item, .pro-card');

  // Staggered reveal for grids
  const gridContainers = document.querySelectorAll('.category-grid, .services-grid, .steps-grid, .features-grid, .pro-grid');
  
  gridContainers.forEach(grid => {
    const children = Array.from(grid.children).filter(child => 
      child.classList.contains('category-card') || 
      child.classList.contains('service-card') || 
      child.classList.contains('step-card') ||
      child.classList.contains('feature-item') ||
      child.classList.contains('pro-card')
    );
    
    children.forEach((child, index) => {
      // 50ms stagger per item
      child.style.transitionDelay = `${index * 50}ms`;
    });
  });

  // Initial state: hide elements slightly below
  elementsToAnimate.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.6s ease-out, transform 0.6s ease-out`;
    // preserve delay set above
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        
        // Remove delay after animation completes so hover effects aren't delayed
        setTimeout(() => {
          entry.target.style.transitionDelay = '0ms';
        }, 600);
        
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  elementsToAnimate.forEach(el => observer.observe(el));

  initCounterAnimation();
}

function initCounterAnimation() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const statNumbers = document.querySelectorAll('.stat-number');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateValue(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(stat => observer.observe(stat));
}

function animateValue(obj) {
  const text = obj.innerText;
  // Extract number and suffix (e.g. "500+" -> num: 500, suffix: "+", "4.8" -> num: 4.8)
  const match = text.match(/([\d.]+)(.*)/);
  if (!match) return;
  
  const end = parseFloat(match[1]);
  const suffix = match[2] || '';
  const isFloat = text.includes('.');
  
  let startTimestamp = null;
  const duration = 1500; // 1.5 seconds

  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    
    // Ease out quad
    const easeProgress = progress * (2 - progress);
    const current = easeProgress * end;
    
    obj.innerText = (isFloat ? current.toFixed(1) : Math.floor(current)) + suffix;
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.innerText = text; // Ensure exact final value
    }
  };
  window.requestAnimationFrame(step);
}

export function initPageTransitions() {
  // Skip if browser supports native cross-document view transitions
  if ('onpagereveal' in window) return;

  // Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetUrl = link.getAttribute('href');
      if (!targetUrl || targetUrl.startsWith('#') || targetUrl.startsWith('http') ||
          targetUrl.startsWith('mailto:') || targetUrl.startsWith('tel:') ||
          link.target === '_blank') return;

      e.preventDefault();
      document.body.classList.add('page-exit');
      setTimeout(() => { window.location.href = targetUrl; }, 150);
    });
  });
}
