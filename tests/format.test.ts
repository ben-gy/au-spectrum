// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { num, pct, freq, freqTick, mhz, esc, tipAttr, compact } from '../src/format';

// jsdom leaves `import.meta.url` as an http: URL, so readFileSync(new URL(...))
// throws "The URL must be of scheme file". Resolve from the project root, which
// vitest sets as the working directory.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

describe('freq', () => {
  it('prints in the unit an RF reader would use for that part of the spectrum', () => {
    expect(freq(477437500)).toBe('477.4375 MHz');
    expect(freq(3.575e9)).toBe('3.575 GHz');
    expect(freq(774000)).toBe('774 kHz');
    expect(freq(16975)).toBe('16.975 kHz');
    expect(freq(500)).toBe('500 Hz');
  });

  it('does not round two channels 12.5 kHz apart into the same string', () => {
    expect(freq(477437500)).not.toBe(freq(477450000));
  });

  it('trims trailing zeros rather than implying precision it does not have', () => {
    expect(freq(478e6)).toBe('478 MHz');
    expect(freq(478.5e6)).toBe('478.5 MHz');
  });

  it('refuses to invent a value for a missing frequency', () => {
    expect(freq(NaN)).toBe('—');
    expect(freq(0)).toBe('—');
    expect(freq(-1)).toBe('—');
  });
});

describe('number formatting', () => {
  it('groups thousands', () => {
    expect(num(2149290)).toBe('2,149,290');
    expect(num(0)).toBe('0');
    expect(num(-1234)).toBe('-1,234');
  });
  it('marks a missing number rather than printing NaN', () => {
    expect(num(NaN)).toBe('—');
    expect(pct(NaN)).toBe('—');
  });
  it('prints percentages to one place by default', () => {
    expect(pct(30.4123)).toBe('30.4%');
    expect(pct(30.4123, 0)).toBe('30%');
  });
  it('compacts axis labels', () => {
    expect(compact(950)).toBe('950');
    expect(compact(2400)).toBe('2.4k');
    expect(compact(2149290)).toBe('2.1M');
    expect(compact(21492900)).toBe('21M');
  });
  it('prints megahertz with the unit attached', () => {
    expect(mhz(490)).toBe('490 MHz');
    expect(mhz(311.32)).toBe('311.32 MHz');
  });
  it('labels a decade tick in its own unit', () => {
    expect(freqTick(1e6)).toBe('1 MHz');
    expect(freqTick(1e10)).toBe('10 GHz');
  });
});

describe('escaping', () => {
  it('escapes HTML in a licensee name', () => {
    expect(esc('Smith & Sons <Pty> "Ltd"')).toBe('Smith &amp; Sons &lt;Pty&gt; &quot;Ltd&quot;');
  });

  it('uses entity newlines for an attribute and raw ones for text', () => {
    // setAttribute takes a raw \n; an attribute written into an HTML string
    // needs &#10; or the tooltip renders one long line — and using the wrong
    // one the other way prints a literal "&#10;" to the reader.
    expect(tipAttr('a\nb')).toBe('a&#10;b');
    expect(esc('a\nb')).toBe('a\nb');
  });
});

describe('the stylesheet contracts that are invisible in jsdom', () => {
  // Comments are stripped first: several of them quote the very anti-patterns
  // these rules exist to forbid, and a naive scan matches the warning instead
  // of the code.
  const css = read('src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('ships the [hidden] guard', () => {
    // Without it, an element hidden with the attribute but given a display by a
    // class renders from first paint and cannot be dismissed by any handler.
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('ships both halves of the hover tooltip rule', () => {
    // .hover-tip without .hover-tip.visible paints the tooltip on first hover
    // and never hides it again, and no handler test can see that.
    expect(css).toMatch(/\.hover-tip\s*\{/);
    expect(css).toMatch(/\.hover-tip\.visible\s*\{[^}]*opacity:\s*1/);
  });

  it('isolates the map so Leaflet panes cannot paint over a modal', () => {
    expect(css).toMatch(/\.map-wrap\s*\{[^}]*isolation:\s*isolate/);
    expect(css).toMatch(/\.modal\s*\{[^}]*z-index:\s*2100/);
  });

  it('uses overflow clip, not hidden, on the body', () => {
    // overflow-x: hidden silently kills position: sticky on the header.
    expect(css).toMatch(/overflow-x:\s*clip/);
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it('keeps the footer at the bottom on a short page', () => {
    expect(css).toMatch(/#app\s*\{[^}]*min-height:\s*100vh/);
    expect(css).toMatch(/\.main-content\s*\{[^}]*flex:\s*1 0 auto/);
  });
});

describe('the licence conditions that bind the interface', () => {
  const files = ['src/main.ts', 'src/views/method.ts'].map(read);
  const all = files.join('\n');

  it('carries the ACMA attribution string verbatim', () => {
    expect(all).toContain('Based on Australian Communications and Media Authority information');
  });

  it('says it is not endorsed by the ACMA', () => {
    expect(all).toMatch(/[Nn]ot endorsed by the ACMA/);
  });

  it('never describes the register as open or Creative Commons', () => {
    // The ACMA reserves its rights; the register is licensed, not open. Every
    // mention of a CC licence must therefore be either the ABS boundary credit
    // or an explicit denial that the register is one.
    const prose = all.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const mentions = [...prose.matchAll(/.{0,40}(Creative Commons|CC BY).{0,40}/g)].map((m) => m[0]);
    expect(mentions.length).toBeGreaterThan(0);
    for (const m of mentions) {
      expect(m).toMatch(/Bureau of Statistics|ABS|CC BY 4\.0|not\s+Creative Commons/);
    }
  });
});
