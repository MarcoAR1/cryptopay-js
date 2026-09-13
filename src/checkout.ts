import { CryptoPayAPI, PaymentResponse } from './api';
import { detectWallets, executeTransaction } from './wallet';
import QRCode from 'qrcode';
import './styles/widget.css';

export interface CheckoutConfig {
  paymentId: string; checkoutToken: string; baseUrl: string;
  theme?: 'dark' | 'light';
  onSuccess?: (payment: PaymentResponse) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: string) => void;
}
/** Displays a server-created attempt. A UI callback is never proof of settlement. */
export class CryptoPayCheckout {
  private api: CryptoPayAPI;
  private root: HTMLElement | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private walletAbort?: AbortController;
  private notified = false;
  private errors = 0;
  private sending = false;
  private generation = 0;
  constructor(private config: CheckoutConfig) {
    if (!config.paymentId || !config.checkoutToken) throw new Error('A server-created checkout session is required');
    this.api = new CryptoPayAPI(config.baseUrl);
  }
  mount(selector: string): void {
    this.unmount();
    this.root = document.querySelector<HTMLElement>(selector);
    if (!this.root) throw new Error('Checkout element not found');
    this.root.classList.add('cpay-root');
    if (this.config.theme === 'light') this.root.classList.add('cpay-light');
    void this.refresh(this.generation);
  }
  unmount(): void {
    this.generation++; clearTimeout(this.timer); this.abort?.abort(); this.walletAbort?.abort();
    this.root?.replaceChildren(); this.root?.classList.remove('cpay-root', 'cpay-light'); this.root = null;
  }
  private async refresh(generation: number): Promise<void> {
    if (!this.root || generation !== this.generation) return;
    const abort = new AbortController(); this.abort = abort;
    const timeout = setTimeout(() => abort.abort(), 10000);
    try {
      const payment = await this.api.getPaymentStatus(this.config.paymentId, this.config.checkoutToken, abort.signal);
      if (!this.root || generation !== this.generation) return;
      this.errors = 0; this.config.onStatusChange?.(payment.status);
      this.render(payment, generation);
      if (payment.status === 'CONFIRMED' && !this.notified) { this.notified = true; this.config.onSuccess?.(payment); }
      if (payment.status === 'PENDING') this.timer = setTimeout(() => { void this.refresh(generation); }, 5000);
    } catch (err) {
      if (!this.root || generation !== this.generation) return;
      const message = err instanceof Error ? err.message : 'Checkout unavailable';
      this.root.textContent = message; this.config.onError?.(message);
      if (++this.errors < 5) this.timer = setTimeout(() => { void this.refresh(generation); }, 5000);
    } finally { clearTimeout(timeout); }
  }
  private render(payment: PaymentResponse, generation: number): void {
    if (!this.root) return;
    this.root.replaceChildren();
    const amount = document.createElement('p'); amount.className = 'cpay-amount'; amount.textContent = `${payment.amount} ${payment.currency}`;
    const status = document.createElement('p'); status.textContent = payment.status;
    this.root.append(amount, status);
    if (payment.status !== 'PENDING') return;
    const address = document.createElement('p'); address.textContent = payment.paymentAddress;
    const canvas = document.createElement('canvas');
    this.root.append(address, canvas);
    void QRCode.toCanvas(canvas, payment.qrCodeUrl, { width: 224 }).catch(() => { canvas.remove(); });
    for (const wallet of detectWallets()) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `Pay with ${wallet.name}`; button.disabled = this.sending;
      button.onclick = async () => {
        if (this.sending || generation !== this.generation) return;
        this.sending = true; button.disabled = true;
        const abort = new AbortController(); this.walletAbort = abort;
        const timeout = setTimeout(() => abort.abort(), 10000);
        try {
          const current = await this.api.getPaymentStatus(payment.paymentId, this.config.checkoutToken, abort.signal);
          if (!this.root || generation !== this.generation) { this.sending = false; return; }
          if (current.status !== 'PENDING' || Date.parse(current.expiresAt) <= Date.now()) throw new Error('Payment is no longer payable');
          await executeTransaction(wallet.provider, current.paymentAddress, current.amountUnits, current.tokenAddress, current.chainId);
          // Keep the send action disabled until unmount to avoid a second transfer while awaiting confirmation.
        } catch (err) {
          this.sending = false; button.disabled = false;
          if (this.root && generation === this.generation) this.config.onError?.(err instanceof Error ? err.message : 'Wallet error');
        } finally { clearTimeout(timeout); }
      };
      this.root.append(button);
    }
  }
}
