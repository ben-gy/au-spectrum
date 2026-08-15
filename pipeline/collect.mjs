// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Step 1 of 2. Fetch the ACMA's Register of Radiocommunications Licences bulk
 * extract and unpack it to pipeline/tmp/, plus the two external geographies the
 * map needs (ABS SA4 boundaries and SA4 population).
 *
 * The register itself is NOT open data — see ADDITIONAL-TERMS.md. Nothing this
 * script downloads is committed; aggregate.mjs writes the derived, redacted
 * JSON that the site actually ships.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { listZipEntries, readZipEntry } from './zip.mjs';

const TMP = new URL('./tmp/', import.meta.url).pathname;

const RRL_URL = 'https://cdn.acma.gov.au/rrl/spectra_rrl.zip';

// ABS ASGS 2021 Statistical Area 4 — generalised boundaries (layer 1), served
// as GeoJSON already reprojected to WGS84. `f=json` would come back in Web
// Mercator metres and every point-in-polygon test would silently match nothing,
// so outSR is passed explicitly even though f=geojson already implies it.
const SA4_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA4/MapServer/1/query'
  + '?where=1%3D1&outFields=sa4_code_2021,sa4_name_2021,state_name_2021,area_albers_sqkm'
  + '&outSR=4326&f=geojson&resultOffset=0&resultRecordCount=2000';

// ERP by SA4, latest year. MEASURE must be the literal `ERP` — the numeric code
// returns NoRecordsFound with HTTP 200, i.e. a silent empty dataset.
const ERP_URL = 'https://data.api.abs.gov.au/rest/data/ABS,ERP_ASGS2021,1.0.0/ERP.3.TOT.SA4..A'
  + '?startPeriod=2024&format=csv';

const WANTED = new Set([
  'licence.csv', 'site.csv', 'client.csv', 'bsl.csv', 'bsl_area.csv',
  'auth_spectrum_freq.csv', 'auth_spectrum_area.csv',
  'licence_service.csv', 'licence_subservice.csv', 'client_type.csv',
  'industry_cat.csv', 'licence_status.csv', 'class_of_station.csv',
  'nature_of_service.csv', 'licensing_area.csv', 'device_details.csv',
  'LICENCE.TXT',
]);

async function download(url, label) {
  process.stdout.write(`  ${label} … `);
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      // acma.gov.au's CDN and the ABS ArcGIS endpoint both answer a plain
      // request, but a browser-shaped UA costs nothing and has saved several
      // sibling pipelines from a WAF tarpit.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Accept': '*/*',
    },
  });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`${(buf.length / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return buf;
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const skipIfCached = process.argv.includes('--cached');

  const zipPath = TMP + 'spectra_rrl.zip';
  let zip;
  if (skipIfCached && existsSync(zipPath)) {
    zip = readFileSync(zipPath);
    console.log(`RRL: reusing cached ${(statSync(zipPath).size / 1e6).toFixed(1)} MB archive`);
  } else {
    console.log('Downloading the ACMA RRL bulk extract:');
    zip = await download(RRL_URL, 'spectra_rrl.zip');
    writeFileSync(zipPath, zip);
  }

  const entries = listZipEntries(zip);
  console.log(`Archive holds ${entries.length} members; extracting ${WANTED.size}:`);
  let found = 0;
  for (const e of entries) {
    const base = e.name.split('/').pop();
    if (!WANTED.has(base)) continue;
    found++;
    writeFileSync(TMP + base, readZipEntry(zip, e));
    console.log(`  ${base.padEnd(26)} ${(e.size / 1e6).toFixed(1)} MB`);
  }
  if (found !== WANTED.size) {
    throw new Error(`expected ${WANTED.size} members from the archive, extracted ${found} — the ACMA has renamed or dropped a file`);
  }

  console.log('Downloading the ABS geography:');
  const sa4 = await download(SA4_URL, 'SA4 boundaries');
  const sa4Json = JSON.parse(sa4.toString('utf8'));
  if (!sa4Json.features || sa4Json.features.length < 100) {
    throw new Error(`SA4 boundaries: expected >100 features, got ${sa4Json.features?.length}`);
  }
  writeFileSync(TMP + 'sa4_raw.geojson', sa4);

  const erp = await download(ERP_URL, 'SA4 population');
  if (/NoRecordsFound/.test(erp.toString('utf8').slice(0, 400))) {
    throw new Error('SA4 population: the ABS returned NoRecordsFound — the dataflow key has changed');
  }
  writeFileSync(TMP + 'erp_sa4.csv', erp);

  console.log('\nCollected. Run `node pipeline/aggregate.mjs` next.');
}

main().catch((err) => { console.error(`\ncollect failed: ${err.message}`); process.exit(1); });
