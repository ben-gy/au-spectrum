// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, errorPanel } from '../data';
import { num, pct, tipAttr, esc, compact } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { gloss } from '../glossary';

interface HealthFile {
  snapshot: string;
  bars: { label: string; n: number; of: number; note: string }[];
  expiry: Record<string, number>;
  issued: Record<string, number>;
  authApparatus: Record<string, number>;
  authSpectrum: Record<string, number>;
  totals: Record<string, number>;
}

/**
 * A view about the register's own limits, which most tools built on it don't
 * have. It exists because every other view on this site is only trustworthy to
 * the extent the reader knows what the underlying file cannot say.
 */
export async function renderLimits(host: HTMLElement): Promise<void> {
  try {
    const h = await load<HealthFile>('health.json');
    const expiryYears = Object.entries(h.expiry).filter(([y]) => /^\d{4}$/.test(y)).sort();
    const next = expiryYears.find(([y]) => Number(y) === new Date().getFullYear() + 1);

    host.innerHTML = `
      ${head('Limits',
    'How much of this register is usable, what is structurally invisible, and what does its future look like?',
    `<strong>${pct((h.bars[0].n / h.bars[0].of) * 100)}</strong> of the register's site records have no equipment on them at all, and <strong>${pct((h.bars[2].n / h.bars[2].of) * 100)}</strong> of its device rows belong to just 398 licences. Neither fact is visible from a licence lookup, and both change what every number here means.`)}

      ${stats([
    { value: num(h.totals.licences), label: 'licences in the snapshot' },
    { value: num(h.totals.granted), label: 'of those, granted and current' },
    { value: num(h.totals.deviceRows), label: 'device assignments' },
    { value: num(h.totals.txRowsGranted), label: 'that are actually transmitters' },
  ])}

      ${panel('What the file cannot tell you',
    'Each bar prints its own numerator and denominator, because a percentage without them is a claim rather than a measurement.',
    `<div id="bars"></div>`)}

      <div class="grid-2">
        ${panel('The register turns over almost completely each year',
    `${gloss('apparatus licence', 'Apparatus licences')} are annual. This is the only honest time axis in the file, because expiry dates are forward-looking and are not rewritten by renewal.`,
    '<div id="expiry"></div>')}
        ${panel('And this is why there is no history here',
    'The same chart drawn on issue dates. It is not a discovery about radio; it is renewal paperwork. Struck through, because it should never be read as a trend.',
    '<div id="issued"></div>')}
      </div>

      ${panel('One real time axis, and its confound',
    `Device assignments keep the date they were first authorised, even through licence renewal — so the register does hold a genuine ${gloss('apparatus vintage', 'vintage curve')}, back to 1959. But 78% of device rows belong to spectrum licences that carriers re-lodge in bulk, so the two populations are drawn separately and never summed.`,
    `<div id="vintage"></div>
     <div class="legend-note">Both curves are survivorship: they show assignments still authorised today, not everything ever authorised. A 1962 assignment on this chart is a link that has been continuously licensed for sixty-four years.</div>`)}
    `;

    drawBars(host, h);
    drawYears(host, '#expiry', h.expiry, 'var(--accent-primary)', false,
      next ? `${num(next[1])} licences expire in ${next[0]} alone` : '');
    drawYears(host, '#issued', h.issued, 'var(--status-bad)', true, 'renewal rewrites this column every year');
    drawVintage(host, h);
  } catch (err) {
    errorPanel(host, err, () => renderLimits(host));
  }
}

function drawBars(host: HTMLElement, h: HealthFile): void {
  const el = host.querySelector('#bars');
  if (!el) return;
  el.innerHTML = h.bars.map((b) => {
    const share = (b.n / b.of) * 100;
    return `<div style="margin-bottom:var(--space-lg)">
      <div style="display:flex;justify-content:space-between;gap:var(--space-md);align-items:baseline;flex-wrap:wrap">
        <span>${esc(b.label)}</span>
        <span class="mono" style="font-size:var(--font-size-sm)">${num(b.n)} / ${num(b.of)} · ${pct(share)}</span>
      </div>
      <span style="display:block;height:14px;background:var(--bg-elevated);border-radius:3px;overflow:hidden;margin:4px 0"
        data-tip="${tipAttr(`${b.label}\n${num(b.n)} of ${num(b.of)} = ${pct(share)}`)}">
        <span style="display:block;height:100%;width:${share.toFixed(1)}%;background:${share > 50 ? 'var(--status-warn)' : 'var(--accent-primary)'}"></span>
      </span>
      <div class="note-inline">${esc(b.note)}</div>
    </div>`;
  }).join('')
    + `<div style="margin-top:var(--space-lg);padding-top:var(--space-lg);border-top:1px solid var(--border-subtle)">
        <div style="display:flex;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap"><span>Radio that runs under a class licence — Wi-Fi, Bluetooth, UHF CB handhelds, individual amateur operators</span>
        <span class="mono">0 records</span></div>
        <div class="note-inline">Not missing data. There is no register of it to be missing, by design.</div>
      </div>
      <div style="margin-top:var(--space-md)">
        <div style="display:flex;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap"><span>Licences whose special conditions can be looked up, using the ACMA's own documented join</span>
        <span class="mono">74 of 164,105</span></div>
        <div class="note-inline">The documented join returns nothing at all: the column named LICENCE_NO in the conditions
          table holds device registration identifiers, and matches 7,344 of them — reaching 0.05% of the register. There is no
          per-licence conditions feature on this site because there cannot be one.</div>
      </div>`;
}

function drawYears(host: HTMLElement, sel: string, data: Record<string, number>, colour: string, struck: boolean, caption: string): void {
  const el = host.querySelector(sel);
  if (!el) return;
  const rows = Object.entries(data).filter(([y]) => /^\d{4}$/.test(y)).sort();
  const never = data.never ?? data.blank ?? 0;
  const w = 460;
  const hgt = 250;
  const padL = 44;
  const padB = 42;
  const padT = 16;
  const padR = 40; // room for the "never" column and its label
  const bw = Math.max(4, ((w - padL - padR) / (rows.length + 1)) - 3);
  const max = Math.max(...rows.map(([, n]) => n));
  let svg = svgOpen(w, hgt, struck ? 'class="struck"' : '');
  rows.forEach(([y, n], i) => {
    const x = padL + i * (bw + 3);
    const bh = (n / max) * (hgt - padT - padB);
    svg += `<rect class="mark" x="${x.toFixed(1)}" y="${(hgt - padB - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"
      fill="${colour}" fill-opacity="0.8" data-tip="${tipAttr(`${y}: ${num(n)} licences`)}"/>`;
    if (i % Math.ceil(rows.length / 7) === 0 || i === rows.length - 1) {
      svg += `<text class="mono" x="${(x + bw / 2).toFixed(1)}" y="${hgt - padB + 14}" text-anchor="middle" font-size="9">${y}</text>`;
    }
  });
  if (never) {
    const x = padL + rows.length * (bw + 3) + 8;
    const bh = (never / max) * (hgt - padT - padB);
    svg += `<rect x="${x.toFixed(1)}" y="${(hgt - padB - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, bh).toFixed(1)}"
      fill="var(--text-muted)" data-tip="${tipAttr(`${num(never)} licences never expire — broadcast and datacasting service licences are perpetual`)}"/>`;
    svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${hgt - padB + 14}" text-anchor="middle" font-size="9">never</text>`;
  }
  svg += `<line class="axis" x1="${padL}" y1="${hgt - padB}" x2="${w - 10}" y2="${hgt - padB}"/>`;
  svg += `<text class="mono" x="${padL - 6}" y="${padT + 8}" text-anchor="end" font-size="9">${compact(max)}</text>`;
  if (struck) {
    svg += `<line class="struck-line" x1="${padL - 4}" y1="${hgt - padB + 4}" x2="${w - 14}" y2="${padT}"/>`;
  }
  svg += `<text x="${padL}" y="${hgt - 8}" font-size="10">${esc(caption)}</text></svg>`;
  el.innerHTML = svg;
}

function drawVintage(host: HTMLElement, h: HealthFile): void {
  const el = host.querySelector('#vintage');
  if (!el) return;
  const years: string[] = [];
  for (let y = 1959; y <= 2026; y++) years.push(String(y));
  const app = years.map((y) => h.authApparatus[y] ?? 0);
  const spec = years.map((y) => h.authSpectrum[y] ?? 0);
  const w = 1120;
  const hgt = 300;
  const padL = 52;
  const padB = 44;
  const padT = 18;
  const inner = w - padL - 20;
  const max = Math.max(...app, ...spec);
  const x = (i: number): number => padL + (i / (years.length - 1)) * inner;
  const y = (v: number): number => hgt - padB - (Math.log10(1 + v) / Math.log10(1 + max)) * (hgt - padT - padB);

  const line = (vals: number[]): string => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  let svg = svgOpen(w, hgt);
  for (let yr = 1960; yr <= 2020; yr += 10) {
    const i = yr - 1959;
    svg += `<line class="gridline" x1="${x(i).toFixed(1)}" y1="${padT}" x2="${x(i).toFixed(1)}" y2="${hgt - padB}"/>`
      + `<text class="mono" x="${x(i).toFixed(1)}" y="${hgt - padB + 15}" text-anchor="middle" font-size="10">${yr}</text>`;
  }
  svg += `<path d="${line(app)}" fill="none" stroke="var(--accent-primary)" stroke-width="2"/>`;
  svg += `<path d="${line(spec)}" fill="none" stroke="var(--accent-secondary)" stroke-width="2" stroke-dasharray="5 3"/>`;
  years.forEach((yr, i) => {
    svg += `<rect class="mark" x="${(x(i) - inner / years.length / 2).toFixed(1)}" y="${padT}" width="${(inner / years.length).toFixed(1)}" height="${hgt - padT - padB}"
      fill="transparent" data-tip="${tipAttr(`${yr}\napparatus licences: ${num(app[i])} assignments still authorised\nspectrum licences: ${num(spec[i])}`)}"/>`;
  });
  svg += `<line class="axis" x1="${padL}" y1="${hgt - padB}" x2="${w - 20}" y2="${hgt - padB}"/>`;
  svg += `<text class="mono" x="${padL - 6}" y="${padT + 8}" text-anchor="end" font-size="9">${compact(max)}</text>`;
  svg += `<text class="mono" x="${padL - 6}" y="${hgt - padB}" text-anchor="end" font-size="9">1</text>`;
  svg += `<text x="${padL + 8}" y="${padT + 12}" font-size="10" fill="var(--accent-primary)">apparatus licences — the real vintage curve, back to 1959</text>`;
  svg += `<text x="${padL + 8}" y="${padT + 28}" font-size="10" fill="var(--accent-secondary)">spectrum licences — carrier bulk re-lodgement, not deployment</text>`;
  svg += `<text x="${w / 2}" y="${hgt - 8}" text-anchor="middle" font-size="10">device assignments still authorised today, by the year they were first authorised (log scale)</text></svg>`;
  el.innerHTML = svg;
}
