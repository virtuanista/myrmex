// Terreno de superficie: se regenera de forma determinista a partir de la semilla.
import { BIOMES, BiomeId, MAP_SIZES, ZONE_PREFIX, ZONE_SUFFIX } from './defs';
import type { GameConfig } from './state';
import { TS } from './state';
import { Noise, RNG, clamp, dist2 } from '../core/util';

export const enum T { Grass = 0, Dirt, Sand, Water, Rock, Trunk, Moss, Clover }

export interface Prop {
  k: 'rock' | 'tree' | 'flower' | 'tuft' | 'twig' | 'pebble' | 'shroom' | 'clover' | 'stump' | 'leaf' | 'reed' | 'tile';
  x: number; y: number; r: number; c: number; rot: number; tall: boolean;
}

export interface World {
  w: number; h: number; biome: BiomeId;
  tiles: Uint8Array; pass: Uint8Array;
  props: Prop[]; tallProps: Prop[];
  spots: { x: number; y: number }[];
  trees: Prop[]; rocks: Prop[];
  zones: { name: string; x: number; y: number }[];
  lairs: { x: number; y: number }[];
  seed: number;
}

export const WORLD: { W: World } = { W: null as unknown as World };

export function passableAt(px: number, py: number): boolean {
  const W = WORLD.W;
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tx < 0 || ty < 0 || tx >= W.w || ty >= W.h) return false;
  return W.pass[ty * W.w + tx] === 1;
}
export function tileAt(px: number, py: number): number {
  const W = WORLD.W;
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tx < 0 || ty < 0 || tx >= W.w || ty >= W.h) return T.Rock;
  return W.tiles[ty * W.w + tx];
}

export function generateWorld(cfg: GameConfig): World {
  const { w, h } = MAP_SIZES[cfg.size];
  const rng = new RNG(cfg.seed * 7 + 13);
  const n1 = new Noise(cfg.seed + 1), n2 = new Noise(cfg.seed + 2), n3 = new Noise(cfg.seed + 3);
  const tiles = new Uint8Array(w * h);
  const biome = cfg.biome;
  const props: Prop[] = [];
  const trees: Prop[] = [];
  const rocks: Prop[] = [];

  // --- Posiciones de colonias (lo primero, para despejarlas) ---
  const total = cfg.rivals + 1;
  const spots: { x: number; y: number }[] = [];
  const margin = 16;
  // jugador
  const pAng = rng.range(0, Math.PI * 2);
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.36;
  for (let i = 0; i < total; i++) {
    const a = pAng + (i / total) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const rr = R * rng.range(0.85, 1.1) * (total === 2 ? 1.15 : 1);
    spots.push({
      x: Math.round(clamp(cx + Math.cos(a) * rr * (w / Math.min(w, h)), margin, w - margin)),
      y: Math.round(clamp(cy + Math.sin(a) * rr, margin, h - margin)),
    });
  }
  const nearSpot = (x: number, y: number, r: number) => spots.some(s => dist2(s.x, s.y, x, y) < r * r);

  // --- Terreno base ---
  const b = BIOMES[biome];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = n1.fbm(x / 22, y / 22, 4);
    const e = n2.fbm(x / 30 + 50, y / 30, 3);
    let t: number = T.Grass;
    const sandTh = biome === 'garden' ? 0.62 : 0.72;
    const dirtTh = biome === 'forest' ? 0.36 : 0.32;
    if (m < dirtTh) t = T.Dirt;
    if (e > sandTh) t = T.Sand;
    if (biome === 'forest' && m > 0.62) t = T.Moss;
    if (biome === 'meadow' && m > 0.64) t = T.Clover;
    tiles[y * w + x] = t;
  }

  // --- Charcas ---
  const ponds = Math.round((w * h) / 4200) + (biome === 'garden' ? -1 : 1);
  for (let i = 0; i < ponds; i++) {
    let px = 0, py = 0, tries = 0;
    do { px = rng.int(12, w - 12); py = rng.int(12, h - 12); tries++; } while (nearSpot(px, py, 22) && tries < 50);
    if (tries >= 50) continue;
    const rx = rng.range(4, 9), ry = rng.range(3, 7);
    for (let y = Math.floor(py - ry - 3); y <= py + ry + 3; y++) for (let x = Math.floor(px - rx - 3); x <= px + rx + 3; x++) {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const d = ((x - px) / rx) ** 2 + ((y - py) / ry) ** 2;
      const wob = (n3.v(x / 3, y / 3) - 0.5) * 0.7;
      if (d + wob < 1) tiles[y * w + x] = T.Water;
      else if (d + wob < 1.6 && tiles[y * w + x] !== T.Water) {
        tiles[y * w + x] = T.Dirt;
        if (rng.chance(0.25)) props.push({ k: 'reed', x: (x + rng.next()) * TS, y: (y + rng.next()) * TS, r: rng.range(8, 14), c: rng.int(0, 2), rot: rng.range(-0.3, 0.3), tall: true });
      }
    }
  }

  // --- Rocas ---
  const rockClusters = Math.round((w * h) / (biome === 'garden' ? 1300 : 2200));
  for (let i = 0; i < rockClusters; i++) {
    const px = rng.range(4, w - 4) * TS, py = rng.range(4, h - 4) * TS;
    if (nearSpot(px / TS, py / TS, 13)) continue;
    const k = rng.int(1, 4);
    for (let j = 0; j < k; j++) {
      const r = rng.range(10, j === 0 ? 34 : 20);
      const rp: Prop = { k: 'rock', x: px + rng.range(-30, 30), y: py + rng.range(-30, 30), r, c: rng.int(0, 3), rot: rng.range(0, 6.28), tall: false };
      props.push(rp); rocks.push(rp);
    }
  }

  // --- Árboles ---
  const treeCount = Math.round((w * h) / (biome === 'forest' ? 520 : biome === 'meadow' ? 2600 : 3800));
  for (let i = 0; i < treeCount; i++) {
    const px = rng.range(5, w - 5) * TS, py = rng.range(5, h - 5) * TS;
    if (nearSpot(px / TS, py / TS, 12)) continue;
    if (tiles[Math.floor(py / TS) * w + Math.floor(px / TS)] === T.Water) continue;
    if (trees.some(t => dist2(t.x, t.y, px, py) < 90 * 90)) continue;
    const tr: Prop = { k: 'tree', x: px, y: py, r: rng.range(18, 30), c: rng.int(0, 3), rot: rng.range(0, 6.28), tall: true };
    props.push(tr); trees.push(tr);
  }

  // --- Pasabilidad ---
  const pass = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) pass[i] = tiles[i] === T.Water ? 0 : 1;
  for (const r of rocks) rasterCircle(tiles, pass, w, h, r.x, r.y, r.r - 5, T.Rock);
  for (const t of trees) rasterCircle(tiles, pass, w, h, t.x, t.y, t.r * 0.55, T.Trunk);
  // bordes
  for (let x = 0; x < w; x++) { pass[x] = 0; pass[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { pass[y * w] = 0; pass[y * w + w - 1] = 0; }
  // despejar alrededor de los nidos
  for (const s of spots) {
    for (let y = s.y - 7; y <= s.y + 7; y++) for (let x = s.x - 7; x <= s.x + 7; x++) {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      if ((x - s.x) ** 2 + (y - s.y) ** 2 > 49) continue;
      const i = y * w + x;
      if (pass[i] === 0) { pass[i] = 1; tiles[i] = T.Dirt; }
      else if ((x - s.x) ** 2 + (y - s.y) ** 2 < 10) tiles[i] = T.Dirt;
    }
  }
  // eliminar rocas/props sobre zonas despejadas
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if ((p.k === 'rock' || p.k === 'tree') && nearSpot(p.x / TS, p.y / TS, 6)) props.splice(i, 1);
  }
  ensureConnected(pass, tiles, w, h, spots);

  // --- Props decorativos pequeños ---
  const deco = Math.round(w * h * 0.55);
  for (let i = 0; i < deco; i++) {
    const x = rng.range(1, w - 1), y = rng.range(1, h - 1);
    const ti = tiles[Math.floor(y) * w + Math.floor(x)];
    if (ti === T.Water || ti === T.Rock || ti === T.Trunk) continue;
    const roll = rng.next();
    const px = x * TS, py = y * TS;
    if (ti === T.Sand) {
      if (roll < 0.25) props.push({ k: 'pebble', x: px, y: py, r: rng.range(1.5, 4), c: rng.int(0, 3), rot: rng.range(0, 6.28), tall: false });
      else if (roll < 0.3) props.push({ k: 'twig', x: px, y: py, r: rng.range(8, 18), c: 0, rot: rng.range(0, 6.28), tall: false });
      continue;
    }
    if (roll < 0.42) props.push({ k: 'tuft', x: px, y: py, r: rng.range(5, 11), c: rng.int(0, 3), rot: rng.range(-0.4, 0.4), tall: rng.chance(0.18) });
    else if (roll < 0.52) props.push({ k: 'pebble', x: px, y: py, r: rng.range(1.5, 3.5), c: rng.int(0, 3), rot: rng.range(0, 6.28), tall: false });
    else if (roll < 0.58) props.push({ k: 'twig', x: px, y: py, r: rng.range(8, 20), c: 0, rot: rng.range(0, 6.28), tall: false });
    else if (roll < (biome === 'meadow' ? 0.7 : 0.62)) props.push({ k: 'flower', x: px, y: py, r: rng.range(3, 6), c: rng.int(0, 5), rot: rng.range(-0.3, 0.3), tall: true });
    else if (roll < 0.72 && (ti === T.Clover || biome === 'meadow')) props.push({ k: 'clover', x: px, y: py, r: rng.range(3, 6), c: 0, rot: rng.range(0, 6.28), tall: false });
    else if (roll < 0.76 && biome === 'forest') props.push({ k: 'shroom', x: px, y: py, r: rng.range(3, 7), c: rng.int(0, 3), rot: 0, tall: true });
    else if (roll < 0.82 && biome !== 'garden') props.push({ k: 'leaf', x: px, y: py, r: rng.range(4, 9), c: rng.int(0, 3), rot: rng.range(0, 6.28), tall: false });
    else if (roll < 0.84 && biome === 'garden') props.push({ k: 'tile', x: px, y: py, r: rng.range(10, 18), c: rng.int(0, 2), rot: rng.range(0, 6.28), tall: false });
  }

  // --- Zonas con nombre ---
  const zones: { name: string; x: number; y: number }[] = [];
  const zs = 42;
  const used = new Set<string>();
  for (let zy = 0; zy < Math.ceil(h / zs); zy++) for (let zx = 0; zx < Math.ceil(w / zs); zx++) {
    let name = '';
    for (let k = 0; k < 20; k++) {
      name = rng.pick(ZONE_PREFIX) + ' ' + rng.pick(ZONE_SUFFIX);
      if (!used.has(name)) break;
    }
    used.add(name);
    zones.push({ name, x: Math.min(w - 2, zx * zs + zs / 2), y: Math.min(h - 2, zy * zs + zs / 2) });
  }

  // --- Madrigueras de araña ---
  const lairs: { x: number; y: number }[] = [];
  const lairN = Math.round((w * h) / 6500);
  for (let i = 0; i < lairN * 4 && lairs.length < lairN; i++) {
    const x = rng.int(10, w - 10), y = rng.int(10, h - 10);
    if (nearSpot(x, y, 34)) continue;
    if (pass[y * w + x] === 0) continue;
    if (lairs.some(l => dist2(l.x, l.y, x, y) < 40 * 40)) continue;
    lairs.push({ x, y });
  }

  props.sort((a, b) => a.y - b.y);
  const tallProps = props.filter(p => p.tall);
  return { w, h, biome, tiles, pass, props, tallProps, spots, trees, rocks, zones, lairs, seed: cfg.seed };
}

function rasterCircle(tiles: Uint8Array, pass: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, t: number) {
  const x0 = Math.floor((cx - r) / TS), x1 = Math.floor((cx + r) / TS);
  const y0 = Math.floor((cy - r) / TS), y1 = Math.floor((cy + r) / TS);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (dist2((x + 0.5) * TS, (y + 0.5) * TS, cx, cy) <= r * r) { pass[y * w + x] = 0; tiles[y * w + x] = t; }
  }
}

/** Garantiza que todas las colonias estén conectadas abriendo pasillos */
function ensureConnected(pass: Uint8Array, tiles: Uint8Array, w: number, h: number, spots: { x: number; y: number }[]) {
  const s0 = spots[0];
  for (let k = 1; k < spots.length; k++) {
    const reach = bfs(pass, w, h, s0.x, s0.y);
    const s = spots[k];
    if (reach[s.y * w + s.x]) continue;
    // abrir línea recta
    const steps = Math.max(Math.abs(s.x - s0.x), Math.abs(s.y - s0.y));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(s0.x + (s.x - s0.x) * (i / steps)), y = Math.round(s0.y + (s.y - s0.y) * (i / steps));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * w + (x + dx);
        if (pass[j] === 0) { pass[j] = 1; tiles[j] = T.Dirt; }
      }
    }
  }
}

function bfs(pass: Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  q[qt++] = sy * w + sx; seen[sy * w + sx] = 1;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % w, y = (i / w) | 0;
    const nb = [i - 1, i + 1, i - w, i + w];
    for (let k = 0; k < 4; k++) {
      const j = nb[k];
      if (k === 0 && x === 0) continue;
      if (k === 1 && x === w - 1) continue;
      if (k === 2 && y === 0) continue;
      if (k === 3 && y === h - 1) continue;
      if (!seen[j] && pass[j]) { seen[j] = 1; q[qt++] = j; }
    }
  }
  return seen;
}
