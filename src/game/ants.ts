// Comportamiento de las hormigas en superficie y en el hormiguero.
import { BUILDINGS, CASTES, CHAMBERS, NODE_INFO, ResKey } from './defs';
import { AS, Ant, Chamber, Colony, G, NTS, PS, ResNode, Structure, TS } from './state';
import { WORLD, passableAt } from './world';
import { clearLine, fieldTo, fieldValue, flowDir, homeField, invalidateHome, isDropoff } from './nav';
import { CC, addRes, addXP, antCarry, assignRole, hasTech, invalidatePStats, pstats, resCap } from './colony';
import { eachCreature } from './spatial';
import { antDamage, damage, findEnemy, fireAcid, targetInfo } from './combat';
import { chamberById, checkChamberDone, markNestDirty, nestField, nestFieldAt, nestFlowDir, nestOpenAt, randomPointIn, tileHardness } from './nest';
import { emit } from '../core/bus';
import { TAU, angDiff, clamp, dist, dist2 } from '../core/util';
import { isNight } from './time';

const TURN = 7.5;

// ------------------ Feromonas ------------------
export let PW = 0, PH = 0;
export function initPher() {
  PW = Math.ceil((WORLD.W.w * TS) / PS); PH = Math.ceil((WORLD.W.h * TS) / PS);
}
export function pherIdx(x: number, y: number) {
  const px = Math.floor(x / PS), py = Math.floor(y / PS);
  if (px < 0 || py < 0 || px >= PW || py >= PH) return -1;
  return py * PW + px;
}
function pherAt(col: number, x: number, y: number) {
  const i = pherIdx(x, y);
  return i < 0 ? 0 : G.S.pher[col][i];
}
function layPher(col: number, x: number, y: number, amt: number) {
  const i = pherIdx(x, y);
  if (i < 0) return;
  const p = G.S.pher[col];
  p[i] = Math.min(1, p[i] + amt);
}
export function decayPher(steps: number) {
  const S = G.S;
  const rain = S.weather.kind === 'rain' || S.weather.kind === 'storm';
  for (let c = 0; c < S.pher.length; c++) {
    const col = S.colonies[c];
    if (!col) continue;
    let k = hasTech(col, 'strongpher') ? 0.9965 : 0.993;
    if (rain) k -= 0.01;
    k = Math.pow(k, steps);
    const p = S.pher[c];
    for (let i = 0; i < p.length; i++) if (p[i] > 0.001) p[i] *= k; else p[i] = 0;
  }
  const w = S.wear;
  const kw = Math.pow(0.99985, steps);
  for (let i = 0; i < w.length; i++) if (w[i] > 0.001) w[i] *= kw;
}

// ------------------ Rejilla de nodos ------------------
const NCELL = 128;
let nodeGrid: ResNode[][] = [];
let ngw = 0, ngh = 0;
export function rebuildNodeGrid() {
  ngw = Math.ceil((WORLD.W.w * TS) / NCELL); ngh = Math.ceil((WORLD.W.h * TS) / NCELL);
  nodeGrid = Array.from({ length: ngw * ngh }, () => []);
  for (const n of G.S.nodes) {
    if (n.amt <= 0) continue;
    const cx = clamp(Math.floor(n.x / NCELL), 0, ngw - 1), cy = clamp(Math.floor(n.y / NCELL), 0, ngh - 1);
    nodeGrid[cy * ngw + cx].push(n);
  }
}
const nodeById = new Map<number, ResNode>();
export function rebuildNodeIndex() { nodeById.clear(); for (const n of G.S.nodes) nodeById.set(n.id, n); }
export function getNode(id: number) { return nodeById.get(id); }

function wantRes(col: Colony, k: ResKey): number {
  if (k === 'science' || k === 'soil') return 0;
  const cap = resCap(col, k);
  if (col.res[k] >= cap - 0.5) return 0;
  let w = col.prio[k as 'food'];
  if (col.isPlayer && k === 'food' && col.res.food < 30) w *= 2;
  return w;
}

function senseNode(a: Ant, r: number): ResNode | null {
  const col = G.S.colonies[a.col];
  const x0 = clamp(Math.floor((a.x - r) / NCELL), 0, ngw - 1), x1 = clamp(Math.floor((a.x + r) / NCELL), 0, ngw - 1);
  const y0 = clamp(Math.floor((a.y - r) / NCELL), 0, ngh - 1), y1 = clamp(Math.floor((a.y + r) / NCELL), 0, ngh - 1);
  let best: ResNode | null = null, bestS = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    for (const n of nodeGrid[cy * ngw + cx]) {
      if (n.amt < 1) continue;
      const d = dist(n.x, n.y, a.x, a.y) - n.r;
      if (d > r) continue;
      const w = wantRes(col, NODE_INFO[n.kind].res);
      if (w <= 0) continue;
      const s = w / (d + 25);
      if (s > bestS) { bestS = s; best = n; }
    }
  }
  return best;
}

/** Nodos conocidos por colonia, recalculados cada segundo (reclutamiento) */
const known: ResNode[][] = [];
export function rebuildKnown() {
  const S = G.S;
  const fog = S.fog, W = WORLD.W;
  for (const col of S.colonies) {
    const list: ResNode[] = [];
    const home = S.structures.find(s => s.id === col.nestId);
    if (!home || !col.alive) { known[col.id] = list; continue; }
    for (const n of S.nodes) {
      if (n.amt <= 0) continue;
      if (wantRes(col, NODE_INFO[n.kind].res) <= 0) continue;
      if (col.isPlayer) {
        const ti = Math.floor(n.y / TS) * W.w + Math.floor(n.x / TS);
        if (!fog[ti]) continue;
        if (dist2(n.x, n.y, home.x, home.y) > 1400 * 1400 && !S.structures.some(s => s.col === 0 && isDropoff(s.type) && dist2(n.x, n.y, s.x, s.y) < 700 * 700)) continue;
      } else if (dist2(n.x, n.y, home.x, home.y) > 650 * 650) continue;
      list.push(n);
    }
    known[col.id] = list;
  }
}
function recruitNode(a: Ant): ResNode | null {
  const list = known[a.col];
  if (!list || !list.length) return null;
  const col = G.S.colonies[a.col];
  let best: ResNode | null = null, bestS = 0;
  for (let k = 0; k < 6; k++) {
    const n = list[Math.floor(Math.random() * list.length)];
    if (n.amt < 1) continue;
    const s = wantRes(col, NODE_INFO[n.kind].res) * (0.5 + n.amt / (n.max + 1)) / (dist(n.x, n.y, a.x, a.y) + 150);
    if (s > bestS) { bestS = s; best = n; }
  }
  return best;
}

// ------------------ Velocidad y movimiento ------------------
function antSpeed(a: Ant): number {
  const S = G.S;
  const col = S.colonies[a.col];
  let s = CASTES[a.caste].speed;
  // marcha en grupo (no al combatir cuerpo a cuerpo)
  const cap = (a.order as any)?.cap;
  if (cap && a.st !== AS.Attack) s = Math.min(s, cap);
  else if (cap && a.st === AS.Attack) { const t = targetInfo(a.tk, a.tid); if (t && (t.x - a.x) ** 2 + (t.y - a.y) ** 2 > 160 * 160) s = Math.min(s, cap); }
  if (a.layer === 0) {
    const wk = S.weather.kind;
    if (wk === 'rain') s *= 0.85; else if (wk === 'storm') s *= 0.7; else if (wk === 'heat') s *= 0.9;
    if (isNight() && !hasTech(col, 'nightvision') && !CASTES[a.caste].flies) s *= 0.88;
    if (hasTech(col, 'trails')) {
      const i = pherIdx(a.x, a.y);
      if (i >= 0 && (S.wear[i] > 0.25 || S.pher[a.col][i] > 0.3)) s *= 1.25;
    }
    if (a.carry && a.layer === 0) s *= 0.92;
  } else s *= 0.85;
  if (col.isPlayer) s *= 1 + pstats().prestige * 0.25;
  else s *= 0.92 + 0.08 * col.ai.power;
  return s;
}

function moveSurf(a: Ant, desired: number, dt: number, spdMul = 1): boolean {
  const d = angDiff(a.a, desired);
  const mt = TURN * dt;
  a.a += d > mt ? mt : d < -mt ? -mt : d;
  const step = antSpeed(a) * dt * spdMul;
  let nx = a.x + Math.cos(a.a) * step, ny = a.y + Math.sin(a.a) * step;
  const flies = CASTES[a.caste].flies;
  if (!flies && !passableAt(nx, ny)) {
    let ok = false;
    const offs = [0.5, -0.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4];
    const sgn = (a.id & 1) ? 1 : -1;
    for (const o of offs) {
      const ang = a.a + o * sgn;
      const tx = a.x + Math.cos(ang) * step, ty = a.y + Math.sin(ang) * step;
      if (passableAt(tx, ty)) { a.a = ang; nx = tx; ny = ty; ok = true; break; }
    }
    if (!ok) { a.stuck += dt; a.a += Math.PI * 0.6; return false; }
  }
  const W = WORLD.W;
  nx = clamp(nx, 4, W.w * TS - 4); ny = clamp(ny, 4, W.h * TS - 4);
  a.x = nx; a.y = ny;
  a.ph += step * 0.45;
  if (step > 0.2) a.stuck = Math.max(0, a.stuck - dt * 0.5);
  // desgaste del camino
  const i = pherIdx(a.x, a.y);
  if (i >= 0 && !flies) { const w = G.S.wear; w[i] = Math.min(1, w[i] + 0.0016); }
  return true;
}

/** Ir hacia un punto usando línea directa o campo de flujo */
function goTo(a: Ant, x: number, y: number, dt: number, useField = true): number {
  const d = dist(a.x, a.y, x, y);
  let ang = Math.atan2(y - a.y, x - a.x);
  if (!CASTES[a.caste].flies && useField && d > 40) {
    (a as any)._lc = ((a as any)._lc || 0) - dt;
    if ((a as any)._lc <= 0) { (a as any)._los = clearLine(a.x, a.y, x, y); (a as any)._lc = 0.6; }
    if (!(a as any)._los || a.stuck > 0.4) {
      const f = fieldTo(x, y);
      const fa = flowDir(f, a.x, a.y);
      if (!isNaN(fa)) ang = fa;
    }
  }
  moveSurf(a, ang + (Math.sin(a.ph * 0.7 + a.id) * 0.12), dt);
  return d;
}

function goHome(a: Ant, dt: number): boolean {
  const f = homeField(a.col);
  const v = fieldValue(f, a.x, a.y);
  if (v === 0) return true;
  const ang = flowDir(f, a.x, a.y);
  if (isNaN(ang)) {
    // fuera del campo: ir hacia el nido directamente
    const n = G.S.structures.find(s => s.id === G.S.colonies[a.col].nestId);
    if (n) moveSurf(a, Math.atan2(n.y - a.y, n.x - a.x), dt);
    if (n && dist2(a.x, a.y, n.x, n.y) < 22 * 22) return true;
    return false;
  }
  moveSurf(a, ang + Math.sin(a.ph * 0.5 + a.id) * 0.2, dt);
  return false;
}

function nearestDrop(a: Ant): Structure | null {
  let best: Structure | null = null, bd = 1e12;
  for (const s of G.S.structures) {
    if (s.col !== a.col || !s.built || !isDropoff(s.type)) continue;
    const d = dist2(s.x, s.y, a.x, a.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------ Actualización principal ------------------
export function updateAnts(dt: number) {
  const S = G.S;
  const ants = S.ants;
  for (let i = 0; i < ants.length; i++) {
    const a = ants[i];
    if (a.hp <= 0) continue;
    a.px = a.x; a.py = a.y;
    a.age += dt; a.cd -= dt;
    const col = S.colonies[a.col];
    if (!col.alive) { a.hp -= dt * 2.5; if (a.hp <= 0) { a.st = AS.Dead; emit('death', { x: a.x, y: a.y, col: a.col, caste: a.caste, layer: a.layer, ant: true }); } }
    if (a.layer === 0) surfaceAnt(a, col, dt);
    else nestAnt(a, col, dt);
  }
  // eliminar muertas
  let j = 0;
  for (let i = 0; i < ants.length; i++) if (ants[i].hp > 0) ants[j++] = ants[i];
  ants.length = j;
}

function scanTimer(a: Ant, dt: number, period: number): boolean {
  (a as any)._sc = ((a as any)._sc ?? Math.random() * period) - dt;
  if ((a as any)._sc <= 0) { (a as any)._sc = period; return true; }
  return false;
}

function guardPoint(a: Ant, col: Colony): { x: number; y: number } {
  if (!isNaN(a.gx)) return { x: a.gx, y: a.gy };
  const S = G.S;
  let bx: number, by: number;
  if (col.rally) { bx = col.rally.x; by = col.rally.y; }
  else {
    const n = S.structures.find(s => s.id === col.nestId);
    bx = n ? n.x : a.x; by = n ? n.y + 40 : a.y;
  }
  const ang = a.id * 2.39996, r = 18 + (a.id % 9) * 5;
  return { x: bx + Math.cos(ang) * r, y: by + Math.sin(ang) * r };
}

function surfaceAnt(a: Ant, col: Colony, dt: number) {
  const def = CASTES[a.caste];
  const S = G.S;
  // roles internos del jugador vuelven al nido
  if (col.isPlayer && (a.role === 'dig' || a.role === 'inside') && !a.order && a.st !== AS.Return && a.st !== AS.Attack && a.st !== AS.Flee && a.st !== AS.Build) {
    a.st = AS.Return;
  }
  switch (a.st) {
    case AS.Idle:
    case AS.Guard: {
      if (def.military || a.caste === 'princess' || a.caste === 'queen') {
        const gp = guardPoint(a, col);
        const d = dist(a.x, a.y, gp.x, gp.y);
        if (d > 14) goTo(a, gp.x, gp.y, dt);
        else {
          a.w -= dt;
          if (a.w <= 0) { a.w = 1 + Math.random() * 3; a.a += (Math.random() - 0.5) * 2; }
          if (a.w > 2.2) moveSurf(a, a.a, dt, 0.25);
        }
        if (def.military && scanTimer(a, dt, 0.45)) {
          const e = findEnemy(a, def.vision * (isNight() && !hasTech(col, 'nightvision') ? 0.6 : 0.85));
          if (e) { a.st = AS.Attack; a.tk = e.tk; a.tid = e.id; }
          else if (Math.random() < 0.25) {
            // cazar presas cercanas al puesto de guardia
            const pr = findEnemy(a, 150, true);
            if (pr && pr.tk === 1) {
              const c = S.creatures.find(x => x.id === pr.id);
              if (c && c.type !== 'aphid' && c.type !== 'ladybug' && c.type !== 'beetle' && dist2(c.x, c.y, gp.x, gp.y) < 220 * 220) { a.st = AS.Attack; a.tk = 1; a.tid = c.id; }
            }
          }
        }
      } else {
        a.st = AS.Search; a.t = 0;
      }
      break;
    }
    case AS.Search: {
      a.t += dt;
      if (a.caste === 'scout' && a.role === 'forage' && !a.carry) { a.st = AS.Explore; a.t = 0; break; }
      if (scanTimer(a, dt, 0.3)) {
        const n = senseNode(a, def.vision * (a.caste === 'scout' ? 0.6 : 0.45));
        if (n) { a.st = AS.ToNode; a.tid = n.id; a.t = 0; break; }
        if (a.t > 5 && Math.random() < 0.25) {
          const r = recruitNode(a);
          if (r) { a.st = AS.ToNode; a.tid = r.id; a.t = 0; break; }
        }
        // peligro
        if (dangerNear(a)) break;
      }
      // seguir rastro
      const sd = 14, sa = 0.6;
      const l = pherAt(a.col, a.x + Math.cos(a.a - sa) * sd, a.y + Math.sin(a.a - sa) * sd);
      const c = pherAt(a.col, a.x + Math.cos(a.a) * sd, a.y + Math.sin(a.a) * sd);
      const r = pherAt(a.col, a.x + Math.cos(a.a + sa) * sd, a.y + Math.sin(a.a + sa) * sd);
      let des = a.a + (Math.random() - 0.5) * 1.6;
      const m = Math.max(l, c, r);
      if (m > 0.03) {
        // los rastros apuntan alejándose del nido: seguir el gradiente hacia mayor distancia al hogar
        if (m === l) des = a.a - sa * 0.8; else if (m === r) des = a.a + sa * 0.8; else des = a.a;
      }
      moveSurf(a, des, dt, 0.95);
      const limit = col.isPlayer ? 75 : 60;
      if (a.t > limit) { a.st = AS.Return; a.t = 0; }
      break;
    }
    case AS.Explore: {
      a.t += dt;
      if (isNaN(a.tx) || a.t > 14 || a.stuck > 1.2 || dist2(a.x, a.y, a.tx, a.ty) < 30 * 30) pickExploreTarget(a, col);
      moveSurf(a, Math.atan2(a.ty - a.y, a.tx - a.x) + Math.sin(a.ph * 0.3) * 0.25, dt);
      if (scanTimer(a, dt, 0.5)) dangerNear(a);
      break;
    }
    case AS.ToNode: {
      const n = getNode(a.tid);
      if (!n || n.amt < 1) { a.st = AS.Search; a.t = 0; a.mem = 0; break; }
      const d = goTo(a, n.x, n.y, dt);
      a.t += dt;
      if (d < n.r + 5) { a.st = AS.Harvest; a.w = 0.5 + Math.random() * 0.5; }
      else if (a.t > 60) { a.st = AS.Search; a.t = 0; }
      if (scanTimer(a, dt, 0.5)) dangerNear(a);
      break;
    }
    case AS.Harvest: {
      a.w -= dt;
      const n = getNode(a.tid);
      if (!n || n.amt <= 0) { a.st = AS.Search; a.t = 0; break; }
      a.a += Math.sin(S.time * 20 + a.id) * 0.1;
      if (a.w <= 0) {
        const cap = antCarry(col, a.caste);
        let take = Math.min(cap, Math.floor(n.amt));
        if (n.kind === 'amber' && hasTech(col, 'resin')) take = Math.min(Math.floor(n.amt), cap * 2);
        if (take < 1) { a.st = AS.Search; a.t = 0; break; }
        n.amt -= take;
        a.carry = NODE_INFO[n.kind].res; a.ca = take;
        a.str = 1; a.mem = n.id;
        a.st = AS.Return; a.t = 0;
        if (n.amt <= 0) onNodeDepleted(n);
        if (col.isPlayer) emit('pick', { x: a.x, y: a.y, k: a.carry });
      }
      break;
    }
    case AS.Return: {
      a.t += dt;
      if (a.carry) {
        layPher(a.col, a.x, a.y, 0.16 * a.str);
        a.str *= 0.9975;
      }
      if (goHome(a, dt)) arriveHome(a, col);
      if (a.t > 120) { a.st = AS.Search; a.t = 0; }
      break;
    }
    case AS.Flee: {
      a.t -= dt;
      const fx = (a as any).fx ?? a.x, fy = (a as any).fy ?? a.y;
      moveSurf(a, Math.atan2(a.y - fy, a.x - fx) + (Math.random() - 0.5) * 0.6, dt, 1.25);
      if (a.t <= 0) { a.st = a.carry ? AS.Return : AS.Search; a.t = 0; }
      break;
    }
    case AS.Attack: {
      const t = targetInfo(a.tk, a.tid);
      if (!t || (t.col === a.col && a.tk !== 1)) {
        // buscar otro cercano
        const e = findEnemy(a, def.military ? 90 : 50, false, !!a.order);
        if (e) { a.tk = e.tk; a.tid = e.id; break; }
        if (a.order && a.order.k === 'attack') {
          const otk = (a.order as any).tk ?? 0;
          if (targetInfo(otk, a.order.id)) { a.tk = otk; a.tid = a.order.id; break; }
          a.order = null; a.st = def.military ? AS.Guard : AS.Search; if (def.military) { a.gx = a.x; a.gy = a.y; }
          break;
        }
        a.st = a.order ? AS.Move : def.military ? AS.Guard : (a.carry ? AS.Return : AS.Search);
        break;
      }
      const d = dist(a.x, a.y, t.x, t.y);
      const reach = def.range + t.r + 3;
      // correa: no perseguir infinitamente desde la guardia
      if (!a.order && def.military) {
        const gp = guardPoint(a, col);
        if (dist2(a.x, a.y, gp.x, gp.y) > 420 * 420) { a.st = AS.Guard; break; }
      }
      if (!def.military && !a.order && d > 140) { a.st = AS.Search; break; }
      if (d > reach) {
        const off = ((a.id % 7) - 3) * 0.22;
        goTo(a, t.x + Math.cos(off) * 2, t.y + Math.sin(off) * 2, dt, true);
      } else {
        if (def.range > 30 && d < def.range * 0.5) moveSurf(a, Math.atan2(a.y - t.y, a.x - t.x), dt, 0.6);
        a.a += angDiff(a.a, Math.atan2(t.y - a.y, t.x - a.x)) * Math.min(1, dt * 10);
        if (a.cd <= 0) {
          a.cd = def.cd * (0.9 + Math.random() * 0.2);
          const dmg = antDamage(a);
          if (a.caste === 'acid') {
            const corr = hasTech(col, 'corrosive');
            fireAcid(a.x, a.y, a.tk, a.tid, dmg, a.col, corr ? 0.45 : 0, corr);
          } else {
            damage(a.tk, a.tid, dmg, a.col, a);
            (a as any).bite = 0.18;
          }
        }
      }
      break;
    }
    case AS.Move: {
      const o = a.order;
      if (!o) { a.st = def.military ? AS.Guard : AS.Search; break; }
      if (o.k === 'gather') {
        a.st = AS.ToNode; a.tid = o.id; a.order = null; a.t = 0; break;
      }
      if (o.k === 'build') { a.st = AS.Build; a.tid = o.id; a.order = null; break; }
      if (o.k === 'attack') {
        const t = targetInfo(o.id === 0 ? 0 : (o as any).tk ?? 0, o.id);
        if (!t) { a.order = null; a.st = def.military ? AS.Guard : AS.Search; a.gx = a.x; a.gy = a.y; break; }
        a.st = AS.Attack; a.tk = (o as any).tk ?? 0; a.tid = o.id; break;
      }
      if (o.k === 'found') { a.st = AS.Found; a.tid = o.id; break; }
      const d = goTo(a, o.x, o.y, dt);
      if (o.am && def.military && scanTimer(a, dt, 0.4)) {
        const e = findEnemy(a, def.vision * 0.75, false, true);
        if (e) { a.st = AS.Attack; a.tk = e.tk; a.tid = e.id; break; }
      }
      if (d < 16 || (d < 40 && a.stuck > 1)) {
        if (o.k === 'patrol' && o.x2 !== undefined) {
          const nx = o.x2!, ny = o.y2!; o.x2 = o.x; o.y2 = o.y; o.x = nx; o.y = ny; break;
        }
        a.order = null;
        if (def.military) { a.st = AS.Guard; a.gx = a.x; a.gy = a.y; }
        else { a.st = AS.Search; a.t = 0; }
      }
      break;
    }
    case AS.Build: {
      const s = G.S.structures.find(x => x.id === a.tid);
      if (!s || s.built) { a.st = AS.Search; a.t = 0; break; }
      const br = BUILDINGS[s.type].radius;
      const d = dist(a.x, a.y, s.x, s.y);
      if (d > br + 6) goTo(a, s.x + Math.cos(a.id) * br, s.y + Math.sin(a.id) * br, dt);
      else {
        a.a += Math.sin(S.time * 8 + a.id) * 0.2;
        s.prog += dt * (col.isPlayer ? 1 + pstats().prestige : 1);
        if (Math.random() < dt * 2) emit('buildTick', { x: s.x + (Math.random() - 0.5) * br, y: s.y + (Math.random() - 0.5) * br, col: a.col });
        if (s.prog >= BUILDINGS[s.type].work) completeStructure(s);
      }
      break;
    }
    case AS.Found: {
      const s = G.S.structures.find(x => x.id === a.tid);
      if (!s || s.type !== 'outpost' || !s.built) { a.st = AS.Guard; break; }
      const d = goTo(a, s.x, s.y, dt, false);
      if (d < 10) {
        s.type = 'satellite';
        s.mhp = BUILDINGS.satellite.hp; s.hp = s.mhp; s.t = 0;
        a.hp = 0; a.st = AS.Dead;
        emit('satellite', { s });
        addXP(150);
        invalidateHome(0);
      }
      break;
    }
    default:
      a.st = def.military ? AS.Guard : AS.Search;
  }
}

function dangerNear(a: Ant): boolean {
  if (CASTES[a.caste].military) return false;
  let threat = null as { x: number; y: number } | null;
  eachCreature(a.x, a.y, 55, c => {
    if (c.type === 'aphid' || c.type === 'caterpillar' || c.type === 'cricket' || c.type === 'snail') return;
    if ((c.type === 'beetle' || c.type === 'ladybug') && c.angry <= 0) return;
    threat = c; return true;
  });
  const th = threat as { x: number; y: number } | null;
  if (th) { a.st = AS.Flee; a.t = 1.4; (a as any).fx = th.x; (a as any).fy = th.y; return true; }
  return false;
}

function pickExploreTarget(a: Ant, col: Colony) {
  const S = G.S;
  const W = WORLD.W;
  let bx = NaN, by = NaN, bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const ang = Math.random() * TAU, r = 120 + Math.random() * 520;
    const x = clamp(a.x + Math.cos(ang) * r, 20, W.w * TS - 20), y = clamp(a.y + Math.sin(ang) * r, 20, W.h * TS - 20);
    const ti = Math.floor(y / TS) * W.w + Math.floor(x / TS);
    let s = Math.random() * 0.5;
    if (col.isPlayer && !S.fog[ti]) s += 2;
    if (!W.pass[ti]) s -= 3;
    s -= r / 900;
    if (s > bs) { bs = s; bx = x; by = y; }
  }
  a.tx = bx; a.ty = by; a.t = 0; a.stuck = 0;
}

function onNodeDepleted(n: ResNode) {
  if (n.regen <= 0) emit('nodeGone', { n });
}

function arriveHome(a: Ant, col: Colony) {
  const S = G.S;
  const drop = nearestDrop(a);
  if (a.carry) {
    const k = a.carry, amt = a.ca;
    if (col.isPlayer) {
      addRes(col, k, amt, drop ? drop.x : a.x, drop ? drop.y - 10 : a.y, 0);
      S.stats.delivered += amt;
      addXP(0.4 * amt);
    } else addRes(col, k, amt);
    // algunas entran al nido a almacenar (visual)
    if (col.isPlayer && drop && drop.type === 'nest' && Math.random() < 0.3) {
      enterNest(a);
      a.task = 'deposit';
      return;
    }
    a.carry = null; a.ca = 0;
    a.a += Math.PI + (Math.random() - 0.5) * 0.6;
    const mem = a.mem ? getNode(a.mem) : null;
    if (mem && mem.amt >= 1 && wantRes(col, NODE_INFO[mem.kind].res) > 0) { a.st = AS.ToNode; a.tid = mem.id; a.t = 0; }
    else { a.st = AS.Search; a.t = 0; a.mem = 0; }
  } else {
    if (col.isPlayer && drop && drop.type === 'nest') { enterNest(a); a.task = 'rest'; return; }
    a.a += Math.PI; a.st = AS.Search; a.t = 0;
  }
}

export function completeStructure(s: Structure) {
  s.built = true;
  const col = G.S.colonies[s.col];
  s.mhp = Math.round(BUILDINGS[s.type].hp * (hasTech(col, 'masonry') ? 1.5 : 1));
  s.hp = s.mhp;
  invalidateHome(s.col);
  if (s.col === 0) { G.S.stats.built++; addXP(25); }
  emit('built', { s });
}

// ------------------ Transiciones nido/superficie ------------------
export function enterNest(a: Ant) {
  const n = G.S.nest;
  a.layer = 1;
  a.x = n.ex * NTS + NTS / 2 + (Math.random() - 0.5) * 6;
  a.y = n.ey * NTS + NTS / 2;
  a.px = a.x; a.py = a.y;
  a.st = AS.NestWalk; a.task = ''; a.t = 0; a.a = Math.PI / 2;
  emit('enterNest', { a });
}
function exitNest(a: Ant, col: Colony) {
  const nest = G.S.structures.find(s => s.id === col.nestId);
  a.layer = 0;
  const ang = Math.random() * TAU;
  a.x = (nest ? nest.x : 100) + Math.cos(ang) * 8;
  a.y = (nest ? nest.y : 100) + Math.sin(ang) * 8 + 6;
  a.px = a.x; a.py = a.y;
  a.a = ang;
  a.task = '';
  if (CASTES[a.caste].military || a.caste === 'princess') { a.st = AS.Guard; }
  else if (a.role === 'forage') {
    const mem = a.mem ? getNode(a.mem) : null;
    if (mem && mem.amt > 0) { a.st = AS.ToNode; a.tid = mem.id; } else { a.st = AS.Search; }
    a.t = 0;
  } else { a.st = AS.Search; a.t = 0; }
}

// ------------------ Comportamiento dentro del nido ------------------
function nestMove(a: Ant, desired: number, dt: number, spdMul = 1): boolean {
  const d = angDiff(a.a, desired);
  const mt = TURN * 1.3 * dt;
  a.a += d > mt ? mt : d < -mt ? -mt : d;
  const step = antSpeed(a) * dt * spdMul;
  let nx = a.x + Math.cos(a.a) * step, ny = a.y + Math.sin(a.a) * step;
  if (!nestOpenAt(nx, ny)) {
    let ok = false;
    for (const o of [0.5, -0.5, 1.1, -1.1, 1.8, -1.8]) {
      const ang = a.a + o;
      const tx = a.x + Math.cos(ang) * step, ty = a.y + Math.sin(ang) * step;
      if (nestOpenAt(tx, ty)) { a.a = ang; nx = tx; ny = ty; ok = true; break; }
    }
    if (!ok) { a.stuck += dt; a.a += 1.2; return false; }
  }
  a.x = nx; a.y = ny; a.ph += step * 0.45;
  return true;
}

/** Camina por el campo indicado. Devuelve 1 llegada, 0 en camino, -1 sin camino */
function nestWalk(a: Ant, key: string, dt: number): number {
  const f = nestField(key);
  if (!f) return -1;
  const v = nestFieldAt(f, a.x, a.y);
  if (v === 0) return 1;
  if (v < 0 && !nestOpenAt(a.x, a.y)) { snapOpen(a); return 0; }
  const ang = nestFlowDir(f, a.x, a.y);
  if (isNaN(ang)) return v < 0 ? -1 : 1;
  nestMove(a, ang + Math.sin(a.ph * 0.6 + a.id) * 0.15, dt);
  return 0;
}

function snapOpen(a: Ant) {
  const n = G.S.nest;
  const x0 = Math.floor(a.x / NTS), y0 = Math.floor(a.y / NTS);
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= n.W || y >= n.H) continue;
    if (n.grid[y * n.W + x] === 1) { a.x = (x + 0.5) * NTS; a.y = (y + 0.5) * NTS; return; }
  }
  a.x = n.ex * NTS + 6; a.y = n.ey * NTS + 6;
}

function pickInside(a: Ant): Chamber | null {
  const S = G.S;
  const n = S.nest;
  const cc = CC[0];
  const p = S.colonies[0];
  let total = 0;
  const opts: { c: Chamber; w: number }[] = [];
  const hasNursery = n.chambers.some(c => c.type === 'nursery' && c.state === 1);
  for (const c of n.chambers) {
    if (c.state !== 1) continue;
    let w = 0;
    const brood = n.brood.filter(b => b.ch === c.id).length;
    switch (c.type) {
      case 'nursery': w = 1 + brood * 1.4; break;
      case 'royal': w = 2 + (hasNursery ? 0 : brood * 1.4); break;
      case 'lab': w = 4 * c.level; break;
      case 'fungus': w = p.res.leaves > 1 ? 3.5 * c.level : 0.4; break;
      case 'storage': w = 0.6; break;
      case 'midden': w = 0.8; break;
      case 'hall': w = 1.2; break;
      default: w = 0.3;
    }
    w /= 1 + (cc.inChamber.get(c.id) || 0) * 0.7;
    opts.push({ c, w }); total += w;
  }
  let r = Math.random() * total;
  for (const o of opts) { r -= o.w; if (r <= 0) return o.c; }
  return opts.length ? opts[0].c : null;
}

function nestAnt(a: Ant, col: Colony, dt: number) {
  const S = G.S;
  const n = S.nest;
  if (!col.isPlayer) { a.layer = 0; return; }
  switch (a.st) {
    case AS.ToExit: {
      const r = nestWalk(a, 'exit', dt);
      if (r === 1 || r === -1) exitNest(a, col);
      break;
    }
    case AS.NestWalk: {
      if (a.task === 'deposit') {
        // ir a la despensa más cercana (o cámara real)
        let target = (a as any)._dep as number | undefined;
        if (!target || !chamberById(target)) {
          const st = n.chambers.filter(c => c.type === 'storage' && c.state === 1);
          const royal = n.chambers.find(c => c.type === 'royal');
          const c = st.length ? st[Math.floor(Math.random() * st.length)] : royal;
          target = c ? c.id : 0;
          (a as any)._dep = target;
        }
        const r = nestWalk(a, 'ch' + target, dt);
        if (r !== 0) {
          (a as any)._dep = 0;
          const kind = a.carry; a.carry = null; a.ca = 0; a.task = '';
          emit('stored', { x: a.x, y: a.y, k: kind });
          if (a.role === 'forage') { a.st = AS.ToExit; }
        }
        break;
      }
      if (a.task === 'rest') {
        const dorms = n.chambers.filter(c => (c.type === 'dorm' || c.type === 'royal') && c.state === 1);
        const c = dorms[Math.floor(Math.random() * dorms.length)];
        a.task = c ? 'ch' + c.id : '';
        if (c) { a.st = AS.NestWalk; (a as any)._restT = 6 + Math.random() * 8; }
        break;
      }
      if (a.task.startsWith('ch')) {
        const r = nestWalk(a, a.task, dt);
        if (r === 1) { a.st = AS.NestWork; a.t = (a as any)._restT || (12 + Math.random() * 14); (a as any)._restT = 0; a.w = 0; }
        else if (r === -1) a.task = '';
        break;
      }
      if (a.task === 'dig') {
        const r = nestWalk(a, 'dig', dt);
        if (r === 1) { a.st = AS.NestDig; a.w = 0; }
        else if (r === -1) a.task = '';
        break;
      }
      // decidir
      if (a.role === 'forage' || a.role === 'army' || CASTES[a.caste].military) { a.st = AS.ToExit; break; }
      if (a.role === 'dig') {
        if (nestField('dig')) { a.task = 'dig'; }
        else { const c = pickInside(a); a.task = c ? 'ch' + c.id : ''; (a as any)._restT = 5; }
        break;
      }
      // interior
      const c = pickInside(a);
      if (c) a.task = 'ch' + c.id;
      else nestMove(a, a.a + (Math.random() - 0.5), dt, 0.5);
      break;
    }
    case AS.NestWork: {
      a.t -= dt;
      const c = chamberById(+a.task.slice(2));
      if (!c || a.t <= 0) { a.st = AS.NestWalk; a.task = ''; break; }
      if (a.w > 0) { a.w -= dt; a.a += Math.sin(S.time * 3 + a.id) * 0.02; break; }
      if (isNaN(a.tx) || dist2(a.x, a.y, a.tx, a.ty) < 16 || a.stuck > 0.6) {
        const pt = randomPointIn(c, 0.75);
        a.tx = pt.x; a.ty = pt.y; a.stuck = 0;
        a.w = Math.random() < 0.5 ? 0.4 + Math.random() * 1.6 : 0;
      }
      nestMove(a, Math.atan2(a.ty - a.y, a.tx - a.x), dt, 0.55);
      break;
    }
    case AS.NestDig: {
      // casilla designada adyacente
      const x = Math.floor(a.x / NTS), y = Math.floor(a.y / NTS);
      let ti = -1, bx = 0, by = 0;
      const cand = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      let start = (a.id + Math.floor(S.time / 3)) % 4;
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = cand[k < 4 ? (k + start) % 4 : k];
        const i = (y + dy) * n.W + (x + dx);
        if (n.dig[i] && n.grid[i] === 0) { ti = i; bx = x + dx; by = y + dy; break; }
      }
      if (ti < 0) { a.st = AS.NestWalk; a.task = 'dig'; break; }
      a.a += angDiff(a.a, Math.atan2((by + 0.5) * NTS - a.y, (bx + 0.5) * NTS - a.x)) * 0.3;
      a.ph += dt * 14;
      let rate = 0.85 * (hasTech(col, 'digging') ? 1.6 : 1) * (1 + pstats().prestige);
      n.digp[ti] += (rate * dt) / tileHardness(bx, by);
      if (Math.random() < dt * 3) emit('digTick', { x: (bx + 0.5) * NTS, y: (by + 0.5) * NTS });
      if (n.digp[ti] >= 1) digOut(ti, bx, by, a);
      break;
    }
    default:
      a.st = AS.NestWalk; a.task = '';
  }
}

function digOut(i: number, x: number, y: number, a: Ant) {
  const S = G.S;
  const n = S.nest;
  n.grid[i] = 1; n.dig[i] = 0; n.digp[i] = 0;
  const p = S.colonies[0];
  p.res.soil += 1;
  S.stats.gathered.soil += 1;
  S.stats.dug++;
  addXP(0.25);
  const t = n.treas[i];
  const px = (x + 0.5) * NTS, py = (y + 0.5) * NTS;
  if (t) {
    n.treas[i] = 0;
    S.stats.treasures++;
    const rewards: Record<number, [ResKey, number, string]> = {
      1: ['amber', 6 + Math.floor(Math.random() * 8), 'Pepita de ámbar'],
      2: ['science', 25 + Math.floor(Math.random() * 20), 'Fósil antiguo'],
      3: ['amber', 14 + Math.floor(Math.random() * 10), 'Geoda de cristal'],
      4: ['food', 15 + Math.floor(Math.random() * 15), 'Raíz dulce'],
    };
    const [k, amt, name] = rewards[t];
    addRes(p, k, amt, px, py, 1);
    addXP(8);
    emit('treasure', { x: px, y: py, name, k, amt, t });
  }
  emit('dug', { x: px, y: py });
  markNestDirty();
  // ¿completa alguna cámara?
  for (const c of n.chambers) {
    if (c.state === 0 && Math.abs(x - c.cx) <= c.rx + 1 && Math.abs(y - c.cy) <= c.ry + 1) {
      if (checkChamberDone(c)) {
        S.stats.chambers++;
        addXP(20);
        invalidatePStats();
        emit('chamberDone', { c, name: CHAMBERS[c.type].name });
      }
    }
  }
  void a;
}

/** Asigna constructoras a obras pendientes */
export function assignBuilders() {
  const S = G.S;
  for (const s of S.structures) {
    if (s.built) continue;
    let have = 0;
    for (const a of S.ants) if (a.st === AS.Build && a.tid === s.id) have++;
    const want = 4 - have;
    if (want <= 0) continue;
    const cands = S.ants.filter(a => a.col === s.col && a.layer === 0 && !CASTES[a.caste].military && a.caste !== 'princess' && !a.order && (a.st === AS.Search || a.st === AS.Explore || (a.st === AS.Return && !a.carry)) && a.caste !== 'scout');
    cands.sort((p, q) => dist2(p.x, p.y, s.x, s.y) - dist2(q.x, q.y, s.x, s.y));
    for (let k = 0; k < Math.min(want, cands.length); k++) { cands[k].st = AS.Build; cands[k].tid = s.id; }
  }
}

export { assignRole };
export function antAddsXp(v: number) { addXP(v); }
