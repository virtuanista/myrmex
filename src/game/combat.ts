// Combate: daño, muertes, botín, proyectiles y búsqueda de objetivos.
import { BUILDINGS, CASTES, CREATURES } from './defs';
import { AS, Ant, Creature, G, ResNode, Structure, newId } from './state';
import { antById, creById, strById, eachAnt, eachCreature } from './spatial';
import { addRes, addXP, antMaxHp, hasTech, pstats, CC } from './colony';
import { emit } from '../core/bus';
import { invalidateHome } from './nav';
import { dist2 } from '../core/util';

export interface Tgt { x: number; y: number; r: number; col: number; alive: boolean }

export function targetInfo(tk: number, id: number): Tgt | null {
  if (tk === 0) {
    const a = antById.get(id);
    if (!a || a.hp <= 0 || a.layer !== 0) return null;
    return { x: a.x, y: a.y, r: 4 * CASTES[a.caste].size, col: a.col, alive: true };
  }
  if (tk === 1) {
    const c = creById.get(id);
    if (!c || c.hp <= 0) return null;
    return { x: c.x, y: c.y, r: CREATURES[c.type].size * 0.5, col: -1, alive: true };
  }
  const s = strById.get(id);
  if (!s || s.hp <= 0) return null;
  return { x: s.x, y: s.y, r: BUILDINGS[s.type].radius, col: s.col, alive: true };
}

export function hostileCreature(c: Creature) {
  const d = CREATURES[c.type];
  return d.behavior === 'hunter' || c.angry > 0;
}

/** Potencia de ataque de una hormiga considerando tecnologías y contexto */
export function antDamage(a: Ant): number {
  const S = G.S;
  const col = S.colonies[a.col];
  let d = CASTES[a.caste].dmg;
  if (a.caste !== 'acid' && hasTech(col, 'sharp')) d *= 1.25;
  if (col.isPlayer) {
    const bar = S.nest.chambers.filter(c => c.type === 'barracks' && c.state === 1);
    let best = 0;
    for (const b of bar) best = Math.max(best, b.level);
    d *= 1 + [0, 0, 0.1, 0.2][best];
  } else d *= 0.8 + 0.2 * col.ai.power;
  if (hasTech(col, 'swarm')) {
    let n = 0;
    eachAnt(a.x, a.y, 40, o => { if (o.col === a.col && o !== a) n++; return n >= 10; });
    d *= 1 + n * 0.04;
  }
  if (hasTech(col, 'veteran')) d *= 1 + a.rank * 0.15;
  return d;
}
export function antArmor(a: Ant): number {
  const col = G.S.colonies[a.col];
  return CASTES[a.caste].armor + (hasTech(col, 'chitin') ? 1 : 0);
}

/** Aplica daño a un objetivo. srcCol = colonia atacante (-1 criatura) */
export function damage(tk: number, id: number, dmg: number, srcCol: number, src: Ant | null, pierce = false) {
  const S = G.S;
  if (tk === 0) {
    const a = antById.get(id);
    if (!a || a.hp <= 0) return;
    const real = Math.max(dmg * 0.15, dmg - (pierce ? 0 : antArmor(a)));
    a.hp -= real; a.lastHit = S.time;
    if (srcCol >= 0) a.tid = a.tid || 0;
    emit('hit', { x: a.x, y: a.y, dmg: real, layer: a.layer, victimCol: a.col, tk: 0 });
    if (a.hp <= 0) killAnt(a, srcCol, src);
    else onAntAttacked(a, srcCol, src);
  } else if (tk === 1) {
    const c = creById.get(id);
    if (!c || c.hp <= 0) return;
    const real = Math.max(dmg * 0.15, dmg - (pierce ? 0 : CREATURES[c.type].armor));
    c.hp -= real;
    if (src) { c.angry = 8; if (c.tk !== 0 || !c.tid || Math.random() < 0.15) { c.tk = 0; c.tid = src.id; } }
    emit('hit', { x: c.x, y: c.y, dmg: real, layer: 0, victimCol: -1, tk: 1 });
    if (c.hp <= 0) killCreature(c, srcCol, src);
  } else {
    const s = strById.get(id);
    if (!s || s.hp <= 0) return;
    damageStructure(s, dmg, srcCol);
  }
}

function onAntAttacked(a: Ant, srcCol: number, src: Ant | null) {
  const S = G.S;
  const col = S.colonies[a.col];
  const military = CASTES[a.caste].military;
  // llamar refuerzos
  const callR = hasTech(col, 'alarm') ? 170 : 90;
  if (S.time - (a as any)._alarm > 2 || !(a as any)._alarm) {
    (a as any)._alarm = S.time;
    const attackerId = src ? src.id : 0;
    const tk = src ? 0 : 1;
    let tid = attackerId;
    if (!src) {
      // buscar criatura atacante cercana
      let best = 1e9;
      eachCreature(a.x, a.y, 60, c => { const d = dist2(c.x, c.y, a.x, a.y); if (hostileCreature(c) && d < best) { best = d; tid = c.id; } });
    }
    if (tid) eachAnt(a.x, a.y, callR, o => {
      if (o.col !== a.col || o === a) return;
      if (CASTES[o.caste].military && (o.st === AS.Guard || o.st === AS.Idle || (o.st === AS.Move && o.order?.am))) {
        o.st = AS.Attack; o.tid = tid; o.tk = tk;
      }
    });
    if (a.col === 0) emit('alarm', { x: a.x, y: a.y });
  }
  if (!military && a.st !== AS.Flee && a.st !== AS.Attack) {
    if (hasTech(col, 'alarm') && a.hp > a.mhp * 0.5 && src) { a.st = AS.Attack; a.tid = src.id; a.tk = 0; }
    else if (!a.order) { a.st = AS.Flee; a.t = 1.6; (a as any).fx = src ? src.x : a.x + Math.random() - 0.5; (a as any).fy = src ? src.y : a.y + Math.random() - 0.5; }
  } else if (military && src && (a.st === AS.Guard || a.st === AS.Idle || (a.st === AS.Attack && a.tk === 2) || (a.st === AS.Move && a.order?.am))) {
    // responder a quien nos ataca (y luego retomar el objetivo)
    a.st = AS.Attack; a.tid = src.id; a.tk = 0;
  }
}

export function killAnt(a: Ant, srcCol: number, src: Ant | null) {
  const S = G.S;
  a.hp = 0; a.st = AS.Dead;
  if (a.col === 0) { S.stats.deaths++; const db = ((S as any)._deathBy ??= {}); const k = a.caste + '<' + (srcCol >= 0 ? 'col' + srcCol : ((S as any)._lastSrc || '?')); db[k] = (db[k] || 0) + 1; }
  if (srcCol === 0 && a.col !== 0) {
    S.stats.antKills++;
    addXP(CASTES[a.caste].military ? 4 : 2);
  }
  if (src) creditKill(src);
  if (a.layer === 0) {
    const amt = Math.round(3 * CASTES[a.caste].size * CASTES[a.caste].size);
    if (a.carry) dropNode('carcass', a.x, a.y, amt + a.ca, 90);
    else dropNode('carcass', a.x, a.y, amt, 90);
  }
  emit('death', { x: a.x, y: a.y, col: a.col, caste: a.caste, layer: a.layer, ant: true });
}

function creditKill(src: Ant) {
  const S = G.S;
  src.kills++;
  const col = S.colonies[src.col];
  if (hasTech(col, 'veteran')) {
    const nr = Math.min(3, Math.floor(src.kills / 3));
    if (nr > src.rank) {
      src.rank = nr;
      const m = antMaxHp(col, src.caste, nr);
      src.hp += m - src.mhp; src.mhp = m;
      if (src.col === 0) emit('rankup', { x: src.x, y: src.y, rank: nr });
    }
  }
}

export function killCreature(c: Creature, srcCol: number, src: Ant | null) {
  const S = G.S;
  const d = CREATURES[c.type];
  c.hp = 0;
  if (src) creditKill(src);
  dropNode('carcass', c.x, c.y, d.loot.food || 10, 150, Math.max(10, d.size * 0.7));
  if (srcCol >= 0) {
    const col = S.colonies[srcCol];
    if (d.loot.amber) addRes(col, 'amber', d.loot.amber, c.x, c.y, 0);
    if (d.loot.leaves) addRes(col, 'leaves', d.loot.leaves, c.x, c.y, 0);
    if (d.loot.soil) addRes(col, 'soil', d.loot.soil, c.x, c.y, 0);
    if (srcCol === 0) {
      S.stats.kills[c.type] = (S.stats.kills[c.type] || 0) + 1;
      if (c.boss || c.type === 'mantis') S.stats.bosses++;
      addXP(d.xp);
    }
  }
  emit('death', { x: c.x, y: c.y, col: -1, type: c.type, layer: 0, killerCol: srcCol, boss: !!c.boss || c.type === 'mantis' });
}

export function dropNode(kind: 'carcass', x: number, y: number, amt: number, decay: number, r = 7) {
  const n: ResNode = { id: newId(), kind, x, y, amt, max: amt, regen: 0, r, v: Math.random(), decay };
  G.S.nodes.push(n);
  return n;
}

export function damageStructure(s: Structure, dmg: number, srcCol: number) {
  const S = G.S;
  if (s.hp <= 0) return;
  const real = Math.max(1, dmg * (s.built ? 1 : 1.5));
  if (s.type === 'nest' && s.col === 0 && s.hp <= 1) {
    // la entrada ha caído: la reina sufre
    const p = S.colonies[0];
    // los atacantes entran de uno en uno: daño a la reina limitado por segundo
    const sec = Math.floor(S.time);
    if ((p as any)._qs !== sec) { (p as any)._qs = sec; (p as any)._qd = 0; }
    const allow = Math.max(0, 8 - (p as any)._qd);
    const q = Math.min(allow, real * 0.2);
    (p as any)._qd += q;
    p.queenHp -= q;
    emit('queenHit', { dmg: real });
    if (p.queenHp <= 0 && S.over === 0) { p.queenHp = 0; p.alive = false; S.over = 2; emit('defeat', {}); }
    return;
  }
  s.hp -= real;
  // las tropas cercanas acuden a defender
  if (S.time - ((s as any)._lh ?? -99) > 3 || !(s as any)._called || S.time - (s as any)._called > 3) {
    (s as any)._called = S.time;
    for (const a of S.ants) {
      if (a.col !== s.col || a.layer !== 0 || !CASTES[a.caste].military || a.order) continue;
      if (a.st !== AS.Guard && a.st !== AS.Idle) continue;
      if ((a.x - s.x) ** 2 + (a.y - s.y) ** 2 > 650 * 650) continue;
      a.order = { k: 'move', x: s.x + (Math.random() - 0.5) * 40, y: s.y + (Math.random() - 0.5) * 40, id: 0, am: true };
      a.st = AS.Move;
    }
  }
  (s as any)._lh = S.time;
  emit('hit', { x: s.x + (Math.random() - 0.5) * 16, y: s.y + (Math.random() - 0.5) * 10, dmg: real, layer: 0, victimCol: s.col, tk: 2 });
  if (s.col === 0) emit('structHit', { s });
  if (s.hp <= 0) {
    if (s.type === 'nest') { s.hp = 1; emit('nestBreached', { s }); return; }
    destroyStructure(s, srcCol);
  }
}

export function destroyStructure(s: Structure, srcCol: number) {
  const S = G.S;
  s.hp = 0;
  const i = S.structures.indexOf(s);
  if (i >= 0) S.structures.splice(i, 1);
  invalidateHome(s.col);
  emit('structDestroyed', { s, srcCol });
  if (s.type === 'rivalnest') {
    const col = S.colonies[s.col];
    col.alive = false; col.deadAt = S.time;
    // eliminar resto de estructuras rivales
    for (let j = S.structures.length - 1; j >= 0; j--) if (S.structures[j].col === s.col) S.structures.splice(j, 1);
    if (srcCol === 0) {
      S.stats.coloniesDestroyed++;
      addRes(S.colonies[0], 'amber', 60, s.x, s.y, 0);
      addRes(S.colonies[0], 'food', 300, s.x, s.y, 0);
      addRes(S.colonies[0], 'science', 80, s.x, s.y, 0);
      addXP(400);
    }
    dropNode('carcass', s.x, s.y, 400, 400, 22);
    emit('colonyDestroyed', { col, x: s.x, y: s.y, by: srcCol });
  }
}

/** Busca el enemigo más cercano para una hormiga */
export function findEnemy(a: Ant, r: number, prey = false, structures = false): { tk: number; id: number } | null {
  const S = G.S;
  let best = r * r, res: { tk: number; id: number } | null = null;
  eachAnt(a.x, a.y, r, o => {
    if (o.col === a.col || o.hp <= 0) return;
    const d = dist2(o.x, o.y, a.x, a.y);
    if (d < best) { best = d; res = { tk: 0, id: o.id }; }
  });
  eachCreature(a.x, a.y, r, c => {
    if (!prey && !hostileCreature(c)) return;
    if (c.type === 'aphid' && a.col === 0) return;
    const d = dist2(c.x, c.y, a.x, a.y) * (hostileCreature(c) ? 0.7 : 1.3);
    if (d < best) { best = d; res = { tk: 1, id: c.id }; }
  });
  if (!res && structures) {
    for (const s of S.structures) {
      if (s.col === a.col || s.hp <= 0) continue;
      const rr = r + BUILDINGS[s.type].radius;
      const d = dist2(s.x, s.y, a.x, a.y);
      if (d < rr * rr && d < best * 4) { best = d; res = { tk: 2, id: s.id }; }
    }
  }
  return res;
}

// ------------------ Proyectiles ------------------
export function fireAcid(x: number, y: number, tk: number, id: number, dmg: number, col: number, splash = 0, pierce = false) {
  const t = targetInfo(tk, id);
  if (!t) return;
  const d = Math.hypot(t.x - x, t.y - y);
  G.S.projectiles.push({ x, y, sx: x, sy: y, tx: t.x, ty: t.y, t: 0, dur: 0.25 + d / 260, dmg, col, tid: id, tk, splash, pierce });
  emit('shoot', { x, y, col });
}

export function updateProjectiles(dt: number) {
  const S = G.S;
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    p.t += dt;
    const t = targetInfo(p.tk, p.tid);
    if (t) { p.tx = t.x; p.ty = t.y; }
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k;
    if (k >= 1) {
      S.projectiles.splice(i, 1);
      if (t) damage(p.tk, p.tid, p.dmg, p.col, null, p.pierce);
      emit('splash', { x: p.tx, y: p.ty, col: p.col });
      if (p.splash > 0) {
        eachAnt(p.tx, p.ty, 26, o => { if (o.col !== p.col && o.id !== p.tid) damage(0, o.id, p.dmg * p.splash, p.col, null, p.pierce); });
        eachCreature(p.tx, p.ty, 26, c => { if (c.id !== p.tid && hostileCreature(c)) damage(1, c.id, p.dmg * p.splash, p.col, null, p.pierce); });
      }
    }
  }
}

/** Torres defensivas */
export function updateTowers(dt: number) {
  const S = G.S;
  for (const s of S.structures) {
    if (s.built && s.hp < s.mhp && S.time - ((s as any)._lh ?? -99) > 10) { const lim = s.type === 'rivalnest' ? s.mhp * 0.6 : s.mhp; if (s.hp < lim) s.hp = Math.min(lim, s.hp + (s.type === 'nest' ? 4 : 2) * dt); }
    const nestDef = s.type === 'nest' || s.type === 'rivalnest' || s.type === 'satellite';
    if ((s.type !== 'tower' && !nestDef) || !s.built) continue;
    s.cd -= dt;
    if (s.cd > 0) continue;
    const col = S.colonies[s.col];
    if (!col || !col.alive) continue;
    const R = nestDef ? 120 : 200;
    let best = R * R, tk = -1, tid = 0;
    eachAnt(s.x, s.y, R, o => { if (o.col !== s.col) { const d = dist2(o.x, o.y, s.x, s.y); if (d < best) { best = d; tk = 0; tid = o.id; } } });
    eachCreature(s.x, s.y, R, c => { if (hostileCreature(c)) { const d = dist2(c.x, c.y, s.x, s.y); if (d < best) { best = d; tk = 1; tid = c.id; } } });
    if (tk >= 0) {
      const corr = hasTech(col, 'corrosive');
      if (nestDef) { fireAcid(s.x, s.y - 6, tk, tid, s.type === 'rivalnest' ? 4 + 2 * col.ai.power : 7, s.col, 0, false); s.cd = 1.4; }
      else { fireAcid(s.x, s.y - 18, tk, tid, 11, s.col, corr ? 0.5 : 0, corr); s.cd = 1.1; }
    } else s.cd = 0.3;
  }
}

export function militaryCount(col: number) { return CC[col]?.military ?? 0; }
export function playerMilCap() { return pstats().milCap; }
