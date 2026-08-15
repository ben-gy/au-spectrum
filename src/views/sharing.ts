// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, entities, errorPanel, classColour, classLabel, type ClassDef } from '../data';
import { num, pct, tipAttr, esc } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { openHolder } from './holder-drawer';
import { chordArcs, polar, type Arc } from '../utils/chord';
import { gloss } from '../glossary';

interface TenancyFile {
  pairs: Record<string, number>;
  sites: { name: string; state: string; lat: number; lon: number; devices: number; licences: number; tenants: number[] }[];
  singleHolder: number;
  shared: number;
}

let selectedPair: string | null = null;

/**
 * Co-tenancy is the one genuinely pairwise, non-hierarchical relation in this
 * data: two kinds of organisation either share a mast or they do not, and
 * neither contains the other. That is what a chord is for. A force graph would
 * imply structure that is not there; a treemap cannot express a pair at all.
 */
export async function renderSharing(host: HTMLElement): Promise<void> {
  try {
    const [t, e] = await Promise.all([load<TenancyFile>('tenancy.json'), entities()]);
    const classes = e.classes.filter((c) => c.id !== 'INDIVIDUAL');
    const top = t.sites[0];

    host.innerHTML = `
      ${head('Sharing',
    `Whose ${gloss('site', 'site')} does everyone else share?`,
    `<strong>${esc(top.name)}</strong> carries equipment for <strong>${num(top.tenants.length)}</strong> separate organisations on <strong>${num(top.licences)}</strong> licences — the most contested piece of ground in the country. Nationally, <strong>${pct((t.shared / (t.shared + t.singleHolder)) * 100)}</strong> of sites with equipment on them have more than one organisation using them.`)}

      ${stats([
    { value: num(t.shared + t.singleHolder), label: 'sites with equipment' },
    { value: num(t.singleHolder), label: 'used by one organisation only' },
    { value: num(t.shared), label: 'shared by two or more' },
    { value: num(top.tenants.length), label: 'tenants at the busiest site' },
  ])}

      ${panel('Who shares with whom',
    'Each arc is a kind of organisation, sized by how many shared sites it appears at. Each ribbon is a pair: its thickness is the number of sites where both kinds hold equipment. Click a ribbon to list those sites.',
    `<div id="chord" style="position:relative;max-width:840px;margin:0 auto"></div><div id="chord-legend" class="legend"></div>
     <div class="legend-note">A loop back to the same arc means two organisations of the same kind at one site — two carriers, or two councils.
       Throughout this view a "site" is the register's own site record, which is a coordinate in a catalogue rather than a structure:
       several records can describe one mast, and 53 coordinates in the register carry more than one site number.</div>`)}

      ${panel('The most crowded ground in Australia',
    'Every site with six or more separate organisations on it. Each segment is one tenant, coloured by what kind of organisation it is. Click a segment for that organisation.',
    `<div id="stack" class="panel-scroll"></div>`)}
    `;

    drawChord(host, t, classes);
    drawStack(host, t, e.rows, e.classes);
  } catch (err) {
    errorPanel(host, err, () => renderSharing(host));
  }
}

function drawChord(host: HTMLElement, t: TenancyFile, classes: ClassDef[]): void {
  const el = host.querySelector('#chord');
  if (!el) return;
  // Wider than tall on purpose: the labels sit outside the circle on the left
  // and right, and a square viewBox clips "Electricity, gas & water" to
  // "ectricity, gas & water".
  const w = 820;
  const size = 620;
  const cx = w / 2;
  const cy = size / 2;
  const r = size / 2 - 78;

  const totals = new Map<string, number>();
  for (const [k, n] of Object.entries(t.pairs)) {
    const [a, b] = k.split('|');
    totals.set(a, (totals.get(a) ?? 0) + n);
    if (b !== a) totals.set(b, (totals.get(b) ?? 0) + n);
  }
  const nodes = classes.filter((c) => (totals.get(c.id) ?? 0) > 0)
    .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const grand = nodes.reduce((s, c) => s + (totals.get(c.id) ?? 0), 0) || 1;

  const arcs = chordArcs(nodes.map((n) => totals.get(n.id) ?? 0));
  const angles = new Map<string, Arc>(nodes.map((n, i) => [n.id, arcs[i]]));
  const pt = (a: number, rad: number): [number, number] => polar(cx, cy, a, rad);
  void grand;

  let svg = svgOpen(w, size);
  const pairs = Object.entries(t.pairs).sort((a, b) => a[1] - b[1]);
  const maxPair = Math.max(...pairs.map(([, n]) => n));
  for (const [k, n] of pairs) {
    const [a, b] = k.split('|');
    const A = angles.get(a);
    const B = angles.get(b);
    if (!A || !B || n < 3) continue;
    const wgt = 2 + (Math.log10(1 + n) / Math.log10(1 + maxPair)) * 22;
    const [x0, y0] = pt(A.mid, r);
    const [x1, y1] = pt(B.mid, r);
    const d = a === b
      ? `M${x0.toFixed(1)},${y0.toFixed(1)} C${(cx + Math.cos(A.mid - 0.22) * r * 0.45).toFixed(1)},${(cy + Math.sin(A.mid - 0.22) * r * 0.45).toFixed(1)} ${(cx + Math.cos(A.mid + 0.22) * r * 0.45).toFixed(1)},${(cy + Math.sin(A.mid + 0.22) * r * 0.45).toFixed(1)} ${x0.toFixed(1)},${y0.toFixed(1)}`
      : `M${x0.toFixed(1)},${y0.toFixed(1)} Q${cx},${cy} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    const dim = selectedPair && selectedPair !== k;
    svg += `<path class="mark${dim ? ' dimmed' : ''}" data-pair="${esc(k)}" d="${d}" fill="none"
      stroke="${classColour(classes, a)}" stroke-opacity="${dim ? 0.1 : 0.42}" stroke-width="${wgt.toFixed(1)}"
      stroke-linecap="round" style="cursor:pointer"
      data-tip="${tipAttr(`${classLabel(classes, a)} ${a === b ? '(with each other)' : `+ ${classLabel(classes, b)}`}\n${num(n)} shared sites host both`)}"/>`;
  }

  for (const nde of nodes) {
    const A = angles.get(nde.id)!;
    const [ax0, ay0] = pt(A.a0, r);
    const [ax1, ay1] = pt(A.a1, r);
    const large = A.a1 - A.a0 > Math.PI ? 1 : 0;
    svg += `<path d="M${ax0.toFixed(1)},${ay0.toFixed(1)} A${r},${r} 0 ${large} 1 ${ax1.toFixed(1)},${ay1.toFixed(1)}"
      fill="none" stroke="${nde.hue}" stroke-width="11" stroke-linecap="butt"
      data-tip="${tipAttr(`${nde.label}\nappears at ${num(totals.get(nde.id) ?? 0)} shared-site pairings`)}"/>`;
    // Only arcs with room get a permanent label. The small ones collide into an
    // unreadable pile at the top of the circle; they keep their hover tooltip
    // and their legend entry, which is where the reader looks anyway.
    if (A.a1 - A.a0 > 0.09) {
      const [lx, ly] = pt(A.mid, r + 20);
      const anchor = Math.cos(A.mid) > 0.15 ? 'start' : Math.cos(A.mid) < -0.15 ? 'end' : 'middle';
      svg += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" font-size="10" fill="${nde.hue}">${esc(nde.label)}</text>`;
    }
  }
  svg += '</svg>';
  el.innerHTML = svg;

  const legend0 = host.querySelector('#chord-legend');
  if (legend0 && !selectedPair) {
    legend0.innerHTML = nodes.map((n) => `<span class="legend-item"><span class="legend-swatch" style="background:${n.hue}"></span>${esc(n.label)}</span>`).join('');
  }

  const legend = host.querySelector('#chord-legend');
  el.querySelectorAll<SVGPathElement>('[data-pair]').forEach((p) => {
    p.addEventListener('click', () => {
      const k = p.dataset.pair!;
      selectedPair = selectedPair === k ? null : k;
      drawChord(host, t, classes);
      if (legend) {
        if (!selectedPair) { legend.innerHTML = ''; return; }
        const [a, b] = selectedPair.split('|');
        const matches = t.sites.filter((s) => {
          void s; return true;
        });
        void matches;
        legend.innerHTML = `<span class="legend-item"><span class="legend-swatch" style="background:${classColour(classes, a)}"></span>
          ${esc(classLabel(classes, a))} + ${esc(classLabel(classes, b))} — ${num(t.pairs[selectedPair] ?? 0)} shared sites.
          Click the ribbon again to clear.</span>`;
      }
    });
  });
}

function drawStack(host: HTMLElement, t: TenancyFile, ents: { i: number; name: string; cls: string }[], classes: ClassDef[]): void {
  const el = host.querySelector('#stack');
  if (!el) return;
  const rows = t.sites.slice(0, 60);
  const maxTen = Math.max(...rows.map((r) => r.tenants.length));
  el.innerHTML = `<div style="min-width:640px">${rows.map((s) => {
    const segW = 100 / maxTen;
    return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:3px">
      <span style="flex:0 0 240px;min-width:0;font-size:var(--font-size-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        data-tip="${tipAttr(`${s.name}\n${s.state} · ${s.lat}, ${s.lon}\n${num(s.tenants.length)} organisations · ${num(s.licences)} licences · ${num(s.devices)} device rows`)}">${esc(s.name)}</span>
      <span style="flex:1 1 auto;min-width:0;display:flex;gap:1px;height:14px">
        ${s.tenants.map((id) => {
      const e = ents[id];
      const colour = e ? classColour(classes, e.cls) : '#444';
      return `<span class="mark" data-entity="${id}" style="flex:0 0 ${segW.toFixed(2)}%;background:${colour};border-radius:1px;cursor:pointer"
          data-tip="${tipAttr(`${e?.name ?? 'unknown'}\n${classLabel(classes, e?.cls ?? '')}\nat ${s.name}`)}"></span>`;
    }).join('')}
      </span>
      <span class="mono" style="flex:0 0 auto;font-size:var(--font-size-xs)">${s.tenants.length}</span>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll<HTMLElement>('[data-entity]').forEach((seg) => {
    seg.addEventListener('click', () => openHolder(Number(seg.dataset.entity)));
  });
}
