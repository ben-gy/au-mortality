// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// What Australians die of — and where each cause hits hardest.
//
// The treemap answers "what is the shape of Australian mortality"; selecting a
// cause turns the whole view into "where is this one worst", which is the
// question a health planner actually arrives with.

import { barChart, panel, svgEl, viewHeader } from '../charts';
import type { Dataset, SexKey } from '../data';
import { esc, fmtNumber, fmtRate } from '../format';
import { term } from '../glossary';
import { store } from '../state';
import { squarify } from '../utils/squarify';
import { attachSvgZoom } from '../utils/svgZoom';
import { empty } from './rankings';

const PALETTE = [
  '#0f766e', '#b8442a', '#4c6ef5', '#c2810f', '#7048a8', '#0b7285',
  '#a61e4d', '#2b8a3e', '#5f3dc4', '#d9480f', '#1864ab', '#862e9c',
  '#087f5b', '#e8590c', '#364fc7', '#6d4c1f', '#495057', '#9c36b5',
  '#0c8599', '#c92a2a',
];

const MIN_POP = 40_000;

export function renderCauses(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const sex = state.sex;
  const natRows = ds.causeRows('AUS', sex);
  const natTotals = ds.causeTotals('AUS', sex);

  root.appendChild(
    viewHeader(
      'Causes of death',
      `The twenty leading causes across ${ds.causes.period}, pooled over five years so that even small regions have stable numbers. Together they account for ${
        natTotals.top20 && natTotals.all ? ((natTotals.top20 / natTotals.all) * 100).toFixed(0) : '—'
      }% of all deaths in Australia.`,
    ),
  );

  if (!natRows.length) {
    root.appendChild(empty('Cause-of-death data is unavailable for this selection.'));
    return;
  }

  const selected = state.cause;

  // ── Treemap ────────────────────────────────────────────────────────────────
  const tmPanel = panel(
    'The shape of Australian mortality',
    `Every rectangle is one of the twenty leading causes, sized by the number of deaths over ${ds.causes.period}. Click one to see where in Australia it is deadliest.`,
  );
  tmPanel.appendChild(treemap(ds, natRows, sex, selected));
  root.appendChild(tmPanel);

  // ── Selected cause, or the ranked list ─────────────────────────────────────
  if (selected !== null && natRows.some((r) => r[0] === selected)) {
    root.appendChild(causeDetail(ds, selected, sex));
  } else {
    const listPanel = panel(
      'All twenty, ranked',
      `By ${term('asr', 'age-standardised rate')} — the fair comparison. Click any cause for its geography.`,
    );
    listPanel.appendChild(
      barChart(
        natRows.map((r, i) => ({
          label: `${i + 1}. ${ds.causeName(r[0])}`,
          sublabel: ds.causeIcd(r[0]),
          value: r[3] ?? 0,
          color: PALETTE[i % PALETTE.length],
          id: String(r[0]),
          tip: `${ds.causeName(r[0])} (${ds.causeIcd(r[0])})\n${fmtNumber(r[1])} deaths, ${ds.causes.period}\n${fmtRate(
            r[2],
          )}% of all deaths\n${fmtRate(r[3])} per 100,000 age-standardised\nClick to see where it hits hardest`,
        })),
        { valueFormat: (v) => v.toFixed(1), onClick: (id) => store.set({ cause: Number(id) }) },
      ),
    );
    root.appendChild(listPanel);
  }
}

function treemap(ds: Dataset, rows: [number, number | null, number | null, number | null][], sex: SexKey, selected: number | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'treemap-wrap';
  const W = 960;
  const H = 420;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'treemap', role: 'img', 'aria-label': 'Leading causes of death sized by deaths' });

  const items = rows.map((r, i) => ({ row: r, i })).filter((d) => (d.row[1] ?? 0) > 0);
  items.sort((a, b) => (b.row[1] ?? 0) - (a.row[1] ?? 0));
  const rects = squarify(items.map((d) => d.row[1] as number), W, H);
  const total = ds.causeTotals('AUS', sex).all ?? 0;

  rects.forEach((rect, idx) => {
    const d = items[idx];
    if (!d) return;
    const [id, deaths, , asr] = d.row;
    const g = svgEl('g', { class: 'treemap-cell' + (selected === id ? ' selected' : '') });
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${ds.causeName(id)}: ${fmtNumber(deaths)} deaths`);
    g.setAttribute(
      'data-tip',
      `${ds.causeName(id)} (${ds.causeIcd(id)})\n${fmtNumber(deaths)} deaths over ${ds.causes.period}\n${
        total ? (((deaths ?? 0) / total) * 100).toFixed(1) : '—'
      }% of all deaths\n${fmtRate(asr)} per 100,000 age-standardised\nClick to see where it hits hardest`,
    );
    g.append(
      svgEl('rect', {
        x: rect.x + 1,
        y: rect.y + 1,
        width: Math.max(0, rect.w - 2),
        height: Math.max(0, rect.h - 2),
        rx: 3,
        fill: PALETTE[idx % PALETTE.length],
        'fill-opacity': selected === null || selected === id ? 0.92 : 0.35,
      }),
    );
    if (rect.w > 66 && rect.h > 30) {
      const name = svgEl('text', { x: rect.x + 9, y: rect.y + 20, class: 'treemap-label' });
      name.textContent = truncate(ds.causeName(id), Math.floor(rect.w / 7.1));
      g.append(name);
      if (rect.h > 46) {
        const val = svgEl('text', { x: rect.x + 9, y: rect.y + 37, class: 'treemap-value' });
        val.textContent = fmtNumber(deaths);
        g.append(val);
      }
    }
    const pick = () => store.set({ cause: selected === id ? null : id });
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    svg.append(g);
  });

  wrap.appendChild(svg);
  queueMicrotask(() => attachSvgZoom(svg, { maxScale: 5 }));
  return wrap;
}

function causeDetail(ds: Dataset, causeId: number, sex: SexKey): HTMLElement {
  const name = ds.causeName(causeId);
  const icd = ds.causeIcd(causeId);
  const natRow = ds.causeRows('AUS', sex).find((r) => r[0] === causeId);
  const natAsr = natRow?.[3] ?? null;

  const p = panel(
    `Where ${esc(name.toLowerCase())} hits hardest`,
    `SA3 regions with at least ${fmtNumber(MIN_POP)} residents where ${esc(
      name.toLowerCase(),
    )} appears among the leading causes, ranked by ${term('asr', 'age-standardised rate')}. Nationally: ${fmtRate(
      natAsr,
    )} per 100,000${icd ? ` · ${term('icd', esc(icd))}` : ''}.`,
  );

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'link-btn';
  back.textContent = '← All causes';
  back.addEventListener('click', () => store.set({ cause: null }));
  p.appendChild(back);

  const rows: { name: string; state: string | null; code: string; asr: number; deaths: number | null }[] = [];
  for (const region of ds.byLevel('SA3')) {
    if ((ds.value(region, 'population', sex) ?? 0) < MIN_POP) continue;
    const row = ds.causeRows(region.code, sex).find((r) => r[0] === causeId);
    if (!row || row[3] === null) continue;
    rows.push({ name: region.name, state: region.state, code: region.code, asr: row[3], deaths: row[1] });
  }
  rows.sort((a, b) => b.asr - a.asr);

  if (!rows.length) {
    p.appendChild(
      empty(
        `${name} is not among the twenty leading causes in any SA3 region above ${fmtNumber(
          MIN_POP,
        )} people — it is a national-level cause only.`,
      ),
    );
    return p;
  }

  p.appendChild(
    barChart(
      rows.slice(0, 20).map((r, i) => ({
        label: `${i + 1}. ${r.name}`,
        sublabel: r.state ?? undefined,
        value: r.asr,
        color: natAsr && r.asr > natAsr ? '#b8442a' : '#0f766e',
        id: r.code,
        tip: `${r.name}\n${name}\n${fmtRate(r.asr)} per 100,000 age-standardised\n${fmtNumber(r.deaths)} deaths over ${
          ds.causes.period
        }${natAsr ? `\n${(r.asr / natAsr).toFixed(2)}× the national rate` : ''}\nClick for the full profile`,
      })),
      {
        valueFormat: (v) => v.toFixed(1),
        reference: natAsr ? { value: natAsr, label: 'national' } : undefined,
        onClick: (code) => store.set({ region: code }),
      },
    ),
  );

  const note = document.createElement('p');
  note.className = 'panel-note';
  note.innerHTML = `Only regions where this cause reaches the local top twenty are shown — ${rows.length} of ${
    ds.byLevel('SA3').length
  }. A region missing here is not necessarily unaffected; the cause simply did not rank locally.`;
  p.appendChild(note);

  if (/suicide|self-harm/i.test(name)) {
    const support = document.createElement('p');
    support.className = 'support-note';
    support.innerHTML =
      'If this topic affects you, support is available: <strong>Lifeline 13 11 14</strong>, <strong>Beyond Blue 1300 22 4636</strong>, <strong>13YARN 13 92 76</strong>.';
    p.appendChild(support);
  }
  return p;
}

function truncate(s: string, max: number): string {
  if (max <= 1) return '';
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…';
}
