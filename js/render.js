'use strict';
// Draws the game world and the minimap.

class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mm = minimap;
    this.mctx = minimap.getContext('2d');
    this.dpr = 1;
    this.game = null;
    this.mmTimer = 0;
  }

  setGame(game) {
    this.game = game;
    this.buildStatic();
  }

  // Ground units per screen pixel vertically (1 for this flat top-down view).
  get K() { return 1; }
  // World point (x, y on the ground, h = height) to screen pixels.
  project(x, y, h = 0) {
    const c = this.cam;
    return { x: (x - c.x) * c.zoom, y: (y - c.y - h * 0.5) * c.zoom };
  }
  // Rough screen-space footprint used for clicking on a building.
  buildingScreenBox(b) {
    const S = b.size * TILE, a = this.project(b.x - S / 2, b.y - S / 2 - 14), c = this.project(b.x + S / 2, b.y + S / 2);
    return { x0: a.x, y0: a.y, x1: c.x, y1: c.y };
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const r = this.mm.getBoundingClientRect();
    if (r.width > 0) {
      this.mm.width = Math.round(r.width * this.dpr);
      this.mm.height = Math.round(r.height * this.dpr);
    }
  }

  // ---------- static layers ----------
  buildStatic() {
    const map = this.game.map, th = map.theme;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const rng = makeRng(map.w * 31 + map.h);

    const ground = mk(map.pxW, map.pxH);
    let ctx = ground.getContext('2d');
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      ctx.fillStyle = (x + y) % 2 ? th.ground[0] : th.ground[1];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    ctx.fillStyle = rgba(th.patch, 0.55);
    for (let i = 0; i < (map.w * map.h) / 25; i++) {
      ctx.beginPath();
      ctx.ellipse(rng() * map.pxW, rng() * map.pxH, 20 + rng() * 50, 14 + rng() * 30, rng() * 3, 0, TAU);
      ctx.fill();
    }
    for (const d of map.decos) this.drawDeco(ctx, d);
    this.ground = ground;

    const obs = mk(map.pxW, map.pxH);
    ctx = obs.getContext('2d');
    this.drawObstacles(ctx, map, rng);
    this.obstacles = obs;

    // Minimap background
    const mw = 240, mh = Math.round((240 * map.h) / map.w);
    const mmBg = mk(mw, mh);
    const m = mmBg.getContext('2d');
    m.drawImage(ground, 0, 0, mw, mh);
    m.drawImage(obs, 0, 0, mw, mh);
    this.mmBg = mmBg;
  }

  drawDeco(ctx, d) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.s, d.s);
    switch (d.type) {
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + d.r;
          Art.circ(ctx, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 2.8, d.color, null);
        }
        Art.circ(ctx, 0, 0, 2.2, '#ffd23f', null);
        break;
      case 'tuft':
        ctx.strokeStyle = 'rgba(40,110,40,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 3, 3); ctx.lineTo(i * 4.5, -4 - Math.abs(i) * -1); ctx.stroke(); }
        break;
      case 'pebble':
        Art.ell(ctx, 0, 0, 4.5, 3, 'rgba(120,110,140,0.45)', null);
        break;
      case 'mushroom':
        Art.rrect(ctx, -1.5, -1, 3, 5, 1, '#fff3df', null);
        ctx.beginPath(); ctx.arc(0, -1, 5, Math.PI, 0); ctx.fillStyle = d.color; ctx.fill();
        Art.circ(ctx, -1.5, -3, 1, '#ffffff', null);
        break;
      case 'gem':
        Art.poly(ctx, [0, -6, 3, -2, 0, 2, -3, -2], d.color, 'rgba(60,40,90,0.5)', 1);
        break;
      case 'star':
        Art.star(ctx, 0, 0, 4, d.color, null, 0, d.r);
        break;
      case 'shell':
        ctx.beginPath(); ctx.arc(0, 2, 5, Math.PI, 0); ctx.closePath(); ctx.fillStyle = d.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(i * 2.2, -2.5); ctx.stroke(); }
        break;
    }
    ctx.restore();
  }

  drawObstacles(ctx, map, rng) {
    const th = map.theme;
    const tilesOf = (t) => {
      const out = [];
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.tiles[y * map.w + x] === t) out.push([x, y, rng(), rng(), rng()]);
      return out;
    };
    // Water: merged blobs.
    const water = tilesOf(T_WATER);
    const wc = (x, y) => [(x + 0.5) * TILE, (y + 0.5) * TILE];
    for (const [x, y] of water) { const [cx, cy] = wc(x, y); Art.circ(ctx, cx, cy, 25, shade(th.water, -0.35), null); }
    for (const [x, y] of water) { const [cx, cy] = wc(x, y); Art.circ(ctx, cx, cy, 22, th.water, null); }
    this.fillGaps(ctx, map, water, T_WATER, 22, th.water);
    for (const [x, y, a, b, c] of water) {
      if (a < 0.35) {
        const [cx, cy] = wc(x, y);
        ctx.strokeStyle = th.waterLight; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx + (b - 0.5) * 10, cy + (c - 0.5) * 10, 6, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
      }
    }
    // Rocks, trees and clouds.
    const obs = tilesOf(T_ROCK);
    const style = th.obstacle;
    const jit = style === 'tree' ? 6 : 0;
    const pos = (x, y, a, b) => [(x + 0.5) * TILE + (a - 0.5) * jit, (y + 0.5) * TILE + (b - 0.5) * jit];
    const rad = style === 'tree' ? 19 : style === 'cloud' ? 20 : 18;
    for (const [x, y, a, b] of obs) { const [cx, cy] = pos(x, y, a, b); Art.circ(ctx, cx, cy + 4, rad + 2, 'rgba(30,20,60,0.18)', null); }
    for (const [x, y, a, b] of obs) { const [cx, cy] = pos(x, y, a, b); Art.circ(ctx, cx, cy, rad + 2.6, style === 'cloud' ? th.obstacleDark : OUTLINE, null); }
    for (const [x, y, a, b] of obs) { const [cx, cy] = pos(x, y, a, b); Art.circ(ctx, cx, cy, rad, th.obstacleFill, null); }
    if (style !== 'tree') this.fillGaps(ctx, map, obs, T_ROCK, rad, th.obstacleFill);
    for (const [x, y, a, b, c] of obs) {
      const [cx, cy] = pos(x, y, a, b);
      if (style === 'tree') {
        Art.circ(ctx, cx - 5, cy - 6, 8 + c * 3, th.obstacleLight, null);
        if (c > 0.8) Art.circ(ctx, cx + 6, cy + 2, 3, '#ff5b6e', OUTLINE, 1.4); // an apple
      } else if (style === 'rock') {
        Art.ell(ctx, cx - 5, cy - 6, 7, 4, th.obstacleLight, null, 0, -0.4);
      } else {
        Art.circ(ctx, cx - 6, cy - 6, 7, '#ffffff', null);
      }
    }
  }

  // Fill the small holes between neighbouring blob circles so lakes and rocks
  // read as one smooth shape.
  fillGaps(ctx, map, list, type, r, color) {
    const is = (x, y) => map.inBounds(x, y) && map.tiles[y * map.w + x] === type;
    const h = r * 0.65;
    ctx.fillStyle = color;
    for (const [x, y] of list) {
      const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
      if (is(x + 1, y)) ctx.fillRect(cx, cy - h, TILE, h * 2);
      if (is(x, y + 1)) ctx.fillRect(cx - h, cy, h * 2, TILE);
      if (is(x + 1, y) && is(x, y + 1) && is(x + 1, y + 1)) ctx.fillRect(cx, cy, TILE, TILE);
    }
  }

  // ---------- world ----------
  draw(cam, st) {
    this.cam = cam;
    const g = this.game, ctx = this.ctx, dpr = this.dpr, z = cam.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2a2440';
    ctx.fillRect(0, 0, cam.w, cam.h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * dpr * z, -cam.y * dpr * z);
    const vx = cam.x, vy = cam.y, vw = cam.w / z, vh = cam.h / z;
    g.view = { x: vx, y: vy, w: vw, h: vh };
    const vis = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;

    // Layers: ground, paint, obstacles
    const sx = clamp(vx, 0, g.map.pxW), sy = clamp(vy, 0, g.map.pxH);
    const sw = clamp(vx + vw, 0, g.map.pxW) - sx, sh = clamp(vy + vh, 0, g.map.pxH) - sy;
    if (sw > 0 && sh > 0) {
      ctx.drawImage(this.ground, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(g.paint.canvas, sx * PAINT_SCALE, sy * PAINT_SCALE, sw * PAINT_SCALE, sh * PAINT_SCALE, sx, sy, sw, sh);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.obstacles, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    const t = performance.now() / 1000;

    // Build radius hint while placing
    if (st.ghost) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (const b of g.buildings) {
        if (b.team !== g.player) continue;
        ctx.beginPath(); ctx.arc(b.x, b.y, BUILD_RADIUS, 0, TAU); ctx.fill();
      }
    }

    // Crystals
    for (const r of g.resources) {
      if (!vis(r.x, r.y, 40)) continue;
      ctx.save(); ctx.translate(r.x, r.y);
      Art.drawCrystal(ctx, r.variant, r.amount / r.max, t);
      ctx.restore();
    }

    const selected = new Set(g.selection);
    // Buildings
    const blds = g.buildings.slice().sort((a, b) => a.y - b.y);
    for (const b of blds) {
      if (!vis(b.x, b.y, b.radius + 40)) continue;
      if (selected.has(b) || st.hover === b) this.drawBuildingSelect(b, selected.has(b), st.hover === b);
      this.drawBuildingEnt(b, t, 1);
    }
    for (const d of g.dying) {
      if (d.e.kind !== 'building' || !vis(d.e.x, d.e.y, 100)) continue;
      const k = d.t / 0.8;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(d.e.x, d.e.y + d.e.radius * 0.8);
      ctx.scale(1 + k * 0.3, 1 - k * 0.8);
      ctx.translate(-d.e.x, -d.e.y - d.e.radius * 0.8);
      this.drawBuildingEnt(d.e, t, 1);
      ctx.restore();
    }

    // Ground units
    const ground = [], air = [];
    for (const u of g.units) { if (!vis(u.x, u.y, 40)) continue; (u.air ? air : ground).push(u); }
    ground.sort((a, b) => a.y - b.y);
    air.sort((a, b) => a.y - b.y);
    for (const u of ground) {
      Art.ell(ctx, u.x, u.y + u.radius * 0.75, u.radius * 0.95, u.radius * 0.38, 'rgba(30,20,60,0.22)', null);
      if (selected.has(u) || st.hover === u) this.drawUnitSelect(u, selected.has(u));
    }
    for (const u of ground) this.drawUnitEnt(u, 1, 0);
    for (const d of g.dying) {
      if (d.e.kind !== 'unit' || d.e.air || !vis(d.e.x, d.e.y, 40)) continue;
      this.drawUnitEnt(d.e, 1 - d.t / 0.7, Math.min(1, d.t / 0.25) * (Math.PI / 2) * d.e.facing);
    }

    // Projectiles
    for (const p of g.projectiles) {
      if (!vis(p.x, p.y, 20)) continue;
      const arc = p.z * 0.5;
      Art.ell(ctx, p.x, p.y + 4, p.size * 0.9, p.size * 0.4, 'rgba(30,20,60,0.18)', null);
      Art.circ(ctx, p.x, p.y - arc, p.size, p.color, OUTLINE, 1.6);
      Art.circ(ctx, p.x - p.size * 0.3, p.y - arc - p.size * 0.3, p.size * 0.35, 'rgba(255,255,255,0.7)', null);
    }

    // Air units
    for (const u of air) {
      Art.ell(ctx, u.x, u.y + 8, u.radius * 0.9, u.radius * 0.35, 'rgba(30,20,60,0.18)', null);
      if (selected.has(u) || st.hover === u) this.drawUnitSelect(u, selected.has(u));
    }
    for (const u of air) this.drawUnitEnt(u, 1, 0);
    for (const d of g.dying) {
      if (d.e.kind !== 'unit' || !d.e.air || !vis(d.e.x, d.e.y, 40)) continue;
      this.drawUnitEnt(d.e, 1 - d.t / 0.7, d.t * 4 * d.e.facing);
    }

    // Effects
    for (const e of g.effects) {
      if (!vis(e.x, e.y, 200)) continue;
      const k = e.t / e.life;
      if (e.type === 'particle') {
        Art.circ(ctx, e.x, e.y - e.z * 0.5, e.size * (1 - k * 0.5), e.color, null);
      } else if (e.type === 'text') {
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `700 ${e.big ? 26 : 15}px Fredoka, "Baloo 2", "Comic Sans MS", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = e.big ? 5 : 3.5; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round';
        ctx.strokeText(e.text, e.x, e.y - e.z * 0.8);
        ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y - e.z * 0.8);
        ctx.globalAlpha = 1;
      } else if (e.type === 'beam') {
        ctx.globalAlpha = 1 - k;
        ctx.lineCap = 'round';
        ctx.strokeStyle = e.color; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - e.z * 0.5); ctx.lineTo(e.x2, e.y2 - e.z2 * 0.5); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - e.z * 0.5); ctx.lineTo(e.x2, e.y2 - e.z2 * 0.5); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.type === 'ring') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = e.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 6 + k * 16, (6 + k * 16) * 0.55, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.type === 'ping') {
        const r = 20 + ((e.t * 60) % 40);
        ctx.globalAlpha = 0.8 * (1 - k);
        ctx.strokeStyle = '#ff3d3d'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Health bars
    for (const b of g.buildings) if (vis(b.x, b.y, b.radius)) this.drawBars(b, selected.has(b));
    for (const u of g.units) if (vis(u.x, u.y, 30)) this.drawBars(u, selected.has(u));

    // Rally point of a selected building
    for (const e of g.selection) {
      if (e.kind === 'building' && e.rally && e.team === g.player) {
        ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke();
        ctx.setLineDash([]);
        Art.line(ctx, e.rally.x, e.rally.y, e.rally.x, e.rally.y - 22, OUTLINE, 2);
        Art.poly(ctx, [e.rally.x, e.rally.y - 22, e.rally.x + 14, e.rally.y - 17, e.rally.x, e.rally.y - 12], g.teams[e.team].color.main, OUTLINE, 1.5);
      }
      if (e.kind === 'building' && e.def.dmg) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.range, 0, TAU); ctx.stroke();
      }
    }

    // Placement ghost
    if (st.ghost) {
      const gh = st.ghost, d = BUILDINGS[gh.type], s = d.size;
      ctx.fillStyle = gh.ok ? 'rgba(80,255,120,0.35)' : 'rgba(255,60,60,0.4)';
      ctx.fillRect(gh.tx * TILE, gh.ty * TILE, s * TILE, s * TILE);
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.translate((gh.tx + s / 2) * TILE, (gh.ty + s / 2) * TILE);
      Art.drawBuilding(ctx, gh.type, g.teams[g.player].color, { t, grump: false });
      ctx.restore();
    }

    // Selection box (screen space)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.box) {
      const { x0, y0, x1, y1 } = st.box;
      ctx.fillStyle = 'rgba(120,255,160,0.15)';
      ctx.strokeStyle = '#7dffa8'; ctx.lineWidth = 2;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  grumpOf(team) {
    const T = this.game.teams[team];
    return T.gloom || T.faction === 'graa';
  }

  drawUnitEnt(u, alpha, rot) {
    const g = this.game, ctx = this.ctx;
    const col = g.teams[u.team].color;
    const lift = u.air ? 22 + Math.sin(u.anim * 2 + u.id) * 2 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(u.x, u.y - lift);
    if (rot) ctx.rotate(rot);
    // Pop-in when a unit is born.
    const age = g.time - u.born;
    if (age < 0.25 && age >= 0) { const s = 0.4 + (age / 0.25) * 0.6; ctx.scale(s, s); }
    ctx.scale(u.facing, 1);
    Art.drawUnit(ctx, u.type, col, {
      t: u.anim, moving: u.moving, attack: u.attackAnim > 0, carry: u.carry > 0, grump: this.grumpOf(u.team),
    });
    ctx.restore();
    if (u.hitFlash > 0) {
      ctx.globalAlpha = 0.45;
      Art.circ(ctx, u.x, u.y - lift, u.radius + 2, '#ffffff', null);
      ctx.globalAlpha = 1;
    }
  }

  drawBuildingEnt(b, t, alpha) {
    const g = this.game, ctx = this.ctx;
    const col = g.teams[b.team].color;
    const S = b.size * TILE;
    const o = { t: t + b.id, aim: b.aim, grump: this.grumpOf(b.team) };
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.built < 1) {
      // Rises from the ground while being built.
      ctx.globalAlpha = 0.3 * alpha;
      Art.drawBuilding(ctx, b.type, col, o);
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.beginPath();
      const hgt = S * 1.6 * b.built;
      ctx.rect(-S, S * 0.6 - hgt, S * 2, hgt);
      ctx.clip();
      Art.drawBuilding(ctx, b.type, col, o);
      ctx.restore();
      // scaffolding
      ctx.strokeStyle = 'rgba(90,80,120,0.6)'; ctx.lineWidth = 2;
      ctx.strokeRect(-S / 2 + 4, -S / 2 + 4, S - 8, S - 8);
      ctx.beginPath(); ctx.moveTo(-S / 2 + 4, -S / 2 + 4); ctx.lineTo(S / 2 - 4, S / 2 - 4); ctx.moveTo(S / 2 - 4, -S / 2 + 4); ctx.lineTo(-S / 2 + 4, S / 2 - 4); ctx.stroke();
    } else {
      ctx.globalAlpha = alpha;
      Art.drawBuilding(ctx, b.type, col, o);
    }
    if (b.hitFlash > 0) {
      ctx.globalAlpha = 0.25;
      Art.rrect(ctx, -S / 2 + 4, -S / 2 + 4, S - 8, S - 8, 12, '#ffffff', null);
    }
    ctx.restore();
    // Training progress
    if (b.queue.length && b.team === g.player) {
      const k = b.prog / g.itemTime(b, b.queue[0]);
      const w = S * 0.6;
      Art.rrect(ctx, b.x - w / 2, b.y + S / 2 - 6, w, 8, 4, '#ffffff', OUTLINE, 1.6);
      Art.rrect(ctx, b.x - w / 2 + 1.5, b.y + S / 2 - 4.5, Math.max(0, (w - 3) * k), 5, 2.5, col.main, null);
    }
  }

  drawUnitSelect(u, sel) {
    const ctx = this.ctx, g = this.game;
    const c = u.team === g.player ? '#3dff8a' : g.isEnemy(g.player >= 0 ? g.player : 0, u.team) ? '#ff4d4d' : '#ffe14d';
    ctx.strokeStyle = sel ? c : rgba(c, 0.6);
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.beginPath(); ctx.ellipse(u.x, u.y + (u.air ? 8 : u.radius * 0.75), u.radius + 3, (u.radius + 3) * 0.45, 0, 0, TAU); ctx.stroke();
  }

  drawBuildingSelect(b, sel) {
    const ctx = this.ctx, g = this.game, S = b.size * TILE;
    const c = b.team === g.player ? '#3dff8a' : g.player >= 0 && g.isEnemy(g.player, b.team) ? '#ff4d4d' : '#ffe14d';
    ctx.strokeStyle = sel ? c : rgba(c, 0.6);
    ctx.lineWidth = sel ? 3 : 2;
    ctx.beginPath(); ctx.ellipse(b.x, b.y + S * 0.3, S * 0.55, S * 0.28, 0, 0, TAU); ctx.stroke();
  }

  drawBars(e, sel) {
    const damaged = e.hp < e.maxHp - 0.5 || (e.maxShield && e.shield < e.maxShield - 0.5);
    if (!sel && !damaged) return;
    const ctx = this.ctx;
    const isB = e.kind === 'building';
    const w = isB ? e.size * TILE * 0.7 : Math.max(22, e.radius * 2.2);
    const x = e.x - w / 2;
    const y = isB ? e.y - e.size * TILE * 0.62 : e.y - (e.air ? 22 : 0) - e.radius - 14;
    const k = clamp(e.hp / e.maxHp, 0, 1);
    Art.rrect(ctx, x, y, w, 6, 3, '#ffffff', OUTLINE, 1.4);
    const col = k > 0.6 ? '#4fd11a' : k > 0.3 ? '#ffcf0a' : '#ff4d4d';
    if (k > 0) Art.rrect(ctx, x + 1.2, y + 1.2, (w - 2.4) * k, 3.6, 1.8, col, null);
    if (e.maxShield) {
      const ks = clamp(e.shield / e.maxShield, 0, 1);
      Art.rrect(ctx, x, y - 6, w, 5, 2.5, '#ffffff', OUTLINE, 1.2);
      if (ks > 0) Art.rrect(ctx, x + 1, y - 5, (w - 2) * ks, 3, 1.5, '#3fb8ff', null);
    }
  }

  // ---------- minimap ----------
  drawMinimap(cam) {
    const g = this.game, m = this.mctx, cw = this.mm.width, ch = this.mm.height;
    if (!cw || !ch) return;
    const sx = cw / g.map.pxW, sy = ch / g.map.pxH;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.drawImage(this.mmBg, 0, 0, cw, ch);
    m.globalAlpha = 0.85;
    m.drawImage(g.paint.canvas, 0, 0, cw, ch);
    m.globalAlpha = 1;
    m.fillStyle = '#5ee6ff';
    for (const r of g.resources) m.fillRect(r.x * sx - 1.5, r.y * sy - 1.5, 3, 3);
    for (const b of g.buildings) {
      const S = b.size * TILE;
      m.fillStyle = OUTLINE;
      m.fillRect((b.x - S / 2) * sx - 1, (b.y - S / 2) * sy - 1, S * sx + 2, S * sy + 2);
      m.fillStyle = g.teams[b.team].color.main;
      m.fillRect((b.x - S / 2) * sx, (b.y - S / 2) * sy, S * sx, S * sy);
    }
    for (const u of g.units) {
      m.fillStyle = OUTLINE;
      m.fillRect(u.x * sx - 2.5, u.y * sy - 2.5, 5, 5);
      m.fillStyle = g.teams[u.team].color.main;
      m.fillRect(u.x * sx - 1.5, u.y * sy - 1.5, 3, 3);
    }
    for (const e of g.effects) {
      if (e.type !== 'ping') continue;
      m.strokeStyle = '#ff3d3d'; m.lineWidth = 2;
      m.beginPath(); m.arc(e.x * sx, e.y * sy, 6 + ((e.t * 20) % 10), 0, TAU); m.stroke();
    }
    m.strokeStyle = '#ffffff'; m.lineWidth = 2;
    m.strokeRect(cam.x * sx, cam.y * sy, (cam.w / cam.zoom) * sx, (cam.h / cam.zoom) * sy);
  }
}
