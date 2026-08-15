// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The pipeline's own parser, imported directly — the parser that is tested is
// the parser that runs against the register.
import { parseCsv, parseCsvRecords, streamCsv, stripBom } from '../pipeline/parse.mjs';

describe('parseCsv', () => {
  it('keeps a comma inside quotes in one field', () => {
    // 12,273 of the register's 129,334 site names contain one of these. A naive
    // split shifts STATE, POSTCODE and SITE_PRECISION left by one on every one
    // of them, and the map still looks perfect.
    expect(parseCsv('1000,-12.4,130.8,"Fort Hill Wharf, DARWIN",NT')).toEqual([
      ['1000', '-12.4', '130.8', 'Fort Hill Wharf, DARWIN', 'NT'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('a,"say ""hi""",b')).toEqual([['a', 'say "hi"', 'b']]);
  });

  it('keeps a newline inside quotes in one field', () => {
    expect(parseCsv('a,"line one\nline two",c')).toEqual([['a', 'line one\nline two', 'c']]);
  });

  it('treats CRLF and LF identically outside quotes', () => {
    expect(parseCsv('a,b\r\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('does not drop the last record when the file has no trailing newline', () => {
    // Every file in the ACMA archive ends without one. A parser that only emits
    // on a newline silently loses the last row of all 24 lookup tables.
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('does not emit a phantom row for a trailing newline', () => {
    expect(parseCsv('a,b\n')).toHaveLength(1);
  });

  it('preserves empty fields', () => {
    expect(parseCsv('a,,c,')).toEqual([['a', '', 'c', '']]);
  });

  it('returns nothing for an empty document', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('handles a quoted field containing only a comma', () => {
    expect(parseCsv('","')).toEqual([[',']]);
  });

  it('handles a field that is padded inside its quotes', () => {
    // device_details EMISSION: 117,445 rows arrive as `"10K1F3E  "`, which is a
    // different group key from `10K1F3E` unless it is trimmed downstream.
    expect(parseCsv('"10K1F3E  ",T')[0][0]).toBe('10K1F3E  ');
  });
});

describe('parseCsvRecords', () => {
  it('keys rows by the header and counts ragged rows', () => {
    const r = parseCsvRecords('A,B,C\n1,2,3\n4,5\n');
    expect(r.header).toEqual(['A', 'B', 'C']);
    expect(r.records[0]).toEqual({ A: '1', B: '2', C: '3' });
    expect(r.records[1].C).toBe('');
    expect(r.ragged).toBe(1);
  });

  it('strips a byte-order mark from the first header cell', () => {
    expect(parseCsvRecords('﻿SITE_ID,NAME\n1,x').header[0]).toBe('SITE_ID');
    expect(stripBom('﻿x')).toBe('x');
  });
});

describe('streamCsv', () => {
  const write = (body: string): string => {
    const p = join(mkdtempSync(join(tmpdir(), 'au-spectrum-')), 'f.csv');
    writeFileSync(p, body);
    return p;
  };

  it('streams records with the same result as the in-memory parser', async () => {
    const body = 'A,B\n1,"x,y"\n2,"say ""hi"""\n';
    const rows: Record<string, string>[] = [];
    const stats = await streamCsv(write(body), (r) => rows.push(r));
    expect(stats.rows).toBe(2);
    expect(stats.ragged).toBe(0);
    expect(rows[0]).toEqual({ A: '1', B: 'x,y' });
    expect(rows[1]).toEqual({ A: '2', B: 'say "hi"' });
  });

  it('survives a quote landing on a chunk boundary', async () => {
    // The stream is read in 1 MB chunks, so a `""` escape can be split across
    // two of them. Padding the field to just over the boundary is the only way
    // to exercise that branch, and it is the branch that silently corrupts a
    // 383 MB file if it is wrong.
    const pad = 'z'.repeat((1 << 20) - 6);
    const body = `A,B\n1,"${pad}""q"\n`;
    const rows: Record<string, string>[] = [];
    await streamCsv(write(body), (r) => rows.push(r));
    expect(rows).toHaveLength(1);
    expect(rows[0].B).toBe(`${pad}"q`);
  });

  it('emits the final record of a file with no trailing newline', async () => {
    const rows: Record<string, string>[] = [];
    await streamCsv(write('A,B\n1,2'), (r) => rows.push(r));
    expect(rows).toEqual([{ A: '1', B: '2' }]);
  });

  it('skips blank lines rather than emitting empty records', async () => {
    const rows: Record<string, string>[] = [];
    const stats = await streamCsv(write('A,B\n1,2\n\n3,4\n'), (r) => rows.push(r));
    expect(stats.rows).toBe(2);
    expect(rows.map((r) => r.A)).toEqual(['1', '3']);
  });
});
