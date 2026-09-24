// js/components/footer.js
import { showToast } from '../utils/helpers.js';

export function renderFooter() {
  const footerMarkup = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="./index.html" class="footer-logo">
            <i data-lucide="wrench"></i>
            <span>BlueCollar<br><span class="text-primary">Connect</span></span>
          </a>
          <p class="footer-desc">
            Connecting you with skilled, verified experts for electrical, plumbing, home repair, and more.
          </p>
          <div class="social-links mt-4">
            <a href="#" class="social-link" aria-label="Facebook"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-facebook"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a>
            <a href="#" class="social-link" aria-label="Twitter"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-twitter"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></a>
            <a href="#" class="social-link" aria-label="Instagram"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-instagram"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg></a>
            <a href="#" class="social-link" aria-label="LinkedIn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-linkedin"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg></a>
          </div>
        </div>

        <div>
          <h4 class="footer-heading">Services</h4>
          <ul class="footer-links">
            <li><a href="./category.html?cat=electrician" class="footer-link">Electricians</a></li>
            <li><a href="./category.html?cat=plumber" class="footer-link">Plumbers</a></li>
            <li><a href="./category.html?cat=carpenter" class="footer-link">Carpenters</a></li>
            <li><a href="./category.html?cat=painter" class="footer-link">Painters</a></li>
            <li><a href="./services.html" class="footer-link">View All Services</a></li>
          </ul>
        </div>

        <div>
          <h4 class="footer-heading">Platform</h4>
          <ul class="footer-links">
            <li><a href="./how-it-works.html" class="footer-link">How It Works</a></li>
            <li><a href="./about.html" class="footer-link">About Us</a></li>
            <li><a href="#" class="footer-link coming-soon-link">Trust & Safety</a></li>
            <li><a href="#" class="footer-link coming-soon-link">Register as a Pro</a></li>
          </ul>
        </div>

        <div>
          <h4 class="footer-heading">Contact</h4>
          <ul class="footer-links">
            <li><a href="mailto:support@bluecollarconnect.com" class="footer-link">support@bluecollarconnect.com</a></li>
            <li><a href="tel:+918001234567" class="footer-link">1800-123-4567</a></li>
            <li class="footer-link">Mon-Sat, 9AM-8PM (IST)</li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="copyright">
          &copy; ${new Date().getFullYear()} BlueCollar Connect. All rights reserved.
        </div>
        <div class="footer-legal-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Cookie Policy</a>
        </div>
      </div>
    </div>
  `;

  const footerEl = document.querySelector('footer');
  if (footerEl) {
    footerEl.innerHTML = footerMarkup;
    
    // Initialize icons in the newly rendered footer if lucide is available
    if (window.lucide) {
      lucide.createIcons({
        attrs: { class: 'icon' },
        nameAttr: 'data-lucide',
        root: footerEl
      });
    }

    const comingSoonLinks = footerEl.querySelectorAll('.coming-soon-link');
    comingSoonLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showToast("Page coming soon!", "info");
      });
    });
  }
}
