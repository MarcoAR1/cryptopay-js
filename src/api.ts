export interface PaymentResponse {
  paymentId: string; amount: string; amountUnits: string; currency: 'USDT';
  chainId: number; tokenAddress: string; paymentAddress: string; qrCodeUrl: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW'; txHash?: string; expiresAt: string;
}
export type PaymentStatusResponse = PaymentResponse;
/** Browser-only client. Merchant credentials and payment creation stay on your server. */
export class CryptoPayAPI {
  private baseUrl: string;
  constructor(baseUrl: string) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid gateway URL');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async getPaymentStatus(paymentId: string, checkoutToken: string, signal?: AbortSignal): Promise<PaymentResponse> {
    const response = await fetch(`${this.baseUrl}/v1/checkout/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${checkoutToken}` }, signal });
    if (!response.ok) throw new Error(`Checkout request failed (${response.status})`);
    return response.json();
  }
}
