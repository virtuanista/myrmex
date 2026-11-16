// Rejilla espacial para consultas de vecindad rápidas en superficie.
import { Ant, Creature, G, Structure, TS } from './state';
import { WORLD } from './world';

const CELL = 48;
let cw = 0, ch = 0;
let antHead = new Int32Array(0), antNext = new Int32Array(0);
let creHead = new Int32Array(0), creNext = new Int32Array(0);
export const antById = new Map<number, Ant>();
export const creById = new Map<number, Creature>();
export const strById = new Map<number, Structure>();

export function rebuildSpatial() {
  const S = G.S;
  const W = WORLD.W;
  cw = Math.ceil((W.w * TS) / CELL); ch = Math.ceil((W.h * TS) / CELL);
  if (antHead.length !== cw * ch) { antHead = new Int32Array(cw * ch); creHead = new Int32Array(cw * ch); }
  antHead.fill(-1); creHead.fill(-1);
  if (antNext.length < S.ants.length) antNext = new Int32Array(S.ants.length * 2);
  if (creNext.length < S.creatures.length) creNext = new Int32Array(S.creatures.length * 2 + 16);
  antById.clear(); creById.clear(); strById.clear();
  for (let i = 0; i < S.ants.length; i++) {
    const a = S.ants[i];
    antById.set(a.id, a);
    if (a.layer !== 0 || a.hp <= 0) continue;
    const c = cellOf(a.x, a.y);
    antNext[i] = antHead[c]; antHead[c] = i;
  }
  for (let i = 0; i < S.creatures.length; i++) {
    const c0 = S.creatures[i];
    creById.set(c0.id, c0);
    if (c0.hp <= 0) continue;
    const c = cellOf(c0.x, c0.y);
    creNext[i] = creHead[c]; creHead[c] = i;
  }
  for (const s of S.structures) strById.set(s.id, s);
}
function cellOf(x: number, y: number) {
  const cx = Math.max(0, Math.min(cw - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(ch - 1, Math.floor(y / CELL)));
  return cy * cw + cx;
}

/** Itera hormigas de superficie dentro de r. Si fn devuelve true se detiene. */
export function eachAnt(x: number, y: number, r: number, fn: (a: Ant) => boolean | void) {
  const S = G.S;
  const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(cw - 1, Math.floor((x + r) / CELL));
  const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(ch - 1, Math.floor((y + r) / CELL));
  const r2 = r * r;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    for (let i = antHead[cy * cw + cx]; i !== -1; i = antNext[i]) {
      const a = S.ants[i];
      if (!a || a.hp <= 0) continue;
      const dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r2 && fn(a)) return;
    }
  }
}
export function eachCreature(x: number, y: number, r: number, fn: (c: Creature) => boolean | void) {
  const S = G.S;
  const x0 = Math.max(0, Math.floor((x - r - 40) / CELL)), x1 = Math.min(cw - 1, Math.floor((x + r + 40) / CELL));
  const y0 = Math.max(0, Math.floor((y - r - 40) / CELL)), y1 = Math.min(ch - 1, Math.floor((y + r + 40) / CELL));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    for (let i = creHead[cy * cw + cx]; i !== -1; i = creNext[i]) {
      const c = S.creatures[i];
      if (!c || c.hp <= 0) continue;
      const dx = c.x - x, dy = c.y - y;
      const rr = r + 0;
      if (dx * dx + dy * dy <= rr * rr && fn(c)) return;
    }
  }
}
