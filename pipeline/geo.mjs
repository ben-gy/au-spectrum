// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Point-in-polygon assignment of 129,334 register sites to ABS SA4 regions.
 *
 * Two things this is careful about:
 *  - **Holes.** A ring inside a ring is a hole (Christmas Island's lagoon, the
 *    ACT inside NSW). Even-odd counting across every ring of a polygon handles
 *    both without a separate outer/inner test.
 *  - **Coordinate order.** GeoJSON is [lon, lat]; the register is (lat, lon).
 *    Transposing them puts every Australian site in the Indian Ocean south of
 *    India and yields a match rate of exactly zero, which reads as "the
 *    boundary file is broken" rather than "the arguments are swapped". The
 *    caller passes lat and lon by name for that reason.
 */

/** Build a 0.5°-cell spatial index over a GeoJSON FeatureCollection. */
export function buildIndex(features, cell = 0.5) {
  const parts = [];
  features.forEach((f, fi) => {
    if (!f.geometry) return; // the ABS ships 19 null-geometry pseudo-regions
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const ring of rings) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      parts.push({ fi, rings, minX, minY, maxX, maxY });
    }
  });

  const grid = new Map();
  const key = (gx, gy) => gx * 100000 + gy;
  parts.forEach((p, pi) => {
    const gx0 = Math.floor(p.minX / cell), gx1 = Math.floor(p.maxX / cell);
    const gy0 = Math.floor(p.minY / cell), gy1 = Math.floor(p.maxY / cell);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = key(gx, gy);
        let bucket = grid.get(k);
        if (!bucket) grid.set(k, bucket = []);
        bucket.push(pi);
      }
    }
  });
  return { parts, grid, cell, key };
}

/** Even-odd ray cast across every ring of one polygon part. */
function inPart(part, lon, lat) {
  if (lon < part.minX || lon > part.maxX || lat < part.minY || lat > part.maxY) return false;
  let inside = false;
  for (const ring of part.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * @returns the index of the matching feature, or -1.
 */
export function locate(index, lat, lon) {
  const gx = Math.floor(lon / index.cell), gy = Math.floor(lat / index.cell);
  const bucket = index.grid.get(index.key(gx, gy));
  if (!bucket) return -1;
  for (const pi of bucket) {
    const p = index.parts[pi];
    if (inPart(p, lon, lat)) return p.fi;
  }
  return -1;
}
