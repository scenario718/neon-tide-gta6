// util.js — small shared helpers for Neon Tide: math, a seeded random number
// generator (so the city builds the same way on every load), and the circle /
// rectangle collision tests every other system leans on.

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent smoothing factor: bigger rate = snappier follow.
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDelta(from, to) * t;
}

// mulberry32: tiny deterministic RNG. The city, traffic and pedestrian spawns
// all draw from one seeded stream so a given seed always builds the same city.
export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// Is a point inside an axis-aligned rect {x, y, w, h} (x/y = top-left)?
export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Push a circle (cx, cy, radius) out of a rect; returns the corrected centre
// plus how deep it was penetrating, so callers can tell a graze from a slam.
export function circleRectResolve(cx, cy, radius, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const dSq = dx * dx + dy * dy;
  if (dSq > radius * radius) return null;
  if (dSq > 0.0001) {
    const d = Math.sqrt(dSq);
    const push = radius - d;
    return { x: cx + (dx / d) * push, y: cy + (dy / d) * push, depth: push, nx: dx / d, ny: dy / d };
  }
  // Centre is inside the rect: push out through the nearest face.
  const left = cx - r.x;
  const right = r.x + r.w - cx;
  const top = cy - r.y;
  const bottom = r.y + r.h - cy;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: r.x - radius, y: cy, depth: radius + left, nx: -1, ny: 0 };
  if (min === right) return { x: r.x + r.w + radius, y: cy, depth: radius + right, nx: 1, ny: 0 };
  if (min === top) return { x: cx, y: r.y - radius, depth: radius + top, nx: 0, ny: -1 };
  return { x: cx, y: r.y + r.h + radius, depth: radius + bottom, nx: 0, ny: 1 };
}

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const rr = ar + br;
  return distSq(ax, ay, bx, by) < rr * rr;
}

// Format a dollar amount the way the HUD shows it: $1,250.
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format seconds as m:ss for mission timers.
export function clockText(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
}
