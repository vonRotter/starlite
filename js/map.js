'use strict';
// Tile map, map generation and A* path finding.

const T_GROUND = 0, T_ROCK = 1, T_WATER = 2;

const THEMES = {
  eng: {
    name: 'Blomsterenga', ground: ['#a8e67f', '#9fdd76'], patch: '#b9ef93',
    obstacle: 'tree', obstacleFill: '#3fae4a', obstacleLight: '#6fd36a', obstacleDark: '#25733a',
    water: '#45c4ff', waterLight: '#a6e6ff', deco: ['flower', 'flower', 'tuft', 'pebble'],
    decoColors: ['#ff6fb5', '#ffe14d', '#ffffff', '#b48cff'], lakeChance: 0.3,
  },
  skog: {
    name: 'Summeskogen', ground: ['#8fd27a', '#86c972'], patch: '#a1dc8a',
    obstacle: 'tree', obstacleFill: '#2f9a48', obstacleLight: '#5cc463', obstacleDark: '#1c5f30',
    water: '#3fb8f0', waterLight: '#9fe0ff', deco: ['mushroom', 'tuft', 'tuft', 'flower'],
    decoColors: ['#ff5b5b', '#ffd34d', '#ffffff'], lakeChance: 0.15, density: 0.11,
  },
  grotte: {
    name: 'Krystallgrotta', ground: ['#c7b6ee', '#bdabe6'], patch: '#d6c9f5',
    obstacle: 'rock', obstacleFill: '#7b6aa8', obstacleLight: '#a596d0', obstacleDark: '#4b3f73',
    water: '#5ad1ff', waterLight: '#c3f0ff', deco: ['gem', 'pebble', 'gem'],
    decoColors: ['#7ff0e5', '#ff9fd2', '#ffe980'], lakeChance: 0.2,
  },
  sky: {
    name: 'Skyøya', ground: ['#e4ecff', '#dbe5fb'], patch: '#f2f6ff',
    obstacle: 'cloud', obstacleFill: '#ffffff', obstacleLight: '#ffffff', obstacleDark: '#aab6d6',
    water: '#8fd5ff', waterLight: '#d6f1ff', deco: ['star', 'pebble'],
    decoColors: ['#ffe14d', '#ff9fd2', '#93b3ff'], lakeChance: 0.45,
  },
  strand: {
    name: 'Solstranda', ground: ['#ffe7a3', '#fbe099'], patch: '#fff0c4',
    obstacle: 'rock', obstacleFill: '#c9a27a', obstacleLight: '#e5c49f', obstacleDark: '#8a6a4a',
    water: '#33c7e8', waterLight: '#a8f0ff', deco: ['shell', 'pebble', 'star'],
    decoColors: ['#ff8fa8', '#ffffff', '#ffb36b'], lakeChance: 0.55,
  },
};

const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

class GameMap {
  constructor(w, h, themeKey) {
    this.w = w; this.h = h;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey] || THEMES.eng;
    this.tiles = new Uint8Array(w * h);
    this.occ = new Uint16Array(w * h); // buildings and crystals standing on the tile
    this.decos = [];
    this.pxW = w * TILE; this.pxH = h * TILE;
    // A* scratch space, reused between searches
    const n = w * h;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.curStamp = 1;
    this.heap = new MinHeap();
  }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  terrainOpen(tx, ty) { return this.inBounds(tx, ty) && this.tiles[ty * this.w + tx] === T_GROUND; }
  walkable(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * this.w + tx;
    return this.tiles[i] === T_GROUND && this.occ[i] === 0;
  }
  walkablePx(x, y) { return this.walkable(Math.floor(x / TILE), Math.floor(y / TILE)); }
  occupy(tx, ty, w, h, delta) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (this.inBounds(x, y)) this.occ[y * this.w + x] += delta;
    }
  }
  areaFree(tx, ty, w, h) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (!this.walkable(x, y)) return false;
    }
    return true;
  }

  nearestWalkable(tx, ty, maxR = 12) {
    if (this.walkable(tx, ty)) return [tx, ty];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (!this.walkable(x, y)) continue;
        const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best) return best;
    }
    return null;
  }

  // Is the straight line walkable for a body of radius r?
  lineWalkable(x0, y0, x1, y1, r = 0) {
    const d = dist(x0, y0, x1, y1);
    if (d < 1) return true;
    const nx = (x1 - x0) / d, ny = (y1 - y0) / d;
    const px = -ny * r, py = nx * r;
    const steps = Math.ceil(d / 8);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (!this.walkablePx(x, y)) return false;
      if (r > 0 && (!this.walkablePx(x + px, y + py) || !this.walkablePx(x - px, y - py))) return false;
    }
    return true;
  }

  // A* from pixel position to a goal. goal = {x, y} (pixels) or {rect: [tx0, ty0, tx1, ty1]}
  // (inclusive tiles; reaching any tile in the rect counts). Returns pixel waypoints.
  findPath(sx, sy, goal, radius = 10) {
    const w = this.w;
    let stx = clamp(Math.floor(sx / TILE), 0, w - 1), sty = clamp(Math.floor(sy / TILE), 0, this.h - 1);
    let x0, y0, x1, y1, exact = null;
    if (goal.rect) {
      [x0, y0, x1, y1] = goal.rect;
    } else {
      let gtx = clamp(Math.floor(goal.x / TILE), 0, w - 1), gty = clamp(Math.floor(goal.y / TILE), 0, this.h - 1);
      if (this.walkable(gtx, gty)) exact = { x: goal.x, y: goal.y };
      else {
        const nw = this.nearestWalkable(gtx, gty, 20);
        if (!nw) return [];
        [gtx, gty] = nw;
      }
      x0 = x1 = gtx; y0 = y1 = gty;
    }
    const inGoal = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const hFn = (x, y) => {
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    if (inGoal(stx, sty)) {
      return exact ? [exact] : [];
    }
    const stamp = ++this.curStamp;
    const g = this.g, came = this.came, st = this.stamp, closed = this.closed, heap = this.heap;
    heap.clear();
    const start = sty * w + stx;
    st[start] = stamp; g[start] = 0; came[start] = -1;
    heap.push(start, hFn(stx, sty));
    let best = start, bestH = hFn(stx, sty), found = -1, expanded = 0;
    while (heap.size > 0 && expanded < 7000) {
      const cur = heap.pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      expanded++;
      const cx = cur % w, cy = (cur - cx) / w;
      if (inGoal(cx, cy)) { found = cur; break; }
      const hc = hFn(cx, cy);
      if (hc < bestH) { bestH = hc; best = cur; }
      for (const [dx, dy, c] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.walkable(nx, ny) && !inGoal(nx, ny)) continue;
        if (!this.walkable(nx, ny) && inGoal(nx, ny) && !goal.rect) continue;
        if (dx !== 0 && dy !== 0 && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
        const ni = ny * w + nx;
        if (closed[ni] === stamp) continue;
        const ng = g[cur] + c;
        if (st[ni] !== stamp || ng < g[ni]) {
          st[ni] = stamp; g[ni] = ng; came[ni] = cur;
          heap.push(ni, ng + hFn(nx, ny) * 1.001);
        }
      }
    }
    let end = found >= 0 ? found : best;
    const tiles = [];
    for (let i = end; i !== -1 && i !== start; i = came[i]) tiles.push(i);
    tiles.reverse();
    // A rect goal may end on a blocked tile (the building itself); stop next to it instead.
    while (tiles.length && !this.walkable(tiles[tiles.length - 1] % w, Math.floor(tiles[tiles.length - 1] / w))) tiles.pop();
    const pts = tiles.map((i) => ({ x: (i % w) * TILE + TILE / 2, y: Math.floor(i / w) * TILE + TILE / 2 }));
    if (found >= 0 && exact) pts.push(exact);
    return this.smooth(sx, sy, pts, radius);
  }

  // Drop waypoints that can be skipped with a clear straight line.
  smooth(sx, sy, pts, radius) {
    if (pts.length <= 2) return pts;
    const out = [];
    let cx = sx, cy = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineWalkable(cx, cy, pts[j].x, pts[j].y, Math.min(radius, 12))) j--;
      out.push(pts[j]);
      cx = pts[j].x; cy = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}

// Generates a map. bases: [{tx, ty}] top-left tiles of 4x4 bases.
// Returns { map, crystals: [{tx, ty}] }.
function generateMap(opts) {
  const { w, h, seed = 1, theme = 'eng', bases = [], fields = [] } = opts;
  const th = THEMES[theme] || THEMES.eng;
  const density = opts.density != null ? opts.density : (th.density || 0.085);
  const rng = makeRng(seed * 7919 + 13);
  const map = new GameMap(w, h, theme);
  const centers = bases.map((b) => ({ x: b.tx + 2, y: b.ty + 2 }));
  const clear = centers.map((c) => ({ x: c.x, y: c.y, r: 9.5 }))
    .concat(fields.map((f) => ({ x: f.tx + 1, y: f.ty + 1, r: 5 })));
  const isClear = (x, y) => clear.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r);

  // Every base must reach every other base (and every expansion field).
  const targets = centers.concat(fields.map((f) => ({ x: f.tx + 1, y: f.ty + 1 })));
  const connected = () => {
    if (targets.length < 2) return true;
    const seen = new Uint8Array(w * h);
    const q = [targets[0].y * w + targets[0].x];
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop();
      const cx = c % w, cy = (c - cx) / w;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS8[k][0], ny = cy + DIRS8[k][1];
        if (!map.terrainOpen(nx, ny)) continue;
        const ni = ny * w + nx;
        if (!seen[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
    return targets.every((t) => seen[t.y * w + t.x]);
  };

  const blobCount = Math.floor((w * h * density) / 9);
  for (let i = 0; i < blobCount; i++) {
    const cx = 2 + rng() * (w - 4), cy = 2 + rng() * (h - 4);
    const type = rng() < th.lakeChance ? T_WATER : T_ROCK;
    const r = 1.2 + rng() * (type === T_WATER ? 2.6 : 2.0);
    const changed = [];
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!map.inBounds(x, y) || isClear(x, y)) continue;
        const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) + (rng() - 0.5) * 0.9;
        if (d < r && map.tiles[y * w + x] === T_GROUND) { map.tiles[y * w + x] = type; changed.push(y * w + x); }
      }
    }
    if (!connected()) for (const c of changed) map.tiles[c] = T_GROUND;
  }
  // Remove lonely single obstacle tiles; they look odd.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = map.tiles[y * w + x];
    if (t === T_GROUND) continue;
    let same = 0;
    for (let k = 0; k < 4; k++) if (map.inBounds(x + DIRS8[k][0], y + DIRS8[k][1]) && map.tiles[(y + DIRS8[k][1]) * w + x + DIRS8[k][0]] === t) same++;
    if (same === 0) map.tiles[y * w + x] = T_GROUND;
  }

  // Crystal fields: an arc behind each base, facing away from the map centre.
  const crystals = [];
  const mcx = w / 2, mcy = h / 2;
  const placeCrystal = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
    if (!map.terrainOpen(x, y)) return false;
    if (crystals.some((c) => c.tx === x && c.ty === y)) return false;
    if (bases.some((b) => x >= b.tx - 1 && x <= b.tx + 4 && y >= b.ty - 1 && y <= b.ty + 4)) return false;
    crystals.push({ tx: x, ty: y });
    return true;
  };
  for (const c of centers) {
    let dx = c.x - mcx, dy = c.y - mcy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const base = Math.atan2(dy, dx);
    // Walk outwards from the preferred direction, alternating sides, so the
    // arc slides along the map edge when a base sits in a corner.
    const count = opts.crystalsPerBase || 8;
    let placed = 0;
    for (const rr of [5.6, 6.8]) {
      for (let k = 0; k < 42 && placed < count; k++) {
        const off = Math.ceil(k / 2) * 0.16 * (k % 2 ? 1 : -1);
        if (placeCrystal(c.x - 0.5 + Math.cos(base + off) * rr, c.y - 0.5 + Math.sin(base + off) * rr)) placed++;
      }
    }
  }
  for (const f of fields) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      placeCrystal(f.tx + 1 + Math.cos(a) * 1.6, f.ty + 1 + Math.sin(a) * 1.6);
    }
  }

  // Decorations (purely visual).
  const decoCount = Math.floor(w * h * 0.06);
  for (let i = 0; i < decoCount; i++) {
    const x = rng() * w * TILE, y = rng() * h * TILE;
    if (!map.terrainOpen(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
    map.decos.push({
      x, y, type: th.deco[Math.floor(rng() * th.deco.length)],
      color: th.decoColors[Math.floor(rng() * th.decoColors.length)], s: 0.7 + rng() * 0.6, r: rng(),
    });
  }
  return { map, crystals };
}

// Standard start positions (top-left tile of a 4x4 base) for skirmish maps.
function skirmishStarts(w, h, n) {
  const all = [
    { tx: 4, ty: 4 }, { tx: w - 8, ty: h - 8 }, { tx: w - 8, ty: 4 }, { tx: 4, ty: h - 8 },
  ];
  return all.slice(0, n);
}
