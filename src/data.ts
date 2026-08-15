// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

export interface ClassDef { id: string; label: string; hue: string }

export interface Meta {
  attribution: string;
  snapshot: string;
  source: string;
  boundaries: string;
  totals: Record<string, number>;
  headline: {
    largestHolder: string; largestHolderLicences: number;
    top10Share: number; hhi: number; oneLicenceEntities: number;
    sa4TopPerCapita: Sa4Stat; sa4BottomPerCapita: Sa4Stat;
  };
}

export interface Entity {
  i: number; name: string; cls: string; lic: number; dev: number; tx: number;
  sites: number; clientRecords: number; services: number[]; states: string[];
}

export interface Sa4Stat {
  code: string; name: string; state: string; areaKm2: number; population: number;
  sites: number; live: number; devices: number; entities: number; perTenK: number | null;
  topHolder: number; topHolderSites: number; byClass: Record<string, number>;
}

export interface BandRow {
  name: string; lo: number; hi: number | null; use: string;
  rows: number; tx: number; licences: number; entities: number;
  byClass: Record<string, number>; topHolders: [number, number][];
}

const cache = new Map<string, Promise<unknown>>();

/**
 * Every payload load goes through here so a failed fetch surfaces as a real
 * message instead of a blank panel, and so a view switched away from and back
 * to does not re-download.
 */
export function load<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`data/${name}`, { cache: 'default' }).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    }).catch((err) => {
      cache.delete(name); // a retry should actually retry
      throw err;
    });
    cache.set(name, p);
  }
  return p;
}

let metaCache: Meta | null = null;
let entitiesCache: { classes: ClassDef[]; rows: Entity[]; serviceNames: string[]; individuals: Record<string, number> } | null = null;

export async function meta(): Promise<Meta> {
  if (!metaCache) metaCache = await load<Meta>('meta.json');
  return metaCache;
}

interface EntitiesFile {
  classes: ClassDef[];
  serviceIds: string[];
  serviceNames: string[];
  individuals: Record<string, number>;
  rows: [string, number, number, number, number, number, number, number[], string[]][];
}

export async function entities(): Promise<NonNullable<typeof entitiesCache>> {
  if (entitiesCache) return entitiesCache;
  const f = await load<EntitiesFile>('entities.json');
  entitiesCache = {
    classes: f.classes,
    serviceNames: f.serviceNames,
    individuals: f.individuals,
    rows: f.rows.map((r, i) => ({
      i, name: r[0], cls: f.classes[r[1]]?.id ?? 'UNCLASSIFIED',
      lic: r[2], dev: r[3], tx: r[4], sites: r[5], clientRecords: r[6],
      services: r[7], states: r[8],
    })),
  };
  return entitiesCache;
}

/** Colour for a holder class. Categorical hues are reserved for this and only this. */
export function classColour(classes: ClassDef[], id: string): string {
  return classes.find((c) => c.id === id)?.hue ?? '#525252';
}

export function classLabel(classes: ClassDef[], id: string): string {
  return classes.find((c) => c.id === id)?.label ?? id;
}

/** Renders a fetch failure the reader can act on rather than an empty panel. */
export function errorPanel(host: HTMLElement, err: unknown, retry: () => void): void {
  host.innerHTML = `<div class="error-state"><p>Could not load this view: ${String((err as Error)?.message ?? err)}</p>
    <p><button class="icon-btn" data-retry>Try again</button></p></div>`;
  host.querySelector('[data-retry]')?.addEventListener('click', retry);
}
