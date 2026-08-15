// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, errorPanel } from '../data';
import { num, pct, tipAttr, esc } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { gloss } from '../glossary';

interface BslFile {
  rows: {
    id: string; medium: string; region: string; interest: string; state: string;
    onAir: string; callSign: string; commenced: string | null;
  }[];
}

let filterInterest = '';

const REGION_COLOUR: Record<string, string> = {
  Metropolitan: '#c084fc', Regional: '#4dd4c4', Remote: '#f2b544', Undefined: '#6b7c94', '': '#6b7c94',
};

/**
 * The only genuinely long time axis in the register, and it comes with three
 * caveats that are drawn rather than footnoted: it is a survivorship curve
 * (services still licensed today, not services ever licensed), it covers radio
 * and essentially not television, and the undated majority is shown at equal
 * weight rather than left as a gap.
 */
export async function renderOnAir(host: HTMLElement): Promise<void> {
  try {
    const b = await load<BslFile>('bsl.json');
    const dated = b.rows.filter((r) => r.commenced);
    const radio = dated.filter((r) => r.medium === 'Radio');
    const undated = b.rows.filter((r) => !r.commenced);
    const undatedTv = undated.filter((r) => r.medium === 'TV').length;
    const oldest = radio.slice().sort((a, c) => (a.commenced! < c.commenced! ? -1 : 1)).slice(0, 12);
    const interests = [...new Set(b.rows.map((r) => r.interest).filter(Boolean))]
      .sort((a, c) => b.rows.filter((r) => r.interest === c).length - b.rows.filter((r) => r.interest === a).length);

    host.innerHTML = `
      ${head('On air',
    'Which broadcasting services still licensed today have been licensed the longest?',
    `The oldest ${gloss('broadcast service licence', 'broadcast service licence')} still in force was first issued on <strong>${esc(oldest[0]?.commenced ?? '')}</strong> — ${esc(oldest[0]?.onAir || oldest[0]?.callSign || 'a Sydney radio station')}. But this is a survivorship curve, not a history: it shows only what is still on air, and <strong>${pct((undated.length / b.rows.length) * 100)}</strong> of broadcast service licences carry no commencement date at all.`)}

      ${stats([
    { value: num(b.rows.length), label: 'broadcast service licences' },
    { value: num(dated.length), label: 'with a commencement date' },
    { value: num(radio.length), label: 'of those, radio' },
    { value: num(undatedTv), label: 'undated television licences' },
  ])}

      ${panel('Licensed since',
    'One dot per broadcast service licence that carries a commencement date, placed on the year it was first issued. Colour is the licence area type. The block on the right is every licence with no date — shown at equal weight, because the missing majority is the story.',
    `<div class="chip-row" id="interest-chips"></div><div id="timeline" class="panel-scroll"></div>
     <div class="legend-note">First issued, and survivors only. This is not a chart of stations launched per decade: a service that closed in 1974 left no row, and a licence reissued under a new instrument carries the original date.</div>`)}

      ${panel('The oldest twelve still on air',
    'Every one is commercial radio. Ownership, call signs, frequencies and even bands have changed; the service licence has not lapsed.',
    `<div class="panel-scroll"><table><thead><tr><th>First issued</th><th>On air as</th><th>Call sign</th><th>Area</th><th>State</th></tr></thead><tbody>
      ${oldest.map((r) => `<tr><td class="num">${esc(r.commenced ?? '')}</td><td>${esc(r.onAir || '—')}</td><td class="mono">${esc(r.callSign || '—')}</td><td>${esc(r.region || '—')}</td><td>${esc(r.state || '—')}</td></tr>`).join('')}
    </tbody></table></div>`)}

      ${panel('Who the licences are for',
    'The register records a community-interest category on a minority of licences. Where it does, it is the clearest statement in the whole file of who a service is meant to serve.',
    `<div class="panel-scroll"><table><thead><tr><th>Community interest</th><th class="num">Licences</th><th></th></tr></thead><tbody>
      ${interests.slice(0, 14).map((i) => {
      const n = b.rows.filter((r) => r.interest === i).length;
      const max = b.rows.filter((r) => r.interest === interests[0]).length;
      return `<tr><td>${esc(i)}</td><td class="num">${num(n)}</td>
        <td><span style="display:block;height:10px;width:${((n / max) * 100).toFixed(1)}%;background:var(--accent-primary);border-radius:2px"
          data-tip="${tipAttr(`${i}: ${num(n)} licences`)}"></span></td></tr>`;
    }).join('')}
    </tbody></table>
    <div class="legend-note">${num(b.rows.filter((r) => !r.interest).length)} licences record no community interest at all.</div></div>`)}
    `;

    renderInterestChips(host, b, interests);
    drawTimeline(host, b);
  } catch (err) {
    errorPanel(host, err, () => renderOnAir(host));
  }
}

function renderInterestChips(host: HTMLElement, b: BslFile, interests: string[]): void {
  const row = host.querySelector('#interest-chips');
  if (!row) return;
  const opts = ['', 'Indigenous', 'Torres Strait Islanders', ...interests.filter((i) => i !== 'Indigenous' && i !== 'Torres Strait Islanders').slice(0, 5)];
  row.innerHTML = opts.map((i) => `<button class="chip" data-i="${esc(i)}" aria-pressed="${filterInterest === i}">${i || 'All licences'}</button>`).join('');
  row.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      filterInterest = c.dataset.i ?? '';
      renderInterestChips(host, b, interests);
      drawTimeline(host, b);
    });
  });
}

function drawTimeline(host: HTMLElement, b: BslFile): void {
  const el = host.querySelector('#timeline');
  if (!el) return;
  const rows = b.rows.filter((r) => !filterInterest || r.interest === filterInterest);
  const dated = rows.filter((r) => r.commenced);
  const undated = rows.filter((r) => !r.commenced);
  const w = 1120;
  const h = 330;
  const padL = 46;
  const undatedW = 150;
  const padB = 44;
  const padT = 20;
  const axisW = w - padL - undatedW - 40;
  // Derived, so the axis does not silently clip the newest licences each January.
  const yrs = dated.map((r) => Number(r.commenced!.slice(0, 4))).filter(Number.isFinite);
  const y0 = Math.floor(Math.min(...yrs, 1925) / 10) * 10;
  const y1 = Math.max(...yrs, 2026) + 1;
  const x = (yr: number): number => padL + ((yr - y0) / (y1 - y0)) * axisW;

  let svg = svgOpen(w, h);
  for (let yr = y0; yr <= y1 - 5; yr += 10) {
    svg += `<line class="gridline" x1="${x(yr).toFixed(1)}" y1="${padT}" x2="${x(yr).toFixed(1)}" y2="${h - padB}"/>`
      + `<text class="mono" x="${x(yr).toFixed(1)}" y="${h - padB + 16}" text-anchor="middle" font-size="10">${yr}</text>`;
  }

  // Deterministic vertical placement: stack dots within a year so the density
  // is legible without any animation or randomness between renders.
  const perYear = new Map<number, number>();
  for (const r of dated.slice().sort((a, c) => (a.commenced! < c.commenced! ? -1 : 1))) {
    const yr = Number(r.commenced!.slice(0, 4));
    const k = perYear.get(yr) ?? 0;
    perYear.set(yr, k + 1);
    const cy = h - padB - 6 - (k % 26) * 9.5;
    const colour = REGION_COLOUR[r.region] ?? '#6b7c94';
    svg += `<circle class="mark" cx="${x(yr + 0.5).toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="${colour}" fill-opacity="0.85"
      data-tip="${tipAttr(`${r.onAir || r.callSign || 'unnamed service'}\nfirst issued ${r.commenced}\n${r.medium || '—'} · ${r.region || 'area undefined'}${r.interest ? `\n${r.interest}` : ''}${r.state ? ` · ${r.state}` : ''}`)}"/>`;
  }

  // The undated block, at equal weight.
  const bx = w - undatedW - 8;
  svg += `<rect x="${bx}" y="${padT}" width="${undatedW}" height="${h - padB - padT}" fill="var(--bg-elevated)" stroke="var(--border-default)" stroke-dasharray="4 3"
    data-tip="${tipAttr(`${num(undated.length)} broadcast service licences carry no commencement date\n${num(undated.filter((r) => r.medium === 'TV').length)} of them are television`)}"/>`;
  svg += `<text x="${bx + undatedW / 2}" y="${padT + 30}" text-anchor="middle" font-size="12" fill="var(--text-secondary)">no date recorded</text>`;
  svg += `<text class="mono" x="${bx + undatedW / 2}" y="${padT + 58}" text-anchor="middle" font-size="18" fill="var(--status-warn)">${num(undated.length)}</text>`;
  svg += `<text x="${bx + undatedW / 2}" y="${padT + 78}" text-anchor="middle" font-size="10">${num(undated.filter((r) => r.medium === 'TV').length)} of them television</text>`;

  svg += `<line class="axis" x1="${padL}" y1="${h - padB}" x2="${bx - 12}" y2="${h - padB}"/>`;
  svg += `<text x="${padL}" y="${h - 8}" font-size="10">year the service licence was first issued · ${num(dated.length)} dated licences shown</text>`;
  svg += '</svg>';
  el.innerHTML = svg
    + `<div class="legend">${Object.entries(REGION_COLOUR).filter(([k]) => k).map(([k, c]) => `<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${esc(k === 'Undefined' ? 'area undefined' : k)}</span>`).join('')}</div>`;
}
