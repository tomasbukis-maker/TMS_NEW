/**
 * Formatuoja pinigų sumą: visada fiksuotas skaitmenų po kablelio skaičius,
 * dešimtainis skyriklis (kablelis arba taškas) ir valiuta.
 * Pvz.: 23,50 EUR
 */

export interface FormatMoneyOptions {
  /** Skaitmenų po kablelio (0–6). Default: 2 */
  decimalPlaces?: number;
  /** Dešimtainis skyriklis: ',' arba '.' Default: ',' */
  decimalSeparator?: ',' | '.';
  /** Valiutos kodas (pvz. EUR, USD). Default: 'EUR' */
  currencyCode?: string;
  /** Valiutos simbolis (pvz. €, $). Jei nurodytas, rodomas vietoj currencyCode */
  currencySymbol?: string;
  /** Jei true, rodoma tik skaičius (be valiutos). Default: false */
  noCurrency?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<FormatMoneyOptions, 'currencySymbol'>> & { currencySymbol: string } = {
  decimalPlaces: 2,
  decimalSeparator: ',',
  currencyCode: 'EUR',
  currencySymbol: '', // tuščias = rodomas currencyCode (EUR)
  noCurrency: false,
};

/**
 * Formatuoja sumą į eilutę, pvz. "23,50 EUR" arba "23,50 €".
 * Reikšmė visada apvalinama iki nurodyto skaitmenų po kablelio (default 2).
 */
export function formatMoney(
  value: string | number | null | undefined,
  options?: FormatMoneyOptions
): string {
  if (value === null || value === undefined || value === '') {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const zero = (0).toFixed(opts.decimalPlaces).replace('.', opts.decimalSeparator);
    if (opts.noCurrency) return zero;
    const curr = opts.currencySymbol || opts.currencyCode;
    return `${zero} ${curr}`.trim();
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const zero = (0).toFixed(opts.decimalPlaces).replace('.', opts.decimalSeparator);
    if (opts.noCurrency) return zero;
    const curr = opts.currencySymbol || opts.currencyCode;
    return `${zero} ${curr}`.trim();
  }
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const decimalPlaces = Math.min(6, Math.max(0, opts.decimalPlaces));
  const fixed = num.toFixed(decimalPlaces);
  const formatted = opts.decimalSeparator === ','
    ? fixed.replace('.', ',')
    : fixed;
  if (opts.noCurrency) return formatted;
  const curr = (opts.currencySymbol && opts.currencySymbol.trim()) ? opts.currencySymbol.trim() : opts.currencyCode;
  return `${formatted} ${curr}`.trim();
}

/**
 * Grąžina nustatymus iš API atsakymo (invoice settings) formatMoney options.
 * Naudoti, kai norima rodyti sumas pagal sistemos nustatymus.
 */
export function formatMoneyOptionsFromSettings(settings: {
  currency_code?: string;
  currency_symbol?: string;
  decimal_places?: number;
  decimal_separator?: string;
} | null): FormatMoneyOptions {
  if (!settings) return {};
  return {
    currencyCode: settings.currency_code || 'EUR',
    currencySymbol: (settings.currency_symbol ?? '€') || undefined,
    decimalPlaces: settings.decimal_places ?? 2,
    decimalSeparator: (settings.decimal_separator === '.' ? '.' : ',') as ',' | '.',
  };
}
