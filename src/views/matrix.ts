// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Cause x geography heatmap. Answers the question neither the causes list nor
// the map can: do remote Australians die of DIFFERENT things, or the same
// things sooner? (Both — and the matrix shows which is which.)

import { panel, viewHeader } from '../charts';
import type { Dataset, Level, SexKey } from '../data';
import { esc, fmtNumber, fmtRate, fmtRatio } from '../format';
import { term } from '../glossary';
import { store } from '../state';
import { empty, segmented } from './rankings';

const MATRIX_LEVELS: { id: Level; label: string }[] = [
  { id: 'REM', label: 'Remoteness' },
  { id: 'SEG', label: 'Disadvantage' },
  { id: 'STE', label: 'State' },
];

// Diverging around parity with the national rate — the only meaningful midpoint.
const SCALE: [number, string][] = [
  [0.6, '#1f6f66'],
  [0.8, '#6aa79e'],
  [0.95, '#c3d9d3'],
  [1.05, '#f0e9dc'],
  [1.25, '#f4d6a8'],
  [1.6, '#df9550'],
  [Infinity, '#b8442a'],
];

function colourFor(ratio: number | null): string {
  if (ratio === null) return '#e2e0dc';
  for (const [max, c] of SCALE) if (ratio < max) return c;
  return SCALE[SCALE.length - 1][1];
}

export function renderMatrix(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const sex = state.sex;
  const level = MATRIX_LEVELS.some((l) => l.id === state.level) ? state.level : 'REM';

  root.appendChild(
    viewHeader(
      'Cause by group',
      `Each cell is one cause of death in one group, shaded by how its ${term(
        'asr',
        'age-standardised rate',
      )} compares with the national rate for that cause. Teal is below the national rate, rust is above.`,
    ),
  );

  const controls = document.createElement('div');
  controls.className = 'control-row';
  controls.appendChild(
    segmented(
      'Compare by',
      MATRIX_LEVELS.map((l) => ({ id: l.id, label: l.label, active: l.id === level })),
      (id) => store.set({ level: id as Level }),
    ),
  );
  root.appendChild(controls);

  const groups = ds
    .byLevel(level)
    .filter((r) => !r.name.includes('total') && r.name !== 'Other Territories')
    .sort((a, b) => order(level, a.name) - order(level, b.name));

  const natRows = ds.causeRows('AUS', sex);
  const natByCause = new Map<number, number>();
  for (const [id, , , asr] of natRows) if (asr !== null) natByCause.set(id, asr);

  if (!groups.length || !natRows.length) {
    root.appendChild(empty('Not enough data for this comparison.'));
    return;
  }

  const p = panel(
    `Leading causes by ${MATRIX_LEVELS.find((l) => l.id === level)!.label.toLowerCase()}`,
    `Rows are the twenty national leading causes over ${ds.causes.period}. A blank cell means that cause did not reach the group's own top twenty.`,
  );

  const scroller = document.createElement('div');
  scroller.className = 'matrix-scroll';
  const table = document.createElement('table');
  table.className = 'matrix-table';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'matrix-corner';
  corner.scope = 'col';
  corner.textContent = 'Cause';
  hr.appendChild(corner);
  for (const g of groups) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'matrix-head';
    th.textContent = shortName(level, g.name);
    th.setAttribute('data-tip', g.name);
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const [causeId, , , natAsr] of natRows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'matrix-row-head';
    th.textContent = ds.causeName(causeId);
    th.setAttribute('data-tip', `${ds.causeName(causeId)} (${ds.causeIcd(causeId)})\nNational: ${fmtRate(natAsr)} per 100,000`);
    tr.appendChild(th);

    for (const g of groups) {
      const row = ds.causeRows(g.code, sex).find((r) => r[0] === causeId);
      const asr = row?.[3] ?? null;
      const nat = natByCause.get(causeId) ?? null;
      const ratio = asr !== null && nat ? asr / nat : null;
      const td = document.createElement('td');
      td.className = 'matrix-cell';
      td.style.background = colourFor(ratio);
      if (asr === null) {
        td.classList.add('is-blank');
        td.setAttribute('data-tip', `${ds.causeName(causeId)}\n${g.name}\nNot among this group's leading causes`);
      } else {
        td.textContent = ratio === null ? '' : ratio.toFixed(2);
        td.classList.toggle('dark-text', ratio !== null && ratio > 0.8 && ratio < 1.6);
        td.setAttribute(
          'data-tip',
          `${ds.causeName(causeId)}\n${g.name}\n${fmtRate(asr)} per 100,000 age-standardised\nNational ${fmtRate(
            nat,
          )}\n${ratio ? fmtRatio(ratio, 2) + ' the national rate' : ''}\n${fmtNumber(row?.[1] ?? null)} deaths over ${ds.causes.period}`,
        );
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroller.appendChild(table);
  p.appendChild(scroller);

  const leg = document.createElement('div');
  leg.className = 'legend';
  for (const [label, colour] of [
    ['well below national', '#1f6f66'],
    ['below', '#6aa79e'],
    ['around national', '#f0e9dc'],
    ['above', '#df9550'],
    ['1.6× or more', '#b8442a'],
    ['not in local top 20', '#e2e0dc'],
  ] as [string, string][]) {
    const s = document.createElement('span');
    s.className = 'legend-item';
    s.innerHTML = `<i class="legend-swatch" style="background:${colour}"></i>${esc(label)}`;
    leg.appendChild(s);
  }
  p.appendChild(leg);

  const note = document.createElement('p');
  note.className = 'panel-note';
  note.innerHTML = findStory(ds, groups, natByCause, sex, level);
  p.appendChild(note);
  root.appendChild(p);
}

/** The largest divergence in the matrix, described in words. Computed, not written. */
function findStory(
  ds: Dataset,
  groups: { code: string; name: string }[],
  natByCause: Map<number, number>,
  sex: SexKey,
  level: Level,
): string {
  let best: { cause: string; group: string; ratio: number } | null = null;
  for (const g of groups) {
    for (const [id, , , asr] of ds.causeRows(g.code, sex)) {
      const nat = natByCause.get(id);
      if (asr === null || !nat) continue;
      const ratio = asr / nat;
      if (!best || ratio > best.ratio) best = { cause: ds.causeName(id), group: g.name, ratio };
    }
  }
  if (!best) return '';
  const noun = level === 'REM' ? 'remoteness group' : level === 'SEG' ? 'socioeconomic group' : 'state';
  return `The single widest divergence in this matrix: <strong>${esc(best.cause.toLowerCase())}</strong> in ${esc(
    best.group,
  )}, at ${best.ratio.toFixed(2)}× the national rate — the largest of any cause in any ${noun}.`;
}

function order(level: Level, name: string): number {
  if (level === 'REM') {
    const o = ['Major Cities', 'Inner Regional', 'Outer Regional', 'Remote', 'Very Remote'];
    const i = o.findIndex((x) => name.startsWith(x));
    return i < 0 ? 99 : i;
  }
  if (level === 'SEG') {
    const m = name.match(/Quintile (\d)/);
    return m ? Number(m[1]) : 99;
  }
  return 0;
}

function shortName(level: Level, name: string): string {
  if (level === 'REM') return name.replace(' of Australia', '').replace(' Australia', '');
  if (level === 'SEG') return name.replace('Quintile ', 'Q').replace(' (lowest)', '').replace(' (highest)', '');
  const abbr: Record<string, string> = {
    'New South Wales': 'NSW',
    Victoria: 'Vic',
    Queensland: 'Qld',
    'South Australia': 'SA',
    'Western Australia': 'WA',
    Tasmania: 'Tas',
    'Northern Territory': 'NT',
    'Australian Capital Territory': 'ACT',
  };
  return abbr[name] ?? name;
}
