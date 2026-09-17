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
            <a href="#" class="social-link" aria-label="Facebook"><i data-lucide="facebook"></i></a>
            <a href="#" class="social-link" aria-label="Twitter"><i data-lucide="twitter"></i></a>
            <a href="#" class="social-link" aria-label="Instagram"><i data-lucide="instagram"></i></a>
            <a href="#" class="social-link" aria-label="LinkedIn"><i data-lucide="linkedin"></i></a>
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
