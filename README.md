# Radio Spectrum

**Who holds Australia's radio spectrum — every licence in the ACMA register, band by band and place by place.**

🔗 **Live:** [https://au-spectrum.benrichardson.dev](https://au-spectrum.benrichardson.dev)

## What is this?

Every radio transmitter in Australia that needs a licence is written down in one
place: the ACMA's Register of Radiocommunications Licences. It is 164,105
licences, 14,373 licensee records, 2.15 million device assignments and 129,334
site records, rebuilt daily and published as a 60 MB archive. This site is that
register read as a whole.

It is deliberately not another licence lookup. The ACMA's own search, its
in-browser Offline RRL, SpectAura and maprad.io all do per-record lookup well,
and this site links to them. What none of them does is answer questions about
the register itself: how concentrated it is, which bands belong to thousands of
organisations and which to a handful, whose mast everyone else shares, and how
much of the file cannot support the question you want to ask it.

The answers are frequently not what a reader expects. Australia's largest radio
licensee is a fixed-broadband company. Government, emergency services and
volunteers hold about 30% of the licences and 7% of the actual hardware. 398
spectrum licences — a quarter of one per cent of the register — carry 78% of all
device assignments. And 43% of the register's site records have no equipment on
them at all.

## Who is this for?

Two audiences, and the site is built to serve both without patronising either.

**RF engineers, spectrum managers and amateur operators** who already know what
an emission designator is, will notice a wrong number immediately, and want the
national picture their existing lookup tools cannot assemble: band occupancy,
duplex plans, holdings by market, and the register's own defects stated plainly.

**Journalists, researchers and curious residents** asking who is licensed to
transmit where they live, why the outback has 37 times more registered radio
sites per person than a Perth suburb, and who actually owns the spectrum the 5G
auctions sold. Every view opens with a stated finding in one sentence before it
gets dense.

## Data sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| [ACMA Register of Radiocommunications Licences](https://www.acma.gov.au/radiocomms-licence-data) | Every apparatus, spectrum and broadcast service licence, its holder, its devices, frequencies, powers and sites | Rebuilt daily; this site rebuilds monthly |
| [ABS ASGS 2021 SA4 boundaries](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA4/MapServer) | The 89 statistical regions the map aggregates to | Per ABS release |
| [ABS Estimated Resident Population](https://data.api.abs.gov.au/rest/data/ABS,ERP_ASGS2021,1.0.0) | The per-capita denominator | Annual |

The register is **not** open data. It is used under the ACMA's own licence,
which reserves the ACMA's rights, requires the exact attribution string *"Based
on Australian Communications and Media Authority information"*, and forbids
reproducing the personal information of a licensee who is a natural person. This
site is not endorsed by the ACMA. See [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

## Features

- **Holders** — every licensed organisation as one dot on a log axis, laned by
  what kind of organisation it is, with a Lorenz curve and a slope chart showing
  that counting licences and counting hardware give opposite answers.
- **Bands** — the signature view: 10 kHz to 300 GHz on one logarithmic spine, in
  constant-ratio bins, with occupancy, composition and *how many separate
  organisations* as three lanes. The third lane is the one that matters.
- **Channels** — a needle per distinct assigned frequency (20,003 of them), so
  the band plan appears as literal teeth, plus an arc diagram of the real
  transmit/receive pairs behind Australia's 77 duplex spacings.
- **Where** — an ABS SA4 choropleth with a per-capita, dominant-holder and
  concentration switch, and every publishable transmitter site as a canvas point
  layer past zoom nine, with position accuracy drawn rather than assumed.
- **Sharing** — a chord of which kinds of organisation share a mast, and the 400
  most crowded sites in the country as tenant stacks.
- **Exclusive** — the 398 spectrum licences, quarantined from the rest, with the
  megahertz-summing fallacy printed as a worked correction instead of hidden.
- **On air** — broadcast service licences by the year they were first issued,
  back to 1925, with the undated 78% shown at equal weight.
- **Limits** — what the register cannot tell you, including the ACMA's own
  documented join that returns zero rows.
- **Method** — every rule, including the ones that cost the site something.

## Tech stack

- **Runtime:** Vanilla TypeScript, no framework
- **Build:** Vite 6
- **Testing:** Vitest (85 tests)
- **Maps:** Leaflet 1.9 with a hand-rolled canvas point layer for 71,451 sites
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** a monthly GitHub Actions pipeline with a dependency-free CSV parser
  and ZIP reader

## Local development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

To rebuild the data (downloads ~160 MB and expands to ~600 MB in `pipeline/tmp/`,
which is gitignored):

```bash
cd pipeline && npm install && cd ..
node --max-old-space-size=8192 pipeline/collect.mjs
node --max-old-space-size=8192 pipeline/aggregate.mjs
```

## How it works

`pipeline/collect.mjs` fetches the ACMA archive and unpacks it with a
dependency-free ZIP reader — the archive's local headers carry zeroed sizes, so
it reads the central directory instead. `pipeline/aggregate.mjs` then makes three
streaming passes over the 383 MB device table and writes sixteen JSON payloads
totalling about 2.6 MB gzipped. The browser never sees a row of the register.

Two things make the aggregation more than a group-by. The register's unit is a
*client number*, and organisations hold several — Telstra four, the NSW
Telecommunications Authority seven, Airservices Australia six — so everything is
keyed on a merged entity id, and one id space is asserted across every payload.
And the ACMA's licence forbids publishing a natural person's information, so
3,353 licensees are suppressed along with 1,496 sites whose every device belongs
to an individual, because the register's site names are frequently street
addresses recorded to ten-metre accuracy.

The pipeline fails the build rather than publishing a wrong number. Thirty-odd
gates each recompute a figure from the source CSVs and compare it with what the
payloads carry — including one that recounts two bands' holders straight from
the device stream and asserts both the merged figure and the raw client-number
figure, so the two can never be confused for one another.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Data sources keep theirs, and their attribution requirements are listed in the site's
own methodology/sources section.
