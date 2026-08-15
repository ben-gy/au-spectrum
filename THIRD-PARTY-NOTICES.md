# Third-party notices

The list below is derived from the sourcemaps of the built bundle
(`dist/assets/*.js.map`), so it reflects what actually ships to a visitor rather
than what happens to be installed. Build-time tooling (Vite, TypeScript, Vitest,
mapshaper) is not distributed and is not listed here.

Each component keeps its own licence. None of them is covered by this project's
AGPL licence or by the additional attribution term in
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A copy of this file is also served at `/third-party-notices.txt`.

---

## Leaflet 1.9.4

Map rendering. <https://leafletjs.com> — BSD 2-Clause.

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## Fonts

None are bundled or fetched. The interface uses the reader's own system fonts
(`-apple-system`, `Segoe UI`, `Helvetica`, and the platform monospace stack), so
there is no webfont licence to record and no third-party font request.

---

## Services fetched at runtime

- **CARTO basemap tiles** — `basemaps.cartocdn.com`, credited in the map's
  attribution control. Free for this kind of use under CARTO's basemap terms;
  the tiles are not redistributed by this repository.
- **Cloudflare Web Analytics** — cookie-less, anonymous page counts.
- **feedback.benrichardson.dev** — the feedback widget.

## Data

Data is not a software dependency and carries its own separate conditions.

- **ACMA Register of Radiocommunications Licences** — used under the ACMA's
  Licence to Use the Register. **Not open data and not Creative Commons.** The
  required attribution string, reproduced throughout the interface, is exactly:
  `Based on Australian Communications and Media Authority information`. The
  register's own condition against reproducing a natural person's Client
  Information is implemented in `pipeline/classify.mjs` and asserted by the
  pipeline's gates. This site is not endorsed by the ACMA.
- **Australian Bureau of Statistics** — ASGS 2021 Statistical Area Level 4
  boundaries and Estimated Resident Population, © Commonwealth of Australia,
  licensed CC BY 4.0.
