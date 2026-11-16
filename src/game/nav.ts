// Campos de flujo para navegación en superficie.
import { WORLD } from './world';
import { G, TS } from './state';
import { BUILDINGS } from './defs';

export type Field = Uint16Array;
const INF = 65535;

class Heap {
  k: Int32Array; v: Int32Array; n = 0;
  constructor(cap: number) { this.k = new Int32Array(cap); this.v = new Int32Array(cap); }
  push(key: number, val: number) {
    if (this.n >= this.k.length) {
      const k2 = new Int32Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    let i = this.n++;
    this.k[i] = key; this.v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const r = this.v[0];
    this.n--;
    if (this.n > 0) {
      this.k[0] = this.k[this.n]; this.v[0] = this.v[this.n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, rr = l + 1;
        let m = i;
        if (l < this.n && this.k[l] < this.k[m]) m = l;
        if (rr < this.n && this.k[rr] < this.k[m]) m = rr;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return r;
  }
  topKey() { return this.k[0]; }
  swap(a: number, b: number) {
    let t = this.k[a]; this.k[a] = this.k[b]; this.k[b] = t;
    t = this.v[a]; this.v[a] = this.v[b]; this.v[b] = t;
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DC = [10, 10, 10, 10, 14, 14, 14, 14];

export function buildField(seeds: number[]): Field {
  const W = WORLD.W;
  const w = W.w, h = W.h, pass = W.pass;
  const f = new Uint16Array(w * h).fill(INF);
  const heap = new Heap(4096);
  for (const s of seeds) { f[s] = 0; heap.push(0, s); }
  while (heap.n > 0) {
    const d = heap.topKey();
    const i = heap.pop();
    if (d > f[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!pass[j]) continue;
      if (k >= 4 && (!pass[y * w + nx] || !pass[ny * w + x])) continue;
      const nd = d + DC[k];
      if (nd < f[j]) { f[j] = nd; heap.push(nd, j); }
    }
  }
  return f;
}

/** Dirección (ángulo) a seguir en el campo; NaN si ya está en el objetivo o no hay camino */
export function flowDir(f: Field, px: number, py: number): number {
  const W = WORLD.W;
  const x = Math.floor(px / TS), y = Math.floor(py / TS);
  if (x < 0 || y < 0 || x >= W.w || y >= W.h) return NaN;
  const i = y * W.w + x;
  let best = f[i], bx = 0, by = 0;
  if (best === 0) return NaN;
  let found = false;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k], ny = y + DY[k];
    if (nx < 0 || ny < 0 || nx >= W.w || ny >= W.h) continue;
    const v = f[ny * W.w + nx];
    if (v < best) {
      if (k >= 4 && (!W.pass[y * W.w + nx] || !W.pass[ny * W.w + x])) continue;
      best = v; bx = nx; by = ny; found = true;
    }
  }
  if (!found) return NaN;
  return Math.atan2((by + 0.5) * TS - py, (bx + 0.5) * TS - px);
}

export function fieldValue(f: Field, px: number, py: number): number {
  const W = WORLD.W;
  const x = Math.floor(px / TS), y = Math.floor(py / TS);
  if (x < 0 || y < 0 || x >= W.w || y >= W.h) return INF;
  return f[y * W.w + x];
}

// ---------------- Cachés ----------------
const homeFields: (Field | null)[] = [];
export function invalidateHome(col?: number) {
  if (col === undefined) homeFields.length = 0;
  else homeFields[col] = null;
}

export function isDropoff(type: string) {
  return type === 'nest' || type === 'outpost' || type === 'satellite' || type === 'rivalnest';
}

export function homeField(col: number): Field {
  let f = homeFields[col];
  if (f) return f;
  const W = WORLD.W;
  const seeds: number[] = [];
  for (const s of G.S.structures) {
    if (s.col !== col || !s.built || !isDropoff(s.type)) continue;
    const r = Math.max(1, Math.floor(BUILDINGS[s.type].radius / TS));
    const cx = Math.floor(s.x / TS), cy = Math.floor(s.y / TS);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W.w || y >= W.h) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      if (W.pass[y * W.w + x]) seeds.push(y * W.w + x);
    }
  }
  if (!seeds.length) seeds.push(Math.floor(W.h / 2) * W.w + Math.floor(W.w / 2));
  f = buildField(seeds);
  homeFields[col] = f;
  return f;
}

const targetCache = new Map<number, Field>();
const targetOrder: number[] = [];
export function fieldTo(px: number, py: number): Field {
  const W = WORLD.W;
  let x = Math.floor(px / TS), y = Math.floor(py / TS);
  x = Math.max(0, Math.min(W.w - 1, x)); y = Math.max(0, Math.min(W.h - 1, y));
  // si el objetivo es impasable, buscar casilla cercana pasable
  if (!W.pass[y * W.w + x]) {
    let bestD = 1e9, bx = x, by = y;
    for (let r = 1; r < 8 && bestD === 1e9; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W.w || ny >= W.h) continue;
        if (W.pass[ny * W.w + nx]) { const d = dx * dx + dy * dy; if (d < bestD) { bestD = d; bx = nx; by = ny; } }
      }
    }
    x = bx; y = by;
  }
  const key = y * W.w + x;
  let f = targetCache.get(key);
  if (f) return f;
  f = buildField([key]);
  targetCache.set(key, f);
  targetOrder.push(key);
  if (targetOrder.length > 40) {
    const old = targetOrder.shift()!;
    targetCache.delete(old);
  }
  return f;
}
export function clearNavCaches() { targetCache.clear(); targetOrder.length = 0; invalidateHome(); }

/** Línea de visión simple por casillas (para evitar campos cuando el destino está a la vista) */
export function clearLine(ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / (TS * 0.5));
  const W = WORLD.W;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor((ax + (bx - ax) * t) / TS), y = Math.floor((ay + (by - ay) * t) / TS);
    if (x < 0 || y < 0 || x >= W.w || y >= W.h || !W.pass[y * W.w + x]) return false;
  }
  return true;
}
