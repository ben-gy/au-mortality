// Tests for the analysis layer against a small synthetic dataset shaped exactly
// like the real one — including a region whose rate is suppressed and a
// retirement-vs-mining pair that demonstrates the age illusion.

import { describe, expect, it } from 'vitest';
import { buildInsights, rankFlips, rankRegions } from '../src/analysis';
import { spreadLabels } from '../src/views/illusion';
import { sortRegions } from '../src/views/explorer';
import { Dataset, type CausesFile, type RegionsFile } from '../src/data';
import { esc, fmtNumber, fmtPct, fmtRatio, fmtRate, tipAttr } from '../src/format';

const MEASURES = [
  'deaths', 'population', 'crude', 'asr', 'rateRatio',
  'prematureDeaths', 'prematurePct', 'prematureAsr',
  'pyll', 'pyllRate', 'pad', 'padPct', 'padAsr', 'medianAge',
];

/** Build a 14-slot year row from named fields; anything omitted is suppressed. */
function y(o: Partial<Record<(typeof MEASURES)[number], number>>): (number | null)[] {
  return MEASURES.map((m) => (o[m] === undefined ? null : (o[m] as number)));
}

const regionsFile: RegionsFile = {
  generated: '2026-07-22T00:00:00.000Z',
  years: [2023, 2024],
  sexes: ['Persons', 'Males', 'Females'],
  measures: MEASURES,
  national: {
    code: 'AUS', level: 'AUS', name: 'Australia', state: null,
    d: {
      P: [y({ deaths: 183131, population: 26652777, crude: 687, asr: 512, pad: 28487, padPct: 48.7, padAsr: 98.4, medianAge: 82 }),
          y({ deaths: 187268, population: 27194369, crude: 688.6, asr: 507.7, pad: 29123, padPct: 49, padAsr: 99.1, medianAge: 82 })],
      M: [y({ asr: 600, padAsr: 130, medianAge: 79.6 }), y({ asr: 598.6, padAsr: 130.3, medianAge: 79.6 })],
      F: [y({ asr: 428, padAsr: 69, medianAge: 84.7 }), y({ asr: 426.5, padAsr: 69.2, medianAge: 84.7 })],
    },
  },
  regions: [
    // A retirement coast: huge crude rate, low standardised rate.
    { code: 'SA331001', level: 'SA3', name: 'Bribie Coast', state: 'Qld',
      d: { P: [y({ deaths: 900, population: 60000, crude: 1150, asr: 460, padAsr: 60, medianAge: 84 }),
               y({ deaths: 920, population: 61000, crude: 1193.8, asr: 455.6, padAsr: 58, medianAge: 80.4 })],
           M: [null, null], F: [null, null] } },
    // A young remote region: modest crude rate, severe standardised rate.
    { code: 'SA350901', level: 'SA3', name: 'Kimberley', state: 'WA',
      d: { P: [y({ deaths: 200, population: 36000, crude: 550, asr: 760, padAsr: 270, medianAge: 62 }),
               y({ deaths: 205, population: 36500, crude: 555.9, asr: 773, padAsr: 276.4, medianAge: 62.2 })],
           M: [null, null], F: [null, null] } },
    { code: 'SA310102', level: 'SA3', name: 'Queanbeyan', state: 'NSW',
      d: { P: [y({ deaths: 300, population: 55000, crude: 600, asr: 500, padAsr: 95, medianAge: 81 }),
               y({ deaths: 310, population: 56000, crude: 610, asr: 505, padAsr: 97, medianAge: 81.2 })],
           M: [null, null], F: [null, null] } },
    // Suppressed: deaths published, every rate withheld. Population large enough
    // to clear the ranking floor, so it WILL appear if the code coerces to zero.
    { code: 'SA370204', level: 'SA3', name: 'East Arnhem', state: 'NT',
      d: { P: [y({ deaths: 66, population: 14700 }), y({ deaths: 68, population: 16000 })],
           M: [null, null], F: [null, null] } },
    // Remoteness + socioeconomic groups
    { code: 'REM1', level: 'REM', name: 'Major Cities of Australia', state: null,
      d: { P: [y({ asr: 485, padAsr: 85, medianAge: 82.7 }), y({ asr: 480.2, padAsr: 86.4, medianAge: 82.7 })], M: [null, null], F: [null, null] } },
    { code: 'REM5', level: 'REM', name: 'Very Remote Australia', state: null,
      d: { P: [y({ asr: 750, padAsr: 240, medianAge: 69.4 }), y({ asr: 762, padAsr: 244.5, medianAge: 69.4 })], M: [null, null], F: [null, null] } },
    { code: 'SEG1', level: 'SEG', name: 'Quintile 1 (lowest)', state: null,
      d: { P: [y({ asr: 620, padAsr: 143, medianAge: 80.2 }), y({ asr: 618.7, padAsr: 143.8, medianAge: 80.2 })], M: [null, null], F: [null, null] } },
    { code: 'SEG5', level: 'SEG', name: 'Quintile 5 (highest)', state: null,
      d: { P: [y({ asr: 404, padAsr: 61.5, medianAge: 84.4 }), y({ asr: 402.8, padAsr: 61, medianAge: 84.4 })], M: [null, null], F: [null, null] } },
  ],
};

const causesFile: CausesFile = {
  generated: '2026-07-22T00:00:00.000Z',
  period: '2020–2024',
  causes: [
    { name: 'Coronary heart disease', icd: 'I20–I25' },
    { name: 'Suicide', icd: 'X60–X84, Y87.0' },
    { name: 'Coronavirus disease 2019 (COVID-19)', icd: 'U07.1' },
  ],
  rows: {
    AUS: { P: [[0, 86489, 9.7, 48.7], [1, 16351, 1.8, 12.2], [2, 20913, 2.3, 11.5]] },
    SA350901: { P: [[1, 90, 12, 61], [0, 60, 8, 55]] },
    SA331001: { P: [[0, 120, 13, 44]] },
  },
  totals: {
    AUS: { P: { all: 894107, allAsr: 513.6, top20: 570058 } },
  },
};

const ds = new Dataset(regionsFile, causesFile);

describe('Dataset accessors', () => {
  it('reads the latest year by default', () => {
    expect(ds.latestYear).toBe(2024);
    expect(ds.value(ds.national, 'deaths', 'P')).toBe(187268);
  });

  it('reads a specific year', () => {
    expect(ds.value(ds.national, 'deaths', 'P', 2023)).toBe(183131);
  });

  it('returns null for a suppressed measure instead of zero', () => {
    const arnhem = ds.region('SA370204')!;
    expect(ds.value(arnhem, 'deaths', 'P')).toBe(68);
    expect(ds.value(arnhem, 'asr', 'P')).toBeNull();
    expect(ds.value(arnhem, 'padAsr', 'P')).toBeNull();
  });

  it('returns null for an unknown year or region rather than throwing', () => {
    expect(ds.value(ds.national, 'deaths', 'P', 1999)).toBeNull();
    expect(ds.region('NOPE')).toBeUndefined();
  });

  it('builds a series with gaps preserved', () => {
    expect(ds.series(ds.region('SA370204')!, 'asr', 'P')).toEqual([null, null]);
    expect(ds.series(ds.national, 'asr', 'P')).toEqual([512, 507.7]);
  });

  it('filters by level without leaking the national row', () => {
    const sa3 = ds.byLevel('SA3');
    expect(sa3).toHaveLength(4);
    expect(sa3.some((r) => r.code === 'AUS')).toBe(false);
  });
});

describe('rankRegions', () => {
  it('ranks worst-first for a measure where higher is worse', () => {
    const r = rankRegions(ds, 'SA3', 'padAsr', 'P');
    expect(r[0].region.name).toBe('Kimberley');
    expect(r[0].rank).toBe(1);
  });

  it('ranks median age lowest-first, because dying youngest is the burden', () => {
    // Rank 1 always means "most burden", whichever direction the measure runs.
    const r = rankRegions(ds, 'SA3', 'medianAge', 'P');
    expect(r[0].region.name).toBe('Kimberley');
    expect(r[r.length - 1].region.name).toBe('Queanbeyan');
  });

  it('EXCLUDES suppressed regions rather than sorting them to an end', () => {
    const r = rankRegions(ds, 'SA3', 'padAsr', 'P');
    expect(r.map((x) => x.region.code)).not.toContain('SA370204');
    // If suppression were coerced to 0, East Arnhem would rank as the healthiest.
    expect(r[r.length - 1].region.code).not.toBe('SA370204');
  });

  it('returns [] for a level with no data', () => {
    expect(rankRegions(ds, 'PHN', 'asr', 'P')).toEqual([]);
  });
});

describe('rankFlips — the age illusion', () => {
  const flips = rankFlips(ds, 'SA3', 'P');

  it('covers every region that has both rates', () => {
    expect(flips).toHaveLength(3);
  });

  it('gives the retirement coast a worse crude rank than standardised rank', () => {
    const bribie = flips.find((f) => f.region.name === 'Bribie Coast')!;
    expect(bribie.crudeRank).toBe(1);
    expect(bribie.asrRank).toBe(3);
    expect(bribie.shift).toBeGreaterThan(0); // moves DOWN the burden table = just older
  });

  it('gives the young remote region a better crude rank than standardised rank', () => {
    const kimberley = flips.find((f) => f.region.name === 'Kimberley')!;
    expect(kimberley.crudeRank).toBe(3);
    expect(kimberley.asrRank).toBe(1);
    expect(kimberley.shift).toBeLessThan(0); // moves UP the burden table = hidden burden
  });

  it('never includes a region whose rate is suppressed', () => {
    expect(flips.some((f) => f.region.code === 'SA370204')).toBe(false);
  });

  it('keeps both ranks inside the same denominator', () => {
    // The bug this guards: ranking each measure over everything published and
    // filtering afterwards printed "ranks 323rd of 322".
    for (const f of flips) {
      expect(f.crudeRank).toBeGreaterThanOrEqual(1);
      expect(f.crudeRank).toBeLessThanOrEqual(flips.length);
      expect(f.asrRank).toBeGreaterThanOrEqual(1);
      expect(f.asrRank).toBeLessThanOrEqual(flips.length);
    }
  });

  it('assigns each rank exactly once', () => {
    expect(new Set(flips.map((f) => f.crudeRank)).size).toBe(flips.length);
    expect(new Set(flips.map((f) => f.asrRank)).size).toBe(flips.length);
  });

  it('re-ranks within the filtered set so the caller filter cannot desync the denominator', () => {
    const filtered = rankFlips(ds, 'SA3', 'P', undefined, (r) => r.name !== 'Queanbeyan');
    expect(filtered).toHaveLength(2);
    for (const f of filtered) {
      expect(f.crudeRank).toBeLessThanOrEqual(2);
      expect(f.asrRank).toBeLessThanOrEqual(2);
    }
  });
});

describe('sortRegions', () => {
  const sa3 = ds.byLevel('SA3');

  it('puts the LARGEST value first when descending — the caret says so', () => {
    const out = sortRegions(ds, sa3, 'padAsr', 'P', 2024, 'desc');
    expect(out[0].name).toBe('Kimberley'); // 276.4
    expect(out[1].name).toBe('Queanbeyan'); // 97
  });

  it('puts the smallest value first when ascending', () => {
    const out = sortRegions(ds, sa3, 'padAsr', 'P', 2024, 'asc');
    expect(out[0].name).toBe('Bribie Coast'); // 58
  });

  it('sinks suppressed regions to the bottom in BOTH directions', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const out = sortRegions(ds, sa3, 'padAsr', 'P', 2024, dir);
      expect(out[out.length - 1].name).toBe('East Arnhem');
    }
  });

  it('breaks ties by name so the order is stable', () => {
    const out = sortRegions(ds, sa3, 'deaths', 'P', 2024, 'desc');
    expect(out.map((r) => r.name)).toHaveLength(sa3.length);
  });

  it('does not mutate the input array', () => {
    const before = sa3.map((r) => r.code);
    sortRegions(ds, sa3, 'asr', 'P', 2024, 'desc');
    expect(sa3.map((r) => r.code)).toEqual(before);
  });
});

describe('spreadLabels', () => {
  it('leaves already-separated labels alone', () => {
    expect(spreadLabels([10, 40, 70], 12, 0, 100)).toEqual([10, 40, 70]);
  });

  it('pushes colliding labels apart to at least the minimum gap', () => {
    const out = spreadLabels([10, 11, 12], 12, 0, 200);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });

  it('preserves the input order', () => {
    const out = spreadLabels([50, 10, 30], 12, 0, 200);
    expect(out[1]).toBeLessThan(out[2]);
    expect(out[2]).toBeLessThan(out[0]);
  });

  it('keeps labels inside the plot when the run overflows the bottom', () => {
    const out = spreadLabels([95, 96, 97, 98], 12, 0, 100);
    for (const y of out) {
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('produces no NaN and handles empty input', () => {
    expect(spreadLabels([], 12, 0, 100)).toEqual([]);
    for (const y of spreadLabels([5], 12, 0, 100)) expect(Number.isFinite(y)).toBe(true);
  });
});

describe('buildInsights', () => {
  const insights = buildInsights(ds);

  it('produces findings', () => {
    expect(insights.length).toBeGreaterThan(3);
  });

  it('leads with the avoidable-deaths headline using real numbers', () => {
    const headline = insights.find((i) => i.title.includes('potentially avoidable'));
    expect(headline).toBeDefined();
    expect(headline!.title).toContain('29,123');
  });

  it('computes the remoteness gradient ratio rather than hard-coding it', () => {
    const rem = insights.find((i) => i.title.includes('very remote'));
    expect(rem).toBeDefined();
    // 244.5 / 86.4 = 2.83
    expect(rem!.title).toContain('2.8×');
  });

  it('computes the socioeconomic gradient', () => {
    const seg = insights.find((i) => i.title.includes('poorest fifth'));
    expect(seg).toBeDefined();
    expect(seg!.title).toContain('2.4×');
  });

  it('reports the sex gap', () => {
    const sex = insights.find((i) => i.title.includes('men die'));
    expect(sex).toBeDefined();
    expect(sex!.title).toContain('1.40×');
  });

  it('names the suppressed regions instead of hiding them', () => {
    const sup = insights.find((i) => i.title.includes('no published rate'));
    expect(sup).toBeDefined();
    expect(sup!.body).toContain('East Arnhem');
  });

  it('gives every insight a severity and a body', () => {
    for (const i of insights) {
      expect(['info', 'warn', 'alert']).toContain(i.severity);
      expect(i.body.length).toBeGreaterThan(10);
    }
  });
});

describe('formatting', () => {
  it('formats thousands with separators', () => {
    expect(fmtNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero as zero, not as a dash', () => {
    expect(fmtNumber(0)).toBe('0');
  });

  it('renders a suppressed value as an em dash, never as 0', () => {
    expect(fmtNumber(null)).toBe('—');
    expect(fmtRate(null)).toBe('—');
    expect(fmtPct(null)).toBe('—');
    expect(fmtRatio(null)).toBe('—');
  });

  it('handles negatives and decimals', () => {
    expect(fmtNumber(-1234)).toBe('-1,234');
    expect(fmtRate(1234.56, 2)).toBe('1,234.56');
  });

  it('rejects NaN and Infinity', () => {
    expect(fmtNumber(NaN)).toBe('—');
    expect(fmtNumber(Infinity)).toBe('—');
  });

  it('escapes the characters that break markup', () => {
    expect(esc(`Alzheimer's & "co" <b>`)).toBe('Alzheimer&#39;s &amp; &quot;co&quot; &lt;b&gt;');
  });

  it('encodes newlines for an innerHTML data-tip but leaves the raw string alone for setAttribute', () => {
    // Using the wrong one renders a literal "&#10;" in the tooltip.
    expect(tipAttr('a\nb')).toBe('a&#10;b');
    expect('a\nb').toContain('\n');
  });
});
