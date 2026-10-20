'use strict';
// Small shared helpers. All game scripts are classic <script> files that share
// the global scope, so the game also runs straight from file:// without a server.

const TILE = 32;
const TAU = Math.PI * 2;
const OUTLINE = '#2a2440';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

// Deterministic random numbers (mulberry32), so maps are the same every time.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ':' + String(ss).padStart(2, '0');
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// amt > 0 lightens towards white, amt < 0 darkens towards black.
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

// Binary min-heap keyed by number priority, storing integer node ids.
class MinHeap {
  constructor() { this.ids = []; this.pri = []; }
  get size() { return this.ids.length; }
  clear() { this.ids.length = 0; this.pri.length = 0; }
  push(id, p) {
    const ids = this.ids, pri = this.pri;
    let i = ids.length;
    ids.push(id); pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent]; pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id; pri[i] = p;
  }
  pop() {
    const ids = this.ids, pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop(), lastP = pri.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mp = lastP;
        if (l < n && pri[l] < mp) { m = l; mp = pri[l]; }
        if (r < n && pri[r] < mp) { m = r; mp = pri[r]; }
        if (m === i) break;
        ids[i] = ids[m]; pri[i] = pri[m];
        i = m;
      }
      ids[i] = lastId; pri[i] = lastP;
    }
    return top;
  }
}

// Campaign progress and skirmish setup are kept per Couch Party Island profile when the game is
// opened from the island's solo mode (see couch.js); sound and controls stay shared.
const PROFILE_KEYS = new Set(['starlite.progress', 'starlite.skirmish']);
function storageKey(key) {
  return PROFILE_KEYS.has(key) && typeof couchProfileKey === 'function' ? couchProfileKey(key) : key;
}
function safeStorageGet(key, fallback) {
  try {
    const v = localStorage.getItem(storageKey(key));
    return v == null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
}
