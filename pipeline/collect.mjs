// Fetch the raw sources into pipeline/tmp/. No shaping here — that lives in
// parse.mjs so it can be unit-tested without the network.
//
// Sources (all free, no auth):
//   1. AIHW MORT books Table 1 (data.gov.au) — summary mortality measures by
//      8 geography levels x 5 years x 3 sexes
//   2. AIHW MORT books Table 2 (data.gov.au) — top-20 leading causes of death
//      per geography x sex, pooled 2020-2024
//   3. ABS ASGS 2021 SA3 boundaries (geo.abs.gov.au ArcGIS, paged)
//
// The MORT CSVs are CP1252, not UTF-8 — see decodeCp1252 in parse.mjs. They are
// decoded here and written back as real UTF-8 so aggregate.mjs reads plain text.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCp1252 } from './parse.mjs';

const TMP = join(import.meta.dirname, 'tmp');
mkdirSync(TMP, { recursive: true });

const BASE = 'https://data.gov.au/data/dataset/a84a6e8e-dd8f-4bae-a79d-77a5e32877ad/resource';
const TABLE1 = `${BASE}/a5de4e7e-d062-4356-9d1b-39f44b1961dc/download/aihw-phe-229-mort-table1-data-gov-au-2026.csv`;
const TABLE2 = `${BASE}/3b7d81af-943f-447d-9d64-9ce220be35e7/download/aihw-phe-229-mort-table2-data-gov-au-2026.csv`;
const SA3_GEO = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA3/MapServer/1/query';

// data.gov.au and geo.abs.gov.au both refuse bare fetch() clients.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'text/csv,application/json,*/*',
  'accept-language': 'en-AU,en;q=0.9',
};

const ATTEMPT_TIMEOUT_MS = 120_000;

async function fetchBuffer(url) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      const wait = 4000 * 2 ** i;
      console.log(`  retry ${i + 1}/4 in ${wait}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function fetchSA3Geo() {
  const feats = [];
  const pageSize = 200;
  for (let offset = 0; offset < 2000; offset += pageSize) {
    const url =
      SA3_GEO +
      '?where=1%3D1&outFields=sa3_code_2021,sa3_name_2021&outSR=4326' +
      '&resultRecordCount=' +
      pageSize +
      '&resultOffset=' +
      offset +
      '&f=geojson';
    const gj = JSON.parse((await fetchBuffer(url)).toString('utf8'));
    const got = gj.features ?? [];
    feats.push(...got);
    console.log(`  SA3 boundaries offset ${offset} -> ${got.length} (total ${feats.length})`);
    if (got.length < pageSize) break;
  }
  if (feats.length < 300) throw new Error(`only ${feats.length} SA3 polygons — refusing to ship`);
  return { type: 'FeatureCollection', features: feats };
}

async function main() {
  console.log('1/3 MORT table 1 (summary measures)...');
  const t1 = decodeCp1252(await fetchBuffer(TABLE1));
  writeFileSync(join(TMP, 'mort-table1.csv'), t1, 'utf8');
  console.log(`  ${t1.split('\n').length} lines`);

  console.log('2/3 MORT table 2 (leading causes)...');
  const t2 = decodeCp1252(await fetchBuffer(TABLE2));
  writeFileSync(join(TMP, 'mort-table2.csv'), t2, 'utf8');
  console.log(`  ${t2.split('\n').length} lines`);

  console.log('3/3 ABS ASGS 2021 SA3 boundaries...');
  const geo = await fetchSA3Geo();
  writeFileSync(join(TMP, 'sa3-raw.geojson'), JSON.stringify(geo));
  console.log(`  ${geo.features.length} polygons`);

  console.log('collect done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
