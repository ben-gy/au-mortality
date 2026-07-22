// Pure analysis. No DOM, no fetch — every function here is unit-tested.

import type { Dataset, Level, MeasureKey, Region, SexKey } from './data';
import { MEASURE_BY_KEY } from './data';

// ── Statistics ───────────────────────────────────────────────────────────────

/** Nulls are dropped, never coerced to 0. */
export function clean(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
}

export function median(values: (number | null)[]): number | null {
  const v = clean(values).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function quantile(values: (number | null)[], q: number): number | null {
  const v = clean(values).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export function mean(values: (number | null)[]): number | null {
  const v = clean(values);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export interface Ranked {
  region: Region;
  value: number;
  rank: number;
}

/**
 * Rank regions by a measure. Regions whose value the AIHW suppressed are
 * EXCLUDED, not sorted to one end — a withheld rate is unknown, and parking
 * unknowns at the bottom would present the most remote communities in Australia
 * as the country's healthiest.
 */
export function rankRegions(
  ds: Dataset,
  level: Level,
  measure: MeasureKey,
  sex: SexKey,
  year?: number,
): Ranked[] {
  const def = MEASURE_BY_KEY.get(measure);
  const worstFirst = def?.higherIsWorse ?? true;
  const rows: { region: Region; value: number }[] = [];
  for (const region of ds.byLevel(level)) {
    const value = ds.value(region, measure, sex, year);
    if (value === null) continue;
    rows.push({ region, value });
  }
  rows.sort((a, b) => (worstFirst ? b.value - a.value : a.value - b.value));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface RankFlip {
  region: Region;
  crude: number;
  asr: number;
  crudeRank: number;
  asrRank: number;
  /** positive = looks worse on the raw rate than it really is (an older place) */
  shift: number;
}

/**
 * The signature analysis. Rank every region twice — once on the raw death rate,
 * once age-standardised — and measure how far each one moves.
 *
 * A large positive shift means a region's raw rate is inflated purely by having
 * an older population. A large negative shift means the opposite and matters
 * more: a young population is masking a genuinely high death rate.
 *
 * BOTH rankings must run over the SAME set of regions. Ranking each measure
 * independently over everything published produces different denominators (a
 * region can have a crude rate published and its standardised rate withheld),
 * and any caller-side filter applied afterwards makes it worse — that is how
 * "ranks 323rd of 322" gets printed. So the eligible set is settled first:
 * caller filter, then both values present, and only then are ranks assigned.
 */
export function rankFlips(
  ds: Dataset,
  level: Level,
  sex: SexKey,
  year?: number,
  include: (region: Region) => boolean = () => true,
): RankFlip[] {
  const eligible = ds.byLevel(level).filter((r) => {
    if (!include(r)) return false;
    return ds.value(r, 'crude', sex, year) !== null && ds.value(r, 'asr', sex, year) !== null;
  });

  const rankBy = (measure: MeasureKey): Map<string, number> => {
    const sorted = [...eligible].sort(
      (a, b) => (ds.value(b, measure, sex, year) as number) - (ds.value(a, measure, sex, year) as number),
    );
    return new Map(sorted.map((r, i) => [r.code, i + 1]));
  };

  const crudeRanks = rankBy('crude');
  const asrRanks = rankBy('asr');

  return eligible
    .map((region) => {
      const crudeRank = crudeRanks.get(region.code)!;
      const asrRank = asrRanks.get(region.code)!;
      return {
        region,
        crude: ds.value(region, 'crude', sex, year) as number,
        asr: ds.value(region, 'asr', sex, year) as number,
        crudeRank,
        asrRank,
        shift: asrRank - crudeRank,
      };
    })
    .sort((a, b) => a.asrRank - b.asrRank);
}

// ── Colour scaling ───────────────────────────────────────────────────────────

/**
 * Buckets are cut on the RATIO to the national figure, not on quantiles.
 *
 * Quantile buckets always fill every class, so they manufacture visible
 * difference even where regions are nearly identical, and they make the legend
 * meaningless across measures. Ratio cuts say something a reader can actually
 * use: "35% above the national rate". This data supports it — the spread is
 * about 3x end to end, not the orders of magnitude that would demand a log
 * scale.
 */
export const RATIO_BREAKS = [0.8, 0.9, 1.0, 1.15, 1.35];

export function ratioBucket(value: number | null, national: number | null, higherIsWorse = true): number {
  if (value === null || national === null || !national) return -1;
  const ratio = value / national;
  let i = 0;
  while (i < RATIO_BREAKS.length && ratio >= RATIO_BREAKS[i]) i++;
  return higherIsWorse ? i : RATIO_BREAKS.length - i;
}

// ── Histogram ────────────────────────────────────────────────────────────────

export interface Bin {
  lo: number;
  hi: number;
  count: number;
  items: Region[];
}

/**
 * Equal-width bins over the observed range. Returns [] for empty input rather
 * than a single NaN-width bin.
 */
export function histogram(rows: Ranked[], binCount = 24): Bin[] {
  if (!rows.length) return [];
  const values = rows.map((r) => r.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const span = hi - lo || 1;
  const width = span / binCount;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    lo: lo + i * width,
    hi: lo + (i + 1) * width,
    count: 0,
    items: [],
  }));
  for (const r of rows) {
    let idx = Math.floor((r.value - lo) / width);
    if (idx >= binCount) idx = binCount - 1; // the maximum lands in the last bin
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].items.push(r.region);
  }
  return bins;
}

// ── Insights ─────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'warn' | 'alert';

export interface Insight {
  severity: Severity;
  title: string;
  body: string;
  /** hash fragment to jump to the thing being described */
  link?: string;
}

const SMALL_POP = 15_000;

/**
 * Everything here is derived from the data at runtime — nothing is hand-written
 * copy that could silently go stale when the AIHW republishes.
 */
export function buildInsights(ds: Dataset): Insight[] {
  const out: Insight[] = [];
  const sex: SexKey = 'P';
  const year = ds.latestYear;
  const nat = ds.national;

  const natPad = ds.value(nat, 'padAsr', sex, year);
  const natPadCount = ds.value(nat, 'pad', sex, year);
  const natPadPct = ds.value(nat, 'padPct', sex, year);

  if (natPadCount !== null && natPadPct !== null) {
    out.push({
      severity: 'alert',
      title: `${Math.round(natPadCount).toLocaleString('en-AU')} deaths in ${year} were potentially avoidable`,
      body: `That is ${natPadPct.toFixed(0)}% of every death before the age of 75 — deaths that could potentially have been prevented, or treated in time. Nationally the rate is ${natPad?.toFixed(1)} per 100,000.`,
      link: '#v=overview',
    });
  }

  // Remoteness gradient — the single steepest gradient in the dataset.
  const rem = ds.byLevel('REM');
  const cities = rem.find((r) => r.name.startsWith('Major Cities'));
  const veryRemote = rem.find((r) => r.name.startsWith('Very Remote'));
  if (cities && veryRemote) {
    const a = ds.value(cities, 'padAsr', sex, year);
    const b = ds.value(veryRemote, 'padAsr', sex, year);
    const ageA = ds.value(cities, 'medianAge', sex, year);
    const ageB = ds.value(veryRemote, 'medianAge', sex, year);
    if (a && b) {
      out.push({
        severity: 'alert',
        title: `Avoidable death is ${(b / a).toFixed(1)}× higher in very remote Australia`,
        body: `${b.toFixed(1)} per 100,000 in Very Remote areas against ${a.toFixed(1)} in Major Cities.${
          ageA && ageB
            ? ` The median age at death differs by ${(ageA - ageB).toFixed(1)} years (${ageB.toFixed(1)} vs ${ageA.toFixed(1)}).`
            : ''
        }`,
        link: '#v=gradients',
      });
    }
  }

  // Socioeconomic gradient.
  const seg = ds.byLevel('SEG');
  const q1 = seg.find((r) => r.name.startsWith('Quintile 1'));
  const q5 = seg.find((r) => r.name.startsWith('Quintile 5'));
  if (q1 && q5) {
    const a = ds.value(q5, 'padAsr', sex, year);
    const b = ds.value(q1, 'padAsr', sex, year);
    if (a && b) {
      out.push({
        severity: 'warn',
        title: `The poorest fifth of areas lose ${(b / a).toFixed(1)}× as many lives to avoidable causes`,
        body: `${b.toFixed(1)} per 100,000 in the most disadvantaged areas against ${a.toFixed(1)} in the least. The gradient is almost perfectly stepped across all five groups — each step up in advantage lowers the rate.`,
        link: '#v=gradients',
      });
    }
  }

  // The age illusion, named with the region that demonstrates it best.
  const flips = rankFlips(ds, 'SA3', sex, year, (r) => (ds.value(r, 'population', sex, year) ?? 0) >= SMALL_POP);
  if (flips.length) {
    const masked = [...flips].sort((a, b) => a.shift - b.shift)[0];
    const inflated = [...flips].sort((a, b) => b.shift - a.shift)[0];
    if (masked && masked.shift < -50) {
      // Describe where the crude rank actually sits rather than asserting
      // "average" — the region that moves furthest is usually one the raw rate
      // makes look actively HEALTHY, which is a stronger and truer point.
      const pct = masked.crudeRank / flips.length;
      const looks =
        pct > 0.75
          ? 'looks like one of the healthiest places in Australia'
          : pct > 0.45
            ? 'looks unremarkable'
            : 'looks middling';
      out.push({
        severity: 'alert',
        title: `${masked.region.name} ${looks} on the raw death rate, and is ${ordinal(masked.asrRank)} worst once age is accounted for`,
        body: `Its crude death rate ranks ${ordinal(masked.crudeRank)} of ${flips.length} because the population is young — few residents are old enough to die of old age. Age-standardised, it ranks ${ordinal(
          masked.asrRank,
        )}. A young population can hide a severe mortality burden completely.`,
        link: `#v=illusion&r=${masked.region.code}`,
      });
    }
    if (inflated && inflated.shift > 50) {
      out.push({
        severity: 'info',
        title: `${inflated.region.name} has one of Australia's highest raw death rates and a below-average real one`,
        body: `It ranks ${ordinal(inflated.crudeRank)} of ${flips.length} on the crude rate and ${ordinal(inflated.asrRank)} once standardised. Retirement destinations always top a raw death-rate table; it says nothing about how healthy the place is.`,
        link: `#v=illusion&r=${inflated.region.code}`,
      });
    }
  }

  // Highest and lowest SA3s on avoidable deaths.
  const padRank = rankRegions(ds, 'SA3', 'padAsr', sex, year).filter(
    (r) => (ds.value(r.region, 'population', sex, year) ?? 0) >= SMALL_POP,
  );
  if (padRank.length > 1) {
    const worst = padRank[0];
    const best = padRank[padRank.length - 1];
    out.push({
      severity: 'warn',
      title: `${worst.region.name} and ${best.region.name} are ${(worst.value / best.value).toFixed(1)}× apart`,
      body: `${worst.region.name} records ${worst.value.toFixed(1)} potentially avoidable deaths per 100,000 against ${best.value.toFixed(1)} in ${best.region.name} — the widest gap between two Australian regions of comparable size on this measure.`,
      link: `#v=rankings&r=${worst.region.code}`,
    });
  }

  // Sex gap.
  const mAsr = ds.value(nat, 'asr', 'M', year);
  const fAsr = ds.value(nat, 'asr', 'F', year);
  const mAge = ds.value(nat, 'medianAge', 'M', year);
  const fAge = ds.value(nat, 'medianAge', 'F', year);
  if (mAsr && fAsr && mAge && fAge) {
    out.push({
      severity: 'info',
      title: `Australian men die at ${(mAsr / fAsr).toFixed(2)}× the rate of women, and ${(fAge - mAge).toFixed(1)} years younger`,
      body: `Age-standardised, ${mAsr.toFixed(1)} per 100,000 for men against ${fAsr.toFixed(1)} for women. Median age at death is ${mAge.toFixed(1)} for men and ${fAge.toFixed(1)} for women. The gap is widest for avoidable causes.`,
      link: '#v=gradients',
    });
  }

  // Suppression — worth stating plainly rather than hiding.
  const sa3 = ds.byLevel('SA3');
  const suppressed = sa3.filter((r) => ds.value(r, 'asr', sex, year) === null);
  if (suppressed.length) {
    out.push({
      severity: 'info',
      title: `${suppressed.length} of ${sa3.length} SA3 regions have no published rate for ${year}`,
      body: `Their populations are too small to standardise reliably. They are left blank throughout this site rather than shown as zero — including places like ${suppressed
        .slice(0, 3)
        .map((r) => r.name)
        .join(', ')}.`,
      link: '#v=map',
    });
  }

  // COVID year, visible in the national series.
  const natSeries = ds.series(nat, 'asr', sex);
  let peakIdx = -1;
  natSeries.forEach((v, i) => {
    if (v === null) return;
    const best = peakIdx >= 0 ? natSeries[peakIdx] : null;
    if (best === null || v > best) peakIdx = i;
  });
  const latestIdx = ds.years.length - 1;
  const peakVal = peakIdx >= 0 ? natSeries[peakIdx] : null;
  const latestVal = natSeries[latestIdx];
  if (peakIdx >= 0 && peakIdx !== latestIdx && peakVal !== null && latestVal !== null) {
    out.push({
      severity: 'info',
      title: `The national death rate peaked in ${ds.years[peakIdx]} and has since fallen back`,
      body: `${peakVal.toFixed(1)} per 100,000 in ${ds.years[peakIdx]}, against ${latestVal.toFixed(1)} in ${ds.years[latestIdx]}. COVID-19 is the ${covidRank(ds)} leading cause of death across the whole ${ds.causes.period} period.`,
      link: '#v=causes',
    });
  }

  // Where the cause mix diverges most from the national one.
  const divergent = mostDistinctiveCause(ds);
  if (divergent) {
    out.push({
      severity: 'warn',
      title: `${divergent.cause} kills at ${divergent.ratio.toFixed(1)}× the national rate in ${divergent.region}`,
      body: `Across ${ds.causes.period}, ${divergent.region} recorded ${divergent.asr.toFixed(1)} deaths per 100,000 from ${divergent.cause.toLowerCase()}, against ${divergent.natAsr.toFixed(1)} nationally — the largest such gap for any leading cause in any SA3 region.`,
      link: '#v=causes',
    });
  }

  return out;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function covidRank(ds: Dataset): string {
  const rows = ds.causeRows('AUS', 'P');
  const idx = rows.findIndex((r) => /COVID/i.test(ds.causeName(r[0])));
  return idx < 0 ? 'a' : ordinal(idx + 1);
}

export interface DistinctiveCause {
  region: string;
  cause: string;
  asr: number;
  natAsr: number;
  ratio: number;
}

/**
 * The biggest single divergence between a region's cause-specific rate and the
 * national one. Restricted to regions of reasonable size, and to causes that
 * are national top-20, so it surfaces a real signal rather than a small-number
 * artefact.
 */
export function mostDistinctiveCause(ds: Dataset): DistinctiveCause | null {
  const natRows = ds.causeRows('AUS', 'P');
  const natByCause = new Map<number, number>();
  for (const [id, , , asr] of natRows) if (asr !== null) natByCause.set(id, asr);

  let best: DistinctiveCause | null = null;
  for (const region of ds.byLevel('SA3')) {
    const pop = ds.value(region, 'population', 'P');
    if ((pop ?? 0) < 40_000) continue;
    for (const [id, , , asr] of ds.causeRows(region.code, 'P')) {
      const natAsr = natByCause.get(id);
      if (asr === null || natAsr === undefined || natAsr <= 0) continue;
      const ratio = asr / natAsr;
      if (!best || ratio > best.ratio) {
        best = { region: region.name, cause: ds.causeName(id), asr, natAsr, ratio };
      }
    }
  }
  return best;
}
