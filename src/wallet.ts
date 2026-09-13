// ─── CryptoPay SDK — Wallet Detection ───────────────────────
// Ported from paseo-libre useWeb3Wallet.ts (376 lines → ~120 lines)
// Supports: MetaMask, Coinbase, Trust, Brave, and any EIP-1193 provider

export interface EthereumProvider {
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isTrust?: boolean
  isBraveWallet?: boolean
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, handler: (...args: any[]) => void) => void
  removeListener: (event: string, handler: (...args: any[]) => void) => void
  providers?: EthereumProvider[]
}

export interface DetectedWallet {
  name: string
  provider: EthereumProvider
  icon: string
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export function detectWallets(): DetectedWallet[] {
  if (typeof window === 'undefined' || !window.ethereum) return []

  const wallets: DetectedWallet[] = []
  const ethereum = window.ethereum

  // Handle EIP-6963 multi-provider injection
  const providers = ethereum.providers || [ethereum]

  for (const provider of providers) {
    if (provider.isMetaMask && !provider.isBraveWallet) {
      wallets.push({ name: 'MetaMask', provider, icon: '🦊' })
    }
    if (provider.isCoinbaseWallet) {
      wallets.push({ name: 'Coinbase', provider, icon: '🔵' })
    }
    if (provider.isTrust) {
      wallets.push({ name: 'Trust Wallet', provider, icon: '🛡️' })
    }
    if (provider.isBraveWallet) {
      wallets.push({ name: 'Brave', provider, icon: '🦁' })
    }
  }

  // Fallback: if no specific wallet detected but ethereum exists
  if (wallets.length === 0 && ethereum) {
    wallets.push({ name: 'Browser Wallet', provider: ethereum, icon: '💳' })
  }

  return wallets
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function getMobileDeepLinks(paymentUrl: string): Record<string, string> {
  const encoded = encodeURIComponent(paymentUrl)
  return {
    metamask: `https://metamask.app.link/dapp/${paymentUrl.replace(/^https?:\/\//, '')}`,
    coinbase: `https://go.cb-w.com/dapp?cb_url=${encoded}`,
    trust: `trust://open_url?coin_id=60&url=${encoded}`,
  }
}

export async function connectWallet(
  provider: EthereumProvider
): Promise<{ account: string; chainId: number }> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const chainIdHex = await provider.request({ method: 'eth_chainId' })

  return {
    account: accounts[0],
    chainId: parseInt(chainIdHex, 16),
  }
}

export async function executeTransaction(
  provider: EthereumProvider, to: string, amountUnits: string,
  tokenAddress: string, chainId: number
): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to) || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) throw new Error('Invalid token or destination');
  if (!/^\d+$/.test(amountUnits) || BigInt(amountUnits) <= 0n || BigInt(amountUnits) >= 2n ** 256n) throw new Error('Invalid atomic amount');
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Invalid chain ID');
  const expected = '0x' + chainId.toString(16);
  if (Number(BigInt(await provider.request({ method: 'eth_chainId' }))) !== chainId) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expected }] });
  }
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts[0]) throw new Error('No wallet account selected');
  if (Number(BigInt(await provider.request({ method: 'eth_chainId' }))) !== chainId) throw new Error('Wallet network mismatch');
  const data = '0xa9059cbb' + to.slice(2).padStart(64, '0') + BigInt(amountUnits).toString(16).padStart(64, '0');
  return await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: accounts[0],
      to: tokenAddress,
      data,
    }],
  });
}
