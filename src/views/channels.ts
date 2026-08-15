// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, errorPanel } from '../data';
import { num, freq, freqTick, tipAttr, esc, freqColour, mhz } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { gloss } from '../glossary';

interface FreqFile { rows: [number, number, number, number][] }
interface DuplexFile {
  rows: [number, number][];
  pairedGroups: number;
  fixedGroups: number;
  pairs: [number, number, number][];
}

let comb: [number, number] = [1e4, 3e11];

/**
 * Australia does not transmit on a smooth continuum of frequencies. It
 * transmits on a raster — 20,003 exact assignable frequencies, laid out by band
 * plans on 12.5 kHz, 25 kHz and 28 MHz rasters. A histogram smears that away.
 * A needle per distinct frequency shows it as literal teeth.
 */
export async function renderChannels(host: HTMLElement): Promise<void> {
  try {
    const [f, d] = await Promise.all([load<FreqFile>('freq.json'), load<DuplexFile>('duplex.json')]);
    const top = d.rows[0];
    const busiest = f.rows.slice().sort((a, b) => b[1] - a[1])[0];

    host.innerHTML = `
      ${head('Channels',
    'What exact frequencies is Australia actually on — and why do links come in pairs?',
    `Every ${gloss('fixed service', 'microwave link')} in the country has a partner frequency a fixed distance away. There are <strong>${num(d.rows.length)}</strong> such gaps in the whole register, and one of them — <strong>${mhz(top[0])}</strong>, the 11 GHz plan — accounts for <strong>${num(top[1])}</strong> links on its own.`)}

      ${stats([
    { value: num(f.rows.length), label: 'distinct exact frequencies in use' },
    { value: freq(busiest[0]), label: 'the single busiest frequency' },
    { value: num(busiest[1]), label: 'assignments on it' },
    { value: num(d.rows.length), label: 'distinct duplex spacings' },
    { value: num(d.pairedGroups), label: 'paired fixed links' },
  ])}

      ${panel('The raster',
    'One needle per distinct assigned frequency; height is how many licences use it, on a log scale. Zoom into a microwave band and the band plan appears as literal teeth — evenly spaced channels with empty space between them. Zoom into land mobile and the teeth merge into a comb 12.5 kHz fine.',
    `<div class="chip-row" id="comb-chips"></div><div id="comb" class="panel-scroll"></div>
     <div class="legend-note">Colour is frequency, the same ramp used on every view. Frequencies are printed to the hertz because the register assigns to the hertz — two channels 12.5 kHz apart must not read the same.</div>`)}

      ${panel('Why links come in pairs',
    `A two-way microwave link transmits on one frequency and listens on another, a fixed ${gloss('duplex spacing', 'duplex spacing')} away. Each arc joins a transmit frequency to its partner; thickness is how many links use that pairing. The whole national backhaul network runs on a few dozen standard gaps.`,
    `<div id="arcs" class="panel-scroll"></div>`)}

      ${panel('The standard gaps',
    'Every duplex spacing in the register, by how many paired links use it. Derived by grouping fixed-service devices by licence and site, sorting the transmit and receive frequencies, and pairing them in order — so the counts are ours, not the ACMA\'s.',
    `<div class="panel-scroll"><table id="dupTable"><thead><tr><th class="num">Spacing</th><th class="num">Paired links</th><th>Share</th></tr></thead><tbody></tbody></table></div>`)}
    `;

    renderCombChips(host, f);
    drawComb(host, f);
    drawArcs(host, d);
    const tbody = host.querySelector('#dupTable tbody')!;
    const max = d.rows[0][1];
    tbody.innerHTML = d.rows.slice(0, 40).map(([sp, n]) => `<tr>
      <td class="num">${mhz(sp)}</td><td class="num">${num(n)}</td>
      <td><span style="display:block;height:10px;width:${((n / max) * 100).toFixed(1)}%;background:var(--accent-primary);border-radius:2px"
        data-tip="${tipAttr(`${mhz(sp)} spacing\n${num(n)} paired links`)}"></span></td></tr>`).join('');
  } catch (err) {
    errorPanel(host, err, () => renderChannels(host));
  }
}

const COMB_RANGES: [string, number, number][] = [
  ['All radio', 1e4, 3e11],
  ['HF 3–30 MHz', 3e6, 30e6],
  ['VHF 137–174', 1.37e8, 1.74e8],
  ['UHF 400–430', 4e8, 4.3e8],
  ['UHF 450–520', 4.5e8, 5.2e8],
  ['11 GHz', 1.07e10, 1.17e10],
  ['18 GHz', 1.77e10, 1.97e10],
  ['23 GHz', 2.12e10, 2.36e10],
];

function renderCombChips(host: HTMLElement, f: FreqFile): void {
  const row = host.querySelector('#comb-chips')!;
  row.innerHTML = COMB_RANGES.map(([label, lo, hi]) => `<button class="chip" data-lo="${lo}" data-hi="${hi}"
    aria-pressed="${comb[0] === lo && comb[1] === hi}">${esc(label)}</button>`).join('');
  row.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      comb = [Number(c.dataset.lo), Number(c.dataset.hi)];
      renderCombChips(host, f);
      drawComb(host, f);
    });
  });
}

function drawComb(host: HTMLElement, f: FreqFile): void {
  const el = host.querySelector('#comb');
  if (!el) return;
  const w = 1120;
  const h = 260;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 40;
  const [d0, d1] = comb;
  const inner = w - padL - padR;
  const rows = f.rows.filter(([hz]) => hz >= d0 && hz <= d1);
  const useLog = d1 / d0 > 12;
  const x = (hz: number): number => padL + (useLog
    ? (Math.log10(hz) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0))
    : (hz - d0) / (d1 - d0)) * inner;
  const maxLic = Math.max(1, ...rows.map((r) => r[3]));
  const y = (v: number): number => (h - padB) - (Math.log10(1 + v) / Math.log10(1 + maxLic)) * (h - padT - padB);

  let svg = svgOpen(w, h);
  const ticks = useLog
    ? Array.from({ length: 12 }, (_, i) => 10 ** (Math.ceil(Math.log10(d0)) + i)).filter((v) => v <= d1)
    : Array.from({ length: 9 }, (_, i) => d0 + ((d1 - d0) * i) / 8);
  for (const t of ticks) {
    svg += `<line class="gridline" x1="${x(t).toFixed(1)}" y1="${padT}" x2="${x(t).toFixed(1)}" y2="${h - padB}"/>`
      + `<text class="mono" x="${x(t).toFixed(1)}" y="${h - padB + 16}" text-anchor="middle" font-size="10">${useLog ? freqTick(t) : freq(t)}</text>`;
  }
  const step = Math.max(1, Math.floor(rows.length / 4000)); // never draw more needles than pixels
  for (let i = 0; i < rows.length; i += step) {
    const [hz, devRows, tx, lic] = rows[i];
    const px = x(hz);
    const t = (Math.log10(hz) - 4) / (Math.log10(3e11) - 4);
    svg += `<line class="mark" x1="${px.toFixed(2)}" y1="${(h - padB).toFixed(1)}" x2="${px.toFixed(2)}" y2="${y(lic).toFixed(1)}"
      stroke="${freqColour(t)}" stroke-width="1.1" stroke-opacity="0.85"
      data-tip="${tipAttr(`${freq(hz)}\n${num(lic)} licences\n${num(devRows)} device rows (${num(tx)} transmitters)`)}"/>`;
  }
  svg += `<line class="axis" x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}"/>`;
  svg += `<text class="mono" x="${padL - 6}" y="${padT + 10}" text-anchor="end" font-size="9">${num(maxLic)}</text>`;
  svg += `<text x="${padL - 6}" y="${h - padB}" text-anchor="end" font-size="9">1</text>`;
  svg += `<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="10">${rows.length === f.rows.length ? 'every assigned frequency in Australia' : `${num(rows.length)} distinct frequencies in this range`}${step > 1 ? ` · every ${step}${step === 2 ? 'nd' : 'th'} needle drawn at this zoom` : ''}</text>`;
  svg += '</svg>';
  el.innerHTML = svg;
}

/**
 * Real pairs, not representative ones. Every arc below joins two frequencies
 * that a licensed link actually uses together — the pipeline emits the 900
 * commonest (lower, upper) pairs rather than a spacing alone, because drawing a
 * gap from an invented starting frequency would be a fabricated picture of a
 * real structure.
 *
 * The x axis is linear across the microwave bands where duplex pairing lives.
 * A log axis compresses a 490 MHz gap at 11 GHz into two pixels, which is why
 * the first attempt at this chart looked like a row of spikes.
 */
function drawArcs(host: HTMLElement, d: DuplexFile): void {
  const el = host.querySelector('#arcs');
  if (!el) return;
  const w = 1120;
  const h = 250;
  const padL = 46;
  const padR = 14;
  const base = h - 46;
  const inner = w - padL - padR;
  const pairs = d.pairs.filter(([lo, hi]) => lo >= 5000 && hi <= 24000);
  const d0 = 5000; // MHz
  const d1 = 24000;
  const x = (m: number): number => padL + ((m - d0) / (d1 - d0)) * inner;
  const maxN = Math.max(...pairs.map((p) => p[2]));

  let svg = svgOpen(w, h);
  for (let g = 6000; g <= 24000; g += 2000) {
    svg += `<line class="gridline" x1="${x(g).toFixed(1)}" y1="20" x2="${x(g).toFixed(1)}" y2="${base}"/>`
      + `<text class="mono" x="${x(g).toFixed(1)}" y="${base + 16}" text-anchor="middle" font-size="10">${g / 1000} GHz</text>`;
  }
  for (const [lo, hi, n] of pairs.slice().sort((a, b) => a[2] - b[2])) {
    const x0 = x(lo);
    const x1 = x(hi);
    const lift = Math.min(base - 24, 16 + Math.log10(1 + n) * 30);
    svg += `<path class="mark" d="M${x0.toFixed(1)},${base} C${x0.toFixed(1)},${(base - lift).toFixed(1)} ${x1.toFixed(1)},${(base - lift).toFixed(1)} ${x1.toFixed(1)},${base}"
      fill="none" stroke="var(--accent-primary)" stroke-opacity="${(0.16 + 0.7 * (n / maxN)).toFixed(2)}"
      stroke-width="${(0.6 + 3.4 * (n / maxN)).toFixed(2)}"
      data-tip="${tipAttr(`transmit ${freq(lo * 1e6)} · receive ${freq(hi * 1e6)}\n${mhz(Math.round((hi - lo) * 1000) / 1000)} apart\n${num(n)} licensed links use this exact pair`)}"/>`;
  }
  svg += `<line class="axis" x1="${padL}" y1="${base}" x2="${w - padR}" y2="${base}"/>`;
  svg += `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="10">the ${num(pairs.length)} commonest transmit/receive pairs between 5 and 24 GHz — arc height and thickness grow with the number of links</text></svg>`;
  el.innerHTML = svg;
  void freqTick;
}
