// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

import L from 'leaflet';

/**
 * A canvas layer for the 71,451 publishable transmitter sites.
 *
 * Leaflet markers are DOM nodes, and 71,000 of them is not a slow map, it is a
 * dead tab. Even `L.circleMarker` with the canvas renderer allocates a layer
 * object per point. This draws straight from parallel typed arrays into one
 * canvas, filtered to the viewport, so a pan costs a few milliseconds.
 *
 * Position accuracy is drawn, not faded: a ten-metre fix is a filled dot, a
 * hundred-metre fix is a softer one, and an unknown-accuracy site is a hollow
 * ring that stops being drawn entirely past zoom 13 rather than implying a
 * precision the register does not have.
 */
export interface PointData {
  lat: number[]; lon: number[]; cls: number[]; dev: number[]; prec: number[]; holders: number[]; sa4: number[];
}

export interface PointLayerOptions {
  colours: string[];
  minZoom: number;
  onPick: (i: number) => void;
  filter?: (i: number) => boolean;
}

export function createPointLayer(data: PointData, opts: PointLayerOptions): L.Layer {
  const Layer = L.Layer.extend({
    onAdd(this: L.Layer & { _map: L.Map; _canvas: HTMLCanvasElement }, map: L.Map) {
      const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
      canvas.style.pointerEvents = 'none';
      this._canvas = canvas;
      this._map = map;
      map.getPanes().overlayPane.appendChild(canvas);
      map.on('moveend zoomend resize', () => draw(this._map, canvas), this);
      map.on('click', (e: L.LeafletMouseEvent) => pick(map, e), this);
      draw(map, canvas);
      return this;
    },
    onRemove(this: L.Layer & { _map: L.Map; _canvas: HTMLCanvasElement }, map: L.Map) {
      map.off('moveend zoomend resize');
      this._canvas.remove();
      return this;
    },
  });

  function draw(map: L.Map, canvas: HTMLCanvasElement): void {
    const size = map.getSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    const z = map.getZoom();
    if (z < opts.minZoom) return;

    const b = map.getBounds().pad(0.08);
    const s = b.getSouth();
    const n = b.getNorth();
    const w = b.getWest();
    const e = b.getEast();
    const r = z >= 12 ? 4 : z >= 10 ? 3 : 2;

    for (let i = 0; i < data.lat.length; i++) {
      const la = data.lat[i];
      const lo = data.lon[i];
      if (la < s || la > n || lo < w || lo > e) continue;
      if (opts.filter && !opts.filter(i)) continue;
      const prec = data.prec[i];
      if (prec === 2 && z > 13) continue; // never imply an accuracy the register lacks
      const p = map.latLngToContainerPoint([la, lo]);
      const colour = opts.colours[data.cls[i]] ?? '#888';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (prec === 2) {
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([1.5, 1.5]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = colour;
        ctx.globalAlpha = prec === 0 ? 0.9 : 0.5;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function pick(map: L.Map, ev: L.LeafletMouseEvent): void {
    if (map.getZoom() < opts.minZoom) return;
    const target = ev.containerPoint;
    let best = -1;
    let bestD = 14 * 14;
    const b = map.getBounds().pad(0.02);
    for (let i = 0; i < data.lat.length; i++) {
      const la = data.lat[i];
      const lo = data.lon[i];
      if (!b.contains([la, lo] as L.LatLngExpression)) continue;
      if (opts.filter && !opts.filter(i)) continue;
      const p = map.latLngToContainerPoint([la, lo]);
      const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) opts.onPick(best);
  }

  return new (Layer as unknown as { new (): L.Layer })();
}
