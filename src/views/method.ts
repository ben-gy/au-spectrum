// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { load, meta, entities, errorPanel } from '../data';
import { num, pct, esc } from '../format';
import { head, panel } from './common';
import { GLOSSARY, gloss } from '../glossary';

interface GlossaryFile {
  services: { id: string; name: string }[];
  subservices: { id: string; name: string }[];
  stationClasses: { code: string; rows: number; description: string | null }[];
}

/**
 * The rules, in full, including the ones that cost the site something. A reader
 * who wants to disagree with a number here should be able to find exactly which
 * decision produced it.
 */
export async function renderMethod(host: HTMLElement): Promise<void> {
  try {
    const [m, e, g] = await Promise.all([meta(), entities(), load<GlossaryFile>('glossary.json')]);
    const undocumented = g.stationClasses.filter((c) => !c.description);

    host.innerHTML = `
      ${head('Method',
    'Every rule behind the numbers, including the ones that cost something.',
    `This site merges the register's ${num(m.totals.clients)} licensee records into <strong>${num(m.totals.entities)}</strong> organisations, suppresses <strong>${num(m.totals.personClients)}</strong> of them as natural persons, and refuses to draw <strong>${num(m.totals.licences)}</strong> licences on any time axis. Each of those is a judgement, and each one is written down here.`)}

      ${panel('Where the data comes from',
    'Two sources, fetched by an automated pipeline and re-derived from scratch each run.',
    `<table><tbody>
      <tr><th style="position:static">Register</th><td>ACMA Register of Radiocommunications Licences, full bulk extract (<span class="mono">spectra_rrl.zip</span>), rebuilt daily by the ACMA. Snapshot used here: <span class="mono">${esc(m.snapshot)}</span>.</td></tr>
      <tr><th style="position:static">Boundaries</th><td>ABS ASGS 2021 Statistical Areas Level 4 — 89 real regions after dropping the 19 non-geographic pseudo-regions the ABS ships with null geometry. CC BY 4.0.</td></tr>
      <tr><th style="position:static">Population</th><td>ABS Estimated Resident Population by SA4, 2024. All 89 regions join. CC BY 4.0.</td></tr>
      <tr><th style="position:static">Update</th><td>Monthly. The register itself changes daily, but a monthly rebuild is proportionate for a structural view and keeps the pipeline off the ACMA's servers.</td></tr>
    </tbody></table>`)}

      ${panel('Merging licensee records into organisations',
    'The register\'s unit is a client number. Organisations hold several — this merge is ours, not the ACMA\'s, and it is the single most consequential decision on the site.',
    `<p class="panel-sub">Two client records merge if their names match after normalisation — uppercased, <span class="mono">&amp;</span>→AND,
      <span class="mono">LTD</span>→LIMITED, <span class="mono">INCORPORATED</span>→INC, punctuation and doubled spaces removed — or if they share a
      checksum-valid ABN. That takes ${num(m.totals.clients)} records to ${num(m.totals.entities)} organisations, and the partition is asserted
      in the build: group sizes sum to exactly ${num(m.totals.licences)} licences and ${num(m.totals.clients)} client records.</p>
    <h3 style="font-size:var(--font-size-base);margin-top:var(--space-lg)">What this deliberately does not do</h3>
    <ul style="padding-left:1.1rem;color:var(--text-secondary)">
      <li><strong>It does not strip company suffixes.</strong> A looser rule was measured and rejected: it merges CSL Australia
        (shipping) with CSL Limited (biotech), renders the ABC under the key "BROADCASTING", and produces an empty key that swallows
        two unrelated trust companies. Thirty-nine extra collapses is not worth any of that.</li>
      <li><strong>It does not merge corporate groups.</strong> Rio Tinto's Pilbara Iron Company (Services), The Pilbara
        Infrastructure and Hamersley Iron remain three organisations, because no name or ABN rule joins them. Every ranking here is
        of <em>licensed entities</em>, not corporate parents — Rio Tinto is genuinely absent from the top of the table it would
        otherwise sit near.</li>
      <li><strong>It does not make licence counts comparable across licence types.</strong> Three of the holders in the ranking —
        Selectra, Interactive Telecommunications Network and Private Cable Network — hold hundreds of per-building subscription-TV
        <em>service</em> licences, not transmitters. Their licence counts are not like an apparatus licensee's.</li>
    </ul>`)}

      ${panel('Sectors',
    'The register\'s own industry category is unusable, so this is a hand table over the largest holders plus ordered keyword rules for the tail.',
    `<p class="panel-sub">The ACMA's <span class="mono">industry_cat</span> field is blank on 54% of clients, and its "Safety Services"
      category — the one that would answer the obvious question — is defined in the code table and used by no client at all. Its
      <span class="mono">client_type</span> field files Western Power, the Water Corporation, the ABC, Australia Post, Jetstar and Aldi
      as "Community or Volunteer Group". Neither can be the sector axis.</p>
    <p class="panel-sub">So: the 220 largest organisations are classified by hand, each one checked against the register's own
      trading names and against public sources; everything else falls through sixteen ordered keyword rules; and whatever those miss
      is drawn as <strong>Unclassified</strong> in neutral grey — a legend entry, never a blank and never a guess. The ordering of the
      rules is load-bearing and is asserted in the test suite: police before departments, or "Queensland Police Service" files as
      generic government.</p>
    <p class="panel-sub">Sector counts on this snapshot:
      ${e.classes.filter((c) => c.id !== 'INDIVIDUAL').map((c) => `<span class="chip" style="cursor:default">${esc(c.label)}</span>`).join(' ')}</p>`)}

      ${panel('Natural persons',
    'Clause 8 of the ACMA\'s licence forbids reproducing a natural person\'s information. This is how that is implemented, and what it costs.',
    `<p class="panel-sub">A licensee is treated as a natural person if the register types them as one
      (<span class="mono">CLIENT_TYPE_ID = 7</span>, ${num(2995)} clients), or if the name is unmistakably personal, the record carries no
      ACN, and the holder has at most five licences. That second arm exists because individuals turn up filed as community groups —
      farm partnerships, hobbyists with a repeater — and it is bounded because an unbounded name-shape test flags Sydney Trains,
      Monash Health and the Bureau of Meteorology as people and deletes them from every table on this site. Total flagged:
      <strong>${num(m.totals.personClients)}</strong> clients holding ${num(m.totals.personLicences)} licences, ${pct((m.totals.personLicences / m.totals.licences) * 100)} of the register.</p>
    <p class="panel-sub">For those licensees, nothing identifying is published: no name, no trading name, no ABN, no address, no
      client number, no vessel name. They appear only as one aggregate figure. <strong>And ${num(m.totals.personOnlySites)} sites are
      removed from the map entirely</strong> — every site whose every device belongs to an individual — because the register's site
      names are frequently street addresses recorded to ten-metre accuracy. Suppressing the name would not have been enough.</p>
    <p class="panel-sub">The cost is stated rather than hidden: the second arm also catches a few hundred very small holders that
      may be businesses rather than people, and folds them into the aggregate. That is roughly 0.3% of the register losing its name
      and no analysis at all. In the other direction, a sole trader registered as a company is indistinguishable from the record
      alone — which is why there is no name search box on this site, and will not be.</p>`)}

      ${panel('Time',
    'One axis in this register is honest. Three are not, and the site refuses all three.',
    `<table><tbody>
      <tr><th style="position:static">Issue date</th><td><strong>Unusable.</strong> Renewal rewrites it. 66% of licences carry this year and nothing at all predates 17 September 2014, in a country that has licensed radio since the 1900s.</td></tr>
      <tr><th style="position:static">Date of effect</th><td><strong>Unusable</strong> for the same reason — 99.5% of licences share a year between the two columns. It carries real depth only for broadcast and datacasting service licences.</td></tr>
      <tr><th style="position:static">Device authorisation date</th><td><strong>Usable with care.</strong> It survives renewal, so it is a genuine vintage curve back to 1959 — but 78% of device rows belong to spectrum licences that carriers re-lodge in bulk, so the two populations are drawn separately and never summed. It is survivorship: still-authorised assignments, not everything ever authorised.</td></tr>
      <tr><th style="position:static">Expiry date</th><td><strong>Usable.</strong> Forward-looking and never rewritten. It is the only clean axis on the site.</td></tr>
      <tr><th style="position:static">Service commencement</th><td><strong>Usable, radio only.</strong> Broadcast service licences carry a first-issued date back to 1925 — but 78% are blank, and almost all of the blanks are television.</td></tr>
    </tbody></table>`)}

      ${panel('What this site will not claim',
    'Each of these is a statement the data appears to support and does not.',
    `<ul style="padding-left:1.1rem;color:var(--text-secondary)">
      <li><strong>That a licence count measures spectrum.</strong> It measures paperwork. NBN Co's ${num(m.headline.largestHolderLicences)} licences are mostly individual fixed-wireless links.</li>
      <li><strong>That megahertz can be summed across markets.</strong> The same block licensed in 32 separate areas is not 80,000 MHz. The correction is printed in full on the Exclusive view.</li>
      <li><strong>That a site is a tower.</strong> 43% of site records carry no equipment, several records can describe one mast, and 53 coordinates carry more than one site number.</li>
      <li><strong>That a device row is a transmitter.</strong> Half are receivers, and a three-sector mobile site registers the same assignment three times over.</li>
      <li><strong>That amateur radio is declining.</strong> Individual amateurs operate under a ${gloss('class licence', 'class licence')} and are absent by design; only repeaters and beacons are here.</li>
      <li><strong>That any of this is a trend.</strong> The register is a daily snapshot with no history at all.</li>
      <li><strong>That anything here is the most powerful transmitter in Australia.</strong> Power is blank on half the rows, pulse-peak radar figures are not comparable to mean broadcast power, and a large dish makes a small transmitter look enormous.</li>
      <li><strong>That this is Australia's complete radio picture.</strong> Everything class-licensed — Wi-Fi, Bluetooth, CB handhelds — has no record at all.</li>
    </ul>`)}

      ${panel('Codes the ACMA does not document',
    'Seven class-of-station codes appear in the data and in no ACMA code table. They are bucketed, not guessed.',
    `<div class="panel-scroll"><table><thead><tr><th>Code</th><th class="num">Device rows</th><th>Meaning</th></tr></thead><tbody>
      ${g.stationClasses.slice(0, 18).map((c) => `<tr><td class="mono">${esc(c.code)}</td><td class="num">${num(c.rows)}</td>
        <td>${c.description ? esc(c.description) : '<span class="note-inline">not documented by the ACMA</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="legend-note">${num(undocumented.reduce((s, c) => s + c.rows, 0))} device rows carry one of the ${undocumented.length} undocumented codes.</div>`)}

      ${panel('Glossary',
    'Everything this site assumes you might not know.',
    `<dl class="kv" style="grid-template-columns:1fr;gap:var(--space-md)">
      ${Object.entries(GLOSSARY).map(([k, v]) => `<div><dt style="color:var(--text-primary);font-weight:600">${esc(k)}</dt>
        <dd style="text-align:left;font-family:var(--font-sans);color:var(--text-secondary)">${esc(v)}</dd></div>`).join('')}
    </dl>`)}

      ${panel('Where to go for a single record',
    'This site is about the register as a whole. For looking up one licence, one site or one frequency, these are better and this site links to them rather than competing.',
    `<ul style="padding-left:1.1rem;color:var(--text-secondary)">
      <li><a href="https://www.acma.gov.au/register-radiocommunication-licences-rrl" target="_blank" rel="noopener">The ACMA's own RRL search</a> — the authoritative record.</li>
      <li><a href="https://cdn.acma.gov.au/offline-rrl/index.html" target="_blank" rel="noopener">Offline RRL</a> — the ACMA's in-browser SQL console over the whole dataset.</li>
      <li><a href="https://spectaura.com.au" target="_blank" rel="noopener">SpectAura</a> and <a href="https://maprad.io/" target="_blank" rel="noopener">maprad.io</a> — commercial and free lookup tools with proximity search.</li>
      <li><a href="https://www.acma.gov.au/register-radiocommunications-licences-archive" target="_blank" rel="noopener">The RRL Archive</a> — monthly extracts back to 1996, which is the only real history that exists.</li>
    </ul>
    <p class="panel-sub" style="margin-top:var(--space-md)">Based on Australian Communications and Media Authority information.
      The register is not open data and not Creative Commons: the ACMA reserves its rights and grants a licence to use and adapt it.
      This site is not endorsed by the ACMA.</p>`)}
    `;
  } catch (err) {
    errorPanel(host, err, () => renderMethod(host));
  }
}
