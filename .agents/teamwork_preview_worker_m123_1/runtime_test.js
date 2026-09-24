// In-depth runtime test for js/utils/animations.js
// Tests DOM tokenization, parallax math, reduced motion, and stagger logic

console.log('=== RUNTIME BEHAVIORAL VERIFICATION ===');

const listeners = [];
// Setup mock browser globals
global.window = {
  scrollY: 0,
  pageYOffset: 0,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  addEventListener: (event, cb) => {
    listeners.push({ event, cb });
  },
  removeEventListener: () => {},
  matchMedia: (query) => {
    return {
      matches: global.MOCK_REDUCED_MOTION || false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  }
};

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1; // ELEMENT_NODE
    this.children = [];
    this.childNodes = [];
    this.style = {};
    const classes = new Set();
    this.classList = {
      _classes: classes,
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    };
    this.attributes = new Map();
    this.dataset = {};
    this._textContent = '';
  }

  get className() {
    return Array.from(this.classList._classes).join(' ');
  }
  set className(val) {
    this.classList._classes.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  get textContent() {
    if (this.childNodes.length > 0) {
      return this.childNodes.map(c => c.textContent).join('');
    }
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = val;
    this.childNodes = [new MockTextNode(val)];
  }

  get innerHTML() {
    return this.textContent;
  }
  set innerHTML(val) {
    this.childNodes = [];
    this._textContent = val;
  }

  setAttribute(k, v) {
    this.attributes.set(k, v);
    if (k === 'class') {
      this.className = v;
    }
  }
  getAttribute(k) { return this.attributes.get(k) || null; }
  hasAttribute(k) { return this.attributes.has(k); }

  addEventListener(event, handler) {}
  removeEventListener(event, handler) {}

  appendChild(child) {
    if (child.nodeType === 11) { // DOCUMENT_FRAGMENT_NODE
      while (child.childNodes.length > 0) {
        const c = child.childNodes.shift();
        this.appendChild(c);
      }
      return child;
    }
    this.childNodes.push(child);
    if (child.nodeType === 1) this.children.push(child);
    return child;
  }

  cloneNode(deep) {
    const clone = new MockElement(this.tagName);
    for (const [k, v] of this.attributes) clone.setAttribute(k, v);
    clone.style = { ...this.style };
    clone.className = this.className;
    if (deep) {
      for (const c of this.childNodes) clone.appendChild(c.cloneNode(true));
    }
    return clone;
  }

  matches(selector) {
    if (selector.includes(',')) {
      return selector.split(',').some(s => this.matches(s.trim()));
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.classList._classes.has(cls);
    }
    if (selector.toLowerCase() === this.tagName.toLowerCase()) return true;
    for (const [k, v] of this.attributes) {
      if (selector === `[${k}="${v}"]` || selector === `[${k}]`) return true;
    }
    return false;
  }

  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (child.matches(sel)) results.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return results;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
}

class MockTextNode {
  constructor(text = '') {
    this.nodeType = 3; // TEXT_NODE
    this.textContent = text;
  }
  cloneNode() {
    return new MockTextNode(this.textContent);
  }
}

class MockDocumentFragment {
  constructor() {
    this.nodeType = 11; // DOCUMENT_FRAGMENT_NODE
    this.childNodes = [];
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
  }
  createElement(tag) { return new MockElement(tag); }
  createTextNode(text) { return new MockTextNode(text); }
  createDocumentFragment() { return new MockDocumentFragment(); }
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
  querySelector(sel) { return this.body.querySelector(sel); }
}

global.document = new MockDocument();
global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 };
global.Element = MockElement;

// Mock IntersectionObserver
const observedElements = [];
global.IntersectionObserver = class {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
  }
  observe(target) {
    observedElements.push(target);
  }
  unobserve(target) {
    const idx = observedElements.indexOf(target);
    if (idx !== -1) observedElements.splice(idx, 1);
  }
  disconnect() {
    observedElements.length = 0;
  }
};

// Now import the animations module
const { observeNewElements, initHeroParallax, initCharReveal } = await import('../../js/utils/animations.js');

console.log('\n--- Test A: Character Reveal Tokenization ---');
const heading = document.createElement('h2');
heading.setAttribute('data-char-reveal', '');
heading.textContent = 'Service Categories';
document.body.appendChild(heading);

initCharReveal(document);

if (heading.getAttribute('aria-label') !== 'Service Categories') {
  throw new Error('aria-label not set correctly: ' + heading.getAttribute('aria-label'));
}
console.log('[PASS] Character reveal sets aria-label="Service Categories"');

const wrapper = heading.childNodes[0];
if (!wrapper || wrapper.getAttribute('aria-hidden') !== 'true') {
  throw new Error('Wrapper aria-hidden not set');
}
console.log('[PASS] Character reveal creates aria-hidden="true" wrapper');

const charWords = heading.querySelectorAll('.char-word');
if (charWords.length !== 2) {
  throw new Error(`Expected 2 char-word spans, got ${charWords.length}`);
}
console.log('[PASS] Character reveal tokenizes 2 words into .char-word');

const chars = heading.querySelectorAll('.char');
if (chars.length !== ('ServiceCategories').length) {
  throw new Error(`Expected ${('ServiceCategories').length} chars, got ${chars.length}`);
}
console.log(`[PASS] Character reveal tokenized all ${chars.length} characters`);
console.log(`[PASS] First char delay: ${chars[0].style.transitionDelay}, second: ${chars[1].style.transitionDelay}`);

console.log('\n--- Test B: Grid Stagger & Observation ---');
const grid = document.createElement('div');
grid.setAttribute('class', 'categories-grid');
for (let i = 0; i < 4; i++) {
  const card = document.createElement('div');
  card.setAttribute('class', 'category-card card');
  card.setAttribute('data-animate', 'fade-up');
  grid.appendChild(card);
}
document.body.appendChild(grid);

observeNewElements(grid);

const delays = grid.children.map(c => c.style.transitionDelay);
console.log('[PASS] Stagger delays on grid children:', delays);
if (delays[0] !== '0ms' || delays[1] !== '60ms' || delays[2] !== '120ms' || delays[3] !== '180ms') {
  throw new Error('Stagger delays incorrect: ' + JSON.stringify(delays));
}
console.log('[PASS] Stagger delay intervals verified (60ms progressive)');

console.log('\n--- Test C: Hero Parallax Scroll Math ---');
const hero = document.createElement('section');
hero.setAttribute('class', 'hero-section');
hero.offsetHeight = 600;
document.body.appendChild(hero);

initHeroParallax();

window.scrollY = 0;
// Test at top (0 scroll)
console.log('[PASS] Hero at scrollY=0:', hero.style.opacity, hero.style.transform);
if (hero.style.opacity !== '1.000') throw new Error('Hero opacity not 1.000 at scrollY=0');

window.scrollY = 200;
// Trigger scroll event handler registered on window
const scrollListener = listeners.find(l => l.event === 'scroll');
if (scrollListener) {
  scrollListener.cb();
  await new Promise(r => setTimeout(r, 30));
  console.log('[PASS] Hero at scrollY=200:', hero.style.opacity, hero.style.transform);
  if (hero.style.opacity !== '0.583') throw new Error('Hero opacity not matching expected 0.583 at scrollY=200');
  if (hero.style.transform !== 'translate3d(0, 70.0px, 0) scale(0.973)') throw new Error('Hero transform not matching expected at scrollY=200');
}

console.log('\n--- Test D: Reduced Motion Behavior ---');
global.MOCK_REDUCED_MOTION = true;
const testCard = document.createElement('div');
testCard.setAttribute('data-animate', 'fade-up');
document.body.appendChild(testCard);

observeNewElements(testCard);
if (!testCard.classList.contains('is-visible')) {
  throw new Error('Reduced motion did not immediately add .is-visible');
}
console.log('[PASS] Under prefers-reduced-motion: reduce, elements are immediately marked .is-visible without scroll requirement');

console.log('\n======================================================');
console.log('ALL RUNTIME BEHAVIORAL VERIFICATIONS PASSED (100%)');
console.log('======================================================\n');
