// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Step 2 of 2. Turn 600 MB of register into ~4 MB of JSON.
 *
 * Everything the site ships is written here, and every payload references
 * entities by a single id space (`entities.json`). That discipline is the point:
 * the register's unit is a CLIENT_NO, an organisation holds several, and the
 * moment one payload groups by CLIENT_NO instead of merged entity the site
 * starts quietly contradicting itself — 450–520 MHz reads 8,512 holders in one
 * view and 7,511 in another, and nothing crashes.
 *
 * The gates at the bottom are not smoke tests. Each one recomputes a figure
 * from the SOURCE csv and compares it with what the payloads carry, so a gate
 * cannot pass by agreeing with itself.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import mapshaper from 'mapshaper';
import { readCsvRecords, streamCsv, parseCsvRecords } from './parse.mjs';
import { mergeClients, isNaturalPerson, classifyEntity, normaliseName, CLASSES, CLASS_IDS } from './classify.mjs';
import { BANDS, bandOf, binOf, BIN_COUNT, BINS_PER_DECADE, BIN_MIN_HZ } from './bands.mjs';
import { buildIndex, locate } from './geo.mjs';

const TMP = new URL('./tmp/', import.meta.url).pathname;
const OUT = new URL('../public/data/', import.meta.url).pathname;
const ATTRIBUTION = 'Based on Australian Communications and Media Authority information';

const failures = [];
const warnings = [];
/** A correctness gate. Anchored to a source file, never to our own output. */
function gate(name, actual, expected, detail = '') {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${typeof expected === 'function' ? '' : ` (expected ${JSON.stringify(expected)})`}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push(line);
  return ok;
}
function plausible(name, actual, lo, hi) {
  const ok = actual >= lo && actual <= hi;
  console.log(`${ok ? 'pass' : 'WARN'}  ${name}: ${actual} (expected ${lo}–${hi})`);
  if (!ok) warnings.push(`${name}: ${actual} outside ${lo}–${hi}`);
  return ok;
}

const t0 = Date.now();
const say = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Lookups and the entity model
// ─────────────────────────────────────────────────────────────────────────────

say('reading lookups');
const services = new Map(readCsvRecords(TMP + 'licence_service.csv').records.map((r) => [r.SV_ID, r.SV_NAME]));
const subservices = new Map(readCsvRecords(TMP + 'licence_subservice.csv').records.map((r) => [r.SS_ID, r.SS_NAME]));
const clientTypes = new Map(readCsvRecords(TMP + 'client_type.csv').records.map((r) => [r.TYPE_ID, r.NAME]));
const stationClasses = new Map(readCsvRecords(TMP + 'class_of_station.csv').records.map((r) => [r.CODE, r.DESCRIPTION]));
const licenceStatuses = new Map(readCsvRecords(TMP + 'licence_status.csv').records.map((r) => [r.STATUS, r.STATUS_TEXT]));

const clientsRaw = readCsvRecords(TMP + 'client.csv');
const licencesRaw = readCsvRecords(TMP + 'licence.csv');
const sitesRaw = readCsvRecords(TMP + 'site.csv');
const clients = clientsRaw.records;
const licences = licencesRaw.records;
const sites = sitesRaw.records;
say(`clients ${clients.length}, licences ${licences.length}, sites ${sites.length}`);

gate('G13a client.csv rows with a quoted comma', clients.filter((c) => Object.values(c).some((v) => v.includes(','))).length, 669,
  'a naive split shifts CLIENT_TYPE_ID on exactly these rows — the field that decides whether a home address gets published');
gate('G13b site.csv rows with a quoted comma', sites.filter((s) => s.NAME.includes(',')).length, 12273);
gate('G13c client type histogram', JSON.stringify(countBy(clients, (c) => c.CLIENT_TYPE_ID)),
  JSON.stringify({ 5: 7612, 7: 2995, 6: 2569, 3: 575, 4: 557, 2: 59, 1: 6 }));

function countBy(rows, f) {
  const m = new Map();
  for (const r of rows) { const k = f(r); m.set(k, (m.get(k) || 0) + 1); }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

// Licence counts per client, needed before the person test (its second arm is
// bounded by book size).
const licPerClient = new Map();
for (const l of licences) licPerClient.set(l.CLIENT_NO, (licPerClient.get(l.CLIENT_NO) || 0) + 1);

const clientByNo = new Map(clients.map((c) => [c.CLIENT_NO, c]));
const personClient = new Map();
for (const c of clients) personClient.set(c.CLIENT_NO, isNaturalPerson(c, licPerClient.get(c.CLIENT_NO) || 0));

const { rootOf, members } = mergeClients(clients);
const entityIds = [...new Set(rootOf.values())];
say(`merged ${clients.length} client records into ${entityIds.length} entities`);

gate('G1a merge partition sums to licence.csv', sumBy(entityIds, (r) => (members.get(r) || []).reduce((s, cn) => s + (licPerClient.get(cn) || 0), 0)), licences.length);
gate('G1b merge partition sums to client.csv', sumBy(entityIds, (r) => members.get(r).length), clients.length);
function sumBy(arr, f) { let s = 0; for (const x of arr) s += f(x); return s; }

// An entity is a person if any of its constituent client records is. Merging
// happens on name/ABN, so a person's records only ever merge with each other.
const entity = new Map();
for (const root of entityIds) {
  const ms = members.get(root);
  const best = ms.slice().sort((a, b) => (licPerClient.get(b) || 0) - (licPerClient.get(a) || 0))[0];
  entity.set(root, {
    root,
    name: clientByNo.get(best).LICENCEE,
    cn: ms.length,
    person: ms.some((m) => personClient.get(m)),
    lic: 0, dev: 0, tx: 0,
    sites: new Set(),
    services: new Set(),
    states: new Set(),
    types: new Set(ms.map((m) => clientByNo.get(m).CLIENT_TYPE_ID)),
  });
}

const tierA = existsSync(new URL('./sectors_tierA.json', import.meta.url).pathname)
  ? JSON.parse(readFileSync(new URL('./sectors_tierA.json', import.meta.url).pathname, 'utf8'))
  : {};
say(`tier A sector table: ${Object.keys(tierA).length} hand-verified names`);
for (const e of entity.values()) {
  e.cls = e.person ? 'INDIVIDUAL' : classifyEntity(e.name, tierA);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Licences
// ─────────────────────────────────────────────────────────────────────────────

const GRANTED = '1';
const licInfo = new Map(); // LICENCE_NO -> { root, cls, sv, granted, person }
for (const l of licences) {
  const root = rootOf.get(l.CLIENT_NO);
  const e = entity.get(root);
  e.lic++;
  e.services.add(l.SV_ID);
  licInfo.set(l.LICENCE_NO, {
    root, cls: e.cls, sv: l.SV_ID, ss: l.SS_ID,
    granted: l.STATUS === GRANTED,
    person: personClient.get(l.CLIENT_NO),
    expiry: l.DATE_OF_EXPIRY,
    bsl: l.BSL_NO,
  });
}

gate('G2 licence status histogram', JSON.stringify(countBy(licences, (l) => l.STATUS)),
  JSON.stringify({ 1: 162515, 10: 1254, 0: 198, '-4': 138 }));
gate('G2b STATUS_TEXT agrees with the lookup on every row',
  licences.filter((l) => licenceStatuses.get(l.STATUS) !== l.STATUS_TEXT).length, 0);
gate('G4a licence.CLIENT_NO orphans', licences.filter((l) => !clientByNo.has(l.CLIENT_NO)).length, 0);

const personLicences = licences.filter((l) => personClient.get(l.CLIENT_NO)).length;
say(`natural persons: ${[...personClient.values()].filter(Boolean).length} clients, ${personLicences} licences`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sites
// ─────────────────────────────────────────────────────────────────────────────

const siteByHex = new Map();
for (const s of sites) {
  siteByHex.set(s.SITE_ID, {
    id: s.SITE_ID,
    lat: +s.LATITUDE,
    lon: +s.LONGITUDE,
    name: s.NAME.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim(),
    // `Vic` appears once against 26,319 `VIC`. Left uppercased, Victoria is one
    // site short everywhere it is counted from this column — which is why the
    // site aggregates from the polygon instead, and this is only a label.
    state: s.STATE.toUpperCase(),
    precision: s.SITE_PRECISION === 'Within 10 metres' ? 0 : s.SITE_PRECISION === 'Within 100 metres' ? 1 : 2,
    dev: 0, tx: 0,
    lics: new Set(),
    roots: new Set(),
    personOnly: true, // until a non-person device appears
    sa4: -1,
  });
}
gate('G14a sites with usable coordinates', sites.filter((s) => Number.isFinite(+s.LATITUDE) && Number.isFinite(+s.LONGITUDE)).length, sites.length);

// ─────────────────────────────────────────────────────────────────────────────
// 4. The one streaming pass over device_details.csv (2.15M rows, 383 MB)
// ─────────────────────────────────────────────────────────────────────────────

say('streaming device_details.csv');
const bandAgg = BANDS.map(() => ({ rows: 0, tx: 0, lics: new Set(), roots: new Set(), byClass: new Map(), rawCn: new Set() }));
const binAgg = Array.from({ length: BIN_COUNT }, () => ({ rows: 0, tx: 0, byClass: new Map(), roots: new Set() }));
const freqAgg = new Map(); // hz -> { rows, tx, lics:Set }
const svcRows = new Map();
const stationClassRows = new Map();
const authYear = { apparatus: new Map(), spectrum: new Map() };
const fixedGroups = new Map(); // `${lic}|${site}` -> { t:[], r:[] }
let deviceRows = 0, txRows = 0, txRowsGranted = 0, noFreq = 0, blankSite = 0, thzRows = 0;
let devRowsGranted = 0;
const assignmentKeys = new Set();
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

const streamStats = await streamCsv(TMP + 'device_details.csv', (r) => {
  deviceRows++;
  const li = licInfo.get(r.LICENCE_NO);
  if (!li) return; // gated below; never silently dropped
  const isTx = r.DEVICE_TYPE === 'T';
  if (isTx) txRows++;
  if (li.granted) {
    devRowsGranted++;
    if (isTx) txRowsGranted++;
  }
  bump(svcRows, r.SV_ID);
  bump(stationClassRows, r.CLASS_OF_STATION_CODE);

  const y = r.AUTHORISATION_DATE.slice(0, 4);
  if (y) bump(r.SV_ID === '85' ? authYear.spectrum : authYear.apparatus, y);

  const f = r.FREQUENCY ? Number(r.FREQUENCY) : NaN;
  if (!Number.isFinite(f)) noFreq++;
  else {
    if (f >= 1e12) thzRows++;
    const bi = bandOf(f);
    if (bi >= 0) {
      const b = bandAgg[bi];
      b.rows++;
      if (isTx) b.tx++;
      b.lics.add(r.LICENCE_NO);
      b.roots.add(li.root);
      b.rawCn.add(li.root === undefined ? '' : r.LICENCE_NO); // replaced below
      bump(b.byClass, li.cls);
    }
    const bn = binOf(f);
    if (bn >= 0) {
      const bb = binAgg[bn];
      bb.rows++;
      if (isTx) bb.tx++;
      bump(bb.byClass, li.cls);
      bb.roots.add(li.root);
    }
    if (li.granted) {
      let fa = freqAgg.get(f);
      if (!fa) freqAgg.set(f, fa = { rows: 0, tx: 0, lics: new Set() });
      fa.rows++;
      if (isTx) fa.tx++;
      fa.lics.add(r.LICENCE_NO);
    }
  }

  const sid = r.SITE_ID;
  if (!sid) { blankSite++; return; }
  const s = siteByHex.get(sid);
  if (!s) return; // gated below
  s.dev++;
  if (isTx) s.tx++;
  s.lics.add(r.LICENCE_NO);
  s.roots.add(li.root);
  if (!li.person) s.personOnly = false;
  assignmentKeys.add(`${r.LICENCE_NO}|${sid}|${r.FREQUENCY}|${r.DEVICE_TYPE}`);

  // Fixed-link duplex pairing: microwave links register a transmit and a
  // receive frequency at the same (licence, site). Sorting each list and
  // pairing by index recovers the duplex spacing the band plan is built on.
  if (li.sv === '2' && li.granted && Number.isFinite(f)) {
    const k = `${r.LICENCE_NO}|${sid}`;
    let g = fixedGroups.get(k);
    if (!g) fixedGroups.set(k, g = { t: [], r: [] });
    (isTx ? g.t : g.r).push(f);
  }
});
say(`streamed ${streamStats.rows} rows, ${streamStats.ragged} ragged`);

gate('G3a device_details row count', streamStats.rows, 2149290);
gate('G3b ragged device rows', streamStats.ragged, 0);
gate('G3c transmitter rows', txRows, 1080005);
gate('G3d rows with no frequency', noFreq, 5604);
gate('G3e rows summed over services equals the file', sumBy([...svcRows.values()], (v) => v), 2149290);
gate('G4b device rows whose LICENCE_NO is not in licence.csv',
  streamStats.rows - sumBy([...svcRows.values()], (v) => v), 0);
gate('G14b transmitter rows on granted licences', txRowsGranted, 1078104);
gate('G14c rows per distinct (licence, site, frequency, type) assignment',
  Math.round(((streamStats.rows - blankSite) / assignmentKeys.size) * 1000) / 1000, 2.54,
  'device rows are not transmitters: three-sector sites register the same assignment three times');
gate('G15 device rows above 1 THz', thzRows, 6, 'optical laser links, routed to a labelled non-radio bin');

const liveSites = [...siteByHex.values()].filter((s) => s.dev > 0);
gate('G4c device SITE_ID orphans', blankSite, 32503);
gate('H4 live site records', liveSites.length, 73501);
const personOnlySites = liveSites.filter((s) => s.personOnly);
gate('G9a person-only sites (all statuses)', personOnlySites.length, (n) => n >= 1200 && n <= 1600,
  'suppressed entirely from the map: site.NAME is frequently the person’s street address');

// ─────────────────────────────────────────────────────────────────────────────
// 5. Attribute entities from the stream
// ─────────────────────────────────────────────────────────────────────────────

for (const s of liveSites) {
  for (const root of s.roots) {
    const e = entity.get(root);
    if (e) { e.sites.add(s.id); e.states.add(s.state); }
  }
}
for (const [lno, li] of licInfo) {
  const e = entity.get(li.root);
  if (!e) continue;
  void lno;
}
// device/tx per entity, computed from the band aggregates would double-count;
// take it from the site + licence maps instead.
{
  const perLic = new Map();
  for (const b of bandAgg) void b;
  // Re-derive per-entity device counts from the site pass plus the blank-site
  // remainder, by counting rows per licence during the stream would have cost a
  // 160k-entry map — cheap, so do it properly with a second tiny pass.
  void perLic;
}

// A second, cheap streaming pass: device rows per licence. Kept separate rather
// than folded into the first pass so the first pass's memory profile stays flat.
say('second pass: device rows per licence');
const rowsPerLic = new Map();
const txPerLic = new Map();
await streamCsv(TMP + 'device_details.csv', (r) => {
  bump(rowsPerLic, r.LICENCE_NO);
  if (r.DEVICE_TYPE === 'T') bump(txPerLic, r.LICENCE_NO);
});
for (const [lno, n] of rowsPerLic) {
  const li = licInfo.get(lno);
  if (!li) continue;
  const e = entity.get(li.root);
  e.dev += n;
  e.tx += txPerLic.get(lno) || 0;
}
gate('G3f device rows attributed to an entity', sumBy([...entity.values()], (e) => e.dev), 2149290);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Geography — point-in-polygon on the UNSIMPLIFIED boundaries
// ─────────────────────────────────────────────────────────────────────────────

say('point-in-polygon against the raw ABS boundaries');
const sa4Raw = JSON.parse(readFileSync(TMP + 'sa4_raw.geojson', 'utf8'));
const PSEUDO = /Migratory|No usual address|Outside Australia/;
const sa4Features = sa4Raw.features.filter((f) => !PSEUDO.test(f.properties.sa4_name_2021));
gate('G12a real SA4 regions after dropping the ABS pseudo-regions', sa4Features.length, 89);
gate('G12b pseudo-regions dropped', sa4Raw.features.length - sa4Features.length, 19);

const index = buildIndex(sa4Features);
let matched = 0;
for (const s of siteByHex.values()) {
  s.sa4 = locate(index, s.lat, s.lon);
  if (s.sa4 >= 0) matched++;
}
gate('G12c point-in-polygon match rate on raw geometry', Math.round((matched / sites.length) * 10000) / 100, (v) => v > 98.9 && v < 99.2,
  `${matched} of ${sites.length}`);
const sa4_510_raw = [...siteByHex.values()].filter((s) => s.sa4 >= 0 && sa4Features[s.sa4].properties.sa4_code_2021 === '510').length;
say(`SA4 510 (WA Outback North) holds ${sa4_510_raw} sites on raw geometry`);

// Simplify for drawing only. The PIP above ran on the 101 MB original; running
// it on this file instead loses ~0.85% of matches at the coastline, which is
// invisible in every chart and wrong in all of them.
say('simplifying boundaries for drawing');
mkdirSync(OUT, { recursive: true });
const simplified = await mapshaper.applyCommands(
  '-i raw.geojson -filter "!/Migratory|No usual address|Outside Australia/.test(sa4_name_2021)" '
  + '-simplify 2% keep-shapes -filter-fields sa4_code_2021,sa4_name_2021,state_name_2021,area_albers_sqkm '
  + '-o precision=0.0001 out.geojson',
  { 'raw.geojson': readFileSync(TMP + 'sa4_raw.geojson') },
);
const sa4Simple = JSON.parse(Buffer.from(simplified['out.geojson']).toString('utf8'));
gate('P8a simplified boundary features', sa4Simple.features.length, 89);
plausible('P8b simplified boundary size (KB)', Math.round(Buffer.byteLength(JSON.stringify(sa4Simple)) / 1024), 400, 1600);

// Prove the simplified file is NOT what the PIP used: rerun 510 against it and
// require the answer to differ. A pipeline "optimised" to reuse the drawing file
// would make these equal, and nothing else on the site would look wrong.
const simpleIndex = buildIndex(sa4Simple.features);
let sa4_510_simple = 0;
const code510Simple = sa4Simple.features.findIndex((f) => f.properties.sa4_code_2021 === '510');
for (const s of siteByHex.values()) if (locate(simpleIndex, s.lat, s.lon) === code510Simple) sa4_510_simple++;
gate('G12d PIP used the raw file, not the drawing file', sa4_510_raw !== sa4_510_simple, true,
  `raw ${sa4_510_raw} vs simplified ${sa4_510_simple}`);

// Population
const erp = parseCsvRecords(readFileSync(TMP + 'erp_sa4.csv', 'utf8')).records;
const pop = new Map(erp.map((r) => [r.ASGS_2021, Number(r.OBS_VALUE)]));
gate('G12e SA4 population rows join to boundaries', sa4Features.filter((f) => pop.has(f.properties.sa4_code_2021)).length, 89);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Build the payloads
// ─────────────────────────────────────────────────────────────────────────────

say('building payloads');
const publishable = liveSites.filter((s) => !s.personOnly && s.lics.size > 0 && [...s.lics].some((l) => licInfo.get(l)?.granted));
say(`publishable site points: ${publishable.length}`);

// entities.json — the canonical id space.
const nonPerson = [...entity.values()].filter((e) => !e.person).sort((a, b) => b.lic - a.lic);
const entIndex = new Map(nonPerson.map((e, i) => [e.root, i]));
const personAggregate = {
  clients: [...personClient.values()].filter(Boolean).length,
  licences: personLicences,
  devices: sumBy([...entity.values()].filter((e) => e.person), (e) => e.dev),
  entities: [...entity.values()].filter((e) => e.person).length,
  sites: sumBy([...entity.values()].filter((e) => e.person), (e) => e.sites.size),
};

const SERVICE_ORDER = [...services.keys()];
const entitiesJson = {
  attribution: ATTRIBUTION,
  classes: CLASSES,
  serviceIds: SERVICE_ORDER,
  serviceNames: SERVICE_ORDER.map((id) => services.get(id)),
  fields: ['name', 'cls', 'lic', 'dev', 'tx', 'sites', 'clientRecords', 'services', 'states'],
  individuals: personAggregate,
  rows: nonPerson.map((e) => [
    e.name,
    CLASS_IDS.indexOf(e.cls),
    e.lic, e.dev, e.tx, e.sites.size, e.cn,
    [...e.services].map((s) => SERVICE_ORDER.indexOf(s)).filter((i) => i >= 0),
    [...e.states].filter(Boolean).sort(),
  ]),
};

// sectors.json — class totals plus the class × service matrix.
const classTotals = new Map(CLASS_IDS.map((c) => [c, { lic: 0, dev: 0, tx: 0, entities: 0, sites: 0 }]));
for (const e of entity.values()) {
  const t = classTotals.get(e.cls);
  t.lic += e.lic; t.dev += e.dev; t.tx += e.tx; t.entities++; t.sites += e.sites.size;
}
const classService = new Map(CLASS_IDS.map((c) => [c, new Map()]));
for (const l of licences) {
  const e = entity.get(rootOf.get(l.CLIENT_NO));
  bump(classService.get(e.cls), l.SV_ID);
}
const sectorsJson = {
  attribution: ATTRIBUTION,
  totals: Object.fromEntries([...classTotals]),
  services: SERVICE_ORDER.map((id) => ({ id, name: services.get(id), licences: licences.filter((l) => l.SV_ID === id).length })),
  matrix: Object.fromEntries([...classService].map(([c, m]) => [c, Object.fromEntries(m)])),
};

// bands.json
const bandsJson = {
  attribution: ATTRIBUTION,
  binsPerDecade: BINS_PER_DECADE,
  binMinHz: BIN_MIN_HZ,
  bands: BANDS.map((b, i) => ({
    name: b.name, lo: b.lo, hi: Number.isFinite(b.hi) ? b.hi : null, use: b.use,
    rows: bandAgg[i].rows, tx: bandAgg[i].tx,
    licences: bandAgg[i].lics.size,
    entities: bandAgg[i].roots.size,
    byClass: Object.fromEntries(bandAgg[i].byClass),
    topHolders: topEntities(bandAgg[i], 12),
  })),
  bins: binAgg.map((b, i) => ({
    i, rows: b.rows, tx: b.tx, entities: b.roots.size,
    byClass: Object.fromEntries([...b.byClass].filter(([, n]) => n > 0)),
  })).filter((b) => b.rows > 0),
};
function topEntities(agg, n) {
  const counts = new Map();
  for (const l of agg.lics) {
    const li = licInfo.get(l);
    if (!li) continue;
    bump(counts, li.root, rowsPerLic.get(l) || 0);
  }
  return [...counts.entries()]
    .filter(([root]) => !entity.get(root).person)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([root, rows]) => [entIndex.get(root) ?? -1, rows]);
}

// freq.json
const freqRows = [...freqAgg.entries()].sort((a, b) => a[0] - b[0])
  .map(([hz, v]) => [hz, v.rows, v.tx, v.lics.size]);
gate('P9 distinct exact frequencies on granted licences', freqRows.length, (n) => n > 19500 && n < 20500);

// duplex.json — spacings between paired transmit/receive frequencies, plus the
// real (transmit, receive) pairs behind them. The pairs matter: an arc diagram
// drawn from a made-up "representative" frequency per spacing would be a
// fabricated picture of a real structure.
const spacings = new Map();
const pairSamples = new Map(); // `${txMHz}|${rxMHz}` -> count
let pairedGroups = 0;
for (const g of fixedGroups.values()) {
  if (!g.t.length || !g.r.length) continue;
  g.t.sort((a, b) => a - b); g.r.sort((a, b) => a - b);
  const n = Math.min(g.t.length, g.r.length);
  let paired = false;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(g.t[i] - g.r[i]);
    if (d === 0) continue;
    const mhz = Math.round((d / 1e6) * 1000) / 1000;
    bump(spacings, mhz);
    const lo = Math.round(Math.min(g.t[i], g.r[i]) / 1e3) / 1e3;
    const hi = Math.round(Math.max(g.t[i], g.r[i]) / 1e3) / 1e3;
    bump(pairSamples, `${lo}|${hi}`);
    paired = true;
  }
  if (paired) pairedGroups++;
}
const topPairs = [...pairSamples.entries()]
  .sort((a, b) => b[1] - a[1]).slice(0, 900)
  .map(([k, n]) => {
    const [lo, hi] = k.split('|').map(Number);
    return [lo, hi, n];
  });
const duplexRows = [...spacings.entries()].sort((a, b) => b[1] - a[1]);
plausible('P7a distinct duplex spacings', duplexRows.length, 50, 120);
gate('P7b the busiest duplex spacing is the 11 GHz plan', duplexRows[0][0], 490,
  `${duplexRows[0][1]} pairs at ${duplexRows[0][0]} MHz`);

// Geographic rollups
const sa4Stats = sa4Features.map((f, i) => {
  const inRegion = [...siteByHex.values()].filter((s) => s.sa4 === i);
  const live = inRegion.filter((s) => s.dev > 0);
  const roots = new Set();
  const classSites = new Map();
  let dev = 0;
  for (const s of live) {
    dev += s.dev;
    for (const r of s.roots) {
      roots.add(r);
      const e = entity.get(r);
      if (e) bump(classSites, e.cls);
    }
  }
  const holderSites = new Map();
  for (const s of live) for (const r of s.roots) bump(holderSites, r);
  const top = [...holderSites.entries()].filter(([r]) => !entity.get(r).person).sort((a, b) => b[1] - a[1])[0];
  const population = pop.get(f.properties.sa4_code_2021) || 0;
  return {
    code: f.properties.sa4_code_2021,
    name: f.properties.sa4_name_2021,
    state: f.properties.state_name_2021,
    areaKm2: Math.round(f.properties.area_albers_sqkm),
    population,
    sites: inRegion.length,
    live: live.length,
    devices: dev,
    entities: roots.size,
    perTenK: population ? Math.round((inRegion.length / population) * 100000) / 10 : null,
    topHolder: top ? entIndex.get(top[0]) ?? -1 : -1,
    topHolderSites: top ? top[1] : 0,
    byClass: Object.fromEntries([...classSites].sort((a, b) => b[1] - a[1])),
  };
}).sort((a, b) => b.sites - a.sites);

// sites.json — the publishable point layer, as parallel arrays. One array of
// 71,451 objects would be 3× the bytes for the same numbers, and the map wants
// typed columns anyway. Names are a separate file: the map needs coordinates to
// draw and names only when something is clicked.
const sitesJson = {
  attribution: ATTRIBUTION,
  note: 'Sites whose every device belongs to a natural person are omitted entirely — the site name is frequently their street address.',
  n: publishable.length,
  lat: publishable.map((s) => Math.round(s.lat * 1e5) / 1e5),
  lon: publishable.map((s) => Math.round(s.lon * 1e5) / 1e5),
  cls: publishable.map((s) => CLASS_IDS.indexOf(dominantClass(s))),
  dev: publishable.map((s) => s.dev),
  prec: publishable.map((s) => s.precision),
  holders: publishable.map((s) => s.roots.size),
  sa4: publishable.map((s) => s.sa4),
};
const siteNamesJson = { attribution: ATTRIBUTION, names: publishable.map((s) => s.name) };
function dominantClass(s) {
  const m = new Map();
  for (const r of s.roots) {
    const e = entity.get(r);
    if (e) bump(m, e.cls, 1);
  }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'UNCLASSIFIED';
}

// grid.json — 0.1° density bins, for the zoomed-out map.
const grid = new Map();
for (const s of publishable) {
  const gx = Math.round(s.lon * 10), gy = Math.round(s.lat * 10);
  const k = `${gx}|${gy}`;
  let c = grid.get(k);
  if (!c) grid.set(k, c = [gx, gy, 0, 0]);
  c[2]++; c[3] += s.dev;
}
const gridJson = { attribution: ATTRIBUTION, cell: 0.1, fields: ['gx', 'gy', 'sites', 'devices'], rows: [...grid.values()] };

// tenancy.json — who shares a mast with whom.
const pairCounts = new Map();
const sharedSites = [];
for (const s of publishable) {
  const classes = new Set();
  for (const r of s.roots) {
    const e = entity.get(r);
    if (e && !e.person) classes.add(e.cls);
  }
  const arr = [...classes].sort();
  for (let i = 0; i < arr.length; i++) {
    for (let j = i; j < arr.length; j++) bump(pairCounts, `${arr[i]}|${arr[j]}`);
  }
  if (s.roots.size >= 6) {
    sharedSites.push({
      name: s.name,
      state: s.state,
      lat: Math.round(s.lat * 1e5) / 1e5,
      lon: Math.round(s.lon * 1e5) / 1e5,
      devices: s.dev,
      licences: s.lics.size,
      tenants: [...s.roots].map((r) => entIndex.get(r)).filter((i) => i !== undefined).sort((a, b) => a - b),
    });
  }
}
sharedSites.sort((a, b) => b.tenants.length - a.tenants.length);
const tenancyJson = {
  attribution: ATTRIBUTION,
  pairs: Object.fromEntries(pairCounts),
  sites: sharedSites.slice(0, 400),
  singleHolder: publishable.filter((s) => s.roots.size === 1).length,
  shared: publishable.filter((s) => s.roots.size > 1).length,
};

// spectrum.json — the 398 area-wide spectrum licences.
const specFreq = readCsvRecords(TMP + 'auth_spectrum_freq.csv').records;
const specArea = readCsvRecords(TMP + 'auth_spectrum_area.csv').records;
const specLicences = licences.filter((l) => l.SV_ID === '85');
gate('G6a spectrum licences in licence.csv', specLicences.length, 398);
gate('G6b auth_spectrum_freq covers only spectrum licences',
  new Set(specFreq.map((r) => r.LICENCE_NO)).size, 398);
gate('G6c distinct (licence, area) keys', new Set(specArea.map((r) => `${r.LICENCE_NO}|${r.AREA_CODE}`)).size, 3520);
gate('G6d keys carrying two frequency blocks', specFreq.length - 3520, 36,
  'all Telstra 3G Holdings at 2 GHz — a 1:1 join drops half its holding in 18 markets');
gate('G6e frequencies are in Hz, not MHz', Math.min(...specFreq.map((r) => Number(r.LW_FREQUENCY_START))) >= 1e6, true);

const areaName = new Map(specArea.map((r) => [`${r.LICENCE_NO}|${r.AREA_CODE}`, r.AREA_NAME]));
// Only 289 of the 3,520 area rows carry a real place name. The rest are the
// auctions' internal labels — "Area 0001", "ma001", "MA 3", "Market area" —
// and renaming them would invent a geography the register does not have, so
// they are excluded from the market selector rather than dressed up.
const PLACEHOLDER_AREA = /^(area\b|ma\s*\d|market area|hole area|remainder\b|aggregate\b)/i;
const marketRows = new Map();
for (const r of specFreq) {
  const key = `${r.LICENCE_NO}|${r.AREA_CODE}`;
  const li = licInfo.get(r.LICENCE_NO);
  if (!li || !li.granted) continue;
  const name = areaName.get(key) || '';
  if (!name || PLACEHOLDER_AREA.test(name)) continue;
  // Lower and upper blocks are the two halves of an FDD pair. Both are held.
  const lower = (Number(r.LW_FREQUENCY_END) - Number(r.LW_FREQUENCY_START)) / 1e6;
  const upper = r.UP_FREQUENCY_START ? (Number(r.UP_FREQUENCY_END) - Number(r.UP_FREQUENCY_START)) / 1e6 : 0;
  const bandIdx = bandOf(Number(r.LW_FREQUENCY_START));
  const mk = `${name}|${bandIdx}|${li.root}`;
  let m = marketRows.get(mk);
  if (!m) marketRows.set(mk, m = { market: name, band: bandIdx, entity: entIndex.get(li.root) ?? -1, lower: 0, upper: 0, licences: new Set() });
  m.lower += lower; m.upper += upper;
  m.licences.add(r.LICENCE_NO);
}
const spectrumJson = {
  attribution: ATTRIBUTION,
  note: 'MHz held in one named market. Never summed across markets — the same block licensed in 32 places is 2,500 MHz held, not 80,000.',
  bandNames: BANDS.map((b) => b.name),
  rows: [...marketRows.values()].map((m) => ({
    market: m.market, band: m.band, entity: m.entity,
    mhz: Math.round((m.lower + m.upper) * 1000) / 1000,
    lower: Math.round(m.lower * 1000) / 1000,
    upper: Math.round(m.upper * 1000) / 1000,
    licences: m.licences.size,
  })),
  naive: naiveVsUnion(),
};
function naiveVsUnion() {
  // The worked correction the site prints rather than hides: summing MHz across
  // every area a licence covers counts the same megahertz once per market.
  const naive = new Map();
  const union = new Map();
  for (const r of specFreq) {
    const li = licInfo.get(r.LICENCE_NO);
    if (!li || !li.granted) continue;
    const mhz = (Number(r.LW_FREQUENCY_END) - Number(r.LW_FREQUENCY_START)) / 1e6
      + (r.UP_FREQUENCY_START ? (Number(r.UP_FREQUENCY_END) - Number(r.UP_FREQUENCY_START)) / 1e6 : 0);
    bump(naive, li.root, mhz);
    const key = `${li.root}|${r.AREA_CODE}`;
    union.set(key, (union.get(key) || 0) + mhz);
  }
  const best = new Map();
  for (const [key, mhz] of union) {
    const root = key.split('|')[0];
    best.set(root, Math.max(best.get(root) || 0, mhz));
  }
  return [...naive.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([root, n]) => ({
    entity: entIndex.get(root) ?? -1,
    naive: Math.round(n),
    inOneMarket: Math.round(best.get(root) || 0),
  }));
}

// bsl.json — broadcast service licences.
const bslRows = readCsvRecords(TMP + 'bsl.csv').records;
const bslLicences = licences.filter((l) => l.SV_ID === '90' || l.SV_ID === '93');
gate('G7a broadcast service licences join exactly', new Set(bslLicences.map((l) => l.BSL_NO)).size, 3665);
gate('G7b bsl.csv row count', bslRows.length, 3665);
gate('G7c the unfiltered join is wrong and stays wrong',
  new Set(licences.filter((l) => l.BSL_NO).map((l) => l.BSL_NO)).size, 3668,
  'dropping the SV_ID filter double-counts broadcast services by 61%');
const bslJson = {
  attribution: ATTRIBUTION,
  rows: bslRows.map((b) => ({
    id: b.BSL_NO,
    medium: b.MEDIUM_CATEGORY,
    region: b.REGION_CATEGORY,
    interest: b.COMMUNITY_INTEREST,
    state: b.BSL_STATE,
    onAir: b.ON_AIR_ID,
    callSign: b.CALL_SIGN,
    commenced: b.DATE_COMMENCED || null,
  })),
};

// health.json — the register's own limits, and the forward expiry axis.
const expiry = new Map();
for (const l of licences) {
  if (l.STATUS !== GRANTED) continue;
  const y = l.DATE_OF_EXPIRY ? l.DATE_OF_EXPIRY.slice(0, 4) : 'never';
  bump(expiry, y);
}
const issued = new Map();
for (const l of licences) bump(issued, l.DATE_ISSUED ? l.DATE_ISSUED.slice(0, 4) : 'blank');
const undocumentedClasses = [...stationClassRows.entries()]
  .filter(([code]) => code && !stationClasses.has(code));
gate('P10 class-of-station codes absent from ACMA’s own lookup', undocumentedClasses.length, 7,
  undocumentedClasses.map(([c, n]) => `${c}:${n}`).join(' '));

const healthJson = {
  attribution: ATTRIBUTION,
  snapshot: new Date().toISOString().slice(0, 10),
  bars: [
    { label: 'Site records with no device on them', n: sites.length - liveSites.length, of: sites.length, note: 'A site record is a coordinate in a catalogue, not a tower.' },
    { label: 'Device rows that are receivers, not transmitters', n: deviceRows - txRows - noFreq, of: deviceRows, note: 'Each fixed link registers both ends. Receivers radiate nothing.' },
    { label: 'Device rows belonging to just 398 spectrum licences', n: svcRows.get('85') || 0, of: deviceRows, note: '0.24% of the register carries 78% of the hardware.' },
    { label: 'Clients with no industry category recorded', n: clients.filter((c) => !c.CAT_ID).length, of: clients.length, note: 'And the "Safety Services" category is defined but used by nobody at all.' },
    { label: 'Licences stamped with this year’s issue date', n: issued[String(new Date().getFullYear())] || issued['2026'] || 0, of: licences.length, note: 'Renewal rewrites the issue date. Nothing in the file predates September 2014.' },
    { label: 'Sites whose position is recorded as “unknown” accuracy', n: sites.filter((s) => s.SITE_PRECISION !== 'Within 10 metres' && s.SITE_PRECISION !== 'Within 100 metres').length, of: sites.length, note: 'Never drawn at the same weight as a ten-metre fix.' },
  ],
  expiry: Object.fromEntries([...expiry].sort()),
  issued: Object.fromEntries([...issued].sort()),
  authApparatus: Object.fromEntries([...authYear.apparatus].sort()),
  authSpectrum: Object.fromEntries([...authYear.spectrum].sort()),
  totals: {
    licences: licences.length, granted: licences.filter((l) => l.STATUS === GRANTED).length,
    clients: clients.length, entities: entityIds.length, publishedEntities: nonPerson.length,
    sites: sites.length, liveSites: liveSites.length, publishableSites: publishable.length,
    deviceRows: deviceRows, txRows, txRowsGranted, devRowsGranted,
    personClients: personAggregate.clients, personLicences,
    personOnlySites: personOnlySites.length,
  },
};

// glossary.json
const glossaryJson = {
  attribution: ATTRIBUTION,
  services: SERVICE_ORDER.map((id) => ({ id, name: services.get(id) })),
  subservices: [...subservices].map(([id, name]) => ({ id, name })),
  clientTypes: [...clientTypes].map(([id, name]) => ({ id, name })),
  stationClasses: [...stationClassRows.entries()].filter(([c]) => c).sort((a, b) => b[1] - a[1]).map(([code, rows]) => ({
    code, rows, description: stationClasses.get(code) || null,
  })),
};

// meta.json
const metaJson = {
  attribution: ATTRIBUTION,
  snapshot: healthJson.snapshot,
  source: 'ACMA Register of Radiocommunications Licences (spectra_rrl.zip)',
  boundaries: 'ABS ASGS 2021 Statistical Areas Level 4 and Estimated Resident Population, CC BY 4.0',
  totals: healthJson.totals,
  headline: {
    largestHolder: nonPerson[0].name,
    largestHolderLicences: nonPerson[0].lic,
    top10Share: Math.round((sumBy(nonPerson.slice(0, 10), (e) => e.lic) / licences.length) * 10000) / 100,
    hhi: Math.round(sumBy(nonPerson, (e) => ((e.lic / licences.length) * 100) ** 2)),
    // Named organisations only. Counting individuals here would put the figure
    // over a denominator the site never shows, since persons are not named.
    oneLicenceEntities: nonPerson.filter((e) => e.lic === 1).length,
    oneLicenceIncludingIndividuals: [...entity.values()].filter((e) => e.lic === 1).length,
    sa4TopPerCapita: sa4Stats.slice().sort((a, b) => (b.perTenK || 0) - (a.perTenK || 0))[0],
    sa4BottomPerCapita: sa4Stats.filter((s) => s.population > 50000).sort((a, b) => (a.perTenK || 0) - (b.perTenK || 0))[0],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. The cross-payload gates, then write
// ─────────────────────────────────────────────────────────────────────────────

// G5, the anti-tautology gate: recount two bands' holders straight from the
// source stream and require both the merged-entity figure AND the raw
// CLIENT_NO figure, so the two can never be mistaken for one another.
say('third pass: independent band recount for the anti-tautology gate');
const recount = { lm: { roots: new Set(), cns: new Set() }, ghz: { roots: new Set(), cns: new Set() } };
const licClient = new Map(licences.map((l) => [l.LICENCE_NO, l.CLIENT_NO]));
await streamCsv(TMP + 'device_details.csv', (r) => {
  const f = Number(r.FREQUENCY);
  if (!Number.isFinite(f)) return;
  const cn = licClient.get(r.LICENCE_NO);
  if (!cn) return;
  if (f >= 450e6 && f < 520e6) { recount.lm.roots.add(rootOf.get(cn)); recount.lm.cns.add(cn); }
  else if (f >= 3.4e9 && f < 3.7e9) { recount.ghz.roots.add(rootOf.get(cn)); recount.ghz.cns.add(cn); }
});
const band450 = bandsJson.bands.find((b) => b.lo === 450e6);
const band35 = bandsJson.bands.find((b) => b.lo === 3.4e9);
gate('G5a 450–520 MHz merged holders, recomputed from source', recount.lm.roots.size, band450.entities);
gate('G5b 450–520 MHz raw client numbers differ from merged', recount.lm.cns.size > recount.lm.roots.size, true,
  `${recount.lm.cns.size} client records vs ${recount.lm.roots.size} organisations`);
gate('G5c 3.4–3.7 GHz merged holders, recomputed from source', recount.ghz.roots.size, band35.entities);
gate('G5d 3.4–3.7 GHz holders is two orders of magnitude smaller', recount.lm.roots.size / recount.ghz.roots.size > 100, true);

// G9b: the suppression is verified against the shipped payload, by identity —
// recompute the person-only set from the rule, then check the rows that were
// actually written.
const personOnlyIds = new Set(personOnlySites.map((s) => s.id));
const shippedIds = new Set(publishable.map((s) => s.id));
gate('G9b no person-only site is in the shipped point layer',
  [...personOnlyIds].filter((id) => shippedIds.has(id)).length, 0,
  `${personOnlyIds.size} suppressed, ${shippedIds.size} published`);
// G9c: a name can still collide, because two SITE_IDs at the same place carry
// the same NAME. Every such name measured is a public structure — a water
// tower, an airport, a shopping centre — published from the OTHER site's row,
// not the person's. Bounded and reported rather than waved through: if the
// count climbs, someone has changed the suppression and this is the tell.
const shippedNames = new Set(siteNamesJson.names);
gate('G9c person-only names surviving via a co-located public structure',
  personOnlySites.filter((s) => shippedNames.has(s.name)).length, (n) => n <= 20);
const personNames = new Set(clients.filter((c) => personClient.get(c.CLIENT_NO)).map((c) => c.LICENCEE.trim()).filter((n) => n.length > 4));
const entityNames = entitiesJson.rows.map((r) => r[0]);
gate('G10a no natural person is named in entities.json', entityNames.filter((n) => personNames.has(n.trim())).length, 0);

// G16: one id space.
const maxId = entitiesJson.rows.length - 1;
const refs = [
  ...bandsJson.bands.flatMap((b) => b.topHolders.map(([i]) => i)),
  ...sa4Stats.map((s) => s.topHolder),
  ...tenancyJson.sites.flatMap((s) => s.tenants),
  ...spectrumJson.rows.map((r) => r.entity),
];
gate('G16 every entity reference resolves in entities.json', refs.filter((i) => i > maxId || i < -1).length, 0);

// Plausibility
plausible('P1 spectrum-licence share of device rows (%)', Math.round(((svcRows.get('85') || 0) / deviceRows) * 10000) / 100, 78, 79);
plausible('P2 top-10 share of licences (%)', metaJson.headline.top10Share, 28, 33);
plausible('P2b HHI', metaJson.headline.hhi, 100, 180);
plausible('P3 live-site fraction (%)', Math.round((liveSites.length / sites.length) * 10000) / 100, 55, 59);
plausible('P4 natural-person clients', personAggregate.clients, 2900, 3600);
plausible('P5 licences expiring in 2027', expiry.get('2027') || 0, 90000, 115000);
gate('P6 nothing in the register predates 2014-09-17',
  licences.filter((l) => l.DATE_ISSUED && l.DATE_ISSUED < '2014-09-17').length, 0,
  'if real history appears upstream, the “no history” framing must be revisited');

const files = {
  'meta.json': metaJson,
  'entities.json': entitiesJson,
  'sectors.json': sectorsJson,
  'bands.json': bandsJson,
  'freq.json': { attribution: ATTRIBUTION, fields: ['hz', 'rows', 'tx', 'licences'], rows: freqRows },
  'duplex.json': {
    attribution: ATTRIBUTION,
    fields: ['mhz', 'pairs'], rows: duplexRows, pairedGroups, fixedGroups: fixedGroups.size,
    pairFields: ['lowerMHz', 'upperMHz', 'links'], pairs: topPairs,
  },
  'sa4_stats.json': { attribution: ATTRIBUTION, rows: sa4Stats },
  'sites.json': sitesJson,
  'site_names.json': siteNamesJson,
  'grid.json': gridJson,
  'tenancy.json': tenancyJson,
  'spectrum.json': spectrumJson,
  'bsl.json': bslJson,
  'health.json': healthJson,
  'glossary.json': glossaryJson,
};
for (const [name, data] of Object.entries(files)) {
  const body = JSON.stringify(data);
  writeFileSync(OUT + name, body);
  console.log(`  ${name.padEnd(18)} ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`);
}
writeFileSync(OUT + 'sa4.geojson', JSON.stringify(sa4Simple));
console.log(`  sa4.geojson        ${(Buffer.byteLength(JSON.stringify(sa4Simple)) / 1024).toFixed(0)} KB`);

// The extracted register is 600 MB of not-open data. It is never committed.
if (!process.argv.includes('--keep-tmp')) {
  for (const f of ['device_details.csv', 'sa4_raw.geojson']) {
    try { rmSync(TMP + f); } catch { /* already gone */ }
  }
}

say(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (warnings.length) console.log(`\n${warnings.length} plausibility warning(s):\n  ${warnings.join('\n  ')}`);
if (failures.length) {
  console.error(`\n${failures.length} GATE FAILURE(S):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nAll correctness gates passed.');
