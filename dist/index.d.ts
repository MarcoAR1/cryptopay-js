import { CryptoPayCheckout, CheckoutConfig } from './checkout';
export { CryptoPayCheckout } from './checkout';
export type { CheckoutConfig } from './checkout';
export { CryptoPayAPI } from './api';
export type { PaymentResponse } from './api';
export { detectWallets, connectWallet, executeTransaction } from './wallet';
export declare function createCheckout(config: CheckoutConfig): CryptoPayCheckout;
