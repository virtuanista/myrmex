// Bucle principal de simulación.
import { BUILDINGS, CASTES } from './defs';
import { DT, G, TS } from './state';
import { WORLD } from './world';
import { CC, rebuildCache, rebalanceRoles, updatePlayerColony, addXP, hasTech } from './colony';
import { rebuildSpatial } from './spatial';
import { assignBuilders, decayPher, rebuildKnown, rebuildNodeGrid, rebuildNodeIndex, updateAnts } from './ants';
import { updateCreatures, populateCreatures } from './creatures';
import { updateProjectiles, updateTowers } from './combat';
import { updateAI } from './ai';
import { updateEvents } from './events';
import { updateQuests } from './quests';
import { updateTime, isNight } from './time';
import { updateNestFields } from './nest';
import { emit } from '../core/bus';

// Visibilidad actual (no se guarda)
export let VIS = new Uint8Array(0);
export let TERR = new Int8Array(0);     // propietario del territorio por casilla (-1 nadie)
let terrKey = '';

export function updateFog(sideEffects = true) {
  const S = G.S;
  const W = WORLD.W;
  if (VIS.length !== W.w * W.h) VIS = new Uint8Array(W.w * W.h);
  VIS.fill(0);
  const night = isNight() && !hasTech(S.colonies[0], 'nightvision');
  const stamp = (x: number, y: number, r: number) => {
    const cx = Math.floor(x / TS), cy = Math.floor(y / TS), rt = Math.ceil(r / TS);
    const r2 = (r / TS) * (r / TS);
    for (let dy = -rt; dy <= rt; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= W.h) continue;
      for (let dx = -rt; dx <= rt; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= W.w) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = yy * W.w + xx;
        VIS[i] = 1;
        if (!S.fog[i] && sideEffects) { S.fog[i] = 1; newlyExplored++; }
      }
    }
  };
  let newlyExplored = 0;
  const vm = night ? 0.7 : 1;
  for (const a of S.ants) {
    if (a.col !== 0 || a.layer !== 0) continue;
    stamp(a.x, a.y, CASTES[a.caste].vision * 0.55 * vm);
  }
  for (const s of S.structures) if (s.col === 0) stamp(s.x, s.y, BUILDINGS[s.type].vision * vm);
  if (!sideEffects) return;
  if (newlyExplored > 0) addXP(newlyExplored * 0.02);
  // zonas
  for (const z of S.zones) {
    if (z.found) continue;
    if (S.fog[Math.floor(z.y) * W.w + Math.floor(z.x)]) {
      z.found = true; S.stats.zones++;
      addXP(30);
      S.colonies[0].res.amber += 2;
      emit('discover', { name: z.name, x: z.x * TS, y: z.y * TS, kind: 'zone' });
    }
  }
  // lugares legendarios
  for (const n of S.nodes) {
    if (!n.poi || n.found) continue;
    const i = Math.floor(n.y / TS) * W.w + Math.floor(n.x / TS);
    if (VIS[i]) { n.found = true; S.stats.poi++; addXP(50); emit('discover', { name: n.name, x: n.x, y: n.y, kind: 'poi' }); }
  }
}

export function updateTerritory(force = false) {
  const S = G.S;
  const W = WORLD.W;
  const key = S.structures.map(s => s.id + ':' + (s.built ? 1 : 0) + ':' + s.type).join(',');
  if (!force && key === terrKey && TERR.length === W.w * W.h) return false;
  terrKey = key;
  TERR = new Int8Array(W.w * W.h).fill(-1);
  const best = new Float32Array(W.w * W.h).fill(1e9);
  for (const s of S.structures) {
    if (!s.built) continue;
    const r = BUILDINGS[s.type].territory;
    const cx = Math.floor(s.x / TS), cy = Math.floor(s.y / TS);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W.w || y >= W.h) continue;
      const d = (dx * dx + dy * dy) / (r * r);
      if (d > 1) continue;
      const i = y * W.w + x;
      if (d < best[i]) { best[i] = d; TERR[i] = s.col; }
    }
  }
  return true;
}
export function territoryShare(col: number) {
  let n = 0;
  for (let i = 0; i < TERR.length; i++) if (TERR[i] === col) n++;
  return n / Math.max(1, TERR.length);
}

function updateNodes(dt: number) {
  const S = G.S;
  const p = S.colonies[0];
  const drought = S.weather.kind === 'heat';
  for (let i = S.nodes.length - 1; i >= 0; i--) {
    const n = S.nodes[i];
    if (n.regen > 0 && n.amt < n.max && !drought) {
      let r = n.regen;
      if (n.kind === 'amber' && hasTech(p, 'resin')) r *= 3;
      n.amt = Math.min(n.max, n.amt + r * dt);
    }
    if (n.decay !== undefined) {
      n.decay -= dt;
      if (n.decay <= 0 || n.amt <= 0) { S.nodes.splice(i, 1); continue; }
    } else if (n.amt <= 0 && n.regen <= 0) { S.nodes.splice(i, 1); continue; }
  }
  // tras la lluvia: setas
  if ((S.weather.kind === 'rain' || S.weather.kind === 'storm') && Math.random() < dt * 0.05) {
    const W = WORLD.W;
    const x = (2 + Math.random() * (W.w - 4)) * TS, y = (2 + Math.random() * (W.h - 4)) * TS;
    if (W.pass[Math.floor(y / TS) * W.w + Math.floor(x / TS)]) S.nodes.push({ id: S.nextId++, kind: 'mushroom', x, y, amt: 30, max: 30, regen: 0, r: 7, v: Math.random(), decay: 300 });
  }
}

let acc = 0;
export function stepSim() {
  const S = G.S;
  S.tick++;
  S.time += DT;
  const t = S.tick;
  rebuildCache();
  rebuildSpatial();
  rebuildNodeIndex();
  if (t % 10 === 1) rebuildNodeGrid();
  if (t % 30 === 2) rebuildKnown();
  updateTime(DT);
  updatePlayerColony(DT);
  updateAI(DT);
  updateNestFields();
  updateAnts(DT);
  updateCreatures(DT);
  updateProjectiles(DT);
  updateTowers(DT);
  if (t % 6 === 0) decayPher(6);
  if (t % 5 === 0) updateFog();
  if (t % 30 === 3) updateNodes(1);
  if (t % 30 === 4) assignBuilders();
  if (t % 45 === 5) rebalanceRoles();
  if (t % 30 === 6) populateCreatures(1);
  if (t % 30 === 7) updateTerritory();
  updateEvents(DT);
  if (t % 15 === 8) updateQuests();
  if (t % 900 === 9) {
    S.stats.history.push({ t: Math.round(S.time), pop: CC[0].total, army: CC[0].military, food: Math.round(S.colonies[0].res.food) });
    if (S.stats.history.length > 400) S.stats.history.splice(0, S.stats.history.length - 400);
  }
  // victoria
  if (S.over === 0 && S.cfg.mode === 'conquest' && S.cfg.rivals > 0 && S.colonies.every(c => c.isPlayer || !c.alive)) {
    S.over = 1; emit('victory', {});
  }
  if ((S as any)._stormT === undefined) (S as any)._stormT = 0;
  if (S.weather.kind === 'storm') (S as any)._stormT = 1;
  else if ((S as any)._stormT === 1) { (S as any)._stormSurvived = true; (S as any)._stormT = 2; }
}

/** Avanza la simulación según el tiempo real transcurrido. Devuelve alfa de interpolación */
export function advance(realDt: number): number {
  const S = G.S;
  if (S.paused || S.over === 2) return 1;
  acc += Math.min(0.25, realDt) * S.speed;
  let steps = 0;
  while (acc >= DT && steps < 12) { stepSim(); acc -= DT; steps++; }
  if (steps >= 12) acc = 0;
  S.played += realDt;
  return acc / DT;
}
