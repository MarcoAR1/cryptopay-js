import { SupportedLocale, TranslationCatalog } from './types';
import { es } from './es';
import { en } from './en';
import { pt } from './pt';
import { de } from './de';

export * from './types';
export { es, en, pt, de };

export const SUPPORTED_LOCALES: SupportedLocale[] = ['es', 'en', 'pt', 'de'];

const catalogs: Record<SupportedLocale, TranslationCatalog> = {
  es,
  en,
  pt,
  de,
};

/**
 * Resolves the translation catalog for a given locale string, falling back to 'en' if not supported.
 */
export function getTranslations(locale?: string): TranslationCatalog {
  if (!locale) return en;
  const normalized = locale.toLowerCase().split(/[-_]/)[0] as SupportedLocale;
  return catalogs[normalized] || en;
}

/**
 * Formats a numerical amount for human UI display according to the chosen locale.
 * (e.g. 1000.50 -> "1.000,50" in 'es'/'de', "1,000.50" in 'en')
 */
export function formatAmountDisplay(
  amount: number | string,
  locale?: string,
  minimumFractionDigits = 2
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return String(amount);

  const loc = getTranslations(locale).locale;
  const bcp47Map: Record<SupportedLocale, string> = {
    es: 'es-ES',
    en: 'en-US',
    pt: 'pt-BR',
    de: 'de-DE',
  };

  return num.toLocaleString(bcp47Map[loc] || 'en-US', {
    minimumFractionDigits,
    maximumFractionDigits: 6,
  });
}

/**
 * Formats an amount strictly for on-chain/API wire transport.
 * INVARIANT: Amounts sent to contracts or gateway APIs MUST NEVER depend on the user's locale decimal separator.
 * Always returns a standardized period (.) separated decimal string with up to 6 decimals, without grouping separators.
 */
export function formatAmountWire(amount: number | string): string {
  if (typeof amount === 'string') {
    // If it contains comma as decimal separator from accidental localized parsing, normalize it
    const trimmed = amount.trim();
    if (trimmed.includes(',') && !trimmed.includes('.')) {
      return trimmed.replace(',', '.');
    }
    // Validate that it's a valid numeric representation
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed)) {
      throw new Error(`Invalid numeric amount for wire transport: "${amount}"`);
    }
    // If already clean dot-separated decimal string, preserve precision
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    return parsed.toFixed(6).replace(/\.?0+$/, '');
  }

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || isNaN(amount)) {
      throw new Error(`Invalid numeric amount for wire transport: ${amount}`);
    }
    return Number.isInteger(amount) ? amount.toString() : amount.toString();
  }

  throw new Error(`Unsupported amount type for wire transport: ${typeof amount}`);
}
