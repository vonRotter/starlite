'use strict';
// Mouse, touch and keyboard input. Designed for children:
//  - left click on a unit selects it; left click on the ground/enemy commands
//    the selected units (right click works too, like classic RTS games)
//  - fighters walk in "attack-move" by default, so they fight what they meet
//  - one-finger touch drag pans the map; drag with the mouse draws a selection box

const BOTTOM_BAR = 172;

class Input {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.mm = minimap;
    this.game = null; this.cam = null; this.hud = null;
    this.enabled = false;
    this.mode = null; // {type:'build', what} | {type:'move'} | {type:'rally'}
    this.pointers = new Map();
    this.drag = null;
    this.pan = null;
    this.mouse = { x: -1, y: -1, wx: 0, wy: 0, in: false, type: 'mouse' };
    this.win = { x: -1, y: -1, active: false };
    this.keys = new Set();
    this.lastClick = { t: 0, id: -1 };
    this.hover = null;
    this.onPause = null;
    this.bind();
  }

  attach(game, cam, hud) {
    this.game = game; this.cam = cam; this.hud = hud;
    this.mode = null; this.drag = null; this.enabled = true;
  }
  detach() { this.enabled = false; this.mode = null; this.drag = null; }

  toWorld(sx, sy) { return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom }; }
  local(e, el) { const r = (el || this.canvas).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.mm.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.drag = null; this.pan = null; });
    c.addEventListener('pointerleave', () => { this.mouse.in = false; });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('mousemove', (e) => { this.win.x = e.clientX; this.win.y = e.clientY; this.win.active = true; });
    document.addEventListener('mouseleave', () => { this.win.active = false; });
    window.addEventListener('blur', () => { this.win.active = false; this.keys.clear(); });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // minimap
    const mmDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const p = this.local(e, this.mm);
      const r = this.mm.getBoundingClientRect();
      const wx = (p.x / r.width) * this.game.map.pxW, wy = (p.y / r.height) * this.game.map.pxH;
      if (e.button === 2) { this.command(wx, wy, null); return; }
      this.mm.setPointerCapture(e.pointerId);
      this.mmDrag = true;
      this.centerOn(wx, wy);
    };
    this.mm.addEventListener('pointerdown', mmDown);
    this.mm.addEventListener('pointermove', (e) => {
      if (!this.mmDrag || !this.enabled) return;
      const p = this.local(e, this.mm), r = this.mm.getBoundingClientRect();
      this.centerOn((p.x / r.width) * this.game.map.pxW, (p.y / r.height) * this.game.map.pxH);
    });
    this.mm.addEventListener('pointerup', () => { this.mmDrag = false; });
  }

  centerOn(x, y) {
    const cam = this.cam;
    cam.x = x - cam.w / cam.zoom / 2;
    cam.y = y - (cam.h - BOTTOM_BAR) / cam.zoom / 2;
    this.clampCam();
  }

  clampCam() {
    const cam = this.cam, map = this.game.map, m = 60;
    const vw = cam.w / cam.zoom, vh = (cam.h - BOTTOM_BAR) / cam.zoom;
    const top = -54 / cam.zoom - m;
    if (vw >= map.pxW + 2 * m) cam.x = (map.pxW - vw) / 2; else cam.x = clamp(cam.x, -m, map.pxW - vw + m);
    if (vh >= map.pxH + 2 * m) cam.y = (map.pxH - vh) / 2; else cam.y = clamp(cam.y, top, map.pxH - vh + m);
  }

  // ---------- picking ----------
  pick(wx, wy) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      const uy = u.air ? u.y - 22 : u.y;
      const d = dist(wx, wy, u.x, uy);
      if (d < u.radius + 9 && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    for (const b of g.buildings) {
      const S = b.size * TILE;
      if (wx > b.x - S / 2 && wx < b.x + S / 2 && wy > b.y - S / 2 - 14 && wy < b.y + S / 2) return b;
    }
    for (const r of g.resources) if (dist(wx, wy, r.x, r.y) < 20) return r;
    return null;
  }

  ownSelectedUnits() {
    const P = this.game.player;
    return this.game.selection.filter((e) => e.kind === 'unit' && e.team === P && !e.dead);
  }

  select(list, add) {
    const g = this.game;
    if (add) {
      for (const e of list) {
        const i = g.selection.indexOf(e);
        if (i >= 0) g.selection.splice(i, 1); else g.selection.push(e);
      }
    } else g.selection = list.slice();
    // Never mix own and foreign things.
    const P = g.player;
    if (g.selection.some((e) => e.team === P)) g.selection = g.selection.filter((e) => e.team === P);
    else if (g.selection.length > 1) g.selection = g.selection.slice(0, 1);
    // Units win over buildings in a mixed selection.
    if (g.selection.some((e) => e.kind === 'unit') && g.selection.some((e) => e.kind !== 'unit')) {
      g.selection = g.selection.filter((e) => e.kind === 'unit');
    }
    if (this.hud) this.hud.dirty = true;
  }

  selectArmy() {
    const g = this.game;
    const army = g.units.filter((u) => u.team === g.player && u.def.dmg && !u.dead);
    this.select(army);
    if (!army.length) g.msg('Du har ingen soldater ennå.');
    else Sound.play('select');
  }

  selectWorkers() {
    const g = this.game;
    this.select(g.units.filter((u) => u.team === g.player && u.def.worker && !u.dead));
  }

  // ---------- pointer ----------
  onDown(e) {
    if (!this.enabled) return;
    const p = this.local(e);
    this.mouse.type = e.pointerType;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, p);
    Sound.ensure();
    if (this.pointers.size === 2) {
      this.drag = null;
      this.pan = { ...this.avgPointer(), cx: this.cam.x, cy: this.cam.y };
      return;
    }
    if (e.button === 2) { this.rightClick(p.x, p.y); return; }
    if (e.button === 1) { this.pan = { x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y }; return; }
    this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false, touch: e.pointerType === 'touch', shift: e.shiftKey, cx: this.cam.x, cy: this.cam.y };
  }

  avgPointer() {
    let x = 0, y = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }

  onMove(e) {
    const p = this.local(e);
    this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.in = true; this.mouse.type = e.pointerType;
    if (!this.enabled) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pan) {
      const a = this.pointers.size >= 2 ? this.avgPointer() : p;
      this.cam.x = this.pan.cx - (a.x - this.pan.x) / this.cam.zoom;
      this.cam.y = this.pan.cy - (a.y - this.pan.y) / this.cam.zoom;
      this.clampCam();
      return;
    }
    if (this.drag) {
      this.drag.x1 = p.x; this.drag.y1 = p.y;
      if (dist(this.drag.x0, this.drag.y0, p.x, p.y) > (this.drag.touch ? 14 : 8)) this.drag.moved = true;
      if (this.drag.touch && this.drag.moved && !this.mode) {
        this.cam.x = this.drag.cx - (p.x - this.drag.x0) / this.cam.zoom;
        this.cam.y = this.drag.cy - (p.y - this.drag.y0) / this.cam.zoom;
        this.clampCam();
      }
    }
  }

  onUp(e) {
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (!this.enabled) return;
    if (this.pan) { if (this.pointers.size === 0) this.pan = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d || e.button === 2) return;
    if (d.moved) {
      if (!d.touch && !this.mode) this.boxSelect(d, e.shiftKey);
      return;
    }
    this.click(p.x, p.y, e.shiftKey);
  }

  onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.local(e);
    const before = this.toWorld(p.x, p.y);
    const z = clamp(this.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.55, 1.6);
    this.cam.zoom = z;
    this.cam.x = before.x - p.x / z;
    this.cam.y = before.y - p.y / z;
    this.clampCam();
  }

  boxSelect(d, add) {
    const a = this.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
    const b = this.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
    const g = this.game;
    const list = g.units.filter((u) => u.team === g.player && !u.dead && u.x >= a.x - u.radius && u.x <= b.x + u.radius &&
      (u.air ? u.y - 22 : u.y) >= a.y - u.radius && (u.air ? u.y - 22 : u.y) <= b.y + u.radius);
    if (list.length) { this.select(list, add); Sound.play('select'); }
    else if (!add) this.select([]);
  }

  click(sx, sy, shift) {
    const g = this.game, P = g.player;
    const w = this.toWorld(sx, sy);
    const ent = this.pick(w.x, w.y);
    if (this.mode) {
      const m = this.mode;
      if (m.type === 'build') { this.tryPlace(w.x, w.y, shift); return; }
      if (m.type === 'move') { this.mode = null; this.command(w.x, w.y, ent, true); this.hud.dirty = true; return; }
      if (m.type === 'rally') { this.mode = null; this.setRally(w.x, w.y, ent); this.hud.dirty = true; return; }
    }
    if (ent && ent.kind !== 'resource' && ent.team === P) {
      const now = performance.now();
      if (ent.kind === 'unit' && now - this.lastClick.t < 380 && this.lastClick.id === ent.id) {
        // Double click: everything of that type on screen.
        const v = g.view;
        this.select(g.units.filter((u) => u.team === P && u.type === ent.type && u.x > v.x && u.x < v.x + v.w && u.y > v.y && u.y < v.y + v.h));
      } else this.select([ent], shift);
      this.lastClick = { t: now, id: ent.id };
      Sound.play('select');
      return;
    }
    if (this.ownSelectedUnits().length) { this.command(w.x, w.y, ent); return; }
    this.select(ent ? [ent] : []);
  }

  rightClick(sx, sy) {
    if (this.mode) { this.mode = null; this.hud.dirty = true; return; }
    const w = this.toWorld(sx, sy);
    const ent = this.pick(w.x, w.y);
    if (this.ownSelectedUnits().length) this.command(w.x, w.y, ent);
    else this.setRally(w.x, w.y, ent);
  }

  setRally(x, y, ent) {
    const g = this.game;
    const b = g.selection.find((e) => e.kind === 'building' && e.team === g.player && e.def.trains);
    if (!b) return;
    g.setRally(b, x, y, ent && ent.kind === 'resource' ? ent : null);
    g.effects.push({ type: 'ring', x, y, t: 0, life: 0.5, color: '#ffe14d' });
    Sound.play('order');
  }

  // Order the selected units. moveOnly = walk without stopping to fight.
  command(x, y, ent, moveOnly) {
    const g = this.game, P = g.player;
    const sel = this.ownSelectedUnits();
    if (!sel.length) { this.setRally(x, y, ent); return; }
    const workers = sel.filter((u) => u.def.worker), fighters = sel.filter((u) => !u.def.worker);
    let color = '#3dff8a';
    if (ent && ent.kind === 'resource') {
      g.cmdGather(workers, ent);
      if (fighters.length) g.cmdMove(fighters, x, y, !moveOnly);
      color = '#5ee6ff';
    } else if (ent && ent.team != null && ent.team >= 0 && g.isEnemy(P, ent.team) && !moveOnly) {
      g.cmdAttack(fighters, ent);
      if (workers.length) g.cmdMove(workers, x, y, false);
      color = '#ff4d4d';
    } else if (ent && ent.kind === 'building' && ent.team === P && ent.def.isBase && workers.some((u) => u.carry > 0)) {
      g.cmdReturn(workers);
      if (fighters.length) g.cmdMove(fighters, x, y, !moveOnly);
    } else {
      if (fighters.length) g.cmdMove(fighters, x, y, !moveOnly);
      if (workers.length) g.cmdMove(workers, x, y, false);
    }
    g.effects.push({ type: 'ring', x, y, t: 0, life: 0.5, color });
    Sound.play('order');
  }

  startBuild(type) {
    this.mode = { type: 'build', what: type };
    this.hud.dirty = true;
  }

  tryPlace(wx, wy, keep) {
    const g = this.game, type = this.mode.what, s = BUILDINGS[type].size;
    const tx = Math.round(wx / TILE - s / 2), ty = Math.round(wy / TILE - s / 2);
    const err = g.cmdBuild(g.player, type, tx, ty);
    if (err) { g.msg(err, 'alert'); Sound.play('error'); return; }
    if (!keep) this.mode = null;
    this.hud.dirty = true;
  }

  // ---------- keyboard ----------
  onKey(e, down) {
    if (!this.enabled) return;
    const k = e.key;
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (!down) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (k === 'Escape') {
      if (this.mode) this.mode = null; else this.select([]);
      this.hud.dirty = true;
    } else if (k === 'a' || k === 'A') this.selectArmy();
    else if (k === 'b' || k === 'B') this.selectWorkers();
    else if (k === ' ') { e.preventDefault(); this.jumpHome(); }
    else if (k === 'p' || k === 'P') { if (this.onPause) this.onPause(); }
    else if (k === 's' || k === 'S') { this.game.cmdStop(this.ownSelectedUnits()); }
    else if (/^[1-9]$/.test(k)) this.hud.hotkey(parseInt(k, 10) - 1);
    if (k.startsWith('Arrow')) e.preventDefault();
  }

  jumpHome() {
    const g = this.game;
    const b = g.buildings.find((x) => x.team === g.player && x.def.isBase) || g.buildings.find((x) => x.team === g.player);
    if (b) this.centerOn(b.x, b.y);
  }

  // Called every frame: keyboard and edge scrolling.
  update(dt) {
    if (!this.enabled) return;
    const cam = this.cam;
    const sp = (700 * dt) / cam.zoom;
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= sp;
    if (this.keys.has('ArrowRight')) dx += sp;
    if (this.keys.has('ArrowUp')) dy -= sp;
    if (this.keys.has('ArrowDown')) dy += sp;
    if (this.win.active && this.mouse.type === 'mouse' && !this.drag && !this.mmDrag) {
      const e = 6;
      if (this.win.x <= e) dx -= sp;
      if (this.win.x >= window.innerWidth - e) dx += sp;
      if (this.win.y <= e) dy -= sp;
      if (this.win.y >= window.innerHeight - e) dy += sp;
    }
    if (dx || dy) { cam.x += dx; cam.y += dy; this.clampCam(); }
    if (this.mouse.in) {
      const w = this.toWorld(this.mouse.x, this.mouse.y);
      this.mouse.wx = w.x; this.mouse.wy = w.y;
      this.hover = this.pick(w.x, w.y);
    } else this.hover = null;
  }

  viewState() {
    const st = { hover: this.hover, ghost: null, box: null };
    if (this.mode && this.mode.type === 'build' && this.mouse.in) {
      const s = BUILDINGS[this.mode.what].size;
      const tx = Math.round(this.mouse.wx / TILE - s / 2), ty = Math.round(this.mouse.wy / TILE - s / 2);
      const g = this.game;
      st.ghost = { type: this.mode.what, tx, ty, ok: !g.canPlace(g.player, this.mode.what, tx, ty) && g.teams[g.player].crystals >= BUILDINGS[this.mode.what].cost };
    }
    if (this.drag && this.drag.moved && !this.drag.touch && !this.mode) st.box = this.drag;
    return st;
  }
}
