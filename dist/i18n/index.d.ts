import { SupportedLocale, TranslationCatalog } from './types';
import { es } from './es';
import { en } from './en';
import { pt } from './pt';
import { de } from './de';
export * from './types';
export { es, en, pt, de };
export declare const SUPPORTED_LOCALES: SupportedLocale[];
/**
 * Resolves the translation catalog for a given locale string, falling back to 'en' if not supported.
 */
export declare function getTranslations(locale?: string): TranslationCatalog;
/**
 * Formats a numerical amount for human UI display according to the chosen locale.
 * (e.g. 1000.50 -> "1.000,50" in 'es'/'de', "1,000.50" in 'en')
 */
export declare function formatAmountDisplay(amount: number | string, locale?: string, minimumFractionDigits?: number): string;
/**
 * Formats an amount strictly for on-chain/API wire transport.
 * INVARIANT: Amounts sent to contracts or gateway APIs MUST NEVER depend on the user's locale decimal separator.
 * Always returns a standardized period (.) separated decimal string with up to 6 decimals, without grouping separators.
 */
export declare function formatAmountWire(amount: number | string): string;
