// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { viewHeader } from '../charts';
import { buildInsights } from '../analysis';
import type { Dataset } from '../data';
import { esc } from '../format';
import { store, type ViewId } from '../state';
import { empty } from './rankings';

export function renderInsights(ds: Dataset, root: HTMLElement): void {
  root.appendChild(
    viewHeader(
      'Insights',
      'Findings detected automatically from the data each time it is published — outliers, gradients and gaps, not hand-written commentary. Every claim below is recomputed from the current release.',
    ),
  );

  const insights = buildInsights(ds);
  if (!insights.length) {
    root.appendChild(empty('No findings could be computed from the current release.'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'insight-grid';
  for (const ins of insights) {
    const card = document.createElement(ins.link ? 'button' : 'div');
    card.className = `insight-card ${ins.severity}`;
    if (ins.link) {
      (card as HTMLButtonElement).type = 'button';
      card.classList.add('clickable');
      card.addEventListener('click', () => {
        const params = new URLSearchParams(ins.link!.replace(/^#/, ''));
        const v = params.get('v');
        const r = params.get('r');
        store.set({ view: (v as ViewId) ?? store.get().view, region: r });
      });
    }
    const h = document.createElement('h3');
    h.textContent = ins.title;
    const p = document.createElement('p');
    p.textContent = ins.body;
    card.append(h, p);
    if (ins.link) {
      const go = document.createElement('span');
      go.className = 'insight-go';
      go.textContent = 'Open →';
      card.appendChild(go);
    }
    grid.appendChild(card);
  }
  root.appendChild(grid);

  const method = document.createElement('div');
  method.className = 'panel method-note';
  method.innerHTML = `<h3 class="panel-title">How these are computed</h3>
    <p>Gradient findings compare the published groups directly. Regional findings use SA3 regions with at least 15,000 residents,
    because a rate built on a few hundred people moves too much year to year to be a finding. Cause-specific findings need at least
    40,000 residents and only consider causes that reach a region's own top twenty. Nothing here is hand-written: if the AIHW
    republishes and a number changes, the sentence changes with it.</p>
    <p>Support is available if any of this affects you — Lifeline <strong>13 11 14</strong>, Beyond Blue <strong>1300 22 4636</strong>, 13YARN <strong>13 92 76</strong>.</p>`;
  void esc;
  root.appendChild(method);
}
