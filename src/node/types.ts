export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CreatePaymentParams {
  amount: string; // Atomic units or standard decimal string
  currency: string;
  orderId?: string;
  chainId?: number;
  paymentMethod?: 'CONTRACT' | 'DIRECT';
  expiresInSeconds?: number;
  idempotencyKey?: string;
}

export interface PaymentResponse {
  paymentId: string;
  id?: string;
  amount: string;
  amountUnits: string;
  currency: string;
  chainId: number;
  tokenAddress: string;
  paymentAddress: string;
  qrCodeUrl?: string;
  checkoutToken?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW' | 'CANCELLED';
  expiresAt: string;
  txHash?: string;
  createdAt: string;
}

export interface ListPaymentsParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface ListPaymentsResponse {
  items: PaymentResponse[];
  total: number;
}

export interface QuoteResponse {
  quoteId: string;
  paymentId: string;
  payerAmountUnits: string;
  tenantAmountUnits: string;
  feeUnits: string;
  networkChargeUnits: string;
  chargeFlags: number;
  expiresAt: string;
}
