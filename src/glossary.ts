// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Assume the reader knows nothing about radio licensing. Every piece of jargon
 * the interface uses is defined here and marked up with `data-term`, which the
 * click handler below turns into a popover.
 */
export const GLOSSARY: Record<string, string> = {
  'apparatus licence': 'A licence to operate specific radio equipment at a specific place on a specific frequency. It is the ordinary kind: 163,707 of the register\'s 164,105 licences are apparatus licences.',
  'spectrum licence': 'A licence to use a slice of frequency across a whole geographic area, however you like, for up to fifteen years. There are only 398 of them in Australia, and they are what the big auctions sell.',
  'class licence': 'A standing permission that covers everybody at once — Wi-Fi, Bluetooth, CB handhelds and individual amateur operators all run under one. Nobody is registered, so none of it appears anywhere in this data.',
  'device': 'One registered transmit or receive assignment: a frequency, at a site, on a licence. It is a piece of paperwork, not a piece of equipment — a three-sector mobile site registers the same assignment three times, and about half of all rows are receivers.',
  'site': 'A coordinate in the register\'s catalogue of places. Not a tower: several site records can share one structure, and 43% of them have no device on them at all.',
  'licensee': 'The organisation or person the licence is issued to. The register identifies them by a client number, and one organisation often holds several.',
  'entity': 'Our merge of the register\'s client numbers into organisations, by matching normalised names and checksum-valid ABNs. The merge is ours, not the ACMA\'s.',
  'land mobile': 'Two-way radio for vehicles and handhelds — police, fire, taxis, mines, farms. The largest single category of licence in Australia.',
  'fixed service': 'Point-to-point microwave links: a dish on one tower talking to a dish on another. This is how the phone network gets between towers.',
  'duplex spacing': 'The fixed gap between the transmit and receive frequency of a two-way link. Band plans standardise it, so a handful of spacings cover almost every link in the country.',
  'EIRP': 'Effective isotropic radiated power — transmitter power multiplied by antenna gain. A big dish makes a small transmitter look enormous, so EIRP only compares like with like.',
  'emission designator': 'An ITU code describing the shape of a signal: bandwidth, modulation, and what it carries. 16K0F3E is a 16 kHz FM voice channel.',
  'class of station': 'A code for what kind of station a device is — FB is a base station, ML a land mobile, BC a sound broadcast transmitter. Seven codes used in the data are not in the ACMA\'s own code table.',
  'broadcast service licence': 'The licence to run a broadcasting service — the station itself, as distinct from the transmitter licence that puts it on air.',
  'HCIS': 'The ACMA\'s spatial grid, used to describe the area a spectrum licence covers. Each cell is a four- or five-character code, not a shape.',
  'SA4': 'Statistical Area Level 4 — the ABS geography this site aggregates to. There are 89 covering Australia, each usually 100,000 to 500,000 people.',
  'ERP': 'Estimated resident population, the ABS\'s official population count for a region.',
  'apparatus vintage': 'When a device assignment was first authorised. It survives licence renewal, so it is the only long time axis in the register — but it only shows devices still authorised today, not everything ever licensed.',
};

let pop: HTMLElement | null = null;

/** Wraps a term in the interface so it gets an info affordance and a popover. */
export function gloss(term: string, text?: string): string {
  const label = text ?? term;
  return `<span class="glossary-link" data-term="${term}" role="button" tabindex="0">${label}</span>`;
}

export function initGlossary(): void {
  const hide = (): void => { pop?.remove(); pop = null; };

  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element)?.closest?.('[data-term]') as HTMLElement | null;
    if (!el) { if (pop && !pop.contains(e.target as Node)) hide(); return; }
    const term = el.getAttribute('data-term') ?? '';
    const def = GLOSSARY[term];
    if (!def) return;
    hide();
    pop = document.createElement('div');
    pop.className = 'gloss-pop';
    pop.innerHTML = `<strong>${term}</strong>${def}`;
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    const w = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w.width - 8, r.left))}px`;
    pop.style.top = `${r.bottom + w.height + 8 > window.innerHeight ? Math.max(8, r.top - w.height - 6) : r.bottom + 6}px`;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement)?.hasAttribute?.('data-term')) {
      (e.target as HTMLElement).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      e.preventDefault();
    }
  });
  window.addEventListener('scroll', hide, { passive: true });
}
