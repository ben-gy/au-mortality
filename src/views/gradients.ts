// The inequality view. Remoteness and socioeconomic position are the two
// steepest gradients in Australian mortality, and both ship pre-computed in the
// source — no joining required, no estimation, nothing to argue with.

import { lineChart, panel, svgEl, viewHeader } from '../charts';
import { MEASURE_BY_KEY, type Dataset, type Level, type MeasureKey, type SexKey } from '../data';
import { esc, fmtRate, fmtRatio } from '../format';
import { term } from '../glossary';
import { store } from '../state';
import { empty, segmented } from './rankings';

const GRADIENT_MEASURES: MeasureKey[] = ['padAsr', 'asr', 'prematureAsr', 'pyllRate', 'medianAge'];

export function renderGradients(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const measure = GRADIENT_MEASURES.includes(state.measure) ? state.measure : 'padAsr';
  const def = MEASURE_BY_KEY.get(measure)!;
  const year = ds.latestYear;

  root.appendChild(
    viewHeader(
      'Gradients',
      `The same measure, cut three ways: by ${term('remoteness', 'how remote')} a place is, by ${term(
        'seg',
        'how disadvantaged',
      )} it is, and by sex. These are the structural patterns behind every regional difference elsewhere on the site.`,
    ),
  );

  const controls = document.createElement('div');
  controls.className = 'control-row';
  controls.appendChild(
    segmented(
      'Measure',
      GRADIENT_MEASURES.map((k) => ({
        id: k,
        label: MEASURE_BY_KEY.get(k)!.short,
        tip: `${MEASURE_BY_KEY.get(k)!.label}\n${MEASURE_BY_KEY.get(k)!.blurb}`,
        active: k === measure,
      })),
      (id) => store.set({ measure: id as MeasureKey }),
    ),
  );
  root.appendChild(controls);

  const grid = document.createElement('div');
  grid.className = 'panel-grid two';
  grid.appendChild(stepPanel(ds, 'REM', 'By remoteness', measure, year));
  grid.appendChild(stepPanel(ds, 'SEG', 'By socioeconomic group', measure, year));
  root.appendChild(grid);

  root.appendChild(sexPanel(ds, measure, year));

  // Trend by group — small multiples in one chart.
  const trend = panel(
    `${def.label} over time, by remoteness`,
    `${ds.years[0]}–${ds.years[ds.years.length - 1]}. The gap between the lines is the thing to watch: parallel lines mean the disparity is stable, converging lines mean it is closing.`,
  );
  const rem = ds
    .byLevel('REM')
    .filter((r) => !r.name.includes('total'))
    .sort((a, b) => remOrder(a.name) - remOrder(b.name));
  const colours = ['#1f6f66', '#5b9c93', '#c2810f', '#df9550', '#b8442a'];
  trend.appendChild(
    lineChart(
      ds.years,
      rem.map((r, i) => ({
        name: r.name,
        color: colours[i % colours.length],
        values: ds.series(r, measure, state.sex),
      })),
      { yLabel: `${def.unit}`, valueFormat: (v) => v.toFixed(def.decimals === 0 ? 0 : 0) },
    ),
  );
  const leg = document.createElement('div');
  leg.className = 'legend';
  rem.forEach((r, i) => {
    const s = document.createElement('span');
    s.className = 'legend-item';
    s.innerHTML = `<i class="legend-swatch" style="background:${colours[i % colours.length]}"></i>${esc(r.name)}`;
    leg.appendChild(s);
  });
  trend.appendChild(leg);
  root.appendChild(trend);
}

function remOrder(name: string): number {
  const order = ['Major Cities', 'Inner Regional', 'Outer Regional', 'Remote', 'Very Remote'];
  const i = order.findIndex((o) => name.startsWith(o));
  return i < 0 ? 99 : i;
}

function segOrder(name: string): number {
  const m = name.match(/Quintile (\d)/);
  return m ? Number(m[1]) : 99;
}

/**
 * A step chart, not a bar chart: the point of a gradient is that each step
 * changes by a consistent amount, and connected steps show that where separate
 * bars do not.
 */
function stepPanel(ds: Dataset, level: Level, title: string, measure: MeasureKey, year: number): HTMLElement {
  const def = MEASURE_BY_KEY.get(measure)!;
  const sexes: SexKey[] = ['P', 'M', 'F'];
  const groups = ds
    .byLevel(level)
    .filter((r) => !r.name.includes('total'))
    .sort((a, b) => (level === 'REM' ? remOrder(a.name) - remOrder(b.name) : segOrder(a.name) - segOrder(b.name)));

  const p = panel(
    title,
    level === 'REM'
      ? 'From Major Cities to Very Remote. Based on road distance to service centres.'
      : 'Quintile 1 is the most disadvantaged fifth of areas, Quintile 5 the least.',
  );

  const values = groups.map((g) => ds.value(g, measure, 'P', year));
  if (values.every((v) => v === null)) {
    p.appendChild(empty('Not published for these groups.'));
    return p;
  }

  const W = 460;
  const H = 260;
  const m = { top: 18, right: 16, bottom: 58, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'step-chart', role: 'img', 'aria-label': title });

  const all = sexes.flatMap((s) => groups.map((g) => ds.value(g, measure, s, year))).filter((v): v is number => v !== null);
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.05;
  const span = hi - lo || 1;
  const x = (i: number) => m.left + (groups.length > 1 ? (i / (groups.length - 1)) * iw : iw / 2);
  const y = (v: number) => m.top + ih - ((v - lo) / span) * ih;

  for (let t = 0; t <= 4; t++) {
    const v = lo + (span * t) / 4;
    const gy = y(v);
    svg.append(svgEl('line', { x1: m.left, x2: m.left + iw, y1: gy, y2: gy, class: 'grid-line' }));
    const lab = svgEl('text', { x: m.left - 7, y: gy + 4, class: 'axis-label', 'text-anchor': 'end' });
    lab.textContent = v.toFixed(0);
    svg.append(lab);
  }

  const sexColour: Record<SexKey, string> = { P: '#1f2937', M: '#4c6ef5', F: '#b8442a' };
  for (const s of sexes) {
    const pts = groups.map((g, i) => ({ i, v: ds.value(g, measure, s, year) }));
    let d = '';
    let pen = false;
    for (const pt of pts) {
      if (pt.v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(pt.i).toFixed(1)} ${y(pt.v).toFixed(1)}`;
      pen = true;
    }
    svg.append(
      svgEl('path', {
        d,
        fill: 'none',
        stroke: sexColour[s],
        'stroke-width': s === 'P' ? 2.6 : 1.6,
        'stroke-dasharray': s === 'P' ? '' : '4 3',
        'stroke-linejoin': 'round',
      }),
    );
    for (const pt of pts) {
      if (pt.v === null) continue;
      const c = svgEl('circle', { cx: x(pt.i), cy: y(pt.v), r: s === 'P' ? 5 : 3.4, fill: sexColour[s], class: 'step-dot' });
      const natV = ds.value(ds.national, measure, s, year);
      c.setAttribute(
        'data-tip',
        `${groups[pt.i].name}\n${s === 'P' ? 'All people' : s === 'M' ? 'Males' : 'Females'}\n${def.label}: ${fmtRate(
          pt.v,
          def.decimals,
        )} ${def.unit}${natV ? `\n${fmtRatio(pt.v / natV, 2)} the national figure` : ''}`,
      );
      svg.append(c);
    }
  }

  groups.forEach((g, i) => {
    const t = svgEl('text', { x: x(i), y: m.top + ih + 18, class: 'axis-label step-tick', 'text-anchor': 'middle' });
    t.textContent = shortGroup(g.name);
    svg.append(t);
  });

  p.appendChild(svg);

  const leg = document.createElement('div');
  leg.className = 'legend';
  leg.innerHTML =
    '<span class="legend-item"><i class="legend-swatch" style="background:#1f2937"></i>All people</span>' +
    '<span class="legend-item"><i class="legend-swatch" style="background:#4c6ef5"></i>Males</span>' +
    '<span class="legend-item"><i class="legend-swatch" style="background:#b8442a"></i>Females</span>';
  p.appendChild(leg);

  const first = ds.value(groups[0], measure, 'P', year);
  const last = ds.value(groups[groups.length - 1], measure, 'P', year);
  if (first && last) {
    const note = document.createElement('p');
    note.className = 'panel-note';
    // Remoteness runs best-to-worst and socioeconomic quintiles run
    // worst-to-best, so a fixed last/first ratio reports one of them upside
    // down ("0.42× difference"). Always state the larger over the smaller.
    const hi = Math.max(first, last);
    const lo = Math.min(first, last);
    const hiName = shortGroup((first >= last ? groups[0] : groups[groups.length - 1]).name);
    const loName = shortGroup((first >= last ? groups[groups.length - 1] : groups[0]).name);
    note.textContent = `${fmtRatio(hi / lo, 2)} difference end to end — ${fmtRate(hi, def.decimals)} in ${hiName} against ${fmtRate(
      lo,
      def.decimals,
    )} in ${loName}.`;
    p.appendChild(note);
  }
  return p;
}

function shortGroup(name: string): string {
  return name
    .replace(' of Australia', '')
    .replace(' Australia', '')
    .replace('Quintile ', 'Q')
    .replace(' (lowest)', ' low')
    .replace(' (highest)', ' high');
}

function sexPanel(ds: Dataset, measure: MeasureKey, year: number): HTMLElement {
  const def = MEASURE_BY_KEY.get(measure)!;
  const p = panel(
    'The sex gap, state by state',
    `${def.label} for males against females. The diagonal is parity — every point below it is a state where men fare worse.`,
  );

  const states = ds.byLevel('STE').filter((r) => r.name !== 'Other Territories');
  const pts = states
    .map((r) => ({ r, m: ds.value(r, measure, 'M', year), f: ds.value(r, measure, 'F', year) }))
    .filter((d): d is { r: (typeof states)[0]; m: number; f: number } => d.m !== null && d.f !== null);

  if (!pts.length) {
    p.appendChild(empty('Not published by sex for this measure.'));
    return p;
  }

  const W = 700;
  const H = 380;
  const m = { top: 20, right: 24, bottom: 46, left: 62 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const all = pts.flatMap((d) => [d.m, d.f]);
  const lo = Math.min(...all) * 0.92;
  const hi = Math.max(...all) * 1.06;
  const span = hi - lo || 1;
  const x = (v: number) => m.left + ((v - lo) / span) * iw;
  const y = (v: number) => m.top + ih - ((v - lo) / span) * ih;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scatter-chart', role: 'img', 'aria-label': 'Male against female rates by state' });

  svg.append(svgEl('line', { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), class: 'parity-line' }));
  const parityLabel = svgEl('text', { x: x(hi) - 8, y: y(hi) + 18, class: 'annotation-label', 'text-anchor': 'end' });
  parityLabel.textContent = 'equal rates';
  svg.append(parityLabel);

  for (let t = 0; t <= 4; t++) {
    const v = lo + (span * t) / 4;
    svg.append(svgEl('line', { x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v), class: 'grid-line' }));
    const yl = svgEl('text', { x: m.left - 8, y: y(v) + 4, class: 'axis-label', 'text-anchor': 'end' });
    yl.textContent = v.toFixed(0);
    const xl = svgEl('text', { x: x(v), y: m.top + ih + 18, class: 'axis-label', 'text-anchor': 'middle' });
    xl.textContent = v.toFixed(0);
    svg.append(yl, xl);
  }

  const xTitle = svgEl('text', { x: m.left + iw / 2, y: H - 8, class: 'axis-title', 'text-anchor': 'middle' });
  xTitle.textContent = `Males — ${def.unit}`;
  const yTitle = svgEl('text', { x: 12, y: 14, class: 'axis-title' });
  yTitle.textContent = `Females — ${def.unit}`;
  svg.append(xTitle, yTitle);

  for (const d of pts) {
    const g = svgEl('g', { class: 'scatter-point' });
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute(
      'data-tip',
      `${d.r.name}\nMales ${fmtRate(d.m, def.decimals)} ${def.unit}\nFemales ${fmtRate(d.f, def.decimals)} ${def.unit}\n${fmtRatio(
        d.m / d.f,
        2,
      )} male-to-female ratio\nClick for the full profile`,
    );
    g.append(svgEl('circle', { cx: x(d.m), cy: y(d.f), r: 7, fill: '#0f766e', 'fill-opacity': 0.85 }));
    const lbl = svgEl('text', { x: x(d.m) + 11, y: y(d.f) + 4, class: 'scatter-label' });
    lbl.textContent = d.r.state ?? d.r.name;
    g.append(lbl);
    g.addEventListener('click', () => store.set({ region: d.r.code }));
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') store.set({ region: d.r.code });
    });
    svg.append(g);
  }

  p.appendChild(svg);
  const natM = ds.value(ds.national, measure, 'M', year);
  const natF = ds.value(ds.national, measure, 'F', year);
  if (natM && natF) {
    const note = document.createElement('p');
    note.className = 'panel-note';
    note.textContent = `Nationally, the male figure is ${fmtRatio(natM / natF, 2)} the female one (${fmtRate(
      natM,
      def.decimals,
    )} against ${fmtRate(natF, def.decimals)}). The gap is consistently widest for avoidable causes.`;
    p.appendChild(note);
  }
  return p;
}
