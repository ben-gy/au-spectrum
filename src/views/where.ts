// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import L from 'leaflet';
import { load, entities, meta, errorPanel, classColour, classLabel, type Sa4Stat, type ClassDef } from '../data';
import { num, pct, esc } from '../format';
import { head, panel, stats } from './common';
import { gloss } from '../glossary';
import { openHolder } from './holder-drawer';
import { createPointLayer, type PointData } from './pointlayer';
import { openOverlay } from '../components/overlay';

type Metric = 'class' | 'percap' | 'concentration';
let metric: Metric = 'percap';
/** Top of the per-capita ramp, measured from the payload at load. */
let perCapMax = 560;

export async function renderWhere(host: HTMLElement): Promise<void> {
  try {
    const [m, e, statsFile, geo] = await Promise.all([
      meta(), entities(),
      load<{ rows: Sa4Stat[] }>('sa4_stats.json'),
      load<GeoJSON.FeatureCollection>('sa4.geojson'),
    ]);
    const byCode = new Map(statsFile.rows.map((r) => [r.code, r]));
    perCapMax = Math.max(1, ...statsFile.rows.map((r) => r.perTenK ?? 0));
    const topRegion = m.headline.sa4TopPerCapita;
    const bottom = m.headline.sa4BottomPerCapita;

    host.innerHTML = `
      ${head('Where',
    'Who holds the radio infrastructure where you live?',
    `A resident of <strong>${esc(topRegion.name)}</strong> lives under <strong>${topRegion.perTenK}</strong> registered radio sites per 10,000 people. In <strong>${esc(bottom.name)}</strong> the figure is <strong>${bottom.perTenK}</strong> — ${Math.round((topRegion.perTenK ?? 1) / (bottom.perTenK || 1))}× fewer. Radio infrastructure is densest where people are not.`)}

      ${stats([
    { value: num(m.totals.sites), label: 'site records in the register' },
    { value: num(m.totals.liveSites), label: 'with any equipment on them' },
    { value: num(m.totals.publishableSites), label: 'drawn on this map' },
    { value: num(m.totals.personOnlySites), label: 'withheld as private addresses' },
  ])}

      ${panel('Australia, by who holds the radio',
    `Regions are ABS ${gloss('SA4', 'Statistical Areas Level 4')}. Zoom past level nine and the individual transmitter sites appear. Click a region for its holders; click a site for what transmits there.`,
    `<div style="display:flex;gap:var(--space-md);flex-wrap:wrap;align-items:center;margin-bottom:var(--space-md)">
        <div class="seg" role="group" aria-label="Map metric">
          <button data-metric="percap" aria-pressed="${metric === 'percap'}">Sites per 10,000 people</button>
          <button data-metric="class" aria-pressed="${metric === 'class'}">Who holds most</button>
          <button data-metric="concentration" aria-pressed="${metric === 'concentration'}">One holder's share</button>
        </div>
        <input type="search" id="place-box" placeholder="Find a place or site name…" aria-label="Search site names" style="flex:1 1 240px;max-width:340px" />
      </div>
      <div class="map-wrap"><div class="map-canvas" id="map"></div></div>
      <div id="place-results"></div>
      <div id="map-legend" class="legend"></div>
      <div class="legend-note">Position accuracy is drawn, not shaded: a solid dot is a fix within ten metres, a soft dot within a hundred,
        a dashed ring is a site the register records as unknown accuracy — ${pct((m.totals.sites - m.totals.publishableSites) / m.totals.sites * 100)} of site records are
        withheld or unmapped for the reasons above. Sites whose every device belongs to an individual are not on this map at all.</div>`)}

      ${panel('Every region, ranked',
    'Sites is every record the register holds in that region, including the 43% that carry no equipment; live counts only those with a device on them. Click a row to fly there.',
    `<div class="panel-scroll"><table id="regionTable"><thead><tr>
      <th>Region</th><th>State</th><th class="num">Sites</th><th class="num">Live</th><th class="num">Per 10k people</th>
      <th class="num">Organisations</th><th>Largest holder</th></tr></thead><tbody></tbody></table></div>`)}
    `;

    const mapEl = host.querySelector('#map') as HTMLElement;
    const map = L.map(mapEl, { minZoom: 3, maxZoom: 15, zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    map.attributionControl.setPrefix(false);
    // Labelled tiles, deliberately: the question this view answers is "where I
    // live", and an unlabelled choropleth of 89 abstract regions is unusable for
    // that. The label layer sits under the polygons at 72% fill opacity.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: 'Tiles © CARTO · Boundaries © ABS (CC BY 4.0)',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
    // Australia, hard-coded. Fitting to the data's bounds would frame Antarctica
    // and Heard Island — the register really does hold sites at −75° latitude.
    map.setView([-27.5, 134], 4);

    const layer = L.geoJSON(geo, {
      style: (f) => styleFor(byCode.get((f?.properties as { sa4_code_2021: string }).sa4_code_2021), e.classes),
      onEachFeature: (f, lyr) => {
        const s = byCode.get((f.properties as { sa4_code_2021: string }).sa4_code_2021);
        if (!s) return;
        lyr.bindTooltip(regionTip(s, e.classes, e.rows), { sticky: true });
        lyr.on('click', () => showRegion(s, e.classes, e.rows));
        lyr.on('mouseover', () => (lyr as L.Path).setStyle({ weight: 2, color: 'var(--text-primary)' }));
        lyr.on('mouseout', () => (lyr as L.Path).setStyle(styleFor(s, e.classes)));
      },
    }).addTo(map);

    // Points, loaded after the choropleth so the first paint is immediate.
    let points: PointData | null = null;
    let names: string[] = [];
    void load<PointData & { n: number }>('sites.json').then((p) => {
      points = p;
      const colours = e.classes.map((c) => c.hue);
      createPointLayer(p, {
        colours, minZoom: 9,
        onPick: async (i) => {
          if (!names.length) names = (await load<{ names: string[] }>('site_names.json')).names;
          openOverlay('drawer', names[i] ?? 'Site', `
            <h2>${esc(names[i] ?? 'Site')}</h2>
            <p class="sub">${p.lat[i].toFixed(5)}, ${p.lon[i].toFixed(5)}</p>
            <dl class="kv">
              <dt>Registered device assignments</dt><dd>${num(p.dev[i])}</dd>
              <dt>Separate organisations here</dt><dd>${num(p.holders[i])}</dd>
              <dt>Largest holder class</dt><dd>${esc(classLabel(e.classes, e.classes[p.cls[i]]?.id ?? ''))}</dd>
              <dt>Position accuracy</dt><dd>${['within 10 m', 'within 100 m', 'unknown'][p.prec[i]]}</dd>
            </dl>
            <p class="legend-note">A site record is a coordinate in the register's catalogue, not a structure — several
              records can describe one mast, and the register's own accuracy flag is shown above rather than assumed.</p>`);
        },
      }).addTo(map);
    });

    // Leaflet mis-measures a container that has not finished layout: a map built
    // in a 0×0 box fits to maximum zoom and renders one street corner, silently.
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 250);

    host.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((b) => {
      b.addEventListener('click', () => {
        metric = b.dataset.metric as Metric;
        host.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        layer.setStyle((f) => styleFor(byCode.get((f?.properties as { sa4_code_2021: string }).sa4_code_2021), e.classes));
        drawLegend(host, statsFile.rows, e.classes);
      });
    });

    drawLegend(host, statsFile.rows, e.classes);
    fillRegionTable(host, statsFile.rows, e.classes, e.rows, map, byCode);

    // Site-name search. The names payload is 3 MB, so it loads on first keypress
    // and not before.
    const box = host.querySelector('#place-box') as HTMLInputElement;
    const results = host.querySelector('#place-results')!;
    let timer = 0;
    box.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const q = box.value.trim().toLowerCase();
        if (q.length < 3) { results.innerHTML = ''; return; }
        results.innerHTML = '<div class="loading">Searching…</div>';
        if (!names.length) names = (await load<{ names: string[] }>('site_names.json')).names;
        if (!points) { results.innerHTML = '<div class="empty-state">Still loading the site layer — try again in a moment.</div>'; return; }
        const hits: number[] = [];
        for (let i = 0; i < names.length && hits.length < 40; i++) if (names[i].toLowerCase().includes(q)) hits.push(i);
        if (!hits.length) {
          results.innerHTML = `<div class="empty-state">No licensed transmitter site in the register has a name containing
            “${esc(box.value)}”. That is an answer, not an error — plenty of Australia has no registered site at all.</div>`;
          return;
        }
        results.innerHTML = `<div class="panel-scroll"><table><thead><tr><th>Site</th><th class="num">Devices</th><th class="num">Organisations</th></tr></thead><tbody>
          ${hits.map((i) => `<tr class="clickable" data-i="${i}"><td>${esc(names[i])}</td><td class="num">${num(points!.dev[i])}</td><td class="num">${num(points!.holders[i])}</td></tr>`).join('')}
        </tbody></table></div>`;
        results.querySelectorAll<HTMLElement>('[data-i]').forEach((tr) => {
          tr.addEventListener('click', () => {
            const i = Number(tr.dataset.i);
            map.setView([points!.lat[i], points!.lon[i]], 13);
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
      }, 300);
    });

    function showRegion(s: Sa4Stat, classes: ClassDef[], ents: { i: number; name: string; cls: string }[]): void {
      const total = Object.values(s.byClass).reduce((a, b) => a + b, 0) || 1;
      const ov = openOverlay('drawer', s.name, `
        <h2>${esc(s.name)}</h2>
        <p class="sub">${esc(s.state)} · ${num(s.areaKm2)} km² · ${num(s.population)} people</p>
        <dl class="kv">
          <dt>Site records</dt><dd>${num(s.sites)}</dd>
          <dt>With equipment on them</dt><dd>${num(s.live)}</dd>
          <dt>Registered device assignments</dt><dd>${num(s.devices)}</dd>
          <dt>Separate organisations</dt><dd>${num(s.entities)}</dd>
          <dt>Sites per 10,000 people</dt><dd>${s.perTenK ?? '—'}</dd>
          <dt>Sites per 1,000 km²</dt><dd>${(s.sites / Math.max(1, s.areaKm2) * 1000).toFixed(1)}</dd>
        </dl>
        <div class="panel-title" style="font-size:var(--font-size-base)">Who holds the sites here</div>
        <div class="panel-sub" style="margin-bottom:.5rem">Counting each organisation once per site it holds equipment at.</div>
        ${Object.entries(s.byClass).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cls, n]) => `
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:3px">
            <span style="flex:0 0 130px;min-width:0;font-size:var(--font-size-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(classLabel(classes, cls))}</span>
            <span style="flex:1 1 auto;min-width:0;display:block;height:12px;background:var(--bg-elevated);border-radius:2px;overflow:hidden">
              <span style="display:block;height:100%;width:${((n / total) * 100).toFixed(1)}%;background:${classColour(classes, cls)}"></span></span>
            <span class="mono" style="flex:0 0 auto;font-size:var(--font-size-xs)">${pct((n / total) * 100)}</span>
          </div>`).join('')}
        ${s.topHolder >= 0 ? `<p style="margin-top:1rem"><button class="icon-btn" id="region-top">Largest holder: ${esc(ents[s.topHolder]?.name ?? '—')} (${num(s.topHolderSites)} sites)</button></p>` : ''}
      `);
      ov.panel.querySelector('#region-top')?.addEventListener('click', () => openHolder(s.topHolder));
    }
  } catch (err) {
    errorPanel(host, err, () => renderWhere(host));
  }
}

function styleFor(s: Sa4Stat | undefined, classes: ClassDef[]): L.PathOptions {
  const base = { weight: 0.6, color: '#3d4c63', fillOpacity: 0.72 };
  if (!s) return { ...base, fillColor: '#222c3a', fillOpacity: 0.3 };
  if (metric === 'class') {
    const top = Object.entries(s.byClass).sort((a, b) => b[1] - a[1])[0];
    return { ...base, fillColor: top ? classColour(classes, top[0]) : '#334' };
  }
  if (metric === 'concentration') {
    const share = s.live ? s.topHolderSites / s.live : 0;
    return { ...base, fillColor: ramp(share / 0.45) };
  }
  const v = s.perTenK ?? 0;
  // A 37× spread needs a log ramp; linear renders 85 of 89 regions identical.
  // The ceiling is measured from the data, not fixed — a hard-coded top clamps
  // the highest region to the last colour and mislabels the legend the moment
  // the register moves.
  return { ...base, fillColor: ramp(Math.log10(1 + v) / Math.log10(1 + perCapMax)) };
}

const RAMP = ['#101a2b', '#16324f', '#1b5069', '#2b7180', '#4a9187', '#84b07d', '#c7cb6c', '#fde725'];
function ramp(t: number): string {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))));
  return RAMP[i];
}

function regionTip(s: Sa4Stat, classes: ClassDef[], ents: { name: string }[]): string {
  const top = Object.entries(s.byClass).sort((a, b) => b[1] - a[1])[0];
  return `${s.name}\n${num(s.sites)} site records · ${num(s.live)} with equipment`
    + `\n${s.perTenK ?? '—'} per 10,000 people · ${num(s.entities)} organisations`
    + `\nmost sites: ${top ? classLabel(classes, top[0]) : '—'}`
    + (s.topHolder >= 0 ? `\nlargest single holder: ${ents[s.topHolder]?.name ?? '—'} (${num(s.topHolderSites)})` : '');
}

function drawLegend(host: HTMLElement, rows: Sa4Stat[], classes: ClassDef[]): void {
  const el = host.querySelector('#map-legend');
  if (!el) return;
  if (metric === 'class') {
    const used = new Set(rows.map((r) => Object.entries(r.byClass).sort((a, b) => b[1] - a[1])[0]?.[0]).filter(Boolean));
    el.innerHTML = [...used].map((c) => `<span class="legend-item"><span class="legend-swatch" style="background:${classColour(classes, c as string)}"></span>${esc(classLabel(classes, c as string))}</span>`).join('');
    return;
  }
  // Legend breakpoints are the inverse of the ramp, computed from the same
  // measured ceiling the fill uses, so the two cannot drift apart.
  const labels = metric === 'percap'
    ? RAMP.map((_, i) => {
      const v = (1 + perCapMax) ** (i / (RAMP.length - 1)) - 1;
      return i === RAMP.length - 1 ? `${Math.round(v)}+` : String(Math.round(v));
    })
    : ['0%', '6%', '13%', '19%', '26%', '32%', '39%', '45%+'];
  el.innerHTML = RAMP.map((c, i) => `<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${labels[i]}</span>`).join('')
    + `<span class="legend-item">${metric === 'percap' ? 'sites per 10,000 people (log scale)' : 'share of live sites held by the single largest holder'}</span>`;
}

function fillRegionTable(host: HTMLElement, rows: Sa4Stat[], classes: ClassDef[], ents: { name: string }[], map: L.Map, byCode: Map<string, Sa4Stat>): void {
  const tbody = host.querySelector('#regionTable tbody');
  if (!tbody) return;
  const sorted = rows.slice().sort((a, b) => (b.perTenK ?? 0) - (a.perTenK ?? 0));
  tbody.innerHTML = sorted.map((s) => `<tr class="clickable" data-code="${s.code}">
    <td>${esc(s.name)}</td><td>${esc(s.state)}</td>
    <td class="num">${num(s.sites)}</td><td class="num">${num(s.live)}</td>
    <td class="num">${s.perTenK ?? '—'}</td><td class="num">${num(s.entities)}</td>
    <td>${esc(ents[s.topHolder]?.name ?? '—')} <span class="note-inline">${num(s.topHolderSites)}</span></td>
  </tr>`).join('');
  void classes;
  tbody.querySelectorAll<HTMLElement>('[data-code]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const s = byCode.get(tr.dataset.code!);
      if (!s) return;
      // Region centroids are not in the stats payload, so fly by matching the
      // drawn layer's bounds instead of inventing a coordinate.
      const target = document.querySelector('#map');
      map.eachLayer((l) => {
        const p = l as L.Path & { feature?: { properties: { sa4_code_2021: string } } };
        if (p.feature?.properties?.sa4_code_2021 === s.code) {
          map.fitBounds((p as unknown as L.Polygon).getBounds(), { padding: [20, 20] });
        }
      });
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}
