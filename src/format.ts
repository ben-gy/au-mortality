// Formatting helpers. Every one of them takes null seriously: the AIHW
// suppresses rates for small populations, and a suppressed value must read as
// "not published", never as 0.

export const NOT_PUBLISHED = 'not published';

export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtRate(v: number | null | undefined, decimals = 1): string {
  return fmtNumber(v, decimals);
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${fmtNumber(v, decimals)}%`;
}

export function fmtSigned(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${fmtNumber(v, decimals)}`;
}

/** "2.8x" — used constantly for gradient ratios. */
export function fmtRatio(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${fmtNumber(v, decimals)}×`;
}

export function fmtOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * Escape for innerHTML. Also used on every data-derived string that reaches an
 * attribute — region and cause names contain apostrophes ("Alzheimer's") and
 * ampersands that break unescaped markup.
 */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * data-tip via innerHTML needs newlines as entities; the SAME string passed to
 * setAttribute needs REAL newlines. Two functions, deliberately — using the
 * wrong one renders a literal "&#10;" in the tooltip.
 */
export function tipAttr(text: string): string {
  return esc(text).replace(/\n/g, '&#10;');
}

export function setTip(el: Element, text: string): void {
  el.setAttribute('data-tip', text);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}
