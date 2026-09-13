export type CheckoutState =
  | 'INITIALIZING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface CheckoutSessionData {
  paymentId: string;
  amount: string;
  amountUnits: string;
  currency: string;
  chainId: number;
  tokenAddress: string;
  paymentAddress: string;
  qrCodeUrl?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW' | 'CANCELLED';
  expiresAt: string;
  txHash?: string;
}

export type StateListener = (state: CheckoutState, data?: CheckoutSessionData) => void;

export interface HeadlessSessionConfig {
  baseUrl: string;
  paymentId: string;
  checkoutToken: string;
  pollIntervalMs?: number;
}
