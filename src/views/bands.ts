// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, entities, meta, errorPanel, classColour, classLabel, type BandRow, type ClassDef } from '../data';
import { num, pct, freq, freqTick, tipAttr, esc, freqColour, compact } from '../format';
import { head, panel, svgOpen } from './common';
import { gloss } from '../glossary';
import { openHolder } from './holder-drawer';

interface BandsFile {
  binsPerDecade: number;
  binMinHz: number;
  bands: BandRow[];
  bins: { i: number; rows: number; tx: number; entities: number; byClass: Record<string, number> }[];
}

let domain: [number, number] = [1e4, 3e11];
let selected = -1;

/**
 * The signature view. Frequency is a continuous axis spanning seven and a half
 * orders of magnitude, so everything here is logarithmic and binned at a
 * constant RATIO (24 bins per decade) rather than a constant number of hertz —
 * equal-Hz bins would put 99.7% of the register in the last bar.
 *
 * Three lanes, because "how busy is this band" and "how many people are in it"
 * are different questions with opposite answers, and the whole point of the
 * view is that they diverge.
 */
export async function renderBands(host: HTMLElement): Promise<void> {
  try {
    const [f, e, m] = await Promise.all([load<BandsFile>('bands.json'), entities(), meta()]);
    const classes = e.classes;
    const lm = f.bands.find((b) => b.lo === 450e6)!;
    const g5 = f.bands.find((b) => b.lo === 3.4e9)!;

    host.innerHTML = `
      ${head('Bands',
    'Which frequencies belong to everybody, and which belong to four companies?',
    `<strong>${num(lm.entities)}</strong> different organisations transmit in the 450–520 MHz land-mobile band — farms, taxis, mines, ambulances. In the 3.5 GHz band that carries 5G, there are <strong>${num(g5.entities)}</strong>. The 5G band carries nearly three times as much registered hardware.`)}

      ${panel('The whole spectrum, from 10 kHz to 300 GHz',
    `Each column is a bin one twenty-fourth of a decade wide, so bins are equally wide on screen everywhere on the axis. Top: how much registered hardware sits there. Middle: who holds it. Bottom: how many separate organisations — the lane that tells you whether a band is a commons or a duopoly.`,
    `<div class="chip-row" id="band-chips"></div>
     <div id="spine" class="panel-scroll"></div>
     <div id="band-legend" class="legend"></div>
     <div class="legend-note">Bins with no licensed device are drawn as gaps, not as zeroes. Six device rows above 1 THz are optical laser links and appear on no frequency axis here.</div>`)}

      ${panel('Band by band',
    `The bands Australians actually name. "Holders" counts organisations after merging the register's client numbers; "device rows" counts registered assignments, about half of which are receivers. Click a row to see who is in it.`,
    `<div class="panel-scroll"><table id="bandTable"><thead><tr>
        <th>Band</th><th class="num">From</th><th class="num">To</th>
        <th class="num">Device rows</th><th class="num">Licences</th><th class="num">Holders</th><th>Who holds it</th>
      </tr></thead><tbody></tbody></table></div>`)}

      <div id="band-detail"></div>

      ${panel('What is not here',
    'The register only records licences. Enormous amounts of Australian radio are invisible to it.',
    `<p class="panel-sub">Wi-Fi, Bluetooth, UHF CB handhelds and individual amateur operators all run under a
      ${gloss('class licence', 'class licence')} — a standing permission that registers nobody. The 2.4 GHz band shows
      ${num(f.bands.find((b) => b.lo === 2.4e9)?.rows ?? 0)} device rows in this register, which is not remotely how much
      radio happens there. Snapshot ${esc(m.snapshot)}.</p>`)}
    `;

    renderChips(host, f);
    drawSpine(host, f, classes);
    renderTable(host, f, classes);
  } catch (err) {
    errorPanel(host, err, () => renderBands(host));
  }
}

const QUICK: [string, number, number][] = [
  ['Full range', 1e4, 3e11],
  ['HF', 3e6, 30e6],
  ['VHF', 30e6, 300e6],
  ['UHF', 300e6, 1e9],
  ['400 MHz government', 4e8, 4.3e8],
  ['450–520 land mobile', 4.5e8, 5.2e8],
  ['Cellular 700–960', 6.94e8, 9.6e8],
  ['1.8–2.6 GHz', 1.71e9, 2.69e9],
  ['3.5 GHz', 3.4e9, 3.7e9],
  ['Microwave 6–23 GHz', 5.9e9, 2.36e10],
  ['26 GHz+', 2.4e10, 3e11],
];

function renderChips(host: HTMLElement, f: BandsFile): void {
  const row = host.querySelector('#band-chips')!;
  row.innerHTML = QUICK.map(([label, lo, hi]) => `<button class="chip" data-lo="${lo}" data-hi="${hi}"
    aria-pressed="${domain[0] === lo && domain[1] === hi}">${esc(label)}</button>`).join('')
    + `<input type="text" id="freq-box" placeholder="a frequency, e.g. 477.4 MHz" style="width:200px" aria-label="Jump to a frequency" />`;
  row.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      domain = [Number(c.dataset.lo), Number(c.dataset.hi)];
      selected = -1;
      renderChips(host, f);
      drawSpine(host, f, []);
      void refresh(host);
    });
  });
  (row.querySelector('#freq-box') as HTMLInputElement | null)?.addEventListener('change', (ev) => {
    const raw = (ev.target as HTMLInputElement).value.trim();
    const mult = /ghz/i.test(raw) ? 1e9 : /khz/i.test(raw) ? 1e3 : /\bhz\b/i.test(raw) && !/[mgk]hz/i.test(raw) ? 1 : 1e6;
    const v = parseFloat(raw.replace(/[^\d.]/g, '')) * mult;
    if (!Number.isFinite(v) || v <= 0) return;
    domain = [v / 3, v * 3];
    void refresh(host);
  });
}

async function refresh(host: HTMLElement): Promise<void> {
  const f = await load<BandsFile>('bands.json');
  const e = await entities();
  drawSpine(host, f, e.classes);
  renderTable(host, f, e.classes);
}

function drawSpine(host: HTMLElement, f: BandsFile, classes: ClassDef[]): void {
  const el = host.querySelector('#spine');
  if (!el) return;
  if (!classes.length) return; // first paint waits for the class list

  const w = 1120;
  const padL = 54;
  const padR = 14;
  const laneA = 150;
  const laneB = 84;
  const laneC = 110;
  const gap = 26;
  const h = 26 + laneA + gap + laneB + gap + laneC + 34;
  const innerW = w - padL - padR;
  const [d0, d1] = domain;
  const lx = (hz: number): number => padL + ((Math.log10(hz) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0))) * innerW;
  const binLo = (i: number): number => f.binMinHz * 10 ** (i / f.binsPerDecade);
  const binHi = (i: number): number => f.binMinHz * 10 ** ((i + 1) / f.binsPerDecade);

  const visible = f.bins.filter((b) => binHi(b.i) > d0 && binLo(b.i) < d1);
  const maxRows = Math.max(1, ...visible.map((b) => b.rows));
  const maxEnt = Math.max(1, ...visible.map((b) => b.entities));
  const logY = (v: number, max: number, hgt: number): number => (v <= 0 ? 0 : (Math.log10(1 + v) / Math.log10(1 + max)) * hgt);

  const yA = 26;
  const yB = yA + laneA + gap;
  const yC = yB + laneB + gap;

  let svg = svgOpen(w, h);

  // decade gridlines and ticks
  for (let d = Math.ceil(Math.log10(d0)); d <= Math.floor(Math.log10(d1)); d++) {
    const hz = 10 ** d;
    const gx = lx(hz);
    svg += `<line class="gridline" x1="${gx.toFixed(1)}" y1="${yA}" x2="${gx.toFixed(1)}" y2="${yC + laneC}"/>`
      + `<text class="mono" x="${gx.toFixed(1)}" y="${h - 14}" text-anchor="middle" font-size="10">${freqTick(hz)}</text>`;
  }
  svg += `<text x="${padL}" y="${yA - 10}" font-size="10">registered device assignments per bin (log)</text>`;
  svg += `<text x="${padL}" y="${yB - 8}" font-size="10">who holds them</text>`;
  svg += `<text x="${padL}" y="${yC - 8}" font-size="10">how many separate organisations (log)</text>`;
  svg += `<text x="${w / 2}" y="${h - 2}" text-anchor="middle" font-size="10">frequency, logarithmic</text>`;

  for (const b of visible) {
    const x0 = Math.max(padL, lx(Math.max(binLo(b.i), d0)));
    const x1 = Math.min(w - padR, lx(Math.min(binHi(b.i), d1)));
    const bw = Math.max(0.8, x1 - x0);
    const t = (Math.log10(binLo(b.i)) - 4) / (Math.log10(3e11) - 4);
    const tip = tipAttr(`${freq(binLo(b.i))} – ${freq(binHi(b.i))}\n${num(b.rows)} device rows (${num(b.tx)} transmitters)\n${num(b.entities)} organisations`);

    // Lane A — occupancy
    const hA = logY(b.rows, maxRows, laneA);
    svg += `<rect class="mark" x="${x0.toFixed(1)}" y="${(yA + laneA - hA).toFixed(1)}" width="${bw.toFixed(1)}" height="${hA.toFixed(1)}"
      fill="${freqColour(t)}" data-tip="${tip}"/>`;

    // Lane B — 100% stacked composition
    const entries = Object.entries(b.byClass).sort((a, c) => c[1] - a[1]);
    const tot = entries.reduce((s, [, n]) => s + n, 0) || 1;
    let acc = 0;
    for (const [cls, n] of entries) {
      const seg = (n / tot) * laneB;
      svg += `<rect class="mark" x="${x0.toFixed(1)}" y="${(yB + acc).toFixed(1)}" width="${bw.toFixed(1)}" height="${seg.toFixed(2)}"
        fill="${classColour(classes, cls)}" fill-opacity="0.85"
        data-tip="${tipAttr(`${freq(binLo(b.i))} – ${freq(binHi(b.i))}\n${classLabel(classes, cls)}\n${num(n)} device rows = ${pct((n / tot) * 100)} of this bin`)}"/>`;
      acc += seg;
    }

    // Lane C — organisations
    const hC = logY(b.entities, maxEnt, laneC);
    svg += `<rect class="mark" x="${x0.toFixed(1)}" y="${(yC + laneC - hC).toFixed(1)}" width="${bw.toFixed(1)}" height="${hC.toFixed(1)}"
      fill="var(--accent-secondary)" fill-opacity="0.8" data-tip="${tip}"/>`;
  }

  svg += `<line class="axis" x1="${padL}" y1="${yA + laneA}" x2="${w - padR}" y2="${yA + laneA}"/>`;
  svg += `<line class="axis" x1="${padL}" y1="${yC + laneC}" x2="${w - padR}" y2="${yC + laneC}"/>`;
  svg += `<text class="mono" x="${padL - 6}" y="${yA + 10}" text-anchor="end" font-size="9">${compact(maxRows)}</text>`;
  svg += `<text class="mono" x="${padL - 6}" y="${yC + 10}" text-anchor="end" font-size="9">${compact(maxEnt)}</text>`;
  svg += '</svg>';
  el.innerHTML = svg;

  const leg = host.querySelector('#band-legend');
  if (leg) {
    leg.innerHTML = classes.filter((c) => c.id !== 'INDIVIDUAL').map((c) => `<span class="legend-item">
      <span class="legend-swatch" style="background:${c.hue}"></span>${esc(c.label)}</span>`).join('')
      + `<span class="legend-item"><span class="legend-swatch" style="background:${freqColour(0.5)}"></span>occupancy is coloured by frequency</span>`;
  }
}

function renderTable(host: HTMLElement, f: BandsFile, classes: ClassDef[]): void {
  const tbody = host.querySelector('#bandTable tbody');
  if (!tbody) return;
  const rows = f.bands.filter((b) => b.rows > 0 && b.hi !== null && b.hi > domain[0] && b.lo < domain[1]);
  tbody.innerHTML = rows.map((b, i) => {
    const top = Object.entries(b.byClass).sort((a, c) => c[1] - a[1]).slice(0, 3);
    const tot = Object.values(b.byClass).reduce((s, n) => s + n, 0) || 1;
    return `<tr class="clickable" data-band="${f.bands.indexOf(b)}" data-i="${i}">
      <td>${esc(b.name)}</td>
      <td class="num">${freq(b.lo)}</td><td class="num">${b.hi ? freq(b.hi) : '—'}</td>
      <td class="num">${num(b.rows)}</td><td class="num">${num(b.licences)}</td><td class="num">${num(b.entities)}</td>
      <td>${top.map(([cls, n]) => `<span data-tip="${tipAttr(`${classLabel(classes, cls)}: ${num(n)} device rows, ${pct((n / tot) * 100)}`)}"
        style="display:inline-block;width:${Math.max(6, (n / tot) * 90).toFixed(0)}px;height:10px;background:${classColour(classes, cls)};border-radius:2px;margin-right:2px"></span>`).join('')}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll<HTMLElement>('[data-band]').forEach((tr) => {
    tr.addEventListener('click', () => showBand(host, f, classes, Number(tr.dataset.band)));
  });
  if (selected >= 0) showBand(host, f, classes, selected);
}

function showBand(host: HTMLElement, f: BandsFile, classes: ClassDef[], idx: number): void {
  selected = idx;
  const b = f.bands[idx];
  const detail = host.querySelector('#band-detail');
  if (!detail || !b) return;
  const tot = Object.values(b.byClass).reduce((s, n) => s + n, 0) || 1;
  void entities().then((e) => {
    detail.innerHTML = panel(`${esc(b.name)} — ${freq(b.lo)} to ${b.hi ? freq(b.hi) : '—'}`,
      esc(b.use),
      `<div class="stat-row">
         <div class="stat"><div class="stat-value">${num(b.rows)}</div><div class="stat-label">device assignments</div></div>
         <div class="stat"><div class="stat-value">${num(b.tx)}</div><div class="stat-label">of those, transmitters</div></div>
         <div class="stat"><div class="stat-value">${num(b.licences)}</div><div class="stat-label">licences</div></div>
         <div class="stat"><div class="stat-value">${num(b.entities)}</div><div class="stat-label">organisations</div></div>
       </div>
       <div class="panel-title" style="font-size:var(--font-size-base)">Who is in it</div>
       <div class="panel-sub" style="margin-bottom:.5rem">The twelve holders with the most registered equipment in this band. Click one for its detail.</div>
       <div class="panel-scroll"><table><thead><tr><th>Organisation</th><th>Kind</th><th class="num">Device rows</th><th class="num">Share of band</th></tr></thead><tbody>
       ${b.topHolders.map(([id, rows]) => {
        const ent = e.rows[id];
        if (!ent) return '';
        return `<tr class="clickable" data-entity="${id}"><td>${esc(ent.name)}</td>
          <td><span class="legend-swatch" style="display:inline-block;background:${classColour(classes, ent.cls)}"></span> ${esc(classLabel(classes, ent.cls))}</td>
          <td class="num">${num(rows)}</td><td class="num">${pct((rows / Math.max(1, b.rows)) * 100)}</td></tr>`;
      }).join('')}
       </tbody></table></div>
       <div class="legend-note">Composition of the band: ${Object.entries(b.byClass).sort((a, c) => c[1] - a[1])
        .map(([cls, n]) => `${esc(classLabel(classes, cls))} ${pct((n / tot) * 100)}`).join(' · ')}</div>`);
    detail.querySelectorAll<HTMLElement>('[data-entity]').forEach((tr) => {
      tr.addEventListener('click', () => openHolder(Number(tr.dataset.entity)));
    });
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}
