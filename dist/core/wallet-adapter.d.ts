export interface EIP1193Provider {
    request: (args: {
        method: string;
        params?: any[];
    }) => Promise<any>;
    on?: (event: string, handler: (...args: any[]) => void) => void;
    removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    isMetaMask?: boolean;
    isCoinbaseWallet?: boolean;
    isTrust?: boolean;
    isBraveWallet?: boolean;
    providers?: EIP1193Provider[];
}
export interface WalletCapabilities {
    supportsChainSwitching: boolean;
    supportsAccountEvents: boolean;
    supportsChainEvents: boolean;
    isMobile: boolean;
}
export interface ConnectedWalletState {
    address: string;
    chainId: number;
}
export interface PreparedPayment {
    paymentId: string;
    tokenAddress: string;
    recipientAddress: string;
    amountUnits: string;
    chainId: number;
    preparedAtAccount: string;
    preparedAtChainId: number;
    timestamp: number;
}
export interface WalletAdapter {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly capabilities: WalletCapabilities;
    isAvailable(): boolean;
    getProvider(): EIP1193Provider | null;
    connect(): Promise<ConnectedWalletState>;
    disconnect(): Promise<void>;
    switchChain(chainId: number): Promise<void>;
    sendTokenTransfer(to: string, amountUnits: string, tokenAddress: string, chainId: number): Promise<string>;
    onAccountChange(handler: (account: string | null) => void): () => void;
    onChainChange(handler: (chainId: number) => void): () => void;
    onDisconnect(handler: () => void): () => void;
}
export interface InjectedWalletAdapterOptions {
    id?: string;
    name?: string;
    icon?: string;
    provider?: EIP1193Provider;
    deepLinkSchema?: string;
}
/**
 * Standard Injected Wallet Adapter (EIP-1193)
 * Supports MetaMask, Coinbase, Trust, Brave, Rabby, or any injected web3 provider.
 */
export declare class InjectedWalletAdapter implements WalletAdapter {
    readonly id: string;
    readonly name: string;
    readonly icon: string;
    readonly deepLinkSchema?: string;
    private customProvider?;
    private accountListeners;
    private chainListeners;
    private disconnectListeners;
    private boundOnAccountsChanged?;
    private boundOnChainChanged?;
    private boundOnDisconnect?;
    constructor(options?: InjectedWalletAdapterOptions);
    get capabilities(): WalletCapabilities;
    getProvider(): EIP1193Provider | null;
    isAvailable(): boolean;
    private normalizeChainId;
    /**
     * Connect to wallet on explicit user action
     */
    connect(): Promise<ConnectedWalletState>;
    disconnect(): Promise<void>;
    switchChain(chainId: number): Promise<void>;
    sendTokenTransfer(to: string, amountUnits: string, tokenAddress: string, chainId: number): Promise<string>;
    onAccountChange(handler: (account: string | null) => void): () => void;
    onChainChange(handler: (chainId: number) => void): () => void;
    onDisconnect(handler: () => void): () => void;
    private attachEventListeners;
    private detachEventListeners;
}
/**
 * WalletPaymentManager manages active wallet connection, monitors account/chain shifts,
 * and enforces strict invalidation of prepared payments upon wallet changes.
 */
export declare class WalletPaymentManager {
    private activeAdapter;
    private connectedState;
    private preparedPayment;
    private unsubscribeAccount?;
    private unsubscribeChain?;
    private unsubscribeDisconnect?;
    private invalidationListeners;
    get connected(): boolean;
    get state(): ConnectedWalletState | null;
    get prepared(): PreparedPayment | null;
    onPreparationInvalidated(handler: (reason: string) => void): () => void;
    selectAndConnect(adapter: WalletAdapter): Promise<ConnectedWalletState>;
    disconnect(): Promise<void>;
    /**
     * Prepares payment execution. Validates current account and network.
     */
    preparePayment(params: {
        paymentId: string;
        tokenAddress: string;
        recipientAddress: string;
        amountUnits: string;
        chainId: number;
        protocolVersion?: string | number;
    }): PreparedPayment;
    /**
     * Invalidates any existing payment preparation state
     */
    invalidatePreparedPayment(reason: string): void;
    /**
     * Executes the prepared payment.
     * Guarantees that neither account nor network changed between preparation and broadcast.
     */
    executePayment(): Promise<string>;
    private handleAccountChanged;
    private handleChainChanged;
    private handleDisconnect;
}
/**
 * Mobile & Deep Links helper for returning to the active session
 */
export declare function getMobileDeepLinks(checkoutUrl: string, options?: {
    returnUrl?: string;
}): Record<string, string>;
/**
 * Support Matrix Documenting Capabilities Across Wallets and Platforms
 */
export declare function getWalletSupportMatrix(): {
    wallet: string;
    desktopExtension: boolean;
    mobileInAppBrowser: boolean;
    mobileDeepLink: boolean;
    chainSwitching: boolean;
    accountChangedEvent: boolean;
}[];
