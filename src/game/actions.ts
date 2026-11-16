// Acciones del jugador.
import { BUILDINGS, BuildingType, CASTES, CasteId, CHAMBERS, ChamberType, DECORS, TECH_BY_ID } from './defs';
import { AS, Chamber, G, Structure, TS, newId } from './state';
import { WORLD, passableAt } from './world';
import { canAfford, chamberUpgradeCost, hasTech, invalidatePStats, pay, player, refund, addXP, CC, pstats } from './colony';
import { canPlaceChamber, inEllipse, markNestDirty, placeChamber } from './nest';
import { TERR } from './sim';
import { emit } from '../core/bus';
import { dist2 } from '../core/util';
import { creById, strById } from './spatial';
import { getNode } from './ants';
import { invalidateHome } from './nav';
import { isGuest, sendCmd } from '../net/net';

export function buildingUnlocked(type: BuildingType): { ok: boolean; reason: string } {
  const p = player();
  const d = BUILDINGS[type];
  if (d.tech && !hasTech(p, d.tech)) return { ok: false, reason: 'Requiere: ' + TECH_BY_ID[d.tech].name };
  if (d.level && p.level < d.level) return { ok: false, reason: 'Requiere nivel ' + d.level };
  return { ok: true, reason: '' };
}

export function canPlaceBuilding(type: BuildingType, x: number, y: number): { ok: boolean; reason: string } {
  const S = G.S;
  const W = WORLD.W;
  const d = BUILDINGS[type];
  const u = buildingUnlocked(type);
  if (!u.ok) return u;
  if (!canAfford(player().res, d.cost)) return { ok: false, reason: 'Recursos insuficientes' };
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tx < 2 || ty < 2 || tx >= W.w - 2 || ty >= W.h - 2) return { ok: false, reason: 'Fuera del mapa' };
  if (!S.fog[ty * W.w + tx]) return { ok: false, reason: 'Zona inexplorada' };
  for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a * 0.785) * d.radius * 0.7, py = y + Math.sin(a * 0.785) * d.radius * 0.7;
    if (!passableAt(px, py)) return { ok: false, reason: 'Terreno bloqueado' };
  }
  for (const s of S.structures) {
    const m = BUILDINGS[s.type].radius + d.radius + 14;
    if (dist2(s.x, s.y, x, y) < m * m) return { ok: false, reason: 'Demasiado cerca de otra estructura' };
  }
  // debe estar en territorio propio o cerca del borde
  const own = TERR[ty * W.w + tx];
  if (own > 0) return { ok: false, reason: 'Territorio enemigo' };
  if (own !== 0) {
    let near = false;
    for (const s of S.structures) {
      if (s.col !== 0 || !s.built) continue;
      const r = (BUILDINGS[s.type].territory + 9) * TS;
      if (dist2(s.x, s.y, x, y) < r * r) { near = true; break; }
    }
    if (!near) return { ok: false, reason: 'Demasiado lejos de tu territorio' };
  }
  return { ok: true, reason: '' };
}

export function placeBuilding(type: BuildingType, x: number, y: number): Structure | null {
  const ok = canPlaceBuilding(type, x, y);
  if (!ok.ok) { emit('error', { text: ok.reason }); return null; }
  if (isGuest()) { sendCmd('placeBuilding', type, x, y); emit('placed', { s: { x, y } }); return {} as Structure; }
  const d = BUILDINGS[type];
  pay(player().res, d.cost);
  const s: Structure = { id: newId(), type, col: 0, x, y, hp: Math.round(d.hp * 0.15), mhp: d.hp, built: false, prog: 0, cd: 0, t: 0, lvl: 1 };
  G.S.structures.push(s);
  emit('placed', { s });
  return s;
}

export function cancelStructure(s: Structure) {
  if (isGuest()) { sendCmd('cancelStructure', s.id); return; }
  const S = G.S;
  if (s.col !== 0 || s.type === 'nest' || s.type === 'satellite') return;
  const i = S.structures.indexOf(s);
  if (i < 0) return;
  S.structures.splice(i, 1);
  refund(player().res, BUILDINGS[s.type].cost, s.built ? 0.4 : 0.8);
  invalidateHome(0);
  emit('demolish', { x: s.x, y: s.y, layer: 0 });
}

// ------------------ Órdenes ------------------
function formation(n: number, i: number) {
  if (i === 0) return { dx: 0, dy: 0 };
  const r = 9 * Math.sqrt(i), a = i * 2.39996;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/** Clic derecho con la selección actual */
export function commandSelected(ids: Set<number>, x: number, y: number, target: { tk: number; id: number } | null, nodeId: number, structId: number, attackMove: boolean, shift: boolean) {
  if (isGuest()) { sendCmd('command', [...ids], x, y, target, nodeId, structId, attackMove, shift); return target ? 'attack' : nodeId ? 'gather' : 'move'; }
  const S = G.S;
  const ants = S.ants.filter(a => ids.has(a.id) && a.layer === 0 && a.col === 0);
  if (!ants.length) return '';
  let kind = 'move';
  const s = structId ? strById.get(structId) : undefined;
  // princesas a montículo
  if (s && s.col === 0 && s.type === 'outpost' && s.built) {
    const pr = ants.filter(a => a.caste === 'princess');
    if (pr.length) {
      pr[0].order = { k: 'found', x: s.x, y: s.y, id: s.id, am: false };
      pr[0].st = AS.Move;
      return 'found';
    }
  }
  if (s && s.col === 0 && !s.built) {
    for (const a of ants) { if (!CASTES[a.caste].military) { a.order = { k: 'build', x: s.x, y: s.y, id: s.id, am: false }; a.st = AS.Move; } }
    kind = 'build';
  }
  let idx = 0;
  // los grupos militares marchan a la velocidad de la más lenta
  const milAnts = ants.filter(a => CASTES[a.caste].military);
  const cap = milAnts.length > 1 ? Math.min(...milAnts.map(a => CASTES[a.caste].speed)) : 0;
  for (const a of ants) {
    const mil = CASTES[a.caste].military;
    if (target && (target.tk === 0 || target.tk === 1 || target.tk === 2)) {
      const enemy = target.tk === 1 || (target.tk === 0 && S.ants.find(o => o.id === target.id)?.col !== 0) || (target.tk === 2 && s && s.col !== 0);
      if (enemy) {
        a.order = { k: 'attack', x, y, id: target.id, am: true };
        (a.order as any).tk = target.tk;
        if (mil && cap) (a.order as any).cap = cap;
        a.st = AS.Attack; a.tk = target.tk; a.tid = target.id;
        kind = 'attack';
        continue;
      }
    }
    if (nodeId && !mil && a.caste !== 'princess') {
      a.order = { k: 'gather', x, y, id: nodeId, am: false };
      a.st = AS.Move; kind = 'gather'; a.mem = nodeId;
      continue;
    }
    if (kind === 'build' && !mil) continue;
    const f = formation(ants.length, idx++);
    const o: any = { k: 'move', x: x + f.dx, y: y + f.dy, id: 0, am: mil && (attackMove || true) };
    if (shift && a.order && a.order.k === 'move') { o.k = 'patrol'; o.x2 = a.order.x; o.y2 = a.order.y; }
    if (mil && cap) o.cap = cap;
    a.order = o; a.st = AS.Move; a.gx = NaN; a.gy = NaN;
  }
  void creById; void getNode;
  return kind;
}

export function stopSelected(ids: Set<number>) {
  if (isGuest()) { sendCmd('stop', [...ids]); return; }
  for (const a of G.S.ants) if (ids.has(a.id)) { a.order = null; a.st = CASTES[a.caste].military ? AS.Guard : AS.Search; a.gx = a.x; a.gy = a.y; }
}
export function returnSelected(ids: Set<number>) {
  if (isGuest()) { sendCmd('return', [...ids]); return; }
  for (const a of G.S.ants) if (ids.has(a.id)) { a.order = null; a.gx = NaN; a.gy = NaN; a.st = CASTES[a.caste].military ? AS.Guard : AS.Return; }
}

export function setRally(x: number, y: number) {
  if (isGuest()) { sendCmd('rally', x, y); emit('rally', { x, y }); return; }
  const p = player();
  p.rally = { x, y };
  for (const a of G.S.ants) if (a.col === 0 && CASTES[a.caste].military && !a.order && a.st === AS.Guard) { a.gx = NaN; a.gy = NaN; }
  emit('rally', { x, y });
}

// ------------------ Cría ------------------
export function casteUnlocked(c: CasteId): { ok: boolean; reason: string } {
  const p = player();
  const d = CASTES[c];
  if (d.tech && !hasTech(p, d.tech)) return { ok: false, reason: 'Requiere: ' + TECH_BY_ID[d.tech].name };
  if (d.military && !G.S.nest.chambers.some(ch => ch.type === 'barracks' && ch.state === 1) && pstats().milCap <= (CC[0]?.military ?? 0)) return { ok: false, reason: 'Necesitas un Cuartel' };
  return { ok: true, reason: '' };
}
export function queueCaste(c: CasteId, n = 1) {
  if (isGuest()) { const u = casteUnlocked(c); if (!u.ok) { emit('error', { text: u.reason }); return; } sendCmd('queue', c, n); emit('queued', { c }); return; }
  const p = player();
  const u = casteUnlocked(c);
  if (!u.ok) { emit('error', { text: u.reason }); return; }
  for (let i = 0; i < n && p.queue.length < 30; i++) p.queue.push(c);
  emit('queued', { c });
}
export function dequeue(i: number) {
  if (isGuest()) { sendCmd('dequeue', i); return; } const p = player(); p.queue.splice(i, 1); }

// ------------------ Investigación ------------------
export function techAvailable(id: string): { ok: boolean; reason: string } {
  const p = player();
  const t = TECH_BY_ID[id];
  if (hasTech(p, id)) return { ok: false, reason: 'Investigada' };
  if (p.research === id) return { ok: false, reason: 'En curso' };
  for (const r of t.req) if (!hasTech(p, r)) return { ok: false, reason: 'Requiere: ' + TECH_BY_ID[r].name };
  if (p.research) return { ok: false, reason: 'Ya hay una investigación en curso' };
  if (!canAfford(p.res, t.cost)) return { ok: false, reason: 'Recursos insuficientes' };
  return { ok: true, reason: '' };
}
export function startResearch(id: string): boolean {
  const ok = techAvailable(id);
  if (!ok.ok) { emit('error', { text: ok.reason }); return false; }
  if (isGuest()) { sendCmd('research', id); return true; }
  const p = player();
  pay(p.res, TECH_BY_ID[id].cost);
  p.research = id; p.researchProg = 0;
  emit('researchStart', { id });
  return true;
}
export function cancelResearch() {
  if (isGuest()) { sendCmd('cancelResearch'); return; }
  const p = player();
  if (!p.research) return;
  refund(p.res, TECH_BY_ID[p.research].cost, 0.75);
  p.research = null; p.researchProg = 0;
}

// ------------------ Hormiguero ------------------
export function chamberUnlocked(type: ChamberType): { ok: boolean; reason: string } {
  const d = CHAMBERS[type];
  if (d.tech && !hasTech(player(), d.tech)) return { ok: false, reason: 'Requiere: ' + TECH_BY_ID[d.tech].name };
  return { ok: true, reason: '' };
}
export function tryPlaceChamber(type: ChamberType, cx: number, cy: number): Chamber | null {
  if (isGuest()) { const ok = canPlaceChamber(type, cx, cy); const u = chamberUnlocked(type); if (!ok.ok || !u.ok || !canAfford(player().res, CHAMBERS[type].cost[0])) { emit('error', { text: !u.ok ? u.reason : !ok.ok ? ok.reason : 'Recursos insuficientes' }); return null; } sendCmd('placeChamber', type, cx, cy); return {} as Chamber; }
  const u = chamberUnlocked(type);
  if (!u.ok) { emit('error', { text: u.reason }); return null; }
  const p = player();
  const cost = CHAMBERS[type].cost[0];
  if (!canAfford(p.res, cost)) { emit('error', { text: 'Recursos insuficientes' }); return null; }
  const ok = canPlaceChamber(type, cx, cy);
  if (!ok.ok) { emit('error', { text: ok.reason }); return null; }
  pay(p.res, cost);
  const c = placeChamber(type, cx, cy);
  emit('chamberPlaced', { c });
  invalidatePStats();
  return c;
}
export function canUpgrade(c: Chamber): { ok: boolean; reason: string } {
  const p = player();
  const cost = chamberUpgradeCost(c.type, c.level);
  if (!cost) return { ok: false, reason: 'Nivel máximo' };
  if (c.state !== 1) return { ok: false, reason: 'En excavación' };
  if (c.level === 1 && !hasTech(p, 'architecture') && c.type !== 'royal' && c.type !== 'hall') return { ok: false, reason: 'Requiere: Arquitectura' };
  if (c.level === 2 && !hasTech(p, 'masonry') && c.type !== 'hall') return { ok: false, reason: 'Requiere: Arquitectura avanzada' };
  if (!canAfford(p.res, cost)) return { ok: false, reason: 'Recursos insuficientes' };
  return { ok: true, reason: '' };
}
export function upgradeChamber(c: Chamber): boolean {
  const ok = canUpgrade(c);
  if (!ok.ok) { emit('error', { text: ok.reason }); return false; }
  if (isGuest()) { sendCmd('upgradeChamber', c.id); return true; }
  pay(player().res, chamberUpgradeCost(c.type, c.level)!);
  c.level++;
  G.S.stats.upgrades++;
  invalidatePStats();
  addXP(30 * c.level);
  emit('chamberUpgraded', { c });
  return true;
}
export function demolishChamber(c: Chamber) {
  if (isGuest()) { sendCmd('demolishChamber', c.id); return; }
  const S = G.S;
  if (c.type === 'royal') return;
  const i = S.nest.chambers.indexOf(c);
  if (i < 0) return;
  S.nest.chambers.splice(i, 1);
  // cancelar designaciones pendientes
  for (let y = Math.floor(c.cy - c.ry); y <= c.cy + c.ry; y++) for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) {
    if (inEllipse(c, x, y)) S.nest.dig[y * S.nest.W + x] = 0;
  }
  // reubicar cría
  const royal = S.nest.chambers.find(ch => ch.type === 'royal')!;
  for (const b of S.nest.brood) if (b.ch === c.id) { b.ch = royal.id; b.x = royal.cx * 12; b.y = (royal.cy + 1) * 12; }
  let f = 0.5;
  for (let L = 0; L < c.level; L++) refund(player().res, CHAMBERS[c.type].cost[L], f);
  invalidatePStats();
  markNestDirty();
  emit('demolish', { x: c.cx * 12, y: c.cy * 12, layer: 1 });
}
export function decorUnlocked(id: string): { ok: boolean; reason: string } {
  const d = DECORS.find(x => x.id === id)!;
  const p = player();
  if (p.level < d.level) return { ok: false, reason: 'Requiere nivel de colonia ' + d.level };
  if (d.tech && !hasTech(p, d.tech)) return { ok: false, reason: 'Requiere: ' + TECH_BY_ID[d.tech].name };
  if (!canAfford(p.res, d.cost)) return { ok: false, reason: 'Recursos insuficientes' };
  return { ok: true, reason: '' };
}
export function placeDecor(c: Chamber, id: string, x: number, y: number): boolean {
  const ok = decorUnlocked(id);
  if (!ok.ok) { emit('error', { text: ok.reason }); return false; }
  if (isGuest()) { sendCmd('placeDecor', c.id, id, x, y); return true; }
  if (c.state !== 1) { emit('error', { text: 'La cámara aún se está excavando' }); return false; }
  const maxDecor = 4 + c.rx + c.level * 2;
  if (c.decor.length >= maxDecor) { emit('error', { text: 'No caben más decoraciones en esta cámara' }); return false; }
  const d = DECORS.find(x => x.id === id)!;
  pay(player().res, d.cost);
  c.decor.push({ k: id, x, y });
  G.S.stats.decor++;
  invalidatePStats();
  addXP(5 + d.beauty * 0.5);
  emit('decorPlaced', { c, id, x, y });
  return true;
}
export function removeDecor(c: Chamber, idx: number) {
  if (isGuest()) { sendCmd('removeDecor', c.id, idx); return; }
  const d = c.decor[idx];
  if (!d) return;
  c.decor.splice(idx, 1);
  const def = DECORS.find(x => x.id === d.k);
  if (def) refund(player().res, def.cost, 0.5);
  invalidatePStats();
}

export function setAlloc(forage: number, dig: number, inside: number) {
  if (isGuest()) sendCmd('alloc', forage, dig, inside);
  const p = player();
  const s = forage + dig + inside || 1;
  p.alloc = { forage: forage / s, dig: dig / s, inside: inside / s };
}

export function setPrio(k: 'food' | 'leaves' | 'amber', v: number) { if (isGuest()) sendCmd('prio', k, v); player().prio[k] = v; }
export function setAutoWorkers(v: boolean) { if (isGuest()) sendCmd('auto', v); player().autoWorkers = v; }
export function resetRally() { if (isGuest()) { sendCmd('resetRally'); return; } player().rally = null; }
export function setSpeed(v: number, paused: boolean) { if (isGuest()) { sendCmd('speed', v, paused); return; } G.S.speed = v; G.S.paused = paused; }
export function sendGatherers(nodeId: number): number {
  if (isGuest()) { sendCmd('gather8', nodeId); return 8; }
  const S = G.S;
  const n = getNode(nodeId);
  if (!n) return 0;
  const cand = S.ants.filter(a => a.col === 0 && a.layer === 0 && !CASTES[a.caste].military && a.caste !== 'princess' && !a.carry && (a.st === AS.Search || a.st === AS.Explore || a.st === AS.ToNode));
  cand.sort((p, q) => (p.x - n.x) ** 2 + (p.y - n.y) ** 2 - ((q.x - n.x) ** 2 + (q.y - n.y) ** 2));
  const k = Math.min(8, cand.length);
  for (const a of cand.slice(0, k)) { a.st = AS.ToNode; a.tid = n.id; a.mem = n.id; a.t = 0; }
  return k;
}
