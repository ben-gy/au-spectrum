// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, entities, errorPanel, classColour, type ClassDef } from '../data';
import { num, mhz, tipAttr, esc } from '../format';
import { head, panel, stats, svgOpen } from './common';
import { gloss } from '../glossary';
import { openHolder } from './holder-drawer';

interface SpectrumFile {
  bandNames: string[];
  licences: number;
  rows: { market: string; band: number; entity: number; mhz: number; lower: number; upper: number; licences: number }[];
  naive: { entity: number; naive: number; inOneMarket: number; areas: number }[];
}

let market = '';

/**
 * The 398 spectrum licences are a different legal object from the other
 * 163,707, and mixing them into the same chart is the single easiest way to
 * publish a wrong number. An apparatus licence authorises a device at a point
 * and has no "amount of spectrum" at all; a spectrum licence authorises a slab
 * of frequency over an area. So this view is quarantined, and it prints the
 * correction rather than hiding it.
 */
export async function renderExclusive(host: HTMLElement): Promise<void> {
  try {
    const [s, e] = await Promise.all([load<SpectrumFile>('spectrum.json'), entities()]);
    const markets = [...new Set(s.rows.map((r) => r.market))].sort((a, b) => {
      const sum = (m: string): number => s.rows.filter((r) => r.market === m).reduce((t, r) => t + r.mhz, 0);
      return sum(b) - sum(a);
    });
    if (!markets.includes(market)) market = markets[0];
    const worst = s.naive[0];

    host.innerHTML = `
      ${head('Exclusive',
    'Who owns a slab of spectrum over a place — and who is not a phone company?',
    `A ${gloss('spectrum licence', 'spectrum licence')} is the kind auctions sell: a band, over an area, for up to fifteen years. There are only <strong>${num(s.licences)}</strong> in Australia. Counting them naively is the classic mistake: add up every licence <strong>${esc(e.rows[worst.entity]?.name ?? 'the largest holder')}</strong> holds and you get <strong>${num(worst.naive)} MHz</strong>, because the same block licensed over ${worst.areas} separate market areas is counted once per area. What it actually holds in any one place is <strong>${num(worst.inOneMarket)} MHz</strong> — ${(worst.naive / Math.max(1, worst.inOneMarket)).toFixed(0)}× less.`)}

      ${stats([
    { value: '398', label: 'spectrum licences in Australia' },
    { value: num(markets.length), label: 'named market areas' },
    { value: num(new Set(s.rows.map((r) => r.entity)).size), label: 'organisations holding one' },
    { value: '163,707', label: 'ordinary apparatus licences, counted separately' },
  ])}

      ${panel('Megahertz held, in one market at a time',
    `Each column is a band; each segment one licensee. Bands are only comparable within a market — never across markets, because the 26 GHz auction named its areas after cities while the 2 GHz auction's "Sydney" is a thousand-megahertz-wide region with a different name.`,
    `<div class="chip-row" id="market-chips"></div>
     <div id="market-chart" class="panel-scroll" style="max-width:900px"></div>
     <div class="legend-note">Paired (FDD) holdings show their lower and upper blocks summed: a 2×15 MHz assignment is 30 MHz held, and the register's own totals only reconcile if both halves are counted.</div>`)}

      ${panel('The correction, printed rather than hidden',
    'Left: what you get by adding up every licence a holder has. Right: the most they hold in any single market. The gap is the same megahertz counted once per place it is licensed.',
    `<div class="panel-scroll"><table id="naiveTable"><thead><tr>
      <th>Holder</th><th class="num">Naive sum across markets</th><th class="num">Actually held in one market</th><th class="num">Overstatement</th>
    </tr></thead><tbody></tbody></table></div>`)}

      ${panel('Every named market',
    'Total megahertz licensed exclusively in each area, and who holds most of it.',
    `<div class="panel-scroll"><table id="marketTable"><thead><tr><th>Market</th><th class="num">MHz licensed</th><th class="num">Holders</th><th>Largest</th></tr></thead><tbody></tbody></table></div>`)}
    `;

    renderMarketChips(host, s, markets, e.classes, e.rows);
    drawMarket(host, s, e.classes, e.rows);

    const nb = host.querySelector('#naiveTable tbody')!;
    nb.innerHTML = s.naive.map((n) => {
      const ent = e.rows[n.entity];
      return `<tr class="clickable" data-entity="${n.entity}"><td>${esc(ent?.name ?? '—')}</td>
        <td class="num">${num(n.naive)} MHz</td><td class="num">${num(n.inOneMarket)} MHz</td>
        <td class="num">${n.inOneMarket ? `${(n.naive / n.inOneMarket).toFixed(1)}×` : '—'}</td></tr>`;
    }).join('');
    nb.querySelectorAll<HTMLElement>('[data-entity]').forEach((tr) => tr.addEventListener('click', () => openHolder(Number(tr.dataset.entity))));

    const mb = host.querySelector('#marketTable tbody')!;
    mb.innerHTML = markets.map((mk) => {
      const rows = s.rows.filter((r) => r.market === mk);
      const total = rows.reduce((t, r) => t + r.mhz, 0);
      const byEnt = new Map<number, number>();
      for (const r of rows) byEnt.set(r.entity, (byEnt.get(r.entity) ?? 0) + r.mhz);
      const top = [...byEnt.entries()].sort((a, b) => b[1] - a[1])[0];
      return `<tr class="clickable" data-market="${esc(mk)}"><td>${esc(mk)}</td>
        <td class="num">${mhz(total)}</td><td class="num">${byEnt.size}</td>
        <td>${esc(e.rows[top[0]]?.name ?? '—')} <span class="note-inline">${mhz(top[1])}</span></td></tr>`;
    }).join('');
    mb.querySelectorAll<HTMLElement>('[data-market]').forEach((tr) => {
      tr.addEventListener('click', () => {
        market = tr.dataset.market!;
        renderMarketChips(host, s, markets, e.classes, e.rows);
        drawMarket(host, s, e.classes, e.rows);
        host.querySelector('#market-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  } catch (err) {
    errorPanel(host, err, () => renderExclusive(host));
  }
}

function renderMarketChips(host: HTMLElement, s: SpectrumFile, markets: string[], classes: ClassDef[], ents: { i: number; name: string; cls: string }[]): void {
  const row = host.querySelector('#market-chips');
  if (!row) return;
  row.innerHTML = markets.slice(0, 18).map((m) => `<button class="chip" data-m="${esc(m)}" aria-pressed="${m === market}">${esc(m)}</button>`).join('');
  row.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      market = c.dataset.m!;
      renderMarketChips(host, s, markets, classes, ents);
      drawMarket(host, s, classes, ents);
    });
  });
}

function drawMarket(host: HTMLElement, s: SpectrumFile, classes: ClassDef[], ents: { i: number; name: string; cls: string }[]): void {
  const el = host.querySelector('#market-chart');
  if (!el) return;
  const rows = s.rows.filter((r) => r.market === market);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">No spectrum licence names this market.</div>'; return; }

  const bands = [...new Set(rows.map((r) => r.band))].sort((a, b) => a - b);
  const w = Math.max(620, 100 + bands.length * 110);
  const h = 420;
  const padB = 74;
  const padT = 24;
  const colW = 78;
  const totals = bands.map((b) => rows.filter((r) => r.band === b).reduce((t, r) => t + r.mhz, 0));

  // Equal-height columns showing each band's SHARE, with the absolute megahertz
  // printed underneath. Sizing the columns by absolute MHz instead makes 26 GHz
  // — 2,400 MHz of millimetre wave that reaches a city block — fifty-seven times
  // taller than the 42 MHz of 850 MHz spectrum that reaches a horizon, and
  // renders every low band as an unreadable sliver. That is the same
  // compression the US allocation chart is criticised for, and the low bands are
  // where the interesting holdings are.
  let svg = svgOpen(w, h);
  bands.forEach((b, i) => {
    const x = 70 + i * 110;
    const items = rows.filter((r) => r.band === b).sort((a, c) => c.mhz - a.mhz);
    const colTotal = totals[i] || 1;
    let acc = 0;
    for (const it of items) {
      const hh = (it.mhz / colTotal) * (h - padT - padB);
      const y = h - padB - acc - hh;
      const ent = ents[it.entity];
      svg += `<rect class="mark" data-entity="${it.entity}" x="${x}" y="${y.toFixed(1)}" width="${colW}" height="${Math.max(1, hh).toFixed(1)}"
        fill="${classColour(classes, ent?.cls ?? 'UNCLASSIFIED')}" fill-opacity="0.85" stroke="var(--bg-surface)" stroke-width="0.5" style="cursor:pointer"
        data-tip="${tipAttr(`${ent?.name ?? '—'}\n${s.bandNames[it.band]} in ${market}\n${mhz(it.mhz)} held = ${((it.mhz / colTotal) * 100).toFixed(1)}% of the band here${it.upper ? `\nlower ${mhz(it.lower)} + upper ${mhz(it.upper)} (paired)` : ' (unpaired)'}\n${it.licences} licence${it.licences === 1 ? '' : 's'}`)}"/>`;
      if (hh > 15 && ent) {
        svg += `<text x="${x + 4}" y="${(y + 12).toFixed(1)}" font-size="9" fill="#04211f" style="pointer-events:none">${esc(ent.name.slice(0, 13))}</text>`;
      }
      acc += hh;
    }
    svg += `<text class="mono" x="${x + colW / 2}" y="${h - padB + 14}" text-anchor="middle" font-size="10">${mhz(totals[i])}</text>`;
    svg += `<text x="${x + colW / 2}" y="${h - padB + 30}" text-anchor="middle" font-size="9">${esc(s.bandNames[b] ?? '?')}</text>`;
  });
  svg += `<line class="axis" x1="60" y1="${h - padB}" x2="${w - 10}" y2="${h - padB}"/>`;
  svg += `<text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="10">columns show each band's split; the figure is the MHz held in ${esc(market)}</text></svg>`;
  el.innerHTML = svg;
  el.querySelectorAll<SVGRectElement>('[data-entity]').forEach((r) => {
    r.addEventListener('click', () => openHolder(Number(r.dataset.entity)));
  });
}
