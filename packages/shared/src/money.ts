/**
 * Money helpers.
 *
 * The rule this file exists to enforce: amounts are ALWAYS integers in the
 * currency's minor unit (paise, cents). Floating point cannot represent 0.1
 * exactly, so doing arithmetic on "12.30" style values accumulates rounding
 * error — a cardinal sin in anything touching payments. Razorpay's API takes
 * minor units for the same reason, so this also matches the wire format.
 *
 * Conversion to a human string happens once, at the moment of display.
 */

export const DEFAULT_CURRENCY = "inr";

/** ₹1 → 100 paise */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** 100 paise → ₹1 */
export function toMajor(minor: number): number {
  return minor / 100;
}

/**
 * Format for display, e.g. 184000000 → "₹18,40,000".
 *
 * `Intl.NumberFormat` with the en-IN locale gives the Indian digit grouping
 * (lakh/crore) rather than western thousands — a small detail that makes the
 * product feel native to its users.
 */
/**
 * Constructing an `Intl.NumberFormat` is expensive — it resolves locale data
 * every time — and this function is called from render bodies, dozens of times
 * per paint (the analytics card alone formats ~21 values, doubled again by
 * StrictMode in dev). Formatters are immutable and thread-safe to reuse, so we
 * build each distinct one once and keep it. The map is bounded by the number of
 * currency/decimals combinations in use, which is effectively one.
 */
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(
  currency: string,
  showDecimals: boolean,
): Intl.NumberFormat {
  const key = `${currency}|${showDecimals}`;
  let formatter = numberFormatCache.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    });
    numberFormatCache.set(key, formatter);
  }

  return formatter;
}

export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: { showDecimals?: boolean } = {},
): string {
  const { showDecimals = false } = options;

  return currencyFormatter(currency, showDecimals).format(toMajor(minor));
}

/**
 * Compact form for tight spaces, e.g. 184000000 → "₹18.4L".
 * Uses Indian scale words because the audience is Indian donors.
 */
export function formatMoneyCompact(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const major = toMajor(minor);
  const symbol = currency.toLowerCase() === "inr" ? "₹" : "$";

  if (major >= 10_000_000) return `${symbol}${(major / 10_000_000).toFixed(1)}Cr`;
  if (major >= 100_000) return `${symbol}${(major / 100_000).toFixed(1)}L`;
  if (major >= 1_000) return `${symbol}${(major / 1_000).toFixed(1)}K`;

  return `${symbol}${Math.round(major)}`;
}

/** Progress toward a funding goal, clamped to 0–100. */
export function fundingProgress(raisedMinor: number, goalMinor: number): number {
  if (goalMinor <= 0) return 0;
  return Math.min(100, Math.round((raisedMinor / goalMinor) * 100));
}
