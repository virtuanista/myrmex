// Economía de colonias: capacidades, cría, investigación, experiencia.
import { CASTES, CasteId, CHAMBERS, Cost, ResKey, TECH_BY_ID, DECORS } from './defs';
import { AS, Ant, Colony, G, NTS, Res, Role, TS, newId } from './state';
import { emit } from '../core/bus';
import { randomPointIn, chamberById } from './nest';
import { clamp } from '../core/util';

export const hasTech = (c: Colony, id: string) => c.techs.includes(id);
export const player = () => G.S.colonies[0];

export function canAfford(res: Res, cost: Cost): boolean {
  for (const k in cost) if ((res as any)[k] < ((cost as any)[k] || 0) - 1e-6) return false;
  return true;
}
export function pay(res: Res, cost: Cost) { for (const k in cost) (res as any)[k] -= (cost as any)[k] || 0; }
export function refund(res: Res, cost: Cost, f = 1) { for (const k in cost) (res as any)[k] += ((cost as any)[k] || 0) * f; }
export function scaleCost(cost: Cost, m: number): Cost { const o: Cost = {}; for (const k in cost) (o as any)[k] = Math.ceil((cost as any)[k] * m); return o; }

// ------------------ Caché por paso ------------------
export interface ColCache {
  total: number; byCaste: Record<string, number>; military: number; roles: Record<Role, number>;
  inChamber: Map<number, number>; surface: number; nest: number;
}
export const CC: ColCache[] = [];
export function rebuildCache() {
  const S = G.S;
  for (let i = 0; i < S.colonies.length; i++) {
    CC[i] = { total: 0, byCaste: {}, military: 0, roles: { forage: 0, dig: 0, inside: 0, army: 0 }, inChamber: new Map(), surface: 0, nest: 0 };
  }
  for (const a of S.ants) {
    const c = CC[a.col];
    if (!c) continue;
    c.total++;
    c.byCaste[a.caste] = (c.byCaste[a.caste] || 0) + 1;
    if (CASTES[a.caste].military) c.military++;
    c.roles[a.role]++;
    if (a.layer === 0) c.surface++; else c.nest++;
    if (a.layer === 1 && a.st === AS.NestWork && a.task.startsWith('ch')) {
      const id = +a.task.slice(2);
      c.inChamber.set(id, (c.inChamber.get(id) || 0) + 1);
    }
  }
}

// ------------------ Estadísticas derivadas del jugador ------------------
export interface PStats {
  popCap: number; foodCap: number; leafCap: number; broodCap: number; milCap: number;
  beauty: number; prestige: number; labRate: number; fungusLv: number; regen: number; eggInterval: number;
  satellites: number;
}
let pstatsCache: PStats | null = null; let pstatsTick = -1;
export function pstats(): PStats {
  const S = G.S;
  if (pstatsCache && pstatsTick === S.tick) return pstatsCache;
  const p = player();
  let popCap = 22, foodCap = 200, broodCap = 5, milCap = 5, beauty = 0, labRate = 0, fungusLv = 0, regen = 1, hallMul = 1;
  let royalLv = 1;
  for (const c of S.nest.chambers) {
    if (c.state !== 1) continue;
    const L = c.level;
    switch (c.type) {
      case 'royal': royalLv = L; popCap += (L - 1) * 6; break;
      case 'dorm': popCap += [18, 34, 55][L - 1]; break;
      case 'storage': foodCap += [250, 550, 1000][L - 1]; break;
      case 'nursery': broodCap += [10, 18, 28][L - 1]; break;
      case 'barracks': milCap += [12, 26, 45][L - 1]; break;
      case 'lab': labRate += [0.35, 0.8, 1.4][L - 1]; break;
      case 'fungus': fungusLv += L; break;
      case 'midden': regen += [0.5, 1, 1.6][L - 1]; break;
      case 'hall': hallMul = [1.5, 2, 2.6][L - 1]; break;
    }
    for (const d of c.decor) beauty += DECORS.find(x => x.id === d.k)?.beauty ?? 0;
  }
  const sats = S.structures.filter(s => s.col === 0 && s.type === 'satellite' && s.built).length;
  popCap += sats * 16;
  for (const s of S.structures) if (s.col === 0 && s.type === 'banner' && s.built) beauty += 6;
  if (hasTech(p, 'deepstore')) foodCap = Math.round(foodCap * 1.5);
  if (hasTech(p, 'art')) beauty *= 1.25;
  beauty *= hallMul;
  const prestige = Math.min(0.6, beauty / 500);
  let eggRate = 1 + [0, 0.35, 0.7][royalLv - 1] + (hasTech(p, 'fertility') ? 0.3 : 0) + prestige * 0.5 + sats * 0.15;
  pstatsCache = {
    popCap, foodCap, leafCap: Math.round(foodCap * 0.75), broodCap, milCap, beauty: Math.round(beauty), prestige,
    labRate, fungusLv, regen, eggInterval: 7.5 / eggRate, satellites: sats,
  };
  pstatsTick = S.tick;
  return pstatsCache;
}
export function invalidatePStats() { pstatsCache = null; }

export function resCap(col: Colony, k: ResKey): number {
  if (!col.isPlayer) return 99999;
  const ps = pstats();
  if (k === 'food') return ps.foodCap;
  if (k === 'leaves') return ps.leafCap;
  return 1e9;
}

/** Añade recursos con límite de capacidad. Devuelve lo realmente añadido */
export function addRes(col: Colony, k: ResKey, amt: number, x = 0, y = 0, layer = 0, silent = false): number {
  const cap = resCap(col, k);
  const before = col.res[k];
  if (before < cap) col.res[k] = Math.min(cap, before + amt);
  const got = Math.max(0, col.res[k] - before);
  if (col.isPlayer) {
    G.S.stats.gathered[k] += got;
    if (!silent) emit('gain', { k, amt: got, lost: amt - got, x, y, layer });
  }
  return got;
}

// ------------------ Experiencia ------------------
export const xpFor = (lvl: number) => Math.floor(60 * Math.pow(lvl, 1.65));
export function addXP(amt: number) {
  const p = player();
  p.xp += amt;
  let guard = 0;
  while (p.xp >= xpFor(p.level) && guard++ < 10) {
    p.xp -= xpFor(p.level);
    p.level++;
    const reward = { food: 30 + p.level * 12, amber: 2 + Math.floor(p.level / 2) };
    p.res.food = Math.min(resCap(p, 'food'), p.res.food + reward.food);
    p.res.amber += reward.amber;
    emit('levelup', { level: p.level, reward });
  }
}

// ------------------ Hormigas ------------------
export function antMaxHp(col: Colony, caste: CasteId, rank = 0) {
  let hp = CASTES[caste].hp;
  if (hasTech(col, 'longevity')) hp *= 1.3;
  if (!col.isPlayer) hp *= 0.85 + 0.15 * aiMul(col);
  hp *= 1 + rank * 0.15;
  return Math.round(hp);
}
export function aiMul(col: Colony) { return col.ai.power; }

export function spawnAnt(col: number, caste: CasteId, layer: 0 | 1, x: number, y: number): Ant {
  const c = G.S.colonies[col];
  const def = CASTES[caste];
  const mhp = antMaxHp(c, caste);
  const a: Ant = {
    id: newId(), col, caste, layer, x, y, px: x, py: y, a: Math.random() * Math.PI * 2,
    hp: mhp, mhp, st: AS.Idle, role: def.military ? 'army' : 'forage', carry: null, ca: 0,
    tx: x, ty: y, tid: 0, order: null, t: 0, ph: Math.random() * 10, str: 0, cd: 0,
    rank: 0, kills: 0, age: 0, task: '', stuck: 0, lastHit: -99, sx: x, sy: y,
    tk: 0, gx: NaN, gy: NaN, w: 0, mem: 0,
  };
  if (caste === 'scout') a.role = 'forage';
  G.S.ants.push(a);
  return a;
}

export function antCarry(col: Colony, caste: CasteId) {
  let c = CASTES[caste].carry;
  if (hasTech(col, 'mandibles') && (caste === 'worker' || caste === 'scout')) c += 1;
  if (hasTech(col, 'mandibles') && caste === 'harvester') c += 1;
  return c;
}

// ------------------ Cría (jugador) ------------------
export function broodCount() { return G.S.nest.brood.length; }

function nextCaste(p: Colony): CasteId | null {
  const ps = pstats();
  const cc = CC[0];
  // si faltan obreras, intercalar obreras con la cola
  const workers = (cc.byCaste.worker || 0) + G.S.nest.brood.filter(b => b.caste === 'worker').length;
  if (p.autoWorkers && p.queue.length && workers < Math.max(10, cc.total * 0.4)) {
    (p as any)._alt = ((p as any)._alt || 0) + 1;
    if ((p as any)._alt % 2 === 0) return 'worker';
  }
  if (p.queue.length) {
    const c = p.queue[0];
    const def = CASTES[c];
    const milBrood = G.S.nest.brood.filter(b => CASTES[b.caste].military).length;
    if (!(def.military && cc.military + milBrood >= ps.milCap)) return c;
    // la cola está bloqueada por el límite militar: buscar algo no militar en la cola
    const alt = p.queue.find(q => !CASTES[q].military);
    if (alt) return alt;
  }
  if (p.autoWorkers) return 'worker';
  return null;
}

export function updatePlayerColony(dt: number) {
  const S = G.S;
  const p = player();
  if (!p.alive) return;
  const ps = pstats();
  const cc = CC[0];
  const n = S.nest;
  const prestigeMul = 1 + ps.prestige;

  // Puesta
  p.layTimer += dt;
  if (p.layTimer >= ps.eggInterval) {
    const caste = nextCaste(p);
    const totalPop = cc.total + n.brood.length;
    if (caste && n.brood.length < ps.broodCap && totalPop < ps.popCap) {
      const cost = CASTES[caste].cost;
      if (canAfford(p.res, cost)) {
        pay(p.res, cost);
        { const qi = p.queue.indexOf(caste); if (qi >= 0) p.queue.splice(qi, 1); }
        layEgg(caste);
        p.layTimer = 0;
      } else p.layTimer = ps.eggInterval * 0.8;
    } else p.layTimer = ps.eggInterval * 0.85;
  }

  // Desarrollo de la cría
  const nursesNeed = Math.max(1, n.brood.length / 3);
  let nurses = 0;
  for (const c of n.chambers) if (c.type === 'nursery' || c.type === 'royal') nurses += cc.inChamber.get(c.id) || 0;
  const care = 0.55 + 0.45 * clamp(nurses / nursesNeed, 0, 1);
  const nurseMul = (hasTech(p, 'nurses') ? 1.35 : 1) * prestigeMul;
  for (let i = n.brood.length - 1; i >= 0; i--) {
    const b = n.brood[i];
    const prevStage = stageOf(b.prog);
    b.prog += (dt / CASTES[b.caste].time) * care * nurseMul;
    const st = stageOf(b.prog);
    if (st !== prevStage && st < 3) emit('broodStage', { b, stage: st });
    if (b.prog >= 1) {
      n.brood.splice(i, 1);
      hatch(b.caste, b.x, b.y);
    }
  }

  // Satélites: ponen obreras en superficie
  for (const s of S.structures) {
    if (s.col !== 0 || s.type !== 'satellite' || !s.built) continue;
    s.t += dt;
    if (s.t > 22 / prestigeMul) {
      s.t = 0;
      if (cc.total + n.brood.length < ps.popCap && p.res.food >= 10) {
        p.res.food -= 10;
        const a = spawnAnt(0, 'worker', 0, s.x + (Math.random() - 0.5) * 10, s.y + (Math.random() - 0.5) * 10);
        a.st = AS.Search;
        S.stats.hatched.worker = (S.stats.hatched.worker || 0) + 1;
        emit('hatch', { caste: 'worker', x: a.x, y: a.y, layer: 0 });
      }
    }
  }

  // Cámaras productivas
  for (const c of n.chambers) {
    if (c.state !== 1) { continue; }
    c.t += dt;
    const w = cc.inChamber.get(c.id) || 0;
    if (c.type === 'lab') {
      const rate = [0.35, 0.8, 1.4][c.level - 1];
      const eff = 0.15 + 0.85 * clamp(w / (c.level + 1), 0, 1);
      p.res.science += rate * eff * prestigeMul * dt;
    } else if (c.type === 'fungus') {
      const rate = [0.6, 1.2, 2][c.level - 1];
      const conv = [2.2, 2.4, 2.6][c.level - 1];
      const eff = 0.2 + 0.8 * clamp(w / (c.level + 1), 0, 1);
      const use = Math.min(p.res.leaves, rate * eff * dt);
      if (use > 0 && p.res.food < ps.foodCap) {
        p.res.leaves -= use;
        p.res.food = Math.min(ps.foodCap, p.res.food + use * conv * prestigeMul);
        S.stats.gathered.food += use * conv;
      }
    } else if (c.type === 'midden') {
      p.res.soil += 0.05 * c.level * dt;
    }
  }

  // Investigación
  if (p.research) {
    const t = TECH_BY_ID[p.research];
    const dur = 18 + t.tier * 12;
    p.researchProg += dt / dur * prestigeMul;
    if (p.researchProg >= 1) {
      p.techs.push(p.research);
      const id = p.research;
      p.research = null; p.researchProg = 0;
      S.stats.techs++;
      invalidatePStats();
      if (id === 'chitin' || id === 'longevity') for (const a of S.ants) if (a.col === 0) { const m = antMaxHp(p, a.caste, a.rank); a.hp += m - a.mhp; a.mhp = m; }
      emit('research', { id });
      addXP(30 + t.tier * 20);
    }
  }

  // Regeneración
  const regenMul = ps.regen * (hasTech(p, 'longevity') ? 1.5 : 1);
  for (const a of S.ants) {
    if (a.col !== 0 || a.hp >= a.mhp) continue;
    if (S.time - a.lastHit < 6) continue;
    a.hp = Math.min(a.mhp, a.hp + (a.layer === 1 ? 1.2 : 0.25) * regenMul * dt);
  }
  if (p.queenHp < p.queenMhp) p.queenHp = Math.min(p.queenMhp, p.queenHp + 2 * dt);
  // Guardia real de emergencia
  const nestS = S.structures.find(s => s.id === p.nestId);
  (p as any)._emg = ((p as any)._emg ?? 0) - dt;
  if (nestS && nestS.hp < nestS.mhp * 0.4 && (p as any)._emg <= 0) {
    (p as any)._emg = 100;
    const k = 5 + Math.floor(S.time / 400);
    for (let i = 0; i < Math.min(14, k); i++) {
      const a = spawnAnt(0, i % 4 === 3 && hasTech(p, 'majors') ? 'major' : 'soldier', 0, nestS.x + (Math.random() - 0.5) * 20, nestS.y + (Math.random() - 0.5) * 20);
      a.st = AS.Guard;
    }
    emit('royalGuard', { x: nestS.x, y: nestS.y });
  }
  // registro de máximos
  if (cc.total > S.stats.maxPop) S.stats.maxPop = cc.total;
  if (cc.military > S.stats.maxArmy) S.stats.maxArmy = cc.military;
}

export function stageOf(prog: number) { return prog < 0.3 ? 0 : prog < 0.75 ? 1 : prog < 1 ? 2 : 3; }

function layEgg(caste: CasteId) {
  const n = G.S.nest;
  const nurseries = n.chambers.filter(c => c.type === 'nursery' && c.state === 1);
  let ch = nurseries.length ? nurseries[Math.floor(Math.random() * nurseries.length)] : n.chambers.find(c => c.type === 'royal')!;
  // equilibrar: la guardería con menos cría
  if (nurseries.length > 1) {
    let best = Infinity;
    for (const c of nurseries) { const k = n.brood.filter(b => b.ch === c.id).length / c.level; if (k < best) { best = k; ch = c; } }
  }
  const pt = randomPointIn(ch, 1);
  const b = { id: newId(), caste, prog: 0, ch: ch.id, x: pt.x, y: pt.y, fed: 0 };
  n.brood.push(b);
  emit('egg', { b, x: n.queenX, y: n.queenY });
}

function hatch(caste: CasteId, x: number, y: number) {
  const S = G.S;
  const a = spawnAnt(0, caste, 1, x, y);
  S.stats.hatched[caste] = (S.stats.hatched[caste] || 0) + 1;
  if (caste === 'princess') { a.role = 'army'; a.st = AS.ToExit; a.task = 'exit'; }
  else if (CASTES[caste].military) { a.st = AS.ToExit; a.task = 'exit'; }
  else { a.st = AS.NestWalk; a.task = ''; assignRole(a); }
  emit('hatch', { caste, x, y, layer: 1, ant: a });
  addXP(caste === 'worker' ? 3 : 6);
}

/** Elige el rol de una obrera según la distribución deseada */
export function assignRole(a: Ant) {
  const p = G.S.colonies[a.col];
  if (a.caste === 'scout') { a.role = 'forage'; return; }
  if (a.caste === 'harvester') { a.role = 'forage'; return; }
  if (CASTES[a.caste].military) { a.role = 'army'; return; }
  const cc = CC[a.col];
  const workers = (cc.byCaste.worker || 0) + 1;
  const want = { forage: p.alloc.forage * workers, dig: p.alloc.dig * workers, inside: p.alloc.inside * workers };
  const have = { forage: cc.roles.forage - (cc.byCaste.scout || 0) - (cc.byCaste.harvester || 0), dig: cc.roles.dig, inside: cc.roles.inside };
  let best: Role = 'forage', bestDef = -Infinity;
  for (const r of ['forage', 'dig', 'inside'] as const) {
    const def = want[r] - have[r];
    if (def > bestDef) { bestDef = def; best = r; }
  }
  a.role = best;
}

/** Reequilibrio periódico de roles */
export function rebalanceRoles() {
  const S = G.S;
  const p = player();
  const cc = CC[0];
  if (!cc) return;
  const workers = S.ants.filter(a => a.col === 0 && a.caste === 'worker');
  const N = workers.length;
  if (!N) return;
  const want = { forage: Math.round(p.alloc.forage * N), dig: Math.round(p.alloc.dig * N), inside: 0 };
  want.inside = N - want.forage - want.dig;
  const have = { forage: 0, dig: 0, inside: 0 } as Record<'forage' | 'dig' | 'inside', number>;
  for (const a of workers) if (a.role !== 'army') have[a.role as 'forage']++;
  // mover como mucho 3 por llamada para cambios suaves
  let moves = 3;
  for (const a of workers) {
    if (moves <= 0) break;
    if (a.order) continue;
    const r = a.role as 'forage' | 'dig' | 'inside';
    if (have[r] > want[r]) {
      // buscar rol deficitario
      for (const r2 of ['forage', 'dig', 'inside'] as const) {
        if (have[r2] < want[r2]) {
          // no sacar a quien carga algo
          if (a.carry) break;
          have[r]--; have[r2]++; a.role = r2; moves--;
          if (a.layer === 1) { a.st = AS.NestWalk; a.task = ''; }
          break;
        }
      }
    }
  }
}

export function chamberUpgradeCost(type: string, level: number): Cost | null {
  const d = CHAMBERS[type as keyof typeof CHAMBERS];
  if (level >= d.maxLevel) return null;
  return d.cost[level];
}
export function chamberName(id: number) { const c = chamberById(id); return c ? CHAMBERS[c.type].name : ''; }

export function surfaceToTile(x: number) { return Math.floor(x / TS); }
export function nestPx(t: number) { return t * NTS + NTS / 2; }
