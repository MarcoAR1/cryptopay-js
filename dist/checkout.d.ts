import { PaymentResponse } from './api';
import { SupportedLocale } from './i18n';
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
export declare class InvalidDepositDestinationError extends Error {
    constructor(message?: string);
}
export declare function getNetworkName(chainId: number): string;
export interface PaymentQRCodeOptions {
    width?: number;
    margin?: number;
}
export declare function renderPaymentQRCode(canvas: HTMLCanvasElement, qrCodeUrl: string, options?: PaymentQRCodeOptions): Promise<void>;
/**
 * CryptoPay Checkout Widget
 * Self-contained, isolated embedded checkout component.
 * Displays a server-created attempt. A UI callback is never proof of settlement.
 */
export declare class CryptoPayCheckout {
    private config;
    private api;
    private root;
    private timer?;
    private abort?;
    private walletAbort?;
    private notified;
    private errors;
    private sending;
    private generation;
    private isDestroyed;
    private currentView;
    private latestPayment;
    private gaslessCapabilities;
    private t;
    /**
     * Deprecated legacy v1 initialization. Fails explicitly before any funds or operations.
     */
    static init(_config?: any): never;
    /**
     * Deprecated legacy v1 modal opener. Fails explicitly before any funds or operations.
     */
    static open(_config?: any): never;
    constructor(config: CheckoutConfig);
    /**
     * Mounts the checkout widget into the specified container element or selector.
     */
    mount(target: string | HTMLElement): void;
    /**
     * Unmounts the widget, tears down timers and in-flight operations, and cleans DOM.
     */
    unmount(): void;
    /**
     * Permanently destroys the widget instance.
     */
    destroy(): void;
    /**
     * Returns the latest payment status snapshot if available.
     */
    getPayment(): PaymentResponse | null;
    /**
     * Returns the current active view ('methods' | 'qr').
     */
    getView(): CheckoutView;
    /**
     * Switches the active view and re-renders.
     */
    setView(view: CheckoutView): void;
    private refresh;
    private render;
    private renderError;
}
