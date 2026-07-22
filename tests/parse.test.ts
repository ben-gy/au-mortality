// Tests for the pipeline parser. Everything here targets a trap that produced a
// confidently wrong number during the build — see the header of parse.mjs.

import { describe, expect, it } from 'vitest';
// Plain .mjs, deliberately dependency-free so CI can run it with bare node.
// Types come from tests/pipeline.d.ts.
import {
  buildCauses,
  buildRegions,
  decodeCp1252,
  isLeafCause,
  num,
  parseCsv,
  parseRows,
  splitCause,
  stateOf,
  asgsCode,
  validate,
} from '../pipeline/parse.mjs';

describe('parseCsv', () => {
  it('reads a simple grid', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"Cancer, unknown site",5')).toEqual([
      ['a', 'b'],
      ['Cancer, unknown site', '5'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"He said ""no"""')).toEqual([['a'], ['He said "no"']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseRows', () => {
  it('keys rows by header', () => {
    expect(parseRows('geography,deaths\nKatherine,48')).toEqual([{ geography: 'Katherine', deaths: '48' }]);
  });

  it('drops a trailing blank line', () => {
    expect(parseRows('a\n1\n\n')).toHaveLength(1);
  });
});

describe('decodeCp1252', () => {
  it('turns byte 0x96 into an en dash, not a control character', () => {
    // "I20–I25" as the AIHW actually ships it
    const buf = Buffer.from([0x49, 0x32, 0x30, 0x96, 0x49, 0x32, 0x35]);
    expect(decodeCp1252(buf)).toBe('I20–I25');
  });

  it('turns byte 0x92 into a curly apostrophe', () => {
    const buf = Buffer.from([0x41, 0x92, 0x73]);
    expect(decodeCp1252(buf)).toBe('A’s');
  });

  it('leaves ASCII untouched', () => {
    expect(decodeCp1252(Buffer.from('Coronary heart disease', 'latin1'))).toBe('Coronary heart disease');
  });

  it('passes latin1 accents through unchanged', () => {
    expect(decodeCp1252(Buffer.from([0xe9]))).toBe('é');
  });
});

describe('num — suppression must never become zero', () => {
  it('strips thousands separators', () => {
    expect(num('187,268')).toBe(187268);
    expect(num('1,193.80')).toBe(1193.8);
  });

  it('returns null for a blank, which is the suppression sentinel', () => {
    expect(num('')).toBeNull();
    expect(num('   ')).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });

  it('returns null — not 0 — for every published sentinel', () => {
    for (const s of ['n.p.', 'n.a.', '..', '-', 'N/A']) expect(num(s)).toBeNull();
  });

  it('reads a genuine zero as zero', () => {
    expect(num('0')).toBe(0);
    expect(num('0.0')).toBe(0);
  });

  it('handles negatives and percent signs', () => {
    expect(num('-12.5')).toBe(-12.5);
    expect(num('49%')).toBe(49);
  });

  it('returns null for unparseable text rather than NaN', () => {
    expect(num('not a number')).toBeNull();
  });
});

describe('splitCause — the ICD code is the LAST parenthetical', () => {
  it('splits a simple label', () => {
    expect(splitCause('Coronary heart disease (I20–I25)')).toEqual({
      name: 'Coronary heart disease',
      icd: 'I20–I25',
    });
  });

  it('keeps an acronym that is itself parenthesised', () => {
    expect(splitCause('Chronic obstructive pulmonary disease (COPD) (J40–J44)')).toEqual({
      name: 'Chronic obstructive pulmonary disease (COPD)',
      icd: 'J40–J44',
    });
  });

  it('keeps commas and exclusions inside the code group', () => {
    expect(splitCause('Cancer of unknown primary site (C26, C39, C76–C80 excl. C26.0)').icd).toBe(
      'C26, C39, C76–C80 excl. C26.0',
    );
  });

  it('leaves a label with no code alone', () => {
    expect(splitCause('All causes')).toEqual({ name: 'All causes', icd: '' });
  });
});

describe('isLeafCause — subtotal rows carry no rank', () => {
  it('accepts a ranked cause', () => {
    expect(isLeafCause({ rank: '1' })).toBe(true);
  });

  it('rejects the two subtotal rows', () => {
    expect(isLeafCause({ rank: '' })).toBe(false);
    expect(isLeafCause({ rank: '   ' })).toBe(false);
    expect(isLeafCause({})).toBe(false);
  });
});

describe('geography codes', () => {
  it('reads the state out of the first ASGS digit', () => {
    expect(stateOf('SA310102', 'SA3')).toBe('NSW');
    expect(stateOf('SA320604', 'SA3')).toBe('Vic');
    expect(stateOf('LGA30250', 'LGA')).toBe('Qld');
    expect(stateOf('SA370202', 'SA3')).toBe('NT');
    expect(stateOf('SA380103', 'SA3')).toBe('ACT');
  });

  it('gives no state to levels that are not places inside one', () => {
    expect(stateOf('REM1', 'REM')).toBeNull();
    expect(stateOf('SEG3', 'SEG')).toBeNull();
  });

  it('strips the level prefix to get the boundary join key', () => {
    expect(asgsCode('SA310102')).toBe('10102');
    expect(asgsCode('LGA10050')).toBe('10050');
  });
});

// ── Shaping, against a miniature of the real file ────────────────────────────

const T1_HEAD =
  'mort,category,geography,year,sex,deaths,population,crude_rate_per_100000,age_standardised_rate_per_100000,rate_ratio,premature_deaths,premature_deaths_percent,premature_deaths_asr_per_100000,potential_years_of_life_lost,pyll_rate_per_1000,potentially_avoidable_deaths,pad_percent,pad_asr_per_100000,median_age';

function t1Row(o: Record<string, string>): string {
  const cols = T1_HEAD.split(',');
  // Quote anything containing a comma, exactly as the AIHW does for "1,193.80".
  return cols.map((c) => (o[c] ?? '')).map((v) => (v.includes(',') ? `"${v}"` : v)).join(',');
}

const t1 = [
  T1_HEAD,
  // National, duplicated into two levels exactly as the source does
  t1Row({ mort: 'STE00', category: 'State and territory', geography: 'Australia (total)', year: '2024', sex: 'Persons', deaths: '100', population: '1,000', age_standardised_rate_per_100000: '500', pad_asr_per_100000: '99.1', median_age: '82' }),
  t1Row({ mort: 'SA300000', category: 'Statistical Area Level 3 (SA3)', geography: 'Australia (total)', year: '2024', sex: 'Persons', deaths: '100', population: '1,000' }),
  // A real region
  t1Row({ mort: 'SA310102', category: 'Statistical Area Level 3 (SA3)', geography: 'Queanbeyan', year: '2024', sex: 'Persons', deaths: '60', population: '600', crude_rate_per_100000: '1,000', age_standardised_rate_per_100000: '450', pad_asr_per_100000: '80', median_age: '81' }),
  // A region whose rate is withheld — deaths published, rate blank
  t1Row({ mort: 'SA370202', category: 'Statistical Area Level 3 (SA3)', geography: 'Barkly', year: '2024', sex: 'Persons', deaths: '48', population: '6,067', age_standardised_rate_per_100000: '', pad_asr_per_100000: '' }),
  // Not a place
  t1Row({ mort: 'SA3ZZZZZ', category: 'Statistical Area Level 3 (SA3)', geography: 'Unknown/missing', year: '2024', sex: 'Persons', deaths: '2' }),
].join('\n');

const t2 =
  'mort,category,geography,year,sex,rank,cause_of_death,deaths,deaths_percent,crude_rate_per_100000,age_standardised_rate_per_100000,rate_ratio\n' +
  'STE00,State and territory,Australia (total),2020–2024,Persons,1,Coronary heart disease (I20–I25),60,60,10,48.7,1\n' +
  'STE00,State and territory,Australia (total),2020–2024,Persons,2,Lung cancer (C33; C34),40,40,8,26,1\n' +
  'STE00,State and territory,Australia (total),2020–2024,Persons,,Top 20 leading causes,100,100,,,\n' +
  'STE00,State and territory,Australia (total),2020–2024,Persons,,All causes,100,100,,513.6,\n' +
  'SA310102,Statistical Area Level 3 (SA3),Queanbeyan,2020–2024,Persons,1,Coronary heart disease (I20–I25),12,20,9,55,1.13\n' +
  'SA310102,Statistical Area Level 3 (SA3),Queanbeyan,2020–2024,Persons,,All causes,60,100,,470,\n';

describe('buildRegions', () => {
  const built = buildRegions(parseRows(t1));

  it('finds the years present', () => {
    expect(built.years).toEqual([2024]);
  });

  it('keeps exactly one national row and keeps it out of the region list', () => {
    expect(built.national).not.toBeNull();
    expect(built.national.code).toBe('AUS');
    expect(built.regions.some((r: { name: string }) => r.name === 'Australia (total)')).toBe(false);
  });

  it('drops the Unknown/missing pseudo-region', () => {
    expect(built.regions.some((r: { name: string }) => r.name === 'Unknown/missing')).toBe(false);
  });

  it('keeps real regions with their derived state', () => {
    const q = built.regions.find((r) => r.code === 'SA310102')!;
    expect(q.name).toBe('Queanbeyan');
    expect(q.state).toBe('NSW');
    expect(q.level).toBe('SA3');
  });

  it('parses measures into MEASURES order with commas stripped', () => {
    const q = built.regions.find((r) => r.code === 'SA310102')!;
    const row = q.d.P[0]!; // [deaths, population, crude, asr, ...]
    expect(row[0]).toBe(60);
    expect(row[1]).toBe(600);
    expect(row[2]).toBe(1000); // "1,000" — quoted, comma-separated in the source
    expect(row[3]).toBe(450);
  });

  it('keeps a withheld rate as null while keeping the published death count', () => {
    const b = built.regions.find((r) => r.code === 'SA370202')!;
    const row = b.d.P[0]!;
    expect(row[0]).toBe(48); // deaths published
    expect(row[3]).toBeNull(); // ASR withheld — must NOT be 0
  });
});

describe('buildCauses', () => {
  const regions = buildRegions(parseRows(t1));
  const codes = new Set(regions.regions.map((r: { code: string }) => r.code));
  const built = buildCauses(parseRows(t2), codes);

  it('reads the pooled period', () => {
    expect(built.period).toBe('2020–2024');
  });

  it('routes the two subtotal rows to totals, never into the cause list', () => {
    expect(built.rows.AUS.P).toHaveLength(2);
    expect(built.totals.AUS.P.all).toBe(100);
    expect(built.totals.AUS.P.top20).toBe(100);
    expect(built.causes.some((c: { name: string }) => c.name === 'All causes')).toBe(false);
    expect(built.causes.some((c: { name: string }) => c.name === 'Top 20 leading causes')).toBe(false);
  });

  it('dedupes causes into a shared dictionary', () => {
    // Coronary heart disease appears for both Australia and Queanbeyan
    const ids = built.rows.AUS.P.map((r) => r[0]);
    const qIds = built.rows.SA310102.P.map((r) => r[0]);
    expect(qIds[0]).toBe(ids[0]);
    expect(built.causes).toHaveLength(2);
  });

  it('keeps rank order', () => {
    const firstId = built.rows.AUS.P[0][0]!;
    expect(built.causes[firstId].name).toBe('Coronary heart disease');
  });
});

describe('validate', () => {
  const regions = buildRegions(parseRows(t1));
  const codes = new Set(regions.regions.map((r: { code: string }) => r.code));
  const causes = buildCauses(parseRows(t2), codes);

  it('reports the SA3 shortfall on a miniature fixture', () => {
    const problems = validate({ ...regions, causes });
    expect(problems.some((p: string) => p.includes('SA3 regions'))).toBe(true);
  });

  it('catches a mismatch between table 1 deaths and table 2 "All causes"', () => {
    const broken = structuredClone(causes);
    broken.totals.AUS.P.all = 999;
    const problems = validate({ ...regions, causes: broken });
    expect(problems.some((p: string) => p.includes('All causes'))).toBe(true);
  });

  it('catches the subtotal trap regressing — ranked causes no longer summing to the published subtotal', () => {
    const broken = structuredClone(causes);
    broken.totals.AUS.P.top20 = 12345;
    const problems = validate({ ...regions, causes: broken });
    expect(problems.some((p: string) => p.includes('top-20'))).toBe(true);
  });

  it('passes the deaths reconciliation when the numbers agree', () => {
    const problems = validate({ ...regions, causes });
    expect(problems.some((p: string) => p.includes('All causes'))).toBe(false);
  });
});
