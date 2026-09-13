'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import { HeadlessPaymentSession } from '../core/session';
import { CheckoutState, CheckoutSessionData } from '../core/types';
import {
  CryptoPayCheckout,
  CheckoutConfig,
  renderPaymentQRCode,
  getNetworkName,
} from '../checkout';
import { SupportedLocale, getTranslations } from '../i18n';
import { InjectedWalletAdapter, WalletPaymentManager, WalletAdapter } from '../core/wallet-adapter';

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
export function useCryptoPaySession(options: UseCryptoPaySessionOptions): UseCryptoPaySessionReturn {
  const [state, setState] = useState<CheckoutState>('INITIALIZING');
  const [data, setData] = useState<CheckoutSessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<HeadlessPaymentSession | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!options.baseUrl || !options.paymentId || !options.checkoutToken) {
      return;
    }

    const session = new HeadlessPaymentSession({
      baseUrl: options.baseUrl,
      paymentId: options.paymentId,
      checkoutToken: options.checkoutToken,
      pollIntervalMs: options.pollIntervalMs || 3000,
      callbacks: {
        onPaymentConfirmed: (d) => optionsRef.current.onConfirmed?.(d),
        onPaymentFailed: (d, err) => {
          if (err) setError(err.message);
          optionsRef.current.onFailed?.(d, err);
          if (err) optionsRef.current.onError?.(err);
        },
        onExpired: (d) => optionsRef.current.onExpired?.(d),
        onCancelled: (d) => optionsRef.current.onCancelled?.(d),
        onStateChange: (s, d) => {
          setState(s);
          setData(d || null);
          optionsRef.current.onStateChange?.(s, d);
        }
      }
    });

    sessionRef.current = session;
    setState(session.getState());
    setData(session.getData());

    const unsubscribe = session.subscribe((s: CheckoutState, d?: CheckoutSessionData) => {
      setState(s);
      setData(d || null);
    });

    if (options.autoStart !== false) {
      void session.start().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        if (err instanceof Error) optionsRef.current.onError?.(err);
      });
    }

    return () => {
      unsubscribe();
      session.destroy();
      sessionRef.current = null;
    };
  }, [options.baseUrl, options.paymentId, options.checkoutToken, options.pollIntervalMs, options.autoStart]);

  const refresh = useCallback(async () => {
    if (!sessionRef.current) return null;
    try {
      const refreshed = await sessionRef.current.fetchStatus();
      setData(refreshed);
      return refreshed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!sessionRef.current) return;
    await sessionRef.current.cancel();
  }, []);

  const payWithWallet = useCallback(async (adapter?: WalletAdapter): Promise<string> => {
    const activeSession = sessionRef.current;
    if (!activeSession) throw new Error('Session not initialized');
    const sessionData = activeSession.getData();
    if (!sessionData) throw new Error('Session data not ready');

    const walletAdapter = adapter || new InjectedWalletAdapter();
    const manager = new WalletPaymentManager();

    await manager.selectAndConnect(walletAdapter);
    manager.preparePayment({
      paymentId: sessionData.paymentId,
      tokenAddress: sessionData.tokenAddress,
      recipientAddress: sessionData.paymentAddress,
      amountUnits: sessionData.amountUnits,
      chainId: sessionData.chainId
    });

    activeSession.markWalletPreparing();
    const txHash = await manager.executePayment();
    activeSession.markTransactionBroadcasted(txHash);
    return txHash;
  }, []);

  return {
    state,
    data,
    error,
    session: sessionRef.current,
    refresh,
    cancel,
    payWithWallet
  };
}

// ---------------------------------------------------------------------------
// CryptoPay React Context & Provider (Optional for deep tree integration)
// ---------------------------------------------------------------------------

const CryptoPayContext = createContext<UseCryptoPaySessionReturn | null>(null);

export interface CryptoPayProviderProps extends UseCryptoPaySessionOptions {
  children: React.ReactNode;
}

export function CryptoPayProvider({ children, ...options }: CryptoPayProviderProps): React.ReactElement {
  const sessionValue = useCryptoPaySession(options);
  return React.createElement(CryptoPayContext.Provider, { value: sessionValue }, children);
}

export function useCryptoPayContext(): UseCryptoPaySessionReturn {
  const context = useContext(CryptoPayContext);
  if (!context) {
    throw new Error('useCryptoPayContext must be used within a <CryptoPayProvider />');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Full Embedded Checkout Widget Component
// ---------------------------------------------------------------------------

export interface CryptoPayWidgetProps extends CheckoutConfig {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * React Component for embedded CryptoPay checkout.
 * Mounts CryptoPayCheckout inside a scoped container with automatic unmount cleanup.
 */
export function CryptoPayWidget(props: CryptoPayWidgetProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CryptoPayCheckout | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const widget = new CryptoPayCheckout({
      baseUrl: props.baseUrl,
      paymentId: props.paymentId,
      checkoutToken: props.checkoutToken,
      theme: props.theme,
      customStyles: props.customStyles,
      locale: props.locale,
      defaultView: props.defaultView,
      onSuccess: props.onSuccess,
      onError: props.onError,
      onStatusChange: props.onStatusChange,
      onCancel: props.onCancel
    });

    widgetRef.current = widget;
    widget.mount(container);

    return () => {
      widget.unmount();
      widgetRef.current = null;
    };
  }, [
    props.baseUrl,
    props.paymentId,
    props.checkoutToken,
    props.theme,
    props.locale,
    props.defaultView
  ]);

  return React.createElement('div', {
    ref: containerRef,
    className: props.className,
    style: props.style
  });
}

// ---------------------------------------------------------------------------
// Modular Components for Custom / Own-Checkout UIs
// ---------------------------------------------------------------------------

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
export function CryptoPayQRCode({
  paymentAddress,
  tokenAddress,
  qrCodeUrl,
  width = 224,
  chainId,
  className,
  showAddress = true,
  locale,
  onAddressCopied
}: CryptoPayQRCodeProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const t = getTranslations(locale);

  // Contract address safety guard (CP-039 invariant)
  const isInvalid = Boolean(
    tokenAddress &&
    paymentAddress &&
    tokenAddress.trim().toLowerCase() === paymentAddress.trim().toLowerCase()
  );

  const urlToRender = qrCodeUrl || paymentAddress;

  useEffect(() => {
    if (isInvalid || !canvasRef.current || !urlToRender) return;

    void renderPaymentQRCode(canvasRef.current, urlToRender, { width, margin: 2 }).catch((err) => {
      console.error('[CryptoPayQRCode] Error rendering QR:', err);
    });
  }, [urlToRender, width, isInvalid]);

  if (isInvalid) {
    return React.createElement(
      'div',
      { className: `cpay-error-box ${className || ''}`.trim() },
      React.createElement('p', { className: 'cpay-error-text' }, t.errors.depositDestination)
    );
  }

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(paymentAddress);
    }
    setCopied(true);
    onAddressCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };

  return React.createElement(
    'div',
    { className: `cpay-qr-modular ${className || ''}`.trim() },
    chainId ? React.createElement('div', { className: 'cpay-network-badge' }, `🌐 ${getNetworkName(chainId)}`) : null,
    React.createElement('canvas', {
      ref: canvasRef,
      width,
      height: width,
      style: { maxWidth: '100%' },
      role: 'img',
      'aria-label': t.aria.qrCode
    }),
    showAddress
      ? React.createElement(
          'div',
          { className: 'cpay-address-row' },
          React.createElement('span', { className: 'cpay-address-value' }, paymentAddress),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'cpay-copy-btn',
              onClick: handleCopy,
              'aria-label': t.aria.copyAddress,
              title: t.copyAddress
            },
            copied ? `✓ ${t.addressCopied}` : `📋 ${t.copyAddress}`
          )
        )
      : null
  );
}

export interface CryptoPayStatusBadgeProps {
  state: CheckoutState;
  locale?: SupportedLocale;
  className?: string;
}

/**
 * Status badge reflecting the current checkout lifecycle state.
 */
export function CryptoPayStatusBadge({ state, locale, className }: CryptoPayStatusBadgeProps): React.ReactElement {
  const t = getTranslations(locale);
  const getLabel = (s: CheckoutState) => {
    switch (s) {
      case 'INITIALIZING': return t.statusBadges.initializing;
      case 'AWAITING_PAYMENT': return t.statusBadges.awaitingPayment;
      case 'WALLET_PREPARING': return t.statusBadges.walletPreparing;
      case 'CONFIRMING': return t.statusBadges.confirming;
      case 'CONFIRMED': return t.statusBadges.confirmed;
      case 'FAILED': return t.statusBadges.failed;
      case 'EXPIRED': return t.statusBadges.expired;
      case 'CANCELLED': return t.statusBadges.cancelled;
      case 'REVIEW': return t.statusBadges.review;
      default: return s;
    }
  };

  return React.createElement(
    'span',
    {
      className: `cpay-status-badge cpay-status-${state.toLowerCase()} ${className || ''}`.trim(),
      role: 'status',
      'aria-label': `${t.aria.statusBadge}: ${getLabel(state)}`
    },
    getLabel(state)
  );
}

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
export function CryptoPayWalletButton({
  onPay,
  disabled = false,
  label,
  locale,
  className
}: CryptoPayWalletButtonProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const t = getTranslations(locale);
  const resolvedLabel = label || t.payWithWallet;

  const handleClick = async () => {
    if (!onPay || loading || disabled) return;
    setLoading(true);
    try {
      await onPay();
    } finally {
      setLoading(false);
    }
  };

  return React.createElement(
    'button',
    {
      type: 'button',
      className: `cpay-wallet-btn ${className || ''}`.trim(),
      onClick: handleClick,
      disabled: disabled || loading,
      'aria-label': `${t.aria.walletButton}: ${resolvedLabel}`
    },
    loading ? t.connecting : resolvedLabel
  );
}
