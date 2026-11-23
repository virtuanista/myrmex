// Guardado y carga de partidas (IndexedDB + gzip).
import { G, GameState, SAVE_VERSION } from './state';
import { WORLD, generateWorld } from './world';
import { initPher, PW, PH } from './ants';
import { clearNavCaches } from './nav';
import { markNestDirty, updateNestFields } from './nest';
import { invalidatePStats, CC } from './colony';
import { u8ToB64, b64ToU8, ls } from '../core/util';
import { dayNumber } from './time';

const DB = 'myrmex', STORE = 'saves';
function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key: string, val: any) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDel(key: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

export interface SaveMeta { slot: string; colony: string; player: string; day: number; pop: number; level: number; played: number; date: number; biome: string; over: number }
export function listSaves(): SaveMeta[] {
  try { return (JSON.parse(ls.get('myrmex.saves') || '[]') as SaveMeta[]).sort((a, b) => b.date - a.date); } catch { return []; }
}
function putMeta(m: SaveMeta) {
  const l = listSaves().filter(x => x.slot !== m.slot);
  l.push(m);
  ls.set('myrmex.saves', JSON.stringify(l));
}
export async function deleteSave(slot: string) {
  ls.set('myrmex.saves', JSON.stringify(listSaves().filter(x => x.slot !== slot)));
  try { await idbDel(slot); } catch { /* */ }
}

const q8 = (f: Float32Array, scale = 255) => { const u = new Uint8Array(f.length); for (let i = 0; i < f.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(f[i] * scale))); return u; };
const dq8 = (u: Uint8Array, scale = 255) => { const f = new Float32Array(u.length); for (let i = 0; i < u.length; i++) f[i] = u[i] / scale; return f; };

export function serialize(S: GameState): string {
  const n = S.nest;
  const obj: any = {
    ...S,
    pher: S.pher.map(p => u8ToB64(q8(p))),
    wear: u8ToB64(q8(S.wear)),
    fog: u8ToB64(S.fog),
    nest: { ...n, grid: u8ToB64(n.grid), treas: u8ToB64(n.treas), dig: u8ToB64(n.dig), digp: u8ToB64(q8(n.digp)) },
    projectiles: [],
  };
  return JSON.stringify(obj, (k, v) => (k.length && (k[0] === '_' || k === 'bite' || k === 'hits') ? undefined : v));
}

async function compress(s: string): Promise<Blob | string> {
  if (typeof CompressionStream === 'undefined') return s;
  const cs = new CompressionStream('gzip');
  const blob = new Blob([s]).stream().pipeThrough(cs);
  return await new Response(blob).blob();
}
async function decompress(v: Blob | string): Promise<string> {
  if (typeof v === 'string') return v;
  const ds = new DecompressionStream('gzip');
  return await new Response(v.stream().pipeThrough(ds)).text();
}

let saving: Promise<boolean> | null = null;
export async function saveGame(slot?: string): Promise<boolean> {
  if ((globalThis as any).__netGuest) return false;
  while (saving) await saving;
  saving = doSave(slot);
  const r = await saving;
  saving = null;
  return r;
}
async function doSave(slot?: string): Promise<boolean> {
  const S = G.S;
  if (!S) return false;
  try {
    S.slot = slot || S.slot || 'auto';
    const data = await compress(serialize(S));
    await idbPut(S.slot, data);
    putMeta({ slot: S.slot, colony: S.cfg.colonyName, player: S.cfg.playerName, day: dayNumber(), pop: CC[0]?.total ?? S.ants.filter(a => a.col === 0).length, level: S.colonies[0].level, played: S.played, date: Date.now(), biome: S.cfg.biome, over: S.over });
    ls.set('myrmex.last', S.slot);
    return true;
  } catch (e) {
    console.error('Error al guardar', e);
    return false;
  }
}

export async function loadGame(slot: string): Promise<GameState | null> {
  const raw = await idbGet(slot);
  if (!raw) return null;
  const txt = await decompress(raw);
  return deserialize(txt);
}
export { compress, decompress };

/** Reconstruye el estado completo desde texto serializado */
export function deserialize(txt: string): GameState | null {
  const o = JSON.parse(txt);
  if (!o || !o.cfg) return null;
  WORLD.W = generateWorld(o.cfg);
  G.S = o;
  initPher();
  const S = G.S;
  S.pher = (o.pher as string[]).map(b => { const u = b64ToU8(b); return u.length === PW * PH ? dq8(u) : new Float32Array(PW * PH); });
  while (S.pher.length < S.colonies.length) S.pher.push(new Float32Array(PW * PH));
  const wu = b64ToU8(o.wear);
  S.wear = wu.length === PW * PH ? dq8(wu) : new Float32Array(PW * PH);
  S.fog = b64ToU8(o.fog);
  const n = o.nest;
  S.nest = { ...n, grid: b64ToU8(n.grid), treas: b64ToU8(n.treas), dig: b64ToU8(n.dig), digp: dq8(b64ToU8(n.digp)) };
  for (const a of S.ants) fixAnt(a);
  for (const c of S.creatures) { c.px = c.x; c.py = c.y; }
  S.projectiles = [];
  S.v = SAVE_VERSION;
  S.paused = false;
  clearNavCaches();
  markNestDirty();
  updateNestFields(true);
  invalidatePStats();
  return S;
}
export function fixAnt(a: any) {
  if (a.gx === null) a.gx = NaN; if (a.gy === null) a.gy = NaN;
  if (a.tx === null) a.tx = NaN; if (a.ty === null) a.ty = NaN;
  a.px = a.x; a.py = a.y;
}
export { q8, dq8 };

export function lastSlot(): string | null {
  const l = ls.get('myrmex.last');
  if (l && listSaves().some(s => s.slot === l)) return l;
  const s = listSaves()[0];
  return s ? s.slot : null;
}
