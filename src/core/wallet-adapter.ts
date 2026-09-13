import {
  WalletNotInstalledError,
  WalletPermissionRejectedError,
  ChainSwitchRejectedError,
  NetworkMismatchError,
  PaymentPreparationInvalidatedError,
} from './errors';

export interface EIP1193Provider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
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
export class InjectedWalletAdapter implements WalletAdapter {
  public readonly id: string;
  public readonly name: string;
  public readonly icon: string;
  public readonly deepLinkSchema?: string;

  private customProvider?: EIP1193Provider;
  private accountListeners = new Set<(account: string | null) => void>();
  private chainListeners = new Set<(chainId: number) => void>();
  private disconnectListeners = new Set<() => void>();

  private boundOnAccountsChanged?: (accounts: string[]) => void;
  private boundOnChainChanged?: (chainIdHex: string) => void;
  private boundOnDisconnect?: () => void;

  constructor(options: InjectedWalletAdapterOptions = {}) {
    this.id = options.id || 'injected';
    this.name = options.name || 'Browser Wallet';
    this.icon = options.icon || '💳';
    this.customProvider = options.provider;
    this.deepLinkSchema = options.deepLinkSchema;
  }

  get capabilities(): WalletCapabilities {
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    return {
      supportsChainSwitching: true,
      supportsAccountEvents: true,
      supportsChainEvents: true,
      isMobile,
    };
  }

  getProvider(): EIP1193Provider | null {
    if (this.customProvider) return this.customProvider;
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      return (window as any).ethereum as EIP1193Provider;
    }
    return null;
  }

  isAvailable(): boolean {
    return this.getProvider() !== null;
  }

  private normalizeChainId(chainIdHex: string | number): number {
    if (typeof chainIdHex === 'number') return chainIdHex;
    return parseInt(chainIdHex, 16);
  }

  /**
   * Connect to wallet on explicit user action
   */
  async connect(): Promise<ConnectedWalletState> {
    const provider = this.getProvider();
    if (!provider) {
      throw new WalletNotInstalledError(this.name, this.deepLinkSchema);
    }

    this.attachEventListeners(provider);

    let accounts: string[];
    let chainIdHex: string;

    try {
      accounts = await provider.request({ method: 'eth_requestAccounts' });
    } catch (err: any) {
      if (err?.code === 4001 || /rejected|denied|cancelled/i.test(err?.message || '')) {
        throw new WalletPermissionRejectedError(`User cancelled connection to ${this.name}`);
      }
      throw err;
    }

    if (!accounts || accounts.length === 0 || !accounts[0]) {
      throw new WalletPermissionRejectedError('No accounts returned by wallet');
    }

    try {
      chainIdHex = await provider.request({ method: 'eth_chainId' });
    } catch (err) {
      chainIdHex = '0x1';
    }

    return {
      address: accounts[0].toLowerCase(),
      chainId: this.normalizeChainId(chainIdHex),
    };
  }

  async disconnect(): Promise<void> {
    const provider = this.getProvider();
    if (provider) {
      this.detachEventListeners(provider);
    }
    for (const l of this.disconnectListeners) {
      try {
        l();
      } catch {}
    }
  }

  async switchChain(chainId: number): Promise<void> {
    const provider = this.getProvider();
    if (!provider) throw new WalletNotInstalledError(this.name);

    const currentHex = await provider.request({ method: 'eth_chainId' });
    const currentChain = this.normalizeChainId(currentHex);
    if (currentChain === chainId) return;

    const targetHex = '0x' + chainId.toString(16);
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }],
      });
    } catch (err: any) {
      if (err?.code === 4001 || /rejected|denied/i.test(err?.message || '')) {
        throw new ChainSwitchRejectedError(chainId);
      }
      throw err;
    }
  }

  async sendTokenTransfer(
    to: string,
    amountUnits: string,
    tokenAddress: string,
    chainId: number
  ): Promise<string> {
    const provider = this.getProvider();
    if (!provider) throw new WalletNotInstalledError(this.name);

    if (!/^0x[0-9a-fA-F]{40}$/.test(to) || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
      throw new Error('Invalid token or recipient address');
    }
    if (!/^\d+$/.test(amountUnits) || BigInt(amountUnits) <= 0n) {
      throw new Error('Invalid atomic token transfer amount');
    }

    // Verify chain matches
    const activeChainHex = await provider.request({ method: 'eth_chainId' });
    const activeChain = this.normalizeChainId(activeChainHex);
    if (activeChain !== chainId) {
      await this.switchChain(chainId);
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) {
      throw new WalletPermissionRejectedError('No account selected for transaction');
    }

    // ERC20 transfer(to, amount) ABI: 0xa9059cbb + pad32(to) + pad32(amount)
    const cleanTo = to.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const cleanAmount = BigInt(amountUnits).toString(16).padStart(64, '0');
    const data = `0xa9059cbb${cleanTo}${cleanAmount}`;

    try {
      return await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: accounts[0],
            to: tokenAddress,
            data,
          },
        ],
      });
    } catch (err: any) {
      if (err?.code === 4001 || /rejected|denied|cancelled/i.test(err?.message || '')) {
        throw new WalletPermissionRejectedError('User cancelled payment transaction');
      }
      throw err;
    }
  }

  onAccountChange(handler: (account: string | null) => void): () => void {
    this.accountListeners.add(handler);
    return () => this.accountListeners.delete(handler);
  }

  onChainChange(handler: (chainId: number) => void): () => void {
    this.chainListeners.add(handler);
    return () => this.chainListeners.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectListeners.add(handler);
    return () => this.disconnectListeners.delete(handler);
  }

  private attachEventListeners(provider: EIP1193Provider): void {
    if (!provider.on) return;

    if (!this.boundOnAccountsChanged) {
      this.boundOnAccountsChanged = (accounts: string[]) => {
        const nextAccount = accounts && accounts.length > 0 ? accounts[0].toLowerCase() : null;
        for (const listener of this.accountListeners) {
          try {
            listener(nextAccount);
          } catch {}
        }
      };
      provider.on('accountsChanged', this.boundOnAccountsChanged);
    }

    if (!this.boundOnChainChanged) {
      this.boundOnChainChanged = (chainIdHex: string) => {
        const nextChain = this.normalizeChainId(chainIdHex);
        for (const listener of this.chainListeners) {
          try {
            listener(nextChain);
          } catch {}
        }
      };
      provider.on('chainChanged', this.boundOnChainChanged);
    }

    if (!this.boundOnDisconnect) {
      this.boundOnDisconnect = () => {
        for (const listener of this.disconnectListeners) {
          try {
            listener();
          } catch {}
        }
      };
      provider.on('disconnect', this.boundOnDisconnect);
    }
  }

  private detachEventListeners(provider: EIP1193Provider): void {
    if (!provider.removeListener) return;

    if (this.boundOnAccountsChanged) {
      provider.removeListener('accountsChanged', this.boundOnAccountsChanged);
      this.boundOnAccountsChanged = undefined;
    }
    if (this.boundOnChainChanged) {
      provider.removeListener('chainChanged', this.boundOnChainChanged);
      this.boundOnChainChanged = undefined;
    }
    if (this.boundOnDisconnect) {
      provider.removeListener('disconnect', this.boundOnDisconnect);
      this.boundOnDisconnect = undefined;
    }
  }
}

/**
 * WalletPaymentManager manages active wallet connection, monitors account/chain shifts,
 * and enforces strict invalidation of prepared payments upon wallet changes.
 */
export class WalletPaymentManager {
  private activeAdapter: WalletAdapter | null = null;
  private connectedState: ConnectedWalletState | null = null;
  private preparedPayment: PreparedPayment | null = null;
  private unsubscribeAccount?: () => void;
  private unsubscribeChain?: () => void;
  private unsubscribeDisconnect?: () => void;

  private invalidationListeners = new Set<(reason: string) => void>();

  get connected(): boolean {
    return this.connectedState !== null;
  }

  get state(): ConnectedWalletState | null {
    return this.connectedState;
  }

  get prepared(): PreparedPayment | null {
    return this.preparedPayment;
  }

  onPreparationInvalidated(handler: (reason: string) => void): () => void {
    this.invalidationListeners.add(handler);
    return () => this.invalidationListeners.delete(handler);
  }

  async selectAndConnect(adapter: WalletAdapter): Promise<ConnectedWalletState> {
    if (this.activeAdapter) {
      await this.disconnect();
    }

    this.activeAdapter = adapter;
    this.connectedState = await adapter.connect();

    this.unsubscribeAccount = adapter.onAccountChange((newAccount) => {
      this.handleAccountChanged(newAccount);
    });

    this.unsubscribeChain = adapter.onChainChange((newChainId) => {
      this.handleChainChanged(newChainId);
    });

    this.unsubscribeDisconnect = adapter.onDisconnect(() => {
      this.handleDisconnect();
    });

    return this.connectedState;
  }

  async disconnect(): Promise<void> {
    this.invalidatePreparedPayment('Wallet disconnected');
    if (this.unsubscribeAccount) this.unsubscribeAccount();
    if (this.unsubscribeChain) this.unsubscribeChain();
    if (this.unsubscribeDisconnect) this.unsubscribeDisconnect();

    if (this.activeAdapter) {
      await this.activeAdapter.disconnect();
      this.activeAdapter = null;
    }
    this.connectedState = null;
  }

  /**
   * Prepares payment execution. Validates current account and network.
   */
  preparePayment(params: {
    paymentId: string;
    tokenAddress: string;
    recipientAddress: string;
    amountUnits: string;
    chainId: number;
  }): PreparedPayment {
    if (!this.connectedState) {
      throw new Error('Wallet not connected');
    }

    if (this.connectedState.chainId !== params.chainId) {
      throw new NetworkMismatchError(params.chainId, this.connectedState.chainId);
    }

    this.preparedPayment = {
      ...params,
      preparedAtAccount: this.connectedState.address,
      preparedAtChainId: this.connectedState.chainId,
      timestamp: Date.now(),
    };

    return this.preparedPayment;
  }

  /**
   * Invalidates any existing payment preparation state
   */
  invalidatePreparedPayment(reason: string): void {
    if (this.preparedPayment) {
      this.preparedPayment = null;
      for (const listener of this.invalidationListeners) {
        try {
          listener(reason);
        } catch {}
      }
    }
  }

  /**
   * Executes the prepared payment.
   * Guarantees that neither account nor network changed between preparation and broadcast.
   */
  async executePayment(): Promise<string> {
    if (!this.activeAdapter || !this.connectedState) {
      throw new Error('Wallet is not connected');
    }

    if (!this.preparedPayment) {
      throw new PaymentPreparationInvalidatedError('No valid payment prepared');
    }

    const { recipientAddress, amountUnits, tokenAddress, chainId, preparedAtAccount, preparedAtChainId } =
      this.preparedPayment;

    if (this.connectedState.address !== preparedAtAccount) {
      this.invalidatePreparedPayment('Account changed after preparation');
      throw new PaymentPreparationInvalidatedError(
        `Active account (${this.connectedState.address}) does not match prepared account (${preparedAtAccount})`
      );
    }

    if (this.connectedState.chainId !== preparedAtChainId) {
      this.invalidatePreparedPayment('Chain changed after preparation');
      throw new PaymentPreparationInvalidatedError(
        `Active chain (${this.connectedState.chainId}) does not match prepared chain (${preparedAtChainId})`
      );
    }

    const txHash = await this.activeAdapter.sendTokenTransfer(
      recipientAddress,
      amountUnits,
      tokenAddress,
      chainId
    );

    // Consume prepared state after successful transmission
    this.preparedPayment = null;
    return txHash;
  }

  private handleAccountChanged(newAccount: string | null): void {
    if (!newAccount) {
      this.handleDisconnect();
      return;
    }

    const prevAccount = this.connectedState?.address;
    if (this.connectedState) {
      this.connectedState.address = newAccount;
    }

    if (prevAccount && prevAccount !== newAccount) {
      this.invalidatePreparedPayment(`Account switched from ${prevAccount} to ${newAccount}`);
    }
  }

  private handleChainChanged(newChainId: number): void {
    const prevChain = this.connectedState?.chainId;
    if (this.connectedState) {
      this.connectedState.chainId = newChainId;
    }

    if (prevChain && prevChain !== newChainId) {
      this.invalidatePreparedPayment(`Network switched from chain ${prevChain} to ${newChainId}`);
    }
  }

  private handleDisconnect(): void {
    this.invalidatePreparedPayment('Wallet disconnected');
    this.connectedState = null;
  }
}

/**
 * Mobile & Deep Links helper for returning to the active session
 */
export function getMobileDeepLinks(
  checkoutUrl: string,
  options: { returnUrl?: string } = {}
): Record<string, string> {
  const cleanUrl = checkoutUrl.replace(/^https?:\/\//, '');
  const encodedFull = encodeURIComponent(checkoutUrl);

  return {
    metamask: `https://metamask.app.link/dapp/${cleanUrl}`,
    coinbase: `https://go.cb-w.com/dapp?cb_url=${encodedFull}`,
    trust: `trust://open_url?coin_id=60&url=${encodedFull}`,
    rainbow: `https://rnbwapp.com/wc?uri=${encodedFull}`,
  };
}

/**
 * Support Matrix Documenting Capabilities Across Wallets and Platforms
 */
export function getWalletSupportMatrix() {
  return [
    {
      wallet: 'MetaMask',
      desktopExtension: true,
      mobileInAppBrowser: true,
      mobileDeepLink: true,
      chainSwitching: true,
      accountChangedEvent: true,
    },
    {
      wallet: 'Coinbase Wallet',
      desktopExtension: true,
      mobileInAppBrowser: true,
      mobileDeepLink: true,
      chainSwitching: true,
      accountChangedEvent: true,
    },
    {
      wallet: 'Trust Wallet',
      desktopExtension: true,
      mobileInAppBrowser: true,
      mobileDeepLink: true,
      chainSwitching: true,
      accountChangedEvent: true,
    },
    {
      wallet: 'Brave Wallet',
      desktopExtension: true,
      mobileInAppBrowser: true,
      mobileDeepLink: false,
      chainSwitching: true,
      accountChangedEvent: true,
    },
    {
      wallet: 'Generic EIP-1193',
      desktopExtension: true,
      mobileInAppBrowser: true,
      mobileDeepLink: false,
      chainSwitching: true,
      accountChangedEvent: true,
    },
  ];
}
