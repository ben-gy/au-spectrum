// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Positional tests for the hand-rolled layout maths. Area- or total-only
 * assertions pass on visually broken layouts — a chord whose arcs all start at
 * the same angle still sums to 2π — so these assert positions: no overlap, in
 * bounds, no NaN, and the gaps actually present.
 */

import { describe, expect, it } from 'vitest';
import { chordArcs, polar } from '../src/utils/chord';
import { logPos, freqColour, F_MIN, F_MAX } from '../src/format';

const GAP = 0.014;

describe('chordArcs', () => {
  const values = [3200, 2100, 1400, 980, 640, 410, 260, 130, 40, 12];

  it('produces one arc per value with no NaN anywhere', () => {
    const arcs = chordArcs(values);
    expect(arcs).toHaveLength(values.length);
    for (const a of arcs) {
      expect(Number.isFinite(a.a0)).toBe(true);
      expect(Number.isFinite(a.a1)).toBe(true);
      expect(Number.isFinite(a.mid)).toBe(true);
    }
  });

  it('never lets two arcs overlap', () => {
    const arcs = chordArcs(values);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i].a0).toBeGreaterThanOrEqual(arcs[i - 1].a1);
  });

  it('leaves exactly the requested gap between neighbours', () => {
    const arcs = chordArcs(values, GAP);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i].a0 - arcs[i - 1].a1).toBeCloseTo(GAP, 12);
  });

  it('fits inside one full turn, gaps included', () => {
    const arcs = chordArcs(values, GAP);
    const swept = arcs.reduce((s, a) => s + (a.a1 - a.a0), 0);
    expect(swept + GAP * values.length).toBeCloseTo(Math.PI * 2, 10);
    expect(arcs[arcs.length - 1].a1 - arcs[0].a0).toBeLessThanOrEqual(Math.PI * 2);
  });

  it('sizes each arc in proportion to its value', () => {
    const arcs = chordArcs(values, GAP);
    const span = (i: number): number => arcs[i].a1 - arcs[i].a0;
    expect(span(0) / span(1)).toBeCloseTo(values[0] / values[1], 6);
  });

  it('puts each midpoint inside its own arc', () => {
    for (const a of chordArcs(values)) {
      expect(a.mid).toBeGreaterThanOrEqual(a.a0);
      expect(a.mid).toBeLessThanOrEqual(a.a1);
    }
  });

  it('degrades safely on all-zero input instead of dividing by zero', () => {
    const arcs = chordArcs([0, 0, 0]);
    for (const a of arcs) expect(Number.isFinite(a.a0) && a.a0 === a.a1).toBe(true);
  });

  it('handles a single arc and an empty set', () => {
    expect(chordArcs([5])).toHaveLength(1);
    expect(chordArcs([])).toEqual([]);
  });
});

describe('polar', () => {
  it('keeps every point on the circle it was given', () => {
    for (const a of chordArcs([1, 2, 3])) {
      const [x, y] = polar(300, 300, a.mid, 200);
      expect(Math.hypot(x - 300, y - 300)).toBeCloseTo(200, 9);
    }
  });
});

describe('the shared log-frequency axis', () => {
  it('runs 0 to 1 across the whole radio spectrum', () => {
    expect(logPos(F_MIN)).toBeCloseTo(0, 12);
    expect(logPos(F_MAX)).toBeCloseTo(1, 12);
  });

  it('is monotonic, so a higher frequency is always further right', () => {
    let last = -Infinity;
    for (const hz of [1e4, 1e5, 5e6, 1e8, 4.5e8, 3.5e9, 1.1e10, 2.6e10, 3e11]) {
      const p = logPos(hz);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
  });

  it('gives a decade the same width wherever it sits', () => {
    const a = logPos(1e6) - logPos(1e5);
    const b = logPos(1e10) - logPos(1e9);
    expect(a).toBeCloseTo(b, 12);
  });

  it('returns a real colour at both ends and in the middle', () => {
    for (const t of [0, 0.37, 1]) expect(freqColour(t)).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('clamps out-of-range positions instead of producing NaN channels', () => {
    for (const t of [-3, 4]) expect(freqColour(t)).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });
});
