// Sprites procedurales cacheados: hormigas, criaturas, props.
import { COLONY_COLORS, CasteId, CreatureType } from '../game/defs';
import { TAU, shade } from '../core/util';

export const RES = 3; // resolución interna de sprites
export interface Spr { c: HTMLCanvasElement; w: number; h: number; ox: number; oy: number }

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
  const g = c.getContext('2d')!;
  g.scale(RES, RES);
  return [c, g];
}

// ------------------------------- HORMIGAS -------------------------------
export const ANT_FRAMES = 6;
const antCache = new Map<string, Spr>();

interface Shape { gx: number; grx: number; gry: number; tx: number; trx: number; try_: number; hx: number; hr: number; mand: number; leg: number; ant: number; wings?: boolean; stripes?: boolean; acid?: boolean; legW: number; queen?: boolean; spike?: boolean }
const SHAPES: Record<CasteId, Shape> = {
  worker: { gx: -5, grx: 3.9, gry: 3.0, tx: 0.8, trx: 2.4, try_: 1.35, hx: 4.4, hr: 2.0, mand: 1.6, leg: 1, ant: 1, legW: 0.55 },
  scout: { gx: -5.2, grx: 3.3, gry: 2.4, tx: 0.8, trx: 2.6, try_: 1.1, hx: 4.6, hr: 1.7, mand: 1.2, leg: 1.45, ant: 1.5, legW: 0.45 },
  soldier: { gx: -5.2, grx: 3.8, gry: 3.0, tx: 0.6, trx: 2.5, try_: 1.5, hx: 4.9, hr: 2.9, mand: 2.6, leg: 1.05, ant: 0.9, legW: 0.65, spike: true },
  harvester: { gx: -5.2, grx: 4.2, gry: 3.3, tx: 0.7, trx: 2.6, try_: 1.6, hx: 4.8, hr: 2.5, mand: 2.3, leg: 1.1, ant: 1, legW: 0.6, spike: true },
  acid: { gx: -5.6, grx: 4.8, gry: 3.8, tx: 0.7, trx: 2.3, try_: 1.3, hx: 4.4, hr: 2.0, mand: 1.4, leg: 1, ant: 1.05, legW: 0.55, acid: true },
  major: { gx: -5.6, grx: 4.2, gry: 3.4, tx: 0.4, trx: 2.6, try_: 1.8, hx: 5.4, hr: 4.0, mand: 3.6, leg: 1, ant: 0.8, legW: 0.8, spike: true },
  princess: { gx: -5.8, grx: 4.6, gry: 3.2, tx: 0.8, trx: 2.9, try_: 1.9, hx: 4.9, hr: 2.1, mand: 1.4, leg: 1.1, ant: 1.1, legW: 0.55, wings: true, stripes: true },
  queen: { gx: -7.2, grx: 6.4, gry: 4.4, tx: 0.8, trx: 3.0, try_: 2.1, hx: 5.0, hr: 2.4, mand: 1.6, leg: 1.1, ant: 1.1, legW: 0.7, stripes: true, queen: true },
};

export function antSprite(colorIdx: number, caste: CasteId, frame: number, size: number): Spr {
  const key = colorIdx + '|' + caste + '|' + frame;
  let s = antCache.get(key);
  if (s) return s;
  const col = COLONY_COLORS[colorIdx] || COLONY_COLORS[0];
  const sh = SHAPES[caste];
  const scale = size * 0.95;
  const W = 34 * scale, H = 30 * scale;
  const [c, g] = mk(W, H);
  g.translate(W / 2, H / 2);
  g.scale(scale, scale);
  drawAnt(g, col.body, col.light, sh, frame / ANT_FRAMES);
  s = { c, w: W, h: H, ox: W / 2, oy: H / 2 };
  antCache.set(key, s);
  return s;
}

function drawAnt(g: CanvasRenderingContext2D, body: string, light: string, sh: Shape, phase: number) {
  const dark = shade(body, -0.55);
  const mid = body;
  // alas (princesa)
  if (sh.wings) {
    g.save();
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.ellipse(-4.5, sgn * 5.2, 7.5, 2.6, sgn * 0.25, 0, TAU);
      g.fillStyle = 'rgba(220,235,255,0.42)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.3; g.stroke();
      g.beginPath(); g.moveTo(1, sgn * 1.5); g.lineTo(-9, sgn * 6.2); g.strokeStyle = 'rgba(140,160,190,0.5)'; g.stroke();
    }
    g.restore();
  }
  // patas
  g.lineCap = 'round'; g.lineJoin = 'round';
  const legBase = [sh.tx - 0.9, sh.tx + 0.1, sh.tx + 1.1];
  const legAng = [2.25, 1.6, 0.95]; // trasera, media, delantera (desde +x)
  for (let i = 0; i < 3; i++) {
    for (const sgn of [-1, 1]) {
      const tripod = (i === 1 ? sgn > 0 : sgn < 0) ? 0 : 0.5;
      const sw = Math.sin((phase + tripod) * TAU);
      const lift = Math.max(0, Math.cos((phase + tripod) * TAU));
      const bx = legBase[i], by = sgn * sh.try_ * 0.6;
      const a = legAng[i] + sw * 0.32 * (i === 1 ? 1 : 0.8);
      const L1 = 3.4 * sh.leg, L2 = 4.2 * sh.leg;
      const kx = bx + Math.cos(Math.PI - a) * L1 * -1, ky = by + sgn * Math.sin(a) * L1;
      const fx = kx + Math.cos(Math.PI - a + (i === 0 ? -0.5 : i === 2 ? 0.5 : 0)) * L2 * -1, fy = ky + sgn * (Math.sin(a) * L2 * 0.8 + lift * 0.4);
      g.strokeStyle = dark; g.lineWidth = sh.legW;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    }
  }
  // gáster
  const gg = g.createRadialGradient(sh.gx + 1, -sh.gry * 0.4, 0.3, sh.gx, 0, sh.grx * 1.2);
  gg.addColorStop(0, light); gg.addColorStop(0.35, mid); gg.addColorStop(1, dark);
  g.fillStyle = gg;
  g.beginPath(); g.ellipse(sh.gx, 0, sh.grx, sh.gry, 0, 0, TAU); g.fill();
  g.strokeStyle = shade(body, -0.7); g.lineWidth = 0.35; g.stroke();
  if (sh.stripes) {
    g.save(); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 0.5;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(sh.gx + k * sh.grx * 0.35, 0, 0.6, sh.gry * 1.1, 0, 0, TAU); g.stroke(); }
    g.restore();
  }
  if (sh.acid) {
    g.fillStyle = 'rgba(160,255,90,0.85)';
    g.beginPath(); g.arc(sh.gx - sh.grx + 0.8, 0, 1.1, 0, TAU); g.fill();
  }
  // brillo gáster
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(sh.gx + sh.grx * 0.15, -sh.gry * 0.45, sh.grx * 0.45, sh.gry * 0.22, -0.2, 0, TAU); g.fill();
  // peciolo
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(sh.gx + sh.grx + 0.4, 0, 0.9, 0.75, 0, 0, TAU); g.fill();
  // tórax
  const tg = g.createLinearGradient(0, -sh.try_, 0, sh.try_);
  tg.addColorStop(0, light); tg.addColorStop(0.5, mid); tg.addColorStop(1, dark);
  g.fillStyle = tg;
  g.beginPath(); g.ellipse(sh.tx, 0, sh.trx, sh.try_, 0, 0, TAU); g.fill();
  g.strokeStyle = shade(body, -0.7); g.lineWidth = 0.3; g.stroke();
  if (sh.spike) { g.fillStyle = dark; g.beginPath(); g.moveTo(sh.tx - sh.trx + 0.5, -0.3); g.lineTo(sh.tx - sh.trx - 0.8, -1.4); g.lineTo(sh.tx - sh.trx + 1.2, -0.9); g.fill(); g.beginPath(); g.moveTo(sh.tx - sh.trx + 0.5, 0.3); g.lineTo(sh.tx - sh.trx - 0.8, 1.4); g.lineTo(sh.tx - sh.trx + 1.2, 0.9); g.fill(); }
  // antenas
  g.strokeStyle = dark; g.lineWidth = 0.38;
  const aw = Math.sin(phase * TAU * 2) * 0.25;
  for (const sgn of [-1, 1]) {
    const bx = sh.hx + sh.hr * 0.55, by = sgn * sh.hr * 0.45;
    const ex = bx + 2.6 * sh.ant, ey = by + sgn * 1.9 * sh.ant;
    const tx = ex + 2.8 * sh.ant, ty = ey - sgn * (0.7 - aw) * sh.ant;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = dark; g.beginPath(); g.arc(tx, ty, 0.35, 0, TAU); g.fill();
  }
  // mandíbulas
  g.fillStyle = shade(body, -0.35); g.strokeStyle = shade(body, -0.75); g.lineWidth = 0.25;
  for (const sgn of [-1, 1]) {
    const bx = sh.hx + sh.hr * 0.75, by = sgn * sh.hr * 0.38;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(bx + sh.mand * 1.1, by + sgn * sh.mand * 0.45, bx + sh.mand * 1.25, by - sgn * sh.mand * 0.3);
    g.quadraticCurveTo(bx + sh.mand * 0.6, by + sgn * sh.mand * 0.05, bx, by - sgn * 0.3);
    g.closePath(); g.fill(); g.stroke();
  }
  // cabeza
  const hg = g.createRadialGradient(sh.hx + 0.3, -sh.hr * 0.45, 0.2, sh.hx, 0, sh.hr * 1.15);
  hg.addColorStop(0, light); hg.addColorStop(0.45, mid); hg.addColorStop(1, dark);
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(sh.hx, 0, sh.hr * 1.05, sh.hr * 0.92, 0, 0, TAU); g.fill();
  g.strokeStyle = shade(body, -0.7); g.lineWidth = 0.32; g.stroke();
  if (sh.queen) {
    g.fillStyle = '#ffd34d';
    g.beginPath();
    const cx = sh.hx - 0.4;
    g.moveTo(cx - 1.1, -1.2); g.lineTo(cx - 0.6, -2.6); g.lineTo(cx, -1.6); g.lineTo(cx + 0.6, -2.6); g.lineTo(cx + 1.1, -1.2); g.closePath(); g.fill();
  }
  // ojos
  g.fillStyle = '#0b0b10';
  for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(sh.hx + sh.hr * 0.35, sgn * sh.hr * 0.62, 0.55, 0.42, 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (const sgn of [-1, 1]) { g.beginPath(); g.arc(sh.hx + sh.hr * 0.42, sgn * sh.hr * 0.62 - 0.15, 0.17, 0, TAU); g.fill(); }
}

let shadowSpr: Spr | null = null;
export function shadowSprite(): Spr {
  if (shadowSpr) return shadowSpr;
  const [c, g] = mk(32, 16);
  const gr = g.createRadialGradient(16, 8, 1, 16, 8, 15);
  gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.scale(1, 0.5); g.beginPath(); g.arc(16, 16, 15, 0, TAU); g.fill();
  shadowSpr = { c, w: 32, h: 16, ox: 16, oy: 8 };
  return shadowSpr;
}

// ------------------------------- CRIATURAS -------------------------------
const creCache = new Map<string, Spr>();
export const CRE_FRAMES = 8;

export function creatureSprite(type: CreatureType, frame: number, boss = false): Spr {
  const key = type + frame + (boss ? 'B' : '');
  let s = creCache.get(key);
  if (s) return s;
  const ph = frame / CRE_FRAMES;
  const size = ({ aphid: 12, caterpillar: 30, beetle: 36, ladybug: 22, spider: 56, mantis: 80, cricket: 34, snail: 32, centipede: 50, termite: 18 } as Record<string, number>)[type] * (boss ? 1.5 : 1);
  const [c, g] = mk(size, size);
  g.translate(size / 2, size / 2);
  const k = size / 40 * (boss ? 1 : 1);
  g.scale(k, k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  DRAW_CRE[type](g, ph, boss);
  s = { c, w: size, h: size, ox: size / 2, oy: size / 2 };
  creCache.set(key, s);
  return s;
}

function legs(g: CanvasRenderingContext2D, n: number, x0: number, x1: number, len: number, ph: number, col: string, w: number, spread = 1) {
  g.strokeStyle = col; g.lineWidth = w;
  for (let i = 0; i < n; i++) {
    const bx = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1));
    for (const sgn of [-1, 1]) {
      const sw = Math.sin((ph + (i % 2 ? 0.5 : 0) + (sgn > 0 ? 0.5 : 0)) * TAU) * 0.35;
      const a = (Math.PI / 2) * spread + (i - (n - 1) / 2) * -0.35 + sw;
      const kx = bx + Math.cos(a) * len * 0.55 * -Math.sign(i - (n - 1) / 2 || 1) * 0.3, ky = sgn * len * 0.55;
      const fx = kx + Math.cos(a) * len * 0.5 * (i < n / 2 ? -1 : 1) * 0.6, fy = ky + sgn * len * 0.45;
      g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo(kx, ky - sgn * len * 0.15, fx, fy); g.stroke();
    }
  }
}
function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, light: string, mid: string, dark: string, stroke = true) {
  const gr = g.createRadialGradient(x + rx * 0.2, y - ry * 0.4, 0.5, x, y, Math.max(rx, ry) * 1.15);
  gr.addColorStop(0, light); gr.addColorStop(0.45, mid); gr.addColorStop(1, dark);
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  if (stroke) { g.strokeStyle = shade(dark, -0.4); g.lineWidth = 0.6; g.stroke(); }
}
function shine(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.4) {
  g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, -0.3, 0, TAU); g.fill();
}

const DRAW_CRE: Record<CreatureType, (g: CanvasRenderingContext2D, ph: number, boss: boolean) => void> = {
  aphid: (g, ph) => {
    legs(g, 3, -4, 4, 10, ph, '#3d7a2a', 1.2);
    blob(g, -1, 0, 11, 9, '#d9ff9c', '#8fd14f', '#4b8a2a');
    blob(g, 10, 0, 5, 4.5, '#c9f58c', '#7dbd44', '#3f7a22');
    g.strokeStyle = '#3d7a2a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-9, -5); g.lineTo(-15, -8); g.moveTo(-9, 5); g.lineTo(-15, 8); g.stroke();
    shine(g, 1, -4, 5, 2);
  },
  caterpillar: (g, ph) => {
    for (let i = 5; i >= 0; i--) {
      const x = -15 + i * 6, y = Math.sin(ph * TAU + i * 0.9) * 1.6;
      blob(g, x, y, 4.8, 5.5 - (i === 5 ? 0 : 0.2), '#d6ff8a', i % 2 ? '#86c23c' : '#9bd447', '#4f7f1f', false);
      g.fillStyle = '#2d4a12'; g.beginPath(); g.arc(x, y - 4, 0.9, 0, TAU); g.arc(x, y + 4, 0.9, 0, TAU); g.fill();
      if (i % 2 === 0) { g.fillStyle = '#ffdc4a'; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
    }
    blob(g, 17, Math.sin(ph * TAU + 5.4) * 1.6, 5.5, 5.5, '#ffe6a8', '#e0a83a', '#8a5a14');
    g.fillStyle = '#111'; g.beginPath(); g.arc(19, -2 + Math.sin(ph * TAU + 5.4) * 1.6, 1, 0, TAU); g.arc(19, 2 + Math.sin(ph * TAU + 5.4) * 1.6, 1, 0, TAU); g.fill();
  },
  beetle: (g, ph, boss) => {
    legs(g, 3, -6, 6, 15, ph, '#16121c', 1.8);
    blob(g, -2, 0, 14, 12, boss ? '#9fe3ff' : '#8ad1ff', boss ? '#2d5a8a' : '#2a4f7c', '#0c1830');
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-15, 0); g.lineTo(10, 0); g.stroke();
    shine(g, 0, -6, 7, 2.5, 0.45);
    blob(g, 13, 0, 5, 6, '#7a8aa8', '#2b3448', '#0f1420');
    g.strokeStyle = '#1b2233'; g.lineWidth = boss ? 3 : 2;
    g.beginPath(); g.moveTo(17, 0); g.quadraticCurveTo(24, -1, 23, -8); g.stroke();
    if (boss) { g.beginPath(); g.moveTo(17, 0); g.quadraticCurveTo(26, 3, 28, -12); g.stroke(); }
  },
  ladybug: (g, ph) => {
    legs(g, 3, -4, 4, 11, ph, '#111', 1.3);
    blob(g, -1, 0, 12, 11, '#ff8a7a', '#e2261b', '#7a0c06');
    g.strokeStyle = '#1a0604'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-13, 0); g.lineTo(9, 0); g.stroke();
    g.fillStyle = '#140707';
    for (const [x, y, r] of [[-6, -5, 2.4], [-6, 5, 2.4], [2, -6, 2], [2, 6, 2], [-2, 0, 1.7]] as number[][]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    blob(g, 11, 0, 4.2, 6, '#555', '#1a1a1a', '#000');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(12, -3, 1.2, 0, TAU); g.arc(12, 3, 1.2, 0, TAU); g.fill();
    shine(g, 0, -6, 5, 2);
  },
  spider: (g, ph) => {
    g.strokeStyle = '#2a1d12'; g.lineWidth = 2.1;
    for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) {
      const sw = Math.sin((ph + (i % 2) * 0.5 + (sgn > 0 ? 0.25 : 0)) * TAU) * 0.25;
      const a = -0.9 + i * 0.6 + sw;
      const kx = 3 + Math.cos(a) * 10, ky = sgn * (6 + Math.sin(Math.abs(a)) * 6);
      const fx = 3 + Math.cos(a) * 19, fy = sgn * 17;
      g.beginPath(); g.moveTo(3, sgn * 2); g.quadraticCurveTo(kx, ky - sgn * 6, fx, fy); g.stroke();
    }
    blob(g, -8, 0, 11, 9, '#a07850', '#5a3d22', '#22150a');
    g.fillStyle = 'rgba(30,18,8,0.7)';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-8 - i * 3 + 3, 0, 1.5, 4 - i, 0, 0, TAU); g.fill(); }
    blob(g, 5, 0, 6.5, 5.5, '#9b7a52', '#4f3820', '#1e130a');
    g.fillStyle = '#000';
    for (const [x, y, r] of [[10, -2, 1.3], [10, 2, 1.3], [9, -3.5, 0.8], [9, 3.5, 0.8]] as number[][]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(10.4, -2.3, 0.4, 0, TAU); g.arc(10.4, 1.7, 0.4, 0, TAU); g.fill();
  },
  mantis: (g, ph) => {
    g.strokeStyle = '#3f7d1e'; g.lineWidth = 1.8;
    for (let i = 0; i < 2; i++) for (const sgn of [-1, 1]) {
      const sw = Math.sin((ph + i * 0.5 + (sgn > 0 ? 0.5 : 0)) * TAU) * 0.2;
      const bx = -2 - i * 4;
      g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx - 6 + sw * 8, sgn * 12); g.lineTo(bx - 12 + sw * 8, sgn * 18); g.stroke();
    }
    blob(g, -12, 0, 13, 5, '#d6ff9a', '#6fbf35', '#2d5c12');
    g.strokeStyle = 'rgba(40,80,20,0.6)'; g.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-20 + i * 4, -4.5); g.lineTo(-20 + i * 4, 4.5); g.stroke(); }
    blob(g, 2, 0, 9, 2.6, '#c6f58a', '#5fae2c', '#2a5510');
    // brazos raptores
    const strike = Math.max(0, Math.sin(ph * TAU)) * 0.3;
    for (const sgn of [-1, 1]) {
      g.strokeStyle = '#4c9a22'; g.lineWidth = 2.8;
      g.beginPath(); g.moveTo(8, sgn * 1.5); g.lineTo(15 + strike * 10, sgn * 6); g.lineTo(11 + strike * 12, sgn * 2.5); g.stroke();
      g.strokeStyle = '#c4ff7a'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(15 + strike * 10, sgn * 6); g.lineTo(11 + strike * 12, sgn * 2.5); g.stroke();
    }
    g.save(); g.translate(13, 0);
    g.fillStyle = '#7fcf3e'; g.beginPath(); g.moveTo(0, -5); g.lineTo(6, 0); g.lineTo(0, 5); g.closePath(); g.fill();
    g.fillStyle = '#e8ff9a'; g.beginPath(); g.arc(0.5, -4, 1.8, 0, TAU); g.arc(0.5, 4, 1.8, 0, TAU); g.fill();
    g.fillStyle = '#202'; g.beginPath(); g.arc(1, -4, 0.7, 0, TAU); g.arc(1, 4, 0.7, 0, TAU); g.fill();
    g.restore();
  },
  cricket: (g, ph) => {
    legs(g, 2, 2, 6, 10, ph, '#3a2614', 1.2);
    g.strokeStyle = '#4a3018'; g.lineWidth = 2.2;
    for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(-2, sgn * 3); g.lineTo(-6, sgn * 11); g.lineTo(-17, sgn * 6); g.stroke(); }
    blob(g, -3, 0, 12, 6, '#d9a066', '#7a4a20', '#2e1a08');
    shine(g, -2, -3, 6, 1.5);
    blob(g, 10, 0, 5, 5, '#c08a50', '#6a3e18', '#2a1606');
    g.strokeStyle = '#3a2614'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(14, -2); g.quadraticCurveTo(24, -10, 30, -6); g.moveTo(14, 2); g.quadraticCurveTo(24, 10, 30, 6); g.stroke();
  },
  snail: (g, ph) => {
    const st = Math.sin(ph * TAU) * 1.2;
    g.fillStyle = '#c9b49a';
    g.beginPath(); g.ellipse(2 + st * 0.3, 0, 17, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = '#a89070'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(16, -2); g.lineTo(22 + st, -6); g.moveTo(16, 2); g.lineTo(22 + st, 6); g.stroke();
    g.fillStyle = '#222'; g.beginPath(); g.arc(22 + st, -6, 1.1, 0, TAU); g.arc(22 + st, 6, 1.1, 0, TAU); g.fill();
    const sg = g.createRadialGradient(-4, -3, 1, -3, 0, 13);
    sg.addColorStop(0, '#ffe2b0'); sg.addColorStop(0.5, '#c27a3a'); sg.addColorStop(1, '#5a2c0e');
    g.fillStyle = sg; g.beginPath(); g.arc(-3, 0, 12, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(70,30,8,0.8)'; g.lineWidth = 1.2;
    g.beginPath();
    for (let t = 0; t < 14; t += 0.2) { const r = 11 - t * 0.75; const x = -3 + Math.cos(t) * r, y = Math.sin(t) * r; t === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  },
  centipede: (g, ph) => {
    const n = 11;
    for (let i = n - 1; i >= 0; i--) {
      const x = -22 + i * 4.2, y = Math.sin(ph * TAU * 1 + i * 0.7) * 2;
      g.strokeStyle = '#ffb35a'; g.lineWidth = 0.9;
      const sw = Math.sin(ph * TAU * 2 + i) * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 + sw, y - 8); g.moveTo(x, y); g.lineTo(x - 2 - sw, y + 8); g.stroke();
      blob(g, x, y, 2.8, 4, '#ff9a4a', i % 2 ? '#a8441a' : '#8a3510', '#3a1405', false);
    }
    blob(g, 23, Math.sin(ph * TAU + n * 0.7) * 2, 3.5, 4.5, '#ffb070', '#b04a1a', '#4a1806');
    g.strokeStyle = '#ffcf7a'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(26, -2); g.quadraticCurveTo(32, -8, 36, -5); g.moveTo(26, 2); g.quadraticCurveTo(32, 8, 36, 5); g.stroke();
  },
  termite: (g, ph) => {
    legs(g, 3, -3, 3, 10, ph, '#7a5a3a', 1.1);
    blob(g, -6, 0, 9, 7, '#fff3dc', '#e8d2b0', '#a88c64');
    blob(g, 4, 0, 4.5, 4.5, '#f4e0bf', '#d8bf98', '#a08458');
    blob(g, 11, 0, 5.5, 5, '#ffb070', '#c0631c', '#5a2a06');
    g.strokeStyle = '#3a1806'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(15, -2); g.quadraticCurveTo(21, -3, 20, 1); g.moveTo(15, 2); g.quadraticCurveTo(21, 3, 20, -1); g.stroke();
  },
};

// ------------------------------- PROPS ALTOS -------------------------------
const propCache = new Map<string, Spr>();
const FLOWER_COLS = ['#ff6fa8', '#ffd84a', '#ffffff', '#b07cff', '#ff8a3d', '#7fd3ff'];
export function flowerSprite(c: number): Spr {
  const key = 'f' + c;
  let s = propCache.get(key); if (s) return s;
  const [cv, g] = mk(24, 24);
  g.translate(12, 12);
  const col = FLOWER_COLS[c % FLOWER_COLS.length];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const gr = g.createRadialGradient(Math.cos(a) * 3, Math.sin(a) * 3, 0.5, Math.cos(a) * 5, Math.sin(a) * 5, 5);
    gr.addColorStop(0, shade(col, 0.4)); gr.addColorStop(1, shade(col, -0.15));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 4.2, 2.6, a, 0, TAU); g.fill();
  }
  g.fillStyle = c % 2 ? '#ff9f1c' : '#ffcf3a';
  g.beginPath(); g.arc(0, 0, 2.8, 0, TAU); g.fill();
  g.fillStyle = 'rgba(120,60,0,0.5)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.cos(i) * 1.4, Math.sin(i) * 1.4, 0.45, 0, TAU); g.fill(); }
  s = { c: cv, w: 24, h: 24, ox: 12, oy: 12 };
  propCache.set(key, s);
  return s;
}
export function tuftSprite(c: number, grass: string[]): Spr {
  const key = 't' + c + grass[0];
  let s = propCache.get(key); if (s) return s;
  const [cv, g] = mk(28, 28);
  g.translate(14, 18);
  const base = grass[c % grass.length];
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.22 + Math.sin(i * 7.3) * 0.1;
    const L = 10 + Math.abs(Math.sin(i * 3.1)) * 7;
    g.strokeStyle = shade(base, (i % 3 - 1) * 0.18 + 0.05);
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo((i - 4) * 0.8, 2);
    g.quadraticCurveTo((i - 4) * 1.2 + Math.cos(a) * L * 0.4, Math.sin(a) * L * 0.6, (i - 4) * 0.8 + Math.cos(a) * L, Math.sin(a) * L);
    g.stroke();
  }
  s = { c: cv, w: 28, h: 28, ox: 14, oy: 18 };
  propCache.set(key, s);
  return s;
}
export function shroomSprite(c: number): Spr {
  const key = 'm' + c;
  let s = propCache.get(key); if (s) return s;
  const [cv, g] = mk(20, 20);
  g.translate(10, 12);
  const caps = ['#d9463a', '#c98a4a', '#b07cff', '#e8d6a8'];
  g.fillStyle = '#f2e6cf'; g.fillRect(-1.5, -2, 3, 7);
  const gr = g.createRadialGradient(-1.5, -5, 0.5, 0, -3, 7);
  gr.addColorStop(0, shade(caps[c % 4], 0.45)); gr.addColorStop(1, shade(caps[c % 4], -0.25));
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, -3, 6.5, 4.2, 0, Math.PI, TAU); g.closePath(); g.fill();
  if (c % 4 === 0) { g.fillStyle = '#fff'; for (const [x, y] of [[-3, -4], [1, -5.5], [3.5, -3.5]]) { g.beginPath(); g.arc(x, y, 0.9, 0, TAU); g.fill(); } }
  s = { c: cv, w: 20, h: 20, ox: 10, oy: 12 };
  propCache.set(key, s);
  return s;
}
export function reedSprite(c: number): Spr {
  const key = 'r' + c;
  let s = propCache.get(key); if (s) return s;
  const [cv, g] = mk(20, 34);
  g.translate(10, 30);
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = shade('#5e8f3a', i * 0.08 - 0.1); g.lineWidth = 1.5;
    const x = (i - 1.5) * 2.2;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 2, -14, x + (i - 1.5) * 2, -26 - i * 1.2); g.stroke();
  }
  g.fillStyle = '#6b4224'; g.beginPath(); g.ellipse(1, -24, 1.6, 4, 0.1, 0, TAU); g.fill();
  s = { c: cv, w: 20, h: 34, ox: 10, oy: 30 };
  propCache.set(key, s);
  return s;
}

/** Dibuja un sprite rotado centrado en (x,y) con escala de mundo dada */
export function blit(ctx: CanvasRenderingContext2D, s: Spr, x: number, y: number, ang: number, scale = 1) {
  const c = Math.cos(ang) * scale, sn = Math.sin(ang) * scale;
  ctx.setTransform(c * VT.z, sn * VT.z, -sn * VT.z, c * VT.z, (x - VT.x) * VT.z + VT.cx, (y - VT.y) * VT.z + VT.cy);
  ctx.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
}
/** Transformación de vista actual (mundo → pantalla) */
export const VT = { x: 0, y: 0, z: 1, cx: 0, cy: 0, dpr: 1 };
export function setWorldTransform(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(VT.z, 0, 0, VT.z, -VT.x * VT.z + VT.cx, -VT.y * VT.z + VT.cy);
}
