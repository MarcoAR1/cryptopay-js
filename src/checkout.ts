import { CryptoPayAPI, PaymentResponse } from './api';
import { detectWallets, executeTransaction } from './wallet';
import {
  GaslessCapabilitiesResponse,
  detectGaslessCapability,
  prepareGaslessPermit,
} from './core/gasless';
import QRCode from 'qrcode';
import {
  SupportedLocale,
  TranslationCatalog,
  getTranslations,
  formatAmountDisplay,
} from './i18n';
import './styles/widget.css';

export interface CheckoutConfig {
  paymentId: string;
  checkoutToken: string;
  baseUrl: string;
  theme?: 'dark' | 'light';
  customStyles?: Record<string, string>;
  locale?: SupportedLocale;
  defaultView?: 'methods' | 'qr';
  onSuccess?: (payment: PaymentResponse) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: string) => void;
  onCancel?: () => void;
}

export type CheckoutView = 'methods' | 'qr';

export class InvalidDepositDestinationError extends Error {
  constructor(message = 'Token contract address cannot be used as deposit destination') {
    super(message);
    this.name = 'InvalidDepositDestinationError';
  }
}

export function getNetworkName(chainId: number): string {
  switch (chainId) {
    case 1: return 'Ethereum Mainnet';
    case 11155111: return 'Sepolia Testnet';
    case 137: return 'Polygon';
    case 8453: return 'Base';
    case 42161: return 'Arbitrum One';
    default: return `EVM Network (${chainId})`;
  }
}

export interface PaymentQRCodeOptions {
  width?: number;
  margin?: number;
}

export async function renderPaymentQRCode(
  canvas: HTMLCanvasElement,
  qrCodeUrl: string,
  options: PaymentQRCodeOptions = {}
): Promise<void> {
  await QRCode.toCanvas(canvas, qrCodeUrl, {
    width: options.width || 224,
    margin: options.margin || 2,
  });
}

/**
 * CryptoPay Checkout Widget
 * Self-contained, isolated embedded checkout component.
 * Displays a server-created attempt. A UI callback is never proof of settlement.
 */
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
  private isDestroyed = false;
  private currentView: CheckoutView = 'methods';
  private latestPayment: PaymentResponse | null = null;
  private gaslessCapabilities: GaslessCapabilitiesResponse | null = null;
  private t: TranslationCatalog;

  constructor(private config: CheckoutConfig) {
    if (!config.paymentId || !config.checkoutToken) {
      throw new Error('A server-created checkout session is required');
    }
    this.api = new CryptoPayAPI(config.baseUrl);
    this.t = getTranslations(config.locale);
    if (config.defaultView) {
      this.currentView = config.defaultView;
    }
  }

  /**
   * Mounts the checkout widget into the specified container element or selector.
   */
  mount(target: string | HTMLElement): void {
    if (this.isDestroyed) {
      throw new Error('Cannot mount a destroyed checkout widget');
    }
    this.unmount();

    if (typeof target === 'string') {
      this.root = document.querySelector<HTMLElement>(target);
    } else {
      this.root = target;
    }

    if (!this.root) {
      throw new Error('Checkout element not found');
    }

    this.root.classList.add('cpay-root');
    if (this.config.theme === 'light') {
      this.root.classList.add('cpay-light');
    }

    if (this.config.customStyles) {
      for (const [key, value] of Object.entries(this.config.customStyles)) {
        this.root.style.setProperty(key, value);
      }
    }

    void this.refresh(this.generation);
  }

  /**
   * Unmounts the widget, tears down timers and in-flight operations, and cleans DOM.
   */
  unmount(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.abort?.abort();
    this.walletAbort?.abort();

    if (this.root) {
      this.root.replaceChildren();
      this.root.classList.remove('cpay-root', 'cpay-light');
      if (this.config.customStyles) {
        for (const key of Object.keys(this.config.customStyles)) {
          this.root.style.removeProperty(key);
        }
      }
      this.root = null;
    }
  }

  /**
   * Permanently destroys the widget instance.
   */
  destroy(): void {
    this.unmount();
    this.isDestroyed = true;
  }

  /**
   * Returns the latest payment status snapshot if available.
   */
  getPayment(): PaymentResponse | null {
    return this.latestPayment;
  }

  /**
   * Returns the current active view ('methods' | 'qr').
   */
  getView(): CheckoutView {
    return this.currentView;
  }

  /**
   * Switches the active view and re-renders.
   */
  setView(view: CheckoutView): void {
    this.currentView = view;
    if (this.root && this.latestPayment) {
      this.render(this.latestPayment, this.generation);
    }
  }

  private async refresh(generation: number): Promise<void> {
    if (!this.root || generation !== this.generation || this.isDestroyed) return;

    const abort = new AbortController();
    this.abort = abort;
    const timeout = setTimeout(() => abort.abort(), 10000);

    try {
      const payment = await this.api.getPaymentStatus(
        this.config.paymentId,
        this.config.checkoutToken,
        abort.signal
      );

      if (!this.root || generation !== this.generation || this.isDestroyed) return;

      this.latestPayment = payment;
      this.errors = 0;
      this.config.onStatusChange?.(payment.status);
      this.render(payment, generation);

      if (!this.gaslessCapabilities) {
        this.api
          .getGaslessCapabilities(this.config.paymentId, this.config.checkoutToken, abort.signal)
          .then((caps) => {
            if (this.root && generation === this.generation && !this.isDestroyed) {
              this.gaslessCapabilities = caps;
              if (this.currentView === 'methods' && this.latestPayment?.status === 'PENDING') {
                this.render(this.latestPayment, generation);
              }
            }
          })
          .catch(() => {
            this.gaslessCapabilities = { isSupported: false, reason: 'Gasless unavailable' };
          });
      }

      if (payment.status === 'CONFIRMED' && !this.notified) {
        this.notified = true;
        this.config.onSuccess?.(payment);
      }

      if (payment.status === 'PENDING') {
        this.timer = setTimeout(() => {
          void this.refresh(generation);
        }, 5000);
      }
    } catch (err) {
      if (!this.root || generation !== this.generation || this.isDestroyed) return;

      const message = err instanceof Error ? err.message : 'Checkout unavailable';
      this.renderError(message);
      this.config.onError?.(message);

      if (++this.errors < 5) {
        this.timer = setTimeout(() => {
          void this.refresh(generation);
        }, 5000);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private render(payment: PaymentResponse, generation: number): void {
    if (!this.root || generation !== this.generation) return;
    this.root.replaceChildren();

    const widget = document.createElement('div');
    widget.className = 'cpay-widget';
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', this.t.checkoutTitle);

    // Header
    const header = document.createElement('div');
    header.className = 'cpay-header';

    const logo = document.createElement('div');
    logo.className = 'cpay-logo';
    logo.textContent = '⚡ CryptoPay';

    const amountWrapper = document.createElement('div');
    const amount = document.createElement('p');
    amount.className = 'cpay-amount';
    amount.textContent = `${formatAmountDisplay(payment.amount, this.config.locale)} `;

    const currency = document.createElement('span');
    currency.className = 'cpay-currency';
    currency.textContent = payment.currency;
    amount.appendChild(currency);
    amountWrapper.appendChild(amount);

    const statusP = document.createElement('p');
    statusP.className = 'cpay-status';
    statusP.setAttribute('aria-live', 'polite');
    const badgeKey = payment.status.toLowerCase() as keyof TranslationCatalog['statusBadges'];
    statusP.textContent = this.t.statusBadges[badgeKey] || payment.status;

    header.appendChild(logo);
    header.appendChild(amountWrapper);
    header.appendChild(statusP);
    widget.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'cpay-body';

    if (payment.status === 'CONFIRMED') {
      const successView = document.createElement('div');
      successView.className = 'cpay-success';

      const check = document.createElement('div');
      check.className = 'cpay-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      const text = document.createElement('p');
      text.className = 'cpay-success-text';
      text.textContent = this.t.paymentConfirmed;

      const sub = document.createElement('p');
      sub.className = 'cpay-success-sub';
      sub.textContent = this.t.paymentConfirmedDesc;

      successView.appendChild(check);
      successView.appendChild(text);
      successView.appendChild(sub);
      body.appendChild(successView);
    } else if (payment.status === 'FAILED') {
      const errorView = document.createElement('div');
      errorView.className = 'cpay-error-view';

      const errText = document.createElement('p');
      errText.className = 'cpay-error-text';
      errText.textContent = this.t.paymentFailed;

      const errSub = document.createElement('p');
      errSub.className = 'cpay-pending-sub';
      errSub.textContent = this.t.paymentFailedDesc;

      errorView.appendChild(errText);
      errorView.appendChild(errSub);
      body.appendChild(errorView);
    } else if (payment.status === 'REVIEW') {
      const reviewView = document.createElement('div');
      reviewView.className = 'cpay-pending';

      const pText = document.createElement('p');
      pText.className = 'cpay-pending-text';
      pText.textContent = this.t.paymentUnderReview;

      const pSub = document.createElement('p');
      pSub.className = 'cpay-pending-sub';
      pSub.textContent = this.t.paymentUnderReviewDesc;

      reviewView.appendChild(pText);
      reviewView.appendChild(pSub);
      body.appendChild(reviewView);
    } else {
      // PENDING
      const isDirect = payment.paymentMethod === 'DIRECT';
      if (isDirect || this.currentView === 'qr') {
        if (payment.paymentAddress && payment.tokenAddress &&
            payment.paymentAddress.toLowerCase() === payment.tokenAddress.toLowerCase()) {
          this.renderError(this.t.errors.depositDestination);
          return;
        }

        const qrView = document.createElement('div');
        qrView.className = 'cpay-qr-view';

        const topRow = document.createElement('div');
        topRow.className = 'cpay-actions';

        // INVARIANT (CP-028 Criterion 2): UI never offers CONTRACT actions to a DIRECT deposit by error
        if (!isDirect) {
          const backBtn = document.createElement('button');
          backBtn.type = 'button';
          backBtn.className = 'cpay-back-btn';
          backBtn.setAttribute('aria-label', this.t.backToWallets);
          backBtn.textContent = this.t.backToWallets;
          backBtn.onclick = () => {
            this.currentView = 'methods';
            this.render(payment, generation);
          };
          topRow.appendChild(backBtn);
        }

        const netBadge = document.createElement('div');
        netBadge.className = 'cpay-network-badge';
        netBadge.textContent = `🌐 ${getNetworkName(payment.chainId)}`;
        topRow.appendChild(netBadge);
        qrView.appendChild(topRow);

        const canvas = document.createElement('canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', this.t.aria.qrCode);
        const qrContainer = document.createElement('div');
        qrContainer.className = 'cpay-qr-container';
        qrContainer.appendChild(canvas);
        qrView.appendChild(qrContainer);

        void renderPaymentQRCode(canvas, payment.qrCodeUrl).catch(() => {
          canvas.remove();
        });

        const addressBox = document.createElement('div');
        addressBox.className = 'cpay-address-box';

        const label = document.createElement('span');
        label.className = 'cpay-address-label';
        label.textContent = this.t.depositAddress;

        const row = document.createElement('div');
        row.className = 'cpay-address-row';

        const addressP = document.createElement('p');
        addressP.className = 'cpay-address';
        addressP.textContent = payment.paymentAddress;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'cpay-copy-btn';
        copyBtn.title = this.t.copyAddress;
        copyBtn.setAttribute('aria-label', this.t.aria.copyAddress);
        copyBtn.textContent = '📋';
        copyBtn.onclick = () => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard.writeText(payment.paymentAddress);
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
          }
        };

        row.appendChild(addressP);
        row.appendChild(copyBtn);
        addressBox.appendChild(label);
        addressBox.appendChild(row);
        qrView.appendChild(addressBox);

        // Operational notice regarding direct deposits / exchanges
        const notice = document.createElement('div');
        notice.className = 'cpay-notice';
        notice.textContent = this.t.directDepositNotice;
        qrView.appendChild(notice);

        body.appendChild(qrView);
      } else {
        // methods view
        const methodsContainer = document.createElement('div');
        methodsContainer.className = 'cpay-methods';

        // 1. Wallets detected
        const wallets = detectWallets();

        // Check gasless availability
        if (this.gaslessCapabilities?.isSupported) {
          for (const wallet of wallets) {
            const gaslessBtn = document.createElement('button');
            gaslessBtn.type = 'button';
            gaslessBtn.className = 'cpay-method-btn cpay-method-gasless';
            gaslessBtn.setAttribute('aria-label', `${this.t.payGasless}: ${wallet.name}`);
            gaslessBtn.disabled = this.sending;

            const gaslessTitle = document.createElement('span');
            gaslessTitle.textContent = `${this.t.payGasless} (${wallet.name})`;
            const gaslessBadge = document.createElement('span');
            gaslessBadge.className = 'cpay-gasless-badge';
            gaslessBadge.textContent = this.t.gaslessSponsoredBadge;

            gaslessBtn.appendChild(gaslessTitle);
            gaslessBtn.appendChild(gaslessBadge);

            gaslessBtn.onclick = async () => {
              if (this.sending || generation !== this.generation) return;
              this.sending = true;
              gaslessBtn.disabled = true;

              try {
                // INVARIANT (Criterion 2): Capability detection NEVER invokes wallet_switchEthereumChain automatically.
                const cap = await detectGaslessCapability({
                  provider: wallet.provider,
                  tokenAddress: payment.tokenAddress,
                  chainId: payment.chainId,
                  backendCapabilities: this.gaslessCapabilities!,
                });

                if (!cap.canPayGasless) {
                  this.sending = false;
                  gaslessBtn.disabled = false;
                  this.config.onError?.(cap.reason || this.t.gaslessNotSupportedNotice);
                  return;
                }

                statusP.textContent = this.t.statusBadges.sponsorSigning;
                const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
                const payer = accounts[0];
                if (!payer) throw new Error('No wallet account selected');

                const permit = await prepareGaslessPermit({
                  provider: wallet.provider,
                  payer,
                  spender: this.gaslessCapabilities!.forwarderAddress || payment.paymentAddress,
                  value: payment.amountUnits,
                  tokenInfo: {
                    name: this.gaslessCapabilities!.tokenName || 'USD Coin',
                    version: this.gaslessCapabilities!.tokenVersion || '2',
                    chainId: payment.chainId,
                    verifyingContract: this.gaslessCapabilities!.tokenAddress || payment.tokenAddress,
                  },
                });

                statusP.textContent = this.t.statusBadges.sponsorBroadcasting;
                const result = await this.api.submitGaslessPayment(
                  payment.paymentId,
                  this.config.checkoutToken,
                  {
                    payerAddress: payer,
                    permit,
                  }
                );

                if (result.success && result.status === 'CONFIRMED') {
                  payment.status = 'CONFIRMED';
                  payment.txHash = result.txHash;
                  this.latestPayment = payment;
                  this.render(payment, generation);
                  if (!this.notified) {
                    this.notified = true;
                    this.config.onSuccess?.(payment);
                  }
                } else {
                  throw new Error(result.error || 'Gasless payment could not be confirmed');
                }
              } catch (err) {
                this.sending = false;
                gaslessBtn.disabled = false;
                statusP.textContent = this.t.statusBadges.awaitingPayment;
                if (this.root && generation === this.generation) {
                  this.config.onError?.(err instanceof Error ? err.message : 'Gasless payment failed');
                }
              }
            };

            methodsContainer.appendChild(gaslessBtn);
          }
        } else if (this.gaslessCapabilities && !this.gaslessCapabilities.isSupported) {
          const unsuppNotice = document.createElement('div');
          unsuppNotice.className = 'cpay-notice';
          unsuppNotice.style.fontSize = '12px';
          unsuppNotice.style.textAlign = 'left';
          unsuppNotice.textContent = `ℹ️ ${this.t.gaslessNotSupportedNotice}`;
          methodsContainer.appendChild(unsuppNotice);
        }

        for (const wallet of wallets) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'cpay-method-btn';
          button.textContent = `${this.t.payWithWallet} (${wallet.name})`;
          button.setAttribute('aria-label', `${this.t.aria.walletButton}: ${wallet.name}`);
          button.disabled = this.sending;

          button.onclick = async () => {
            if (this.sending || generation !== this.generation) return;
            this.sending = true;
            button.disabled = true;

            const abort = new AbortController();
            this.walletAbort = abort;
            const timeout = setTimeout(() => abort.abort(), 10000);

            try {
              const current = await this.api.getPaymentStatus(
                payment.paymentId,
                this.config.checkoutToken,
                abort.signal
              );

              if (!this.root || generation !== this.generation) {
                this.sending = false;
                return;
              }

              if (current.status !== 'PENDING' || Date.parse(current.expiresAt) <= Date.now()) {
                throw new Error('Payment is no longer payable');
              }

              await executeTransaction(
                wallet.provider,
                current.paymentAddress,
                current.amountUnits,
                current.tokenAddress,
                current.chainId
              );
            } catch (err) {
              this.sending = false;
              button.disabled = false;
              if (this.root && generation === this.generation) {
                this.config.onError?.(err instanceof Error ? err.message : 'Wallet error');
              }
            } finally {
              clearTimeout(timeout);
            }
          };

          methodsContainer.appendChild(button);
        }

        // 2. Direct transfer / QR option
        const qrBtn = document.createElement('button');
        qrBtn.type = 'button';
        qrBtn.className = 'cpay-method-btn';
        qrBtn.textContent = this.t.payWithQR;
        qrBtn.setAttribute('aria-label', this.t.payWithQR);
        qrBtn.onclick = () => {
          this.currentView = 'qr';
          this.render(payment, generation);
        };
        methodsContainer.appendChild(qrBtn);

        body.appendChild(methodsContainer);
      }
    }

    widget.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'cpay-footer';
    const secureSpan = document.createElement('span');
    secureSpan.className = 'cpay-secure';
    secureSpan.textContent = '🔒 Secured by CryptoPay Protocol';
    footer.appendChild(secureSpan);
    widget.appendChild(footer);

    this.root.appendChild(widget);
  }

  private renderError(message: string): void {
    if (!this.root) return;
    this.root.replaceChildren();

    const widget = document.createElement('div');
    widget.className = 'cpay-widget';
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', this.t.checkoutTitle);

    const body = document.createElement('div');
    body.className = 'cpay-body';

    const errView = document.createElement('div');
    errView.className = 'cpay-error-view';

    const p = document.createElement('p');
    p.className = 'cpay-error-text';
    p.textContent = message;

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'cpay-retry-btn';
    retryBtn.textContent = this.t.retry;
    retryBtn.setAttribute('aria-label', this.t.retry);
    retryBtn.onclick = () => {
      void this.refresh(this.generation);
    };

    errView.appendChild(p);
    errView.appendChild(retryBtn);
    body.appendChild(errView);
    widget.appendChild(body);
    this.root.appendChild(widget);
  }
}
