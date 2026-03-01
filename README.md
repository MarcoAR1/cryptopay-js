# ⟐ CryptoPay JS SDK

> Embeddable checkout widget for accepting crypto payments. 16KB, zero dependencies.

## Installation

### CDN (easiest)

```html
<script src="https://unpkg.com/@anthropic-ai/cryptopay-js/dist/checkout.js"></script>
```

### NPM

```bash
npm install @anthropic-ai/cryptopay-js
```

## Quick Start

```html
<script src="https://unpkg.com/@anthropic-ai/cryptopay-js/dist/checkout.js"></script>
<button id="pay-btn">Pay with Crypto</button>

<script>
  CryptoPayCheckout.init({
    apiKey: 'cpk_your_api_key_here',
    apiUrl: 'https://api.cryptopay.dev',   // Your CryptoPay server URL
    // testMode: true,                      // Use Sepolia testnet
  });

  document.getElementById('pay-btn').addEventListener('click', () => {
    CryptoPayCheckout.open({
      orderId: 'order_123',
      amount: '25.00',
      currency: 'USDT',
      paymentMethod: 'DIRECT',   // 'DIRECT' (QR) or 'CONTRACT' (MetaMask)
      onSuccess: (result) => {
        console.log('Payment confirmed!', result);
        // Redirect to success page, update UI, etc.
      },
      onError: (error) => {
        console.error('Payment failed:', error);
      },
    });
  });
</script>
```

## Payment Methods

### Direct QR (`paymentMethod: 'DIRECT'`)

Customer scans a QR code and sends USDT from any wallet (Trust Wallet, MetaMask, Exchange, etc.). The CryptoPay blockchain monitor detects the transfer automatically.

**Best for:** Mobile users, exchange wallets, maximum compatibility.

### Smart Contract (`paymentMethod: 'CONTRACT'`)

Customer connects MetaMask, approves USDT, and pays through the CryptoPay smart contract. Fees are split automatically on-chain.

**Best for:** Desktop users with MetaMask, instant confirmation.

## Configuration

```javascript
CryptoPayCheckout.init({
  apiKey: 'cpk_...',           // Required. Your API key from the dashboard
  apiUrl: 'https://...',       // Required. Your CryptoPay server URL
  theme: 'dark',               // Optional. 'dark' (default) or 'light'
  testMode: false,              // Optional. Use Sepolia testnet
});
```

## Events

```javascript
CryptoPayCheckout.open({
  orderId: 'order_123',
  amount: '25.00',
  currency: 'USDT',
  paymentMethod: 'DIRECT',

  // Called when payment is successfully created (QR shown to user)
  onPaymentCreated: (payment) => {
    console.log('Payment address:', payment.paymentAddress);
  },

  // Called when payment is confirmed on-chain
  onSuccess: (result) => {
    console.log('Confirmed! TX:', result.txHash);
  },

  // Called on any error
  onError: (error) => {
    console.error('Error:', error.message);
  },

  // Called when user closes the checkout widget
  onClose: () => {
    console.log('User closed checkout');
  },
});
```

## Webhooks

After integrating the SDK, set up webhook verification on your server:

```javascript
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  // Verify HMAC signature
  const signature = req.headers['x-cryptopay-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  switch (req.body.event) {
    case 'PAYMENT_CREATED':
      // Show pending state in your UI
      break;
    case 'PAYMENT_CONFIRMED':
      // Fulfill the order!
      break;
    case 'PAYMENT_EXPIRED':
      // Mark as expired after 24h
      break;
  }

  res.status(200).send('OK');
});
```

## Testing

Use test mode with Sepolia testnet:

```javascript
CryptoPayCheckout.init({
  apiKey: 'cpk_your_test_key',
  apiUrl: 'http://localhost:3001',
  testMode: true,
});
```

Get free Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com).

## Support

- 📖 [Full Documentation](https://github.com/MarcoAR1/crypto-pay)
- 🐛 [Report Issues](https://github.com/MarcoAR1/cryptopay-js/issues)
- 💬 [Discussions](https://github.com/MarcoAR1/crypto-pay/discussions)

## License

MIT © CryptoPay
