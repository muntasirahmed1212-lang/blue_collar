// js/utils/animations.js - Native Scroll-Triggered Animation Engine

let globalObserver = null;

function createGlobalObserver() {
  if (globalObserver) return;

  globalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        target.classList.add('is-visible');

        // Reset transitionDelay after animation to ensure snappy hover effects
        const resetDelay = () => {
          target.style.transitionDelay = '0ms';
        };

        const handleTransitionEnd = (e) => {
          if (e.target === target && (e.propertyName === 'transform' || e.propertyName === 'opacity')) {
            resetDelay();
            target.removeEventListener('transitionend', handleTransitionEnd);
          }
        };

        target.addEventListener('transitionend', handleTransitionEnd);
        setTimeout(() => {
          resetDelay();
          target.removeEventListener('transitionend', handleTransitionEnd);
        }, 800);

        globalObserver.unobserve(target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });
}

export function initScrollAnimations() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.querySelectorAll('[data-animate], [data-char-reveal]').forEach(el => {
      el.classList.add('is-visible');
    });
    return;
  }

  createGlobalObserver();
  initCharReveal(document);
  observeNewElements(document);
  initHeroParallax();
  initCounterAnimation();
}

export function observeNewElements(container = document) {
  if (!container) return;
  const root = container || document;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    const elements = root.querySelectorAll
      ? Array.from(root.querySelectorAll('[data-animate], [data-char-reveal]'))
      : [];
    if (root instanceof Element && (root.hasAttribute('data-animate') || root.hasAttribute('data-char-reveal'))) {
      elements.push(root);
    }
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  // Tokenize any untokenized char reveal elements in this container
  initCharReveal(root);

  // Stagger grid containers
  const gridSelectors = '.categories-grid, .featured-pros-grid, .all-categories-grid, .steps-grid, .features-grid, .profile-stats, .gallery-grid, .reviews-list, .stats-grid, [style*="grid"]';
  const dynamicGridIds = ['home-categories-grid', 'featured-pros-grid', 'all-categories-grid', 'pros-grid', 'pro-gallery', 'pro-reviews'];

  const grids = [];
  if (root instanceof Element && (root.matches(gridSelectors) || dynamicGridIds.includes(root.id))) {
    grids.push(root);
  }
  if (root.querySelectorAll) {
    grids.push(...root.querySelectorAll(gridSelectors));
    dynamicGridIds.forEach(id => {
      const el = root.querySelector ? root.querySelector(`#${id}`) : null;
      if (el && !grids.includes(el)) grids.push(el);
    });
  }

  grids.forEach(grid => {
    const children = Array.from(grid.children).filter(child =>
      child.hasAttribute('data-animate') ||
      child.classList.contains('category-card') ||
      child.classList.contains('service-card') ||
      child.classList.contains('service-card-full') ||
      child.classList.contains('step-card') ||
      child.classList.contains('feature-item') ||
      child.classList.contains('pro-card') ||
      child.classList.contains('review-item') ||
      child.classList.contains('gallery-img') ||
      child.classList.contains('stat-item') ||
      child.classList.contains('stat-box')
    );

    children.forEach((child, index) => {
      if (!child.hasAttribute('data-animate')) {
        child.setAttribute('data-animate', 'fade-up');
      }
      if (!child.style.transitionDelay) {
        child.style.transitionDelay = `${(index % 8) * 60}ms`;
      }
    });
  });

  if (!globalObserver) {
    createGlobalObserver();
  }

  // Query all animatable elements in container
  const elements = root.querySelectorAll
    ? Array.from(root.querySelectorAll('[data-animate]:not(.is-visible), [data-char-reveal]:not(.is-visible)'))
    : [];

  if (root instanceof Element && (root.hasAttribute('data-animate') || root.hasAttribute('data-char-reveal')) && !root.classList.contains('is-visible')) {
    elements.push(root);
  }

  elements.forEach(el => globalObserver.observe(el));
}

export function initHeroParallax() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const hero = document.querySelector('.hero-section');
  if (!hero) return;

  let ticking = false;

  function updateParallax() {
    const scrollY = window.scrollY || window.pageYOffset;
    const heroHeight = hero.offsetHeight || 500;

    if (scrollY > heroHeight * 1.5) {
      hero.style.opacity = '0';
      hero.style.transform = `translate3d(0, ${(scrollY * 0.35).toFixed(1)}px, 0) scale(0.920)`;
      return;
    }

    const progress = Math.min(Math.max(scrollY / heroHeight, 0), 1);
    const opacity = Math.max(0, 1 - progress * 1.25);
    const translateY = scrollY * 0.35;
    const scale = 1 - progress * 0.08;

    hero.style.opacity = opacity.toFixed(3);
    hero.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateParallax();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  updateParallax();
}

export function initCharReveal(container = document) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;
  if (!container) return;

  const targets = [];
  if (container instanceof Element && container.hasAttribute('data-char-reveal')) {
    targets.push(container);
  }
  if (container.querySelectorAll) {
    targets.push(...container.querySelectorAll('[data-char-reveal]'));
  }

  targets.forEach(heading => {
    if (heading.dataset.charSplit === 'true') return;

    const originalText = heading.textContent.trim().replace(/\s+/g, ' ');
    if (!heading.getAttribute('aria-label')) {
      heading.setAttribute('aria-label', originalText);
    }

    let charCounter = 0;
    const getDelay = () => {
      const delay = charCounter * 30;
      charCounter++;
      return delay;
    };

    function tokenizeNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const fragment = document.createDocumentFragment();
        const tokens = text.match(/\S+|\s+/g) || [];

        for (const token of tokens) {
          if (/^\s+$/.test(token)) {
            fragment.appendChild(document.createTextNode(token));
          } else {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'char-word';
            for (const char of token) {
              const charSpan = document.createElement('span');
              charSpan.className = 'char';
              charSpan.style.transitionDelay = `${getDelay()}ms`;
              charSpan.textContent = char;
              wordSpan.appendChild(charSpan);
            }
            fragment.appendChild(wordSpan);
          }
        }
        return fragment;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName.toLowerCase() === 'br') {
          return node.cloneNode();
        }
        const clone = node.cloneNode(false);
        for (const child of Array.from(node.childNodes)) {
          clone.appendChild(tokenizeNode(child));
        }
        return clone;
      }
      return node.cloneNode(true);
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'char-reveal-wrapper';
    wrapper.setAttribute('aria-hidden', 'true');

    for (const child of Array.from(heading.childNodes)) {
      wrapper.appendChild(tokenizeNode(child));
    }

    heading.innerHTML = '';
    heading.appendChild(wrapper);
    heading.dataset.charSplit = 'true';

    if (!globalObserver) {
      createGlobalObserver();
    }
    if (!heading.classList.contains('is-visible')) {
      globalObserver.observe(heading);
    }
  });
}

export function initCounterAnimation() {
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
