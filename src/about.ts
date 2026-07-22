// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// About modal. Also detached from the DOM when closed.

import { hideTooltip } from './components/tooltip';
import type { Dataset } from './data';
import { fmtDate, fmtNumber } from './format';
import { GLOSSARY } from './glossary';

let modal: HTMLDivElement | null = null;
let lastFocus: Element | null = null;

export function closeAbout(): void {
  modal?.remove();
  modal = null;
  if (lastFocus instanceof HTMLElement) lastFocus.focus?.();
  lastFocus = null;
}

export function isAboutOpen(): boolean {
  return modal !== null;
}

export function openAbout(ds: Dataset): void {
  if (modal) return;
  lastFocus = document.activeElement;
  hideTooltip(); // the pointer may be parked on a mark the modal now covers

  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAbout();
  });

  const dialog = document.createElement('div');
  dialog.className = 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'About Mortality Atlas');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closeAbout);

  const content = document.createElement('div');
  content.className = 'modal-body';
  content.innerHTML = `
    <h2>About Mortality Atlas</h2>

    <p class="lede">Mortality Atlas turns the Australian Institute of Health and Welfare's
    <em>Mortality Over Regions and Time</em> release into something you can search, rank, map and
    compare — instead of sixty separate spreadsheets.</p>

    <h3>What this shows</h3>
    <p>For every region in Australia: how many people died, how that compares once age is taken into
    account, how many of those deaths were potentially avoidable, how many years of life were lost
    before 75, and what people died of. Figures cover
    <strong>${ds.years[0]}–${ds.years[ds.years.length - 1]}</strong>; leading causes are pooled across
    the whole ${ds.causes.period} period so that even small regions have stable numbers.</p>

    <h3>The one thing worth understanding</h3>
    <p>A raw death rate is <strong>not</strong> a measure of how healthy a place is — it is mostly a
    measure of how old the people living there are. Retirement destinations always top a raw
    death-rate table and mining towns always look healthy, and neither fact tells you anything.
    Age standardisation adjusts every region to a common age structure so the comparison means
    something. This site ranks on standardised rates everywhere, and the
    <strong>Age Illusion</strong> view exists to show you exactly how much difference it makes.</p>

    <h3>Where the data comes from</h3>
    <ul>
      <li><strong>AIHW MORT books</strong> — summary mortality measures and leading causes of death by
      region, published via data.gov.au. Built from the AIHW National Mortality Database, which draws on
      deaths registered with each state and territory Registry of Births, Deaths and Marriages and cause
      of death coded by the ABS.</li>
      <li><strong>ABS ASGS 2021</strong> — the SA3 boundaries used for the map.</li>
    </ul>

    <h3>How often it updates</h3>
    <p>The AIHW republishes MORT once a year. This site's pipeline runs annually to match — a faster
    schedule would only re-download identical numbers. Data on this page was last built on
    <strong>${fmtDate(ds.generated)}</strong>.</p>

    <h3>Limits worth knowing</h3>
    <ul>
      <li><strong>Withheld values are not zero.</strong> Where a population is too small for a reliable
      rate, the AIHW withholds it. Those regions are left blank here rather than filled with a zero,
      which would rank the smallest and most remote communities as Australia's healthiest.</li>
      <li><strong>Median age at death is not life expectancy.</strong> A region full of young workers has
      few elderly residents to die old, which drags its median down regardless of how long people live.</li>
      <li><strong>Deaths are counted where a person lived, not where they died.</strong> Someone who lives
      remotely and dies in a capital city hospital is counted in their home region.</li>
      <li><strong>Registration lag.</strong> Deaths are counted by year of registration, and a small number
      — particularly those referred to a coroner — are registered in a later year.</li>
      <li><strong>Five years is a short series.</strong> Treat the trend as recent context, not a long-run
      pattern.</li>
      <li><strong>Leading causes are the local top twenty.</strong> If a cause does not appear for a
      region, it did not rank there — that is not the same as it not occurring.</li>
    </ul>

    <h3>If any of this affects you</h3>
    <p class="support-note">Lifeline <strong>13 11 14</strong> · Beyond Blue <strong>1300 22 4636</strong>
    · 13YARN <strong>13 92 76</strong> · Griefline <strong>1300 845 745</strong>.
    In an emergency call <strong>000</strong>.</p>

    <h3>Glossary</h3>
    <dl class="glossary-list">
      ${Object.values(GLOSSARY)
        .map((g) => `<dt>${g.term}</dt><dd>${g.definition}</dd>`)
        .join('')}
    </dl>

    <p class="modal-foot">Built with ${fmtNumber(ds.regions.length)} regions across eight geography levels.
    Source data is published by the AIHW under CC BY 4.0.</p>
  `;

  dialog.append(close, content);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  close.focus();
}
