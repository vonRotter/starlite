'use strict';
// A simple computer opponent: gathers, follows a small build plan, trains an
// army, expands to new crystal fields, researches upgrades, defends its base
// and attacks in waves that grow over time.

class AI {
  // opts: { attack: bool, build: bool, firstAttack: s, wave: n, unitMix: {type: weight} }
  constructor(game, teamId, diffKey, opts) {
    this.g = game;
    this.team = teamId;
    this.diff = DIFFICULTIES[diffKey] || DIFFICULTIES.lett;
    this.opts = opts || {};
    game.teams[teamId].incomeMult = this.diff.income;
    this.thinkT = 0.5 + Math.random();
    this.wave = this.opts.wave != null ? this.opts.wave : this.diff.wave;
    this.nextAttack = this.opts.firstAttack != null ? this.opts.firstAttack : this.diff.firstAttack;
    this.threat = null;
    const b = game.teams[teamId].f.builds; // [prodA, prodB, tower, base, tech]
    const plans = {
      fredelig: [[b[0], 1], [b[2], 1], [b[1], 1]],
      supersnill: [[b[0], 1], [b[2], 1], [b[1], 1]],
      lett: [[b[0], 1], [b[2], 1], [b[1], 1], [b[2], 2], [b[4], 1]],
      middels: [[b[0], 1], [b[2], 1], [b[1], 1], [b[4], 1], [b[0], 2], [b[2], 2]],
      vanskelig: [[b[0], 1], [b[0], 2], [b[2], 1], [b[1], 1], [b[4], 1], [b[2], 2], [b[1], 2], [b[2], 3]],
    };
    this.plan = this.opts.plan || plans[diffKey] || plans.lett;
    // When to take a new base, and how many bases at most.
    const expand = { lett: [420, 2], middels: [280, 2], vanskelig: [200, 3] }[diffKey] || [Infinity, 1];
    this.expandAt = this.opts.expandAt != null ? this.opts.expandAt : expand[0];
    this.maxBases = this.opts.maxBases != null ? this.opts.maxBases : expand[1];
    this.research = this.opts.research != null ? this.opts.research : diffKey === 'middels' || diffKey === 'vanskelig';
  }

  underAttack(src) { this.threat = src; }

  update(dt) {
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.diff.think;
    this.think();
  }

  think() {
    const g = this.g, T = g.teams[this.team], f = T.f;
    const units = g.teamUnits(this.team);
    const blds = g.teamBuildings(this.team);
    const bases = blds.filter((b) => b.def.isBase && b.built >= 1);
    const workers = units.filter((u) => u.def.worker);
    const army = units.filter((u) => u.def.dmg);

    for (const w of workers) if (w.state === 'idle') g.gatherNearest(w);

    // 1. Workers
    const queuedWorkers = bases.reduce((n, b) => n + b.queue.filter((q) => UNITS[q] && UNITS[q].worker).length, 0);
    const wantWorkers = this.diff.workers + (bases.length - 1) * 6;
    if (bases.length && workers.length + queuedWorkers < wantWorkers) {
      const b = bases.find((x) => x.queue.length === 0);
      if (b && T.crystals >= UNITS[f.worker].cost) g.cmdTrain(b, f.worker);
    }

    // 2. Build plan
    let reserve = 0;
    if (this.opts.build !== false && bases.length) {
      for (const [type, count] of this.plan) {
        const have = blds.filter((b) => b.type === type).length;
        if (have >= count) continue;
        const cost = BUILDINGS[type].cost;
        if (T.crystals >= cost) this.placeBuilding(type, bases[0]);
        else reserve = cost;
        break;
      }
    }

    // 2b. Expand to a new crystal field when it is time (or the home field runs dry).
    if (this.opts.build !== false && bases.length) reserve = Math.max(reserve, this.thinkExpand(bases, blds));
    this.balanceWorkers(bases, workers);

    // 2c. Research
    if (this.research) {
      for (const b of blds) {
        if (b.built < 1 || !b.def.research || b.queue.length) continue;
        for (const key of b.def.research) {
          const st = g.researchState(this.team, key);
          if (st.max || st.busy) continue;
          if (T.crystals >= UPGRADES[key].cost[st.level] + 150) { g.cmdResearch(b, key); break; }
        }
      }
    }

    // 3. Army
    for (const b of blds) {
      if (b.built < 1 || !b.def.trains || b.def.isBase || b.queue.length >= 2) continue;
      const choices = b.def.trains.filter((t) => !g.missingReq(this.team, UNITS[t]));
      if (!choices.length) continue;
      const type = this.pickUnit(choices);
      if (T.crystals - UNITS[type].cost >= reserve * 0.5) g.cmdTrain(b, type);
    }

    // 4. Defend
    let threat = null;
    for (const u of g.units) {
      if (u.dead || !g.isEnemy(this.team, u.team)) continue;
      if (blds.some((b) => dist(b.x, b.y, u.x, u.y) < 360)) { threat = u; break; }
    }
    if (!threat && this.threat && !this.threat.dead) threat = this.threat;
    this.threat = null;
    if (threat) {
      const defenders = army.filter((u) => !u.aiAttack || dist(u.x, u.y, threat.x, threat.y) < 500);
      const idle = defenders.filter((u) => u.state !== 'attack');
      if (idle.length) g.cmdMove(idle, threat.x, threat.y, true);
      return;
    }

    // 5. Attack
    if (this.opts.attack === false) return;
    const home = bases[0] || blds[0];
    const ready = army.filter((u) => !u.aiAttack && u.state === 'idle');
    // Out of crystals, or waiting too long: go with what we have so games always end.
    const broke = g.resources.length === 0 || (T.crystals < 60 && workers.every((w) => w.state === 'idle'));
    const overdue = g.time >= this.nextAttack + 90;
    const need = broke ? 1 : overdue ? Math.min(this.wave, 4) : this.wave;
    if (g.time >= this.nextAttack && ready.length && ready.length >= need) {
      const tgt = this.pickTarget(home || ready[0]);
      if (tgt) {
        for (const u of ready) u.aiAttack = true;
        g.cmdMove(ready, tgt.x, tgt.y, true);
        this.wave = Math.min(this.wave + this.diff.waveGrow, 16);
        this.nextAttack = g.time + 40;
      }
    }
    // Attackers that finished their job keep pushing on.
    for (const u of army) {
      if (u.aiAttack && u.state === 'idle') {
        const tgt = this.pickTarget(u);
        if (tgt) g.cmdMove([u], tgt.x, tgt.y, true);
      }
    }
  }

  pickUnit(list) {
    const mix = this.opts.unitMix || {};
    // Heavy units are expensive, so pick them less often.
    const weight = (t) => (mix[t] != null ? mix[t] : UNITS[t].heavy ? 0.45 : 1);
    const opts = list.filter((t) => weight(t) > 0);
    if (!opts.length) return list[0];
    let r = Math.random() * opts.reduce((s, t) => s + weight(t), 0);
    for (const t of opts) { r -= weight(t); if (r <= 0) return t; }
    return opts[opts.length - 1];
  }

  // Returns crystals to save up for a new base (0 if not expanding now).
  thinkExpand(bases, blds) {
    const g = this.g, T = g.teams[this.team], baseType = T.f.base;
    const building = blds.some((b) => b.def.isBase && b.built < 1);
    if (building || bases.length >= this.maxBases) return 0;
    const home = bases[0];
    const nearHome = g.resources.filter((r) => dist(r.x, r.y, home.x, home.y) < 12 * TILE).length;
    if (g.time < this.expandAt && nearHome > 2) return 0;
    const spots = g.freeExpansions().filter((e) => !g.units.some((u) => g.isEnemy(this.team, u.team) && dist(u.x, u.y, (e.tx + 2) * TILE, (e.ty + 2) * TILE) < 300));
    if (!spots.length) return 0;
    spots.sort((a, b) => dist2(a.tx, a.ty, home.tx, home.ty) - dist2(b.tx, b.ty, home.tx, home.ty));
    const cost = BUILDINGS[baseType].cost;
    if (T.crystals < cost) return cost;
    g.cmdBuild(this.team, baseType, spots[0].tx, spots[0].ty);
    return 0;
  }

  // Send workers from crowded bases to bases with few workers.
  balanceWorkers(bases, workers) {
    if (bases.length < 2) return;
    const g = this.g;
    const near = (b) => workers.filter((w) => w.res && !w.res.dead && dist(w.res.x, w.res.y, b.x, b.y) < 10 * TILE);
    const fields = bases.map((b) => ({ b, ws: near(b), res: g.resources.filter((r) => dist(r.x, r.y, b.x, b.y) < 10 * TILE) }));
    const poor = fields.find((f) => f.res.length && f.ws.length < Math.min(6, f.res.length));
    const rich = fields.slice().sort((a, b) => b.ws.length - a.ws.length)[0];
    if (!poor || !rich || rich === poor || rich.ws.length <= poor.ws.length + 2) return;
    const move = rich.ws.filter((w) => w.state === 'gather').slice(0, 2);
    for (const w of move) g.cmdGather([w], poor.res[Math.floor(Math.random() * poor.res.length)]);
  }

  pickTarget(from) {
    const g = this.g;
    const prefer = this.opts.targetTeam;
    let best = null, bd = Infinity;
    for (const b of g.buildings) {
      if (b.dead || !g.isEnemy(this.team, b.team)) continue;
      let d = dist(from.x, from.y, b.x, b.y);
      if (prefer != null && b.team !== prefer) d += 5000;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return best;
    for (const u of g.units) {
      if (u.dead || !g.isEnemy(this.team, u.team)) continue;
      const d = dist(from.x, from.y, u.x, u.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  placeBuilding(type, base) {
    const g = this.g, map = g.map, s = BUILDINGS[type].size;
    const cx = base.tx + 2, cy = base.ty + 2;
    let dx = map.w / 2 - cx, dy = map.h / 2 - cy;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const px = cx + dx * 6, py = cy + dy * 6; // prefer the side facing the map centre
    const cands = [];
    for (let y = cy - 11; y <= cy + 11; y++) {
      for (let x = cx - 11; x <= cx + 11; x++) {
        const d = Math.hypot(x + s / 2 - cx, y + s / 2 - cy);
        if (d < 4.5 || d > 10) continue;
        cands.push({ x, y, score: Math.hypot(x + s / 2 - px, y + s / 2 - py) + Math.random() * 2 });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands) {
      // Leave a one-tile gap around the building so paths stay open.
      let ok = true;
      for (let y = c.y - 1; y <= c.y + s && ok; y++) for (let x = c.x - 1; x <= c.x + s; x++) {
        if (map.inBounds(x, y) && !map.walkable(x, y)) { ok = false; break; }
      }
      if (!ok) continue;
      if (g.cmdBuild(this.team, type, c.x, c.y) === null) return true;
    }
    return false;
  }
}
