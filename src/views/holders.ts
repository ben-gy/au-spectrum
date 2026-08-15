// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { entities, meta, classColour, classLabel, errorPanel, type Entity, type ClassDef } from '../data';
import { num, pct, compact, tipAttr, esc } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { gloss } from '../glossary';
import { openHolder } from './holder-drawer';

/**
 * A ranked bar chart would be the wrong instrument here. The datum is a
 * distribution with a Gini of 0.88 in which nearly half of the named
 * organisations sit on exactly one licence — the shape IS the finding, and a
 * top-20 bar chart hides it by showing only the head. So: a beeswarm on a log
 * axis, one dot per organisation, laned by what kind of organisation it is.
 */
export async function renderHolders(host: HTMLElement): Promise<void> {
  try {
    const [m, e] = await Promise.all([meta(), entities()]);
    const rows = e.rows;
    const classes = e.classes.filter((c) => c.id !== 'INDIVIDUAL');

    const total = m.totals.licences;
    const oneOnly = rows.filter((r) => r.lic === 1).length;

    host.innerHTML = `
      ${head('Holders',
    'Is this a concentrated register, in whose hands — and does the answer change when you count hardware instead of paperwork?',
    `Australia's largest radio licensee is a fixed-broadband company. <strong>${esc(m.headline.largestHolder)}</strong> holds <strong>${num(m.headline.largestHolderLicences)}</strong> licences, ahead of Telstra and Optus. But nobody is big: the ten largest hold <strong>${pct(m.headline.top10Share)}</strong> between them and the market-concentration index is <strong>${num(m.headline.hhi)}</strong> out of 10,000 — unconcentrated by any competition-policy reading.`)}

      ${stats([
    { value: num(rows.length), label: 'organisations named here' },
    { value: num(oneOnly), label: `of them hold exactly one licence (${pct((oneOnly / rows.length) * 100, 0)})` },
    { value: pct(m.headline.top10Share), label: 'held by the largest ten' },
    { value: num(m.headline.hhi), label: 'HHI concentration index' },
    { value: num(e.individuals.licences ?? 0), label: 'licences held by individuals (not named)' },
  ])}

      ${panel('Every licensed organisation in Australia, by size',
    `One dot per organisation, on a logarithmic axis — each gridline is ten times the last. Lane = what kind of organisation. Dot size grows with the amount of registered hardware behind those licences, which is a different thing entirely. Click any dot for its detail.`,
    `<div id="swarm" class="panel-scroll"></div>`)}

      <div class="grid-2">
        ${panel('The long tail is nearly everyone',
    'Cumulative share of licences against cumulative share of holders. The further the curve sags from the diagonal, the more unequal the register.',
    '<div id="lorenz"></div>')}
        ${panel('Paperwork versus hardware',
    'Left: each kind of organisation\'s share of licences. Right: its share of registered device assignments. A line that plunges holds a lot of licences and very little equipment; one that climbs is the reverse.',
    '<div id="slope"></div>')}
      </div>

      ${panel('The fifty largest',
    `Ranked by licences held. "Client records" is how many separate licensee numbers the ACMA holds for that organisation — we merge them, and the register does not, which is why ${gloss('entity', 'this ranking')} differs from a raw one.`,
    `<div class="panel-scroll"><table id="topTable"><thead><tr>
        <th>#</th><th>Organisation</th><th>Kind</th>
        <th class="num">Licences</th><th class="num">Device rows</th><th class="num">Sites</th><th class="num">Client records</th>
      </tr></thead><tbody></tbody></table>
      <div class="legend-note">Not every licence is the same object. Three holders in this ranking — Selectra, Interactive
        Telecommunications Network and Private Cable Network — hold hundreds of per-building subscription-television
        <em>service</em> licences rather than transmitters, so their counts are not comparable with an apparatus licensee's. The
        device-row column is the better guide to how much radio equipment an organisation actually runs.</div></div>`)}
    `;

    drawSwarm(host.querySelector('#swarm')!, rows, classes, e.individuals);
    drawLorenz(host.querySelector('#lorenz')!, rows);
    drawSlope(host.querySelector('#slope')!, rows, classes, total, m.totals.deviceRows);
    fillTable(host.querySelector('#topTable tbody')!, rows.slice(0, 50), e.classes);
  } catch (err) {
    errorPanel(host, err, () => renderHolders(host));
  }
}

function drawSwarm(host: HTMLElement, rows: Entity[], classes: ClassDef[], individuals: Record<string, number>): void {
  const laneH = 34;
  const padL = 168;
  const padR = 20;
  const padT = 26;
  const w = 1080;
  const h = padT + classes.length * laneH + 46;
  const innerW = w - padL - padR;
  const maxLic = Math.max(...rows.map((r) => r.lic));
  const x = (lic: number): number => padL + (Math.log10(lic) / Math.log10(maxLic)) * innerW;

  const byClass = new Map<string, Entity[]>();
  for (const c of classes) byClass.set(c.id, []);
  for (const r of rows) byClass.get(r.cls)?.push(r);

  let svg = svgOpen(w, h);
  // decade gridlines
  for (let d = 0; d <= Math.ceil(Math.log10(maxLic)); d++) {
    const gx = x(10 ** d);
    svg += `<line class="gridline" x1="${gx}" y1="${padT - 8}" x2="${gx}" y2="${h - 34}"/>`
      + `<text class="mono" x="${gx}" y="${h - 18}" text-anchor="middle" font-size="10">${compact(10 ** d)}</text>`;
  }
  svg += `<text x="${padL + innerW / 2}" y="${h - 4}" text-anchor="middle" font-size="10">licences held (log scale)</text>`;

  classes.forEach((c, i) => {
    const list = (byClass.get(c.id) ?? []).slice().sort((a, b) => b.lic - a.lic);
    const cy = padT + i * laneH + laneH / 2;
    svg += `<text x="${padL - 10}" y="${cy + 3}" text-anchor="end" font-size="11" fill="${c.hue}">${esc(c.label)}</text>`;
    svg += `<line class="gridline" x1="${padL}" y1="${cy}" x2="${w - padR}" y2="${cy}"/>`;
    // Deterministic vertical jitter keyed on the index: identical every render,
    // so nothing appears to move between visits.
    list.forEach((r, k) => {
      const rad = 2 + Math.min(6, Math.log10(1 + r.dev) * 1.6);
      const jitter = ((k * 2654435761) % 1000) / 1000 - 0.5;
      const cyj = cy + jitter * (laneH - rad * 2 - 4);
      svg += `<circle class="mark" data-entity="${r.i}" cx="${x(Math.max(1, r.lic)).toFixed(1)}" cy="${cyj.toFixed(1)}" r="${rad.toFixed(1)}"
        fill="${c.hue}" fill-opacity="0.55" stroke="${c.hue}" stroke-width="0.7" style="cursor:pointer"
        data-tip="${tipAttr(`${r.name}\n${num(r.lic)} licences · ${num(r.dev)} device rows\n${num(r.sites)} sites · ${r.clientRecords} client record${r.clientRecords === 1 ? '' : 's'}\n${c.label}`)}"
        aria-label="${esc(r.name)}"/>`;
    });
  });

  svg += '</svg>';
  host.innerHTML = svg
    + `<div class="legend-note">Natural persons are never named here. ${num(individuals.entities ?? 0)} individual licensees holding
       ${num(individuals.licences ?? 0)} licences are excluded from this chart and aggregated in the figures above —
       a condition of the ACMA's licence terms.</div>`;

  host.querySelectorAll<SVGCircleElement>('[data-entity]').forEach((el) => {
    el.addEventListener('click', () => openHolder(Number(el.dataset.entity)));
  });
}

function drawLorenz(host: HTMLElement, rows: Entity[]): void {
  const w = 460;
  const h = 320;
  const pad = 44;
  const sorted = rows.slice().sort((a, b) => a.lic - b.lic);
  const totalLic = sorted.reduce((s, r) => s + r.lic, 0);
  let cum = 0;
  const pts: [number, number][] = [[0, 0]];
  sorted.forEach((r, i) => {
    cum += r.lic;
    pts.push([(i + 1) / sorted.length, cum / totalLic]);
  });
  const px = (t: number): number => pad + t * (w - pad * 2);
  const py = (t: number): number => h - pad - t * (h - pad * 2);
  // Gini = 1 - 2 * area under the Lorenz curve (trapezoids over the sorted set).
  let area = 0;
  for (let i = 1; i < pts.length; i++) area += ((pts[i][1] + pts[i - 1][1]) / 2) * (pts[i][0] - pts[i - 1][0]);
  const gini = 1 - 2 * area;

  const path = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 400)) === 0 || i === pts.length - 1)
    .map(([a, b], i) => `${i ? 'L' : 'M'}${px(a).toFixed(1)},${py(b).toFixed(1)}`).join('');

  host.innerHTML = svgOpen(w, h)
    + `<line class="gridline" x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(1)}"/>`
    + `<text x="${px(0.62)}" y="${py(0.72)}" font-size="10">perfect equality</text>`
    + `<path d="${path}" fill="none" stroke="var(--accent-primary)" stroke-width="2"/>`
    + `<line class="axis" x1="${px(0)}" y1="${py(0)}" x2="${px(1)}" y2="${py(0)}"/>`
    + `<line class="axis" x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(1)}"/>`
    + `<text x="${px(0.5)}" y="${h - 10}" text-anchor="middle" font-size="10">share of organisations, smallest first</text>`
    + `<text transform="translate(12,${py(0.5)}) rotate(-90)" text-anchor="middle" font-size="10">share of licences</text>`
    + `<text class="mono" x="${px(0.06)}" y="${py(0.9)}" font-size="13" fill="var(--accent-primary)">Gini ${gini.toFixed(3)}</text>`
    + `<circle cx="${px(0.5)}" cy="${py(pts[Math.floor(pts.length / 2)][1])}" r="4" fill="var(--accent-secondary)"
        data-tip="${tipAttr(`The smaller half of all organisations hold ${pct(pts[Math.floor(pts.length / 2)][1] * 100)} of the licences between them.`)}"/>`
    + '</svg>';
}

function drawSlope(host: HTMLElement, rows: Entity[], classes: ClassDef[], totalLic: number, totalDev: number): void {
  const w = 460;
  const h = 340;
  const padT = 28;
  const padB = 34;
  const left = 130;
  const right = w - 130;
  const agg = new Map<string, { lic: number; dev: number }>();
  for (const c of classes) agg.set(c.id, { lic: 0, dev: 0 });
  for (const r of rows) {
    const a = agg.get(r.cls);
    if (a) { a.lic += r.lic; a.dev += r.dev; }
  }
  const items = [...agg.entries()].map(([id, a]) => ({
    id, label: classes.find((c) => c.id === id)!.label, hue: classes.find((c) => c.id === id)!.hue,
    l: (a.lic / totalLic) * 100, d: (a.dev / totalDev) * 100, lic: a.lic, dev: a.dev,
  })).filter((i) => i.l > 0.2 || i.d > 0.2).sort((a, b) => b.l - a.l);

  const maxV = Math.max(...items.map((i) => Math.max(i.l, i.d)));
  const y = (v: number): number => padT + (1 - v / maxV) * (h - padT - padB);

  let svg = svgOpen(w, h);
  svg += `<text x="${left}" y="${padT - 10}" text-anchor="middle" font-size="10">share of licences</text>`;
  svg += `<text x="${right}" y="${padT - 10}" text-anchor="middle" font-size="10">share of device rows</text>`;
  svg += `<line class="axis" x1="${left}" y1="${padT}" x2="${left}" y2="${h - padB}"/>`;
  svg += `<line class="axis" x1="${right}" y1="${padT}" x2="${right}" y2="${h - padB}"/>`;
  for (const i of items) {
    const y1 = y(i.l);
    const y2 = y(i.d);
    svg += `<line class="mark" x1="${left}" y1="${y1.toFixed(1)}" x2="${right}" y2="${y2.toFixed(1)}"
      stroke="${i.hue}" stroke-width="${1 + Math.min(4, i.l / 4)}" stroke-opacity="0.8"
      data-tip="${tipAttr(`${i.label}\n${num(i.lic)} licences = ${pct(i.l)} of the register\n${num(i.dev)} device rows = ${pct(i.d)} of the hardware\n${(i.dev / Math.max(1, i.lic)).toFixed(1)} device rows per licence`)}"/>`;
    svg += `<circle cx="${left}" cy="${y1.toFixed(1)}" r="3" fill="${i.hue}"/><circle cx="${right}" cy="${y2.toFixed(1)}" r="3" fill="${i.hue}"/>`;
    if (i.l > 2.5) svg += `<text x="${left - 8}" y="${(y1 + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="${i.hue}">${esc(i.label)}</text>`;
    if (i.d > 2.5) svg += `<text x="${right + 8}" y="${(y2 + 3).toFixed(1)}" font-size="10" fill="${i.hue}">${pct(i.d)}</text>`;
  }
  svg += `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="10">hover a line for both denominators</text></svg>`;
  host.innerHTML = svg;
}

function fillTable(tbody: Element, rows: Entity[], classes: ClassDef[]): void {
  tbody.innerHTML = rows.map((r, i) => `<tr class="clickable" data-entity="${r.i}">
    <td class="num">${i + 1}</td>
    <td>${esc(r.name)}</td>
    <td><span class="legend-swatch" style="display:inline-block;background:${classColour(classes, r.cls)}"></span> ${esc(classLabel(classes, r.cls))}</td>
    <td class="num">${num(r.lic)}</td><td class="num">${num(r.dev)}</td><td class="num">${num(r.sites)}</td><td class="num">${r.clientRecords}</td>
  </tr>`).join('');
  tbody.querySelectorAll<HTMLElement>('[data-entity]').forEach((el) => {
    el.addEventListener('click', () => openHolder(Number(el.dataset.entity)));
  });
}
