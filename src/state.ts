// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// App state, mirrored into the URL hash so every view and every drill-down is
// a shareable link, and into localStorage so a return visit keeps its settings.

import type { Level, MeasureKey, SexKey } from './data';

export type ViewId =
  | 'overview'
  | 'illusion'
  | 'map'
  | 'rankings'
  | 'causes'
  | 'gradients'
  | 'matrix'
  | 'explorer'
  | 'insights';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'illusion', label: 'Age Illusion' },
  { id: 'map', label: 'Map' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'causes', label: 'Causes' },
  { id: 'gradients', label: 'Gradients' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'insights', label: 'Insights' },
];

export interface AppState {
  view: ViewId;
  level: Level;
  sex: SexKey;
  year: number;
  measure: MeasureKey;
  /** region code for the drill-down drawer, or null when closed */
  region: string | null;
  /** cause id selected in the Causes view */
  cause: number | null;
  search: string;
  sort: string;
  sortDir: 'asc' | 'desc';
}

const STORAGE_KEY = 'au-mortality:prefs';

const DEFAULTS: AppState = {
  view: 'overview',
  level: 'SA3',
  sex: 'P',
  year: 0, // replaced with the latest year at boot
  measure: 'padAsr',
  region: null,
  cause: null,
  search: '',
  sort: 'padAsr',
  sortDir: 'desc',
};

type Listener = (s: AppState) => void;

class Store {
  private state: AppState = { ...DEFAULTS };
  private listeners: Listener[] = [];
  private applying = false;

  init(latestYear: number): void {
    this.state.year = latestYear;
    // Saved preferences first, then the hash — a shared link must always win.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppState>;
        for (const k of ['level', 'sex', 'measure', 'sort', 'sortDir'] as const) {
          if (saved[k] !== undefined) (this.state as unknown as Record<string, unknown>)[k] = saved[k];
        }
      }
    } catch {
      /* a corrupt preference must never stop the site loading */
    }
    this.readHash();
    window.addEventListener('hashchange', () => {
      if (this.applying) return;
      this.readHash();
      this.emit();
    });
  }

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    const before = JSON.stringify(this.state);
    Object.assign(this.state, patch);
    if (JSON.stringify(this.state) === before) return;
    this.persist();
    this.writeHash();
    this.emit();
  }

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  private persist(): void {
    try {
      const { level, sex, measure, sort, sortDir } = this.state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, sex, measure, sort, sortDir }));
    } catch {
      /* private browsing — preferences simply don't persist */
    }
  }

  private readHash(): void {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const v = params.get('v');
    if (v && VIEWS.some((x) => x.id === v)) this.state.view = v as ViewId;
    const r = params.get('r');
    this.state.region = r || null;
    const m = params.get('m');
    if (m) this.state.measure = m as MeasureKey;
    const l = params.get('l');
    if (l) this.state.level = l as Level;
    const s = params.get('s');
    if (s === 'P' || s === 'M' || s === 'F') this.state.sex = s;
    const y = Number(params.get('y'));
    if (Number.isFinite(y) && y > 2000) this.state.year = y;
    const c = params.get('c');
    this.state.cause = c === null || c === '' ? null : Number(c);
  }

  private writeHash(): void {
    const p = new URLSearchParams();
    p.set('v', this.state.view);
    if (this.state.region) p.set('r', this.state.region);
    if (this.state.measure !== DEFAULTS.measure) p.set('m', this.state.measure);
    if (this.state.level !== DEFAULTS.level) p.set('l', this.state.level);
    if (this.state.sex !== DEFAULTS.sex) p.set('s', this.state.sex);
    if (this.state.cause !== null) p.set('c', String(this.state.cause));
    const next = `#${p.toString()}`;
    if (location.hash === next) return;
    this.applying = true;
    history.replaceState(null, '', next);
    this.applying = false;
  }
}

export const store = new Store();
