# Original User Request

## 2026-09-23T09:44:54Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Implement native scroll-triggered content pop-up animations (fade-up, staggered grid reveal, scale-up, char-by-char reveal, parallax) in the BlueCollar Connect project based on the approved implementation plan. 

Working directory: c:\Users\munta\Downloads\blue_collar
Integrity mode: development

## Requirements

### R1. CSS Animation System
Create a new `scroll-animations.css` file containing pure CSS classes for scroll animations using `data-animate` attributes. Ensure all animations are gated behind `prefers-reduced-motion: no-preference`. Include animations for `fade-up`, `scale-up`, and character-by-character reveals.

### R2. Refactor Animation Engine
Update `js/utils/animations.js` to use a robust `IntersectionObserver` that supports dynamically rendered elements via a new `observeNewElements(container)` function to fix the existing race condition. Implement `initHeroParallax()` for the hero section fade-out/shrink effect, and `initCharReveal()` for section titles.

### R3. HTML and Dynamic Rendering Updates
Add `data-animate` attributes to static HTML elements across all pages, and inject them into the dynamic JS template literals in the `js/pages/*.js` files. Ensure `observeNewElements()` is called after dynamic content is injected into the DOM.
- The Hero section should have parallax fade-out.
- Section titles should use character-by-character reveal (`data-char-reveal`).
- The CTA card on the homepage should use the `scale-up` animation.

### R4. Zero Dependencies
The implementation must remain completely native. No external animation libraries (e.g., GSAP, Framer Motion) can be added to the project.

## Acceptance Criteria

### Verification (Agent-as-Judge via Browser Tool)
- [ ] An independent auditing agent must load the local HTML files in a browser (e.g. using the chrome-devtools plugin or similar visual tool) and confirm that scrolling down triggers the animation states (elements change from `opacity: 0` to `opacity: 1` with the correct classes applied).
- [ ] The auditor must verify that dynamically injected cards (e.g. category grids) receive the `is-visible` class upon intersection.
- [ ] The auditor must verify that the hero section's inline `opacity` and `transform` values update dynamically as the page is scrolled.
- [ ] The auditor must verify that no existing fixed (`header`) or sticky positioned elements (`category.html` sidebar) are broken or hidden by overflow constraints.

## 2026-09-24T08:53:36Z

# Teamwork Project Prompt — Final

> Status: Ready for launch — awaiting user approval
> Goal: Fix login modal bug and ensure zero regressions
> Requested team: Small, focused team

This is a single self-contained fix; keep it small and focused.
Implement the login modal bug fix plan (`login-modal-fix-plan.md`) to resolve the auto-closing issue, ensuring the fix is robust and no existing site functionality breaks.

Working directory: `C:\Users\munta\Downloads\blue_collar`
Integrity mode: demo

## Requirements

### R1. Eliminate Race Condition
Modify `js/components/authUI.js` to remove the `setTimeout` delayed hiding logic in `closeAllAuthModals()` and `openModal()`. Use `requestAnimationFrame` for immediate, synchronous state transitions.

### R2. Remove Duplicate Listeners
Remove the conflicting Login button event listener logic from `js/components/modal.js`.

### R3. Fix Mobile Button Support
Update the CSS selectors in `js/components/authUI.js` (`updateHeaderState`) to properly target and bind the mobile Login button (`.btn-outline`).

### R4. Zero Regressions
Ensure that the other modals (Register, Forgot Password) and non-auth modals (Post a Job, Set Location) continue to function perfectly without flashing or breaking.

## Acceptance Criteria

### Modal Stability
- [ ] Clicking the desktop "Login" button opens the modal, and it stays open indefinitely until closed.
- [ ] Clicking the mobile "Login" button opens the modal, and it stays open indefinitely until closed.
- [ ] Clicking "Post a Job" correctly shows the "coming soon" toast.
- [ ] No visual flashing occurs during modal transitions.
- [ ] No new JavaScript errors are introduced in the browser console.

## 2026-09-24T16:15:16Z

# Teamwork Project Prompt — Final

> Status: Ready for launch — awaiting user approval
> Goal: Fix registration/OTP bug with zero breaking changes
> Requested team: Full-scale multi-agent team

Implement the Registration/OTP bug fix plan (`registration-otp-fix-plan.md`) to resolve the non-atomic registration issue, fix the `forgotPassword` crash, clean up `getMe`, and add `deleteUser`. Ensure absolute backward compatibility.

Working directory: `C:\Users\munta\Downloads\blue_collar`
Integrity mode: development

## Requirements

### R1. Atomic Registration (Email First)
Modify `server/controllers/authController.js` so that `register` attempts to send the OTP email *before* saving the user to the database. If the email fails, return an error and leave the database clean.
If an unverified user record already exists for the email, delete it and allow re-registration.

### R2. Fix Secondary Bugs
- Fix `forgotPassword` `this` binding in `authController.js`.
- Refactor `getMe` to use the `db` module instead of raw `fs.readFileSync`.
- Add a `deleteUser(email)` and `readUsers()` function to `server/db/database.js`.

### R3. Strict Backward Compatibility
Make zero modifications to the frontend code (`authUI.js`, `authService.js`). The API endpoints, request bodies, and response shapes must remain identical.

## Acceptance Criteria

### API Correctness
- [ ] Attempting registration with a broken SMTP configuration returns a 500 error and does NOT add the user to `users.json`.
- [ ] Registering with an email that is already in `users.json` with `isVerified: false` succeeds (overwriting/cleaning up the stale record).
- [ ] Registering with an email that is in `users.json` with `isVerified: true` returns a 400 error "Email is already registered".
- [ ] Calling the Forgot Password endpoint successfully triggers `sendOtp` without crashing.
- [ ] Calling `/api/auth/me` while authenticated returns the correct user data.
