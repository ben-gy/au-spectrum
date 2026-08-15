// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Arc geometry for the co-tenancy chord. Pure, so the layout can be tested for
 * the failures that are invisible in a screenshot: arcs that overlap each other,
 * arcs that run past the circle, and a total sweep that quietly exceeds 2π once
 * the inter-arc gaps are added in.
 */
export interface Arc { a0: number; a1: number; mid: number }

/**
 * @param values one weight per arc, in draw order
 * @param gap radians of empty space between arcs
 * @param start angle of the first arc (default: twelve o'clock)
 */
export function chordArcs(values: number[], gap = 0.014, start = -Math.PI / 2): Arc[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => ({ a0: start, a1: start, mid: start }));
  const usable = Math.PI * 2 - gap * values.length;
  let acc = start;
  return values.map((v) => {
    const span = (v / total) * usable;
    const arc = { a0: acc, a1: acc + span, mid: acc + span / 2 };
    acc += span + gap;
    return arc;
  });
}

export function polar(cx: number, cy: number, angle: number, radius: number): [number, number] {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}
