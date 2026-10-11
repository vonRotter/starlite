// Glossy, toy-like 3D models for Starlite, built from three.js primitives.
// Each model gets dark "inverted hull" outlines and big googly eyes so it
// keeps the cartoon look of the original 2D art.
//
// Coordinates: x = game x, z = game y (south, towards the camera), y = up.
// Units face +x; their pivot is on the ground (air units: at flying height).
// Buildings face +z (towards the camera); their pivot is the footprint centre.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/addons/RoundedBoxGeometry.js';

const OUT = 0x2a2440;
const PI = Math.PI;

// ---------- shared geometry ----------
export const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 16),
  hemi: new THREE.SphereGeometry(1, 24, 10, 0, PI * 2, 0, PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  halfCyl: new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, 0, PI),
  cone: new THREE.ConeGeometry(1, 1, 24),
  box: new RoundedBoxGeometry(1, 1, 1, 3, 0.16),
  octa: new THREE.OctahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.25, 12, 36),
  thinTorus: new THREE.TorusGeometry(1, 0.12, 10, 36),
  arc: new THREE.TorusGeometry(1, 0.2, 8, 18, PI),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 14),
  hex: new THREE.CylinderGeometry(1, 1, 1, 6),
  disc: new THREE.CylinderGeometry(1, 1, 1, 32),
};
for (const g of Object.values(GEO)) g.computeBoundingSphere();

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); g.computeBoundingSphere(); geoCache.set(key, g); }
  return g;
}
// Tapered cylinder with real radii (height 1, scale y for height).
function cylT(top, bottom, seg = 20) {
  return cached(`cyl${top}_${bottom}_${seg}`, () => new THREE.CylinderGeometry(top, bottom, 1, seg));
}
// Triangular prism roof: ridge along x (length), cross-section w wide and h high.
function prism(w, h, length) {
  return cached(`prism${w}_${h}_${length}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    g.rotateY(PI / 2);
    return g;
  });
}
// Extruded star (also used for gears). Lies in the x-y plane, faces +z.
export function starGeo(points = 5, inner = 0.45, r = 10, depth = 4) {
  return cached(`star${points}_${inner}_${r}_${depth}`, () => {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = -PI / 2 + (i * PI) / points, rr = i % 2 ? r * inner : r;
      const x = Math.cos(a) * rr, y = -Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 1, bevelSize: 0.8, bevelSegments: 2 });
    g.center();
    return g;
  });
}

// ---------- materials ----------
const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + '|' + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.rough != null ? o.rough : 0.32, metalness: 0,
      emissive: o.glow ? color : 0x000000, emissiveIntensity: o.glow || 0,
      flatShading: !!o.flat, transparent: o.opacity != null, opacity: o.opacity != null ? o.opacity : 1,
      depthWrite: o.opacity == null || o.opacity > 0.7,
    });
    matCache.set(key, m);
  }
  return m;
}
export const outlineMat = new THREE.MeshBasicMaterial({ color: OUT, side: THREE.BackSide });

// Adds an inverted-hull outline of world thickness w to mesh m.
function outline(m, w) {
  const r = m.geometry.boundingSphere.radius || 1;
  const s = m.scale;
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.set(1 + w / (r * Math.abs(s.x)), 1 + w / (r * Math.abs(s.y)), 1 + w / (r * Math.abs(s.z)));
  o.castShadow = false;
  o.userData.isOutline = true;
  m.add(o);
}

// p: {x,y,z, s (uniform) | sc:[x,y,z], rx,ry,rz, ow (outline width, 0 = none), shadow}
function part(parent, geo, material, p = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(p.x || 0, p.y || 0, p.z || 0);
  if (p.sc) m.scale.set(p.sc[0], p.sc[1], p.sc[2]);
  else if (p.s != null) m.scale.setScalar(p.s);
  m.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
  m.castShadow = p.shadow !== false;
  m.receiveShadow = true;
  const ow = p.ow != null ? p.ow : parent.userData.ow || 1.6;
  if (ow > 0) outline(m, ow);
  parent.add(m);
  return m;
}

function group(parent, p = {}) {
  const g = new THREE.Group();
  g.position.set(p.x || 0, p.y || 0, p.z || 0);
  g.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
  g.userData.ow = parent ? parent.userData.ow : 1.6;
  if (parent) parent.add(g);
  return g;
}

// Googly eye. fwd = 'x' (units) or 'z' (buildings).
function eye(parent, x, y, z, r, grump, fwd = 'x') {
  part(parent, GEO.sphere, mat('#ffffff', { rough: 0.15 }), { x, y, z, s: r, ow: Math.min(1.4, r * 0.35) });
  const off = r * 0.62;
  const px = fwd === 'x' ? x + off : x, pz = fwd === 'z' ? z + off : z;
  part(parent, GEO.sphere, mat('#1d1830', { rough: 0.1 }), { x: px, y: y - r * 0.05, z: pz, s: r * 0.52, ow: 0, shadow: false });
  const hx = fwd === 'x' ? x + r * 0.95 : x + r * 0.2, hz = fwd === 'z' ? z + r * 0.95 : z - r * 0.2;
  part(parent, GEO.sphere, mat('#ffffff', { rough: 0.1 }), { x: hx, y: y + r * 0.22, z: hz, s: r * 0.17, ow: 0, shadow: false });
  if (grump) {
    // Angry eyebrow: the inner end points down.
    if (fwd === 'x') part(parent, GEO.box, mat('#2a2440'), { x: x + r * 0.4, y: y + r * 1.15, z, sc: [r * 0.5, r * 0.38, r * 1.7], rx: -Math.sign(z || 1) * 0.55, ow: 0, shadow: false });
    else part(parent, GEO.box, mat('#2a2440'), { x, y: y + r * 1.15, z: z + r * 0.4, sc: [r * 1.7, r * 0.38, r * 0.5], rz: Math.sign(x || 1) * 0.55, ow: 0, shadow: false });
  }
}
function eyes(parent, x, y, spread, r, grump, fwd = 'x') {
  if (fwd === 'x') { eye(parent, x, y, -spread, r, grump); eye(parent, x, y, spread, r, grump); }
  else { eye(parent, -spread, y, x, r, grump, 'z'); eye(parent, spread, y, x, r, grump, 'z'); }
}

function crystalGem(parent, x, y, z, h, w, color, light, glow = 0.25) {
  return part(parent, GEO.octa, mat(color, { rough: 0.08, glow, flat: true }), { x, y: y + h / 2, z, sc: [w, h / 2, w * 0.85], ry: 0.4 });
}
function carryCrystal(parent, x, y) {
  const g = group(parent, { x, y });
  crystalGem(g, 0, 0, 0, 10, 3.6, '#5ee6ff');
  g.visible = false;
  return g;
}

const DARK = '#4a4466';
const YELLOW = '#ffd23f';

// ---------- units ----------
// Each builder returns parts used by the animation code in render3d.js:
// body (bobbing group), legs[], weapon, wings[], carry, rain, float (bool), hop (bool)
const U = {};

U.byggebot = (root, c, grump) => {
  const b = group(root), P = { body: b };
  for (const z of [-8, 8]) part(b, GEO.cyl, mat(DARK), { y: 4.5, z, sc: [4.5, 3, 4.5], rx: PI / 2 });
  part(b, GEO.box, mat(c.main), { y: 12, sc: [18, 13, 15] });
  part(b, GEO.box, mat(c.light), { x: 9, y: 9, sc: [1.6, 4, 9], ow: 0 });
  part(b, GEO.hemi, mat(YELLOW), { y: 18, sc: [8, 7, 8] });
  part(b, GEO.disc, mat(YELLOW), { y: 18.4, sc: [10, 1.4, 10] });
  eye(b, 8.6, 13, 0, 4.2, grump);
  P.carry = carryCrystal(b, -10, 16);
  return P;
};

U.malersoldat = (root, c, grump) => {
  const b = group(root), P = { body: b, legs: [] };
  for (const z of [-3.4, 3.4]) P.legs.push(part(b, GEO.capsule, mat(DARK), { y: 3.5, z, sc: [3.2, 3, 3.2] }));
  part(b, GEO.capsule, mat(c.main), { y: 11, sc: [11, 5, 10] });
  part(b, GEO.sphere, mat('#ffffff'), { y: 21, s: 7.5 });
  part(b, GEO.sphere, mat(c.light), { x: 3.6, y: 20.5, sc: [4.4, 5, 6.2], ow: 0 });
  eyes(b, 6.6, 21.2, 2.5, 2.3, grump);
  part(b, GEO.sphere, mat(c.main), { x: -3, y: 29.5, s: 2.2 });
  const w = group(b, { x: 4, y: 11, z: 5 });
  part(w, GEO.box, mat('#5a5a78'), { x: 6, sc: [14, 4, 4] });
  part(w, GEO.sphere, mat(c.light), { x: -1, y: 2.5, s: 4 });
  part(w, GEO.box, mat(c.main), { x: 13.5, sc: [3, 5.5, 5.5] });
  P.weapon = w;
  return P;
};

U.rullebil = (root, c, grump) => {
  const b = group(root), P = { body: b };
  for (const x of [-8, 8]) for (const z of [-9.5, 9.5]) part(b, GEO.cyl, mat(DARK), { x, y: 5.5, z, sc: [5.5, 3.2, 5.5], rx: PI / 2 });
  part(b, GEO.box, mat(c.main), { y: 12, sc: [28, 11, 18] });
  part(b, GEO.box, mat(c.light), { x: -3, y: 21, sc: [13, 9, 14] });
  eyes(b, 3.8, 22, 3.6, 2.5, grump);
  part(b, GEO.box, mat(DARK), { x: 15, y: 9, sc: [6, 2.2, 20], ow: 0 });
  P.roller = part(b, GEO.cyl, mat(c.main, { rough: 0.15 }), { x: 19, y: 7, sc: [6.5, 25, 6.5], rx: PI / 2 });
  part(b, GEO.thinTorus, mat(c.light), { x: 19, y: 7, z: 6, s: 6.7, ow: 0 });
  part(b, GEO.thinTorus, mat(c.light), { x: 19, y: 7, z: -6, s: 6.7, ow: 0 });
  const w = group(b, { x: -9, y: 19 });
  part(w, GEO.sphere, mat(c.light), { s: 4.6 });
  part(w, GEO.cyl, mat('#5a5a78'), { x: 3, y: 5, sc: [2.8, 12, 2.8], rz: -0.7 });
  P.weapon = w;
  return P;
};

U.ballongflyer = (root, c, grump) => {
  const b = group(root), P = { body: b, float: true };
  part(b, GEO.sphere, mat(c.main), { y: 8, sc: [14, 16, 14] });
  part(b, GEO.torus, mat('#ffffff'), { y: 8, sc: [14.2, 16.2, 10], ow: 0 });
  part(b, GEO.torus, mat('#ffffff'), { y: 8, sc: [14.2, 16.2, 10], ry: PI / 2, ow: 0 });
  eyes(b, 12.4, 10, 4.6, 3.2, grump);
  for (const x of [-5, 5]) part(b, GEO.cyl, mat(DARK), { x, y: -11, sc: [0.6, 10, 0.6], ow: 0 });
  part(b, GEO.box, mat('#c98b4a'), { y: -18, sc: [12, 7, 12] });
  part(b, GEO.sphere, mat('#ffffff'), { y: -12.5, s: 3.6 });
  return P;
};

U.sankelarve = (root, c, grump) => {
  const b = group(root), P = { body: b };
  part(b, GEO.sphere, mat(c.light), { x: -9, y: 5, s: 5 });
  part(b, GEO.sphere, mat(c.main), { x: -2.5, y: 6.5, s: 6.5 });
  part(b, GEO.sphere, mat(c.light), { x: 5, y: 8, s: 7.5 });
  for (const z of [-3, 3]) {
    part(b, GEO.cyl, mat(DARK), { x: 6, y: 17, z: z * 1.2, sc: [0.7, 8, 0.7], rx: z * 0.1, ow: 0 });
    part(b, GEO.sphere, mat(c.main), { x: 6, y: 21, z: z * 1.6, s: 1.9, ow: 0.8 });
  }
  eyes(b, 10.8, 9.5, 3, 2.6, grump);
  P.carry = carryCrystal(b, -9, 12);
  return P;
};

U.sprettbille = (root, c, grump) => {
  const b = group(root), P = { body: b, hop: true };
  for (const x of [-4, 0, 4]) for (const z of [-1, 1]) part(b, GEO.cyl, mat(DARK), { x, y: 3, z: z * 6, sc: [0.8, 6, 0.8], rx: z * 0.6, ow: 0 });
  part(b, GEO.sphere, mat(c.main), { y: 8, sc: [10, 7, 8.5] });
  part(b, GEO.box, mat('#2a2440'), { y: 14.6, sc: [17, 0.8, 1], ow: 0 });
  for (const [x, y, z] of [[-3, 13.4, 3.5], [2, 13.2, -3.5], [-6, 11, -4]]) part(b, GEO.sphere, mat(c.light), { x, y, z, s: 1.9, ow: 0 });
  part(b, GEO.sphere, mat(DARK), { x: 9, y: 7, s: 5 });
  eyes(b, 12, 9, 2.4, 2.3, grump);
  return P;
};

U.spyttsnegl = (root, c, grump) => {
  const b = group(root), P = { body: b };
  part(b, GEO.capsule, mat(c.light), { x: 2, y: 4.5, sc: [9, 12, 9], rz: PI / 2 });
  part(b, GEO.sphere, mat(c.main), { x: -4, y: 14, sc: [10, 10, 8] });
  for (const z of [-6.8, 6.8]) part(b, GEO.torus, mat(c.dark), { x: -4, y: 14, z, s: 4.5, ow: 0 });
  for (const z of [-2.8, 2.8]) {
    part(b, GEO.cyl, mat(DARK), { x: 12, y: 13, z, sc: [0.9, 11, 0.9], rz: -0.2, ow: 0 });
    eye(b, 13.5, 19.5, z * 1.1, 3, grump);
  }
  return P;
};

U.vingesumm = (root, c, grump) => {
  const b = group(root), P = { body: b, float: true, wings: [] };
  part(b, GEO.sphere, mat(c.main), { sc: [12, 8, 8] });
  for (const x of [-4, 2]) part(b, GEO.torus, mat(c.dark), { x, s: 7.6, ry: PI / 2, ow: 0 });
  part(b, GEO.cone, mat(DARK), { x: -13.5, sc: [2.5, 6, 2.5], rz: PI / 2 });
  part(b, GEO.sphere, mat(c.light), { x: 12, y: 2, s: 6 });
  eyes(b, 16, 4, 2.6, 2.4, grump);
  for (const z of [-1, 1]) {
    const w = group(b, { x: -1, y: 6, z: z * 3 });
    part(w, GEO.sphere, mat('#ffffff', { opacity: 0.7, rough: 0.1 }), { z: z * 8, sc: [7, 1.2, 10], ow: 0.8 });
    w.userData.side = z;
    P.wings.push(w);
  }
  return P;
};

U.svevesonde = (root, c, grump) => {
  const b = group(root), P = { body: b, float: true };
  part(b, GEO.torus, mat(c.light, { glow: 0.6 }), { y: 1.5, s: 7, rx: PI / 2, ow: 0, shadow: false });
  part(b, GEO.octa, mat(c.light, { flat: true, rough: 0.12 }), { y: 14, sc: [10, 12, 10] });
  part(b, GEO.octa, mat(c.main, { flat: true, glow: 0.3 }), { y: 14, sc: [7.2, 9, 7.2], ry: PI / 4, ow: 0 });
  eye(b, 6.5, 14, 0, 3.6, grump);
  P.carry = carryCrystal(b, -10, 16);
  return P;
};

U.lysvokter = (root, c, grump) => {
  const b = group(root), P = { body: b, legs: [] };
  for (const z of [-3.4, 3.4]) P.legs.push(part(b, GEO.capsule, mat(DARK), { y: 3.5, z, sc: [3.4, 3, 3.4] }));
  part(b, cylT(8.5, 6, 8), mat(c.main), { y: 12, sc: [1, 11, 1] });
  part(b, GEO.torus, mat('#ffd23f', { rough: 0.15 }), { y: 16, s: 8.2, rx: PI / 2, ow: 0 });
  part(b, GEO.octa, mat(c.light, { flat: true }), { y: 25, sc: [6, 8, 6] });
  eyes(b, 4.3, 25, 2.2, 2.1, grump);
  const w = group(b, { x: 6, y: 12, z: 8 });
  part(w, GEO.box, mat('#5a5a78'), { sc: [3, 3.5, 3] });
  part(w, GEO.box, mat(c.light, { glow: 0.9 }), { y: 11, sc: [2.2, 19, 1.2], ow: 0.8 });
  P.weapon = w; P.sword = true;
  return P;
};

U.glimtskytter = (root, c, grump) => {
  const b = group(root), P = { body: b };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 3;
    part(b, GEO.cyl, mat(DARK), { x: Math.cos(a) * 5, y: 8, z: Math.sin(a) * 5, sc: [1.4, 17, 1.4], rz: -Math.cos(a) * 0.45, rx: Math.sin(a) * 0.45, ow: 0 });
    part(b, GEO.sphere, mat(c.main), { x: Math.cos(a) * 9, y: 1.8, z: Math.sin(a) * 9, s: 2.4, ow: 0.8 });
  }
  part(b, GEO.octa, mat(c.light, { flat: true }), { y: 18, sc: [13, 8, 13] });
  part(b, GEO.sphere, mat(c.main, { glow: 0.2 }), { x: 8.5, y: 18.5, s: 5 });
  eye(b, 11, 19, 0, 3.3, grump);
  const w = group(b, { x: 6, y: 24 });
  part(w, GEO.box, mat('#5a5a78'), { x: 5, sc: [12, 4, 4] });
  P.weapon = w;
  return P;
};

U.stjerneseiler = (root, c, grump) => {
  const b = group(root), P = { body: b, float: true };
  part(b, GEO.octa, mat(c.light, { flat: true }), { sc: [22, 6, 10] });
  for (const z of [-1, 1]) {
    part(b, GEO.octa, mat(c.light, { flat: true }), { x: -6, z: z * 11, sc: [10, 2, 8], ry: z * 0.45 });
    part(b, GEO.sphere, mat('#ffe14d', { glow: 0.8 }), { x: -15, z: z * 13, s: 2, ow: 0, shadow: false });
  }
  part(b, GEO.sphere, mat('#ffffff', { glow: 0.25 }), { x: 3, y: 4.5, s: 6.5 });
  eye(b, 7.5, 5.5, 0, 3.4, grump);
  return P;
};

U.stovsuger = (root, c) => {
  const b = group(root), P = { body: b };
  part(b, GEO.cyl, mat(c.dark), { y: 3, sc: [12, 5, 12] });
  part(b, GEO.hemi, mat(c.main), { y: 5.5, sc: [11, 8.5, 11] });
  part(b, GEO.cyl, mat(DARK), { x: 10, y: 8, sc: [1.8, 12, 1.8], rz: -0.9, ow: 0.8 });
  part(b, GEO.box, mat(DARK), { x: 15.5, y: 3, sc: [5, 2.5, 7] });
  eyes(b, 7.5, 10, 3.2, 2.9, true);
  P.carry = carryCrystal(b, -10, 13);
  return P;
};

U.stovdott = (root, c) => {
  const b = group(root), P = { body: b, hop: true };
  for (const z of [-4, 4]) part(b, GEO.sphere, mat(DARK), { x: 2, y: 1.6, z, sc: [3.5, 2, 2.6], ow: 0.8 });
  part(b, GEO.ico, mat(c.main, { flat: true, rough: 0.6 }), { y: 11, s: 10.5 });
  part(b, GEO.ico, mat(c.main, { flat: true, rough: 0.6 }), { y: 11, s: 10, ry: 0.6, rx: 0.5, ow: 0 });
  eyes(b, 8.2, 13, 3.4, 3, true);
  return P;
};

U.graabot = (root, c) => {
  const b = group(root), P = { body: b };
  for (const z of [-7.5, 7.5]) part(b, GEO.box, mat(DARK), { y: 4, z, sc: [22, 7, 5] });
  part(b, GEO.box, mat(c.main), { y: 16, sc: [18, 16, 17] });
  part(b, GEO.cyl, mat(DARK), { y: 27, sc: [0.8, 6, 0.8], ow: 0 });
  part(b, GEO.sphere, mat(c.light, { glow: 0.3 }), { y: 31, s: 2.6 });
  eyes(b, 9.3, 19, 3.8, 3.2, true);
  const w = group(b, { x: 4, y: 14, z: 10 });
  part(w, GEO.box, mat(c.dark), { x: 7, sc: [14, 5, 5] });
  P.weapon = w;
  return P;
};

U.taakesky = (root, c) => {
  const b = group(root), P = { body: b, float: true };
  for (const [x, y, z, r] of [[-9, 0, 0, 8], [0, 4, 0, 10], [9, 1, 0, 8], [3, -1, 6, 8], [-4, -1, -6, 8], [2, 0, -6, 7]]) {
    part(b, GEO.sphere, mat(c.light, { rough: 0.5 }), { x, y, z, s: r });
  }
  eyes(b, 9.8, 3, 3.6, 3.1, true);
  const rain = group(b, { y: -10 });
  for (const [x, z] of [[-5, -3], [0, 3], [5, -2], [2, -5]]) part(rain, GEO.capsule, mat('#7fb7ff'), { x, z, sc: [1.4, 3, 1.4], ow: 0, shadow: false });
  rain.visible = false;
  P.rain = rain;
  return P;
};

export function buildUnit(type, c, grump) {
  const root = new THREE.Group();
  root.userData.ow = 1.5;
  const P = (U[type] || U.malersoldat)(root, c, grump);
  return { obj: root, parts: P };
}

// ---------- buildings ----------
const PAD = { stjerne: '#e3e8f3', summ: '#d8a865', krystall: '#e6f7ff', graa: '#a3a7b1' };
const B = {};

function pad(g, S, color, hex) {
  if (hex) part(g, GEO.hex, mat(color), { y: 4, sc: [S * 0.5, 8, S * 0.5], ry: PI / 6 });
  else part(g, GEO.box, mat(color), { y: 4, sc: [S * 0.9, 8, S * 0.9] });
}
function cloud(g, puffs, color) {
  for (const [x, y, z, r] of puffs) part(g, GEO.sphere, mat(color, { rough: 0.5 }), { x, y, z, s: r });
}

B.stjernestasjon = (g, c, S, grump) => {
  const P = {};
  pad(g, S, PAD.stjerne);
  for (const x of [-46, 46]) {
    part(g, GEO.cyl, mat('#cfd6e6'), { x, y: 20, z: -28, sc: [10, 28, 10] });
    part(g, GEO.hemi, mat(c.main), { x, y: 34, z: -28, s: 10 });
  }
  part(g, GEO.hemi, mat(c.main), { y: 8, s: S * 0.34 });
  for (const a of [-0.75, 0.75]) part(g, GEO.sphere, mat(c.light, { glow: 0.3 }), { x: Math.sin(a) * 37, y: 28, z: Math.cos(a) * 37, sc: [5, 5, 3], ry: a, ow: 0.8 });
  eyes(g, 33, 34, 9, 6.5, grump, 'z');
  part(g, GEO.box, mat('#5a5a78'), { y: 13, z: S * 0.38, sc: [20, 22, 10] });
  part(g, GEO.cyl, mat(DARK), { y: 58, sc: [1.8, 20, 1.8], ow: 0.8 });
  P.spin = part(g, starGeo(5, 0.46, 11, 4), mat('#ffe14d', { glow: 0.35, rough: 0.2 }), { y: 74 });
  return P;
};
B.kaserne = (g, c, S) => {
  const P = {};
  pad(g, S, PAD.stjerne);
  part(g, GEO.box, mat('#fff3df'), { y: 24, sc: [70, 34, 54] });
  part(g, prism(64, 28, 80), mat(c.main), { y: 40 });
  part(g, GEO.box, mat(c.dark), { y: 16, z: 27.5, sc: [18, 24, 4] });
  for (const x of [-23, 23]) part(g, GEO.sphere, mat(c.light, { glow: 0.2 }), { x, y: 28, z: 27.4, sc: [6, 6, 2], ow: 0.8 });
  part(g, GEO.cyl, mat(DARK), { x: 30, y: 62, z: 6, sc: [1.3, 30, 1.3], ow: 0.8 });
  P.flag = group(g, { x: 30, y: 72, z: 6 });
  part(P.flag, GEO.box, mat(c.light), { x: 8, sc: [15, 9, 1.4], ow: 1 });
  return P;
};
B.verksted = (g, c, S) => {
  const P = {};
  pad(g, S, PAD.stjerne);
  part(g, GEO.box, mat('#dfe4ee'), { y: 22, sc: [78, 32, 60] });
  part(g, GEO.halfCyl, mat(c.main), { y: 38, sc: [18, 82, 31], rz: PI / 2 });
  part(g, GEO.box, mat('#5a5a78'), { y: 18, z: 29, sc: [46, 26, 4] });
  for (let i = 0; i < 3; i++) part(g, GEO.box, mat('#8a8aa6'), { y: 10 + i * 8, z: 31.2, sc: [44, 1.6, 1], ow: 0, shadow: false });
  P.gear = part(g, starGeo(8, 0.72, 11, 4), mat(YELLOW, { rough: 0.2 }), { x: 26, y: 62, z: 6 });
  return P;
};
B.vakttarn = (g, c, S, grump) => {
  const P = {};
  part(g, cylT(15, 21, 16), mat('#e8ecf5'), { y: 22, sc: [1, 44, 1] });
  part(g, GEO.cyl, mat(c.main), { y: 46, sc: [19, 6, 19] });
  const t = group(g, { y: 56 });
  part(t, GEO.sphere, mat(c.light), { s: 10.5 });
  part(t, GEO.cyl, mat('#5a5a78'), { x: 13, sc: [3.6, 16, 3.6], rz: -PI / 2 });
  eye(t, 8.4, 3, 0, 3.6, grump);
  P.turret = t;
  return P;
};

B.bikube = (g, c, S, grump) => {
  pad(g, S, PAD.summ);
  for (let i = 0; i < 5; i++) {
    const w = S * 0.42 * (1 - Math.abs(i - 1.4) * 0.16);
    part(g, GEO.sphere, mat(i % 2 ? c.light : c.main), { y: 12 + i * 16, sc: [w, 11, w * 0.9] });
  }
  part(g, GEO.sphere, mat('#3b3552'), { y: 20, z: S * 0.37, sc: [12, 10, 4], ow: 0 });
  eyes(g, 33, 62, 12, 7, grump, 'z');
  for (const [x, y, z] of [[-30, 36, 30], [28, 54, 28], [-6, 30, 46]]) part(g, GEO.sphere, mat('#ffcf3a', { rough: 0.1 }), { x, y, z, sc: [3, 4, 3], ow: 0.8 });
  return {};
};
B.klekkeri = (g, c, S) => {
  const P = { eggs: [] };
  pad(g, S, PAD.summ);
  part(g, GEO.cyl, mat('#9a6a3e'), { y: 8, sc: [36, 8, 36] });
  part(g, GEO.torus, mat('#b07a4a', { rough: 0.7 }), { y: 12, sc: [36, 36, 30], rx: PI / 2 });
  for (const [x, z] of [[-18, 6], [0, -10], [18, 6]]) {
    const e = group(g, { x, y: 14, z });
    part(e, GEO.sphere, mat('#fffaf0'), { y: 14, sc: [11, 15, 11] });
    part(e, GEO.sphere, mat(c.main), { x: -4, y: 19, z: 8.5, s: 3, ow: 0 });
    part(e, GEO.sphere, mat(c.light), { x: 4, y: 11, z: 9.5, s: 2.6, ow: 0 });
    P.eggs.push(e);
  }
  return P;
};
B.vingereir = (g, c, S) => {
  const P = { wings: [] };
  pad(g, S, PAD.summ);
  part(g, cylT(20, 25, 16), mat('#a8743f'), { y: 26, sc: [1, 44, 1] });
  part(g, GEO.torus, mat(c.main), { y: 48, s: 21, rx: PI / 2 });
  for (const x of [-7, 7]) part(g, GEO.sphere, mat(c.light), { x, y: 50, s: 6 });
  for (const s of [-1, 1]) {
    const w = group(g, { x: s * 18, y: 46 });
    part(w, GEO.sphere, mat('#ffffff', { opacity: 0.85, rough: 0.1 }), { x: s * 16, sc: [22, 4, 12], ow: 1 });
    w.userData.side = s;
    P.wings.push(w);
  }
  return P;
};
B.piggsopp = (g, c, S, grump) => {
  part(g, cylT(9, 11, 16), mat('#fff3df'), { y: 13, sc: [1, 26, 1] });
  part(g, GEO.hemi, mat(c.main), { y: 24, sc: [27, 21, 27] });
  for (const [x, y, z] of [[-11, 38, 9], [9, 39, -7], [2, 33, 19], [16, 31, 10], [-16, 30, -10]]) part(g, GEO.sphere, mat('#ffffff'), { x, y, z, s: 4, ow: 0 });
  eyes(g, 10, 14, 4.2, 3.2, grump, 'z');
  return {};
};

B.krystallhjerte = (g, c, S, grump) => {
  const P = {};
  pad(g, S, PAD.krystall, true);
  crystalGem(g, -32, 8, 4, 58, 11, c.light, null, 0.2);
  crystalGem(g, 32, 8, 2, 54, 11, c.light, null, 0.2);
  crystalGem(g, 4, 8, -28, 48, 10, c.light, null, 0.2);
  P.pulse = crystalGem(g, 0, 8, 0, 96, 19, c.main, null, 0.35);
  eyes(g, 15, 48, 6.5, 5, grump, 'z');
  return P;
};
B.portal = (g, c, S) => {
  const P = {};
  pad(g, S, PAD.krystall, true);
  crystalGem(g, -33, 8, 0, 70, 8, c.light, null, 0.2);
  crystalGem(g, 33, 8, 0, 70, 8, c.light, null, 0.2);
  part(g, GEO.torus, mat(c.main), { y: 40, sc: [27, 31, 24] });
  part(g, GEO.disc, mat(c.dark, { glow: 0.3 }), { y: 40, sc: [24, 1.5, 28], rx: PI / 2, ow: 0 });
  P.swirl = group(g, { y: 40, z: 1.5 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    part(P.swirl, GEO.disc, mat(c.light, { glow: 0.7 }), { x: Math.cos(a) * 9, y: Math.sin(a) * 11, sc: [7 - i, 1, 7 - i], rx: PI / 2, ow: 0, shadow: false });
  }
  return P;
};
B.stjerneport = (g, c, S) => {
  const P = {};
  part(g, GEO.disc, mat(PAD.krystall), { y: 4, sc: [45, 8, 45] });
  part(g, GEO.disc, mat(c.dark, { glow: 0.25 }), { y: 8.6, sc: [34, 1.5, 34], ow: 0 });
  part(g, GEO.torus, mat(c.main), { y: 9, s: 37, rx: PI / 2 });
  P.orbit = group(g, { y: 16 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    part(P.orbit, starGeo(5, 0.46, 5, 2), mat(c.light, { glow: 0.4 }), { x: Math.cos(a) * 37, z: Math.sin(a) * 37, ow: 0.8 });
  }
  P.spin = part(g, starGeo(5, 0.46, 17, 6), mat('#ffe14d', { glow: 0.4, rough: 0.2 }), { y: 44 });
  return P;
};
B.lystarn = (g, c, S, grump) => {
  const P = {};
  part(g, GEO.hex, mat(PAD.krystall), { y: 4, sc: [24, 8, 24] });
  part(g, cylT(6, 12, 4), mat(c.light, { flat: true }), { y: 30, sc: [1, 46, 1], ry: PI / 4 });
  const t = group(g, { y: 60 });
  P.orb = part(t, GEO.sphere, mat(c.main, { glow: 0.5 }), { s: 9.5 });
  eye(t, 7, 1, 0, 3.6, grump);
  P.turret = t;
  return P;
};

B.skyslottet = (g, c, S) => {
  cloud(g, [[-40, 12, 12, 22], [-12, 10, 24, 24], [16, 10, 24, 24], [42, 12, 10, 22], [0, 10, -20, 26], [-32, 10, -24, 20], [32, 10, -24, 20]], c.light);
  part(g, GEO.box, mat(c.main), { y: 44, sc: [56, 52, 44] });
  part(g, prism(48, 22, 60), mat(c.dark), { y: 70 });
  for (const x of [-40, 40]) {
    part(g, GEO.cyl, mat(c.main), { x, y: 48, z: 6, sc: [11, 62, 11] });
    part(g, GEO.cone, mat(c.dark), { x, y: 89, z: 6, sc: [14, 22, 14] });
  }
  eyes(g, 22.5, 52, 10, 7, true, 'z');
  part(g, GEO.arc, mat('#2a2440'), { y: 30, z: 23, s: 8, ow: 0 });
  return {};
};
B.taakefabrikk = (g, c, S) => {
  const P = { smoke: [] };
  pad(g, S, PAD.graa);
  part(g, GEO.box, mat(c.main), { y: 26, sc: [76, 36, 56] });
  for (const x of [-25, 0, 25]) part(g, prism(24, 14, 56), mat(c.dark), { x, y: 44, ry: PI / 2 });
  part(g, GEO.cyl, mat(c.dark), { x: 28, y: 62, z: -14, sc: [7, 36, 7] });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshStandardMaterial({ color: '#d0d3da', roughness: 0.6, transparent: true, opacity: 0.9, depthWrite: false });
    const s = new THREE.Mesh(GEO.sphere, m);
    s.position.set(28, 82, -14);
    g.add(s);
    P.smoke.push(s);
  }
  part(g, GEO.box, mat('#4a4466'), { y: 18, z: 28.5, sc: [22, 22, 3] });
  eyes(g, 28.5, 32, 19, 5, true, 'z');
  return P;
};
B.skyverksted = (g, c, S) => {
  pad(g, S, PAD.graa);
  part(g, GEO.box, mat(c.main), { y: 24, sc: [72, 34, 58] });
  part(g, GEO.box, mat('#4a4466'), { y: 20, z: 29, sc: [42, 26, 3] });
  cloud(g, [[-18, 46, 0, 14], [2, 52, 2, 17], [22, 46, 0, 13]], c.light);
  eyes(g, 18, 52, 6, 4.5, true, 'z');
  return {};
};
B.graataarn = (g, c, S) => {
  const P = {};
  part(g, cylT(15, 21, 16), mat(c.main), { y: 22, sc: [1, 44, 1] });
  const t = group(g, { y: 54 });
  cloud(t, [[-8, 0, -4, 9], [2, 4, 0, 11], [10, 0, 3, 8], [-2, 0, 7, 8]], c.light);
  eyes(t, 10, 4, 3.6, 3.2, true);
  P.turret = t;
  return P;
};

export function buildBuilding(type, c, grump) {
  const root = new THREE.Group();
  root.userData.ow = 2.2;
  const S = BUILDINGS[type].size * TILE;
  const P = (B[type] || B.kaserne)(root, c, S, grump) || {};
  return { obj: root, parts: P };
}

// ---------- crystals ----------
const CRYSTAL_COLORS = [['#5ee6ff', '#d6fbff'], ['#ff8fd0', '#ffe0f2'], ['#b28cff', '#ece2ff']];
export function buildCrystal(variant) {
  const root = new THREE.Group();
  root.userData.ow = 1.2;
  const [col] = CRYSTAL_COLORS[variant % 3];
  crystalGem(root, -6, 0, 3, 18, 4.8, col, null, 0.35);
  crystalGem(root, 6, 0, 2, 16, 4.4, col, null, 0.35);
  crystalGem(root, 0, 0, -3, 26, 6, col, null, 0.35);
  return root;
}
