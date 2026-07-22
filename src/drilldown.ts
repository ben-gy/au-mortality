// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Per-region drill-down drawer.
//
// The panel is REMOVED FROM THE DOM when closed, not parked at
// translateX(100%). An off-canvas element is still a real box on iOS Safari and
// scrolls the page sideways, and `overflow-x: clip` on the body neither fixes it
// nor lets scrollWidth detect it. Detaching is the only reliable cure.

import { barChart, lineChart, panel, sparkline } from './charts';
import { hideTooltip } from './components/tooltip';
import { rankRegions } from './analysis';
import { LEVEL_LABELS, MEASURES, MEASURE_BY_KEY, type Dataset, type MeasureKey, type Region } from './data';
import { esc, fmtNumber, fmtRate, fmtRatio } from './format';
import { term } from './glossary';
import { store } from './state';

const PANEL_MEASURES: MeasureKey[] = [
  'padAsr',
  'asr',
  'crude',
  'prematureAsr',
  'pyllRate',
  'medianAge',
  'deaths',
  'pad',
  'padPct',
  'population',
];

let overlay: HTMLDivElement | null = null;
let lastFocus: Element | null = null;

export function closeDrilldown(): void {
  if (overlay) {
    overlay.remove(); // detach, do not just hide
    overlay = null;
  }
  if (lastFocus instanceof HTMLElement) lastFocus.focus?.();
  lastFocus = null;
}

export function renderDrilldown(ds: Dataset): void {
  const { region: code, sex } = store.get();
  if (!code) {
    closeDrilldown();
    return;
  }
  const region = ds.region(code);
  if (!region) {
    closeDrilldown();
    return;
  }

  if (!overlay) lastFocus = document.activeElement;
  overlay?.remove();
  hideTooltip(); // the mark that was clicked is often still under the pointer

  const year = ds.latestYear;
  overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) store.set({ region: null });
  });

  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', `${region.name} mortality profile`);

  // Header
  const header = document.createElement('header');
  header.className = 'drawer-header';
  const title = document.createElement('div');
  title.innerHTML = `<h2></h2><p class="drawer-sub"></p>`;
  (title.querySelector('h2') as HTMLElement).textContent = region.name;
  (title.querySelector('.drawer-sub') as HTMLElement).textContent =
    `${LEVEL_LABELS[region.level]}${region.state ? ` · ${region.state}` : ''} · ${fmtNumber(
      ds.value(region, 'population', sex, year),
    )} residents`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'drawer-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => store.set({ region: null }));
  header.append(title, close);
  drawer.appendChild(header);

  const body = document.createElement('div');
  body.className = 'drawer-body';

  // ── Headline: rank on the two headline measures ────────────────────────────
  if (region.level !== 'AUS') {
    const peers = rankRegions(ds, region.level, 'padAsr', sex, year);
    const mine = peers.find((p) => p.region.code === region.code);
    const asrPeers = rankRegions(ds, region.level, 'asr', sex, year);
    const asrMine = asrPeers.find((p) => p.region.code === region.code);
    const crudePeers = rankRegions(ds, region.level, 'crude', sex, year);
    const crudeMine = crudePeers.find((p) => p.region.code === region.code);

    if (mine || asrMine) {
      const ranks = document.createElement('div');
      ranks.className = 'drawer-ranks';
      if (mine) {
        ranks.appendChild(
          rankTile('Avoidable deaths', mine.rank, peers.length, fmtRate(mine.value), 'per 100,000, age-standardised'),
        );
      }
      if (asrMine) {
        ranks.appendChild(rankTile('Death rate', asrMine.rank, asrPeers.length, fmtRate(asrMine.value), 'per 100,000, age-standardised'));
      }
      if (crudeMine && asrMine) {
        const shift = asrMine.rank - crudeMine.rank;
        const tile = document.createElement('div');
        tile.className = 'rank-tile';
        tile.setAttribute(
          'data-tip',
          `Crude rank ${crudeMine.rank}, age-standardised rank ${asrMine.rank}.\nA large gap means this region's raw death rate is mostly telling you about its age profile.`,
        );
        tile.innerHTML = `<span class="rank-label">Age effect</span><span class="rank-value"></span><span class="rank-sub"></span>`;
        (tile.querySelector('.rank-value') as HTMLElement).textContent =
          shift === 0 ? 'none' : `${shift > 0 ? '▼' : '▲'} ${Math.abs(shift)}`;
        (tile.querySelector('.rank-sub') as HTMLElement).textContent =
          shift === 0
            ? 'same rank either way'
            : shift > 0
              ? 'places better once age-adjusted'
              : 'places worse once age-adjusted';
        ranks.appendChild(tile);
      }
      body.appendChild(ranks);
    }
  }

  // ── All measures against national ──────────────────────────────────────────
  const measuresPanel = panel('Every published measure', `Compared with Australia as a whole, ${year}.`);
  const table = document.createElement('table');
  table.className = 'data-table compact';
  table.innerHTML = `<thead><tr><th scope="col">Measure</th><th scope="col" class="num">This region</th><th scope="col" class="num">Australia</th><th scope="col" class="num">Ratio</th><th scope="col">Trend</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const key of PANEL_MEASURES) {
    const def = MEASURE_BY_KEY.get(key)!;
    const v = ds.value(region, key, sex, year);
    const nat = ds.value(ds.national, key, sex, year);
    const tr = document.createElement('tr');
    tr.setAttribute('data-tip', `${def.label}\n${def.blurb}`);
    const ratio = v !== null && nat ? v / nat : null;

    const nameTd = document.createElement('td');
    nameTd.textContent = def.label;
    const vTd = document.createElement('td');
    vTd.className = 'num' + (v === null ? ' suppressed' : '');
    vTd.textContent = v === null ? 'not published' : def.decimals === 0 ? fmtNumber(v) : fmtRate(v, def.decimals);
    const nTd = document.createElement('td');
    nTd.className = 'num';
    nTd.textContent = nat === null ? '—' : def.decimals === 0 ? fmtNumber(nat) : fmtRate(nat, def.decimals);
    const rTd = document.createElement('td');
    rTd.className = 'num';
    if (ratio !== null && key !== 'deaths' && key !== 'pad' && key !== 'population') {
      rTd.textContent = fmtRatio(ratio, 2);
      const worse = def.higherIsWorse ? ratio > 1.05 : ratio < 0.95;
      const better = def.higherIsWorse ? ratio < 0.95 : ratio > 1.05;
      rTd.classList.toggle('worse', worse);
      rTd.classList.toggle('better', better);
    } else rTd.textContent = '—';
    const tTd = document.createElement('td');
    tTd.appendChild(sparkline(ds.series(region, key, sex)));

    tr.append(nameTd, vTd, nTd, rTd, tTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  scroll.appendChild(table);
  measuresPanel.appendChild(scroll);
  const supNote = document.createElement('p');
  supNote.className = 'panel-note';
  supNote.innerHTML = `"Not published" means the AIHW ${term('suppressed', 'withheld the value')} because the population is too small for a reliable figure — it is unknown, not zero.`;
  measuresPanel.appendChild(supNote);
  body.appendChild(measuresPanel);

  // ── Trend ──────────────────────────────────────────────────────────────────
  const trendPanel = panel(
    'Five years',
    `Age-standardised rates for ${esc(region.name)} against the national figure.`,
  );
  trendPanel.appendChild(
    lineChart(
      ds.years,
      [
        { name: region.name, color: '#0f766e', values: ds.series(region, 'asr', sex) },
        { name: 'Australia', color: '#9a958c', values: ds.series(ds.national, 'asr', sex), dashed: true },
        { name: `${region.name} — avoidable`, color: '#b8442a', values: ds.series(region, 'padAsr', sex) },
      ],
      { yLabel: 'per 100,000', valueFormat: (v) => v.toFixed(0), width: 640, height: 250 },
    ),
  );
  const tleg = document.createElement('div');
  tleg.className = 'legend';
  tleg.innerHTML =
    `<span class="legend-item"><i class="legend-swatch" style="background:#0f766e"></i>All deaths</span>` +
    `<span class="legend-item"><i class="legend-swatch" style="background:#b8442a"></i>Avoidable</span>` +
    `<span class="legend-item"><i class="legend-swatch" style="background:#9a958c"></i>Australia</span>`;
  trendPanel.appendChild(tleg);
  body.appendChild(trendPanel);

  // ── Leading causes ─────────────────────────────────────────────────────────
  const rows = ds.causeRows(region.code, sex);
  if (rows.length) {
    const natByCause = new Map<number, number>();
    for (const [id, , , asr] of ds.causeRows('AUS', sex)) if (asr !== null) natByCause.set(id, asr);
    const cPanel = panel(
      `Leading causes, ${ds.causes.period}`,
      `Ranked by deaths. Bars are the ${term('asr', 'age-standardised rate')}; the marker is the national rate for the same cause.`,
    );
    cPanel.appendChild(
      barChart(
        rows.slice(0, 12).map((r, i) => {
          const nat = natByCause.get(r[0]) ?? null;
          const ratio = r[3] !== null && nat ? r[3] / nat : null;
          return {
            label: `${i + 1}. ${ds.causeName(r[0])}`,
            value: r[3] ?? 0,
            color: ratio !== null && ratio > 1.15 ? '#b8442a' : '#0f766e',
            id: String(r[0]),
            tip: `${ds.causeName(r[0])}\n${fmtNumber(r[1])} deaths over ${ds.causes.period}\n${fmtRate(
              r[2],
            )}% of the region's deaths\n${fmtRate(r[3])} per 100,000 age-standardised\nNational ${fmtRate(nat)}${
              ratio ? `\n${fmtRatio(ratio, 2)} the national rate` : ''
            }\nClick to see this cause across Australia`,
          };
        }),
        {
          valueFormat: (v) => v.toFixed(1),
          onClick: (id) => store.set({ view: 'causes', cause: Number(id), region: null }),
        },
      ),
    );
    if (rows.some((r) => /suicide|self-harm/i.test(ds.causeName(r[0])))) {
      const support = document.createElement('p');
      support.className = 'support-note';
      support.innerHTML =
        'Support is available: <strong>Lifeline 13 11 14</strong>, <strong>Beyond Blue 1300 22 4636</strong>, <strong>13YARN 13 92 76</strong>.';
      cPanel.appendChild(support);
    }
    body.appendChild(cPanel);
  }

  drawer.appendChild(body);
  overlay.appendChild(drawer);
  document.body.appendChild(overlay);
  close.focus();

  void MEASURES;
}

function rankTile(label: string, rank: number, total: number, value: string, sub: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rank-tile';
  el.setAttribute('data-tip', `${label}: ${value} ${sub}\nRanked ${rank} of ${total} comparable regions (1 = highest).`);
  el.innerHTML = `<span class="rank-label"></span><span class="rank-value"></span><span class="rank-sub"></span>`;
  (el.querySelector('.rank-label') as HTMLElement).textContent = label;
  (el.querySelector('.rank-value') as HTMLElement).textContent = `#${rank}`;
  (el.querySelector('.rank-sub') as HTMLElement).textContent = `of ${total} · ${value}`;
  return el;
}

export type { Region };
