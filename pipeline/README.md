# pipeline

Two steps, run monthly by `.github/workflows/data-pipeline.yml`.

```bash
cd pipeline && npm install && cd ..
node --max-old-space-size=8192 pipeline/collect.mjs     # fetch + unpack
node --max-old-space-size=8192 pipeline/aggregate.mjs   # derive public/data/*.json
```

`collect.mjs --cached` reuses an already-downloaded archive, which is what you
want while iterating on the aggregation.

## Files

| File | What it is |
|---|---|
| `collect.mjs` | Fetches `spectra_rrl.zip` from the ACMA plus the ABS boundaries and population, and unpacks the seventeen tables the site uses into `tmp/` |
| `aggregate.mjs` | Three streaming passes over the register; writes every payload and asserts every gate |
| `parse.mjs` | RFC 4180 CSV reader, in-memory and streaming. Imported by the test suite, so the parser that is tested is the parser that runs |
| `zip.mjs` | Minimal ZIP reader — central-directory based, because the archive's local headers carry zeroed sizes |
| `classify.mjs` | The entity merge, the natural-person test and the sector rules |
| `bands.mjs` | The band table and the constant-ratio binning |
| `geo.mjs` | Point-in-polygon with a grid index |
| `sectors_tierA.json` | Hand-verified sector for the 220 largest holders |

## Things that will bite you

- **`tmp/` holds ~600 MB** and is gitignored. `device_details.csv` alone is 383 MB
  and 2,149,290 rows; it must be streamed, never parsed whole.
- **The register is not open data.** Nothing downloaded here is committed. Only
  the derived, redacted JSON in `public/data/` is published. Before changing
  anything in `classify.mjs`, read the clause-8 note at the top of it.
- **Point-in-polygon runs against the raw 101 MB boundary download**, not the
  simplified file the map draws. Reusing the drawing file looks like an
  optimisation and quietly loses ~0.85% of matches at the coastline; gate G12d
  exists to fail if someone tries it.
- **`aggregate.mjs` exits non-zero on a failed gate.** That is deliberate: a
  change in the register's shape should stop the run, not publish a plausible
  wrong number.
