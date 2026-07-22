// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Shape pipeline/tmp/* into the JSON the browser reads, and refuse to ship if
// the numbers don't reconcile. All shaping logic lives in parse.mjs (tested);
// this file is I/O, boundary simplification and the fail-the-build assertions.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { asgsCode, buildCauses, buildRegions, parseRows, validate } from './parse.mjs';

const TMP = join(import.meta.dirname, 'tmp');
const OUT = join(import.meta.dirname, '..', 'public', 'data');
mkdirSync(OUT, { recursive: true });

const read = (f) => readFileSync(join(TMP, f), 'utf8');

function main() {
  console.log('parsing table 1...');
  const t1 = parseRows(read('mort-table1.csv'));
  console.log(`  ${t1.length} rows`);

  console.log('parsing table 2...');
  const t2 = parseRows(read('mort-table2.csv'));
  console.log(`  ${t2.length} rows`);

  const { years, regions, national } = buildRegions(t1);
  console.log(`  ${regions.length} regions across ${years.length} years (${years.join(', ')})`);

  const codes = new Set(regions.map((r) => r.code));
  const causes = buildCauses(t2, codes);
  console.log(`  ${causes.causes.length} distinct causes, period ${causes.period}`);

  // Fail the build on drift rather than shipping a plausible wrong number.
  const problems = validate({ regions, national, causes });
  if (problems.length) {
    console.error('VALIDATION FAILED:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('  validation passed (table 1 annual deaths reconcile with table 2 "All causes")');

  const generated = new Date().toISOString();

  writeFileSync(
    join(OUT, 'regions.json'),
    JSON.stringify({
      generated,
      years,
      sexes: ['Persons', 'Males', 'Females'],
      measures: [
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
      ],
      national,
      regions,
    }),
  );

  writeFileSync(join(OUT, 'causes.json'), JSON.stringify({ generated, ...causes }));

  simplifyBoundaries(new Set(regions.filter((r) => r.level === 'SA3').map((r) => asgsCode(r.code))));

  for (const f of ['regions.json', 'causes.json', 'sa3.geojson']) {
    const p = join(OUT, f);
    console.log(`  ${f}: ${(statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('aggregate done.');
}

/**
 * Real ABS polygons, simplified with mapshaper to land in the 100KB-1MB window.
 * Never hand-authored, never below the floor: a boundary file under 50KB means
 * the geometry is fake.
 */
function simplifyBoundaries(keepCodes) {
  const src = join(TMP, 'sa3-raw.geojson');
  const dst = join(OUT, 'sa3.geojson');

  // ASGS ships 359 SA3 features but MORT publishes 342. The extra 17 are the
  // non-spatial ones — "Migratory - Offshore - Shipping" and "No usual address"
  // per state — which have no real geography and would render as unexplained
  // grey slivers. Drop anything with no mortality row rather than shipping it.
  const raw = JSON.parse(readFileSync(src, 'utf8'));
  const kept = raw.features.filter((f) => keepCodes.has(String(f.properties?.sa3_code_2021)));
  console.log(`  ${kept.length} of ${raw.features.length} SA3 polygons have mortality data`);
  if (kept.length < 300) throw new Error(`only ${kept.length} SA3 polygons matched — join is broken`);
  const filtered = join(TMP, 'sa3-matched.geojson');
  writeFileSync(filtered, JSON.stringify({ type: 'FeatureCollection', features: kept }));

  console.log('simplifying SA3 boundaries with mapshaper...');
  execFileSync(
    'npx',
    [
      'mapshaper',
      filtered,
      '-simplify',
      '1.2%',
      'keep-shapes',
      '-filter-fields',
      'sa3_code_2021,sa3_name_2021',
      '-o',
      'precision=0.0005',
      'format=geojson',
      dst,
    ],
    { stdio: 'inherit', cwd: import.meta.dirname },
  );

  if (!existsSync(dst)) throw new Error('mapshaper produced no output');
  const size = statSync(dst).size;
  if (size < 50_000) {
    throw new Error(`sa3.geojson is only ${size} bytes — that is not real boundary data`);
  }
  const gj = JSON.parse(readFileSync(dst, 'utf8'));
  if ((gj.features?.length ?? 0) < 300) {
    throw new Error(`only ${gj.features?.length} polygons survived simplification`);
  }
}

main();
