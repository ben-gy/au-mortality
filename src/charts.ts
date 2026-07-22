// Hand-rolled SVG chart builders. No chart library — every mark here needs a
// data-tip and a click target, which is easier to guarantee by building the
// nodes directly than by fighting a library's render pipeline.

import { esc } from './format';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * The map/burden ramp, cut on ratio-to-national (see analysis.ratioBucket).
 * Cool below the national rate, warm above, with a neutral step at parity — a
 * genuine two-direction scale because 1.0 is a real midpoint, not an arbitrary
 * median. Deliberately muted: these are deaths, not a sales dashboard.
 */
export const BURDEN_COLORS = ['#1f6f66', '#6aa79e', '#c3d9d3', '#f4d6a8', '#df9550', '#b8442a'];
export const NO_DATA_COLOR = '#e2e0dc';

export const BURDEN_LABELS = [
  'more than 20% below national',
  '10–20% below',
  'around national',
  'up to 15% above',
  '15–35% above',
  'more than 35% above',
];

export function burdenColor(bucket: number): string {
  return bucket < 0 ? NO_DATA_COLOR : BURDEN_COLORS[Math.min(bucket, BURDEN_COLORS.length - 1)];
}

// ── Sparkline ────────────────────────────────────────────────────────────────

/**
 * A tiny inline trend. Gaps stay gaps: a null year breaks the path rather than
 * being zero-filled, because a suppressed rate drawn as a plunge to zero
 * invents a collapse that never happened.
 */
export function sparkline(
  values: (number | null)[],
  opts: { width?: number; height?: number; color?: string } = {},
): SVGSVGElement {
  const w = opts.width ?? 84;
  const h = opts.height ?? 22;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'sparkline' });
  svg.setAttribute('aria-hidden', 'true');
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return svg;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4);

  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  svg.append(
    svgEl('path', { d, fill: 'none', stroke: opts.color ?? '#0f766e', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
  );
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
  const last = values[lastIdx];
  if (last !== null && last !== undefined) {
    svg.append(svgEl('circle', { cx: (lastIdx * step).toFixed(1), cy: y(last).toFixed(1), r: 1.9, fill: opts.color ?? '#0f766e' }));
  }
  return svg;
}

// ── Horizontal bars ──────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  tip: string;
  id?: string;
  sublabel?: string;
}

export interface BarOptions {
  max?: number;
  reference?: { value: number; label: string };
  valueFormat?: (v: number) => string;
  onClick?: (id: string) => void;
  barHeight?: number;
  labelWidth?: number;
}

/**
 * Ranked horizontal bars with the comparator drawn ON the chart, not mentioned
 * in a caption. Built as HTML rather than SVG so long region names wrap and
 * truncate with normal CSS.
 */
export function barChart(data: BarDatum[], opts: BarOptions = {}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'bar-chart';
  const max = opts.max ?? Math.max(1, ...data.map((d) => d.value));
  const fmt = opts.valueFormat ?? ((v: number) => v.toLocaleString('en-AU'));

  if (opts.reference && max > 0) {
    const ref = document.createElement('div');
    ref.className = 'bar-reference';
    // The track is what's left after the label column, the value column and the
    // two gaps — NOT the full chart width. Taking a percentage of the whole
    // element puts the comparator line in the wrong place (and off the panel
    // entirely once the value is a large share of the maximum).
    const frac = Math.max(0, Math.min(1, opts.reference.value / max));
    ref.style.left = `calc(var(--bar-label-w) + var(--space-sm) + (100% - var(--bar-label-w) - var(--bar-value-w) - 2 * var(--space-sm)) * ${frac})`;
    ref.innerHTML = `<span>${esc(opts.reference.label)}</span>`;
    wrap.appendChild(ref);
  }

  for (const d of data) {
    const row = document.createElement(opts.onClick && d.id ? 'button' : 'div');
    row.className = 'bar-row';
    if (opts.onClick && d.id) {
      (row as HTMLButtonElement).type = 'button';
      // The visible label lives in child spans, so the button itself has no
      // accessible name without this.
      row.setAttribute('aria-label', `${d.label} — ${fmt(d.value)}`);
      row.addEventListener('click', () => opts.onClick!(d.id!));
    }
    row.setAttribute('data-tip', d.tip);

    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = d.label;
    if (d.sublabel) {
      const sub = document.createElement('span');
      sub.className = 'bar-sublabel';
      sub.textContent = d.sublabel;
      label.appendChild(sub);
    }

    const track = document.createElement('span');
    track.className = 'bar-track';
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(0, Math.min(100, (d.value / max) * 100))}%`;
    if (d.color) fill.style.background = d.color;
    track.appendChild(fill);

    const val = document.createElement('span');
    val.className = 'bar-value';
    val.textContent = fmt(d.value);

    row.append(label, track, val);
    wrap.appendChild(row);
  }
  return wrap;
}

// ── Line chart ───────────────────────────────────────────────────────────────

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export interface LineOptions {
  width?: number;
  height?: number;
  yLabel?: string;
  valueFormat?: (v: number) => string;
  annotations?: { index: number; label: string }[];
  zeroBased?: boolean;
}

export function lineChart(
  xLabels: (string | number)[],
  series: LineSeries[],
  opts: LineOptions = {},
): SVGSVGElement {
  const w = opts.width ?? 760;
  const h = opts.height ?? 300;
  const m = { top: 24, right: 18, bottom: 34, left: 56 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;
  const fmt = opts.valueFormat ?? ((v: number) => v.toLocaleString('en-AU'));

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'line-chart', role: 'img' });
  if (!all.length) return svg;

  let lo = opts.zeroBased ? 0 : Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  if (!opts.zeroBased) lo -= pad;
  hi += pad;
  const span = hi - lo || 1;

  const x = (i: number) => m.left + (xLabels.length > 1 ? (i / (xLabels.length - 1)) * iw : iw / 2);
  const y = (v: number) => m.top + ih - ((v - lo) / span) * ih;

  // Gridlines + y axis
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = lo + (span * t) / ticks;
    const gy = y(v);
    svg.append(svgEl('line', { x1: m.left, x2: m.left + iw, y1: gy, y2: gy, class: 'grid-line' }));
    const lab = svgEl('text', { x: m.left - 8, y: gy + 4, class: 'axis-label', 'text-anchor': 'end' });
    lab.textContent = fmt(v);
    svg.append(lab);
  }
  if (opts.yLabel) {
    const yl = svgEl('text', { x: 4, y: 14, class: 'axis-title' });
    yl.textContent = opts.yLabel;
    svg.append(yl);
  }

  // x axis
  xLabels.forEach((l, i) => {
    const t = svgEl('text', { x: x(i), y: m.top + ih + 20, class: 'axis-label', 'text-anchor': 'middle' });
    t.textContent = String(l);
    svg.append(t);
  });

  for (const a of opts.annotations ?? []) {
    const ax = x(a.index);
    svg.append(svgEl('line', { x1: ax, x2: ax, y1: m.top, y2: m.top + ih, class: 'annotation-line' }));
    const t = svgEl('text', { x: ax + 4, y: m.top + 10, class: 'annotation-label' });
    t.textContent = a.label;
    svg.append(t);
  }

  for (const s of series) {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    const path = svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round' });
    if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
    svg.append(path);

    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const dot = svgEl('circle', { cx: x(i), cy: y(v), r: 4.5, fill: s.color, class: 'line-dot' });
      dot.setAttribute('data-tip', `${s.name}\n${xLabels[i]}: ${fmt(v)}`);
      svg.append(dot);
    });
  }
  return svg;
}

// ── Legend ───────────────────────────────────────────────────────────────────

export function legend(items: { color: string; label: string }[], note?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'legend';
  for (const it of items) {
    const span = document.createElement('span');
    span.className = 'legend-item';
    span.innerHTML = `<i class="legend-swatch" style="background:${esc(it.color)}"></i>${esc(it.label)}`;
    el.appendChild(span);
  }
  if (note) {
    const n = document.createElement('span');
    n.className = 'legend-note';
    n.textContent = note;
    el.appendChild(n);
  }
  return el;
}

/** Standard view heading: title, one-line explanation of what it shows. */
export function viewHeader(title: string, subtitle: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'view-header';
  el.innerHTML = `<h2>${esc(title)}</h2><p>${subtitle}</p>`;
  return el;
}

export function panel(title?: string, subtitle?: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'panel';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'panel-title';
    h.innerHTML = title;
    el.appendChild(h);
  }
  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'panel-subtitle';
    p.innerHTML = subtitle;
    el.appendChild(p);
  }
  return el;
}
