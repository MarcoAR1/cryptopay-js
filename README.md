# CryptoPay.js

> Accept crypto payments in minutes. A 16KB embeddable checkout widget.

[![npm version](https://img.shields.io/npm/v/cryptopay-js.svg)](https://www.npmjs.com/package/cryptopay-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick Start

### Option 1: Script Tag (CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/cryptopay-js@latest/dist/checkout.js"></script>

<div id="cryptopay-button"
     data-api-key="cpk_live_YOUR_KEY"
     data-amount="50.00"
     data-currency="USDT">
</div>
```

That's it. One script, one div. The widget renders automatically.

### Option 2: npm

```bash
npm install cryptopay-js
```

```javascript
import { createCheckout } from 'cryptopay-js'

const checkout = createCheckout({
  apiKey: 'cpk_live_YOUR_KEY',
  amount: '50.00',
  currency: 'USDT',
  onSuccess: (payment) => {
    console.log('Payment confirmed!', payment.txHash)
  },
  onError: (error) => {
    console.error('Payment failed:', error)
  },
})

checkout.mount('#payment-container')
```

## Features

- 🪶 **16KB** — Ultra-lightweight, zero framework dependencies
- 🦊 **Multi-wallet** — MetaMask, Coinbase, Trust Wallet, Brave
- 📱 **QR Code** — Direct transfer via any wallet app
- 🔄 **Auto-polling** — Monitors blockchain for confirmation
- 🌙 **Dark/Light** — Themed widget that matches your site
- 🛡️ **Secure** — All payments verified on-chain
- 📲 **Mobile** — Deep links for wallet apps

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | *required* | Your CryptoPay API key |
| `amount` | string | *required* | Payment amount |
| `currency` | string | `'USDT'` | Token symbol |
| `orderId` | string | auto | Your order reference |
| `baseUrl` | string | production | API endpoint |
| `theme` | `'dark' \| 'light'` | `'dark'` | Widget theme |
| `onSuccess` | function | — | Called on confirmed payment |
| `onError` | function | — | Called on error |
| `onStatusChange` | function | — | Called on state transitions |

## HTML Data Attributes

For the declarative API, use `data-` attributes:

```html
<div id="cryptopay-button"
     data-api-key="cpk_live_abc123"
     data-amount="100.00"
     data-currency="USDT"
     data-order-id="order_12345"
     data-theme="dark"
     data-on-success="mySuccessHandler"
     data-on-error="myErrorHandler">
</div>

<script>
function mySuccessHandler(payment) {
  alert('Paid! TX: ' + payment.txHash)
}
function myErrorHandler(error) {
  alert('Error: ' + error)
}
</script>
```

## Supported Networks

- Ethereum Mainnet
- Sepolia Testnet
- Polygon *(coming soon)*
- Arbitrum *(coming soon)*
- BSC *(coming soon)*

## Supported Tokens

- USDT (ERC-20)
- USDC *(coming soon)*
- ETH (native)
- Custom ERC-20 tokens *(Enterprise)*

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+
- Mobile browsers (iOS Safari, Chrome Android)

## Server-Side

This package is the **client-side widget** only. You need a CryptoPay server to handle payment creation and verification.

→ [Get your API key at cryptopay.dev](https://cryptopay.dev)

## License

MIT © [MarcoAR1](https://github.com/MarcoAR1)
