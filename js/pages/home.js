// js/pages/home.js
import { categories } from '../data/categories.js';
import { getFeaturedProfessionals } from '../data/professionals.js';
import { observeNewElements } from '../utils/animations.js';
import { jobService } from '../services/jobService.js';

/**
 * Initializes homepage sections and event subscriptions.
 */
export function initHome() {
  renderCategories();
  renderRecentJobs();
  renderFeaturedPros();

  // Reactive subscription: auto-refresh preview whenever a job is created via the modal
  document.addEventListener('job:created', () => {
    renderRecentJobs();
  });
}

/**
 * Renders the top categories on the homepage.
 */
function renderCategories() {
  const grid = document.getElementById('home-categories-grid');
  if (!grid) return;

  const homeCategories = categories.slice(0, 8);
  
  const markup = homeCategories.map(cat => `
    <a href="/category.html?cat=${cat.slug}" class="category-card card" data-animate="fade-up" style="text-decoration: none; color: inherit;">
      <div class="category-icon-wrapper">
        <i data-lucide="${cat.icon}"></i>
      </div>
      <h3>${cat.name}</h3>
      <span>${cat.serviceCount} Pros <i data-lucide="chevron-right" class="icon-sm"></i></span>
    </a>
  `).join('');

  grid.innerHTML = markup;
  if (window.lucide) window.lucide.createIcons();
  observeNewElements(grid);
}

/**
 * Renders the Recent Jobs preview section (4 to 6 latest open job postings).
 */
export async function renderRecentJobs() {
  const grid = document.getElementById('recent-jobs-grid');
  if (!grid) return;

  try {
    const res = await jobService.getJobs({ limit: 6, sort: 'newest', status: 'open' });
    const jobs = (res && res.success && Array.isArray(res.jobs)) ? res.jobs : [];

    if (jobs.length === 0) {
      grid.innerHTML = `
        <div class="empty-jobs-state card" style="grid-column: 1 / -1; padding: var(--spacing-8); text-align: center;">
          <div style="display: inline-flex; width: 48px; height: 48px; border-radius: var(--radius-full); background: var(--surface-elevated); align-items: center; justify-content: center; color: var(--text-muted); margin-bottom: var(--spacing-3);">
            <i data-lucide="briefcase" class="icon-md"></i>
          </div>
          <h3 style="font-size: var(--text-base); font-weight: 600; margin-bottom: var(--spacing-1);">No Open Job Postings Yet</h3>
          <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--spacing-4);">Be the first homeowner or business to post a job request.</p>
          <a href="./jobs.html" class="btn btn-outline btn-sm">Explore Job Board</a>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const markup = jobs.map(job => createRecentJobCard(job)).join('');
    grid.innerHTML = markup;

    if (window.lucide) window.lucide.createIcons();
    observeNewElements(grid);
  } catch (err) {
    console.error('Error fetching recent jobs for homepage preview:', err);
    grid.innerHTML = `
      <div class="empty-jobs-state card" style="grid-column: 1 / -1; padding: var(--spacing-6); text-align: center;">
        <p style="font-size: var(--text-sm); color: var(--text-secondary);">Unable to load recent jobs right now. Please view our <a href="./jobs.html" style="color: var(--accent-blue);">Jobs page</a>.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Creates HTML markup for an individual job preview card.
 * @param {Object} job - Job record
 * @returns {string} HTML markup string
 */
function createRecentJobCard(job) {
  const catInfo = getCategoryInfo(job);
  const urgency = (job.urgency || 'medium').toLowerCase();
  const urgencyIconMap = {
    urgent: 'alert-triangle',
    high: 'alert-circle',
    medium: 'clock',
    low: 'check-circle'
  };
  const urgencyIcon = urgencyIconMap[urgency] || 'clock';
  const relativeTime = formatRelativeTime(job.createdAt);
  const safeTitle = escapeHTML(job.title || 'Untitled Job');
  const safeDesc = escapeHTML(truncate(job.description || '', 100));
  const safeLocation = escapeHTML(job.location || 'Location not specified');
  const safeBudget = escapeHTML(job.budget || 'Negotiable');
  const safeCustomer = escapeHTML(job.customerName || 'Customer');
  const jobLink = `./jobs.html?id=${encodeURIComponent(job.id)}`;

  return `
    <div class="job-card card" data-animate="fade-up">
      <div class="job-card-header">
        <div class="job-card-badges">
          <span class="job-category-tag">
            <i data-lucide="${catInfo.icon}"></i>
            <span>${escapeHTML(catInfo.name)}</span>
          </span>
          <span class="badge-urgency badge-urgency-${urgency}">
            <i data-lucide="${urgencyIcon}"></i>
            <span>${escapeHTML(urgency)}</span>
          </span>
        </div>
        <span class="job-posted-time">
          <i data-lucide="clock"></i>
          <span>${relativeTime}</span>
        </span>
      </div>

      <div class="job-card-body">
        <h3 class="job-card-title">
          <a href="${jobLink}">${safeTitle}</a>
        </h3>
        <p class="job-card-desc">${safeDesc}</p>
        
        <div class="job-card-meta">
          <div class="job-meta-item">
            <i data-lucide="map-pin"></i>
            <span>${safeLocation}</span>
          </div>
          <div class="job-meta-item job-budget-item">
            <i data-lucide="dollar-sign"></i>
            <span>${safeBudget}</span>
          </div>
        </div>
      </div>

      <div class="job-card-footer">
        <div class="job-poster-info">
          <div class="job-poster-avatar">
            <i data-lucide="user"></i>
          </div>
          <span class="job-poster-name">Posted by <strong>${safeCustomer}</strong></span>
        </div>
        <a href="${jobLink}" class="btn btn-outline btn-sm job-action-btn">
          View Details <i data-lucide="chevron-right" class="icon-sm"></i>
        </a>
      </div>
    </div>
  `;
}

/**
 * Resolves category name and Lucide icon for a given job.
 * @param {Object} job 
 * @returns {{ name: string, icon: string }}
 */
function getCategoryInfo(job) {
  const cat = categories.find(c => 
    c.id === job.category || 
    c.slug === job.categorySlug || 
    c.slug === job.category ||
    c.name.toLowerCase() === (job.categoryName || '').toLowerCase()
  );
  return {
    name: job.categoryName || (cat ? cat.name : 'General Service'),
    icon: (cat && cat.icon) ? cat.icon : 'briefcase'
  };
}

/**
 * Converts ISO date string into human-readable relative time string.
 * @param {string} dateString 
 * @returns {string}
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (isNaN(diffSec) || diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins} ${mins === 1 ? 'min' : 'mins'} ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trim() + '...';
}

function renderFeaturedPros() {
  const grid = document.getElementById('featured-pros-grid');
  if (!grid) return;

  const featuredPros = getFeaturedProfessionals(6);
  
  const markup = featuredPros.map(pro => `
    <div class="pro-card card" data-animate="fade-up">
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
  if (window.lucide) window.lucide.createIcons();
  observeNewElements(grid);
}
