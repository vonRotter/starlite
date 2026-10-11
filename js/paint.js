'use strict';
// The paint layer: every hit leaves a splat of team colour on the ground.
// Units move faster on their own team's paint.

const PAINT_CELL = 16;
const PAINT_SCALE = 0.5; // the paint canvas is drawn at half resolution

class PaintLayer {
  constructor(map) {
    this.map = map;
    this.gw = Math.ceil(map.pxW / PAINT_CELL);
    this.gh = Math.ceil(map.pxH / PAINT_CELL);
    this.grid = new Int8Array(this.gw * this.gh).fill(-1);
    this.counts = {};
    this.total = 0;
    for (let y = 0; y < this.gh; y++) for (let x = 0; x < this.gw; x++) {
      if (map.terrainOpen(Math.floor((x * PAINT_CELL) / TILE), Math.floor((y * PAINT_CELL) / TILE))) this.total++;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(map.pxW * PAINT_SCALE);
    this.canvas.height = Math.ceil(map.pxH * PAINT_SCALE);
    this.ctx = this.canvas.getContext('2d');
    this.rng = makeRng(4242);
    this.dirty = true;
  }

  teamAt(x, y) {
    const gx = Math.floor(x / PAINT_CELL), gy = Math.floor(y / PAINT_CELL);
    if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return -1;
    return this.grid[gy * this.gw + gx];
  }

  coverage(team) { return this.total ? (this.counts[team] || 0) / this.total : 0; }

  splat(x, y, r, team, color) {
    const ctx = this.ctx, s = PAINT_SCALE, rng = this.rng;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * s, y * s, r * s, 0, TAU);
    ctx.fill();
    // A few blobby lumps and droplets give the classic paint-splat look.
    const lumps = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < lumps; i++) {
      const a = rng() * TAU, d = r * (0.6 + rng() * 0.5), lr = r * (0.25 + rng() * 0.3);
      ctx.beginPath();
      ctx.arc((x + Math.cos(a) * d) * s, (y + Math.sin(a) * d) * s, lr * s, 0, TAU);
      ctx.fill();
    }
    const drops = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < drops; i++) {
      const a = rng() * TAU, d = r * (1.2 + rng() * 0.8), dr = Math.max(1.5, r * (0.08 + rng() * 0.12));
      ctx.beginPath();
      ctx.arc((x + Math.cos(a) * d) * s, (y + Math.sin(a) * d) * s, dr * s, 0, TAU);
      ctx.fill();
    }
    // Update ownership cells.
    const c = PAINT_CELL, r2 = r * r;
    const gx0 = Math.max(0, Math.floor((x - r) / c)), gx1 = Math.min(this.gw - 1, Math.floor((x + r) / c));
    const gy0 = Math.max(0, Math.floor((y - r) / c)), gy1 = Math.min(this.gh - 1, Math.floor((y + r) / c));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = gx * c + c / 2, cy = gy * c + c / 2;
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > r2) continue;
        if (!this.map.terrainOpen(Math.floor(cx / TILE), Math.floor(cy / TILE))) continue;
        const i = gy * this.gw + gx, old = this.grid[i];
        if (old === team) continue;
        if (old >= 0) this.counts[old]--;
        this.grid[i] = team;
        this.counts[team] = (this.counts[team] || 0) + 1;
      }
    }
    this.dirty = true;
  }
}
