import type { BiomeId, BuildingType, CasteId, ChamberType, CreatureType, MapSizeId, NodeKind, ResKey } from './defs';

export const TS = 16;          // tamaño de casilla de superficie (px)
export const PS = 8;           // resolución del mapa de feromonas (px)
export const NTS = 12;         // tamaño de casilla del hormiguero (px)
export const NEST_W = 120;
export const NEST_H = 80;
export const NEST_SKY = 7;     // filas de "cielo" sobre la superficie del corte
export const DT = 1 / 30;      // paso fijo de simulación
export const SAVE_VERSION = 3;

export type Res = Record<ResKey, number>;

export interface GameConfig {
  playerName: string;
  colonyName: string;
  queenName: string;
  color: number;
  emblem: number;
  biome: BiomeId;
  size: MapSizeId;
  rivals: number;
  difficulty: number;
  seed: number;
  mode: 'conquest' | 'sandbox';
  startRes: 0 | 1 | 2;
  creatures: number; // 0..2 densidad
}

// Estados de hormiga
export const enum AS {
  Idle = 0, Search, ToNode, Harvest, Return, Move, Attack, Flee, Build, Guard,
  NestWalk, NestWork, NestDig, ToExit, Explore, Found, Dead,
}
export type Role = 'forage' | 'dig' | 'inside' | 'army';

export interface Order {
  k: 'move' | 'attack' | 'gather' | 'build' | 'found' | 'patrol';
  x: number; y: number; id: number; am: boolean;
  x2?: number; y2?: number; leg?: number;
}

export interface Ant {
  id: number; col: number; caste: CasteId;
  layer: 0 | 1;
  x: number; y: number; px: number; py: number; a: number;
  hp: number; mhp: number;
  st: AS; role: Role;
  carry: ResKey | null; ca: number;
  tx: number; ty: number; tid: number;
  order: Order | null;
  t: number; ph: number; str: number; cd: number;
  rank: number; kills: number; age: number;
  task: string;        // tarea dentro del nido (clave de campo de flujo)
  stuck: number;
  lastHit: number;     // tiempo del último golpe recibido
  sx: number; sy: number; // última posición válida
  tk: number;          // tipo de objetivo 0 hormiga 1 criatura 2 estructura
  gx: number; gy: number; // punto de guardia
  w: number;           // espera
  mem: number;         // nodo recordado
}

export interface Creature {
  id: number; type: CreatureType;
  x: number; y: number; px: number; py: number; a: number;
  hp: number; mhp: number; st: number; t: number; cd: number; ph: number;
  tx: number; ty: number; tid: number; tk: number; // tk: 0 hormiga 1 criatura 2 estructura
  hx: number; hy: number;
  angry: number; prod: number; boss?: boolean; name?: string;
}

export interface ResNode {
  id: number; kind: NodeKind; x: number; y: number;
  amt: number; max: number; regen: number; r: number; v: number;
  name?: string; poi?: boolean; found?: boolean; decay?: number;
}

export interface Structure {
  id: number; type: BuildingType; col: number; x: number; y: number;
  hp: number; mhp: number; built: boolean; prog: number; cd: number; t: number;
  lvl: number;
}

export interface Projectile {
  x: number; y: number; sx: number; sy: number; tx: number; ty: number;
  t: number; dur: number; dmg: number; col: number; tid: number; tk: number; splash: number;
  pierce: boolean;
}

export interface ColonyAI {
  waveTimer: number; waveN: number; expandTimer: number; target: number;
  power: number; workersWanted: number; spawnTimer: number; mood: number;
}

export interface Colony {
  id: number; name: string; color: number; emblem: number; queenName: string;
  isPlayer: boolean; alive: boolean;
  res: Res; nestId: number;
  queenHp: number; queenMhp: number;
  techs: string[]; research: string | null; researchProg: number;
  queue: CasteId[]; autoWorkers: boolean;
  alloc: { forage: number; dig: number; inside: number };
  prio: { food: number; leaves: number; amber: number };
  rally: { x: number; y: number } | null;
  layTimer: number;
  ai: ColonyAI;
  xp: number; level: number;
  deadAt: number;
}

export interface Chamber {
  id: number; type: ChamberType; cx: number; cy: number; rx: number; ry: number;
  level: number; state: 0 | 1; // 0 en excavación, 1 activa
  decor: { k: string; x: number; y: number }[];
  t: number;
}

export interface Brood {
  id: number; caste: CasteId; prog: number; ch: number; x: number; y: number; fed: number;
}

export interface NestState {
  W: number; H: number;
  grid: Uint8Array;    // 0 tierra, 1 abierto, 2 roca, 3 cielo
  treas: Uint8Array;   // 0 nada, 1 ámbar, 2 fósil, 3 cristal, 4 raíz dulce
  dig: Uint8Array;     // designación de excavación
  digp: Float32Array;  // progreso de excavación
  chambers: Chamber[];
  brood: Brood[];
  ex: number; ey: number; // casilla de la entrada
  queenX: number; queenY: number; queenA: number;
}

export interface Zone { name: string; x: number; y: number; found: boolean }

export interface Stats {
  gathered: Res; dug: number; hatched: Record<string, number>; kills: Record<string, number>;
  antKills: number; coloniesDestroyed: number; zones: number; built: number; chambers: number;
  decor: number; techs: number; events: number; maxPop: number; deaths: number; treasures: number;
  upgrades: number; bosses: number; poi: number; maxArmy: number; delivered: number;
  history: { t: number; pop: number; army: number; food: number }[];
}

export interface WeatherState { kind: 'clear' | 'rain' | 'storm' | 'heat' | 'fog'; t: number; dur: number; next: number }
export interface GameEvent { id: string; t: number; dur: number; x: number; y: number; data?: any }

export interface Msg { t: number; text: string; kind: string; x?: number; y?: number }

export interface GameState {
  v: number;
  cfg: GameConfig;
  time: number; tick: number; speed: number; paused: boolean;
  W: number; H: number;
  ants: Ant[]; creatures: Creature[]; nodes: ResNode[]; structures: Structure[]; projectiles: Projectile[];
  colonies: Colony[];
  nest: NestState;
  pher: Float32Array[];   // rastro de comida por colonia
  wear: Float32Array;     // desgaste de caminos
  fog: Uint8Array;        // 0 sin explorar, 1 explorado
  zones: Zone[];
  stats: Stats;
  quests: { active: string[]; done: string[]; prog: Record<string, number> };
  ach: string[];
  weather: WeatherState;
  events: GameEvent[]; nextEvent: number;
  nextId: number;
  view: 'surface' | 'nest';
  cam: { sx: number; sy: number; sz: number; nx: number; ny: number; nz: number };
  log: Msg[];
  over: 0 | 1 | 2; // 0 jugando, 1 victoria, 2 derrota
  victoryShown: boolean;
  groups: number[][];
  tutorial: number;
  created: number; played: number;
  slot: string;
}

/** Contenedor global mutable */
export const G: { S: GameState } = { S: null as unknown as GameState };

export const newId = () => G.S.nextId++;
export const emptyRes = (): Res => ({ food: 0, leaves: 0, soil: 0, amber: 0, science: 0 });
