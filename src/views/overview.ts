// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { barChart, lineChart, panel, viewHeader } from '../charts';
import type { Dataset } from '../data';
import { fmtNumber, fmtRate } from '../format';
import { term } from '../glossary';
import { store } from '../state';

/**
 * The landing view. Answers "how many Australians die, how many of those deaths
 * didn't have to happen, and who carries that burden" — then hands off to the
 * views that go deeper. Every number is computed, never hard-coded.
 */
export function renderOverview(ds: Dataset, root: HTMLElement): void {
  const { sex } = store.get();
  const year = ds.latestYear;
  const nat = ds.national;

  root.appendChild(
    viewHeader(
      'Mortality in Australia',
      `Every measure on this site comes from the AIHW's National Mortality Database. Figures below are for ${year}; leading causes pool ${ds.causes.period} to keep small regions stable.`,
    ),
  );

  // ── Headline tiles ─────────────────────────────────────────────────────────
  const deaths = ds.value(nat, 'deaths', sex, year);
  const pad = ds.value(nat, 'pad', sex, year);
  const padPct = ds.value(nat, 'padPct', sex, year);
  const padAsr = ds.value(nat, 'padAsr', sex, year);
  const asr = ds.value(nat, 'asr', sex, year);
  const medianAge = ds.value(nat, 'medianAge', sex, year);
  const pyll = ds.value(nat, 'pyll', sex, year);

  const tiles = document.createElement('div');
  tiles.className = 'stat-grid';
  tiles.append(
    statTile('Deaths registered', fmtNumber(deaths), `in ${year}`, `All deaths of Australian residents registered in ${year}.`),
    statTile(
      'Potentially avoidable',
      fmtNumber(pad),
      `${padPct?.toFixed(0)}% of deaths under 75`,
      'Deaths before age 75 from causes considered avoidable through prevention or timely treatment.',
      'accent',
    ),
    statTile('Avoidable rate', fmtRate(padAsr), 'per 100,000, age-standardised', 'The national potentially avoidable death rate.'),
    statTile('Death rate', fmtRate(asr), 'per 100,000, age-standardised', 'The national age-standardised death rate.'),
    statTile('Median age at death', fmtRate(medianAge), 'years', 'Half of deaths occur before this age. Not life expectancy.'),
    statTile('Years of life lost', fmtNumber(pyll), 'before age 75', 'Total potential years of life lost by people dying before 75.'),
  );
  root.appendChild(tiles);

  // ── The two gradients, side by side ────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'panel-grid two';

  grid.appendChild(gradientPanel(ds, 'REM', 'Remoteness', 'How far from a major city someone lives.', sex, year, 'remoteness'));
  grid.appendChild(
    gradientPanel(ds, 'SEG', 'Socioeconomic group', 'Areas grouped into fifths by relative disadvantage.', sex, year, 'seg'),
  );
  root.appendChild(grid);

  // ── National trend ─────────────────────────────────────────────────────────
  const trend = panel(
    'Five years of Australian mortality',
    `Age-standardised rates for all people. The ${ds.years[0]}–${ds.years[ds.years.length - 1]} window is short by design — it is the period the current MORT release covers — so read it as recent context, not a long-run trend.`,
  );
  const covidIdx = ds.years.indexOf(2022);
  trend.appendChild(
    lineChart(
      ds.years,
      [
        { name: 'All deaths', color: '#0f766e', values: ds.series(nat, 'asr', sex) },
        { name: 'Potentially avoidable', color: '#b8442a', values: ds.series(nat, 'padAsr', sex) },
      ],
      {
        yLabel: 'deaths per 100,000 (age-standardised)',
        valueFormat: (v) => v.toFixed(0),
        annotations: covidIdx >= 0 ? [{ index: covidIdx, label: 'COVID-19 wave' }] : [],
      },
    ),
  );
  const legendRow = document.createElement('div');
  legendRow.className = 'legend';
  legendRow.innerHTML =
    '<span class="legend-item"><i class="legend-swatch" style="background:#0f766e"></i>All deaths</span>' +
    '<span class="legend-item"><i class="legend-swatch" style="background:#b8442a"></i>Potentially avoidable</span>';
  trend.appendChild(legendRow);
  root.appendChild(trend);

  // ── Leading causes teaser ──────────────────────────────────────────────────
  const causes = panel(
    `What Australians die of`,
    `The ten leading causes across ${ds.causes.period}, by age-standardised rate. Open the Causes view for all twenty and for where each one hits hardest.`,
  );
  const rows = ds.causeRows('AUS', sex).slice(0, 10);
  const natAll = ds.causeTotals('AUS', sex).all ?? 0;
  causes.appendChild(
    barChart(
      rows.map((r) => ({
        label: ds.causeName(r[0]),
        sublabel: ds.causeIcd(r[0]),
        value: r[3] ?? 0,
        id: String(r[0]),
        tip: `${ds.causeName(r[0])}\n${fmtNumber(r[1])} deaths over ${ds.causes.period}\n${(((r[1] ?? 0) / (natAll || 1)) * 100).toFixed(
          1,
        )}% of all deaths\n${fmtRate(r[3])} per 100,000 age-standardised`,
      })),
      {
        valueFormat: (v) => v.toFixed(1),
        onClick: (id) => store.set({ view: 'causes', cause: Number(id) }),
      },
    ),
  );
  const note = document.createElement('p');
  note.className = 'panel-note';
  note.innerHTML = `Bars show the ${term('asr')} per 100,000. Click any cause to see where in Australia it is deadliest.`;
  causes.appendChild(note);
  root.appendChild(causes);
}

/** "Major Cities of Australia" and "Quintile 1 (lowest)" read badly mid-sentence. */
function shortGroup(name: string): string {
  return name
    .replace(' of Australia', '')
    .replace(' Australia', '')
    .replace(' (lowest)', '')
    .replace(' (highest)', '');
}

function statTile(label: string, value: string, sub: string, tip: string, variant = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `stat-tile${variant ? ' ' + variant : ''}`;
  el.setAttribute('data-tip', tip);
  el.innerHTML = `<span class="stat-label"></span><span class="stat-value"></span><span class="stat-sub"></span>`;
  (el.querySelector('.stat-label') as HTMLElement).textContent = label;
  (el.querySelector('.stat-value') as HTMLElement).textContent = value;
  (el.querySelector('.stat-sub') as HTMLElement).textContent = sub;
  return el;
}

function gradientPanel(
  ds: Dataset,
  level: 'REM' | 'SEG',
  title: string,
  subtitle: string,
  sex: 'P' | 'M' | 'F',
  year: number,
  glossaryKey: string,
): HTMLElement {
  const p = panel(`${title} gradient ${term(glossaryKey, '')}`, subtitle);
  const groups = ds
    .byLevel(level)
    .filter((r) => ds.value(r, 'padAsr', sex, year) !== null)
    .sort((a, b) => (ds.value(a, 'padAsr', sex, year) ?? 0) - (ds.value(b, 'padAsr', sex, year) ?? 0));
  const natPad = ds.value(ds.national, 'padAsr', sex, year);

  p.appendChild(
    barChart(
      groups.map((r) => {
        const v = ds.value(r, 'padAsr', sex, year) ?? 0;
        const age = ds.value(r, 'medianAge', sex, year);
        return {
          label: shortGroup(r.name),
          value: v,
          color: natPad && v > natPad ? '#b8442a' : '#0f766e',
          tip: `${r.name}\n${fmtRate(v)} avoidable deaths per 100,000\n${
            natPad ? `${(v / natPad).toFixed(2)}× the national rate` : ''
          }\nMedian age at death ${fmtRate(age)}`,
        };
      }),
      {
        valueFormat: (v) => v.toFixed(0),
        reference: natPad ? { value: natPad, label: 'national' } : undefined,
      },
    ),
  );
  const note = document.createElement('p');
  note.className = 'panel-note';
  const hi = groups[groups.length - 1];
  const lo = groups[0];
  const hv = ds.value(hi, 'padAsr', sex, year);
  const lv = ds.value(lo, 'padAsr', sex, year);
  if (hv && lv) {
    const ratio = (hv / lv).toFixed(1);
    note.textContent =
      level === 'SEG'
        ? `The most disadvantaged fifth of areas loses ${ratio}× as many lives to avoidable causes as the least disadvantaged fifth.`
        : `${shortGroup(hi.name)} carries ${ratio}× the avoidable death rate of ${shortGroup(lo.name)}.`;
  }
  p.appendChild(note);
  return p;
}
