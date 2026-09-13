# cryptopay-js ? checkout session SDK

Version **2.0.0-rc.1**, prepared locally for the CryptoPay v1 Sepolia pilot. This document does not imply that the RC has been published to npm.

The source of truth is `crypto-pay/packages/sdk`. Build and export from that repository:

```sh
npm run build:sdk
npm run export:sdk
npm --prefix ../cryptopay-js test
```

From this repository, `npm pack` produces a locally installable tarball. Its prepack check validates hashes, CJS/ESM imports and declaration files. `provenance.json` identifies the source commit and whether the source had uncommitted changes. Review and export a clean source commit before publishing a stable release. No unrelated npm scope is used.

## Usage

Your backend authenticates to CryptoPay, fixes the order/amount and creates the payment. Return only its checkout session to the browser:

```ts
import { createCheckout } from 'cryptopay-js'

const checkout = createCheckout({
  baseUrl: 'https://YOUR_GATEWAY_HOST',
  paymentId: serverCreatedPayment.paymentId,
  checkoutToken: serverCreatedPayment.checkoutToken,
  onSuccess: () => refreshReservationFromYourBackend(),
  onError: message => console.error(message),
})
checkout.mount('#checkout')
// React effect cleanup:
// return () => checkout.unmount()
```

For a script tag, load your hosted `dist/checkout.js` and use `CryptoPay.createCheckout(...)`. ESM is `dist/checkout.mjs`; CommonJS is `dist/checkout.cjs`; types are `dist/index.d.ts`. The old `checkout.esm.js` filename is refreshed as a compatibility artifact, but package exports use `.mjs`.

The QR encodes an ERC-20 transfer with chain and atomic amount. Wallet payments verify/switch chain and send the token transfer. A submitted hash does not trigger success: the SDK waits for server confirmation. `onSuccess` refreshes UI; only the merchant backend may apply business credits from verified events.

No API key, order price, private key or mnemonic belongs in this widget. The checkout token is scoped to reading one attempt. Use dynamic import or a client component when mounting inside Next.js. Importing the package on a server does not mount a widget.

## Migration from v1

The old API-key/amount configuration and documented `CryptoPayCheckout.init/open` API are not supported by this RC. Replace them with a server-created session. CONTRACT, automatic payouts and refunds are not SDK features. The pilot supports DIRECT USDT on Sepolia; keep existing production checkout until the backend migration is accepted.
