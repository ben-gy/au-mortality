// The Age Illusion — the site's signature view.
//
// Why a slope chart and not a scatter: a scatter of crude rate against
// age-standardised rate shows they correlate, which is true and useless. The
// point of this dataset is that INDIVIDUAL REGIONS SWAP ENDS OF THE TABLE when
// you correct for age. Only connected rank lines make a crossing visible, and
// the crossing is the whole argument.

import { panel, svgEl, viewHeader } from '../charts';
import type { Dataset, Region } from '../data';
import { esc, fmtNumber, fmtRate } from '../format';
import { term } from '../glossary';
import { rankFlips, type RankFlip } from '../analysis';
import { store } from '../state';
import { attachSvgZoom } from '../utils/svgZoom';

const MASKED = '#b8442a'; // young population hiding a high death rate
const INFLATED = '#1f6f66'; // old population inflating the raw rate
const NEUTRAL = '#c9c5be';
const HIGHLIGHT_COUNT = 10;
const MIN_POP = 15_000;

export function renderIllusion(ds: Dataset, root: HTMLElement): void {
  const { sex } = store.get();
  const year = ds.latestYear;

  root.appendChild(
    viewHeader(
      'The Age Illusion',
      `A raw death rate mostly measures how <em>old</em> a place is. Below, every SA3 region is ranked twice for ${year} — once on its ${term(
        'crude',
        'crude death rate',
      )} and once ${term('asr', 'age-standardised')} — and joined by a line. Where the lines cross, the story changes.`,
    ),
  );

  // The population floor is applied INSIDE rankFlips so both ranks are out of
  // the same denominator as the count shown to the reader.
  const flips = rankFlips(ds, 'SA3', sex, year, (r) => (ds.value(r, 'population', sex, year) ?? 0) >= MIN_POP);

  if (flips.length < 2) {
    root.appendChild(emptyState('Not enough regions have both rates published for this selection.'));
    return;
  }

  const masked = [...flips].sort((a, b) => a.shift - b.shift).slice(0, HIGHLIGHT_COUNT);
  const inflated = [...flips].sort((a, b) => b.shift - a.shift).slice(0, HIGHLIGHT_COUNT);
  const highlighted = new Map<string, string>();
  for (const f of masked) highlighted.set(f.region.code, MASKED);
  for (const f of inflated) highlighted.set(f.region.code, INFLATED);

  // ── Explainer ──────────────────────────────────────────────────────────────
  const explain = document.createElement('div');
  explain.className = 'explainer';
  const worst = masked[0];
  const oldest = inflated[0];
  explain.innerHTML = `
    <div class="explainer-item">
      <span class="explainer-swatch" style="background:${MASKED}"></span>
      <div>
        <strong>Moves up the table when age is accounted for</strong>
        <p>A young population masks a high death rate. ${esc(worst.region.name)} ranks
        ${ordinal(worst.crudeRank)} of ${flips.length} on the raw rate and
        ${ordinal(worst.asrRank)} once standardised — a jump of ${Math.abs(worst.shift)} places.</p>
      </div>
    </div>
    <div class="explainer-item">
      <span class="explainer-swatch" style="background:${INFLATED}"></span>
      <div>
        <strong>Moves down the table when age is accounted for</strong>
        <p>An older population inflates the raw rate. ${esc(oldest.region.name)} ranks
        ${ordinal(oldest.crudeRank)} on the raw rate and ${ordinal(oldest.asrRank)} once
        standardised — it is a retirement destination, not an unhealthy one.</p>
      </div>
    </div>`;
  root.appendChild(explain);

  // ── The chart ──────────────────────────────────────────────────────────────
  const chartPanel = panel(
    `Crude rank versus age-standardised rank, ${year}`,
    `Each line is one SA3 region with at least ${fmtNumber(MIN_POP)} residents (${flips.length} regions). Rank 1 is the highest death rate. Hover any line for the numbers; click to open the region.`,
  );
  chartPanel.classList.add('chart-panel');

  const wrap = document.createElement('div');
  wrap.className = 'slope-wrap';
  wrap.appendChild(buildSlope(ds, flips, highlighted, sex, year));
  chartPanel.appendChild(wrap);

  const note = document.createElement('p');
  note.className = 'panel-note';
  const bigMovers = flips.filter((f) => Math.abs(f.shift) >= 50).length;
  note.innerHTML = `${bigMovers} of ${flips.length} regions move at least 50 places between the two rankings — which is why this site never ranks anywhere on the crude rate. ${term(
    'suppressed',
    'Regions with a suppressed rate',
  )} and those under ${fmtNumber(MIN_POP)} people are excluded, because rank movement in a tiny population is mostly noise.`;
  chartPanel.appendChild(note);
  root.appendChild(chartPanel);

  // ── The two lists ──────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'panel-grid two';
  grid.appendChild(flipList(ds, masked, 'Hidden burden', 'Ranked far worse once age is accounted for. A young population was masking the death rate.', MASKED, sex, year));
  grid.appendChild(
    flipList(ds, inflated, 'Just older', 'Ranked far better once age is accounted for. The raw rate was high simply because residents are older.', INFLATED, sex, year),
  );
  root.appendChild(grid);
}

function buildSlope(
  ds: Dataset,
  flips: RankFlip[],
  highlighted: Map<string, string>,
  sex: 'P' | 'M' | 'F',
  year: number,
): SVGSVGElement {
  const n = flips.length;
  const w = 900;
  const rowH = 2.15;
  const h = Math.max(420, n * rowH + 90);
  const m = { top: 54, bottom: 30, left: 210, right: 210 };
  const ih = h - m.top - m.bottom;
  const xL = m.left;
  const xR = w - m.right;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${w} ${h}`,
    class: 'slope-chart',
    role: 'img',
    'aria-label': 'Slope chart comparing each region’s crude death rate rank with its age-standardised rank',
  });

  const y = (rank: number) => m.top + ((rank - 1) / Math.max(1, n - 1)) * ih;

  // Axis headings
  const headL = svgEl('text', { x: xL, y: 26, class: 'slope-axis-title', 'text-anchor': 'end' });
  headL.textContent = 'Crude death rate rank';
  const headR = svgEl('text', { x: xR, y: 26, class: 'slope-axis-title', 'text-anchor': 'start' });
  headR.textContent = 'Age-standardised rank';
  const subL = svgEl('text', { x: xL, y: 42, class: 'slope-axis-sub', 'text-anchor': 'end' });
  subL.textContent = 'what the raw numbers say';
  const subR = svgEl('text', { x: xR, y: 42, class: 'slope-axis-sub', 'text-anchor': 'start' });
  subR.textContent = 'what is actually happening';
  svg.append(headL, headR, subL, subR);

  svg.append(svgEl('line', { x1: xL, x2: xL, y1: m.top, y2: m.top + ih, class: 'slope-axis' }));
  svg.append(svgEl('line', { x1: xR, x2: xR, y1: m.top, y2: m.top + ih, class: 'slope-axis' }));

  // Rank gridlines every 50
  for (let r = 1; r <= n; r += 50) {
    const gy = y(r);
    svg.append(svgEl('line', { x1: xL, x2: xR, y1: gy, y2: gy, class: 'slope-grid' }));
    const t1 = svgEl('text', { x: xL - 8, y: gy + 3, class: 'slope-rank-label', 'text-anchor': 'end' });
    t1.textContent = `#${r}`;
    const t2 = svgEl('text', { x: xR + 8, y: gy + 3, class: 'slope-rank-label', 'text-anchor': 'start' });
    t2.textContent = `#${r}`;
    svg.append(t1, t2);
  }

  const gBack = svgEl('g', { class: 'slope-back' });
  const gFront = svgEl('g', { class: 'slope-front' });
  svg.append(gBack, gFront);

  // Labels are collected and placed AFTER every line is positioned, so they can
  // be pushed apart. Drawn inline they collide — the highlighted regions are by
  // definition clustered at the ends of both axes.
  interface Label { side: 'L' | 'R'; y: number; name: string; colour: string; g: SVGGElement }
  const labels: Label[] = [];

  for (const f of flips) {
    const colour = highlighted.get(f.region.code);
    const y1 = y(f.crudeRank);
    const y2 = y(f.asrRank);
    const g = svgEl('g', { class: 'slope-line' + (colour ? ' is-highlighted' : '') });
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${f.region.name}: crude rank ${f.crudeRank}, age-standardised rank ${f.asrRank}`);
    g.setAttribute(
      'data-tip',
      `${f.region.name}${f.region.state ? ` (${f.region.state})` : ''}\n` +
        `Crude rate ${fmtRate(f.crude)} per 100,000 — rank ${f.crudeRank} of ${n}\n` +
        `Age-standardised ${fmtRate(f.asr)} per 100,000 — rank ${f.asrRank} of ${n}\n` +
        `${f.shift === 0 ? 'No change' : `${Math.abs(f.shift)} places ${f.shift < 0 ? 'worse' : 'better'} once age is accounted for`}\n` +
        `Median age at death ${fmtRate(ds.value(f.region, 'medianAge', sex, year))}`,
    );

    // A fat transparent line makes a 1px slope hoverable and tappable.
    g.append(svgEl('line', { x1: xL, x2: xR, y1, y2, class: 'slope-hit' }));
    g.append(
      svgEl('line', {
        x1: xL,
        x2: xR,
        y1,
        y2,
        stroke: colour ?? NEUTRAL,
        'stroke-width': colour ? 1.9 : 0.8,
        'stroke-opacity': colour ? 0.95 : 0.42,
        fill: 'none',
      }),
    );
    g.append(svgEl('circle', { cx: xL, cy: y1, r: colour ? 3.2 : 1.5, fill: colour ?? NEUTRAL }));
    g.append(svgEl('circle', { cx: xR, cy: y2, r: colour ? 3.2 : 1.5, fill: colour ?? NEUTRAL }));

    if (colour) {
      labels.push({ side: 'L', y: y1, name: f.region.name, colour, g });
      labels.push({ side: 'R', y: y2, name: f.region.name, colour, g });
    }

    g.addEventListener('click', () => store.set({ region: f.region.code }));
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        store.set({ region: f.region.code });
      }
    });
    (colour ? gFront : gBack).append(g);
  }

  // De-collide, then draw a leader line from the label back to its dot so the
  // displaced text still reads as belonging to that region.
  for (const side of ['L', 'R'] as const) {
    const group = labels.filter((l) => l.side === side);
    const placed = spreadLabels(group.map((l) => l.y), 13, m.top, m.top + ih);
    group.forEach((l, i) => {
      const ly = placed[i];
      const anchorX = side === 'L' ? xL - 8 : xR + 8;
      const textX = side === 'L' ? xL - 30 : xR + 30;
      const leader = svgEl('path', {
        d: `M${anchorX} ${l.y.toFixed(1)}L${textX + (side === 'L' ? 4 : -4)} ${ly.toFixed(1)}`,
        stroke: l.colour,
        'stroke-width': 0.7,
        'stroke-opacity': 0.5,
        fill: 'none',
      });
      const t = svgEl('text', {
        x: textX,
        y: ly + 3.5,
        class: 'slope-name',
        'text-anchor': side === 'L' ? 'end' : 'start',
        fill: l.colour,
      });
      t.textContent = l.name;
      l.g.append(leader, t);
    });
  }

  queueMicrotask(() => attachSvgZoom(svg, { maxScale: 6 }));
  return svg;
}

/**
 * Greedy vertical de-collision: keep the original order, enforce a minimum gap,
 * then pull the whole run back inside the plot if it overflowed the bottom.
 */
export function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const item of order) {
    item.y = Math.max(item.y, prev + minGap);
    prev = item.y;
  }
  const overflow = order.length ? order[order.length - 1].y - hi : 0;
  if (overflow > 0) {
    // Shift up, then re-separate downward so the top stays inside too.
    for (const item of order) item.y -= overflow;
    let floor = lo;
    for (const item of order) {
      item.y = Math.max(item.y, floor);
      floor = item.y + minGap;
    }
  }
  const out = new Array<number>(ys.length);
  for (const item of order) out[item.i] = item.y;
  return out;
}

function flipList(
  ds: Dataset,
  rows: RankFlip[],
  title: string,
  subtitle: string,
  colour: string,
  sex: 'P' | 'M' | 'F',
  year: number,
): HTMLElement {
  const p = panel(`<span class="dot" style="background:${colour}"></span>${title}`, subtitle);
  const table = document.createElement('table');
  table.className = 'data-table compact';
  table.innerHTML = `<thead><tr>
      <th scope="col">Region</th>
      <th scope="col" class="num">Crude</th>
      <th scope="col" class="num">Standardised</th>
      <th scope="col" class="num">Move</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const f of rows) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.setAttribute('tabindex', '0');
    tr.setAttribute(
      'data-tip',
      `${f.region.name}\nCrude ${fmtRate(f.crude)} · standardised ${fmtRate(f.asr)} per 100,000\nMedian age at death ${fmtRate(
        ds.value(f.region, 'medianAge', sex, year),
      )}\nClick for the full profile`,
    );
    tr.innerHTML =
      `<td><span class="region-name"></span><span class="region-state"></span></td>` +
      `<td class="num">#${f.crudeRank}</td><td class="num">#${f.asrRank}</td>` +
      `<td class="num move" style="color:${colour}">${f.shift < 0 ? '▲' : '▼'} ${Math.abs(f.shift)}</td>`;
    (tr.querySelector('.region-name') as HTMLElement).textContent = f.region.name;
    (tr.querySelector('.region-state') as HTMLElement).textContent = f.region.state ?? '';
    tr.addEventListener('click', () => store.set({ region: f.region.code }));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') store.set({ region: f.region.code });
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroller = document.createElement('div');
  scroller.className = 'table-scroll';
  scroller.appendChild(table);
  p.appendChild(scroller);
  return p;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function emptyState(message: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = message;
  return el;
}

export type { Region };
