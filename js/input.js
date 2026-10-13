'use strict';
// Mouse, touch and keyboard input, with two control styles:
//
// StarCraft mode (this.sc = true)
//  - left click selects, drag selects many, double click / Ctrl+click selects all of a type
//  - right click: move (plain), attack an enemy, gather crystals, return cargo, set rally point
//  - Q attack-move (then left click), X stop, H hold position, Shift queues orders
//  - Ctrl+1-9 make a control group, 1-9 select it (press twice to jump to it)
//  - every command button has a letter hotkey shown on it
//
// Simple mode (this.sc = false), for young children
//  - left click on the ground commands the selected units (fighters attack-move)
//  - right click is a plain move, number keys press the command buttons
//
// Both: WASD / arrow keys / screen edges move the camera, mouse wheel zooms,
// Space jumps home, F1 selects an idle worker, F2 selects the whole army,
// one-finger touch drag pans.

const BOTTOM_BAR = 172;
const CAMERA_KEYS = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0], ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] };
// Letters with a fixed meaning in StarCraft mode (never used for button hotkeys).
const RESERVED_KEYS = ['W', 'A', 'S', 'D', 'Q', 'X', 'H', 'P'];

class Input {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.mm = minimap;
    this.game = null; this.cam = null; this.hud = null;
    this.enabled = false;
    this.sc = true;
    this.mode = null; // {type:'build', what} | {type:'move'} | {type:'attack'} | {type:'rally'}
    this.pointers = new Map();
    this.drag = null;
    this.pan = null;
    this.mouse = { x: -1, y: -1, wx: 0, wy: 0, in: false, type: 'mouse' };
    this.win = { x: -1, y: -1, active: false };
    this.keys = new Set();
    this.lastClick = { t: 0, id: -1 };
    this.lastGroup = { n: -1, t: 0 };
    this.groups = {};
    this.hover = null;
    this.onPause = null;
    this.bind();
  }

  attach(game, cam, hud) {
    if (this.game !== game) { this.groups = {}; this.idleIdx = 0; }
    this.game = game; this.cam = cam; this.hud = hud;
    this.setMode(null); this.drag = null; this.enabled = true;
  }
  detach() { this.enabled = false; this.setMode(null); this.drag = null; this.keys.clear(); }

  setMode(m) {
    this.mode = m;
    this.canvas.style.cursor = !m ? '' : m.type === 'attack' ? 'crosshair' : m.type === 'build' ? 'cell' : 'pointer';
    if (this.hud) this.hud.dirty = true;
  }

  // The renderer decides the view: K = ground units per screen pixel vertically
  // (larger than 1 when the camera is tilted).
  get K() { return this.R ? this.R.K : 1; }
  toWorld(sx, sy) { return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + (sy * this.K) / this.cam.zoom }; }
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
    // minimap: left = look there, right = command there
    const mmDown = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const p = this.local(e, this.mm);
      const r = this.mm.getBoundingClientRect();
      const wx = (p.x / r.width) * this.game.map.pxW, wy = (p.y / r.height) * this.game.map.pxH;
      if (e.button === 2) { this.command(wx, wy, null, { queue: e.shiftKey }); return; }
      if (this.mode && this.mode.type === 'attack') { this.attackClick(wx, wy, null, e.shiftKey); return; }
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
    cam.y = y - ((cam.h - BOTTOM_BAR) * this.K) / cam.zoom / 2;
    this.clampCam();
  }

  clampCam() {
    const cam = this.cam, map = this.game.map, m = 60;
    const vw = cam.w / cam.zoom, vh = ((cam.h - BOTTOM_BAR) * this.K) / cam.zoom;
    const top = (-54 * this.K) / cam.zoom - m;
    if (vw >= map.pxW + 2 * m) cam.x = (map.pxW - vw) / 2; else cam.x = clamp(cam.x, -m, map.pxW - vw + m);
    if (vh >= map.pxH + 2 * m) cam.y = (map.pxH - vh) / 2; else cam.y = clamp(cam.y, top, map.pxH - vh + m);
  }

  // ---------- picking ----------
  // What is under screen point (sx, sy)? Units first, then buildings, then crystals.
  pick(sx, sy) {
    const g = this.game, R = this.R, z = this.cam.zoom;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      const p = R.project(u.x, u.y, u.air ? AIR_H : u.radius * 1.1);
      const d = dist(sx, sy, p.x, p.y);
      if (d < (u.radius * 1.3 + 9) * z && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    const front = g.buildings.slice().sort((a, b) => b.y - a.y);
    for (const b of front) {
      const r = R.buildingScreenBox(b);
      if (sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1) return b;
    }
    for (const r of g.resources) {
      const p = R.project(r.x, r.y, 10);
      if (dist(sx, sy, p.x, p.y) < 20 * z) return r;
    }
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
    if (this.mode && this.mode.type !== 'build') this.setMode(null);
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

  // Select the next worker that has nothing to do and look at it.
  selectIdleWorker() {
    const g = this.game;
    const idle = g.units.filter((u) => u.team === g.player && u.def.worker && !u.dead && u.state === 'idle');
    if (!idle.length) { g.msg('Ingen byggere står og venter.'); return; }
    this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length;
    const u = idle[this.idleIdx];
    this.select([u]);
    this.centerOn(u.x, u.y);
    Sound.play('select');
  }

  selectSameOnScreen(ent) {
    const g = this.game, v = g.view, P = g.player;
    const list = ent.kind === 'unit'
      ? g.units.filter((u) => u.team === P && u.type === ent.type && u.x > v.x && u.x < v.x + v.w && u.y > v.y && u.y < v.y + v.h)
      : g.buildings.filter((b) => b.team === P && b.type === ent.type && b.x > v.x && b.x < v.x + v.w && b.y > v.y && b.y < v.y + v.h);
    this.select(list.length ? list : [ent]);
  }

  // ---------- control groups (StarCraft mode) ----------
  groupKey(n, ctrl, shift) {
    const g = this.game, P = g.player;
    const own = g.selection.filter((e) => e.team === P && !e.dead);
    if (ctrl || shift) {
      if (!own.length) return;
      const set = shift ? (this.groups[n] || []).filter((e) => !e.dead) : [];
      for (const e of own) if (!set.includes(e)) set.push(e);
      this.groups[n] = set;
      g.msg(`Gruppe ${n} lagret (${set.length}).`);
      this.hud.dirty = true;
      return;
    }
    const list = (this.groups[n] || []).filter((e) => !e.dead);
    this.groups[n] = list;
    if (!list.length) return;
    const now = performance.now();
    if (this.lastGroup.n === n && now - this.lastGroup.t < 400) {
      let x = 0, y = 0;
      for (const e of list) { x += e.x; y += e.y; }
      this.centerOn(x / list.length, y / list.length);
    }
    this.lastGroup = { n, t: now };
    this.select(list);
    Sound.play('select');
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
    if (e.button === 2) { this.rightClick(p.x, p.y, e.shiftKey); return; }
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
      this.cam.y = this.pan.cy - ((a.y - this.pan.y) * this.K) / this.cam.zoom;
      this.clampCam();
      return;
    }
    if (this.drag) {
      this.drag.x1 = p.x; this.drag.y1 = p.y;
      if (dist(this.drag.x0, this.drag.y0, p.x, p.y) > (this.drag.touch ? 14 : 8)) this.drag.moved = true;
      if (this.drag.touch && this.drag.moved && !this.mode) {
        this.cam.x = this.drag.cx - (p.x - this.drag.x0) / this.cam.zoom;
        this.cam.y = this.drag.cy - ((p.y - this.drag.y0) * this.K) / this.cam.zoom;
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
    this.click(p.x, p.y, e.shiftKey, e.ctrlKey || e.metaKey);
  }

  onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.local(e);
    const before = this.toWorld(p.x, p.y);
    const z = clamp(this.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.55, 1.6);
    this.cam.zoom = z;
    this.cam.x = before.x - p.x / z;
    this.cam.y = before.y - (p.y * this.K) / z;
    this.clampCam();
  }

  boxSelect(d, add) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const g = this.game, pad = 8;
    let list = g.units.filter((u) => {
      if (u.team !== g.player || u.dead) return false;
      const p = this.R.project(u.x, u.y, u.air ? AIR_H : u.radius * 0.8);
      return p.x >= x0 - pad && p.x <= x1 + pad && p.y >= y0 - pad && p.y <= y1 + pad;
    });
    // Like StarCraft: a box with soldiers in it ignores the workers.
    if (this.sc && list.some((u) => u.def.dmg)) list = list.filter((u) => u.def.dmg);
    if (list.length) {
      if (add) this.select(g.selection.concat(list.filter((u) => !g.selection.includes(u))));
      else this.select(list);
      Sound.play('select');
    } else if (!add) this.select([]);
  }

  click(sx, sy, shift, ctrl) {
    const g = this.game, P = g.player;
    const w = this.toWorld(sx, sy);
    const ent = this.pick(sx, sy);
    if (this.mode) {
      const m = this.mode;
      if (m.type === 'build') { this.tryPlace(w.x, w.y, shift); return; }
      if (m.type === 'attack') { this.attackClick(w.x, w.y, ent, shift); return; }
      if (m.type === 'move') { if (!shift) this.setMode(null); this.command(w.x, w.y, ent, { moveOnly: true, queue: shift }); return; }
      if (m.type === 'rally') { this.setMode(null); this.setRally(w.x, w.y, ent); return; }
    }
    if (ent && ent.kind !== 'resource' && ent.team === P) {
      const now = performance.now();
      const dbl = now - this.lastClick.t < 380 && this.lastClick.id === ent.id;
      if (ctrl || (dbl && ent.kind === 'unit')) this.selectSameOnScreen(ent);
      else this.select([ent], shift);
      this.lastClick = { t: now, id: ent.id };
      Sound.play('select');
      return;
    }
    if (this.sc) {
      // StarCraft mode: left click only selects.
      if (ent) this.select([ent]); else if (!shift) this.select([]);
      return;
    }
    if (this.ownSelectedUnits().length) { this.command(w.x, w.y, ent, { attackMove: true }); return; }
    this.select(ent ? [ent] : []);
  }

  rightClick(sx, sy, shift) {
    if (this.mode) { this.setMode(null); return; }
    const w = this.toWorld(sx, sy);
    const ent = this.pick(sx, sy);
    if (this.ownSelectedUnits().length) this.command(w.x, w.y, ent, { queue: shift });
    else this.setRally(w.x, w.y, ent);
  }

  setRally(x, y, ent) {
    const g = this.game;
    const bs = g.selection.filter((e) => e.kind === 'building' && e.team === g.player && e.def.trains);
    if (!bs.length) return;
    for (const b of bs) g.setRally(b, x, y, ent && ent.kind === 'resource' ? ent : null);
    g.effects.push({ type: 'ring', x, y, t: 0, life: 0.5, color: '#ffe14d' });
    Sound.play('order');
  }

  // Attack-move click (Q in StarCraft mode): fight everything on the way.
  attackClick(x, y, ent, queue) {
    const g = this.game;
    const fighters = this.ownSelectedUnits().filter((u) => u.def.dmg);
    if (!queue) this.setMode(null);
    if (!fighters.length) return;
    if (ent && ent.team != null && ent.team >= 0 && g.isEnemy(g.player, ent.team)) g.cmdAttack(fighters, ent, queue);
    else g.cmdMove(fighters, x, y, true, queue);
    g.effects.push({ type: 'ring', x, y, t: 0, life: 0.5, color: '#ff4d4d' });
    Sound.play('order');
  }

  // Order the selected units. opts: moveOnly (never fight), attackMove (fight on the way), queue (Shift).
  command(x, y, ent, opts = {}) {
    const g = this.game, P = g.player;
    const sel = this.ownSelectedUnits();
    if (!sel.length) { this.setRally(x, y, ent); return; }
    const q = !!opts.queue;
    const workers = sel.filter((u) => u.def.worker), fighters = sel.filter((u) => !u.def.worker);
    let color = '#3dff8a';
    if (ent && ent.kind === 'resource') {
      g.cmdGather(workers, ent);
      if (fighters.length) g.cmdMove(fighters, x, y, !!opts.attackMove, q);
      color = '#5ee6ff';
    } else if (ent && ent.team != null && ent.team >= 0 && g.isEnemy(P, ent.team) && !opts.moveOnly) {
      g.cmdAttack(fighters, ent, q);
      if (workers.length) g.cmdMove(workers, x, y, false, q);
      color = '#ff4d4d';
    } else if (ent && ent.kind === 'building' && ent.team === P && !ent.started && workers.length) {
      g.sendBuilder(workers[0], ent);
      if (fighters.length) g.cmdMove(fighters, x, y, false, q);
    } else if (ent && ent.kind === 'building' && ent.team === P && ent.def.isBase && workers.some((u) => u.carry > 0)) {
      g.cmdReturn(workers);
      if (fighters.length) g.cmdMove(fighters, x, y, false, q);
    } else {
      if (fighters.length) g.cmdMove(fighters, x, y, !!opts.attackMove && !opts.moveOnly, q);
      if (workers.length) g.cmdMove(workers, x, y, false, q);
      if (opts.attackMove && fighters.length) color = '#ff9a3d';
    }
    g.effects.push({ type: 'ring', x, y, t: 0, life: 0.5, color });
    Sound.play('order');
  }

  startBuild(type) { this.setMode({ type: 'build', what: type }); }

  tryPlace(wx, wy, keep) {
    const g = this.game, type = this.mode.what, s = BUILDINGS[type].size;
    const tx = Math.round(wx / TILE - s / 2), ty = Math.round(wy / TILE - s / 2);
    // Send the selected worker closest to the spot, if any.
    const cx = (tx + s / 2) * TILE, cy = (ty + s / 2) * TILE;
    const ws = this.ownSelectedUnits().filter((u) => u.def.worker).sort((a, b) => dist2(a.x, a.y, cx, cy) - dist2(b.x, b.y, cx, cy));
    const err = g.cmdBuild(g.player, type, tx, ty, ws[0]);
    if (err) { g.msg(err, 'alert'); Sound.play('error'); return; }
    if (!keep) this.setMode(null);
    this.hud.dirty = true;
  }

  // ---------- keyboard ----------
  onKey(e, down) {
    const code = e.code || '';
    if (!down) { this.keys.delete(code); return; }
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey && (code === 'KeyW' || code === 'KeyR')) return; // leave browser shortcuts alone
    this.keys.add(code);
    if (CAMERA_KEYS[code] || code === 'Space' || code === 'F1' || code === 'F2' || code === 'Tab') e.preventDefault();
    if (e.repeat && !CAMERA_KEYS[code]) return;
    const g = this.game;
    if (code === 'Escape') { if (this.mode) this.setMode(null); else this.select([]); return; }
    if (code === 'Space') { this.jumpHome(); return; }
    if (code === 'F1') { this.selectIdleWorker(); return; }
    if (code === 'F2') { this.selectArmy(); return; }
    if (code === 'KeyP') { if (this.onPause) this.onPause(); return; }
    if (CAMERA_KEYS[code]) return;
    const digit = /^Digit([1-9])$/.exec(code);
    if (this.sc) {
      if (digit) { e.preventDefault(); this.groupKey(parseInt(digit[1], 10), e.ctrlKey || e.metaKey, e.shiftKey); return; }
      if (code === 'KeyQ') {
        if (this.ownSelectedUnits().some((u) => u.def.dmg)) this.setMode({ type: 'attack' });
        return;
      }
      if (code === 'KeyX') { g.cmdStop(this.ownSelectedUnits()); this.hud.dirty = true; return; }
      if (code === 'KeyH') { g.cmdHold(this.ownSelectedUnits()); this.hud.dirty = true; return; }
      const letter = /^Key([A-Z])$/.exec(code);
      if (letter) this.hud.hotkeyLetter(letter[1]);
    } else if (digit) {
      this.hud.hotkey(parseInt(digit[1], 10) - 1);
    }
  }

  jumpHome() {
    const g = this.game;
    const bases = g.buildings.filter((x) => x.team === g.player && x.def.isBase);
    const list = bases.length ? bases : g.buildings.filter((x) => x.team === g.player);
    if (!list.length) return;
    // Pressing again cycles through your bases.
    this.homeIdx = ((this.homeIdx == null ? -1 : this.homeIdx) + 1) % list.length;
    this.centerOn(list[this.homeIdx].x, list[this.homeIdx].y);
  }

  // Called every frame: keyboard and edge scrolling.
  update(dt) {
    if (!this.enabled) return;
    const cam = this.cam;
    const sp = (750 * dt) / cam.zoom;
    let dx = 0, dy = 0;
    for (const code of this.keys) {
      const v = CAMERA_KEYS[code];
      if (v) { dx += v[0] * sp; dy += v[1] * sp * this.K; }
    }
    if (this.win.active && this.mouse.type === 'mouse' && !this.drag && !this.mmDrag) {
      const e = 6;
      if (this.win.x <= e) dx -= sp;
      if (this.win.x >= window.innerWidth - e) dx += sp;
      if (this.win.y <= e) dy -= sp * this.K;
      if (this.win.y >= window.innerHeight - e) dy += sp * this.K;
    }
    if (dx || dy) { cam.x += dx; cam.y += dy; this.clampCam(); }
    if (this.mouse.in) {
      const w = this.toWorld(this.mouse.x, this.mouse.y);
      this.mouse.wx = w.x; this.mouse.wy = w.y;
      this.hover = this.pick(this.mouse.x, this.mouse.y);
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
