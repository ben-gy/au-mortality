import { panel, sparkline, viewHeader } from '../charts';
import { LEVEL_PLURAL, LEVEL_PLURAL_INLINE, MEASURE_BY_KEY, type Dataset, type Level, type MeasureKey, type Region } from '../data';
import { fmtNumber, fmtRate } from '../format';
import { store } from '../state';
import { clearBinFilter, empty, getBinFilter, segmented } from './rankings';

const COLUMNS: { key: MeasureKey; label: string }[] = [
  { key: 'padAsr', label: 'Avoidable' },
  { key: 'asr', label: 'Standardised' },
  { key: 'crude', label: 'Crude' },
  { key: 'prematureAsr', label: 'Premature' },
  { key: 'pyllRate', label: 'Years lost' },
  { key: 'medianAge', label: 'Median age' },
  { key: 'deaths', label: 'Deaths' },
  { key: 'population', label: 'Population' },
];

const LEVELS: Level[] = ['SA3', 'LGA', 'SA4', 'PHN', 'GCCSA', 'STE'];

let debounce: number | undefined;

/**
 * Sort rows for the table.
 *
 * 'desc' must put the LARGEST value first — the header caret says ▼ and the
 * reader believes it. Getting the sign backwards here silently inverted every
 * default view: the Explorer opened on the healthiest regions while claiming to
 * be sorted descending by avoidable deaths.
 *
 * Suppressed values sink to the bottom in BOTH directions. They are unknown, so
 * they must never surface as either the best or the worst region.
 */
export function sortRegions(
  ds: Dataset,
  regions: Region[],
  sortKey: MeasureKey,
  sex: 'P' | 'M' | 'F',
  year: number,
  sortDir: 'asc' | 'desc',
): Region[] {
  const dir = sortDir === 'desc' ? 1 : -1;
  return [...regions].sort((a, b) => {
    const av = ds.value(a, sortKey, sex, year);
    const bv = ds.value(b, sortKey, sex, year);
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return (bv - av) * dir || a.name.localeCompare(b.name);
  });
}

export function renderExplorer(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const level = LEVELS.includes(state.level) ? state.level : 'SA3';
  const sex = state.sex;
  const year = ds.latestYear;

  root.appendChild(
    viewHeader(
      'Explorer',
      `Every published measure for every region. Search by name, sort by any column, click a row for the full profile. Sparklines show ${ds.years[0]}–${
        ds.years[ds.years.length - 1]
      } — a gap means the value was withheld that year, not that it fell to zero.`,
    ),
  );

  const controls = document.createElement('div');
  controls.className = 'control-row';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'control-group';
  const searchLabel = document.createElement('label');
  searchLabel.className = 'control-label';
  searchLabel.textContent = 'Search';
  searchLabel.htmlFor = 'explorer-search';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'explorer-search';
  input.className = 'search-input';
  input.placeholder = 'Region or council name…';
  input.value = state.search;
  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => store.set({ search: input.value }), 300);
  });
  searchWrap.append(searchLabel, input);
  controls.appendChild(searchWrap);

  controls.appendChild(
    segmented(
      'Geography',
      LEVELS.map((l) => ({ id: l, label: l, tip: LEVEL_PLURAL[l], active: l === level })),
      (id) => store.set({ level: id as Level }),
    ),
  );
  root.appendChild(controls);

  // Rows
  const q = state.search.trim().toLowerCase();
  let regions = ds.byLevel(level);
  if (q) regions = regions.filter((r) => r.name.toLowerCase().includes(q) || (r.state ?? '').toLowerCase().includes(q));

  const bin = getBinFilter();
  if (bin) {
    regions = regions.filter((r) => {
      const v = ds.value(r, bin.measure, sex, year);
      return v !== null && v >= bin.lo && v <= bin.hi;
    });
  }

  const sortKey = (COLUMNS.some((c) => c.key === state.sort) ? state.sort : 'padAsr') as MeasureKey;
  const sorted = sortRegions(ds, regions, sortKey, sex, year, state.sortDir);

  const p = panel();
  const head = document.createElement('div');
  head.className = 'table-toolbar';
  const count = document.createElement('span');
  count.className = 'table-count';
  count.textContent = `${sorted.length} of ${ds.byLevel(level).length} ${LEVEL_PLURAL_INLINE[level]}`;
  head.appendChild(count);
  if (bin) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    const def = MEASURE_BY_KEY.get(bin.measure)!;
    chip.innerHTML = `${def.short} ${fmtRate(bin.lo, def.decimals)}–${fmtRate(bin.hi, def.decimals)} <span aria-hidden="true">×</span>`;
    chip.setAttribute('aria-label', 'Clear the value filter');
    chip.addEventListener('click', () => {
      clearBinFilter();
      store.set({ search: state.search });
      rerender();
    });
    head.appendChild(chip);
  }
  p.appendChild(head);

  if (!sorted.length) {
    p.appendChild(empty('No regions match. Try a shorter search, or clear the filter.'));
    root.appendChild(p);
    return;
  }

  const scroller = document.createElement('div');
  scroller.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  const nameTh = document.createElement('th');
  nameTh.scope = 'col';
  nameTh.textContent = 'Region';
  tr.appendChild(nameTh);
  for (const c of COLUMNS) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'num sortable' + (c.key === sortKey ? ' sorted' : '');
    const def = MEASURE_BY_KEY.get(c.key)!;
    th.setAttribute('data-tip', `${def.label}\n${def.blurb}\nClick to sort`);
    th.setAttribute('tabindex', '0');
    th.setAttribute('role', 'button');
    th.textContent = c.label;
    if (c.key === sortKey) {
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.textContent = state.sortDir === 'asc' ? ' ▲' : ' ▼';
      th.appendChild(caret);
    }
    const doSort = () =>
      store.set(
        c.key === sortKey
          ? { sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' }
          : { sort: c.key, sortDir: 'desc' },
      );
    th.addEventListener('click', doSort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doSort();
      }
    });
    tr.appendChild(th);
  }
  const trendTh = document.createElement('th');
  trendTh.scope = 'col';
  trendTh.textContent = 'Trend';
  trendTh.setAttribute('data-tip', `${MEASURE_BY_KEY.get(sortKey)!.label}, ${ds.years[0]}–${ds.years[ds.years.length - 1]}`);
  tr.appendChild(trendTh);
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const r of sorted.slice(0, 400)) {
    tbody.appendChild(row(ds, r, sortKey, sex, year));
  }
  table.appendChild(tbody);
  scroller.appendChild(table);
  p.appendChild(scroller);

  if (sorted.length > 400) {
    const more = document.createElement('p');
    more.className = 'panel-note';
    more.textContent = `Showing the first 400 of ${sorted.length}. Search to narrow the list.`;
    p.appendChild(more);
  }
  root.appendChild(p);
}

function row(ds: Dataset, r: Region, sortKey: MeasureKey, sex: 'P' | 'M' | 'F', year: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'clickable';
  tr.tabIndex = 0;
  // The row is focusable and activates on Enter, so it needs a name a screen
  // reader can announce — the cells alone read as a wall of numbers.
  tr.setAttribute('role', 'button');
  tr.setAttribute('aria-label', `${r.name}${r.state ? `, ${r.state}` : ''} — open full profile`);
  tr.setAttribute('data-tip', `${r.name}${r.state ? ` (${r.state})` : ''}\nClick for the full profile`);

  const nameTd = document.createElement('td');
  const nm = document.createElement('span');
  nm.className = 'region-name';
  nm.textContent = r.name;
  const st = document.createElement('span');
  st.className = 'region-state';
  st.textContent = r.state ?? '';
  nameTd.append(nm, st);
  tr.appendChild(nameTd);

  for (const c of COLUMNS) {
    const def = MEASURE_BY_KEY.get(c.key)!;
    const v = ds.value(r, c.key, sex, year);
    const td = document.createElement('td');
    td.className = 'num' + (v === null ? ' suppressed' : '');
    td.textContent = v === null ? '—' : def.decimals === 0 ? fmtNumber(v) : fmtRate(v, def.decimals);
    if (v === null) td.setAttribute('data-tip', 'Not published — the population is too small for a reliable figure. This is unknown, not zero.');
    tr.appendChild(td);
  }

  const trendTd = document.createElement('td');
  trendTd.appendChild(sparkline(ds.series(r, sortKey, sex)));
  const series = ds.series(r, sortKey, sex);
  const first = series.find((v) => v !== null);
  const last = [...series].reverse().find((v) => v !== null);
  trendTd.setAttribute(
    'data-tip',
    `${MEASURE_BY_KEY.get(sortKey)!.label}\n` +
      ds.years.map((y, i) => `${y}: ${series[i] === null ? 'not published' : fmtRate(series[i], 1)}`).join('\n') +
      (first && last ? `\nChange: ${(((last - first) / first) * 100).toFixed(1)}%` : ''),
  );
  tr.appendChild(trendTd);

  tr.addEventListener('click', () => store.set({ region: r.code }));
  tr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') store.set({ region: r.code });
  });
  return tr;
}

/** Set by main.ts so the filter chip can force a redraw without a state change. */
let rerender: () => void = () => {};
export function setRerender(fn: () => void): void {
  rerender = fn;
}
