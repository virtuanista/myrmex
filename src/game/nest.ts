// Hormiguero subterráneo del jugador (vista en corte lateral).
import { CHAMBERS, ChamberType, DECORS } from './defs';
import { Chamber, G, NestState, NEST_H, NEST_SKY, NEST_W, NTS, newId } from './state';
import { Noise, RNG, hash2 } from '../core/util';

export function createNest(seed: number): NestState {
  const W = NEST_W, H = NEST_H;
  const grid = new Uint8Array(W * H);
  const treas = new Uint8Array(W * H);
  const rng = new RNG(seed * 31 + 5);
  const nz = new Noise(seed + 77);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y < NEST_SKY) { grid[i] = 3; continue; }
    if (x === 0 || x === W - 1 || y === H - 1) { grid[i] = 2; continue; }
    const depth = (y - NEST_SKY) / (H - NEST_SKY);
    const r = nz.fbm(x / 7, y / 7, 3);
    if (r > 0.74 - depth * 0.12 && y > NEST_SKY + 5) grid[i] = 2;
  }
  // tesoros
  const tcount = 70;
  for (let k = 0; k < tcount; k++) {
    const x = rng.int(2, W - 3), y = rng.int(NEST_SKY + 6, H - 3);
    const i = y * W + x;
    if (grid[i] !== 0) continue;
    const depth = (y - NEST_SKY) / (H - NEST_SKY);
    const roll = rng.next();
    treas[i] = roll < 0.45 ? 4 : roll < 0.75 ? 1 : roll < 0.92 - depth * 0.1 ? 3 : 2;
  }
  const n: NestState = {
    W, H, grid, treas, dig: new Uint8Array(W * H), digp: new Float32Array(W * H),
    chambers: [], brood: [], ex: Math.floor(W / 2), ey: NEST_SKY,
    queenX: 0, queenY: 0, queenA: 0,
  };
  // pozo de entrada y cámara real
  const ex = n.ex;
  const royalY = NEST_SKY + 17;
  for (let y = NEST_SKY; y < royalY - 2; y++) {
    for (let dx = -1; dx <= 0; dx++) {
      const xx = ex + dx + Math.round(Math.sin(y * 0.45) * 1.2);
      openTile(n, xx, y); openTile(n, xx + 1, y);
    }
  }
  const royal: Chamber = { id: 1, type: 'royal', cx: ex, cy: royalY, rx: 7, ry: 4, level: 1, state: 1, decor: [], t: 0 };
  carveEllipse(n, royal);
  n.chambers.push(royal);
  n.queenX = ex * NTS; n.queenY = (royalY + 1.5) * NTS; n.queenA = 0;
  // limpiar tesoros en lo excavado
  for (let i = 0; i < W * H; i++) if (grid[i] === 1) treas[i] = 0;
  return n;
}

function openTile(n: NestState, x: number, y: number) {
  if (x < 1 || y < NEST_SKY || x >= n.W - 1 || y >= n.H - 1) return;
  n.grid[y * n.W + x] = 1;
}
function carveEllipse(n: NestState, c: { cx: number; cy: number; rx: number; ry: number }) {
  for (let y = Math.floor(c.cy - c.ry); y <= c.cy + c.ry; y++) for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) {
    if (inEllipse(c, x, y)) openTile(n, x, y);
  }
}
export function inEllipse(c: { cx: number; cy: number; rx: number; ry: number }, x: number, y: number) {
  return ((x - c.cx) / (c.rx + 0.35)) ** 2 + ((y - c.cy) / (c.ry + 0.35)) ** 2 <= 1;
}

export function tileHardness(x: number, y: number): number {
  const depth = (y - NEST_SKY) / (NEST_H - NEST_SKY);
  return 0.8 + depth * 1.6 + hash2(x, y, 9) * 0.4;
}

export function chamberAtTile(n: NestState, x: number, y: number): Chamber | null {
  for (const c of n.chambers) if (inEllipse(c, x, y)) return c;
  return null;
}
export function chamberById(id: number) { return G.S.nest.chambers.find(c => c.id === id) || null; }

export function canPlaceChamber(type: ChamberType, cx: number, cy: number): { ok: boolean; reason: string } {
  const n = G.S.nest;
  const d = CHAMBERS[type];
  if (cx - d.rx < 2 || cx + d.rx > n.W - 3) return { ok: false, reason: 'Fuera de los límites' };
  if (cy - d.ry < NEST_SKY + 4) return { ok: false, reason: 'Demasiado cerca de la superficie' };
  if (cy + d.ry > n.H - 3) return { ok: false, reason: 'Demasiado profundo' };
  for (const c of n.chambers) {
    const dx = (cx - c.cx) / (d.rx + c.rx + 2), dy = (cy - c.cy) / (d.ry + c.ry + 2);
    if (dx * dx + dy * dy < 1) return { ok: false, reason: 'Se solapa con otra cámara' };
  }
  if (d.unique && n.chambers.some(c => c.type === type)) return { ok: false, reason: 'Solo puede haber una' };
  let rock = 0, total = 0;
  const tmp = { cx, cy, rx: d.rx, ry: d.ry };
  for (let y = cy - d.ry; y <= cy + d.ry; y++) for (let x = cx - d.rx; x <= cx + d.rx; x++) {
    if (!inEllipse(tmp, x, y)) continue;
    total++;
    if (n.grid[y * n.W + x] === 2) rock++;
  }
  if (rock / Math.max(1, total) > 0.4) return { ok: false, reason: 'Hay demasiada roca' };
  return { ok: true, reason: '' };
}

export function placeChamber(type: ChamberType, cx: number, cy: number): Chamber {
  const n = G.S.nest;
  const d = CHAMBERS[type];
  const c: Chamber = { id: newId(), type, cx, cy, rx: d.rx, ry: d.ry, level: 1, state: 0, decor: [], t: 0 };
  n.chambers.push(c);
  let connected = false;
  for (let y = cy - d.ry - 1; y <= cy + d.ry + 1; y++) for (let x = cx - d.rx - 1; x <= cx + d.rx + 1; x++) {
    const i = y * n.W + x;
    if (inEllipse(c, x, y)) {
      if (n.grid[i] === 2) n.grid[i] = 0;
      if (n.grid[i] === 0) n.dig[i] = 1;
      else if (n.grid[i] === 1) connected = true;
    } else if (n.grid[i] === 1) {
      // vecino abierto adyacente a la elipse
      if (inEllipse(c, x + 1, y) || inEllipse(c, x - 1, y) || inEllipse(c, x, y + 1) || inEllipse(c, x, y - 1)) connected = true;
    }
  }
  if (!connected) autoTunnel(c);
  markNestDirty();
  checkChamberDone(c);
  return c;
}

/** Diseña automáticamente un túnel de 2 casillas desde la cámara hasta el túnel abierto más cercano */
export function autoTunnel(c: { cx: number; cy: number }) {
  const n = G.S.nest;
  const W = n.W, H = n.H;
  const prev = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const q: number[] = [];
  const start = c.cy * W + c.cx;
  q.push(start); seen[start] = 1;
  let goal = -1;
  for (let qh = 0; qh < q.length; qh++) {
    const i = q[qh];
    if (n.grid[i] === 1 && !chamberDesignated(i)) { goal = i; break; }
    const x = i % W, y = (i / W) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nb) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < NEST_SKY || nx >= W - 1 || ny >= H - 1) continue;
      const j = ny * W + nx;
      if (seen[j] || n.grid[j] === 2) continue;
      seen[j] = 1; prev[j] = i; q.push(j);
    }
  }
  if (goal < 0) return;
  let cur = goal;
  while (cur !== -1 && cur !== start) {
    const x = cur % W, y = (cur / W) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
      const j = (y + dy) * W + (x + dx);
      if (n.grid[j] === 0) n.dig[j] = 1;
    }
    cur = prev[cur];
  }
}
function chamberDesignated(i: number) {
  const n = G.S.nest;
  const x = i % n.W, y = (i / n.W) | 0;
  const c = chamberAtTile(n, x, y);
  return !!c && c.state === 0 && n.dig[i] === 1;
}

export function designateDig(x: number, y: number, on: boolean): boolean {
  const n = G.S.nest;
  if (x < 1 || y < NEST_SKY || x >= n.W - 1 || y >= n.H - 1) return false;
  const i = y * n.W + x;
  if (n.grid[i] !== 0) return false;
  const v = on ? 1 : 0;
  if (n.dig[i] === v) return false;
  // no cancelar excavación de cámaras en obra
  if (!on) {
    const c = chamberAtTile(n, x, y);
    if (c && c.state === 0) return false;
  }
  n.dig[i] = v;
  markNestDirty();
  return true;
}

export function checkChamberDone(c: Chamber): boolean {
  if (c.state === 1) return false;
  const n = G.S.nest;
  for (let y = Math.floor(c.cy - c.ry); y <= c.cy + c.ry; y++) for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) {
    if (inEllipse(c, x, y) && n.grid[y * n.W + x] !== 1) return false;
  }
  c.state = 1; c.t = 0;
  return true;
}

export function chamberProgress(c: Chamber): number {
  const n = G.S.nest;
  let tot = 0, open = 0;
  for (let y = Math.floor(c.cy - c.ry); y <= c.cy + c.ry; y++) for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) {
    if (!inEllipse(c, x, y)) continue;
    tot++;
    if (n.grid[y * n.W + x] === 1) open++;
  }
  return open / Math.max(1, tot);
}

export function addDecor(c: Chamber, k: string, x: number, y: number) {
  c.decor.push({ k, x, y });
}
export function decorBeauty(k: string) { return DECORS.find(d => d.id === k)?.beauty ?? 0; }

// ------------------ Campos de flujo internos ------------------
export type NField = Int16Array;
const fields = new Map<string, NField>();
let dirty = true;
let lastBuild = -10;
export let nestVersion = 0;
export function markNestDirty() { dirty = true; nestVersion++; }

const NDX = [1, -1, 0, 0, 1, 1, -1, -1];
const NDY = [0, 0, 1, -1, 1, -1, 1, -1];

function bfsNest(seeds: number[]): NField {
  const n = G.S.nest;
  const W = n.W, H = n.H;
  const f = new Int16Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  for (const s of seeds) { if (f[s] < 0) { f[s] = 0; q[qt++] = s; } }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + NDX[k], ny = y + NDY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (f[j] >= 0 || n.grid[j] !== 1) continue;
      if (k >= 4 && (n.grid[y * W + nx] !== 1 || n.grid[ny * W + x] !== 1)) continue;
      f[j] = f[i] + 1; q[qt++] = j;
    }
  }
  return f;
}

export function updateNestFields(force = false) {
  const S = G.S;
  if (!dirty && !force) return;
  if (!force && S.time - lastBuild < 0.3) return;
  dirty = false; lastBuild = S.time;
  const n = S.nest;
  const W = n.W;
  fields.clear();
  // salida
  const exitSeeds: number[] = [];
  for (let dx = -2; dx <= 2; dx++) { const i = n.ey * W + n.ex + dx; if (n.grid[i] === 1) exitSeeds.push(i); }
  if (!exitSeeds.length) exitSeeds.push(n.ey * W + n.ex);
  fields.set('exit', bfsNest(exitSeeds));
  // cámaras
  for (const c of n.chambers) {
    const seeds: number[] = [];
    for (let y = Math.floor(c.cy - c.ry); y <= c.cy + c.ry; y++) for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) {
      if (inEllipse(c, x, y) && n.grid[y * W + x] === 1) seeds.push(y * W + x);
    }
    if (seeds.length) fields.set('ch' + c.id, bfsNest(seeds));
  }
  // frente de excavación
  const digSeeds: number[] = [];
  for (let y = NEST_SKY; y < n.H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (n.grid[i] !== 1) continue;
    if (n.dig[i + 1] || n.dig[i - 1] || n.dig[i + W] || n.dig[i - W]) digSeeds.push(i);
  }
  digFrontier = digSeeds.length;
  if (digSeeds.length) fields.set('dig', bfsNest(digSeeds));
}
export let digFrontier = 0;
export function nestField(key: string): NField | undefined { return fields.get(key); }

export function nestFlowDir(f: NField, px: number, py: number): number {
  const n = G.S.nest;
  const x = Math.floor(px / NTS), y = Math.floor(py / NTS);
  if (x < 0 || y < 0 || x >= n.W || y >= n.H) return NaN;
  const i = y * n.W + x;
  const cur = f[i];
  if (cur === 0) return NaN;
  let best = cur < 0 ? 32767 : cur, bx = -1, by = -1;
  for (let k = 0; k < 8; k++) {
    const nx = x + NDX[k], ny = y + NDY[k];
    if (nx < 0 || ny < 0 || nx >= n.W || ny >= n.H) continue;
    const v = f[ny * n.W + nx];
    if (v >= 0 && v < best) {
      if (k >= 4 && (n.grid[y * n.W + nx] !== 1 || n.grid[ny * n.W + x] !== 1)) continue;
      best = v; bx = nx; by = ny;
    }
  }
  if (bx < 0) return NaN;
  return Math.atan2((by + 0.5) * NTS - py, (bx + 0.5) * NTS - px);
}
export function nestFieldAt(f: NField, px: number, py: number): number {
  const n = G.S.nest;
  const x = Math.floor(px / NTS), y = Math.floor(py / NTS);
  if (x < 0 || y < 0 || x >= n.W || y >= n.H) return -1;
  return f[y * n.W + x];
}
export function nestOpenAt(px: number, py: number): boolean {
  const n = G.S.nest;
  const x = Math.floor(px / NTS), y = Math.floor(py / NTS);
  if (x < 0 || y < 0 || x >= n.W || y >= n.H) return false;
  return n.grid[y * n.W + x] === 1;
}

/** Punto aleatorio abierto dentro de una cámara (preferentemente cerca del suelo) */
export function randomPointIn(c: Chamber, floorBias = 0.6): { x: number; y: number } {
  const n = G.S.nest;
  for (let k = 0; k < 20; k++) {
    const ax = c.cx + (Math.random() * 2 - 1) * (c.rx - 0.5);
    const t = Math.random();
    const ay = c.cy + (Math.random() < floorBias ? (0.3 + 0.7 * t) * (c.ry - 0.6) : (t * 2 - 1) * (c.ry - 0.6));
    const tx = Math.floor(ax), ty = Math.floor(ay);
    if (n.grid[ty * n.W + tx] === 1 && inEllipse(c, tx, ty)) return { x: ax * NTS, y: ay * NTS };
  }
  return { x: c.cx * NTS + NTS / 2, y: c.cy * NTS + NTS / 2 };
}

/** Punto de suelo de una cámara para decoraciones (en coordenadas de casilla fraccional) */
export function floorY(c: Chamber, x: number): number {
  const dx = (x - c.cx) / (c.rx + 0.35);
  if (Math.abs(dx) >= 1) return c.cy;
  return c.cy + (c.ry + 0.35) * Math.sqrt(1 - dx * dx) - 0.6;
}
