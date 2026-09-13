export type SupportedLocale = 'es' | 'en' | 'pt' | 'de';

export interface TranslationCatalog {
  locale: SupportedLocale;
  checkoutTitle: string;
  payWithWallet: string;
  connectWallet: string;
  connecting: string;
  payWithQR: string;
  backToWallets: string;
  depositAddress: string;
  copyAddress: string;
  addressCopied: string;
  directDepositNotice: string;
  sendNotice: (amount: string, currency: string, network: string) => string;
  awaitingPayment: string;
  paymentConfirmed: string;
  paymentConfirmedDesc: string;
  paymentFailed: string;
  paymentFailedDesc: string;
  paymentExpired: string;
  paymentExpiredDesc: string;
  paymentUnderReview: string;
  paymentUnderReviewDesc: string;
  paymentCancelled: string;
  retry: string;
  cancel: string;
  networkLabel: string;
  payGasless: string;
  gaslessSponsoredBadge: string;
  gaslessNotSupportedNotice: string;
  statusBadges: {
    initializing: string;
    awaitingPayment: string;
    walletPreparing: string;
    sponsorSigning: string;
    sponsorBroadcasting: string;
    confirming: string;
    confirmed: string;
    failed: string;
    expired: string;
    cancelled: string;
    review: string;
  };
  aria: {
    dialog: string;
    closeModal: string;
    qrCode: string;
    copyAddress: string;
    walletButton: string;
    statusBadge: string;
  };
  errors: {
    sessionRequired: string;
    walletNotInstalled: string;
    walletRejected: string;
    networkMismatch: (expected: string) => string;
    depositDestination: string;
    genericError: string;
  };
}
