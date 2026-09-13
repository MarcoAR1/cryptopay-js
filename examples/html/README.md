# CryptoPay HTML & Vanilla JS Integration Demo

This directory provides a ready-to-run demonstration of integrating the CryptoPay Checkout Widget into any standard HTML5 website without build systems, bundlers, or framework dependencies.

---

## What is Included

1. **Self-Contained Browser Bundle (`checkout.js`)**:
   - Includes full widget runtime, injected CSS styling, QR code generation, EVM wallet connector, and internationalization.
   - Zero additional script or CSS `<link>` tags required.

2. **Integration Options Demonstrated**:
   - **Embedded Mode**: Mounts inline within any `<div>` element via `CryptoPay.createCheckout({ ... }).mount('#container')`.
   - **Modal Mode**: Mounts a responsive overlay with smooth backdrop blur via `CryptoPay.openModal({ ... })`.
   - **Hosted Link**: Fallback to an external hosted checkout session URL.

3. **Multi-Language & Theme Support**:
   - Dynamic locale selection: Spanish (`es`), English (`en`), Portuguese (`pt`), German (`de`).
   - Dark and light theme modes.

---

## How to Run

1. Build the library from the repository root:
   ```bash
   npm run build
   ```

2. Open `index.html` directly in any modern browser (or serve it with a lightweight static server):
   ```bash
   npx serve examples/html
   ```

3. Experiment with the UI controls to test embedded mounting, modal popups, and language switching.
