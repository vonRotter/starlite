'use strict';
// Core simulation: teams, units, buildings, crystals, projectiles, objectives.
// Rendering and input live elsewhere; this file has no DOM access except the
// off-screen paint canvas.

let NEXT_ID = 1;

class Game {
  // cfg = {
  //   map: {w, h, seed, theme, bases:[{tx,ty}], fields:[{tx,ty}]},
  //   teams: [{faction, color, name, isPlayer, ai (difficulty key) | null, allies:[ids],
  //            gloom, start:{tx,ty} | null, workers, crystals, noDefeat}],
  //   objectives: [...], protect: buildingType, onStart(game), script(game, dt), speed
  // }
  constructor(cfg) {
    this.cfg = cfg;
    this.time = 0;
    this.speed = cfg.speed || 1;
    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.effects = [];
    this.dying = [];
    this.selection = [];
    this.over = false;
    this.result = null; // 'win' | 'lose' | {winner}
    this.onMessage = null;
    this.onEnd = null;
    this.onObjective = null;
    this.sound = null; // (name, x, y) => void
    this.view = null;  // {x, y, w, h} camera rect, set by the renderer, used for sound culling
    this.lastAlert = -99;
    this.checkT = 0;
    this.stats = { made: 0 };

    const gen = generateMap(cfg.map);
    this.map = gen.map;
    this.paint = new PaintLayer(this.map);

    this.teams = cfg.teams.map((t, i) => ({
      id: i,
      faction: t.faction,
      f: FACTIONS[t.faction],
      name: t.name || FACTIONS[t.faction].name,
      colorKey: t.color,
      color: COLORS[t.color],
      crystals: t.crystals != null ? t.crystals : 100,
      alive: true,
      allies: (t.allies || []).slice(),
      isPlayer: !!t.isPlayer,
      gloom: !!t.gloom,
      noDefeat: !!t.noDefeat,
      gathered: 0, lost: 0, killed: 0, made: 0,
      incomeMult: 1,
      ai: null,
      aiKey: t.ai || null,
    }));
    for (const t of this.teams) for (const a of t.allies) {
      if (this.teams[a] && !this.teams[a].allies.includes(t.id)) this.teams[a].allies.push(t.id);
    }
    this.player = this.teams.findIndex((t) => t.isPlayer);

    for (const c of gen.crystals) this.spawnResource(c.tx, c.ty, CRYSTAL_AMOUNT);
    cfg.teams.forEach((t, i) => {
      if (!t.start) return;
      const b = this.spawnBuilding(i, FACTIONS[t.faction].base, t.start.tx, t.start.ty, true);
      const n = t.workers != null ? t.workers : 4;
      for (let k = 0; k < n; k++) {
        const u = this.spawnFrom(b, FACTIONS[t.faction].worker, true);
        if (u) this.gatherNearest(u);
      }
    });
    for (const t of this.teams) {
      if (t.aiKey) t.ai = new AI(this, t.id, t.aiKey, cfg.aiOpts && cfg.aiOpts[t.id]);
    }
    this.objectives = (cfg.objectives || [{ type: 'destroyAll' }]).map((o) => Object.assign({ done: false }, o));
    if (cfg.onStart) cfg.onStart(this);
  }

  // ---------- helpers ----------
  isEnemy(a, b) { return a !== b && !this.teams[a].allies.includes(b); }
  teamUnits(team) { return this.units.filter((u) => u.team === team && !u.dead); }
  teamBuildings(team) { return this.buildings.filter((b) => b.team === team && !b.dead); }
  unitCount(team) {
    let n = 0;
    for (const u of this.units) if (u.team === team && !u.dead) n++;
    for (const b of this.buildings) if (b.team === team && !b.dead) n += b.queue.length;
    return n;
  }
  canHit(def, e) { return e.air ? !!def.hitsAir : def.hitsGround !== false; }
  msg(text, kind = 'info') { if (this.onMessage) this.onMessage(text, kind); }
  sfx(name, x, y) {
    if (!this.sound) return;
    if (x != null && this.view) {
      const v = this.view, m = 80;
      if (x < v.x - m || y < v.y - m || x > v.x + v.w + m || y > v.y + v.h + m) return;
    }
    this.sound(name);
  }
  distToRect(x, y, rect) {
    const x0 = rect[0] * TILE, y0 = rect[1] * TILE, x1 = (rect[2] + 1) * TILE, y1 = (rect[3] + 1) * TILE;
    const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Distance from a unit's edge to the edge of e.
  edgeDist(u, e) {
    if (e.kind === 'building' || e.kind === 'resource') return this.distToRect(u.x, u.y, e.rect) - u.radius;
    return dist(u.x, u.y, e.x, e.y) - u.radius - e.radius;
  }

  // ---------- spawning ----------
  spawnUnit(team, type, x, y) {
    const d = UNITS[type];
    const u = {
      id: NEXT_ID++, kind: 'unit', type, def: d, team, x, y,
      hp: d.hp, maxHp: d.hp, shield: d.shield || 0, maxShield: d.shield || 0,
      radius: d.radius, air: !!d.air, state: 'idle', path: null, pathI: 0,
      target: null, cooldown: 0, carry: 0, res: null, facing: 1, anim: Math.random() * 10,
      lastHit: -99, hitFlash: 0, attackAnim: 0, nextScan: 0, amGoal: null, anchor: null,
      stuckT: 0, stuckN: 0, lastX: x, lastY: y, repathAt: 0, mineT: 0, born: this.time,
      moving: false, paintDist: 0, dead: false,
    };
    this.units.push(u);
    return u;
  }

  spawnBuilding(team, type, tx, ty, built) {
    const d = BUILDINGS[type], s = d.size;
    const b = {
      id: NEXT_ID++, kind: 'building', type, def: d, team, tx, ty, size: s,
      x: (tx + s / 2) * TILE, y: (ty + s / 2) * TILE, radius: s * TILE * 0.5,
      hp: built ? d.hp : d.hp * 0.1, maxHp: d.hp,
      shield: built ? d.shield || 0 : 0, maxShield: d.shield || 0,
      built: built ? 1 : 0, queue: [], prog: 0, rally: null, cooldown: 0, target: null,
      nextScan: 0, lastHit: -99, hitFlash: 0, aim: 0, rect: [tx, ty, tx + s - 1, ty + s - 1],
      dead: false, born: this.time,
    };
    this.map.occupy(tx, ty, s, s, 1);
    this.buildings.push(b);
    // Shove units that stand where the building appears.
    for (const u of this.units) {
      if (u.air || u.dead) continue;
      const utx = Math.floor(u.x / TILE), uty = Math.floor(u.y / TILE);
      if (utx >= tx && uty >= ty && utx < tx + s && uty < ty + s) {
        const nw = this.map.nearestWalkable(utx, uty, 8);
        if (nw) { u.x = nw[0] * TILE + TILE / 2; u.y = nw[1] * TILE + TILE / 2; u.path = null; }
      }
    }
    return b;
  }

  // Place a ready building on the nearest free spot (used by mission scripts).
  spawnBuildingNear(team, type, tx, ty, built = true) {
    const s = BUILDINGS[type].size, map = this.map;
    for (let r = 0; r <= 10; r++) {
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        let ok = true;
        for (let yy = y - 1; yy <= y + s && ok; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
          if (!map.inBounds(xx, yy)) { if (xx >= x && xx < x + s && yy >= y && yy < y + s) { ok = false; break; } continue; }
          if (!map.walkable(xx, yy)) { ok = false; break; }
        }
        if (ok) return this.spawnBuilding(team, type, x, y, built);
      }
    }
    return null;
  }

  spawnResource(tx, ty, amount) {
    const r = {
      id: NEXT_ID++, kind: 'resource', tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
      radius: 14, amount, max: amount, rect: [tx, ty, tx, ty], dead: false, variant: (tx * 7 + ty * 13) % 3,
    };
    this.map.occupy(tx, ty, 1, 1, 1);
    this.resources.push(r);
    return r;
  }

  // Spawn a unit next to a building, on the side facing the rally point.
  spawnFrom(b, type, silent) {
    const d = UNITS[type];
    const goal = b.rally || { x: this.map.pxW / 2, y: this.map.pxH / 2 };
    let best = null, bd = Infinity;
    for (let ring = 1; ring <= 3 && !best; ring++) {
      for (let y = b.ty - ring; y < b.ty + b.size + ring; y++) {
        for (let x = b.tx - ring; x < b.tx + b.size + ring; x++) {
          const onRing = x === b.tx - ring || y === b.ty - ring || x === b.tx + b.size + ring - 1 || y === b.ty + b.size + ring - 1;
          if (!onRing || !this.map.walkable(x, y)) continue;
          const dd = dist2((x + 0.5) * TILE, (y + 0.5) * TILE, goal.x, goal.y);
          if (dd < bd) { bd = dd; best = [x, y]; }
        }
      }
    }
    let x, y;
    if (best) { x = (best[0] + 0.5) * TILE + (Math.random() - 0.5) * 8; y = (best[1] + 0.5) * TILE + (Math.random() - 0.5) * 8; }
    else if (d.air) { x = b.x; y = b.y + b.radius; }
    else return null;
    if (d.air && best == null) { x = b.x; y = b.y; }
    const u = this.spawnUnit(b.team, type, x, y);
    this.teams[b.team].made++;
    if (!silent) {
      this.burst(x, y, this.teams[b.team].color.light, 8);
      if (b.team === this.player) this.sfx('spawn', x, y);
    }
    if (b.rally) {
      if (b.rally.res && d.worker) this.cmdGather([u], b.rally.res);
      else this.cmdMove([u], b.rally.x, b.rally.y, !d.worker);
    } else if (d.worker && !silent) this.gatherNearest(u);
    return u;
  }

  // ---------- commands ----------
  formation(n, x, y, air) {
    const slots = [];
    const side = Math.ceil(Math.sqrt(n));
    const sp = 30;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / side), col = i % side;
      let sx = x + (col - (side - 1) / 2) * sp, sy = y + (row - (Math.ceil(n / side) - 1) / 2) * sp;
      sx = clamp(sx, 10, this.map.pxW - 10); sy = clamp(sy, 10, this.map.pxH - 10);
      if (!air && !this.map.walkablePx(sx, sy)) {
        const nw = this.map.nearestWalkable(Math.floor(sx / TILE), Math.floor(sy / TILE), 6);
        if (nw) { sx = (nw[0] + 0.5) * TILE; sy = (nw[1] + 0.5) * TILE; }
      }
      slots.push({ x: sx, y: sy });
    }
    return slots;
  }

  cmdMove(units, x, y, attackMove) {
    units = units.filter((u) => !u.dead);
    if (!units.length) return;
    const groups = [units.filter((u) => !u.air), units.filter((u) => u.air)];
    for (const g of groups) {
      if (!g.length) continue;
      const slots = this.formation(g.length, x, y, g[0].air);
      const left = g.slice().sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
      for (const u of left) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < slots.length; i++) {
          const dd = dist2(u.x, u.y, slots[i].x, slots[i].y);
          if (dd < bd) { bd = dd; bi = i; }
        }
        const s = slots.splice(bi, 1)[0];
        u.target = null; u.res = null; u.anchor = null;
        const am = attackMove && !!u.def.dmg;
        u.amGoal = am ? { x: s.x, y: s.y } : null;
        u.state = 'move';
        u.attackMove = am;
        u.goal = { x: s.x, y: s.y };
        this.setPath(u, u.goal);
      }
    }
  }

  cmdAttack(units, target) {
    for (const u of units) {
      if (u.dead) continue;
      if (!u.def.dmg || !this.canHit(u.def, target)) { this.cmdMove([u], target.x, target.y, true); continue; }
      u.target = target; u.state = 'attack'; u.amGoal = null; u.anchor = null; u.path = null; u.res = null;
    }
  }

  cmdGather(units, res) {
    for (const u of units) {
      if (u.dead || !u.def.worker) continue;
      u.res = res; u.state = u.carry > 0 ? 'return' : 'gather'; u.path = null; u.target = null; u.mineT = 0;
    }
  }

  cmdReturn(units) {
    for (const u of units) if (u.def.worker && u.carry > 0) { u.state = 'return'; u.path = null; }
  }

  cmdStop(units) {
    for (const u of units) { u.state = 'idle'; u.path = null; u.target = null; u.amGoal = null; u.anchor = null; u.res = null; }
  }

  gatherNearest(u) {
    const r = this.pickResource(u.x, u.y, u.team);
    if (r) this.cmdGather([u], r); else u.state = 'idle';
  }

  pickResource(x, y, team) {
    // Prefer close crystals that few workers are already using.
    const use = new Map();
    for (const w of this.units) if (w.team === team && w.res && !w.dead) use.set(w.res.id, (use.get(w.res.id) || 0) + 1);
    let best = null, bs = Infinity;
    for (const r of this.resources) {
      if (r.dead) continue;
      const s = dist(x, y, r.x, r.y) + (use.get(r.id) || 0) * 45;
      if (s < bs) { bs = s; best = r; }
    }
    return best;
  }

  cmdTrain(b, type) {
    const t = this.teams[b.team], d = UNITS[type];
    if (b.dead || b.built < 1) return 'Bygningen er ikke ferdig ennå.';
    if (!b.def.trains || !b.def.trains.includes(type)) return 'Kan ikke lage det her.';
    if (b.queue.length >= 5) return 'Køen er full.';
    if (t.crystals < d.cost) return 'Ikke nok krystaller!';
    if (this.unitCount(b.team) >= UNIT_CAP) return 'Du har for mange enheter!';
    t.crystals -= d.cost;
    b.queue.push(type);
    return null;
  }

  cancelTrain(b, idx) {
    if (idx < 0 || idx >= b.queue.length) return;
    const type = b.queue.splice(idx, 1)[0];
    this.teams[b.team].crystals += UNITS[type].cost;
    if (idx === 0) b.prog = 0;
  }

  canPlace(team, type, tx, ty) {
    const d = BUILDINGS[type], s = d.size;
    if (tx < 0 || ty < 0 || tx + s > this.map.w || ty + s > this.map.h) return 'Utenfor kartet.';
    if (!this.map.areaFree(tx, ty, s, s)) return 'Det er ikke plass her.';
    const cx = (tx + s / 2) * TILE, cy = (ty + s / 2) * TILE;
    const near = this.buildings.some((b) => !b.dead && b.team === team && dist(b.x, b.y, cx, cy) <= BUILD_RADIUS);
    if (!near) return 'Du kan bare bygge nær dine egne bygninger.';
    for (const u of this.units) {
      if (u.dead || u.air || !this.isEnemy(team, u.team)) continue;
      if (u.x > tx * TILE && u.x < (tx + s) * TILE && u.y > ty * TILE && u.y < (ty + s) * TILE) return 'Fienden står i veien.';
    }
    return null;
  }

  cmdBuild(team, type, tx, ty) {
    const t = this.teams[team], d = BUILDINGS[type];
    if (!t.f.builds.includes(type)) return 'Kan ikke bygge det.';
    if (t.crystals < d.cost) return 'Ikke nok krystaller!';
    const why = this.canPlace(team, type, tx, ty);
    if (why) return why;
    t.crystals -= d.cost;
    const b = this.spawnBuilding(team, type, tx, ty, false);
    this.burst(b.x, b.y, t.color.light, 14);
    if (team === this.player) this.sfx('build', b.x, b.y);
    // A nearby worker pops over to say hello (purely cosmetic, it then goes back to work).
    return null;
  }

  setRally(b, x, y, res) {
    b.rally = { x, y, res: res || null };
  }

  // ---------- update ----------
  update(dt) {
    if (this.over) { this.updateEffects(dt); return; }
    this.time += dt;
    for (const t of this.teams) if (t.ai && t.alive) t.ai.update(dt);
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    for (const b of this.buildings) if (!b.dead) this.updateBuilding(b, dt);
    this.updateProjectiles(dt);
    this.separate(dt);
    this.updateEffects(dt);
    if (this.cfg.script) this.cfg.script(this, dt);
    // Remove the dead.
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.buildings.some((b) => b.dead)) this.buildings = this.buildings.filter((b) => !b.dead);
    if (this.resources.some((r) => r.dead)) this.resources = this.resources.filter((r) => !r.dead);
    if (this.selection.some((e) => e.dead)) this.selection = this.selection.filter((e) => !e.dead);
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.25; this.checkEnd(); }
  }

  traitRegen(e, dt) {
    const f = this.teams[e.team].faction;
    const quiet = this.time - e.lastHit;
    if (f === 'summ' && e.hp < e.maxHp && (e.kind === 'unit' ? true : e.built >= 1)) {
      e.hp = Math.min(e.maxHp, e.hp + (e.kind === 'unit' ? 2.5 : 4) * dt);
    }
    if (f === 'stjerne' && e.kind === 'building' && e.built >= 1 && quiet > 5 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + 6 * dt);
    }
    if (e.maxShield > 0 && quiet > 4 && e.shield < e.maxShield && (e.kind === 'unit' || e.built >= 1)) {
      e.shield = Math.min(e.maxShield, e.shield + (e.kind === 'unit' ? 8 : 16) * dt);
    }
  }

  updateUnit(u, dt) {
    const d = u.def;
    u.anim += dt;
    if (u.cooldown > 0) u.cooldown -= dt;
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.attackAnim > 0) u.attackAnim -= dt;
    this.traitRegen(u, dt);
    u.moving = false;

    switch (u.state) {
      case 'idle': {
        if (d.dmg && this.time >= u.nextScan) {
          u.nextScan = this.time + 0.3 + Math.random() * 0.1;
          const t = this.findTarget(u, d.sight);
          if (t) { u.target = t; u.state = 'attack'; u.anchor = { x: u.x, y: u.y }; u.path = null; }
        }
        break;
      }
      case 'move': {
        if (u.attackMove && this.time >= u.nextScan) {
          u.nextScan = this.time + 0.3 + Math.random() * 0.1;
          const t = this.findTarget(u, d.sight);
          if (t) { u.target = t; u.state = 'attack'; u.path = null; break; }
        }
        if (this.followPath(u, dt)) {
          if (u.goal && dist(u.x, u.y, u.goal.x, u.goal.y) > 40 && u.stuckN < 3 && !u.pathGaveUp) {
            this.setPath(u, u.goal); // path was cut short; try again
            u.pathGaveUp = true;
          } else {
            u.state = 'idle'; u.amGoal = null; u.attackMove = false; u.pathGaveUp = false;
          }
        }
        break;
      }
      case 'attack': this.doAttack(u, dt); break;
      case 'gather': this.doGather(u, dt); break;
      case 'return': this.doReturn(u, dt); break;
    }

    // Rullebil paints the road as it rolls; everyone else leaves colourful footprints.
    if (u.moving && !u.air) {
      u.paintDist += d.speed * dt;
      if (d.painter && u.paintDist > 10) { u.paintDist = 0; this.paint.splat(u.x, u.y, 12, u.team, this.teams[u.team].color.main); }
      else if (!d.painter && u.paintDist > 30) { u.paintDist = 0; this.paint.splat(u.x + (Math.random() - 0.5) * 6, u.y + u.radius * 0.5, 5, u.team, this.teams[u.team].color.main); }
    }
    u.x = clamp(u.x, 4, this.map.pxW - 4);
    u.y = clamp(u.y, 4, this.map.pxH - 4);
  }

  setPath(u, goal) {
    if (u.air) {
      const p = goal.rect ? { x: (goal.rect[0] + goal.rect[2] + 1) * TILE / 2, y: (goal.rect[1] + goal.rect[3] + 1) * TILE / 2 } : goal;
      u.path = [{ x: p.x, y: p.y }];
    } else {
      u.path = this.map.findPath(u.x, u.y, goal, u.radius);
    }
    u.pathI = 0;
    u.stuckT = 0;
    u.lastX = u.x; u.lastY = u.y;
  }

  speedOf(u) {
    let s = u.def.speed;
    if (!u.air) {
      const p = this.paint.teamAt(u.x, u.y);
      if (p === u.team) s *= 1.3;
      else if (p >= 0 && this.isEnemy(u.team, p)) s *= 0.9;
    }
    return s;
  }

  // Moves along u.path. Returns true when the path is finished.
  followPath(u, dt) {
    if (!u.path || u.pathI >= u.path.length) return true;
    const wp = u.path[u.pathI];
    const dx = wp.x - u.x, dy = wp.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = this.speedOf(u) * dt;
    u.moving = true;
    if (Math.abs(dx) > 0.5) u.facing = dx < 0 ? -1 : 1;
    if (d <= Math.max(step, 3)) {
      if (u.air || this.map.walkablePx(wp.x, wp.y)) { u.x = wp.x; u.y = wp.y; }
      u.pathI++;
      return u.pathI >= u.path.length;
    }
    this.moveBy(u, (dx / d) * step, (dy / d) * step);
    // Stuck detection
    u.stuckT += dt;
    if (u.stuckT > 0.7) {
      const moved = dist(u.x, u.y, u.lastX, u.lastY);
      if (moved < this.speedOf(u) * 0.7 * 0.25) {
        u.stuckN++;
        if (u.stuckN > 4) { u.path = null; u.stuckN = 0; return true; }
        const end = u.path[u.path.length - 1];
        this.setPath(u, { x: end.x, y: end.y });
      } else u.stuckN = 0;
      u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
    }
    return false;
  }

  moveBy(u, mx, my) {
    if (u.air) { u.x += mx; u.y += my; return; }
    const map = this.map;
    const inBlocked = !map.walkablePx(u.x, u.y);
    const nx = u.x + mx, ny = u.y + my;
    if (inBlocked || map.walkablePx(nx, ny)) { u.x = nx; u.y = ny; }
    else if (map.walkablePx(nx, u.y)) u.x = nx;
    else if (map.walkablePx(u.x, ny)) u.y = ny;
  }

  // Move towards a target entity (or stay if in range).
  approach(u, e, dt) {
    if (!u.path || this.time >= u.repathAt) {
      u.repathAt = this.time + (e.kind === 'unit' ? 0.6 : 2.0);
      if (e.kind === 'unit') this.setPath(u, { x: e.x, y: e.y });
      else this.setPath(u, { rect: e.rect });
    }
    if (this.followPath(u, dt)) u.path = null;
  }

  findTarget(u, range) {
    let best = null, bs = Infinity;
    const d = u.def || u;
    for (const e of this.units) {
      if (e.dead || !this.isEnemy(u.team, e.team) || !this.canHit(d, e)) continue;
      const dd = dist(u.x, u.y, e.x, e.y) - e.radius;
      if (dd > range) continue;
      const s = dd - (e.def.dmg ? 80 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    if (best) return best;
    if (d.hitsGround === false) return null;
    for (const b of this.buildings) {
      if (b.dead || !this.isEnemy(u.team, b.team)) continue;
      const dd = this.distToRect(u.x, u.y, b.rect);
      if (dd > range) continue;
      const s = dd - (b.def.dmg ? 60 : 0);
      if (s < bs) { bs = s; best = b; }
    }
    return best;
  }

  doAttack(u, dt) {
    const d = u.def, t = u.target;
    if (!t || t.dead || !this.canHit(d, t)) {
      u.target = null;
      // Look for something else nearby before giving up.
      const nt = this.findTarget(u, d.sight);
      if (nt && (u.amGoal || u.anchor)) { u.target = nt; return; }
      if (u.amGoal) { u.state = 'move'; u.attackMove = true; u.goal = u.amGoal; this.setPath(u, u.amGoal); }
      else if (u.anchor && dist(u.x, u.y, u.anchor.x, u.anchor.y) > 40) {
        const a = u.anchor; u.anchor = null; u.state = 'move'; u.attackMove = false; u.goal = a; this.setPath(u, a);
      } else { u.state = 'idle'; u.anchor = null; }
      u.path = u.state === 'idle' ? null : u.path;
      return;
    }
    const inRange = this.edgeDist(u, t) <= d.range;
    if (inRange) {
      u.path = null;
      if (Math.abs(t.x - u.x) > 1) u.facing = t.x < u.x ? -1 : 1;
      if (u.cooldown <= 0) this.fire(u, t);
      return;
    }
    // Do not chase forever when we only noticed the enemy by ourselves.
    if (u.anchor && dist(u.x, u.y, u.anchor.x, u.anchor.y) > 330) {
      const a = u.anchor; u.anchor = null; u.target = null; u.state = 'move'; u.attackMove = false; u.goal = a; this.setPath(u, a);
      return;
    }
    // While attack-moving, switch to a closer enemy that is already in range.
    if (u.amGoal && this.time >= u.nextScan) {
      u.nextScan = this.time + 0.4;
      const nt = this.findTarget(u, d.range + 10);
      if (nt) { u.target = nt; return; }
    }
    this.approach(u, t, dt);
  }

  fire(src, t) {
    const d = src.def;
    src.cooldown = d.cd;
    src.attackAnim = 0.25;
    const team = this.teams[src.team];
    const sx = src.x, sy = src.y, sz = this.muzzleH(src), tz = this.hitH(t);
    if (src.kind === 'building') src.aim = Math.atan2(t.y - sy, t.x - sx);
    if (d.attack === 'melee') {
      this.damage(t, d.dmg, src);
      const hx = lerp(src.x, t.x, 0.6), hy = lerp(src.y, t.y, 0.6);
      this.paint.splat(t.x + (Math.random() - 0.5) * 10, t.y + (Math.random() - 0.5) * 10, 7, src.team, team.color.main);
      this.burst(hx, hy, team.color.main, 3, tz);
      this.sfx('bonk', src.x, src.y);
    } else if (d.attack === 'beam') {
      this.damage(t, d.dmg, src);
      this.effects.push({ type: 'beam', x: sx, y: sy, z: sz, x2: t.x, y2: t.y, z2: tz, color: team.color.main, t: 0, life: 0.18 });
      if (Math.random() < 0.35) this.paint.splat(t.x, t.y, 8, src.team, team.color.main);
      this.sfx('beam', src.x, src.y);
    } else {
      this.projectiles.push({
        x: sx, y: sy, z: sz, sx, sy, sz, target: t, tx: t.x, ty: t.y, tz, total: Math.max(1, dist(sx, sy, t.x, t.y)), team: src.team, src,
        dmg: d.dmg, splash: d.splash || 0, color: team.color.main, speed: d.projSpeed || 340,
        size: d.splash ? 7 : 4.5, hitsAir: d.hitsAir, hitsGround: d.hitsGround !== false, t: 0,
      });
      this.sfx(d.splash ? 'boom' : 'pew', src.x, src.y);
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; p.tz = this.hitH(p.target); }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = p.speed * dt;
      if (d <= step + 4) { p.done = true; this.impact(p); continue; }
      p.x += (dx / d) * step; p.y += (dy / d) * step;
      // Height: straight line from muzzle to target plus a little lob.
      const k = clamp(1 - (d - step) / Math.max(p.total, d), 0, 1);
      p.z = lerp(p.sz, p.tz, k) + Math.sin(k * Math.PI) * Math.min(40, p.total * 0.18);
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  impact(p) {
    const tgt = p.target;
    const gx = tgt && !tgt.dead ? tgt.x : p.tx, gy = tgt && !tgt.dead ? tgt.y : p.ty;
    if (p.splash) {
      const air = tgt ? !!tgt.air : false;
      for (const e of this.units) {
        if (e.dead || !this.isEnemy(p.team, e.team) || !!e.air !== air) continue;
        const dd = dist(gx, gy, e.x, e.y) - e.radius;
        if (dd <= p.splash) this.damage(e, e === tgt ? p.dmg : p.dmg * 0.5, p.src, p.team);
      }
      if (!air) for (const b of this.buildings) {
        if (b.dead || !this.isEnemy(p.team, b.team)) continue;
        if (this.distToRect(gx, gy, b.rect) <= p.splash * 0.5) this.damage(b, b === tgt ? p.dmg : p.dmg * 0.5, p.src, p.team);
      }
      this.paint.splat(gx, gy, p.splash * 0.8, p.team, p.color);
      this.burst(p.tx, p.ty, p.color, 10, p.tz);
    } else {
      if (tgt && !tgt.dead) this.damage(tgt, p.dmg, p.src, p.team);
      const ox = tgt && tgt.kind === 'building' ? (Math.random() - 0.5) * tgt.radius : (Math.random() - 0.5) * 12;
      const oy = tgt && tgt.kind === 'building' ? (Math.random() - 0.5) * tgt.radius : (Math.random() - 0.5) * 12;
      this.paint.splat(gx + ox, gy + oy, 10 + Math.random() * 5, p.team, p.color);
      this.burst(p.tx, p.ty, p.color, 4, p.tz);
    }
    this.sfx('splat', p.tx, p.ty);
  }

  damage(t, amt, src, srcTeam) {
    if (t.dead) return;
    t.lastHit = this.time;
    if (t.shield > 0) { const a = Math.min(t.shield, amt); t.shield -= a; amt -= a; }
    t.hp -= amt;
    t.hitFlash = 0.12;
    const team = src ? src.team : srcTeam;
    if (t.team === this.player && this.time - this.lastAlert > 12) {
      this.lastAlert = this.time;
      this.msg(t.kind === 'building' ? 'Basen din blir angrepet!' : 'Enhetene dine blir angrepet!', 'alert');
      this.effects.push({ type: 'ping', x: t.x, y: t.y, t: 0, life: 3 });
      this.sfx('alert');
    }
    if (t.hp <= 0) { this.kill(t, team); return; }
    // Fight back if we were just standing around.
    if (t.kind === 'unit' && src && !src.dead && t.def.dmg && t.state === 'idle' && this.canHit(t.def, src)) {
      t.target = src; t.state = 'attack'; t.anchor = { x: t.x, y: t.y };
    }
    if (t.kind === 'unit' && t.team !== this.player && t.def.worker && src && t.team >= 0 && this.teams[t.team].ai) {
      this.teams[t.team].ai.underAttack(src);
    }
  }

  kill(e, byTeam) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const killer = byTeam != null && byTeam >= 0 ? this.teams[byTeam] : null;
    const col = killer ? killer.color.main : this.teams[e.team].color.main;
    if (killer) killer.killed++;
    this.teams[e.team].lost++;
    if (e.kind === 'unit') {
      this.dying.push({ e, t: 0 });
      this.paint.splat(e.x, e.y, 24, killer ? killer.id : e.team, col);
      this.burst(e.x, e.y, col, 14, this.hitH(e));
      this.effects.push({ type: 'text', text: 'Poff!', x: e.x, y: e.y, z: this.hitH(e) + 22, t: 0, life: 0.9, color: col });
      this.sfx('poof', e.x, e.y);
    } else if (e.kind === 'building') {
      this.map.occupy(e.tx, e.ty, e.size, e.size, -1);
      this.dying.push({ e, t: 0 });
      const s = e.size * TILE;
      for (let i = 0; i < 6; i++) {
        this.paint.splat(e.x + (Math.random() - 0.5) * s, e.y + (Math.random() - 0.5) * s, 14 + e.size * 6, killer ? killer.id : e.team, col);
      }
      this.burst(e.x, e.y, col, 40, s * 0.3);
      this.burst(e.x, e.y, '#ffffff', 16, s * 0.3);
      this.effects.push({ type: 'text', text: 'SPLASJ!', x: e.x, y: e.y, z: s * 0.7, t: 0, life: 1.4, color: col, big: true });
      this.sfx('crash', e.x, e.y);
      if (e.team === this.player) this.msg(`${e.def.name} ble malt over!`, 'alert');
      else if (killer && killer.id === this.player) this.msg(`Du malte over ${e.def.name}!`, 'good');
    }
  }

  doGather(u, dt) {
    let r = u.res;
    if (!r || r.dead) {
      r = u.res = this.pickResource(u.x, u.y, u.team);
      u.path = null;
      if (!r) { u.state = 'idle'; return; }
    }
    if (u.carry >= CARRY) { u.state = 'return'; u.path = null; return; }
    if (this.edgeDist(u, r) <= 14) {
      u.path = null;
      u.mineT += dt;
      u.facing = r.x < u.x ? -1 : 1;
      if (u.mineT >= MINE_TIME) {
        u.mineT = 0;
        const amt = Math.min(CARRY, r.amount);
        r.amount -= amt;
        u.carry = amt;
        if (r.amount <= 0) { r.dead = true; this.map.occupy(r.tx, r.ty, 1, 1, -1); this.burst(r.x, r.y, '#bff6ff', 12); }
        u.state = 'return';
      }
    } else {
      if (!u.path) this.setPath(u, { rect: r.rect });
      if (this.followPath(u, dt) && this.edgeDist(u, r) > 14) {
        u.path = null;
        u.gatherFails = (u.gatherFails || 0) + 1;
        if (u.gatherFails > 3) { u.gatherFails = 0; u.res = null; }
      }
    }
  }

  doReturn(u, dt) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.team !== u.team || !b.def.isBase || b.built < 1) continue;
      const dd = dist(u.x, u.y, b.x, b.y);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (!best) { u.state = 'idle'; return; }
    if (this.edgeDist(u, best) <= 14) {
      const t = this.teams[u.team];
      const amt = u.carry * t.incomeMult;
      t.crystals += amt;
      t.gathered += u.carry;
      if (u.team === this.player) this.effects.push({ type: 'text', text: '+' + u.carry, x: u.x, y: u.y, z: 28, t: 0, life: 0.8, color: '#1aa7c9' });
      u.carry = 0;
      u.path = null;
      u.state = 'gather';
      return;
    }
    if (!u.path || u.retBase !== best.id) { u.retBase = best.id; this.setPath(u, { rect: best.rect }); }
    if (this.followPath(u, dt) && this.edgeDist(u, best) > 14) u.path = null;
  }

  updateBuilding(b, dt) {
    const d = b.def;
    if (b.hitFlash > 0) b.hitFlash -= dt;
    if (b.built < 1) {
      const inc = dt / d.time;
      b.built = Math.min(1, b.built + inc);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * inc);
      if (b.built >= 1) {
        b.shield = b.maxShield;
        if (b.team === this.player) { this.msg(`${d.name} er ferdig!`, 'good'); this.sfx('done'); }
        this.burst(b.x, b.y, this.teams[b.team].color.light, 20);
      }
      return;
    }
    this.traitRegen(b, dt);
    if (b.queue.length) {
      const type = b.queue[0];
      b.prog += dt;
      if (b.prog >= UNITS[type].time) {
        const u = this.spawnFrom(b, type);
        if (u) { b.queue.shift(); b.prog = 0; }
        else b.prog = UNITS[type].time; // no room yet, try again next tick
      }
    }
    if (d.dmg) {
      if (b.cooldown > 0) b.cooldown -= dt;
      const t = b.target;
      const valid = t && !t.dead && this.canHit(d, t) && this.towerDist(b, t) <= d.range;
      if (!valid) {
        b.target = null;
        if (this.time >= b.nextScan) {
          b.nextScan = this.time + 0.3;
          b.target = this.findTarget({ team: b.team, x: b.x, y: b.y, def: d, hitsAir: d.hitsAir }, d.range);
        }
      }
      if (b.target) {
        b.aim = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        if (b.cooldown <= 0) this.fire(b, b.target);
      }
    }
  }

  towerDist(b, t) {
    if (t.kind === 'building') return this.distToRect(b.x, b.y, t.rect);
    return dist(b.x, b.y, t.x, t.y) - t.radius;
  }

  // Soft collisions so units do not stand on top of each other.
  separate(dt) {
    const cell = 48, grid = new Map();
    const key = (x, y, air) => ((x * 1024 + y) * 2) + (air ? 1 : 0);
    for (const u of this.units) {
      if (u.dead) continue;
      const k = key(Math.floor(u.x / cell), Math.floor(u.y / cell), u.air);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(u);
    }
    const map = this.map;
    for (const u of this.units) {
      if (u.dead) continue;
      const cx = Math.floor(u.x / cell), cy = Math.floor(u.y / cell);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const a = grid.get(key(cx + ox, cy + oy, u.air));
        if (!a) continue;
        for (const v of a) {
          if (v.id <= u.id || v.dead) continue;
          if (u.def.worker && v.def.worker) continue; // workers slip past each other
          const dx = v.x - u.x, dy = v.y - u.y;
          const min = (u.radius + v.radius) * 0.9;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          let nx, ny;
          if (d < 0.01) { const a = Math.random() * TAU; nx = Math.cos(a); ny = Math.sin(a); d = 0; }
          else { nx = dx / d; ny = dy / d; }
          const push = Math.min((min - d), 6) * 0.5;
          let wu = 0.5, wv = 0.5;
          if (u.moving && !v.moving) { wu = 0.15; wv = 0.85; }
          else if (v.moving && !u.moving) { wu = 0.85; wv = 0.15; }
          this.nudge(u, -nx * push * wu * 2, -ny * push * wu * 2);
          this.nudge(v, nx * push * wv * 2, ny * push * wv * 2);
        }
      }
      // Keep ground units off buildings and rocks.
      if (!u.air) {
        const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
        if (!map.walkable(tx, ty)) {
          const nw = map.nearestWalkable(tx, ty, 4);
          if (nw) {
            const gx = (nw[0] + 0.5) * TILE, gy = (nw[1] + 0.5) * TILE;
            const dd = dist(u.x, u.y, gx, gy) || 1;
            const s = Math.min(dd, 90 * dt);
            u.x += (gx - u.x) / dd * s; u.y += (gy - u.y) / dd * s;
          }
        } else {
          const r = Math.min(u.radius * 0.75, 14);
          const fx = u.x - tx * TILE, fy = u.y - ty * TILE;
          if (fx < r && !map.walkable(tx - 1, ty)) u.x += (r - fx) * 0.5;
          if (TILE - fx < r && !map.walkable(tx + 1, ty)) u.x -= (r - (TILE - fx)) * 0.5;
          if (fy < r && !map.walkable(tx, ty - 1)) u.y += (r - fy) * 0.5;
          if (TILE - fy < r && !map.walkable(tx, ty + 1)) u.y -= (r - (TILE - fy)) * 0.5;
        }
      }
    }
  }

  nudge(u, mx, my) {
    if (u.air) { u.x += mx; u.y += my; return; }
    const nx = u.x + mx, ny = u.y + my;
    if (this.map.walkablePx(nx, ny)) { u.x = nx; u.y = ny; }
  }

  // ---------- effects ----------
  // Paint droplets flying out in 3D (x, y on the ground, z = height).
  burst(x, y, color, n, z = 6) {
    if (this.effects.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 30 + Math.random() * 100;
      this.effects.push({
        type: 'particle', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 80 + Math.random() * 170, color,
        size: 2 + Math.random() * 3.5, t: 0, life: 0.45 + Math.random() * 0.4,
      });
    }
  }

  // Heights used for projectiles and effects.
  hitH(e) {
    if (e.kind === 'building') return e.size * TILE * 0.35;
    return e.air ? AIR_H : e.radius * 0.9;
  }
  muzzleH(e) {
    if (e.kind === 'building') return e.size * TILE * 0.9;
    return e.air ? AIR_H : e.radius * 1.1;
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.t += dt;
      if (e.type === 'particle') {
        e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; e.vz -= 520 * dt;
        if (e.z < 0) { e.z = 0; e.vz = 0; e.vx *= 0.4; e.vy *= 0.4; }
      } else if (e.type === 'text') e.z += 30 * dt;
    }
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const d of this.dying) d.t += dt;
    this.dying = this.dying.filter((d) => d.t < (d.e.kind === 'building' ? 0.8 : 0.7));
  }

  // ---------- objectives, victory and defeat ----------
  objectiveProgress(o) {
    const P = this.player;
    switch (o.type) {
      case 'build': return { have: this.buildings.filter((b) => b.team === P && b.type === o.what && b.built >= 1 && !b.dead).length, need: o.count || 1 };
      case 'train': return { have: this.units.filter((u) => u.team === P && u.type === o.what && !u.dead).length, need: o.count || 1 };
      case 'gather': return { have: Math.floor(this.teams[P].gathered), need: o.amount };
      case 'survive': return { left: Math.max(0, o.time - this.time) };
      default: return null;
    }
  }

  objectiveDone(o) {
    const pr = this.objectiveProgress(o);
    switch (o.type) {
      case 'build': case 'train': case 'gather': return pr.have >= pr.need;
      case 'survive': return pr.left <= 0;
      case 'destroyAll': return this.teams.every((t) => !this.isEnemy(this.player, t.id) || !t.alive || t.noDefeat);
      case 'destroyTeam': return !this.teams[o.team].alive;
      default: return false;
    }
  }

  checkEnd() {
    // Teams without buildings are out.
    for (const t of this.teams) {
      if (!t.alive || t.noDefeat) continue;
      if (!this.buildings.some((b) => b.team === t.id && !b.dead)) {
        t.alive = false;
        for (const u of this.units) if (u.team === t.id && !u.dead) this.kill(u, null);
        if (t.id !== this.player) this.msg(`${t.name} er malt over!`, t.allies.includes(this.player) ? 'alert' : 'good');
      }
    }
    if (this.player < 0) {
      // Spectator (demo) game: ends when one side remains.
      const alive = this.teams.filter((t) => t.alive && !t.noDefeat);
      const sides = new Set(alive.map((t) => Math.min(t.id, ...t.allies)));
      if (sides.size <= 1) this.end({ winner: alive.length ? alive[0].id : -1 });
      return;
    }
    const P = this.teams[this.player];
    if (!P.alive) { this.end('lose'); return; }
    if (this.cfg.protect) {
      const prot = this.cfg.protect;
      if (!this.buildings.some((b) => b.team === this.player && b.type === prot && !b.dead)) { this.end('lose'); return; }
    }
    let changed = false;
    for (const o of this.objectives) {
      if (o.done) continue;
      if (this.objectiveDone(o)) {
        o.done = true; changed = true;
        if (this.onObjective) this.onObjective(o);
        continue;
      }
      if (!o.parallel) break; // objectives are done in order
    }
    if (changed && this.onObjective) this.onObjective(null);
    if (this.objectives.every((o) => o.done)) this.end('win');
  }

  end(result) {
    if (this.over) return;
    this.over = true;
    this.result = result;
    if (this.onEnd) this.onEnd(result);
  }
}
