import { CheckoutConfig } from './checkout';
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
export declare class CryptoPayModal {
    private config;
    private overlay;
    private checkout;
    private previousActiveElement;
    private keydownHandler;
    private isOpen;
    constructor(config: ModalConfig);
    /**
     * Opens the modal dialog and mounts the checkout.
     */
    open(): void;
    /**
     * Closes the modal, restores focus and body scroll, and unmounts the checkout.
     * Note: Closing does NOT cancel the payment attempt on the gateway.
     */
    close(): void;
    /**
     * Returns whether the modal is currently open.
     */
    isModalOpen(): boolean;
    /**
     * Permanently destroys the modal.
     */
    destroy(): void;
}
export declare function openModal(config: ModalConfig): CryptoPayModal;
