// SA3 choropleth. Adapted from patterns/leafletMap.ts.
//
// Boundaries are real ABS ASGS 2021 polygons, downloaded by the pipeline and
// mapshaper-simplified. Nothing here is hand-authored.
//
// Z-INDEX: Leaflet hands its own panes and controls z-index values up to 1000.
// Unless the map container establishes its own stacking context those children
// escape to the page root and paint OVER modals and drawers. The .map-canvas
// rule in styles.css sets `isolation: isolate; position: relative; z-index: 0`
// for exactly that reason — do not remove it.

import L from 'leaflet';
import { BURDEN_COLORS, BURDEN_LABELS, NO_DATA_COLOR, burdenColor, panel, viewHeader } from '../charts';
import { MEASURES, MEASURE_BY_KEY, type Dataset, type MeasureKey, type Region } from '../data';
import { esc, fmtNumber, fmtRate } from '../format';
import { ratioBucket } from '../analysis';
import { store } from '../state';
import { term } from '../glossary';

let mapInstance: L.Map | null = null;

const MAP_MEASURES: MeasureKey[] = ['padAsr', 'asr', 'crude', 'prematureAsr', 'pyllRate', 'medianAge'];

export function destroyMap(): void {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
}

export function renderMapView(ds: Dataset, root: HTMLElement): void {
  const state = store.get();
  const measure = MAP_MEASURES.includes(state.measure) ? state.measure : 'padAsr';
  const def = MEASURE_BY_KEY.get(measure)!;
  const sex = state.sex;
  const year = ds.latestYear;

  root.appendChild(
    viewHeader(
      'Where the burden falls',
      `All ${ds.byLevel('SA3').length} ${term('sa3', 'SA3 regions')} shaded against the national figure for ${year}. Click any region for its full profile.`,
    ),
  );

  // Measure picker
  const controls = document.createElement('div');
  controls.className = 'control-row';
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Measure');
  for (const key of MAP_MEASURES) {
    const m = MEASURE_BY_KEY.get(key)!;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'segmented-btn' + (key === measure ? ' active' : '');
    b.textContent = m.short;
    b.setAttribute('data-tip', `${m.label}\n${m.blurb}`);
    b.addEventListener('click', () => store.set({ measure: key }));
    group.appendChild(b);
  }
  controls.appendChild(group);
  root.appendChild(controls);

  const mapPanel = panel(
    def.label,
    `${def.blurb} Shading is each region's value as a ratio of the national figure (${fmtRate(
      ds.value(ds.national, measure, sex, year),
      def.decimals,
    )} ${def.unit}).`,
  );
  const container = document.createElement('div');
  container.className = 'map-container';
  container.innerHTML = '<div class="map-canvas"></div>';
  mapPanel.appendChild(container);

  // Legend
  const legendEl = document.createElement('div');
  legendEl.className = 'legend map-legend';
  BURDEN_COLORS.forEach((c, i) => {
    const label = def.higherIsWorse ? BURDEN_LABELS[i] : BURDEN_LABELS[BURDEN_COLORS.length - 1 - i];
    const s = document.createElement('span');
    s.className = 'legend-item';
    s.innerHTML = `<i class="legend-swatch" style="background:${c}"></i>${esc(label)}`;
    legendEl.appendChild(s);
  });
  const nd = document.createElement('span');
  nd.className = 'legend-item';
  nd.innerHTML = `<i class="legend-swatch" style="background:${NO_DATA_COLOR}"></i>not published`;
  legendEl.appendChild(nd);
  mapPanel.appendChild(legendEl);

  const note = document.createElement('p');
  note.className = 'panel-note';
  note.innerHTML = `Colour bands are cut on the ratio to the national figure rather than on quantiles, so "35% above national" means the same thing on every measure. Regions where the AIHW ${term(
    'suppressed',
    'withheld the value',
  )} are drawn in grey — that is unknown, not zero.`;
  mapPanel.appendChild(note);

  root.appendChild(mapPanel);

  void mount(ds, container.querySelector('.map-canvas') as HTMLElement, measure, sex, year);
}

async function mount(
  ds: Dataset,
  canvas: HTMLElement,
  measure: MeasureKey,
  sex: 'P' | 'M' | 'F',
  year: number,
): Promise<void> {
  const def = MEASURE_BY_KEY.get(measure)!;
  const national = ds.value(ds.national, measure, sex, year);

  let geo: GeoJSON.FeatureCollection;
  try {
    const res = await fetch('data/sa3.geojson');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geo = (await res.json()) as GeoJSON.FeatureCollection;
  } catch {
    canvas.innerHTML =
      '<div class="empty-state">The map boundaries could not be loaded. Every other view still works — try reloading.</div>';
    return;
  }

  destroyMap();
  const map = L.map(canvas, { minZoom: 3, maxZoom: 11, zoomControl: true, scrollWheelZoom: false });
  mapInstance = map;
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 11,
  }).addTo(map);

  // MORT prefixes ASGS codes with the level ("SA310102"); the boundary file
  // carries the bare code.
  const byCode = new Map<string, Region>();
  for (const r of ds.byLevel('SA3')) byCode.set(r.code.replace(/^SA3/, ''), r);

  const layer = L.geoJSON(geo, {
    attribution: 'Boundaries: ABS ASGS 2021 (CC BY 4.0) · Data: AIHW MORT books',
    style: (f) => {
      const region = byCode.get(String(f?.properties?.sa3_code_2021));
      const v = region ? ds.value(region, measure, sex, year) : null;
      return {
        fillColor: burdenColor(ratioBucket(v, national, def.higherIsWorse)),
        fillOpacity: 0.82,
        color: '#ffffff',
        weight: 0.5,
      };
    },
    onEachFeature: (f, lyr) => {
      const code = String(f?.properties?.sa3_code_2021);
      const region = byCode.get(code);
      const name = region?.name ?? String(f?.properties?.sa3_name_2021 ?? 'Unknown');
      const v = region ? ds.value(region, measure, sex, year) : null;
      const pop = region ? ds.value(region, 'population', sex, year) : null;
      const ratio = v !== null && national ? v / national : null;

      lyr.bindTooltip(
        `<strong>${esc(name)}</strong>` +
          `<span class="map-tip-row">${esc(def.label)}: <b>${
            v === null ? 'not published' : `${fmtRate(v, def.decimals)} ${esc(def.unit)}`
          }</b></span>` +
          (ratio ? `<span class="map-tip-row">${ratio.toFixed(2)}× the national figure</span>` : '') +
          `<span class="map-tip-row">Population ${fmtNumber(pop)}</span>` +
          `<span class="map-tip-hint">Click for the full profile</span>`,
        { sticky: true, className: 'map-tip' },
      );
      lyr.on({
        mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#1f2937' }),
        mouseout: () => layer.resetStyle(lyr as L.Path),
        click: () => {
          if (region) store.set({ region: region.code });
        },
      });
    },
  }).addTo(map);

  // Zero-size defence: Leaflet mis-renders when built before layout settles.
  const bounds = layer.getBounds();
  const fit = () => {
    map.invalidateSize();
    if (bounds.isValid() && canvas.clientHeight > 50) map.fitBounds(bounds, { padding: [10, 10] });
  };
  const ro = new ResizeObserver(() => {
    if (canvas.clientHeight > 50) {
      fit();
      ro.disconnect();
    }
  });
  ro.observe(canvas);
  setTimeout(fit, 400);
}

export { MAP_MEASURES, MEASURES };
