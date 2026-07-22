// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Data model + loading. The JSON on disk is deliberately compact (parallel
// numeric arrays); everything above this module works with named accessors so
// no view ever indexes a magic slot.

export type SexKey = 'P' | 'M' | 'F';
export type Level = 'SA3' | 'LGA' | 'SA4' | 'PHN' | 'GCCSA' | 'STE' | 'REM' | 'SEG' | 'AUS';

/** A year's 14 measures, in MEASURES order. null = AIHW withheld it. */
export type YearRow = (number | null)[];

export interface Region {
  code: string;
  level: Level;
  name: string;
  state: string | null;
  d: Record<SexKey, (YearRow | null)[]>;
}

export interface RegionsFile {
  generated: string;
  years: number[];
  sexes: string[];
  measures: string[];
  national: Region;
  regions: Region[];
}

export interface Cause {
  name: string;
  icd: string;
}

/** [causeId, deaths, shareOfAllDeaths, ageStandardisedRate] */
export type CauseRow = [number, number | null, number | null, number | null];

export interface CausesFile {
  generated: string;
  period: string;
  causes: Cause[];
  rows: Record<string, Partial<Record<SexKey, CauseRow[]>>>;
  totals: Record<string, Partial<Record<SexKey, { all: number | null; allAsr: number | null; top20: number | null }>>>;
}

export type MeasureKey =
  | 'deaths'
  | 'population'
  | 'crude'
  | 'asr'
  | 'rateRatio'
  | 'prematureDeaths'
  | 'prematurePct'
  | 'prematureAsr'
  | 'pyll'
  | 'pyllRate'
  | 'pad'
  | 'padPct'
  | 'padAsr'
  | 'medianAge';

const MEASURE_ORDER: MeasureKey[] = [
  'deaths',
  'population',
  'crude',
  'asr',
  'rateRatio',
  'prematureDeaths',
  'prematurePct',
  'prematureAsr',
  'pyll',
  'pyllRate',
  'pad',
  'padPct',
  'padAsr',
  'medianAge',
];

export interface MeasureDef {
  key: MeasureKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  /** true when a higher number means a heavier burden (drives the colour ramp) */
  higherIsWorse: boolean;
  blurb: string;
}

export const MEASURES: MeasureDef[] = [
  {
    key: 'padAsr',
    label: 'Potentially avoidable deaths',
    short: 'Avoidable',
    unit: 'per 100,000',
    decimals: 1,
    higherIsWorse: true,
    blurb:
      'Deaths before age 75 from causes considered avoidable through prevention or timely treatment, age-standardised so regions with different age profiles can be compared.',
  },
  {
    key: 'asr',
    label: 'Age-standardised death rate',
    short: 'Standardised rate',
    unit: 'per 100,000',
    decimals: 1,
    higherIsWorse: true,
    blurb:
      'All deaths, adjusted to a standard age structure. This is the fair comparison between places — it removes the effect of one region simply being older than another.',
  },
  {
    key: 'crude',
    label: 'Crude death rate',
    short: 'Crude rate',
    unit: 'per 100,000',
    decimals: 1,
    higherIsWorse: true,
    blurb:
      'Deaths divided by population, with no adjustment. Mostly a measure of how OLD a place is — a retirement town will always look deadly and a mining town always healthy. Shown here to be compared against, not relied on.',
  },
  {
    key: 'prematureAsr',
    label: 'Premature deaths (under 75)',
    short: 'Premature',
    unit: 'per 100,000',
    decimals: 1,
    higherIsWorse: true,
    blurb: 'Age-standardised rate of deaths occurring before age 75.',
  },
  {
    key: 'pyllRate',
    label: 'Potential years of life lost',
    short: 'Years lost',
    unit: 'per 1,000',
    decimals: 1,
    higherIsWorse: true,
    blurb:
      'Years of life lost before age 75, per 1,000 people. A death at 30 counts far more heavily than a death at 70, so this weights mortality by how early it happens.',
  },
  {
    key: 'medianAge',
    label: 'Median age at death',
    short: 'Median age',
    unit: 'years',
    decimals: 1,
    higherIsWorse: false,
    blurb:
      'Half of deaths occur before this age, half after. NOT life expectancy — it reflects who lives in a region as well as how long they live.',
  },
  {
    key: 'deaths',
    label: 'Deaths',
    short: 'Deaths',
    unit: 'total',
    decimals: 0,
    higherIsWorse: true,
    blurb: 'The raw count of deaths registered for residents of the region.',
  },
  {
    key: 'pad',
    label: 'Avoidable deaths (count)',
    short: 'Avoidable count',
    unit: 'total',
    decimals: 0,
    higherIsWorse: true,
    blurb: 'The raw count of potentially avoidable deaths.',
  },
  {
    key: 'padPct',
    label: 'Share of premature deaths avoidable',
    short: 'Avoidable share',
    unit: '%',
    decimals: 1,
    higherIsWorse: true,
    blurb: 'Of deaths before age 75, the percentage considered potentially avoidable.',
  },
  {
    key: 'population',
    label: 'Population',
    short: 'Population',
    unit: 'people',
    decimals: 0,
    higherIsWorse: false,
    blurb: 'Estimated resident population, the denominator for every rate on this page.',
  },
];

export const MEASURE_BY_KEY = new Map(MEASURES.map((m) => [m.key, m]));

export const LEVEL_LABELS: Record<Level, string> = {
  SA3: 'SA3 region',
  LGA: 'Local government area',
  SA4: 'SA4 region',
  PHN: 'Primary Health Network',
  GCCSA: 'Capital city / rest of state',
  STE: 'State & territory',
  REM: 'Remoteness area',
  SEG: 'Socioeconomic group',
  AUS: 'Australia',
};

export const LEVEL_PLURAL: Record<Level, string> = {
  SA3: 'SA3 regions',
  LGA: 'Local government areas',
  SA4: 'SA4 regions',
  PHN: 'Primary Health Networks',
  GCCSA: 'Capital cities & rest-of-state',
  STE: 'States & territories',
  REM: 'Remoteness areas',
  SEG: 'Socioeconomic groups',
  AUS: 'Australia',
};

/**
 * Mid-sentence forms. A blanket .toLowerCase() on LEVEL_PLURAL turns "SA3
 * regions" into "sa3 regions", so the acronyms carry their own casing here.
 */
export const LEVEL_PLURAL_INLINE: Record<Level, string> = {
  SA3: 'SA3 regions',
  LGA: 'local government areas',
  SA4: 'SA4 regions',
  PHN: 'Primary Health Networks',
  GCCSA: 'capital city & rest-of-state areas',
  STE: 'states & territories',
  REM: 'remoteness areas',
  SEG: 'socioeconomic groups',
  AUS: 'Australia',
};

export const SEX_LABEL: Record<SexKey, string> = { P: 'All people', M: 'Males', F: 'Females' };

// ── Accessors ────────────────────────────────────────────────────────────────

export class Dataset {
  readonly years: number[];
  readonly national: Region;
  readonly regions: Region[];
  readonly generated: string;
  readonly causes: CausesFile;
  private readonly byCode = new Map<string, Region>();
  private readonly measureIndex = new Map<MeasureKey, number>();

  constructor(regionsFile: RegionsFile, causes: CausesFile) {
    this.years = regionsFile.years;
    this.national = regionsFile.national;
    this.regions = regionsFile.regions;
    this.generated = regionsFile.generated;
    this.causes = causes;
    const order = (regionsFile.measures as MeasureKey[]) ?? MEASURE_ORDER;
    order.forEach((m, i) => this.measureIndex.set(m, i));
    for (const r of this.regions) this.byCode.set(r.code, r);
    this.byCode.set(this.national.code, this.national);
  }

  get latestYear(): number {
    return this.years[this.years.length - 1];
  }

  region(code: string): Region | undefined {
    return this.byCode.get(code);
  }

  byLevel(level: Level): Region[] {
    return this.regions.filter((r) => r.level === level);
  }

  /**
   * One measure for one region/sex/year. Returns null when the AIHW suppressed
   * it — callers must branch on null rather than defaulting to zero, or the
   * smallest and most disadvantaged regions rank as the healthiest.
   */
  value(region: Region, measure: MeasureKey, sex: SexKey, year?: number): number | null {
    const yi = year === undefined ? this.years.length - 1 : this.years.indexOf(year);
    if (yi < 0) return null;
    const row = region.d[sex]?.[yi];
    if (!row) return null;
    const mi = this.measureIndex.get(measure);
    if (mi === undefined) return null;
    return row[mi] ?? null;
  }

  /** The measure across every year, for sparklines and trend charts. */
  series(region: Region, measure: MeasureKey, sex: SexKey): (number | null)[] {
    const mi = this.measureIndex.get(measure);
    if (mi === undefined) return this.years.map(() => null);
    return this.years.map((_, yi) => region.d[sex]?.[yi]?.[mi] ?? null);
  }

  causeRows(code: string, sex: SexKey): CauseRow[] {
    return this.causes.rows[code]?.[sex] ?? [];
  }

  causeTotals(code: string, sex: SexKey) {
    return this.causes.totals[code]?.[sex] ?? { all: null, allAsr: null, top20: null };
  }

  causeName(id: number): string {
    return this.causes.causes[id]?.name ?? 'Unknown';
  }

  causeIcd(id: number): string {
    return this.causes.causes[id]?.icd ?? '';
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const [regions, causes] = await Promise.all([
    getJson<RegionsFile>('data/regions.json', signal),
    getJson<CausesFile>('data/causes.json', signal),
  ]);
  return new Dataset(regions, causes);
}
