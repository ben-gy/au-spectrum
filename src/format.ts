// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/** 1234567 → "1,234,567". */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU');
}

export function pct(n: number, dp = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

/**
 * Frequency, in the unit an RF reader would use for that part of the spectrum
 * and to the precision the register actually carries. 477437500 → "477.4375 MHz".
 * Trailing zeros are trimmed because `477.4000 MHz` reads as false precision,
 * but the value is never rounded — the register assigns to the hertz and two
 * assignments 12.5 kHz apart must not print the same.
 */
export function freq(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const [div, unit, dp] = hz >= 1e9 ? [1e9, 'GHz', 6]
    : hz >= 1e6 ? [1e6, 'MHz', 4]
      : hz >= 1e3 ? [1e3, 'kHz', 4]
        : [1, 'Hz', 0];
  const v = hz / (div as number);
  let s = v.toFixed(dp as number);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return `${s} ${unit}`;
}

/** A short band label for an axis tick: 10k, 1M, 1G. */
export function freqTick(hz: number): string {
  if (hz >= 1e9) return `${hz / 1e9} GHz`;
  if (hz >= 1e6) return `${hz / 1e6} MHz`;
  if (hz >= 1e3) return `${hz / 1e3} kHz`;
  return `${hz} Hz`;
}

/** 0 → "0 MHz"; 22.5 → "22.5 MHz". */
export function mhz(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${(Math.round(v * 100) / 100).toLocaleString('en-AU')} MHz`;
}

/**
 * Escape for innerHTML. Distinct from `tipAttr` below on purpose: HTML text
 * needs entity-escaped newlines, while setAttribute takes raw ones. Using the
 * wrong one renders a literal `&#10;` in the tooltip.
 */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape a tooltip string being written into an HTML attribute string. */
export function tipAttr(s: string): string {
  return esc(s).replace(/\n/g, '&#10;');
}

/** Ordinal-free compact count for axis labels: 1.2k, 3.4M. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}

/** Perceptually-uniform ramp reserved for log frequency, sampled from viridis. */
const VIRIDIS = ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'];

/** @param t 0–1 along the log-frequency axis. */
export function freqColour(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = hexToRgb(VIRIDIS[i]);
  const b = hexToRgb(VIRIDIS[Math.min(VIRIDIS.length - 1, i + 1)]);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

function hexToRgb(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Position on the site's shared log-frequency axis, 10 kHz → 300 GHz. */
export const F_MIN = 1e4;
export const F_MAX = 3e11;
export function logPos(hz: number): number {
  return (Math.log10(hz) - Math.log10(F_MIN)) / (Math.log10(F_MAX) - Math.log10(F_MIN));
}
