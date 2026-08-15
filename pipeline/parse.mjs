// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Dependency-free RFC 4180 CSV machinery for the ACMA RRL extract.
 *
 * Two traps this exists to defeat, both of which fail SILENTLY and still produce
 * plausible-looking totals:
 *
 *  1. **Embedded commas.** site.csv NAME, client.csv LICENCEE and
 *     auth_spectrum_area.csv AREA_DESCRIPTION all contain quoted fields with
 *     commas in them. Splitting on `,` shifts every later column left, so STATE
 *     picks up a fragment of a place name and the per-state counts come out ~10%
 *     low while still summing to something believable.
 *  2. **Embedded newlines.** A line-oriented reader (readline, split('\n')) tears
 *     a quoted field that contains CR/LF into fragments. The parser below is a
 *     character state machine fed by fixed-size chunks, so a record can span any
 *     number of physical lines.
 *
 * Nothing here imports anything. The test suite imports this exact file, so the
 * parser that is tested is the parser that runs.
 */

import { createReadStream } from 'node:fs';
import { readFileSync } from 'node:fs';

/**
 * Parse a whole CSV document held in memory into an array of string arrays.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false; // has the current record produced any character at all?

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; started = true; continue; }
    if (c === ',') { row.push(field); field = ''; started = true; continue; }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = []; field = ''; started = false;
      continue;
    }
    if (c === '\r') continue; // CRLF and lone CR both normalise away outside quotes
    field += c;
    started = true;
  }
  if (started || field.length || row.length) { row.push(field); rows.push(row); }
  // A trailing newline leaves one empty record; drop it rather than emitting a
  // phantom row of one empty string.
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

/**
 * Parse a CSV document into objects keyed by its header row.
 * Rows whose field count differs from the header are still returned, but their
 * count is reported so a caller can gate on it.
 * @param {string} text
 * @returns {{ header: string[], records: Record<string,string>[], ragged: number }}
 */
export function parseCsvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { header: [], records: [], ragged: 0 };
  const header = rows[0].map(stripBom);
  const records = [];
  let ragged = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length !== header.length) ragged++;
    const o = {};
    for (let j = 0; j < header.length; j++) o[header[j]] = r[j] ?? '';
    records.push(o);
  }
  return { header, records, ragged };
}

/** Strip a UTF-8 BOM from the first header cell. */
export function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Read and parse a CSV file from disk into records. */
export function readCsvRecords(path) {
  return parseCsvRecords(readFileSync(path, 'utf8'));
}

/**
 * Streaming RFC 4180 parser. Calls `onRecord(objectKeyedByHeader, index)` for
 * every data row without ever holding the whole file — device_details.csv is
 * 383 MB / 2.1M rows and a full parse exhausts the default heap.
 *
 * @param {string} path
 * @param {(rec: Record<string,string>, i: number) => void} onRecord
 * @returns {Promise<{ rows: number, ragged: number, header: string[] }>}
 */
export function streamCsv(path, onRecord) {
  return new Promise((resolve, reject) => {
    let header = null;
    let row = [];
    let field = '';
    let quoted = false;
    // True when the previous character was a `"` that closed a quoted run. The
    // next character decides whether it was an escaped `""` or a real close —
    // and it may live in the NEXT chunk, so this has to be a state, not a
    // look-ahead into `chunk[i + 1]`.
    let pendingQuote = false;
    let started = false;
    let rows = 0;
    let ragged = 0;

    const finishRow = () => {
      row.push(field);
      field = '';
      const cells = row;
      row = [];
      started = false;
      if (!header) { header = cells.map(stripBom); return; }
      if (cells.length === 1 && cells[0] === '') return; // blank line
      if (cells.length !== header.length) ragged++;
      const o = {};
      for (let j = 0; j < header.length; j++) o[header[j]] = cells[j] ?? '';
      onRecord(o, rows);
      rows++;
    };

    const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 });
    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (pendingQuote) {
          pendingQuote = false;
          if (c === '"') { field += '"'; quoted = true; continue; }
          // Not a doubled quote, so the run really did close. Fall through and
          // treat c as an ordinary unquoted character.
        } else if (quoted) {
          if (c === '"') { quoted = false; pendingQuote = true; }
          else field += c;
          continue;
        }
        if (c === '"') { quoted = true; started = true; continue; }
        if (c === ',') { row.push(field); field = ''; started = true; continue; }
        if (c === '\n') { finishRow(); continue; }
        if (c === '\r') continue;
        field += c;
        started = true;
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (started || field.length || row.length) finishRow();
      resolve({ rows, ragged, header: header || [] });
    });
  });
}
