import React from 'react';
import { HeadlessPaymentSession } from '../core/session';
import { CheckoutState, CheckoutSessionData } from '../core/types';
import { CheckoutConfig } from '../checkout';
import { SupportedLocale } from '../i18n';
import { WalletAdapter } from '../core/wallet-adapter';
export interface UseCryptoPaySessionOptions {
    baseUrl: string;
    paymentId: string;
    checkoutToken: string;
    pollIntervalMs?: number;
    autoStart?: boolean;
    onConfirmed?: (data: CheckoutSessionData) => void;
    onError?: (error: Error) => void;
    onStateChange?: (state: CheckoutState, data?: CheckoutSessionData) => void;
    onExpired?: (data: CheckoutSessionData) => void;
    onCancelled?: (data: CheckoutSessionData) => void;
    onFailed?: (data: CheckoutSessionData, error?: Error) => void;
}
export interface UseCryptoPaySessionReturn {
    state: CheckoutState;
    data: CheckoutSessionData | null;
    error: string | null;
    session: HeadlessPaymentSession | null;
    refresh: () => Promise<CheckoutSessionData | null>;
    cancel: () => Promise<void>;
    payWithWallet: (adapter?: WalletAdapter) => Promise<string>;
}
/**
 * React hook to consume a CryptoPay checkout session.
 * Headless, SSR-safe, StrictMode-resilient, and completely decoupled from any merchant framework.
 */
export declare function useCryptoPaySession(options: UseCryptoPaySessionOptions): UseCryptoPaySessionReturn;
export interface CryptoPayProviderProps extends UseCryptoPaySessionOptions {
    children: React.ReactNode;
}
export declare function CryptoPayProvider({ children, ...options }: CryptoPayProviderProps): React.ReactElement;
export declare function useCryptoPayContext(): UseCryptoPaySessionReturn;
export interface CryptoPayWidgetProps extends CheckoutConfig {
    className?: string;
    style?: React.CSSProperties;
}
/**
 * React Component for embedded CryptoPay checkout.
 * Mounts CryptoPayCheckout inside a scoped container with automatic unmount cleanup.
 */
export declare function CryptoPayWidget(props: CryptoPayWidgetProps): React.ReactElement;
export interface CryptoPayQRCodeProps {
    paymentAddress: string;
    tokenAddress?: string;
    qrCodeUrl?: string;
    width?: number;
    chainId?: number;
    className?: string;
    showAddress?: boolean;
    locale?: SupportedLocale;
    onAddressCopied?: () => void;
}
/**
 * Standalone QR Code & Deposit Address component.
 * Validates the contract address guard: refuses to render if paymentAddress === tokenAddress.
 */
export declare function CryptoPayQRCode({ paymentAddress, tokenAddress, qrCodeUrl, width, chainId, className, showAddress, locale, onAddressCopied }: CryptoPayQRCodeProps): React.ReactElement;
export interface CryptoPayStatusBadgeProps {
    state: CheckoutState;
    locale?: SupportedLocale;
    className?: string;
}
/**
 * Status badge reflecting the current checkout lifecycle state.
 */
export declare function CryptoPayStatusBadge({ state, locale, className }: CryptoPayStatusBadgeProps): React.ReactElement;
export interface CryptoPayWalletButtonProps {
    onPay?: () => Promise<void>;
    disabled?: boolean;
    label?: string;
    locale?: SupportedLocale;
    className?: string;
}
/**
 * Action button to trigger wallet payment with loading state.
 */
export declare function CryptoPayWalletButton({ onPay, disabled, label, locale, className }: CryptoPayWalletButtonProps): React.ReactElement;
