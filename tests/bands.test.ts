// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import { BANDS, bandOf, binOf, BIN_COUNT, BINS_PER_DECADE, BIN_MIN_HZ, BIN_MAX_HZ } from '../pipeline/bands.mjs';

describe('the band table', () => {
  it('is contiguous — no gap between one band and the next', () => {
    for (let i = 1; i < BANDS.length; i++) expect(BANDS[i].lo).toBe(BANDS[i - 1].hi);
  });

  it('never overlaps', () => {
    // An overlap files the same device row into two bands. Every share on the
    // site then drifts, and nothing fails.
    for (let i = 0; i < BANDS.length; i++) {
      for (let j = i + 1; j < BANDS.length; j++) {
        const a = BANDS[i];
        const b = BANDS[j];
        expect(Math.max(a.lo, b.lo) < Math.min(a.hi, b.hi)).toBe(false);
      }
    }
  });

  it('covers the whole spectrum from zero upwards', () => {
    expect(BANDS[0].lo).toBe(0);
    expect(BANDS[BANDS.length - 1].hi).toBe(Infinity);
  });

  it('gives every band a name and a plain-English explanation', () => {
    for (const b of BANDS) {
      expect(b.name.length).toBeGreaterThan(2);
      expect(b.use.length).toBeGreaterThan(20);
    }
  });
});

describe('bandOf', () => {
  it('places real assignments in the band an engineer would name', () => {
    const cases: [number, string][] = [
      [477.4375e6, 'UHF 450–520 MHz'],
      [412.5e6, 'UHF 400–430 MHz'],
      [3575e6, '3.5 GHz'],
      [1.8e9, '1800 MHz'],
      [10.955e9, '11 GHz'],
      [96.1e6, 'FM broadcast'],
      [774e3, 'AM broadcast'],
      [5.1815e6, 'HF 3–30 MHz'],
      [438.5e6, 'Amateur 70 cm'],
    ];
    for (const [hz, name] of cases) expect(BANDS[bandOf(hz)].name).toBe(name);
  });

  it('routes the six optical rows to the non-radio bucket', () => {
    expect(BANDS[bandOf(195.3e12)].name).toBe('Outside the radio spectrum');
  });

  it('returns -1 for a missing frequency rather than guessing a band', () => {
    expect(bandOf(NaN)).toBe(-1);
    expect(bandOf(0)).toBe(-1);
  });

  it('puts a boundary frequency in the upper band, not both', () => {
    expect(BANDS[bandOf(450e6)].name).toBe('UHF 450–520 MHz');
    expect(BANDS[bandOf(449.99e6)].name).toBe('Amateur 70 cm');
  });
});

describe('constant-ratio bins', () => {
  it('are the same width on a log axis everywhere', () => {
    const width = (i: number): number => Math.log10(BIN_MIN_HZ * 10 ** ((i + 1) / BINS_PER_DECADE))
      - Math.log10(BIN_MIN_HZ * 10 ** (i / BINS_PER_DECADE));
    const first = width(0);
    for (const i of [1, 50, 120, 170]) expect(width(i)).toBeCloseTo(first, 12);
  });

  it('increase monotonically with frequency', () => {
    let last = -1;
    for (const hz of [2e4, 1e5, 1e6, 1e8, 1e9, 1e10, 1e11]) {
      const b = binOf(hz);
      expect(b).toBeGreaterThan(last);
      last = b;
    }
  });

  it('rejects anything outside the radio axis rather than clamping it', () => {
    expect(binOf(1e3)).toBe(-1);
    expect(binOf(BIN_MAX_HZ)).toBe(-1);
    expect(binOf(195.3e12)).toBe(-1);
    expect(binOf(NaN)).toBe(-1);
  });

  it('keeps every valid bin inside the axis', () => {
    for (const hz of [BIN_MIN_HZ, 4.775e8, 2.9e11]) {
      const b = binOf(hz);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(BIN_COUNT);
    }
  });
});
