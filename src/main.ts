import './styles.css';
import 'leaflet/dist/leaflet.css';

import { closeAbout, isAboutOpen, openAbout } from './about';
import { hideTooltip, initTooltip } from './components/tooltip';
import { loadDataset, SEX_LABEL, type Dataset, type SexKey } from './data';
import { closeDrilldown, renderDrilldown } from './drilldown';
import { mountFeedback } from './feedback';
import { hideGlossary, initGlossary } from './glossary';
import { store, VIEWS, type ViewId } from './state';
import { fmtDate } from './format';
import { renderCauses } from './views/causes';
import { renderExplorer, setRerender } from './views/explorer';
import { renderGradients } from './views/gradients';
import { renderIllusion } from './views/illusion';
import { renderInsights } from './views/insights';
import { destroyMap, renderMapView } from './views/map';
import { renderMatrix } from './views/matrix';
import { renderOverview } from './views/overview';
import { renderRankings } from './views/rankings';

const app = document.getElementById('app')!;
let ds: Dataset | null = null;
let lastView: ViewId | null = null;

function shell(): void {
  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#v=overview">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-text">
            <strong>Mortality Atlas</strong>
            <em>Australia</em>
          </span>
        </a>
        <div class="header-controls">
          <div class="segmented sex-toggle" role="group" aria-label="Population"></div>
          <button type="button" class="icon-btn" id="about-btn" aria-label="About this site and its data">?</button>
        </div>
      </div>
      <nav class="tab-bar" aria-label="Views"></nav>
    </header>
    <main class="main-content" id="view-root" tabindex="-1"></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <p class="footer-source">
          Source: AIHW <em>Mortality Over Regions and Time</em> books (CC BY 4.0), built from the
          National Mortality Database · Boundaries: ABS ASGS 2021 · <span id="footer-generated"></span>
        </p>
        <p class="footer-support">
          Support: Lifeline <strong>13 11 14</strong> · Beyond Blue <strong>1300 22 4636</strong> · 13YARN <strong>13 92 76</strong>
        </p>
        <p class="footer-credit">
          Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> ·
          <a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
        </p>
      </div>
    </footer>`;

  const tabBar = app.querySelector('.tab-bar') as HTMLElement;
  for (const v of VIEWS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.dataset.view = v.id;
    b.textContent = v.label; // words only — never a count badge
    b.addEventListener('click', () => store.set({ view: v.id, region: null }));
    tabBar.appendChild(b);
  }

  const sexToggle = app.querySelector('.sex-toggle') as HTMLElement;
  for (const s of ['P', 'M', 'F'] as SexKey[]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'segmented-btn';
    b.dataset.sex = s;
    b.textContent = s === 'P' ? 'All' : s === 'M' ? 'Male' : 'Female';
    b.setAttribute('data-tip', `Show figures for ${SEX_LABEL[s].toLowerCase()}`);
    b.addEventListener('click', () => store.set({ sex: s }));
    sexToggle.appendChild(b);
  }

  (app.querySelector('#about-btn') as HTMLElement).addEventListener('click', () => {
    if (ds) openAbout(ds);
  });
}

function renderChrome(): void {
  const s = store.get();
  app.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    const active = t.dataset.view === s.view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-current', active ? 'page' : 'false');
  });
  app.querySelectorAll<HTMLElement>('.sex-toggle .segmented-btn').forEach((b) => {
    const active = b.dataset.sex === s.sex;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function renderView(): void {
  if (!ds) return;
  const s = store.get();
  const root = document.getElementById('view-root') as HTMLElement;

  // Leaflet must be torn down explicitly when leaving the map view, or it
  // leaves listeners bound to a detached container.
  if (lastView === 'map' && s.view !== 'map') destroyMap();
  const viewChanged = lastView !== s.view;
  lastView = s.view;

  root.innerHTML = '';
  // The hovered mark is about to be destroyed, and a removed element never
  // fires mouseout — dismiss both floaters explicitly.
  hideGlossary();
  hideTooltip();

  switch (s.view) {
    case 'overview':
      renderOverview(ds, root);
      break;
    case 'illusion':
      renderIllusion(ds, root);
      break;
    case 'map':
      renderMapView(ds, root);
      break;
    case 'rankings':
      renderRankings(ds, root);
      break;
    case 'causes':
      renderCauses(ds, root);
      break;
    case 'gradients':
      renderGradients(ds, root);
      break;
    case 'matrix':
      renderMatrix(ds, root);
      break;
    case 'explorer':
      renderExplorer(ds, root);
      break;
    case 'insights':
      renderInsights(ds, root);
      break;
  }

  if (viewChanged) window.scrollTo({ top: 0, behavior: 'auto' });
}

function render(): void {
  renderChrome();
  renderView();
  if (ds) renderDrilldown(ds);
}

function showError(message: string): void {
  const root = document.getElementById('view-root');
  const target = root ?? app;
  target.innerHTML = `
    <div class="error-state">
      <h2>Something went wrong loading the data</h2>
      <p></p>
      <button type="button" class="primary-btn" id="retry">Try again</button>
    </div>`;
  (target.querySelector('p') as HTMLElement).textContent = message;
  (target.querySelector('#retry') as HTMLElement).addEventListener('click', () => void boot());
}

function skeleton(): void {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = `
    <div class="loading" role="status" aria-live="polite">
      <span class="sr-only">Loading mortality data</span>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton-grid">
        ${'<div class="skeleton skeleton-tile"></div>'.repeat(6)}
      </div>
      <div class="skeleton skeleton-block"></div>
    </div>`;
}

let controller: AbortController | null = null;

async function boot(): Promise<void> {
  skeleton();
  controller?.abort();
  controller = new AbortController();
  try {
    const loaded = await loadDataset(controller.signal);
    ds = loaded;
    store.init(loaded.latestYear);
    const gen = document.getElementById('footer-generated');
    if (gen) gen.textContent = `Data built ${fmtDate(loaded.generated)}`;
    render();
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    showError(
      (err as Error).message ||
        'The data files could not be loaded. Check your connection and try again.',
    );
  }
}

function init(): void {
  shell();
  initTooltip();
  initGlossary();
  setRerender(render);
  store.subscribe(render);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isAboutOpen()) {
      closeAbout();
      return;
    }
    if (store.get().region) store.set({ region: null });
    else closeDrilldown();
  });

  void boot().then(() => mountFeedback());
}

init();
