import { PaymentResponse } from './api';
import './styles/widget.css';
export interface CheckoutConfig {
    paymentId: string;
    checkoutToken: string;
    baseUrl: string;
    theme?: 'dark' | 'light';
    onSuccess?: (payment: PaymentResponse) => void;
    onError?: (error: string) => void;
    onStatusChange?: (status: string) => void;
}
/** Displays a server-created attempt. A UI callback is never proof of settlement. */
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
    constructor(config: CheckoutConfig);
    mount(selector: string): void;
    unmount(): void;
    private refresh;
    private render;
}
