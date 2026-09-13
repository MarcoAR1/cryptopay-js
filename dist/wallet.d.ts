export interface EthereumProvider {
    isMetaMask?: boolean;
    isCoinbaseWallet?: boolean;
    isTrust?: boolean;
    isBraveWallet?: boolean;
    request: (args: {
        method: string;
        params?: any[];
    }) => Promise<any>;
    on: (event: string, handler: (...args: any[]) => void) => void;
    removeListener: (event: string, handler: (...args: any[]) => void) => void;
    providers?: EthereumProvider[];
}
export interface DetectedWallet {
    name: string;
    provider: EthereumProvider;
    icon: string;
}
declare global {
    interface Window {
        ethereum?: EthereumProvider;
    }
}
export declare function detectWallets(): DetectedWallet[];
export declare function isMobileDevice(): boolean;
export declare function getMobileDeepLinks(paymentUrl: string): Record<string, string>;
export declare function connectWallet(provider: EthereumProvider): Promise<{
    account: string;
    chainId: number;
}>;
export declare function executeTransaction(provider: EthereumProvider, to: string, amountUnits: string, tokenAddress: string, chainId: number): Promise<string>;
