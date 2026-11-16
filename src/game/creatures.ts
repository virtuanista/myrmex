// Criaturas del ecosistema: presas, neutrales y depredadores.
import { CREATURES, CreatureType, DIFFICULTIES } from './defs';
import { Creature, G, ResNode, TS, newId } from './state';
import { WORLD, passableAt } from './world';
import { eachAnt, eachCreature } from './spatial';
import { damage, targetInfo } from './combat';
import { TAU, angDiff, clamp, dist, dist2, rnd } from '../core/util';
import { isNight } from './time';
import { hasTech } from './colony';
import { emit } from '../core/bus';

export function spawnCreature(type: CreatureType, x: number, y: number, boss = false): Creature {
  const d = CREATURES[type];
  const hpMul = boss ? 2.2 : 1;
  const c: Creature = {
    id: newId(), type, x, y, px: x, py: y, a: Math.random() * TAU,
    hp: d.hp * hpMul, mhp: d.hp * hpMul, st: 0, t: 0, cd: 0, ph: Math.random() * 10,
    tx: x, ty: y, tid: 0, tk: 0, hx: x, hy: y, angry: 0, prod: Math.random() * 20, boss,
  };
  G.S.creatures.push(c);
  return c;
}

function cMove(c: Creature, ang: number, spd: number, dt: number) {
  const d = angDiff(c.a, ang);
  const mt = 4 * dt;
  c.a += d > mt ? mt : d < -mt ? -mt : d;
  const s = spd * dt;
  let nx = c.x + Math.cos(c.a) * s, ny = c.y + Math.sin(c.a) * s;
  if (!passableAt(nx, ny)) {
    let ok = false;
    for (const o of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
      const a2 = c.a + o;
      const tx = c.x + Math.cos(a2) * s, ty = c.y + Math.sin(a2) * s;
      if (passableAt(tx, ty)) { c.a = a2; nx = tx; ny = ty; ok = true; break; }
    }
    if (!ok) { c.a += Math.PI * 0.7; return; }
  }
  const W = WORLD.W;
  c.x = clamp(nx, 8, W.w * TS - 8); c.y = clamp(ny, 8, W.h * TS - 8);
  c.ph += s * 0.3;
}

export function updateCreatures(dt: number) {
  const S = G.S;
  const night = isNight();
  for (const c of S.creatures) {
    if (c.hp <= 0) continue;
    c.px = c.x; c.py = c.y;
    const d = CREATURES[c.type];
    c.cd -= dt; c.t -= dt;
    if (c.angry > 0) c.angry -= dt;
    // nocturnos se esconden de día
    if (d.night && !night) {
      c.hp -= dt * 4; // se "retiran"
      if (c.hp <= 0) { c.hp = 0; (c as any).gone = true; }
      continue;
    }
    // pulgones: producen melaza
    if (c.type === 'aphid') {
      c.prod -= dt;
      if (c.prod <= 0) {
        c.prod = 22 + Math.random() * 12;
        let owner = -1;
        for (const s of S.structures) {
          if (s.type !== 'aphidfarm' || !s.built) continue;
          if (dist2(s.x, s.y, c.x, c.y) < 140 * 140) { owner = s.col; break; }
        }
        const boost = owner >= 0 && hasTech(S.colonies[owner], 'herding') ? 2 : 1;
        const near = S.nodes.filter(n => n.kind === 'honeydew' && dist2(n.x, n.y, c.x, c.y) < 30 * 30).length;
        if (near < 2) {
          const n: ResNode = { id: newId(), kind: 'honeydew', x: c.x + rnd(-10, 10), y: c.y + rnd(-10, 10), amt: 6 * boost, max: 6 * boost, regen: 0, r: 4, v: Math.random(), decay: 120 };
          S.nodes.push(n);
        }
      }
    }
    const hostile = d.behavior === 'hunter' || c.angry > 0;
    // buscar presa
    if (hostile && (c.tid === 0 || c.t <= 0)) {
      c.t = 0.6;
      let best = d.aggro * d.aggro * (night ? 1.2 : 1), bid = 0, bk = 0;
      if (c.angry > 0 && c.tid) {
        const t = targetInfo(c.tk, c.tid);
        if (t) { best = 0; bid = c.tid; bk = c.tk; }
      }
      if (best > 0) {
        eachAnt(c.x, c.y, Math.max(d.aggro, 60), a => {
          const dd = dist2(a.x, a.y, c.x, c.y);
          if (dd < best) { best = dd; bid = a.id; bk = 0; }
        });
      }
      if (c.type === 'ladybug' && !bid) {
        eachCreature(c.x, c.y, 90, o => { if (o.type === 'aphid') { bid = o.id; bk = 1; return true; } });
      }
      c.tid = bid; c.tk = bk;
    }
    if (c.type === 'ladybug' && c.angry <= 0 && !c.tid && Math.random() < dt * 0.5) {
      eachCreature(c.x, c.y, 90, o => { if (o.type === 'aphid') { c.tid = o.id; c.tk = 1; return true; } });
    }
    let target = c.tid ? targetInfo(c.tk, c.tid) : null;
    if (c.tid && !target) c.tid = 0;
    // correa a la madriguera
    if (target && d.behavior === 'hunter' && (c.type === 'spider' || c.type === 'mantis') && dist2(c.x, c.y, c.hx, c.hy) > 380 * 380) { c.tid = 0; target = null; c.st = 2; }
    if (target) {
      const dd = dist(c.x, c.y, target.x, target.y);
      const reach = d.range + target.r;
      if (dd > reach) cMove(c, Math.atan2(target.y - c.y, target.x - c.x), d.speed * (c.type === 'spider' ? 1.15 : 1), dt);
      else {
        c.a += angDiff(c.a, Math.atan2(target.y - c.y, target.x - c.x)) * 0.3;
        if (c.cd <= 0 && d.dmg > 0) {
          c.cd = d.cd;
          const mul = (c.boss ? 1.4 : 1) * (0.8 + 0.2 * DIFFICULTIES[S.cfg.difficulty].creatures);
          (S as any)._lastSrc = c.type;
          damage(c.tk, c.tid, d.dmg * mul, -1, null);
          (S as any)._lastSrc = '';
          (c as any).bite = 0.25;
          if (c.type === 'mantis' || c.type === 'spider') {
            // golpe en área
            eachAnt(target.x, target.y, c.type === 'mantis' ? 24 : 12, a => { if (a.id !== c.tid) damage(0, a.id, d.dmg * mul * 0.4, -1, null); });
          }
        }
      }
      continue;
    }
    // vagar
    if (c.st === 2 || (c.type === 'spider' || c.type === 'mantis') && dist2(c.x, c.y, c.hx, c.hy) > 200 * 200) {
      cMove(c, Math.atan2(c.hy - c.y, c.hx - c.x), d.speed * 0.6, dt);
      if (dist2(c.x, c.y, c.hx, c.hy) < 60 * 60) c.st = 0;
      continue;
    }
    // presas huyen de hormigas
    if (d.behavior === 'passive' && c.type !== 'aphid') {
      let fx = 0, fy = 0, n = 0;
      eachAnt(c.x, c.y, 50, a => { fx += a.x; fy += a.y; n++; return n > 4; });
      if (n > 0) {
        const ang = Math.atan2(c.y - fy / n, c.x - fx / n);
        cMove(c, ang, d.speed * (c.type === 'cricket' ? 3 : 1.4), dt);
        continue;
      }
    }
    if (c.type === 'aphid' && Math.random() > 0.3) continue;
    c.ph += dt * 0.5;
    const wander = Math.sin(c.ph * 0.37 + c.id) * 1.2;
    if (c.type === 'cricket' && Math.random() < dt * 0.15) { c.a += rnd(-2, 2); cMove(c, c.a, d.speed * 6, dt * 3); continue; }
    cMove(c, c.a + wander * dt * 4, d.speed * 0.5, dt);
  }
  // eliminar muertas
  for (let i = S.creatures.length - 1; i >= 0; i--) if (S.creatures[i].hp <= 0) S.creatures.splice(i, 1);
}

/** Mantiene la población del ecosistema */
export function populateCreatures(dt: number, initial = false) {
  const S = G.S;
  const W = WORLD.W;
  const area = (W.w * W.h) / 10000;
  const dens = [0.6, 1, 1.5][S.cfg.creatures] * DIFFICULTIES[S.cfg.difficulty].creatures;
  const day = S.time / 420;
  const night = isNight();
  const want: Partial<Record<CreatureType, number>> = {
    aphid: Math.round(14 * area),
    caterpillar: Math.round(4 * area),
    cricket: Math.round(5 * area),
    snail: Math.round(2.5 * area),
    ladybug: Math.round(2 * area),
    beetle: Math.round(2.5 * area * dens),
    spider: Math.min(WORLD.W.lairs.length, Math.round(WORLD.W.lairs.length * Math.min(1, 0.4 + day * 0.15) * dens)),
    centipede: night ? Math.round(2 * area * dens * Math.min(1, day * 0.3)) : 0,
  };
  const counts: Record<string, number> = {};
  for (const c of S.creatures) counts[c.type] = (counts[c.type] || 0) + 1;
  for (const k in want) {
    const type = k as CreatureType;
    const need = (want[type] || 0) - (counts[type] || 0);
    const spawnN = initial ? need : need > 0 && Math.random() < dt * 0.08 ? 1 : 0;
    for (let i = 0; i < spawnN; i++) {
      const pos = type === 'spider' ? spiderSpot() : randomWildSpot(type === 'centipede' ? 600 : 420);
      if (!pos) continue;
      if (type === 'aphid') {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < n; j++) spawnCreature('aphid', pos.x + rnd(-14, 14), pos.y + rnd(-14, 14));
        i += n - 1;
      } else {
        const c = spawnCreature(type, pos.x, pos.y);
        if (type === 'spider') { c.hx = pos.x; c.hy = pos.y; }
      }
    }
  }
  // jefe mantis
  if (initial && S.cfg.size !== 'small') {
    const pos = randomWildSpot(900);
    if (pos) { const m = spawnCreature('mantis', pos.x, pos.y); m.hx = pos.x; m.hy = pos.y; m.name = 'La Viuda Verde'; }
  }
}

function spiderSpot(): { x: number; y: number } | null {
  const S = G.S;
  const L = WORLD.W.lairs;
  const free = L.filter(l => !S.creatures.some(c => c.type === 'spider' && dist2(c.hx, c.hy, l.x * TS, l.y * TS) < 100 * 100));
  if (!free.length) return null;
  const l = free[Math.floor(Math.random() * free.length)];
  return { x: l.x * TS, y: l.y * TS };
}

export function randomWildSpot(minDist: number): { x: number; y: number } | null {
  const S = G.S;
  const W = WORLD.W;
  for (let k = 0; k < 30; k++) {
    const x = rnd(3, W.w - 3) * TS, y = rnd(3, W.h - 3) * TS;
    if (!passableAt(x, y)) continue;
    let ok = true;
    for (const s of S.structures) if (dist2(s.x, s.y, x, y) < minDist * minDist) { ok = false; break; }
    if (ok) return { x, y };
  }
  return null;
}

export function spawnBossNear(type: CreatureType, x: number, y: number, name: string) {
  const c = spawnCreature(type, x, y, true);
  c.name = name; c.hx = x; c.hy = y;
  emit('bossSpawn', { c });
  return c;
}
