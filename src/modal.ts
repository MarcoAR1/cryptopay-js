import { CryptoPayCheckout, CheckoutConfig } from './checkout';

export interface ModalConfig extends CheckoutConfig {
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

/**
 * CryptoPay Accessible Modal Checkout
 * Wraps CryptoPayCheckout in an accessible modal dialog with backdrop blur,
 * keyboard trap, Escape handling, body scroll locking, and focus restoration.
 * Closing the modal unmounts the UI but DOES NOT cancel any on-chain or server payment.
 */
export class CryptoPayModal {
  private overlay: HTMLElement | null = null;
  private checkout: CryptoPayCheckout | null = null;
  private previousActiveElement: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private isOpen = false;

  constructor(private config: ModalConfig) {}

  /**
   * Opens the modal dialog and mounts the checkout.
   */
  open(): void {
    if (this.isOpen || typeof document === 'undefined') return;
    this.isOpen = true;
    this.previousActiveElement = document.activeElement as HTMLElement | null;

    // Lock background scrolling
    document.body.style.overflow = 'hidden';

    // Create modal overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'cpay-modal-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', this.config.locale === 'es' ? 'Ventana de pago CryptoPay' : 'CryptoPay Checkout Dialog');

    // Dialog container
    const container = document.createElement('div');
    container.className = 'cpay-modal-container';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cpay-modal-close-btn';
    closeBtn.setAttribute('aria-label', this.config.locale === 'es' ? 'Cerrar ventana de pago' : 'Close payment modal');
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.close();
    container.appendChild(closeBtn);

    // Slot for checkout
    const checkoutSlot = document.createElement('div');
    checkoutSlot.className = 'cpay-modal-checkout-slot';
    container.appendChild(checkoutSlot);

    this.overlay.appendChild(container);
    document.body.appendChild(this.overlay);

    // Mount checkout
    this.checkout = new CryptoPayCheckout(this.config);
    this.checkout.mount(checkoutSlot);

    // Initial focus on close button
    if (typeof closeBtn.focus === 'function') {
      closeBtn.focus();
    }

    // Keyboard handlers: Escape to close and focus trap
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.config.closeOnEscape !== false) {
          e.preventDefault();
          this.close();
        }
      } else if (e.key === 'Tab') {
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.hasAttribute('disabled'));

        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    // Close on overlay click
    if (this.config.closeOnOverlayClick !== false) {
      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      };
    }
  }

  /**
   * Closes the modal, restores focus and body scroll, and unmounts the checkout.
   * Note: Closing does NOT cancel the payment attempt on the gateway.
   */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Restore body scroll
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
      if (this.keydownHandler) {
        document.removeEventListener('keydown', this.keydownHandler);
        this.keydownHandler = null;
      }
    }

    // Unmount checkout
    if (this.checkout) {
      this.checkout.unmount();
      this.checkout = null;
    }

    // Remove overlay DOM
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Restore focus
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
      this.previousActiveElement = null;
    }

    this.config.onClose?.();
  }

  /**
   * Returns whether the modal is currently open.
   */
  isModalOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Permanently destroys the modal.
   */
  destroy(): void {
    this.close();
  }
}

export function openModal(config: ModalConfig): CryptoPayModal {
  const modal = new CryptoPayModal(config);
  modal.open();
  return modal;
}
