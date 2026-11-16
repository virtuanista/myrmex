// Multijugador cooperativo P2P (WebRTC). El anfitrión simula; el invitado ve y ordena.
import { G, Ant, Creature, Projectile, GameState } from '../game/state';
import { CASTES, CasteId, CREATURES, CreatureType, ResKey } from '../game/defs';
import { EVENTS } from '../game/events';
import { serialize, deserialize, compress, decompress, q8, dq8, fixAnt } from '../game/save';
import { u8ToB64, b64ToU8 } from '../core/util';
import { emit, on } from '../core/bus';
import { markNestDirty } from '../game/nest';
import { invalidatePStats } from '../game/colony';
import { QUEST_BY_ID, ACHIEVEMENTS } from '../game/quests';
import { PW, PH } from '../game/ants';

export type Role = 'off' | 'host' | 'guest';
export const NET = {
  role: 'off' as Role, connected: false, peerName: '', status: '',
  pc: null as RTCPeerConnection | null, dc: null as RTCDataChannel | null,
  snapT: 0, snapInterval: 0.25, lastSnapAt: 0, bytesIn: 0, bytesOut: 0,
};
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const CASTE_LIST = Object.keys(CASTES) as CasteId[];
const CRE_LIST = Object.keys(CREATURES) as CreatureType[];
const RES_LIST: (ResKey | null)[] = [null, 'food', 'leaves', 'soil', 'amber', 'science'];
const ROLE_LIST = ['forage', 'dig', 'inside', 'army'] as const;

let handlers: { onStatus?: (s: string) => void; onGuestReady?: () => void; onHostLost?: () => void } = {};
export function setNetHandlers(h: typeof handlers) { handlers = { ...handlers, ...h }; }
function status(s: string) { NET.status = s; handlers.onStatus?.(s); }

// ------------------ Señalización por códigos ------------------
async function encodeDesc(d: RTCSessionDescriptionInit): Promise<string> {
  const blob = await compress(JSON.stringify(d));
  const u8 = typeof blob === 'string' ? new TextEncoder().encode(blob) : new Uint8Array(await blob.arrayBuffer());
  return 'MYRMEX:' + u8ToB64(u8);
}
async function decodeDesc(code: string): Promise<RTCSessionDescriptionInit> {
  const b64 = code.trim().replace(/^MYRMEX:/, '').replace(/\s+/g, '');
  const u8 = b64ToU8(b64);
  const txt = await decompress(new Blob([u8 as BlobPart]));
  return JSON.parse(txt);
}
function waitIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 6000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function setupChannel(dc: RTCDataChannel) {
  NET.dc = dc;
  dc.binaryType = 'arraybuffer';
  dc.onopen = () => {
    NET.connected = true;
    lastRecv = performance.now();
    status('Conectado');
    send({ t: 'hello', name: localStorage.getItem('myrmex.player') || (NET.role === 'host' ? G.S?.cfg.playerName : 'Invitada') });
    if (NET.role === 'host') sendFull();
  };
  dc.onclose = () => { lastRecv = 0; const was = NET.connected; NET.connected = false; status('Desconectado'); if (was) { emit('netLost', { role: NET.role }); if (NET.role === 'guest') handlers.onHostLost?.(); } };
  dc.onmessage = e => onRaw(e.data);
}

/** Anfitrión: crea la invitación */
export async function hostCreateOffer(): Promise<string> {
  closeNet();
  NET.role = 'host';
  const pc = new RTCPeerConnection({ iceServers: ICE });
  NET.pc = pc;
  setupChannel(pc.createDataChannel('myrmex', { ordered: true }));
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') status('La conexión ha fallado'); };
  await pc.setLocalDescription(await pc.createOffer());
  status('Generando código…');
  await waitIce(pc);
  status('Esperando respuesta del invitado');
  return encodeDesc(pc.localDescription!.toJSON());
}
export async function hostAcceptAnswer(code: string) {
  if (!NET.pc) throw new Error('No hay invitación activa');
  await NET.pc.setRemoteDescription(await decodeDesc(code));
  status('Conectando…');
}
/** Invitado: responde a la invitación */
export async function guestAnswer(code: string): Promise<string> {
  closeNet();
  NET.role = 'guest';
  const pc = new RTCPeerConnection({ iceServers: ICE });
  NET.pc = pc;
  pc.ondatachannel = e => setupChannel(e.channel);
  await pc.setRemoteDescription(await decodeDesc(code));
  await pc.setLocalDescription(await pc.createAnswer());
  status('Generando respuesta…');
  await waitIce(pc);
  status('Pásale este código al anfitrión');
  return encodeDesc(pc.localDescription!.toJSON());
}
export function closeNet() {
  try { NET.dc?.close(); } catch { /* */ }
  try { NET.pc?.close(); } catch { /* */ }
  NET.dc = null; NET.pc = null; NET.connected = false; NET.role = 'off'; NET.peerName = ''; gotFull = false;
}

// ------------------ Transporte con troceado ------------------
const CHUNK = 48000;
let msgId = 0;
const partial = new Map<number, { parts: (string | null)[]; got: number }>();
export function send(obj: any) {
  const dc = NET.dc;
  if (!dc || dc.readyState !== 'open') return;
  const txt = JSON.stringify(obj);
  NET.bytesOut += txt.length;
  if (txt.length <= CHUNK) { dc.send('0' + txt); return; }
  const id = ++msgId, n = Math.ceil(txt.length / CHUNK);
  for (let i = 0; i < n; i++) dc.send('1' + id + '|' + i + '|' + n + '|' + txt.slice(i * CHUNK, (i + 1) * CHUNK));
}
let lastRecv = 0;
function onRaw(data: string) {
  NET.bytesIn += data.length;
  lastRecv = performance.now();
  if (data[0] === '0') return onMsg(JSON.parse(data.slice(1)));
  const p1 = data.indexOf('|'), p2 = data.indexOf('|', p1 + 1), p3 = data.indexOf('|', p2 + 1);
  const id = +data.slice(1, p1), i = +data.slice(p1 + 1, p2), n = +data.slice(p2 + 1, p3);
  let rec = partial.get(id);
  if (!rec) partial.set(id, (rec = { parts: new Array(n).fill(null), got: 0 }));
  if (rec.parts[i] === null) { rec.parts[i] = data.slice(p3 + 1); rec.got++; }
  if (rec.got === n) { partial.delete(id); onMsg(JSON.parse(rec.parts.join(''))); }
}

// ------------------ Mensajes ------------------
const cmdHandlers = new Map<string, (...a: any[]) => void>();
export function registerCmd(name: string, fn: (...a: any[]) => void) { cmdHandlers.set(name, fn); }
export let execGuest = false;
let gotFull = false;

async function onMsg(m: any) {
  switch (m.t) {
    case 'z': { const txt = await decompress(new Blob([b64ToU8(m.d) as BlobPart])); onMsg(JSON.parse(txt)); break; }
    case 'hb': break;
    case 'hello': NET.peerName = String(m.name || 'Compañera').slice(0, 24); emit('netJoin', { name: NET.peerName }); break;
    case 'full': if (NET.role === 'guest') { const txt = await decompress(new Blob([b64ToU8(m.d) as BlobPart])); const S = deserialize(txt); if (S) { gotFull = true; applyNest(m.nest); handlers.onGuestReady?.(); } } break;
    case 'snap': if (NET.role === 'guest' && gotFull) applySnap(m); break;
    case 'slow': if (NET.role === 'guest' && gotFull) applySlow(m); break;
    case 'nest': if (NET.role === 'guest' && gotFull) applyNest(m); break;
    case 'map': if (NET.role === 'guest' && gotFull) applyMap(m); break;
    case 'ev': if (NET.role === 'guest') replayEvent(m.n, m.d); break;
    case 'cmd': if (NET.role === 'host') { const f = cmdHandlers.get(m.fn); if (f) { execGuest = true; try { f(...(m.a || [])); } catch (e) { console.error(e); } execGuest = false; } } break;
    case 'chat': emit('netChat', { name: NET.peerName, text: String(m.text).slice(0, 200) }); break;
    case 'ping': emit('netPing', { x: m.x, y: m.y, view: m.view, name: NET.peerName }); break;
  }
}
export function sendCmd(fn: string, ...a: any[]) { send({ t: 'cmd', fn, a }); }
/** Envío comprimido (gzip) para mensajes grandes */
async function sendZ(obj: any) {
  const blob = await compress(JSON.stringify(obj));
  if (typeof blob === 'string') { send(obj); return; }
  send({ t: 'z', d: u8ToB64(new Uint8Array(await blob.arrayBuffer())) });
}
export function sendChat(text: string) { send({ t: 'chat', text }); }
export function sendPing(x: number, y: number, view: string) { send({ t: 'ping', x, y, view }); }
export const isGuest = () => NET.role === 'guest' && NET.connected;

// ------------------ Anfitrión: envío de estado ------------------
async function sendFull() {
  const S = G.S;
  if (!S) return;
  const blob = await compress(serialize(S));
  const u8 = typeof blob === 'string' ? new TextEncoder().encode(blob) : new Uint8Array(await blob.arrayBuffer());
  send({ t: 'full', d: u8ToB64(u8), nest: nestMsg() });
  lastNestVer = -1;
}
let acc = 0, slowAcc = 0, nestAcc = 0, mapAcc = 0, lastNestVer = -1;
import { nestVersion } from '../game/nest';
let hbT = 0;
/** Latido y detección de desconexión (ambos roles) */
export function netHeartbeat(dt: number) {
  if (NET.role === 'off' || !NET.connected) return;
  hbT += dt;
  if (hbT > 1.5) { hbT = 0; send({ t: 'hb' }); }
  if (lastRecv && performance.now() - lastRecv > 8000) {
    NET.connected = false;
    status('Desconectado');
    emit('netLost', { role: NET.role });
    if (NET.role === 'guest') handlers.onHostLost?.();
    closeNet();
  }
}
export function hostTick(dt: number) {
  if (NET.role !== 'host' || !NET.connected || !G.S) return;
  acc += dt; slowAcc += dt; nestAcc += dt; mapAcc += dt;
  if (acc >= NET.snapInterval) { acc = 0; send(snapMsg()); }
  if (slowAcc >= 2) { slowAcc = 0; sendZ(slowMsg()); }
  if (nestAcc >= 1) { nestAcc = 0; sendZ({ t: 'nest', ...nestMsg() }); }
  if (mapAcc >= 4) { mapAcc = 0; sendZ(mapMsg()); }
}
const r1 = (v: number) => Math.round(v * 10) / 10;
function snapMsg() {
  const S = G.S;
  const a: number[] = [];
  for (const x of S.ants) a.push(x.id, x.col, CASTE_LIST.indexOf(x.caste), x.layer, r1(x.x), r1(x.y), Math.round(x.a * 100) / 100, Math.ceil(x.hp), x.mhp, x.st, RES_LIST.indexOf(x.carry), x.ca, x.rank, ROLE_LIST.indexOf(x.role as any), x.order ? 1 : 0, x.kills);
  const c: any[] = [];
  for (const x of S.creatures) c.push(x.id, CRE_LIST.indexOf(x.type), r1(x.x), r1(x.y), Math.round(x.a * 100) / 100, Math.ceil(x.hp), Math.round(x.mhp), x.angry > 0 ? 1 : 0, x.boss ? 1 : 0, x.name || '');
  const p: number[] = [];
  for (const x of S.projectiles) p.push(r1(x.x), r1(x.y), r1(x.sx), r1(x.sy), r1(x.tx), r1(x.ty), r1(x.t * 100) / 100, r1(x.dur * 100) / 100, x.col);
  return {
    t: 'snap', time: S.time, tick: S.tick, speed: S.speed, paused: S.paused, over: S.over,
    a, c, p, s: S.structures, cols: S.colonies, w: S.weather, ev: S.events, iv: NET.snapInterval,
  };
}
function slowMsg() {
  const S = G.S;
  return { t: 'slow', nodes: S.nodes, quests: S.quests, ach: S.ach, stats: S.stats, zones: S.zones.map(z => z.found ? 1 : 0), nextEvent: S.nextEvent, victoryShown: S.victoryShown };
}
function nestMsg() {
  const n = G.S.nest;
  const changed = nestVersion !== lastNestVer;
  lastNestVer = nestVersion;
  return {
    v: nestVersion, grid: changed ? u8ToB64(n.grid) : '', dig: changed ? u8ToB64(n.dig) : '', treas: changed ? u8ToB64(n.treas) : '',
    digp: u8ToB64(q8(n.digp)), chambers: n.chambers, brood: n.brood, q: [n.queenX, n.queenY],
  };
}
function mapMsg() {
  const S = G.S;
  return { t: 'map', fog: u8ToB64(S.fog), pher: u8ToB64(q8(S.pher[0])), wear: u8ToB64(q8(S.wear)) };
}

// ------------------ Invitado: aplicar estado ------------------
let prevAnts = new Map<number, Ant>();
let prevCre = new Map<number, Creature>();
function applySnap(m: any) {
  const S = G.S;
  NET.snapInterval = m.iv || 0.2;
  NET.lastSnapAt = performance.now();
  S.time = m.time; S.tick = m.tick; S.speed = m.speed; S.paused = m.paused;
  if (m.over !== S.over) { S.over = m.over; }
  // hormigas
  prevAnts = new Map(S.ants.map(a => [a.id, a]));
  const ants: Ant[] = [];
  const A = m.a as number[];
  for (let i = 0; i < A.length; i += 16) {
    const id = A[i];
    let a = prevAnts.get(id);
    const x = A[i + 4], y = A[i + 5], layer = A[i + 3] as 0 | 1;
    if (!a) {
      a = { id, col: 0, caste: 'worker', layer, x, y, px: x, py: y, a: 0, hp: 1, mhp: 1, st: 0, role: 'forage', carry: null, ca: 0, tx: NaN, ty: NaN, tid: 0, order: null, t: 0, ph: Math.random() * 6, str: 0, cd: 0, rank: 0, kills: 0, age: 0, task: '', stuck: 0, lastHit: -99, sx: x, sy: y, tk: 0, gx: NaN, gy: NaN, w: 0, mem: 0 } as Ant;
    }
    const sameLayer = a.layer === layer;
    a.px = sameLayer ? a.x : x; a.py = sameLayer ? a.y : y;
    a.col = A[i + 1]; a.caste = CASTE_LIST[A[i + 2]]; a.layer = layer; a.x = x; a.y = y; a.a = A[i + 6];
    a.hp = A[i + 7]; a.mhp = A[i + 8]; a.st = A[i + 9]; a.carry = RES_LIST[A[i + 10]]; a.ca = A[i + 11]; a.rank = A[i + 12];
    a.role = ROLE_LIST[A[i + 13]] || 'forage'; a.order = A[i + 14] ? ({ k: 'move', x: 0, y: 0, id: 0, am: false }) : null; a.kills = A[i + 15];
    ants.push(a);
  }
  S.ants = ants;
  // criaturas
  prevCre = new Map(S.creatures.map(c => [c.id, c]));
  const cres: Creature[] = [];
  const C = m.c as any[];
  for (let i = 0; i < C.length; i += 10) {
    const id = C[i];
    let c = prevCre.get(id);
    const x = C[i + 2], y = C[i + 3];
    if (!c) c = { id, type: 'aphid', x, y, px: x, py: y, a: 0, hp: 1, mhp: 1, st: 0, t: 0, cd: 0, ph: Math.random() * 6, tx: 0, ty: 0, tid: 0, tk: 0, hx: x, hy: y, angry: 0, prod: 0 } as Creature;
    c.px = c.x; c.py = c.y;
    c.type = CRE_LIST[C[i + 1]]; c.x = x; c.y = y; c.a = C[i + 4]; c.hp = C[i + 5]; c.mhp = C[i + 6]; c.angry = C[i + 7] ? 5 : 0; c.boss = !!C[i + 8]; c.name = C[i + 9] || undefined;
    cres.push(c);
  }
  S.creatures = cres;
  const P = m.p as number[];
  const projs: Projectile[] = [];
  for (let i = 0; i < P.length; i += 9) projs.push({ x: P[i], y: P[i + 1], sx: P[i + 2], sy: P[i + 3], tx: P[i + 4], ty: P[i + 5], t: P[i + 6], dur: P[i + 7], col: P[i + 8], dmg: 0, tid: 0, tk: 0, splash: 0, pierce: false });
  S.projectiles = projs;
  // estructuras y colonias (conservar selección)
  S.structures = m.s;
  S.colonies = m.cols;
  S.weather = m.w;
  S.events = m.ev;
  invalidatePStats();
}
function applySlow(m: any) {
  const S = G.S;
  S.nodes = m.nodes; S.quests = m.quests; S.ach = m.ach; S.stats = m.stats; S.nextEvent = m.nextEvent; S.victoryShown = m.victoryShown;
  (m.zones as number[]).forEach((f, i) => { if (S.zones[i]) S.zones[i].found = !!f; });
}
let guestNestVer = -2;
function applyNest(m: any) {
  if (!m || !G.S) return;
  const n = G.S.nest;
  if (m.grid) { n.grid = b64ToU8(m.grid); n.dig = b64ToU8(m.dig); n.treas = b64ToU8(m.treas); }
  n.digp = dq8(b64ToU8(m.digp));
  n.chambers = m.chambers; n.brood = m.brood; n.queenX = m.q[0]; n.queenY = m.q[1];
  if (m.v !== guestNestVer) { guestNestVer = m.v; markNestDirty(); }
  invalidatePStats();
}
function applyMap(m: any) {
  const S = G.S;
  const fog = b64ToU8(m.fog);
  if (fog.length === S.fog.length) { for (let i = 0; i < fog.length; i++) if (fog[i]) S.fog[i] = 1; }
  const ph = b64ToU8(m.pher);
  if (ph.length === PW * PH) S.pher[0] = dq8(ph);
  const w = b64ToU8(m.wear);
  if (w.length === PW * PH) S.wear = dq8(w);
}

/** Invitado: interpolación entre instantáneas */
export function guestAlpha(dt: number): number {
  const S = G.S;
  const k = Math.min(1, (performance.now() - NET.lastSnapAt) / 1000 / NET.snapInterval);
  if (S && !S.paused) {
    for (const a of S.ants) { const d = Math.hypot(a.x - a.px, a.y - a.py); a.ph += (d / NET.snapInterval) * dt * 0.45; }
    for (const c of S.creatures) { const d = Math.hypot(c.x - c.px, c.y - c.py); c.ph += (d / NET.snapInterval) * dt * 0.3; }
  }
  return k;
}

// ------------------ Reenvío de eventos para efectos ------------------
const FORWARD = ['gain', 'treasure', 'chamberPlaced', 'chamberDone', 'chamberUpgraded', 'decorPlaced', 'hatch', 'death', 'levelup', 'quest', 'achievement', 'research', 'researchStart', 'discover', 'worldEvent', 'raid', 'placed', 'built', 'structHit', 'structDestroyed', 'nestBreached', 'queenHit', 'colonyDestroyed', 'satellite', 'shoot', 'splash', 'thunder', 'weather', 'nightfall', 'dawn', 'rankup', 'bossSpawn', 'emergency', 'royalGuard', 'victory', 'defeat', 'dug', 'egg', 'demolish', 'rally', 'queued'];
let evBudget = 0;
export function initNetForwarding() {
  for (const n of FORWARD) {
    on(n, d => {
      if (NET.role !== 'host' || !NET.connected) return;
      if ((n === 'death' || n === 'gain' || n === 'dug' || n === 'shoot' || n === 'splash') && evBudget > 30) return;
      evBudget++;
      send({ t: 'ev', n, d: sanitize(n, d) });
    });
  }
  on('error', d => { if (NET.role === 'host' && execGuest) send({ t: 'ev', n: 'error', d }); });
  setInterval(() => { evBudget = 0; }, 1000);
}
function sanitize(n: string, d: any): any {
  if (n === 'quest') return { qid: d.q.id };
  if (n === 'achievement') return { aid: d.a.id };
  if (n === 'worldEvent') return { did: d.def.id, e: { x: d.e.x, y: d.e.y } };
  if (n === 'hatch') return { caste: d.caste, x: d.x, y: d.y, layer: d.layer };
  if (n === 'raid' || n === 'emergency' || n === 'colonyDestroyed') return { ...d, col: { name: d.col.name, id: d.col.id } };
  return d;
}
function replayEvent(n: string, d: any) {
  if (n === 'quest') { const q = QUEST_BY_ID[d.qid]; if (q) emit('quest', { q }); return; }
  if (n === 'achievement') { const a = ACHIEVEMENTS.find(x => x.id === d.aid); if (a) emit('achievement', { a }); return; }
  if (n === 'worldEvent') { const def = EVENTS.find(x => x.id === d.did); if (def) emit('worldEvent', { def, e: d.e }); return; }
  emit(n, d);
}
export type { GameState };
