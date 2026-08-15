// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * A minimal ZIP reader, so the pipeline has no binary prerequisite and no
 * dependency. The ACMA ships the register as one 60 MB ZIP that expands to
 * 600 MB across 24 CSVs; `unzip` happens to exist on GitHub's ubuntu runners
 * but relying on it makes the pipeline untestable and unportable.
 *
 * Only what the RRL archive actually uses is implemented: stored (method 0) and
 * deflate (method 8), read via the END-OF-CENTRAL-DIRECTORY record rather than
 * by scanning local headers — local headers in this archive carry zeroed sizes
 * with the real values in a trailing data descriptor, so a naive local-header
 * walk reads zero bytes out of every member and reports success.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/**
 * List the members of a ZIP held in a Buffer.
 * @param {Buffer} buf
 * @returns {{ name: string, method: number, compressedSize: number, size: number, offset: number }[]}
 */
export function listZipEntries(buf) {
  // The end-of-central-directory record is at the tail, after a comment of
  // unknown length, so scan backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`bad central directory entry at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract one member to a Buffer.
 * @param {Buffer} buf whole archive
 * @param {{ method: number, compressedSize: number, size: number, offset: number, name: string }} entry
 * @returns {Buffer}
 */
export function readZipEntry(buf, entry) {
  // The local header repeats the name/extra lengths; its size fields may be
  // zero (data-descriptor form), which is why the central directory is the
  // authority for sizes.
  const nameLen = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported zip compression method ${entry.method} for ${entry.name}`);
}
