'use strict';
// Procedural cartoon art. Every unit, building and portrait is drawn with
// canvas shapes: bright fills, thick dark outlines and big googly eyes.
// Unit drawings face right and are centred on (0, 0).

const Art = (() => {
  const LW = 2.2;

  function path(ctx, fill, stroke = OUTLINE, lw = LW) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function circ(ctx, x, y, r, fill, stroke, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); path(ctx, fill, stroke, lw); }
  function ell(ctx, x, y, rx, ry, fill, stroke, lw, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); path(ctx, fill, stroke, lw); }
  function rrect(ctx, x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    path(ctx, fill, stroke, lw);
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    path(ctx, fill, stroke, lw);
  }
  function line(ctx, x0, y0, x1, y1, color = OUTLINE, lw = LW) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
  }
  function star(ctx, x, y, r, fill, stroke, lw, rot = 0, points = 5) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / points, rr = i % 2 ? r * 0.48 : r;
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    poly(ctx, pts, fill, stroke, lw);
  }
  // Googly eye. look: x offset of the pupil (-1..1). grump: draw a cross eyebrow.
  function eye(ctx, x, y, s, look = 0.4, grump = false, mirror = false) {
    circ(ctx, x, y, s, '#ffffff', OUTLINE, Math.max(1.4, s * 0.3));
    circ(ctx, x + look * s * 0.4, y + s * 0.1, s * 0.55, OUTLINE, null);
    circ(ctx, x + look * s * 0.4 + s * 0.2, y - s * 0.15, s * 0.18, '#ffffff', null);
    if (grump) {
      const d = mirror ? -1 : 1;
      line(ctx, x - s * 1.0 * d, y - s * 1.45, x + s * 0.9 * d, y - s * 0.85, OUTLINE, Math.max(1.6, s * 0.35));
    }
  }
  function shadow(ctx, rx, ry, y = 0) { ell(ctx, 0, y, rx, ry, 'rgba(30,20,60,0.22)', null); }
  function crystalShape(ctx, x, y, h, w, fill, light) {
    poly(ctx, [x, y - h, x + w, y - h * 0.55, x + w * 0.8, y, x - w * 0.8, y, x - w, y - h * 0.55], fill, OUTLINE, 1.8);
    poly(ctx, [x, y - h, x + w * 0.35, y - h * 0.55, x, y - h * 0.15, x - w * 0.5, y - h * 0.55], light, null);
  }

  // ---------------- units ----------------
  const U = {};

  U.byggebot = (ctx, c, o) => {
    const b = o.moving ? Math.sin(o.t * 16) * 1.2 : 0;
    circ(ctx, -6, 8, 3.6, '#4a4466'); circ(ctx, 6, 8, 3.6, '#4a4466');
    rrect(ctx, -10, -8 + b, 20, 16, 6, c.main);
    rrect(ctx, -7, 1 + b, 9, 4, 2, c.light, null);
    ctx.beginPath(); ctx.arc(0, -8 + b, 8, Math.PI, 0); ctx.closePath(); path(ctx, '#ffd23f');
    rrect(ctx, -11, -9.5 + b, 22, 3.5, 1.5, '#ffd23f');
    eye(ctx, 4, -2 + b, 4.4, 0.6, o.grump);
    if (o.carry) crystalShape(ctx, -12, -2 + b, 10, 5, '#5ee6ff', '#d6fbff');
  };

  U.malersoldat = (ctx, c, o) => {
    const step = o.moving ? Math.sin(o.t * 14) * 2.5 : 0;
    ell(ctx, -3 + step, 9, 3.2, 2.4, '#3b3552'); ell(ctx, 4 - step, 9, 3.2, 2.4, '#3b3552');
    rrect(ctx, -7, -2, 14, 12, 5, c.main);
    // blaster
    const kick = o.attack ? -2 : 0;
    rrect(ctx, 0 + kick, 0, 15, 5, 2, '#5a5a78');
    circ(ctx, 2 + kick, 4, 4, c.light);
    rrect(ctx, 13 + kick, -0.5, 4, 6, 1.5, c.main);
    // helmet head
    circ(ctx, 0, -8, 7.5, '#ffffff');
    ell(ctx, 3, -8, 4.6, 3.6, c.light);
    eye(ctx, 4, -8.5, 2.6, 0.7, o.grump);
    circ(ctx, -4, -15, 2, c.main);
  };

  U.rullebil = (ctx, c, o) => {
    const b = o.moving ? Math.sin(o.t * 18) * 0.8 : 0;
    circ(ctx, -9, 9, 5, '#4a4466'); circ(ctx, 6, 9, 5, '#4a4466');
    circ(ctx, -9, 9, 2, '#9a96b0', null); circ(ctx, 6, 9, 2, '#9a96b0', null);
    // roller
    const spin = o.t * (o.moving ? 10 : 0);
    line(ctx, 10, -2 + b, 16, 2 + b, OUTLINE, 3);
    rrect(ctx, 14, -12 + b, 8, 24, 3.5, c.main);
    for (let i = 0; i < 3; i++) {
      const yy = ((i * 8 + spin * 4) % 24) - 12;
      line(ctx, 15.5, yy + b, 20.5, yy + b, c.light, 1.6);
    }
    rrect(ctx, -16, -8 + b, 28, 16, 6, c.main);
    rrect(ctx, -10, -15 + b, 15, 10, 4, c.light);
    eye(ctx, -5, -10 + b, 3.2, 0.6, o.grump); eye(ctx, 2, -10 + b, 3.2, 0.6, o.grump, true);
    // balloon cannon
    const kick = o.attack ? 2 : 0;
    ctx.save(); ctx.translate(-12, -6 + b); ctx.rotate(-0.7);
    rrect(ctx, -3, -14 + kick, 7, 14, 2, '#5a5a78');
    ctx.restore();
    circ(ctx, -12, -6 + b, 4.5, c.light);
  };

  U.ballongflyer = (ctx, c, o) => {
    const sway = Math.sin(o.t * 2) * 1.5;
    line(ctx, -7, 2, -5, 13, OUTLINE, 1.4); line(ctx, 7, 2, 5, 13, OUTLINE, 1.4);
    rrect(ctx, -7 + sway * 0.3, 12, 14, 9, 2.5, '#c98b4a');
    circ(ctx, 0 + sway * 0.3, 10, 3.6, '#ffffff');
    // balloon with stripes
    ctx.save();
    ctx.beginPath(); ctx.ellipse(sway, -6, 14, 15, 0, 0, TAU); ctx.closePath();
    ctx.fillStyle = c.main; ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    for (let i = -2; i <= 2; i += 2) { ctx.beginPath(); ctx.ellipse(sway + i * 5, -6, 2.4, 16, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    ell(ctx, sway, -6, 14, 15, null);
    ell(ctx, sway - 5, -12, 3.5, 5, 'rgba(255,255,255,0.45)', null, 0, -0.4);
    eye(ctx, sway - 3, -5, 3.4, 0.6, o.grump); eye(ctx, sway + 5, -5, 3.4, 0.6, o.grump, true);
  };

  U.sankelarve = (ctx, c, o) => {
    const w = o.moving ? Math.sin(o.t * 12) : 0;
    circ(ctx, -9, 3 + w, 5, c.light);
    circ(ctx, -3, 2 - w, 6.5, c.main);
    circ(ctx, 5, 0 + w * 0.5, 7.5, c.light);
    line(ctx, 6, -6, 4, -13, OUTLINE, 1.6); line(ctx, 9, -6, 12, -13, OUTLINE, 1.6);
    circ(ctx, 4, -13, 1.8, c.main, null); circ(ctx, 12, -13, 1.8, c.main, null);
    eye(ctx, 4, -1, 2.6, 0.6, o.grump); eye(ctx, 9, -1, 2.6, 0.6, o.grump, true);
    if (o.carry) crystalShape(ctx, -9, -3, 10, 5, '#5ee6ff', '#d6fbff');
  };

  U.sprettbille = (ctx, c, o) => {
    const hop = o.moving ? -Math.abs(Math.sin(o.t * 13)) * 5 : 0;
    for (let i = -1; i <= 1; i++) line(ctx, i * 4, 4 + hop, i * 5 + 1, 9, OUTLINE, 1.6);
    ell(ctx, -1, 1 + hop, 9, 7, c.main);
    line(ctx, -1, -6 + hop, -1, 8 + hop, OUTLINE, 1.4);
    circ(ctx, -5, -1 + hop, 1.8, c.light, null); circ(ctx, 3, 3 + hop, 1.6, c.light, null);
    circ(ctx, 8, 0 + hop, 4.6, '#3b3552');
    eye(ctx, 8, -2 + hop, 2.6, 0.7, o.grump);
  };

  U.spyttsnegl = (ctx, c, o) => {
    const s = o.moving ? Math.sin(o.t * 6) * 1.2 : 0;
    ell(ctx, 1 + s * 0.4, 7, 15, 5, c.light);
    // shell spiral
    circ(ctx, -4, -2, 9.5, c.main);
    ctx.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.2) {
      const rr = 7.5 - a * 0.5;
      const x = -4 + Math.cos(a) * rr, y = -2 + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.8; ctx.strokeStyle = c.dark; ctx.stroke();
    // eye stalks
    const sp = o.attack ? 2 : 0;
    line(ctx, 10, 4, 10 + sp, -9, OUTLINE, 2); line(ctx, 14, 4, 16 + sp, -7, OUTLINE, 2);
    eye(ctx, 10 + sp, -10, 3.2, 0.7, o.grump); eye(ctx, 16 + sp, -8, 3, 0.7, o.grump, true);
  };

  U.vingesumm = (ctx, c, o) => {
    const flap = Math.abs(Math.sin(o.t * 30));
    ctx.globalAlpha *= 0.75;
    ell(ctx, -4, -9, 6, 10 * (0.4 + flap * 0.6), '#ffffff', OUTLINE, 1.4, -0.3);
    ell(ctx, 4, -9, 6, 9 * (0.4 + flap * 0.6), '#ffffff', OUTLINE, 1.4, 0.3);
    ctx.globalAlpha /= 0.75;
    poly(ctx, [-14, 2, -19, 3, -14, 5], '#3b3552', null);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-3, 2, 12, 8, 0, 0, TAU); ctx.closePath();
    ctx.fillStyle = c.main; ctx.fill(); ctx.clip();
    ctx.fillStyle = c.dark;
    for (let i = -1; i <= 1; i++) ctx.fillRect(-6 + i * 7, -8, 3.5, 20);
    ctx.restore();
    ell(ctx, -3, 2, 12, 8, null);
    circ(ctx, 10, 0, 6.5, c.light);
    line(ctx, 11, -6, 9, -12, OUTLINE, 1.4); line(ctx, 14, -5, 16, -11, OUTLINE, 1.4);
    eye(ctx, 9, -1, 2.6, 0.7, o.grump); eye(ctx, 14, -1, 2.4, 0.7, o.grump, true);
  };

  U.svevesonde = (ctx, c, o) => {
    const b = Math.sin(o.t * 4) * 2;
    ell(ctx, 0, 11, 7, 2.5, rgba(c.light, 0.6), null);
    poly(ctx, [0, -13 + b, 11, -1 + b, 0, 10 + b, -11, -1 + b], c.light);
    poly(ctx, [0, -8 + b, 6, -1 + b, 0, 6 + b, -6, -1 + b], c.main, null);
    eye(ctx, 1, -1 + b, 3.6, 0.6, o.grump);
    if (o.carry) crystalShape(ctx, -11, 4 + b, 9, 4.5, '#5ee6ff', '#d6fbff');
  };

  U.lysvokter = (ctx, c, o) => {
    const step = o.moving ? Math.sin(o.t * 12) * 2 : 0;
    rrect(ctx, -6 + step, 6, 5, 7, 2, '#3b3552'); rrect(ctx, 2 - step, 6, 5, 7, 2, '#3b3552');
    poly(ctx, [-8, -3, 8, -3, 6, 9, -6, 9], c.main);
    poly(ctx, [-8, -3, 8, -3, 6, 0, -6, 0], '#ffd23f', null);
    // head crystal
    poly(ctx, [0, -19, 7, -11, 4, -3, -4, -3, -7, -11], c.light);
    eye(ctx, 1, -10, 2.8, 0.7, o.grump);
    // light sword
    const sw = o.attack ? -1.2 : 0.4;
    ctx.save(); ctx.translate(7, 1); ctx.rotate(sw);
    rrect(ctx, -1.5, -2, 4, 5, 1, '#5a5a78');
    ctx.shadowColor = c.main; ctx.shadowBlur = 8;
    rrect(ctx, -0.5, -20, 3, 18, 1.5, c.light, c.main, 1.2);
    ctx.restore();
  };

  U.glimtskytter = (ctx, c, o) => {
    const s = o.moving ? Math.sin(o.t * 10) * 2 : 0;
    line(ctx, -2, 2, -10 + s, 13, OUTLINE, 2.6); line(ctx, 2, 2, 10 - s, 13, OUTLINE, 2.6); line(ctx, 0, 2, 1, 14, OUTLINE, 2.6);
    circ(ctx, -10 + s, 13, 2.2, c.main, null); circ(ctx, 10 - s, 13, 2.2, c.main, null);
    poly(ctx, [-12, -4, 0, -15, 12, -4, 7, 5, -7, 5], c.light);
    circ(ctx, 0, -3, 6, c.main);
    eye(ctx, 1, -3, 3.6, 0.7, o.grump);
    rrect(ctx, 9, -7 + (o.attack ? 1 : 0), 9, 4, 2, '#5a5a78');
  };

  U.stjerneseiler = (ctx, c, o) => {
    const b = Math.sin(o.t * 2.2) * 1.5;
    poly(ctx, [22, b, 4, -8 + b, -16, -16 + b, -10, b, -16, 16 + b, 4, 8 + b], c.light);
    poly(ctx, [16, b, 2, -5 + b, -8, b, 2, 5 + b], c.main, null);
    ctx.save(); ctx.shadowColor = c.main; ctx.shadowBlur = 12;
    circ(ctx, 2, b, 6, '#ffffff', c.main, 2);
    ctx.restore();
    eye(ctx, 3, b, 3.6, 0.8, o.grump);
    circ(ctx, -14, -12 + b, 2, '#ffe14d', null); circ(ctx, -14, 12 + b, 2, '#ffe14d', null);
  };

  U.stovsuger = (ctx, c, o) => {
    const b = o.moving ? Math.sin(o.t * 15) * 0.8 : 0;
    ell(ctx, 0, 6, 12, 5, c.dark);
    ell(ctx, 0, 0 + b, 11, 8, c.main);
    line(ctx, 6, 2 + b, 15, 7, OUTLINE, 3); ell(ctx, 16, 8, 3.5, 2, '#5a5a78');
    eye(ctx, -2, -1 + b, 3.4, 0.6, true); eye(ctx, 5, -1 + b, 3.2, 0.6, true, true);
    if (o.carry) crystalShape(ctx, -10, -3 + b, 9, 4.5, '#5ee6ff', '#d6fbff');
  };

  U.stovdott = (ctx, c, o) => {
    const hop = o.moving ? -Math.abs(Math.sin(o.t * 11)) * 3 : 0;
    ell(ctx, -4, 9, 3, 2, '#3b3552'); ell(ctx, 4, 9, 3, 2, '#3b3552');
    // fuzzy outline
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = i % 2 ? 8.5 : 11;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr + hop;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); path(ctx, c.main);
    eye(ctx, -1, -1 + hop, 3.2, 0.7, true); eye(ctx, 5, -1 + hop, 3, 0.7, true, true);
  };

  U.graabot = (ctx, c, o) => {
    const b = o.moving ? Math.sin(o.t * 12) * 1 : 0;
    rrect(ctx, -13, 6, 26, 8, 4, '#4a4466');
    rrect(ctx, -11, -10 + b, 22, 18, 4, c.main);
    line(ctx, 0, -10 + b, 0, -16 + b, OUTLINE, 2); circ(ctx, 0, -17 + b, 2.5, c.light);
    rrect(ctx, 8, -3 + b + (o.attack ? 1 : 0), 12, 5, 2, c.dark);
    eye(ctx, -4, -3 + b, 3.6, 0.6, true); eye(ctx, 4, -3 + b, 3.4, 0.6, true, true);
  };

  U.taakesky = (ctx, c, o) => {
    const b = Math.sin(o.t * 2) * 1.5;
    if (o.attack) for (let i = 0; i < 3; i++) line(ctx, -6 + i * 6, 12 + b, -7 + i * 6, 18 + b, '#7fb7ff', 2);
    const puffs = [[-9, 2, 8], [0, -3, 10], [9, 1, 8], [3, 5, 8], [-4, 5, 8]];
    for (const [x, y, r] of puffs) circ(ctx, x, y + b, r + 2.2, OUTLINE, null);
    for (const [x, y, r] of puffs) circ(ctx, x, y + b, r, c.light, null);
    eye(ctx, -4, 1 + b, 3.2, 0.5, true); eye(ctx, 4, 1 + b, 3.2, 0.5, true, true);
    ctx.beginPath(); ctx.arc(0, 10 + b, 3, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 1.6; ctx.strokeStyle = OUTLINE; ctx.stroke();
  };

  function drawUnit(ctx, type, col, o) {
    const fn = U[type];
    if (!fn) { circ(ctx, 0, 0, 10, col.main); return; }
    fn(ctx, col, o);
  }

  // ---------------- buildings ----------------
  const B = {};
  // All building drawings are centred, S = footprint size in pixels.

  B.stjernestasjon = (ctx, c, o, S) => {
    const h = S / 2;
    rrect(ctx, -h + 6, -h + 26, S - 12, S - 34, 14, '#e8ecf5');
    rrect(ctx, -h + 14, h - 30, S - 28, 12, 5, '#cfd6e6', null);
    ctx.beginPath(); ctx.ellipse(0, 6, S * 0.33, S * 0.36, 0, Math.PI, 0); ctx.closePath(); path(ctx, c.main);
    ell(ctx, -S * 0.12, -S * 0.12, S * 0.07, S * 0.1, 'rgba(255,255,255,0.5)', null);
    for (let i = -1; i <= 1; i++) circ(ctx, i * S * 0.15, -S * 0.04, S * 0.045, c.light);
    rrect(ctx, -10, h - 34, 20, 26, 6, '#5a5a78');
    line(ctx, 0, -S * 0.3, 0, -S * 0.48, OUTLINE, 3);
    star(ctx, 0, -S * 0.5, 10, '#ffe14d', OUTLINE, 2, o.t * 0.8);
  };
  B.kaserne = (ctx, c, o, S) => {
    const h = S / 2;
    rrect(ctx, -h + 8, -h + 30, S - 16, S - 38, 6, '#fff3df');
    poly(ctx, [-h + 2, -h + 34, 0, -h + 4, h - 2, -h + 34], c.main);
    rrect(ctx, -11, h - 30, 22, 22, 8, c.dark);
    circ(ctx, -h + 24, -4, 7, c.light); circ(ctx, h - 24, -4, 7, c.light);
    // flag
    line(ctx, h - 18, -h + 18, h - 18, -h - 6, OUTLINE, 2);
    poly(ctx, [h - 18, -h - 6, h - 4 + Math.sin(o.t * 5) * 2, -h - 1, h - 18, -h + 4], c.light, OUTLINE, 1.6);
  };
  B.verksted = (ctx, c, o, S) => {
    const h = S / 2;
    rrect(ctx, -h + 6, -h + 22, S - 12, S - 30, 8, '#dfe4ee');
    ctx.beginPath(); ctx.ellipse(0, -h + 26, h - 6, 18, 0, Math.PI, 0); ctx.closePath(); path(ctx, c.main);
    rrect(ctx, -h + 18, -h + 40, S - 36, S - 50, 4, '#5a5a78');
    for (let i = 0; i < 4; i++) line(ctx, -h + 20, -h + 48 + i * 9, h - 20, -h + 48 + i * 9, '#7c7c9a', 2);
    // gear
    ctx.save(); ctx.translate(h - 18, -h + 18); ctx.rotate(o.t);
    star(ctx, 0, 0, 11, '#ffd23f', OUTLINE, 2, 0, 8);
    circ(ctx, 0, 0, 4, '#ffffff');
    ctx.restore();
  };
  function towerBase(ctx, S, fill) {
    const h = S / 2;
    poly(ctx, [-h + 8, h - 6, h - 8, h - 6, h - 16, -h + 20, -h + 16, -h + 20], fill);
  }
  B.vakttarn = (ctx, c, o, S) => {
    towerBase(ctx, S, '#e8ecf5');
    rrect(ctx, -S / 2 + 10, -S / 2 + 10, S - 20, 12, 4, c.main);
    ctx.save(); ctx.translate(0, -S / 2 + 8); ctx.rotate(o.aim || 0);
    rrect(ctx, 0, -4, 20, 8, 3, '#5a5a78');
    ctx.restore();
    circ(ctx, 0, -S / 2 + 8, 9, c.light);
    eye(ctx, 2, -S / 2 + 8, 3, Math.cos(o.aim || 0), o.grump);
  };

  B.bikube = (ctx, c, o, S) => {
    const h = S / 2;
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const w = (S * 0.44) * (1 - Math.abs(i - 2.6) * 0.16);
      const y = h - 18 - i * (S * 0.16);
      ell(ctx, 0, y, w, S * 0.12, i % 2 ? c.light : c.main);
    }
    ell(ctx, 0, h - 26, 12, 10, '#3b3552');
    circ(ctx, -14, -S * 0.2, 3, '#ffe14d', null); circ(ctx, 18, -S * 0.05, 3, '#ffe14d', null);
    eye(ctx, -12, -h + 40, 6, 0.4, o.grump); eye(ctx, 12, -h + 40, 6, 0.4, o.grump, true);
  };
  B.klekkeri = (ctx, c, o, S) => {
    const h = S / 2;
    ell(ctx, 0, h - 26, h - 4, 22, '#b07a4a');
    for (let i = 0; i < 6; i++) line(ctx, -h + 10 + i * 14, h - 34, -h + 20 + i * 14, h - 12, '#8a5a32', 2);
    const eggs = [[-18, -4], [0, -12], [18, -4]];
    eggs.forEach(([x, y], i) => {
      const wob = Math.sin(o.t * 3 + i * 2) * 0.12;
      ell(ctx, x, y, 12, 16, '#fffaf0', OUTLINE, LW, wob);
      circ(ctx, x - 3, y - 4, 3, c.main, null); circ(ctx, x + 4, y + 4, 2.5, c.light, null);
    });
  };
  B.vingereir = (ctx, c, o, S) => {
    const h = S / 2;
    const f = Math.sin(o.t * 3) * 0.15;
    ell(ctx, -20, -10, 22, 12, rgba('#ffffff', 0.85), OUTLINE, 1.8, -0.5 - f);
    ell(ctx, 20, -10, 22, 12, rgba('#ffffff', 0.85), OUTLINE, 1.8, 0.5 + f);
    rrect(ctx, -18, -8, 36, h + 2, 8, '#a8743f');
    for (let i = 0; i < 3; i++) line(ctx, -10 + i * 10, -2, -10 + i * 10, h - 10, '#8a5a32', 2);
    ell(ctx, 0, -10, 24, 9, c.main);
    circ(ctx, -7, -14, 4, c.light, null); circ(ctx, 7, -14, 4, c.light, null);
  };
  B.piggsopp = (ctx, c, o, S) => {
    rrect(ctx, -8, -4, 16, S / 2, 6, '#fff3df');
    ctx.beginPath(); ctx.arc(0, -2, S * 0.4, Math.PI, 0); ctx.closePath(); path(ctx, c.main);
    circ(ctx, -10, -12, 4, '#ffffff', null); circ(ctx, 8, -16, 3.5, '#ffffff', null); circ(ctx, 2, -6, 3, '#ffffff', null);
    eye(ctx, -4, 10, 3, 0.4, o.grump); eye(ctx, 4, 10, 3, 0.4, o.grump, true);
  };

  B.krystallhjerte = (ctx, c, o, S) => {
    const h = S / 2;
    poly(ctx, [-h + 6, h - 24, -h + 24, h - 8, h - 24, h - 8, h - 6, h - 24, h - 24, h - 40, -h + 24, h - 40], '#e6f7ff');
    const pulse = 1 + Math.sin(o.t * 3) * 0.05;
    ctx.save(); ctx.shadowColor = c.main; ctx.shadowBlur = 18;
    crystalShape(ctx, -24, h - 24, S * 0.45, 14, c.light, '#ffffff');
    crystalShape(ctx, 24, h - 24, S * 0.42, 13, c.light, '#ffffff');
    crystalShape(ctx, 0, h - 20, S * 0.75 * pulse, 20, c.main, c.light);
    ctx.restore();
    eye(ctx, -6, -6, 5, 0.3, o.grump); eye(ctx, 6, -6, 5, 0.3, o.grump, true);
  };
  B.portal = (ctx, c, o, S) => {
    const h = S / 2;
    ell(ctx, 0, h - 14, h - 6, 10, '#e6f7ff');
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -4, 22, 30, 0, 0, TAU); ctx.closePath();
    ctx.fillStyle = c.dark; ctx.fill(); ctx.clip();
    for (let i = 0; i < 4; i++) {
      const a = o.t * 2 + i * 1.6;
      circ(ctx, Math.cos(a) * 10, -4 + Math.sin(a) * 14, 9 - i, c.light, null);
    }
    ctx.restore();
    ell(ctx, 0, -4, 22, 30, null, OUTLINE, 3);
    crystalShape(ctx, -30, h - 12, S * 0.7, 9, c.light, '#ffffff');
    crystalShape(ctx, 30, h - 12, S * 0.7, 9, c.light, '#ffffff');
  };
  B.stjerneport = (ctx, c, o, S) => {
    const h = S / 2;
    ell(ctx, 0, 8, h - 4, h * 0.6, '#e6f7ff');
    ell(ctx, 0, 6, h - 16, h * 0.42, c.dark);
    for (let i = 0; i < 6; i++) {
      const a = o.t * 0.8 + (i / 6) * TAU;
      star(ctx, Math.cos(a) * (h - 10), 8 + Math.sin(a) * (h * 0.6 - 6), 6, c.light, OUTLINE, 1.5);
    }
    ctx.save(); ctx.shadowColor = c.main; ctx.shadowBlur = 14;
    star(ctx, 0, -6, 16, '#ffe14d', OUTLINE, 2, Math.sin(o.t) * 0.3);
    ctx.restore();
  };
  B.lystarn = (ctx, c, o, S) => {
    poly(ctx, [-12, S / 2 - 6, 12, S / 2 - 6, 7, -8, -7, -8], c.light);
    poly(ctx, [-3, S / 2 - 10, 3, S / 2 - 10, 2, -4, -2, -4], '#ffffff', null);
    ctx.save(); ctx.shadowColor = c.main; ctx.shadowBlur = 14;
    circ(ctx, 0, -S / 2 + 12, 9 + Math.sin(o.t * 4), c.main);
    ctx.restore();
    eye(ctx, 0, -S / 2 + 12, 3.6, Math.cos(o.aim || 0), o.grump);
  };

  function cloud(ctx, puffs, fill) {
    for (const [x, y, r] of puffs) circ(ctx, x, y, r + 2.4, OUTLINE, null);
    for (const [x, y, r] of puffs) circ(ctx, x, y, r, fill, null);
  }
  B.skyslottet = (ctx, c, o, S) => {
    const h = S / 2;
    cloud(ctx, [[-40, h - 22, 18], [-14, h - 16, 20], [14, h - 16, 20], [40, h - 22, 18]], c.light);
    rrect(ctx, -30, -h + 34, 60, h + 6, 6, c.main);
    rrect(ctx, -46, -h + 22, 18, h + 10, 4, c.main); rrect(ctx, 28, -h + 22, 18, h + 10, 4, c.main);
    poly(ctx, [-50, -h + 24, -37, -h + 2, -24, -h + 24], c.dark);
    poly(ctx, [24, -h + 24, 37, -h + 2, 50, -h + 24], c.dark);
    poly(ctx, [-26, -h + 36, 0, -h + 8, 26, -h + 36], c.dark);
    eye(ctx, -9, -6, 6, 0, true); eye(ctx, 9, -6, 6, 0, true, true);
    ctx.beginPath(); ctx.arc(0, 18, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
  };
  B.taakefabrikk = (ctx, c, o, S) => {
    const h = S / 2;
    rrect(ctx, -h + 6, -h + 30, S - 12, S - 38, 4, c.main);
    poly(ctx, [-h + 6, -h + 30, -h + 22, -h + 18, -h + 22, -h + 30, -h + 38, -h + 18, -h + 38, -h + 30], c.dark);
    rrect(ctx, h - 26, -h + 6, 14, 30, 2, c.dark);
    for (let i = 0; i < 3; i++) {
      const p = (o.t * 0.5 + i / 3) % 1;
      circ(ctx, h - 19 + p * 10, -h + 4 - p * 26, 4 + p * 7, rgba('#d0d3da', 1 - p), null);
    }
    rrect(ctx, -12, h - 28, 24, 20, 3, '#4a4466');
    eye(ctx, -16, -2, 4.5, 0.2, true); eye(ctx, 16, -2, 4.5, -0.2, true, true);
  };
  B.skyverksted = (ctx, c, o, S) => {
    const h = S / 2;
    rrect(ctx, -h + 8, -h + 30, S - 16, S - 38, 8, c.main);
    rrect(ctx, -h + 20, -h + 44, S - 40, S - 54, 4, '#4a4466');
    cloud(ctx, [[-16, -h + 26, 13], [4, -h + 18, 16], [22, -h + 26, 12]], c.light);
    eye(ctx, -2, -h + 20, 4, 0.2, true); eye(ctx, 9, -h + 20, 4, 0.2, true, true);
  };
  B.graataarn = (ctx, c, o, S) => {
    towerBase(ctx, S, c.main);
    cloud(ctx, [[-10, -S / 2 + 12, 9], [2, -S / 2 + 6, 11], [12, -S / 2 + 12, 8]], c.light);
    eye(ctx, -2, -S / 2 + 10, 3.4, Math.cos(o.aim || 0), true); eye(ctx, 6, -S / 2 + 10, 3.2, Math.cos(o.aim || 0), true, true);
  };

  function drawBuilding(ctx, type, col, o) {
    const S = BUILDINGS[type].size * TILE;
    const fn = B[type];
    shadow(ctx, S * 0.48, S * 0.18, S * 0.4);
    if (!fn) { rrect(ctx, -S / 2 + 4, -S / 2 + 4, S - 8, S - 8, 8, col.main); return; }
    fn(ctx, col, o, S);
  }

  function drawCrystal(ctx, variant, frac, t) {
    const s = 0.55 + 0.45 * frac;
    const cols = [['#5ee6ff', '#d6fbff'], ['#ff8fd0', '#ffe0f2'], ['#b28cff', '#ece2ff']][variant % 3];
    shadow(ctx, 14, 5, 9);
    crystalShape(ctx, -7, 10, 18 * s, 5.5, cols[0], cols[1]);
    crystalShape(ctx, 7, 10, 16 * s, 5, cols[0], cols[1]);
    crystalShape(ctx, 0, 11, 26 * s, 7, cols[0], cols[1]);
    const tw = (Math.sin(t * 3 + variant * 2) + 1) / 2;
    if (tw > 0.7) star(ctx, 5, -10 * s, 3 + tw * 2, '#ffffff', null, 0, t);
  }

  // ---------------- portraits ----------------
  const P = {};
  P.stella = (ctx, t) => {
    circ(ctx, 0, 70, 70, '#ff8a00');
    circ(ctx, 0, 0, 62, '#ffffff');
    circ(ctx, 0, 6, 46, '#ffd9b8');
    // hair
    ctx.beginPath(); ctx.ellipse(0, -22, 44, 26, 0, Math.PI, TAU); ctx.closePath(); path(ctx, '#ff6a2b');
    circ(ctx, -30, -18, 12, '#ff6a2b'); circ(ctx, 34, -16, 10, '#ff6a2b');
    eye(ctx, -16, 4, 9, 0.2 + Math.sin(t) * 0.2); eye(ctx, 16, 4, 9, 0.2 + Math.sin(t) * 0.2);
    circ(ctx, -26, 22, 6, 'rgba(255,120,120,0.45)', null); circ(ctx, 26, 22, 6, 'rgba(255,120,120,0.45)', null);
    ctx.beginPath(); ctx.arc(0, 22, 14, 0.15 * Math.PI, 0.85 * Math.PI); path(ctx, '#ffffff', OUTLINE, 3);
    star(ctx, 46, -46, 12, '#ffe14d', OUTLINE, 2, t * 0.5);
  };
  P.bolt = (ctx, t) => {
    line(ctx, 0, -50, 0, -74, OUTLINE, 4);
    ctx.save(); ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 20 * (0.5 + Math.sin(t * 4) * 0.5);
    circ(ctx, 0, -78, 10, '#ffe14d');
    ctx.restore();
    rrect(ctx, -58, -50, 116, 100, 26, '#8fb3d9');
    rrect(ctx, -44, -34, 88, 58, 18, '#dff0ff');
    eye(ctx, -18, -6, 14, Math.sin(t * 1.3) * 0.6); eye(ctx, 18, -6, 14, Math.sin(t * 1.3) * 0.6);
    rrect(ctx, -22, 32, 44, 10, 5, '#5a5a78');
    circ(ctx, -66, 0, 9, '#ff8a00'); circ(ctx, 66, 0, 9, '#ff8a00');
  };
  P.summa = (ctx, t) => {
    const f = Math.sin(t * 20) * 0.1;
    ctx.globalAlpha = 0.8;
    ell(ctx, -58, -30, 30, 44, '#ffffff', OUTLINE, 2, -0.6 - f);
    ell(ctx, 58, -30, 30, 44, '#ffffff', OUTLINE, 2, 0.6 + f);
    ctx.globalAlpha = 1;
    line(ctx, -18, -48, -30, -80, OUTLINE, 3); line(ctx, 18, -48, 30, -80, OUTLINE, 3);
    circ(ctx, -30, -80, 7, '#ff3da5'); circ(ctx, 30, -80, 7, '#ff3da5');
    circ(ctx, 0, 10, 58, '#ffcf3a');
    ctx.save(); ctx.beginPath(); ctx.arc(0, 10, 58, 0, TAU); ctx.clip();
    ctx.fillStyle = '#ff3da5'; ctx.fillRect(-70, 40, 140, 16); ctx.fillRect(-70, 64, 140, 16);
    ctx.restore();
    circ(ctx, 0, 10, 58, null);
    poly(ctx, [-30, -40, -30, -66, -15, -52, 0, -72, 15, -52, 30, -66, 30, -40], '#ffe14d');
    circ(ctx, 0, -56, 4, '#ff3da5', null);
    eye(ctx, -20, 2, 11, Math.sin(t) * 0.4); eye(ctx, 20, 2, 11, Math.sin(t) * 0.4);
    ctx.beginPath(); ctx.arc(0, 22, 12, 0.15 * Math.PI, 0.85 * Math.PI); path(ctx, null, OUTLINE, 3);
  };
  P.lumi = (ctx, t) => {
    ctx.save(); ctx.shadowColor = '#00c4b4'; ctx.shadowBlur = 30;
    poly(ctx, [0, -80, 56, -20, 40, 60, -40, 60, -56, -20], '#80efe4');
    ctx.restore();
    poly(ctx, [0, -80, 20, -20, 0, 10, -26, -20], '#ffffff', null);
    ctx.globalAlpha = 0.5; poly(ctx, [0, -80, 20, -20, 0, 10, -26, -20], '#ffffff', null); ctx.globalAlpha = 1;
    // serene closed eyes
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 20, 4, 9, 0.1 * Math.PI, 0.9 * Math.PI); path(ctx, null, OUTLINE, 3.5); }
    ctx.beginPath(); ctx.arc(0, 26, 8, 0.2 * Math.PI, 0.8 * Math.PI); path(ctx, null, OUTLINE, 3);
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + (i * TAU) / 4;
      star(ctx, Math.cos(a) * 80, Math.sin(a) * 60, 6, '#ffe14d', null, 0, t);
    }
  };
  function skoddaCloud(ctx, fill) {
    cloud(ctx, [[-50, 10, 34], [-16, -18, 42], [26, -14, 38], [52, 14, 30], [0, 26, 36], [-34, 34, 26], [34, 36, 26]], fill);
  }
  P.skodda = (ctx, t) => {
    skoddaCloud(ctx, '#b9bcc4');
    eye(ctx, -20, 0, 12, Math.sin(t) * 0.5, true); eye(ctx, 20, 0, 12, Math.sin(t) * 0.5, true, true);
    ctx.beginPath(); ctx.arc(0, 40, 14, 1.15 * Math.PI, 1.85 * Math.PI); path(ctx, null, OUTLINE, 4);
    for (let i = 0; i < 4; i++) line(ctx, -30 + i * 20, 66 + ((t * 40 + i * 9) % 20), -32 + i * 20, 74 + ((t * 40 + i * 9) % 20), '#7fb7ff', 3);
  };
  P.regnbue = (ctx, t) => {
    const cols = ['#ff3d6e', '#ff8a00', '#ffcf0a', '#4fd11a', '#2f6bff', '#9b4dff'];
    cols.forEach((c, i) => { ctx.beginPath(); ctx.arc(0, 40, 96 - i * 9, Math.PI, TAU); ctx.lineWidth = 9; ctx.strokeStyle = c; ctx.stroke(); });
    skoddaCloud(ctx, '#ffffff');
    eye(ctx, -20, 0, 12, Math.sin(t) * 0.5); eye(ctx, 20, 0, 12, Math.sin(t) * 0.5);
    circ(ctx, -36, 18, 8, 'rgba(255,120,160,0.5)', null); circ(ctx, 36, 18, 8, 'rgba(255,120,160,0.5)', null);
    ctx.beginPath(); ctx.arc(0, 22, 16, 0.15 * Math.PI, 0.85 * Math.PI); path(ctx, '#ff8fb0', OUTLINE, 3.5);
  };
  P.forteller = (ctx, t) => {
    // a storybook with a star
    poly(ctx, [-70, -40, 0, -26, 0, 54, -70, 40], '#ffffff');
    poly(ctx, [70, -40, 0, -26, 0, 54, 70, 40], '#fff6dd');
    for (let i = 0; i < 4; i++) { line(ctx, -58, -24 + i * 14, -12, -14 + i * 14, '#c9c2e0', 3); line(ctx, 12, -14 + i * 14, 58, -24 + i * 14, '#c9c2e0', 3); }
    star(ctx, 0, -66, 20, '#ffe14d', OUTLINE, 3, Math.sin(t) * 0.3);
  };

  function drawPortrait(ctx, who, t) {
    (P[who] || P.forteller)(ctx, t);
  }

  // Small cached icons for buttons.
  const iconCache = new Map();
  function icon(kind, type, colorKey, size = 64) {
    const key = kind + type + colorKey + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const col = COLORS[colorKey] || COLORS.orange;
    ctx.translate(size / 2, size / 2);
    const grump = colorKey === 'grey';
    if (kind === 'unit') {
      const r = UNITS[type].radius;
      const s = (size * 0.36) / Math.max(r, 12);
      ctx.scale(s, s);
      drawUnit(ctx, type, col, { t: 0.4, grump, carry: false, moving: false });
    } else if (kind === 'building') {
      const S = BUILDINGS[type].size * TILE;
      const s = (size * 0.9) / (S * 1.25);
      ctx.scale(s, s);
      ctx.translate(0, S * 0.1);
      drawBuilding(ctx, type, col, { t: 0.4, grump });
    } else if (kind === 'portrait') {
      ctx.scale(size / 200, size / 200);
      drawPortrait(ctx, type, 0);
    }
    const url = cv.toDataURL();
    iconCache.set(key, url);
    return url;
  }

  return { drawUnit, drawBuilding, drawCrystal, drawPortrait, icon, circ, ell, rrect, poly, line, star, eye, cloud };
})();
