// three.js renderer: a glossy, toy-like 2.5D view of the game.
// The simulation is unchanged; this file only mirrors game state into a 3D
// scene every frame. A fixed orthographic camera looks down at 55 degrees, so
// screen x is world x and screen y is world y squashed by sin(55).
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { GEO, mat, outlineMat, buildUnit, buildBuilding, buildCrystal } from './models3d.js';

const PITCH = (40 * Math.PI) / 180;
const UNIT_SCALE = 1.35; // units are drawn a bit larger than their collision size
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function setupLook(renderer, scene) {
  renderer.toneMapping = THREE.NoToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  return scene.environment;
}

const flatCircle = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const thinRingGeo = new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2);
const basicMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

class Renderer3D {
  static supported() { return webglSupported(); }

  constructor(canvas, minimap, overlay) {
    this.canvas = canvas;
    this.mm = minimap;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.dpr = 1;
    this.game = null;
    this.cam = null;

    const gl = this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2b2152');
    this.envTex = setupLook(gl, this.scene);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 8000);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a98', 1.0));
    const sun = this.sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 3000;
    this.scene.add(sun, sun.target);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.views = new Map();
    this.seen = new Set();

    // A 2D renderer is reused to paint the ground texture and the minimap.
    this.helper2D = new Renderer(document.createElement('canvas'), minimap);

    // Pools for rings, discs and instanced effects (kept outside this.world).
    this.fx = new THREE.Group();
    this.scene.add(this.fx);
    this.ringMats = {
      own: basicMat('#3dff8a', 0.95), enemy: basicMat('#ff4d4d', 0.95), ally: basicMat('#ffe14d', 0.95),
      ownH: basicMat('#3dff8a', 0.5), enemyH: basicMat('#ff4d4d', 0.5), allyH: basicMat('#ffe14d', 0.5),
      range: basicMat('#ffffff', 0.5), disc: basicMat('#ffffff', 0.09), ok: basicMat('#50ff78', 0.4), bad: basicMat('#ff3c3c', 0.45),
    };
    this.rings = []; this.discs = []; this.thinRings = [];

    const instMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18 });
    this.projMesh = new THREE.InstancedMesh(GEO.sphere, instMat, 400);
    this.partMesh = new THREE.InstancedMesh(GEO.sphere, instMat, 900);
    for (const m of [this.projMesh, this.partMesh]) {
      m.setColorAt(0, new THREE.Color('#ffffff'));
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.fx.add(m);
    }
    this.tmpM = new THREE.Matrix4();
    this.tmpC = new THREE.Color();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();

    this.footprint = new THREE.Mesh(flatPlane, this.ringMats.ok);
    this.footprint.visible = false;
    this.fx.add(this.footprint);
    this.ghost = null; this.ghostType = null; this.ghostMats = new Map();
    this.paintT = 0;
    this.lastShadowHalf = 0;
  }

  get K() { return 1 / SIN; }

  project(x, y, h = 0) {
    const c = this.cam;
    return { x: (x - c.x) * c.zoom, y: ((y - c.y) * SIN - h * COS) * c.zoom };
  }

  buildingScreenBox(b) {
    const S = b.size * TILE, c = this.cam;
    const v = this.views.get(b.id);
    const h = v ? v.height : S * 0.7;
    return {
      x0: (b.x - S / 2 - c.x) * c.zoom, x1: (b.x + S / 2 - c.x) * c.zoom,
      y0: this.project(b.x, b.y - S / 2, h).y, y1: this.project(b.x, b.y + S / 2, 0).y,
    };
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h);
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.overlay.style.width = w + 'px';
    this.overlay.style.height = h + 'px';
    const r = this.mm.getBoundingClientRect();
    if (r.width > 0) {
      this.mm.width = Math.round(r.width * this.dpr);
      this.mm.height = Math.round(r.height * this.dpr);
    }
  }

  // ---------- per-game setup ----------
  setGame(game) {
    this.game = game;
    for (const v of this.views.values()) this.world.remove(v.obj);
    this.views.clear();
    this.world.clear();
    if (this.groundTex) { this.groundTex.dispose(); this.paintTex.dispose(); }
    if (this.ghost) { this.fx.remove(this.ghost); this.ghost = null; this.ghostType = null; }

    const map = game.map, th = map.theme;
    this.helper2D.game = game;
    this.helper2D.buildStatic();

    // Floating island: textured ground on top of a thick base.
    const W = map.pxW, H = map.pxH;
    const gt = this.groundTex = new THREE.CanvasTexture(this.helper2D.ground);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.anisotropy = this.gl.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.92, envMap: this.envTex, envMapIntensity: 0.12 }));
    ground.position.set(W / 2, 0, H / 2);
    ground.receiveShadow = true;
    this.world.add(ground);
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 70, H), mat(shade(th.ground[0], -0.45), { rough: 0.9 }));
    base.position.set(W / 2, -35.3, H / 2);
    this.world.add(base);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 10, H + 6), mat(shade(th.ground[0], -0.15), { rough: 0.8 }));
    rim.position.set(W / 2, -5.4, H / 2);
    this.world.add(rim);

    // Glossy wet paint.
    const pt = this.paintTex = new THREE.CanvasTexture(game.paint.canvas);
    pt.colorSpace = THREE.SRGBColorSpace;
    pt.anisotropy = gt.anisotropy;
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: '#ffffff', emissiveIntensity: 0.05, transparent: true, roughness: 0.16, envMap: this.envTex, envMapIntensity: 0.22,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    paint.position.set(W / 2, 0.4, H / 2);
    paint.receiveShadow = true;
    paint.renderOrder = 1;
    this.world.add(paint);

    this.buildTerrain(map);
  }

  buildTerrain(map) {
    const th = map.theme, rng = makeRng(map.w * 131 + map.h * 7);
    const rocks = [], water = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      if (t === T_ROCK) rocks.push([x, y]); else if (t === T_WATER) water.push([x, y]);
    }
    const M = this.tmpM, Q = this.tmpQ, S = this.tmpS, P = this.tmpP;
    const inst = (geo, material, list, fn, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((it, i) => { fn(it, i); M.compose(P, Q, S); im.setMatrixAt(i, M); });
      im.castShadow = shadow;
      im.receiveShadow = true;
      this.world.add(im);
      return im;
    };
    const ident = () => Q.identity();

    if (water.length) {
      const is = (x, y) => map.inBounds(x, y) && map.tiles[y * map.w + x] === T_WATER;
      const at = ([x, y]) => P.set((x + 0.5) * TILE, 0, (y + 0.5) * TILE);
      inst(flatCircle, mat(shade(th.water, -0.45), { rough: 0.5 }), water, (it) => { at(it); P.y = 0.9; ident(); S.set(26, 1, 26); }, false);
      const wm = mat(th.water, { rough: 0.04 });
      inst(flatCircle, wm, water, (it) => { at(it); P.y = 1.6; ident(); S.set(22.5, 1, 22.5); }, false);
      const fills = [];
      for (const [x, y] of water) {
        if (is(x + 1, y)) fills.push([(x + 1) * TILE, (y + 0.5) * TILE, TILE, 30]);
        if (is(x, y + 1)) fills.push([(x + 0.5) * TILE, (y + 1) * TILE, 30, TILE]);
        if (is(x + 1, y) && is(x, y + 1) && is(x + 1, y + 1)) fills.push([(x + 1) * TILE, (y + 1) * TILE, TILE, TILE]);
      }
      inst(flatPlane, wm, fills, ([x, y, w, h]) => { P.set(x, 1.6, y); ident(); S.set(w, 1, h); }, false);
      // Sparkles on the water.
      const sp = water.filter(() => rng() < 0.3);
      inst(GEO.sphere, mat('#ffffff', { rough: 0.1, glow: 0.4 }), sp, ([x, y]) => {
        P.set((x + 0.2 + rng() * 0.6) * TILE, 1.8, (y + 0.2 + rng() * 0.6) * TILE); ident(); S.set(4, 0.6, 1.6);
      }, false);
    }

    if (rocks.length) {
      const items = rocks.map(([x, y]) => ({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE, a: rng(), b: rng(), c: rng() }));
      const style = th.obstacle;
      if (style === 'tree') {
        inst(GEO.cyl, mat('#8a5a32', { rough: 0.7 }), items, (o) => { P.set(o.x, 6, o.z); ident(); S.set(5, 12, 5); });
        const r = (o) => 17 + o.a * 4;
        inst(GEO.sphere, outlineMat, items, (o) => { P.set(o.x + (o.b - 0.5) * 6, 24, o.z + (o.c - 0.5) * 6); ident(); S.set(r(o) + 2.2, r(o) * 0.85 + 2.2, r(o) + 2.2); }, false);
        inst(GEO.sphere, mat(th.obstacleFill, { rough: 0.45 }), items, (o) => { P.set(o.x + (o.b - 0.5) * 6, 24, o.z + (o.c - 0.5) * 6); ident(); S.set(r(o), r(o) * 0.85, r(o)); });
        inst(GEO.sphere, mat(th.obstacleLight, { rough: 0.4 }), items, (o) => { P.set(o.x + (o.b - 0.5) * 6 - 4, 33, o.z + (o.c - 0.5) * 6 - 3); ident(); S.setScalar(r(o) * 0.5); }, false);
        const apples = items.filter((o) => o.c > 0.75);
        inst(GEO.sphere, mat('#ff4d6a', { rough: 0.15 }), apples, (o) => { P.set(o.x + 9, 26, o.z + 12); ident(); S.setScalar(3.2); }, false);
      } else if (style === 'rock') {
        const rot = (o) => Q.setFromEuler(new THREE.Euler(o.c * 0.4, o.a * 6, o.b * 0.3));
        const sc = (o, add) => S.set(19 + o.b * 4 + add, 12 + o.a * 8 + add, 19 + o.c * 4 + add);
        inst(GEO.dodeca, outlineMat, items, (o) => { P.set(o.x, 8, o.z); rot(o); sc(o, 2.4); }, false);
        inst(GEO.dodeca, mat(th.obstacleFill, { flat: true, rough: 0.55 }), items, (o) => { P.set(o.x, 8, o.z); rot(o); sc(o, 0); });
      } else {
        const darkMat = new THREE.MeshBasicMaterial({ color: th.obstacleDark, side: THREE.BackSide });
        inst(GEO.sphere, darkMat, items, (o) => { P.set(o.x, 14, o.z); ident(); S.set(22, 15, 22); }, false);
        inst(GEO.sphere, mat('#ffffff', { rough: 0.35 }), items, (o) => { P.set(o.x, 14, o.z); ident(); S.set(20, 13, 20); });
        inst(GEO.sphere, mat('#ffffff', { rough: 0.35 }), items.filter((o) => o.a > 0.4), (o) => { P.set(o.x - 4 + o.b * 8, 26, o.z - 4); ident(); S.setScalar(10 + o.c * 4); });
      }
    }
  }

  // ---------- views (3D objects mirroring game entities) ----------
  grumpOf(team) {
    const T = this.game.teams[team];
    return T.gloom || T.faction === 'graa';
  }

  makeView(e) {
    let v;
    if (e.kind === 'unit') {
      const { obj, parts } = buildUnit(e.type, this.game.teams[e.team].color, this.grumpOf(e.team));
      if (parts.weapon) parts.weaponX = parts.weapon.position.x;
      v = { obj, parts, heading: e.facing < 0 ? Math.PI : 0, lx: e.x, ly: e.y };
    } else if (e.kind === 'building') {
      const { obj, parts } = buildBuilding(e.type, this.game.teams[e.team].color, this.grumpOf(e.team));
      const box = new THREE.Box3().setFromObject(obj);
      v = { obj, parts, height: box.max.y };
      if (parts.pulse) parts.pulseY = parts.pulse.scale.y;
      const S = e.size * TILE;
      const sc = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S * 0.86, v.height, S * 0.86)),
        new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
      sc.position.y = v.height / 2;
      sc.visible = false;
      this.world.add(sc);
      v.scaffold = sc;
    } else {
      v = { obj: buildCrystal(e.variant) };
      v.obj.rotation.y = e.id * 1.7;
    }
    this.world.add(v.obj);
    this.views.set(e.id, v);
    return v;
  }

  dropView(id, v) {
    this.world.remove(v.obj);
    if (v.scaffold) { this.world.remove(v.scaffold); v.scaffold.geometry.dispose(); }
    this.views.delete(id);
  }

  updateUnit(v, u, dt, dying) {
    const o = v.obj, P = v.parts, g = this.game, t = u.anim;
    const lift = u.air ? AIR_H + Math.sin(u.anim * 2 + u.id) * 2 : 0;
    o.position.set(u.x, lift, u.y);
    // Face where we walk, or the enemy we are shooting at.
    let want = null;
    const dx = u.x - v.lx, dy = u.y - v.ly;
    const tgt = u.target;
    if (tgt && !tgt.dead && (u.attackAnim > 0 || (u.state === 'attack' && dx * dx + dy * dy < 0.05))) want = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    else if (dx * dx + dy * dy > 0.04) want = Math.atan2(dy, dx);
    else if (u.state === 'gather' && u.res) want = Math.atan2(u.res.y - u.y, u.res.x - u.x);
    v.lx = u.x; v.ly = u.y;
    if (want != null) v.heading = lerpAngle(v.heading, want, Math.min(1, dt * 10));
    o.rotation.set(0, -v.heading, 0);

    let s = 1;
    const age = g.time - u.born;
    if (age >= 0 && age < 0.25) s = 0.4 + (age / 0.25) * 0.6;
    if (u.hitFlash > 0) s *= 1 + u.hitFlash * 1.3;
    if (dying) {
      const k = dying.t / 0.7;
      o.rotation.z = -Math.min(1, dying.t / 0.25) * 1.45;
      if (u.air) o.position.y = lift * (1 - k);
      s = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
    }
    o.scale.setScalar(Math.max(0.01, s) * UNIT_SCALE);

    if (P.body) {
      if (P.float) P.body.position.y = Math.sin(t * 3 + u.id) * 1.8;
      else if (P.hop) P.body.position.y = u.moving ? Math.abs(Math.sin(t * 12)) * 5 : 0;
      else P.body.position.y = u.moving ? Math.abs(Math.sin(t * 14)) * 1.3 : 0;
    }
    if (P.legs) P.legs.forEach((l, i) => { l.rotation.z = u.moving ? Math.sin(t * 14 + i * Math.PI) * 0.6 : 0; });
    if (P.weapon) {
      if (P.sword) P.weapon.rotation.z = u.attackAnim > 0 ? -1.4 : 0.35;
      else P.weapon.position.x = P.weaponX - (u.attackAnim > 0 ? 2.5 : 0);
    }
    if (P.wings) for (const w of P.wings) w.rotation.x = -w.userData.side * (0.15 + Math.sin(t * 32) * 0.45);
    if (P.carry) P.carry.visible = u.carry > 0;
    if (P.rain) { P.rain.visible = u.attackAnim > 0; P.rain.position.y = -10 - ((t * 60) % 8); }
  }

  updateBuilding(v, b, dt, now, dying) {
    const o = v.obj, P = v.parts, t = now + b.id;
    o.position.set(b.x, 0, b.y);
    let sx = 1, sy = b.built < 1 ? 0.12 + 0.88 * b.built : 1;
    if (b.hitFlash > 0) sx = 1 + b.hitFlash * 0.5;
    if (dying) {
      const k = dying.t / 0.8;
      sx = 1 + k * 0.35; sy = Math.max(0.02, 1 - k);
      o.rotation.z = Math.sin(k * 25) * 0.05 * (1 - k);
    }
    o.scale.set(sx, sy, sx);
    if (v.scaffold) { v.scaffold.visible = b.built < 1 && !dying; v.scaffold.position.set(b.x, v.height / 2, b.y); }
    if (P.spin) P.spin.rotation.y = t * 1.2;
    if (P.gear) P.gear.rotation.z = t * 1.5;
    if (P.flag) P.flag.rotation.y = Math.sin(t * 5) * 0.35;
    if (P.eggs) P.eggs.forEach((e, i) => { e.rotation.z = Math.sin(t * 3 + i * 2) * 0.13; });
    if (P.wings) for (const w of P.wings) w.rotation.z = w.userData.side * Math.sin(t * 3) * 0.3;
    if (P.smoke) P.smoke.forEach((s, i) => {
      const p = (t * 0.5 + i / 3) % 1;
      s.position.set(28 + p * 12, 82 + p * 34, -14);
      s.scale.setScalar(4 + p * 9);
      s.material.opacity = (1 - p) * 0.9;
    });
    if (P.pulse) P.pulse.scale.y = P.pulseY * (1 + Math.sin(t * 3) * 0.05);
    if (P.swirl) P.swirl.rotation.z = t * 2.2;
    if (P.orbit) P.orbit.rotation.y = t * 0.8;
    if (P.orb) P.orb.scale.setScalar(9.5 * (1 + Math.sin(t * 4) * 0.08));
    if (P.turret) P.turret.rotation.y = -(b.aim || 0);
  }

  sync(dt) {
    const g = this.game, seen = this.seen, now = performance.now() / 1000;
    seen.clear();
    for (const u of g.units) {
      const v = this.views.get(u.id) || this.makeView(u);
      seen.add(u.id);
      this.updateUnit(v, u, dt, null);
    }
    for (const b of g.buildings) {
      const v = this.views.get(b.id) || this.makeView(b);
      seen.add(b.id);
      this.updateBuilding(v, b, dt, now, null);
    }
    for (const d of g.dying) {
      const v = this.views.get(d.e.id);
      if (!v) continue;
      seen.add(d.e.id);
      if (d.e.kind === 'unit') this.updateUnit(v, d.e, dt, d);
      else this.updateBuilding(v, d.e, dt, now, d);
    }
    for (const r of g.resources) {
      const v = this.views.get(r.id) || this.makeView(r);
      seen.add(r.id);
      v.obj.position.set(r.x, 0, r.y);
      v.obj.scale.setScalar(0.55 + 0.45 * (r.amount / r.max));
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.dropView(id, v);
  }

  // ---------- helpers for rings and discs ----------
  pooled(pool, geo, i) {
    let m = pool[i];
    if (!m) { m = new THREE.Mesh(geo, this.ringMats.own); m.renderOrder = 2; this.fx.add(m); pool[i] = m; }
    m.visible = true;
    return m;
  }
  relation(team) {
    const g = this.game;
    if (team === g.player) return 'own';
    return g.player >= 0 && g.isEnemy(g.player, team) ? 'enemy' : 'ally';
  }

  updateMarkers(st) {
    const g = this.game;
    let ri = 0, di = 0, ti = 0;
    const ring = (e, hover) => {
      const m = this.pooled(this.rings, ringGeo, ri++);
      m.material = this.ringMats[this.relation(e.team) + (hover ? 'H' : '')];
      const r = e.kind === 'building' ? e.size * TILE * 0.62 : e.radius + 5;
      m.position.set(e.x, 1.2, e.y);
      m.scale.setScalar(r);
    };
    for (const e of g.selection) if (!e.dead && e.kind !== 'resource') ring(e, false);
    if (st.hover && !st.hover.dead && st.hover.kind !== 'resource' && !g.selection.includes(st.hover)) ring(st.hover, true);
    for (const e of g.selection) {
      if (e.kind === 'building' && e.def.dmg && !e.dead) {
        const m = this.pooled(this.thinRings, thinRingGeo, ti++);
        m.material = this.ringMats.range;
        m.position.set(e.x, 1.3, e.y);
        m.scale.setScalar(e.def.range);
      }
    }
    // Building placement
    if (st.ghost) {
      for (const b of g.buildings) {
        if (b.team !== g.player) continue;
        const m = this.pooled(this.discs, flatCircle, di++);
        m.material = this.ringMats.disc;
        m.position.set(b.x, 1.0 + di * 0.01, b.y);
        m.scale.setScalar(BUILD_RADIUS);
      }
      const gh = st.ghost, s = BUILDINGS[gh.type].size * TILE;
      const cx = gh.tx * TILE + s / 2, cz = gh.ty * TILE + s / 2;
      this.footprint.visible = true;
      this.footprint.material = gh.ok ? this.ringMats.ok : this.ringMats.bad;
      this.footprint.position.set(cx, 2, cz);
      this.footprint.scale.set(s, 1, s);
      if (this.ghostType !== gh.type) {
        if (this.ghost) this.fx.remove(this.ghost);
        this.ghost = this.makeGhost(gh.type);
        this.ghostType = gh.type;
        this.fx.add(this.ghost);
      }
      this.ghost.visible = true;
      this.ghost.position.set(cx, 0, cz);
    } else {
      this.footprint.visible = false;
      if (this.ghost) this.ghost.visible = false;
    }
    for (let i = ri; i < this.rings.length; i++) this.rings[i].visible = false;
    for (let i = di; i < this.discs.length; i++) this.discs[i].visible = false;
    for (let i = ti; i < this.thinRings.length; i++) this.thinRings[i].visible = false;
  }

  makeGhost(type) {
    const { obj } = buildBuilding(type, this.game.teams[this.game.player].color, false);
    obj.traverse((m) => {
      if (!m.isMesh) return;
      let gm = this.ghostMats.get(m.material.uuid);
      if (!gm) {
        gm = m.material.clone();
        gm.transparent = true;
        gm.opacity = m.material === outlineMat ? 0.3 : 0.55;
        gm.depthWrite = false;
        this.ghostMats.set(m.material.uuid, gm);
      }
      m.material = gm;
      m.castShadow = false;
    });
    return obj;
  }

  updateInstanced() {
    const g = this.game, M = this.tmpM, Q = this.tmpQ.identity(), S = this.tmpS, P = this.tmpP, C = this.tmpC;
    let n = 0;
    for (const p of g.projectiles) {
      if (n >= this.projMesh.instanceMatrix.count) break;
      P.set(p.x, p.z, p.y); S.setScalar(p.size * 1.15);
      M.compose(P, Q, S);
      this.projMesh.setMatrixAt(n, M);
      this.projMesh.setColorAt(n, C.set(p.color));
      n++;
    }
    this.projMesh.count = n;
    this.projMesh.instanceMatrix.needsUpdate = true;
    if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;
    n = 0;
    for (const e of g.effects) {
      if (e.type !== 'particle') continue;
      if (n >= this.partMesh.instanceMatrix.count) break;
      const k = e.t / e.life;
      P.set(e.x, e.z + 1, e.y); S.setScalar(e.size * (1 - k * 0.6));
      M.compose(P, Q, S);
      this.partMesh.setMatrixAt(n, M);
      this.partMesh.setColorAt(n, C.set(e.color));
      n++;
    }
    this.partMesh.count = n;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;
  }

  // ---------- frame ----------
  draw(cam, st) {
    this.cam = cam;
    const g = this.game, z = cam.zoom, W = cam.w, H = cam.h;
    const now = performance.now();
    const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0.016;
    this.lastDraw = now;
    g.view = { x: cam.x, y: cam.y, w: W / z, h: (H * this.K) / z };

    const cx = cam.x + W / (2 * z), cz = cam.y + (H / 2) * this.K / z;
    const c = this.camera;
    c.left = -W / (2 * z); c.right = W / (2 * z); c.top = H / (2 * z); c.bottom = -H / (2 * z);
    c.updateProjectionMatrix();
    c.position.set(cx, SIN * 3000, cz + COS * 3000);
    c.lookAt(cx, 0, cz);

    const half = Math.ceil((Math.max(W / z, (H * this.K) / z) * 0.62 + 80) / 50) * 50;
    if (half !== this.lastShadowHalf) {
      const sc = this.sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
      this.lastShadowHalf = half;
    }
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 450, 950, cz - 320);

    if (g.paint.dirty && now - this.paintT > 80) {
      this.paintTex.needsUpdate = true;
      g.paint.dirty = false;
      this.paintT = now;
    }

    this.sync(dt);
    this.updateMarkers(st || {});
    this.updateInstanced();
    this.gl.render(this.scene, c);
    this.drawOverlay(st || {});
  }

  // ---------- 2D overlay: health bars, popup text, beams, markers ----------
  drawOverlay(st) {
    const g = this.game, ctx = this.octx, dpr = this.dpr, z = this.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.cam.w, H = this.cam.h;
    const vis = (p, m = 40) => p.x > -m && p.y > -m && p.x < W + m && p.y < H + m;
    const selected = new Set(g.selection);

    for (const e of g.effects) {
      const k = e.t / e.life;
      if (e.type === 'ring' || e.type === 'ping') {
        const p = this.project(e.x, e.y, 0);
        if (!vis(p, 80)) continue;
        const r = e.type === 'ring' ? (6 + k * 16) * z : (20 + ((e.t * 60) % 40)) * z;
        ctx.globalAlpha = e.type === 'ring' ? 1 - k : 0.8 * (1 - k);
        ctx.strokeStyle = e.type === 'ring' ? e.color : '#ff3d3d';
        ctx.lineWidth = e.type === 'ring' ? 3 : 4;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * SIN, 0, 0, TAU); ctx.stroke();
      } else if (e.type === 'beam') {
        const a = this.project(e.x, e.y, e.z), b = this.project(e.x2, e.y2, e.z2);
        ctx.globalAlpha = 1 - k;
        ctx.lineCap = 'round';
        ctx.strokeStyle = e.color; ctx.lineWidth = 7 * z;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 * z;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (const b of g.buildings) {
      const v = this.views.get(b.id);
      const p = this.project(b.x, b.y, (v ? v.height * (b.built < 1 ? 0.12 + 0.88 * b.built : 1) : 60) + 12);
      if (vis(p, 100)) this.bar(b, p, selected.has(b), b.size * TILE * 0.7 * z);
      if (b.queue.length && b.team === g.player) {
        const q = this.project(b.x, b.y + b.size * TILE * 0.5, 0);
        const k = b.prog / UNITS[b.queue[0]].time, w = b.size * TILE * 0.6 * z;
        Art.rrect(ctx, q.x - w / 2, q.y - 4, w, 8, 4, '#ffffff', OUTLINE, 1.6);
        Art.rrect(ctx, q.x - w / 2 + 1.5, q.y - 2.5, Math.max(0, (w - 3) * k), 5, 2.5, g.teams[b.team].color.main, null);
      }
    }
    for (const u of g.units) {
      const p = this.project(u.x, u.y, (u.air ? AIR_H + u.radius * 1.5 : u.radius * 3.1) + 8);
      if (vis(p)) this.bar(u, p, selected.has(u), Math.max(22, u.radius * 2.2) * z);
    }

    // Rally point of the selected building
    for (const e of g.selection) {
      if (e.kind !== 'building' || !e.rally || e.team !== g.player) continue;
      const a = this.project(e.x, e.y, 0), b = this.project(e.rally.x, e.rally.y, 0);
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      Art.line(ctx, b.x, b.y, b.x, b.y - 24, OUTLINE, 2.5);
      Art.poly(ctx, [b.x, b.y - 24, b.x + 15, b.y - 19, b.x, b.y - 14], g.teams[e.team].color.main, OUTLINE, 1.5);
    }

    for (const e of g.effects) {
      if (e.type !== 'text') continue;
      const p = this.project(e.x, e.y, e.z);
      if (!vis(p)) continue;
      const k = e.t / e.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `700 ${(e.big ? 28 : 16) * Math.max(0.8, z)}px Fredoka, "Baloo 2", "Comic Sans MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = e.big ? 6 : 4; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round';
      ctx.strokeText(e.text, p.x, p.y);
      ctx.fillStyle = e.color; ctx.fillText(e.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (st.box) {
      const { x0, y0, x1, y1 } = st.box;
      ctx.fillStyle = 'rgba(120,255,160,0.15)';
      ctx.strokeStyle = '#7dffa8'; ctx.lineWidth = 2;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  bar(e, p, sel, w) {
    const damaged = e.hp < e.maxHp - 0.5 || (e.maxShield && e.shield < e.maxShield - 0.5);
    if (!sel && !damaged) return;
    const ctx = this.octx;
    const x = p.x - w / 2, y = p.y;
    const k = clamp(e.hp / e.maxHp, 0, 1);
    Art.rrect(ctx, x, y, w, 7, 3.5, '#ffffff', OUTLINE, 1.5);
    const col = k > 0.6 ? '#4fd11a' : k > 0.3 ? '#ffcf0a' : '#ff4d4d';
    if (k > 0) Art.rrect(ctx, x + 1.3, y + 1.3, (w - 2.6) * k, 4.4, 2.2, col, null);
    if (e.maxShield) {
      const ks = clamp(e.shield / e.maxShield, 0, 1);
      Art.rrect(ctx, x, y - 7, w, 6, 3, '#ffffff', OUTLINE, 1.3);
      if (ks > 0) Art.rrect(ctx, x + 1.2, y - 5.8, (w - 2.4) * ks, 3.6, 1.8, '#3fb8ff', null);
    }
  }

  drawMinimap(cam) {
    if (!this.game) return;
    this.helper2D.game = this.game;
    this.helper2D.drawMinimap({ x: cam.x, y: cam.y, zoom: cam.zoom, w: cam.w, h: cam.h * this.K });
  }
}

// ---------- 3D icons for buttons and menus ----------
class IconMaker {
  constructor() {
    this.size = 192;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size;
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.gl.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    setupLook(this.gl, this.scene);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a98', 0.95));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.9);
    sun.position.set(-1, 2, 1.2);
    this.scene.add(sun);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    this.cache = new Map();
    this.dir = new THREE.Vector3(Math.sin(0.65) * Math.cos(0.5), Math.sin(0.5), Math.cos(0.65) * Math.cos(0.5)).normalize();
  }
  icon(kind, type, colorKey) {
    const key = kind + type + colorKey;
    if (this.cache.has(key)) return this.cache.get(key);
    const col = COLORS[colorKey] || COLORS.orange, grump = colorKey === 'grey';
    const { obj } = kind === 'unit' ? buildUnit(type, col, grump) : buildBuilding(type, col, grump);
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.6;
    const c = this.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.updateProjectionMatrix();
    c.position.copy(center).addScaledVector(this.dir, 1000);
    c.lookAt(center);
    this.gl.render(this.scene, c);
    const url = this.canvas.toDataURL();
    this.scene.remove(obj);
    this.cache.set(key, url);
    return url;
  }
}

if (webglSupported()) {
  window.Renderer3D = Renderer3D;
  try {
    const icons = new IconMaker();
    const flat = Art.icon;
    Art.icon = (kind, type, colorKey, size) => {
      if (kind !== 'unit' && kind !== 'building') return flat(kind, type, colorKey, size);
      try { return icons.icon(kind, type, colorKey); } catch (e) { return flat(kind, type, colorKey, size); }
    };
  } catch (e) { /* keep the 2D icons */ }
}
