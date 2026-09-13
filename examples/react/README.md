# CryptoPay React Integration Examples

This directory provides complete reference examples for integrating CryptoPay in modern React applications (React 18 & 19).

---

## 3 Flexible Integration Levels

### 1. Ready-to-Use Widget (`<CryptoPayWidget />`)
A complete drop-in checkout experience. Mounts the widget with zero CSS setup (styles are automatically injected into `<head>`).

```jsx
import { CryptoPayWidget } from 'cryptopay-js/react';

function CheckoutPage({ session }) {
  return (
    <CryptoPayWidget
      baseUrl="https://api.cryptopay.example.com"
      paymentId={session.paymentId}
      checkoutToken={session.checkoutToken}
      locale="es"
      theme="dark"
      onSuccess={(data) => console.log('Payment confirmed:', data.txHash)}
      onError={(err) => console.error('Error:', err)}
    />
  );
}
```

---

### 2. Headless Hook (`useCryptoPaySession`)
Full programmatic control over the checkout state while delegating background polling, status transitions, and wallet transactions to the SDK.

```jsx
import { useCryptoPaySession, CryptoPayStatusBadge } from 'cryptopay-js/react';

function CustomCheckout({ baseUrl, paymentId, checkoutToken }) {
  const { state, data, error, payWithWallet, cancel } = useCryptoPaySession({
    baseUrl,
    paymentId,
    checkoutToken,
    onConfirmed: (d) => alert('Payment confirmed!')
  });

  return (
    <div className="my-custom-checkout">
      <CryptoPayStatusBadge state={state} />
      <button onClick={() => payWithWallet()}>Pay with Injected Wallet</button>
      <button onClick={() => cancel()}>Cancel Payment</button>
    </div>
  );
}
```

---

### 3. Standalone Modular Subcomponents
Use standalone modular components anywhere in your custom store UI:

- `<CryptoPayQRCode />`: Generates verified deposit QR codes with contract safety guards.
- `<CryptoPayStatusBadge />`: Localized status badge for checkout lifecycle states.
- `<CryptoPayWalletButton />`: Connected wallet trigger with built-in loading states.

---

## Running the Demo

```bash
# From examples/react:
npm install
npm run dev
```
