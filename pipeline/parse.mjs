// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Pure, dependency-free shaping for the AIHW MORT books.
// Imported by aggregate.mjs AND by the test suite, so it must never touch the
// network or the filesystem.
//
// ── The five traps this file exists to handle ────────────────────────────────
//
// 1. SUBTOTAL ROWS IN THE SAME COLUMN AS REAL CAUSES.  Table 2 carries two rows
//    per geography x sex whose `rank` is BLANK: "Top 20 leading causes" and
//    "All causes". They sit in the `cause_of_death` column beside the twenty
//    real causes. Summing the column naively counts every death ~2.6x. Leaf
//    causes are exactly the rows with a non-blank rank; "All causes" is the
//    denominator, never an item.
//
// 2. GEOGRAPHY NAMES COLLIDE ACROSS LEVELS.  127 names appear under more than
//    one category — Tasmania is both a state and a PHN; "Australia (total)"
//    appears under all eight. The join key is the `mort` code, never the name.
//    And "Australia (total)" must be pulled out of every level or the national
//    figure gets ranked as though it were a region (and wins).
//
// 3. BLANK IS SUPPRESSED, NOT ZERO.  Rates are withheld where the population is
//    too small to standardise — 11 of 342 SA3s in 2024, including real places
//    like East Arnhem (pop 14,724) and Barkly (pop 6,067). Coerce those to 0 and
//    the most disadvantaged regions in the country rank as the healthiest. Blank
//    stays null the whole way to the screen, where it renders as "not published".
//
// 4. NUMBERS ARE FORMATTED STRINGS.  "187,268" and "1,193.80" — commas must be
//    stripped before Number(), and the file is CP1252, not UTF-8 (the en-dashes
//    in ICD ranges like "I20–I25" are byte 0x96 and throw a UTF-8 decoder).
//
// 5. MEDIAN AGE AT DEATH IS NOT LIFE EXPECTANCY.  Nothing to parse here, but the
//    field is labelled carefully downstream for the same reason the ASR exists:
//    it is shaped by who lives in a place, not only by how long they live.

// ── Encoding ─────────────────────────────────────────────────────────────────

// CP1252 and latin1 agree everywhere except 0x80-0x9F, where latin1 has C1
// control characters and CP1252 has printable punctuation. The MORT files use
// 0x96 (en dash) in every ICD range — "I20–I25" — and 0x92 (curly apostrophe)
// in "Alzheimer's disease". Decode as plain latin1 and those become invisible
// control characters that later vanish from the DOM, so the range silently
// renders as "I20I25" and the pooled period as "20202024". Node ships no
// 'cp1252' decoder and TextDecoder('windows-1252') needs a full-ICU build, so
// the 32 slots are mapped explicitly. The five unassigned ones (0x81, 0x8D,
// 0x8F, 0x90, 0x9D) map to U+FFFD.
const CP1252_C1 = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

/** CP1252 bytes in, real Unicode out. */
export function decodeCp1252(buf) {
  const latin1 = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  let out = '';
  for (let i = 0; i < latin1.length; i++) {
    const c = latin1.charCodeAt(i);
    out += c >= 0x80 && c <= 0x9f ? String.fromCharCode(CP1252_C1[c - 0x80]) : latin1[i];
  }
  return out;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** RFC 4180 reader: handles quoted fields, embedded commas, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  // Strip a UTF-8 BOM if one snuck in.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** CSV text -> array of objects keyed by header. Blank trailing rows dropped. */
export function parseRows(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].length === 1 && rows[r][0].trim() === '') continue;
    const o = {};
    for (let c = 0; c < head.length; c++) o[head[c]] = rows[r][c] ?? '';
    out.push(o);
  }
  return out;
}

/**
 * Trap 3 + 4. Blank / suppression sentinels become null — NEVER 0. Commas and
 * stray percent signs are stripped before Number().
 */
export function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, '').replace(/%$/, '');
  if (s === '' || s === 'n.p.' || s === 'n.a.' || s === '..' || s === '-' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Geography ────────────────────────────────────────────────────────────────

export const LEVELS = {
  'Statistical Area Level 3 (SA3)': 'SA3',
  'Local Government Area (LGA)': 'LGA',
  'Statistical Area Level 4 (SA4)': 'SA4',
  'Primary Health Network (PHN)': 'PHN',
  'Greater Capital City Statistical Areas (GCCSA)': 'GCCSA',
  'State and territory': 'STE',
  'Remoteness area': 'REM',
  'Socioeconomic group': 'SEG',
};

export const NATIONAL_NAME = 'Australia (total)';
const UNKNOWN_NAME = 'Unknown/missing';

const STATE_BY_DIGIT = {
  1: 'NSW',
  2: 'Vic',
  3: 'Qld',
  4: 'SA',
  5: 'WA',
  6: 'Tas',
  7: 'NT',
  8: 'ACT',
  9: 'Other',
};

/**
 * ASGS codes encode the state in their first digit, and MORT prefixes them with
 * the level ("SA310102" = SA3 10102 = NSW). Levels that aren't a place inside a
 * state (remoteness, socioeconomic quintile) get null.
 */
export function stateOf(mortCode, level) {
  if (level === 'REM' || level === 'SEG') return null;
  const digits = String(mortCode).replace(/^(SA3|SA4|LGA|PHN|GCC|STE|REM|SEG)/, '');
  const d = Number(digits[0]);
  return STATE_BY_DIGIT[d] ?? null;
}

/** Strip the level prefix so SA310102 -> 10102, the ABS boundary join key. */
export function asgsCode(mortCode) {
  return String(mortCode).replace(/^(SA3|SA4|LGA|PHN|GCC)/, '');
}

// ── Causes ───────────────────────────────────────────────────────────────────

/**
 * "Chronic obstructive pulmonary disease (COPD) (J40–J44)" ->
 *   { name: 'Chronic obstructive pulmonary disease (COPD)', icd: 'J40–J44' }
 * The ICD codes are always the LAST parenthetical — several cause names carry
 * their own parentheses, so a greedy or first-match split mangles them.
 */
export function splitCause(label) {
  const s = String(label).trim();
  const open = s.lastIndexOf('(');
  if (open <= 0 || !s.endsWith(')')) return { name: s, icd: '' };
  return { name: s.slice(0, open).trim(), icd: s.slice(open + 1, -1).trim() };
}

export const SUBTOTAL_CAUSES = new Set(['Top 20 leading causes', 'All causes']);

/** Trap 1: a leaf cause is exactly a row with a rank. */
export function isLeafCause(row) {
  return String(row.rank ?? '').trim() !== '';
}

// ── Shaping ──────────────────────────────────────────────────────────────────

export const MEASURES = [
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

const COL = [
  'deaths',
  'population',
  'crude_rate_per_100000',
  'age_standardised_rate_per_100000',
  'rate_ratio',
  'premature_deaths',
  'premature_deaths_percent',
  'premature_deaths_asr_per_100000',
  'potential_years_of_life_lost',
  'pyll_rate_per_1000',
  'potentially_avoidable_deaths',
  'pad_percent',
  'pad_asr_per_100000',
  'median_age',
];

export const SEXES = ['Persons', 'Males', 'Females'];
const SEX_KEY = { Persons: 'P', Males: 'M', Females: 'F' };

/**
 * Table 1 -> { years, regions, national }.
 *
 * regions[].d[sexKey][yearIndex] is a 14-slot array in MEASURES order, with null
 * for anything the AIHW withheld.
 */
export function buildRegions(t1) {
  const years = [...new Set(t1.map((r) => r.year))].filter((y) => /^\d{4}$/.test(y)).sort();
  const yearIndex = new Map(years.map((y, i) => [y, i]));

  const byCode = new Map();
  let national = null;

  for (const r of t1) {
    const level = LEVELS[r.category];
    if (!level) continue;
    const name = String(r.geography ?? '').trim();
    if (name === UNKNOWN_NAME) continue; // trap 2: not a place
    const yi = yearIndex.get(r.year);
    if (yi === undefined) continue;
    const sk = SEX_KEY[String(r.sex ?? '').trim()];
    if (!sk) continue;

    const values = COL.map((c) => num(r[c]));

    // Trap 2: the national row is duplicated into all eight levels. Keep exactly
    // one copy, from the state level, and let it be no level's member.
    if (name === NATIONAL_NAME) {
      if (level !== 'STE') continue;
      if (!national) national = { code: 'AUS', level: 'AUS', name: 'Australia', state: null, d: emptyD(years.length) };
      national.d[sk][yi] = values;
      continue;
    }

    const code = String(r.mort ?? '').trim();
    if (!code) continue;
    let reg = byCode.get(code);
    if (!reg) {
      reg = {
        code,
        level,
        name,
        state: level === 'STE' ? shortState(name) : stateOf(code, level),
        d: emptyD(years.length),
      };
      byCode.set(code, reg);
    }
    reg.d[sk][yi] = values;
  }

  const regions = [...byCode.values()].sort(
    (a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name),
  );
  return { years: years.map(Number), regions, national };
}

function emptyD(n) {
  return { P: new Array(n).fill(null), M: new Array(n).fill(null), F: new Array(n).fill(null) };
}

const STATE_SHORT = {
  'New South Wales': 'NSW',
  Victoria: 'Vic',
  Queensland: 'Qld',
  'South Australia': 'SA',
  'Western Australia': 'WA',
  Tasmania: 'Tas',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT',
  'Other Territories': 'Other',
};
function shortState(name) {
  return STATE_SHORT[name] ?? null;
}

/**
 * Table 2 -> { period, causes, rows, totals }.
 *
 *   causes  — deduped dictionary, index is the id used in rows
 *   rows    — code -> sexKey -> [[causeId, deaths, pct, asr], ...] in rank order
 *   totals  — code -> sexKey -> { all: deaths, allAsr, top20: deaths }
 *
 * `validCodes` restricts output to regions that survived buildRegions, so the
 * national duplicates and Unknown/missing never leak in.
 */
export function buildCauses(t2, validCodes) {
  const causeIds = new Map();
  const causes = [];
  const rows = {};
  const totals = {};
  let period = '';

  for (const r of t2) {
    const level = LEVELS[r.category];
    if (!level) continue;
    const name = String(r.geography ?? '').trim();
    if (name === UNKNOWN_NAME) continue;
    const sk = SEX_KEY[String(r.sex ?? '').trim()];
    if (!sk) continue;
    period ||= String(r.year ?? '').trim();

    const isNat = name === NATIONAL_NAME;
    if (isNat && level !== 'STE') continue;
    const code = isNat ? 'AUS' : String(r.mort ?? '').trim();
    if (!code) continue;
    if (!isNat && validCodes && !validCodes.has(code)) continue;

    const label = String(r.cause_of_death ?? '').trim();
    const deaths = num(r.deaths);

    // Trap 1: the two subtotal rows carry no rank. Route them to `totals`.
    if (!isLeafCause(r)) {
      const t = (totals[code] ??= {});
      const e = (t[sk] ??= { all: null, allAsr: null, top20: null });
      if (label === 'All causes') {
        e.all = deaths;
        e.allAsr = num(r.age_standardised_rate_per_100000);
      } else if (label === 'Top 20 leading causes') {
        e.top20 = deaths;
      }
      continue;
    }

    let id = causeIds.get(label);
    if (id === undefined) {
      id = causes.length;
      causeIds.set(label, id);
      const { name: cname, icd } = splitCause(label);
      causes.push({ name: cname, icd });
    }

    const byCode = (rows[code] ??= {});
    (byCode[sk] ??= []).push([
      id,
      deaths,
      num(r.deaths_percent),
      num(r.age_standardised_rate_per_100000),
    ]);
  }

  return { period, causes, rows, totals };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Cross-table reconciliation. Table 2's pooled "All causes" death count for
 * Australia must equal the sum of Table 1's five annual counts — the two tables
 * are produced independently, so agreement here proves the parser read both
 * correctly. Also checks that the twenty ranked causes sum to the published
 * "Top 20 leading causes" subtotal, which is what catches trap 1 regressing.
 */
export function validate({ regions, national, causes }) {
  const problems = [];
  const D = MEASURES.indexOf('deaths');

  if (!national) problems.push('no national (Australia total) row found');
  else {
    const annual = national.d.P.filter(Boolean).map((v) => v[D]);
    const sum = annual.reduce((a, b) => a + (b ?? 0), 0);
    const pooled = causes.totals?.AUS?.P?.all;
    if (pooled == null) problems.push('no national "All causes" total in table 2');
    else if (sum !== pooled) {
      problems.push(
        `table 1 annual deaths sum to ${sum} but table 2 "All causes" says ${pooled}`,
      );
    }

    const leaves = causes.rows?.AUS?.P ?? [];
    if (leaves.length !== 20) problems.push(`expected 20 national leading causes, got ${leaves.length}`);
    const top20 = leaves.reduce((a, r) => a + (r[1] ?? 0), 0);
    const published = causes.totals?.AUS?.P?.top20;
    if (published == null) problems.push('no national "Top 20 leading causes" subtotal');
    else if (top20 !== published) {
      problems.push(`ranked causes sum to ${top20} but the published top-20 subtotal is ${published}`);
    }
  }

  const sa3 = regions.filter((r) => r.level === 'SA3');
  if (sa3.length < 300) problems.push(`only ${sa3.length} SA3 regions — expected ~342`);
  if (regions.some((r) => r.name === NATIONAL_NAME)) {
    problems.push('the national total leaked into the region list');
  }

  return problems;
}
