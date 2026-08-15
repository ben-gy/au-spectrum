// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { esc } from '../format';

/** Every view opens the same way: a title, the question it answers, the finding. */
export function head(title: string, question: string, standfirst: string): string {
  return `<div class="view-head">
    <h1>${title}</h1>
    <p class="view-question">${question}</p>
    <p class="standfirst">${standfirst}</p>
  </div>`;
}

export function panel(title: string, sub: string, body: string, extraClass = ''): string {
  return `<section class="panel ${extraClass}">
    <div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-sub">${sub}</div></div></div>
    ${body}
  </section>`;
}

export function stats(items: { value: string; label: string }[]): string {
  return `<div class="stat-row">${items.map((s) => `<div class="stat">
    <div class="stat-value">${s.value}</div><div class="stat-label">${esc(s.label)}</div></div>`).join('')}</div>`;
}

export function legend(items: { colour: string; label: string; id?: string }[], note = ''): string {
  return `<div class="legend">${items.map((i) => `<span class="legend-item"${i.id ? ` data-legend="${esc(i.id)}"` : ''}>
    <span class="legend-swatch" style="background:${i.colour}"></span>${esc(i.label)}</span>`).join('')}</div>
    ${note ? `<div class="legend-note">${note}</div>` : ''}`;
}

/** Nice log-decade ticks between two frequencies. */
export function decades(min: number, max: number): number[] {
  const out: number[] = [];
  for (let d = Math.ceil(Math.log10(min)); d <= Math.floor(Math.log10(max)); d++) out.push(10 ** d);
  return out;
}

export function svgOpen(w: number, h: number, extra = ''): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" ${extra}>`;
}
