// Creación de una partida nueva.
import { BUILDINGS, COLONY_COLORS, EMBLEMS, NodeKind, RIVAL_NAMES, RIVAL_QUEENS } from './defs';
import { AS, Colony, G, GameConfig, GameState, ResNode, SAVE_VERSION, Structure, TS, emptyRes } from './state';
import { World, WORLD, generateWorld, passableAt } from './world';
import { createNest } from './nest';
import { initPher, PW, PH } from './ants';
import { spawnAnt } from './colony';
import { populateCreatures } from './creatures';
import { initQuests } from './quests';
import { RNG, dist2 } from '../core/util';

function makeColony(id: number, name: string, color: number, emblem: number, queen: string, isPlayer: boolean): Colony {
  return {
    id, name, color, emblem, queenName: queen, isPlayer, alive: true,
    res: emptyRes(), nestId: 0, queenHp: 800, queenMhp: 800,
    techs: [], research: null, researchProg: 0, queue: [], autoWorkers: true,
    alloc: { forage: 0.6, dig: 0.25, inside: 0.15 }, prio: { food: 1, leaves: 0.6, amber: 0.5 },
    rally: null, layTimer: 0,
    ai: { waveTimer: 0, waveN: 0, expandTimer: 240, target: 0, power: 1, workersWanted: 10, spawnTimer: 3, mood: 0 },
    xp: 0, level: 1, deadAt: 0,
  };
}

export function createGame(cfg: GameConfig): GameState {
  const W = generateWorld(cfg);
  WORLD.W = W;
  const S: GameState = {
    v: SAVE_VERSION, cfg, time: 0, tick: 0, speed: 1, paused: false,
    W: W.w, H: W.h, ants: [], creatures: [], nodes: [], structures: [], projectiles: [], colonies: [],
    nest: createNest(cfg.seed), pher: [], wear: new Float32Array(0), fog: new Uint8Array(W.w * W.h),
    zones: W.zones.map(z => ({ ...z, found: false })),
    stats: {
      gathered: emptyRes(), dug: 0, hatched: {}, kills: {}, antKills: 0, coloniesDestroyed: 0, zones: 0, built: 0, chambers: 0,
      decor: 0, techs: 0, events: 0, maxPop: 0, deaths: 0, treasures: 0, upgrades: 0, bosses: 0, poi: 0, maxArmy: 0, delivered: 0, history: [],
    },
    quests: { active: [], done: [], prog: {} }, ach: [],
    weather: { kind: 'clear', t: 0, dur: 0, next: 240 + Math.random() * 120 },
    events: [], nextEvent: 200, nextId: 100,
    view: 'surface', cam: { sx: 0, sy: 0, sz: 1.3, nx: 0, ny: 0, nz: 1.2 },
    log: [], over: 0, victoryShown: false, groups: Array.from({ length: 10 }, () => []), tutorial: 0,
    created: Date.now(), played: 0, slot: 'auto',
  };
  G.S = S;

  // Colonias
  const player = makeColony(0, cfg.colonyName, cfg.color, cfg.emblem, cfg.queenName, true);
  S.colonies.push(player);
  const rng = new RNG(cfg.seed * 13 + 1);
  const colors = COLONY_COLORS.map((_, i) => i).filter(i => i !== cfg.color);
  const names = [...RIVAL_NAMES];
  for (let i = 0; i < cfg.rivals; i++) {
    const ci = colors.splice(rng.int(0, colors.length - 1), 1)[0];
    const nm = names.splice(rng.int(0, names.length - 1), 1)[0];
    const c = makeColony(i + 1, nm, ci, rng.int(0, EMBLEMS.length - 1), rng.pick(RIVAL_QUEENS), false);
    c.ai.waveTimer = (440 + rng.range(0, 120) + i * 70) * [1.6, 1, 0.75, 0.55][cfg.difficulty];
    c.res.food = 120;
    S.colonies.push(c);
  }

  // Estructuras de nido
  S.colonies.forEach((c, i) => {
    const sp = W.spots[i];
    const type = c.isPlayer ? 'nest' : 'rivalnest';
    const s: Structure = { id: S.nextId++, type, col: c.id, x: (sp.x + 0.5) * TS, y: (sp.y + 0.5) * TS, hp: BUILDINGS[type].hp, mhp: BUILDINGS[type].hp, built: true, prog: 0, cd: 0, t: 0, lvl: 1 };
    S.structures.push(s);
    c.nestId = s.id;
  });

  // Recursos iniciales
  const sr = [{ food: 60, leaves: 20, soil: 10, amber: 0, science: 0 }, { food: 120, leaves: 45, soil: 30, amber: 5, science: 10 }, { food: 260, leaves: 110, soil: 80, amber: 25, science: 40 }][cfg.startRes];
  Object.assign(player.res, sr);

  // Feromonas
  initPher();
  S.pher = S.colonies.map(() => new Float32Array(PW * PH));
  S.wear = new Float32Array(PW * PH);

  genNodes(S, W, cfg);

  // Hormigas iniciales
  const home = S.structures[0];
  for (let i = 0; i < 10; i++) {
    const a = spawnAnt(0, 'worker', 0, home.x + (Math.random() - 0.5) * 30, home.y + (Math.random() - 0.5) * 30);
    a.st = AS.Search; a.role = i < 7 ? 'forage' : i < 9 ? 'dig' : 'inside';
  }
  for (let i = 0; i < 2; i++) { const a = spawnAnt(0, 'soldier', 0, home.x + (Math.random() - 0.5) * 20, home.y + 30); a.st = AS.Guard; }
  for (const c of S.colonies) {
    if (c.isPlayer) continue;
    const n = S.structures.find(s => s.id === c.nestId)!;
    for (let i = 0; i < 10; i++) { const a = spawnAnt(c.id, 'worker', 0, n.x + (Math.random() - 0.5) * 30, n.y + (Math.random() - 0.5) * 30); a.st = AS.Search; }
    for (let i = 0; i < 4; i++) { const a = spawnAnt(c.id, 'soldier', 0, n.x + (Math.random() - 0.5) * 30, n.y + (Math.random() - 0.5) * 30); a.st = AS.Guard; }
  }

  populateCreatures(0, true);
  initQuests(S);
  // cámara
  S.cam.sx = home.x; S.cam.sy = home.y;
  S.cam.nx = S.nest.ex * 12; S.cam.ny = (S.nest.ey + 14) * 12;
  return S;
}

function genNodes(S: GameState, W: World, cfg: GameConfig) {
  const rng = new RNG(cfg.seed * 91 + 3);
  const area = (W.w * W.h) / 10000;
  const b = cfg.biome;
  const add = (kind: NodeKind, x: number, y: number, amt: number, regen: number, r: number, extra: Partial<ResNode> = {}) => {
    if (!passableAt(x, y)) return;
    S.nodes.push({ id: S.nextId++, kind, x, y, amt, max: amt, regen, r, v: rng.next(), ...extra });
  };
  const randPos = (minNest = 90) => {
    for (let k = 0; k < 30; k++) {
      const x = rng.range(3, W.w - 3) * TS, y = rng.range(3, W.h - 3) * TS;
      if (!passableAt(x, y)) continue;
      if (S.structures.some(s => dist2(s.x, s.y, x, y) < minNest * minNest)) continue;
      return { x, y };
    }
    return null;
  };
  const scatter = (kind: NodeKind, n: number, amt: [number, number], regen: number, r: number) => {
    for (let i = 0; i < n; i++) { const p = randPos(); if (p) add(kind, p.x, p.y, Math.round(rng.range(amt[0], amt[1])), regen, r); }
  };
  scatter('berry', Math.round(area * (b === 'meadow' ? 8 : 5)), [60, 95], 0.12, 11);
  scatter('seeds', Math.round(area * 10), [35, 70], 0, 7);
  scatter('nectar', Math.round(area * (b === 'meadow' ? 7 : 3)), [18, 28], 0.1, 6);
  if (b === 'forest') scatter('mushroom', Math.round(area * 7), [40, 60], 0.05, 8);
  if (b === 'garden') scatter('crumbs', Math.round(area * 9), [20, 35], 0, 6);
  // hojas cerca de árboles
  for (const t of W.trees) {
    const k = rng.int(1, 3);
    for (let i = 0; i < k; i++) {
      const a = rng.range(0, 6.28), r = t.r + rng.range(12, 50);
      add('leaf', t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, Math.round(rng.range(35, 60)), 0.1, 9);
    }
    if (rng.chance(b === 'forest' ? 0.35 : 0.5)) { const a = rng.range(0, 6.28); add('amber', t.x + Math.cos(a) * (t.r * 0.6 + 6), t.y + Math.sin(a) * (t.r * 0.6 + 6), Math.round(rng.range(18, 32)), 0.02, 6); }
  }
  scatter('leaf', Math.round(area * 5), [30, 50], 0.08, 9);
  scatter('amber', Math.round(area * 1.5), [15, 25], 0.015, 6);
  // cerca de cada colonia
  for (const s of S.structures) {
    const ring = (kind: NodeKind, rmin: number, rmax: number, amt: number, regen: number, r: number) => {
      for (let k = 0; k < 30; k++) {
        const a = rng.range(0, 6.28), rr = rng.range(rmin, rmax);
        const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr;
        if (passableAt(x, y)) { add(kind, x, y, amt, regen, r); return; }
      }
    };
    ring('seeds', 80, 170, 60, 0, 7); ring('seeds', 120, 220, 50, 0, 7);
    ring('berry', 150, 260, 80, 0.12, 11);
    ring('leaf', 110, 230, 50, 0.1, 9); ring('leaf', 160, 280, 45, 0.1, 9);
    ring('amber', 260, 400, 25, 0.02, 6);
  }
  // lugares legendarios
  const pois: [NodeKind, string, number, number, number][] = [
    ['sugar', 'Terrón de azúcar gigante', 520, 0, 15],
    ['fruit', 'Manzana caída', 420, 0, 18],
    ['amber', 'Fuente de savia', 160, 0.06, 10],
    ['seeds', 'Bellota dorada', 300, 0, 13],
    ['sugar', b === 'garden' ? 'Lata de refresco' : 'Panal abandonado', 800, 0, 16],
    ['nectar', 'Flor de la luna', 120, 0.3, 12],
  ];
  for (const [kind, name, amt, regen, r] of pois) {
    const p = randPos(520);
    if (p) add(kind, p.x, p.y, amt, regen, r, { name, poi: true, found: false });
  }
}
