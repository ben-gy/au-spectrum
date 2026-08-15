// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { entities, load, classLabel, type BandRow } from '../data';
import { num, esc, pct, tipAttr } from '../format';
import { openOverlay } from '../components/overlay';

/**
 * The holder detail drawer, shared by every view. Opening it from a dot, a
 * table row, a map region or a chord segment must land in the same place, so
 * it lives here and takes only an entity id.
 */
export async function openHolder(id: number): Promise<void> {
  const e = await entities();
  const ent = e.rows[id];
  if (!ent) return;

  const ov = openOverlay('drawer', ent.name, `
    <h2>${esc(ent.name)}</h2>
    <p class="sub">${esc(classLabel(e.classes, ent.cls))}</p>
    <dl class="kv">
      <dt>Licences held</dt><dd>${num(ent.lic)}</dd>
      <dt>Registered device assignments</dt><dd>${num(ent.dev)}</dd>
      <dt>Of those, transmitters</dt><dd>${num(ent.tx)}</dd>
      <dt>Sites with equipment</dt><dd>${num(ent.sites)}</dd>
      <dt>Device rows per licence</dt><dd>${(ent.dev / Math.max(1, ent.lic)).toFixed(1)}</dd>
      <dt>Licensee records merged</dt><dd>${ent.clientRecords}</dd>
      <dt>States and territories</dt><dd>${ent.states.length ? esc(ent.states.join(' ')) : '—'}</dd>
    </dl>
    <div class="panel-title" style="font-size:var(--font-size-base)">What it is licensed for</div>
    <div class="panel-sub" style="margin-bottom:.5rem">The register's own service categories.</div>
    <div>${ent.services.map((s) => `<span class="chip" aria-pressed="false" style="cursor:default">${esc(e.serviceNames[s] ?? '?')}</span>`).join(' ')}</div>
    <div id="holder-bands" style="margin-top:1.25rem"></div>
    ${ent.clientRecords > 1 ? `<p class="legend-note" style="margin-top:1.25rem">The ACMA holds ${ent.clientRecords} separate
       licensee records for this organisation. Merging them is our decision, not the register's — see Method.</p>` : ''}
  `);

  // The band spine, restricted to this holder. Loaded after the drawer paints so
  // the drawer opens instantly on a slow connection.
  try {
    const bands = await load<{ bands: BandRow[] }>('bands.json');
    const mine = bands.bands
      .map((b) => ({ b, rows: b.topHolders.find(([i]) => i === id)?.[1] ?? 0 }))
      .filter((x) => x.rows > 0)
      .sort((a, b) => b.rows - a.rows)
      .slice(0, 10);
    const host = ov.panel.querySelector('#holder-bands');
    if (!host) return;
    if (!mine.length) {
      host.innerHTML = '<div class="panel-sub">No band is dominated by this holder — it does not reach the top twelve of any band.</div>';
      return;
    }
    const max = Math.max(...mine.map((x) => x.rows));
    host.innerHTML = `<div class="panel-title" style="font-size:var(--font-size-base)">Where its equipment sits</div>
      <div class="panel-sub" style="margin-bottom:.5rem">Device assignments by band, for the bands where it ranks in the top twelve.</div>
      ${mine.map((x) => `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:3px" data-tip="${tipAttr(`${x.b.name}\n${num(x.rows)} device rows here\n${pct((x.rows / Math.max(1, x.b.rows)) * 100)} of the band`)}">
        <span style="flex:0 0 118px;font-size:var(--font-size-xs);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.b.name)}</span>
        <span style="flex:1 1 auto;min-width:0;display:block;height:12px;background:var(--bg-elevated);border-radius:2px;overflow:hidden">
          <span style="display:block;height:100%;width:${((x.rows / max) * 100).toFixed(1)}%;background:var(--accent-primary)"></span>
        </span>
        <span class="mono" style="flex:0 0 auto;font-size:var(--font-size-xs)">${num(x.rows)}</span>
      </div>`).join('')}`;
  } catch {
    /* the drawer is still useful without the band breakdown */
  }
}
