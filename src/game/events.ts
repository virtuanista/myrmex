// Acontecimientos del mundo.
import { G, GameEvent, ResNode, TS, newId } from './state';
import { emit } from '../core/bus';
import { spawnCreature, spawnBossNear, randomWildSpot } from './creatures';
import { eachAnt } from './spatial';
import { damage } from './combat';
import { launchWave } from './ai';
import { isNight, dayNumber } from './time';
import { WORLD, passableAt } from './world';
import { clamp, rnd } from '../core/util';
import { NEST_SKY } from './state';

export interface EventDef { id: string; name: string; icon: string; desc: string; weight: () => number; start: (e: GameEvent) => void; update?: (e: GameEvent, dt: number) => void; dur: number; good: boolean }

function playerNest() { const S = G.S; return S.structures.find(s => s.id === S.colonies[0].nestId)!; }
function spotNear(x: number, y: number, rmin: number, rmax: number) {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, r = rnd(rmin, rmax);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (passableAt(px, py)) return { x: px, y: py };
  }
  return { x, y };
}
function edgeSpot() {
  const W = WORLD.W;
  for (let k = 0; k < 40; k++) {
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? 2 * TS : side === 1 ? (W.w - 3) * TS : rnd(3, W.w - 3) * TS;
    const y = side === 2 ? 2 * TS : side === 3 ? (W.h - 3) * TS : rnd(3, W.h - 3) * TS;
    if (passableAt(x, y)) return { x, y };
  }
  return { x: 3 * TS, y: 3 * TS };
}
function addNode(n: Omit<ResNode, 'id' | 'v'>) { const node: ResNode = { ...n, id: newId(), v: Math.random() }; G.S.nodes.push(node); return node; }

export const EVENTS: EventDef[] = [
  {
    id: 'feast', name: '¡Fruta caída!', icon: '🍓', good: true, dur: 0,
    desc: 'Una fresa madura ha caído del cielo. ¡Que vayan las recolectoras antes que nadie!',
    weight: () => 3,
    start: e => { const n = playerNest(); const p = spotNear(n.x, n.y, 250, 650); e.x = p.x; e.y = p.y; addNode({ kind: 'fruit', x: p.x, y: p.y, amt: 220, max: 220, regen: 0, r: 16, name: 'Fresa madura', decay: 600 }); },
  },
  {
    id: 'windfall', name: 'Ráfaga de viento', icon: '🍃', good: true, dur: 0,
    desc: 'El viento ha arrancado hojas frescas por toda la zona.',
    weight: () => 2,
    start: e => { const n = playerNest(); e.x = n.x; e.y = n.y; for (let i = 0; i < 7; i++) { const p = spotNear(n.x, n.y, 150, 700); addNode({ kind: 'leaf', x: p.x, y: p.y, amt: 30, max: 30, regen: 0, r: 9, decay: 400 }); } },
  },
  {
    id: 'picnic', name: 'Restos de picnic', icon: '🧺', good: true, dur: 0,
    desc: 'Unos gigantes han dejado migas por todas partes. ¡Un festín… vigilado por otros!',
    weight: () => 1.5,
    start: e => {
      const p = randomWildSpot(350) || playerNest(); e.x = p.x; e.y = p.y;
      for (let i = 0; i < 9; i++) { const q = spotNear(p.x, p.y, 0, 90); addNode({ kind: 'crumbs', x: q.x, y: q.y, amt: 25, max: 25, regen: 0, r: 6, decay: 500 }); }
      addNode({ kind: 'sugar', x: p.x, y: p.y, amt: 160, max: 160, regen: 0, r: 12, name: 'Terrón de azúcar', decay: 800 });
      if (Math.random() < 0.6) spawnCreature('beetle', p.x + 40, p.y);
    },
  },
  {
    id: 'aphids', name: 'Plaga de pulgones', icon: '🐛', good: true, dur: 0,
    desc: 'Una nube de pulgones se ha posado cerca. Sus gotas de melaza son pura energía.',
    weight: () => 2,
    start: e => { const n = playerNest(); const p = spotNear(n.x, n.y, 180, 450); e.x = p.x; e.y = p.y; for (let i = 0; i < 10; i++) spawnCreature('aphid', p.x + rnd(-30, 30), p.y + rnd(-30, 30)); },
  },
  {
    id: 'fireflies', name: 'Noche de luciérnagas', icon: '✨', good: true, dur: 70,
    desc: 'Las luciérnagas iluminan la noche. Tus científicas se inspiran: +Saber.',
    weight: () => (isNight() ? 4 : 0),
    start: e => { const n = playerNest(); e.x = n.x; e.y = n.y; },
    update: (_e, dt) => { G.S.colonies[0].res.science += 0.6 * dt; },
  },
  {
    id: 'quake', name: 'Temblor de tierra', icon: '🌋', good: true, dur: 0,
    desc: 'La tierra ha temblado y ha removido el subsuelo: hay nuevos tesoros enterrados.',
    weight: () => 1.2,
    start: e => {
      const n = G.S.nest; e.x = 0; e.y = 0;
      let added = 0;
      for (let k = 0; k < 200 && added < 14; k++) {
        const x = 2 + Math.floor(Math.random() * (n.W - 4)), y = NEST_SKY + 4 + Math.floor(Math.random() * (n.H - NEST_SKY - 6));
        const i = y * n.W + x;
        if (n.grid[i] === 0 && !n.treas[i]) { n.treas[i] = 1 + Math.floor(Math.random() * 4); added++; }
      }
    },
  },
  {
    id: 'spiders', name: 'Migración de arañas', icon: '🕷️', good: false, dur: 0,
    desc: 'Arañas lobo hambrientas se dirigen a tu territorio. ¡Prepara a tus soldados!',
    weight: () => (G.S.time > 420 ? 1.6 : 0),
    start: e => {
      const n = playerNest(); const p = edgeSpot(); e.x = p.x; e.y = p.y;
      const k = 1 + Math.min(3, Math.floor(dayNumber() / 2));
      for (let i = 0; i < k; i++) { const c = spawnCreature('spider', p.x + rnd(-20, 20), p.y + rnd(-20, 20)); const t = spotNear(n.x, n.y, 120, 260); c.hx = t.x; c.hy = t.y; c.st = 2; }
    },
  },
  {
    id: 'termites', name: 'Asalto de termitas', icon: '🪳', good: false, dur: 0,
    desc: 'Una columna de termitas soldado avanza hacia tu hormiguero.',
    weight: () => (G.S.time > 300 ? 1.8 : 0),
    start: e => {
      const n = playerNest(); const p = spotNear(n.x, n.y, 500, 800); e.x = p.x; e.y = p.y;
      const k = 6 + Math.min(18, Math.floor(G.S.time / 120));
      for (let i = 0; i < k; i++) { const c = spawnCreature('termite', p.x + rnd(-25, 25), p.y + rnd(-25, 25)); c.tid = 0; c.angry = 40; c.a = Math.atan2(n.y - p.y, n.x - p.x); (c as any).march = { x: n.x, y: n.y }; }
    },
    update: (_e, dt) => {
      // las termitas marchan hacia el nido
      for (const c of G.S.creatures) {
        const m = (c as any).march;
        if (!m || c.tid) continue;
        const ang = Math.atan2(m.y - c.y, m.x - c.x);
        c.a = ang; c.x += Math.cos(ang) * 22 * dt; c.y += Math.sin(ang) * 22 * dt;
        if (!passableAt(c.x, c.y)) { c.x = c.px; c.y = c.py; c.a += 1; }
      }
    },
  },
  {
    id: 'bird', name: '¡Un pájaro en el cielo!', icon: '🐦', good: false, dur: 9,
    desc: 'Una sombra enorme barre el suelo. Las hormigas bajo ella corren peligro.',
    weight: () => (G.S.time > 240 ? 1.4 : 0),
    start: e => {
      const W = WORLD.W; const n = playerNest();
      const tgt = spotNear(n.x, n.y, 60, 350);
      const ang = Math.random() * Math.PI * 2;
      const L = Math.max(W.w, W.h) * TS * 0.6;
      e.x = tgt.x; e.y = tgt.y;
      e.data = { x0: tgt.x - Math.cos(ang) * L, y0: tgt.y - Math.sin(ang) * L, x1: tgt.x + Math.cos(ang) * L, y1: tgt.y + Math.sin(ang) * L, ang, bx: 0, by: 0, hits: {} };
    },
    update: (e, _dt) => {
      const d = e.data; const k = clamp((e.t - 2.5) / (e.dur - 2.5), 0, 1);
      d.bx = d.x0 + (d.x1 - d.x0) * k; d.by = d.y0 + (d.y1 - d.y0) * k;
      if (e.t > 2.5 && e.t < e.dur) {
        eachAnt(d.bx, d.by, 46, a => {
          if (d.hits[a.id]) return;
          if (Math.random() < 0.55) { d.hits[a.id] = 1; (G.S as any)._lastSrc = 'bird'; damage(0, a.id, 45, -1, null); (G.S as any)._lastSrc = ''; }
          else d.hits[a.id] = 1;
        });
      }
    },
  },
  {
    id: 'raid', name: 'Incursión enemiga', icon: '⚔️', good: false, dur: 0,
    desc: 'Una colonia rival ha decidido atacarte antes de lo previsto.',
    weight: () => (G.S.time > 480 && G.S.colonies.some(c => !c.isPlayer && c.alive) ? 1.5 : 0),
    start: e => { const r = G.S.colonies.filter(c => !c.isPlayer && c.alive); const c = r[Math.floor(Math.random() * r.length)]; if (c) launchWave(c, 0); e.x = 0; e.y = 0; },
  },
  {
    id: 'rhino', name: 'El Escarabajo Rinoceronte', icon: '🪲', good: false, dur: 0,
    desc: 'Un escarabajo colosal custodia un tesoro de azúcar y ámbar. ¿Te atreverás?',
    weight: () => (G.S.time > 600 ? 0.9 : 0),
    start: e => {
      const p = randomWildSpot(500); if (!p) return; e.x = p.x; e.y = p.y;
      spawnBossNear('beetle', p.x, p.y, 'Escarabajo Rinoceronte');
      addNode({ kind: 'sugar', x: p.x + 20, y: p.y + 10, amt: 300, max: 300, regen: 0, r: 13, name: 'Tesoro de azúcar', decay: 1200 });
      addNode({ kind: 'amber', x: p.x - 18, y: p.y - 8, amt: 60, max: 60, regen: 0, r: 8, name: 'Ámbar antiguo', decay: 1200 });
    },
  },
  {
    id: 'mantis', name: 'La Mantis despierta', icon: '🦗', good: false, dur: 0,
    desc: 'Una mantis religiosa gigante acecha entre la hierba. Solo un gran ejército puede con ella.',
    weight: () => (dayNumber() >= 3 && !G.S.creatures.some(c => c.type === 'mantis') ? 0.8 : 0),
    start: e => { const p = randomWildSpot(450); if (!p) return; e.x = p.x; e.y = p.y; spawnBossNear('mantis', p.x, p.y, 'Mantis Esmeralda'); },
  },
];
export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map(e => [e.id, e]));

export function updateEvents(dt: number) {
  const S = G.S;
  S.nextEvent -= dt;
  if (S.nextEvent <= 0) {
    S.nextEvent = 150 + Math.random() * 150;
    triggerRandomEvent();
  }
  for (let i = S.events.length - 1; i >= 0; i--) {
    const e = S.events[i];
    e.t += dt;
    EVENT_BY_ID[e.id]?.update?.(e, dt);
    if (e.t >= e.dur) S.events.splice(i, 1);
  }
}

export function triggerRandomEvent(id?: string) {
  const S = G.S;
  let def: EventDef | undefined;
  if (id) def = EVENT_BY_ID[id];
  else {
    const ws = EVENTS.map(e => Math.max(0, e.weight()));
    let tot = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < EVENTS.length; i++) { r -= ws[i]; if (r <= 0) { def = EVENTS[i]; break; } }
  }
  if (!def) return;
  const e: GameEvent = { id: def.id, t: 0, dur: def.dur, x: 0, y: 0 };
  def.start(e);
  if (def.dur > 0) S.events.push(e);
  S.stats.events++;
  emit('worldEvent', { def, e });
}
