import { barChart, panel, svgEl, viewHeader } from '../charts';
import { histogram, median, rankRegions, type Bin } from '../analysis';
import { LEVEL_PLURAL, LEVEL_PLURAL_INLINE, MEASURE_BY_KEY, type Dataset, type Level, type MeasureKey } from '../data';
import { fmtNumber, fmtRate } from '../format';
import { term } from '../glossary';
import { store } from '../state';

const RANK_MEASURES: MeasureKey[] = ['padAsr', 'asr', 'prematureAsr', 'pyllRate', 'medianAge', 'deaths'];
const RANK_LEVELS: Level[] = ['SA3', 'LGA', 'SA4', 'PHN', 'STE'];
const TOP_N = 25;
const MIN_POP = 15_000;

export function renderRankings(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const measure = RANK_MEASURES.includes(state.measure) ? state.measure : 'padAsr';
  const level = RANK_LEVELS.includes(state.level) ? state.level : 'SA3';
  const def = MEASURE_BY_KEY.get(measure)!;
  const sex = state.sex;
  const year = ds.latestYear;

  root.appendChild(
    viewHeader(
      'Rankings',
      `Every region ranked, with the national median drawn on the chart. Small regions are excluded from the SA3 and LGA boards — a rate built on a few hundred people swings wildly year to year and would fill the top of the table with noise.`,
    ),
  );

  const controls = document.createElement('div');
  controls.className = 'control-row';
  controls.appendChild(
    segmented('Measure', RANK_MEASURES.map((k) => ({
      id: k,
      label: MEASURE_BY_KEY.get(k)!.short,
      tip: `${MEASURE_BY_KEY.get(k)!.label}\n${MEASURE_BY_KEY.get(k)!.blurb}`,
      active: k === measure,
    })), (id) => store.set({ measure: id as MeasureKey })),
  );
  controls.appendChild(
    segmented('Geography', RANK_LEVELS.map((l) => ({
      id: l,
      label: l,
      tip: LEVEL_PLURAL[l],
      active: l === level,
    })), (id) => store.set({ level: id as Level })),
  );
  root.appendChild(controls);

  const useFloor = level === 'SA3' || level === 'LGA';
  const all = rankRegions(ds, level, measure, sex, year);
  const rows = useFloor
    ? all.filter((r) => (ds.value(r.region, 'population', sex, year) ?? 0) >= MIN_POP)
    : all;
  // Re-rank after filtering so "#1" means first on the board the user is seeing.
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  if (!ranked.length) {
    root.appendChild(empty('No regions have a published value for this combination.'));
    return;
  }

  const med = median(ranked.map((r) => r.value));
  const natVal = ds.value(ds.national, measure, sex, year);

  const grid = document.createElement('div');
  grid.className = 'panel-grid two';

  grid.appendChild(
    board(
      ds,
      def.higherIsWorse ? `Highest ${def.label.toLowerCase()}` : `Lowest ${def.label.toLowerCase()}`,
      ranked.slice(0, TOP_N),
      measure,
      med,
      '#b8442a',
      sex,
      year,
    ),
  );
  grid.appendChild(
    board(
      ds,
      def.higherIsWorse ? `Lowest ${def.label.toLowerCase()}` : `Highest ${def.label.toLowerCase()}`,
      ranked.slice(-TOP_N).reverse(),
      measure,
      med,
      '#1f6f66',
      sex,
      year,
    ),
  );
  root.appendChild(grid);

  // ── Distribution ───────────────────────────────────────────────────────────
  const distPanel = panel(
    `How the ${ranked.length} ${LEVEL_PLURAL_INLINE[level]} are distributed`,
    `Each bar counts regions in a band of ${def.label.toLowerCase()}. The national figure is ${fmtRate(
      natVal,
      def.decimals,
    )} and the median region is ${fmtRate(med, def.decimals)} ${def.unit} — click any bar to list those regions.`,
  );
  distPanel.appendChild(histogramChart(ds, histogram(ranked, 26), def.decimals, natVal, med, measure));
  const distNote = document.createElement('p');
  distNote.className = 'panel-note';
  distNote.innerHTML = `A long right tail here is the signature of ${term(
    'remoteness',
    'remoteness',
  )} and ${term('seg', 'disadvantage')}: most of Australia clusters, and a small number of regions sit far above everyone else.`;
  distPanel.appendChild(distNote);
  root.appendChild(distPanel);
}

function board(
  ds: Dataset,
  title: string,
  rows: { region: { code: string; name: string; state: string | null }; value: number; rank: number }[],
  measure: MeasureKey,
  med: number | null,
  colour: string,
  sex: 'P' | 'M' | 'F',
  year: number,
): HTMLElement {
  const def = MEASURE_BY_KEY.get(measure)!;
  const p = panel(title, `${def.unit === 'total' ? 'Count' : `${def.unit}, ${def.label.toLowerCase()}`}. Click a region for its profile.`);
  p.appendChild(
    barChart(
      rows.map((r) => ({
        label: `${r.rank}. ${r.region.name}`,
        sublabel: r.region.state ?? undefined,
        value: r.value,
        color: colour,
        id: r.region.code,
        tip:
          `${r.region.name}${r.region.state ? ` (${r.region.state})` : ''}\n` +
          `${def.label}: ${fmtRate(r.value, def.decimals)} ${def.unit}\n` +
          `Rank ${r.rank}\n` +
          `Population ${fmtNumber(ds.value(ds.region(r.region.code)!, 'population', sex, year))}\n` +
          `Click for the full profile`,
      })),
      {
        valueFormat: (v) => fmtRate(v, def.decimals),
        reference: med !== null ? { value: med, label: 'median' } : undefined,
        onClick: (id) => store.set({ region: id }),
      },
    ),
  );
  return p;
}

function histogramChart(
  ds: Dataset,
  bins: Bin[],
  decimals: number,
  national: number | null,
  med: number | null,
  measure: MeasureKey,
): SVGSVGElement {
  const w = 860;
  const h = 240;
  const m = { top: 16, right: 16, bottom: 46, left: 46 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'histogram', role: 'img' });
  if (!bins.length) return svg;

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const lo = bins[0].lo;
  const hi = bins[bins.length - 1].hi;
  const span = hi - lo || 1;
  const bw = iw / bins.length;
  const x = (v: number) => m.left + ((v - lo) / span) * iw;

  for (let t = 0; t <= 4; t++) {
    const c = (maxCount * t) / 4;
    const gy = m.top + ih - (c / maxCount) * ih;
    svg.append(svgEl('line', { x1: m.left, x2: m.left + iw, y1: gy, y2: gy, class: 'grid-line' }));
    const lab = svgEl('text', { x: m.left - 8, y: gy + 4, class: 'axis-label', 'text-anchor': 'end' });
    lab.textContent = String(Math.round(c));
    svg.append(lab);
  }

  bins.forEach((b, i) => {
    const bh = (b.count / maxCount) * ih;
    const g = svgEl('g', { class: 'hist-bar' + (b.count ? ' clickable' : '') });
    const rect = svgEl('rect', {
      x: m.left + i * bw + 0.6,
      y: m.top + ih - bh,
      width: Math.max(0, bw - 1.2),
      height: bh,
      rx: 1.5,
      fill: '#5b9c93',
    });
    g.append(rect);
    if (b.count) {
      g.setAttribute(
        'data-tip',
        `${fmtRate(b.lo, decimals)} – ${fmtRate(b.hi, decimals)}\n${b.count} region${b.count === 1 ? '' : 's'}\n` +
          b.items
            .slice(0, 5)
            .map((r) => r.name)
            .join(', ') +
          (b.items.length > 5 ? `, +${b.items.length - 5} more` : '') +
          '\nClick to list them in the Explorer',
      );
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute(
        'aria-label',
        `${b.count} region${b.count === 1 ? '' : 's'} between ${fmtRate(b.lo, decimals)} and ${fmtRate(
          b.hi,
          decimals,
        )} — list them`,
      );
      const openBin = () => {
        setBinFilter(b.lo, b.hi, measure);
        store.set({ view: 'explorer', sort: measure, sortDir: 'desc', search: '', measure });
      };
      g.addEventListener('click', openBin);
      g.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') openBin();
      });
    }
    svg.append(g);
  });

  // x axis ticks
  for (let t = 0; t <= 5; t++) {
    const v = lo + (span * t) / 5;
    const tx = x(v);
    const lab = svgEl('text', { x: tx, y: m.top + ih + 18, class: 'axis-label', 'text-anchor': 'middle' });
    lab.textContent = fmtRate(v, decimals === 0 ? 0 : 0);
    svg.append(lab);
  }

  // The national figure and the median region are usually within a point or two
  // of each other, so their markers land on top of one another. Stack the
  // labels on separate lines, and when the two values are visually identical,
  // draw one line labelled for both rather than two overlapping ones.
  const markers = ([
    [national, 'national', '#1f2937'],
    [med, 'median', '#b8442a'],
  ] as [number | null, string, string][]).filter(
    (mk): mk is [number, string, string] => mk[0] !== null && mk[0] >= lo && mk[0] <= hi,
  );

  const coincident =
    markers.length === 2 && Math.abs(x(markers[0][0]) - x(markers[1][0])) < 26;

  if (coincident) {
    const vx = x(markers[0][0]);
    svg.append(
      svgEl('line', { x1: vx, x2: vx, y1: m.top, y2: m.top + ih, stroke: '#1f2937', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }),
    );
    const t = svgEl('text', { x: vx + 5, y: m.top + 12, class: 'annotation-label', fill: '#1f2937' });
    t.textContent = 'national & median';
    svg.append(t);
  } else {
    markers.forEach(([value, label, colour], i) => {
      const vx = x(value);
      const nearRight = vx > m.left + iw - 70;
      svg.append(
        svgEl('line', { x1: vx, x2: vx, y1: m.top, y2: m.top + ih, stroke: colour, 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }),
      );
      const t = svgEl('text', {
        x: vx + (nearRight ? -5 : 5),
        y: m.top + 12 + i * 13,
        class: 'annotation-label',
        'text-anchor': nearRight ? 'end' : 'start',
        fill: colour,
      });
      t.textContent = label;
      svg.append(t);
    });
  }
  void ds;
  return svg;
}

/** The histogram click-through: a value band the Explorer then filters on. */
let binFilter: { lo: number; hi: number; measure: MeasureKey } | null = null;
export function setBinFilter(lo: number, hi: number, measure: MeasureKey): void {
  binFilter = { lo, hi, measure };
}
export function getBinFilter(): { lo: number; hi: number; measure: MeasureKey } | null {
  return binFilter;
}
export function clearBinFilter(): void {
  binFilter = null;
}

export function segmented(
  label: string,
  items: { id: string; label: string; tip?: string; active: boolean }[],
  onPick: (id: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'control-group';
  const l = document.createElement('span');
  l.className = 'control-label';
  l.textContent = label;
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'segmented-btn' + (it.active ? ' active' : '');
    b.textContent = it.label;
    if (it.tip) b.setAttribute('data-tip', it.tip);
    b.setAttribute('aria-pressed', String(it.active));
    b.addEventListener('click', () => onPick(it.id));
    group.appendChild(b);
  }
  wrap.append(l, group);
  return wrap;
}

export function empty(message: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = message;
  return el;
}
