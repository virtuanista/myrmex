// Terreno de superficie renderizado por chunks cacheados.
import { BIOMES } from '../game/defs';
import { TS } from '../game/state';
import { Prop, T, WORLD } from '../game/world';
import { TAU, hash2, mixHex, shade, Noise } from '../core/util';

const CH = 512;
const chunks = new Map<number, HTMLCanvasElement>();
const order: number[] = [];
let tiny: HTMLCanvasElement | null = null;
let buckets: Map<number, Prop[]> = new Map();
let ncx = 0, ncy = 0;
let pending: number[] = [];

export function resetTerrain() {
  chunks.clear(); order.length = 0; tiny = null; buckets = new Map(); pending = [];
}

function tileColor(t: number, x: number, y: number, b: typeof BIOMES[keyof typeof BIOMES], n: Noise): string {
  const v = n.fbm(x / 9, y / 9, 3);
  const h = hash2(x, y, 3);
  switch (t) {
    case T.Grass: case T.Trunk: { const i = Math.floor(v * 3.99); return shade(b.grass[Math.min(3, i)], (h - 0.5) * 0.08); }
    case T.Clover: return shade(mixHex(b.grass[1], '#3f8f3a', 0.5), (h - 0.5) * 0.1);
    case T.Moss: return shade(mixHex(b.grass[2], '#2e5a2a', 0.5), (h - 0.5) * 0.1);
    case T.Dirt: return shade(b.dirt, (v - 0.5) * 0.25 + (h - 0.5) * 0.06);
    case T.Sand: return shade(b.sand, (v - 0.5) * 0.15);
    case T.Water: return '#6f6040';
    case T.Rock: return shade(b.dirt, -0.1);
  }
  return b.grass[0];
}

function buildTiny() {
  const W = WORLD.W;
  const b = BIOMES[W.biome];
  const n = new Noise(W.seed + 9);
  tiny = document.createElement('canvas');
  tiny.width = W.w; tiny.height = W.h;
  const g = tiny.getContext('2d')!;
  const img = g.createImageData(W.w, W.h);
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const c = tileColor(W.tiles[y * W.w + x], x, y, b, n);
    const v = parseInt(c.slice(1), 16);
    const i = (y * W.w + x) * 4;
    img.data[i] = (v >> 16) & 255; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ncx = Math.ceil((W.w * TS) / CH); ncy = Math.ceil((W.h * TS) / CH);
  for (const p of W.props) {
    if (p.tall && p.k !== 'tree') continue;
    const r = p.k === 'tree' ? p.r * 3.2 : p.r + 6;
    const x0 = Math.floor((p.x - r) / CH), x1 = Math.floor((p.x + r) / CH);
    const y0 = Math.floor((p.y - r) / CH), y1 = Math.floor((p.y + r) / CH);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cy < 0 || cx >= ncx || cy >= ncy) continue;
      const k = cy * ncx + cx;
      let l = buckets.get(k); if (!l) buckets.set(k, (l = []));
      l.push(p);
    }
  }
}
export function tinyMap(): HTMLCanvasElement { if (!tiny) buildTiny(); return tiny!; }

function renderChunk(cx: number, cy: number): HTMLCanvasElement {
  const W = WORLD.W;
  const b = BIOMES[W.biome];
  const c = document.createElement('canvas');
  c.width = CH; c.height = CH;
  const g = c.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH;
  g.translate(-ox, -oy);
  // base suavizada
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const tx0 = Math.floor(ox / TS) - 1, ty0 = Math.floor(oy / TS) - 1, tn = CH / TS + 2;
  g.drawImage(tiny!, tx0, ty0, tn, tn, tx0 * TS + TS / 2, ty0 * TS + TS / 2, tn * TS, tn * TS);
  // texturas por casilla
  const x0 = Math.max(0, Math.floor(ox / TS)), y0 = Math.max(0, Math.floor(oy / TS));
  const x1 = Math.min(W.w - 1, Math.floor((ox + CH) / TS)), y1 = Math.min(W.h - 1, Math.floor((oy + CH) / TS));
  g.lineCap = 'round';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = W.tiles[y * W.w + x];
    const px = x * TS, py = y * TS;
    if (t === T.Grass || t === T.Clover || t === T.Moss || t === T.Trunk) {
      const base = b.grass[Math.floor(hash2(x, y, 1) * 4)];
      for (let k = 0; k < 7; k++) {
        const hx = hash2(x * 7 + k, y * 13, 5), hy = hash2(x * 3, y * 11 + k, 6);
        const bx = px + hx * TS, by = py + hy * TS;
        const L = 2.5 + hash2(x + k, y, 7) * 4;
        const a = -Math.PI / 2 + (hash2(x, y + k, 8) - 0.5) * 1.2;
        g.strokeStyle = shade(base, (hash2(k, x, y) - 0.4) * 0.35);
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * L, by + Math.sin(a) * L); g.stroke();
      }
      if (t === T.Clover && hash2(x, y, 21) < 0.5) clover(g, px + hash2(x, y, 2) * TS, py + hash2(y, x, 2) * TS, 3 + hash2(x, y, 4) * 2);
      if (t === T.Moss) { g.fillStyle = 'rgba(30,60,20,0.25)'; g.beginPath(); g.arc(px + 8, py + 8, 5 + hash2(x, y, 9) * 4, 0, TAU); g.fill(); }
    } else if (t === T.Dirt || t === T.Sand) {
      for (let k = 0; k < 5; k++) {
        const hx = hash2(x * 5 + k, y * 9, 11), hy = hash2(x * 2, y * 7 + k, 12);
        const v = hash2(x, k, y);
        g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
        const s = 0.8 + hash2(k, y, x) * 1.6;
        g.fillRect(px + hx * TS, py + hy * TS, s, s);
      }
    }
  }
  // agua
  const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < W.w && y < W.h && W.tiles[y * W.w + x] === T.Water;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!isW(x, y)) continue;
      const deep = isW(x + 1, y) && isW(x - 1, y) && isW(x, y + 1) && isW(x, y - 1);
      const px = x * TS + TS / 2, py = y * TS + TS / 2;
      if (pass === 0) { g.fillStyle = '#5d5236'; g.beginPath(); g.arc(px, py, TS * 1.15, 0, TAU); g.fill(); }
      else if (pass === 1) { g.fillStyle = '#4a8db5'; g.beginPath(); g.arc(px, py, TS * 0.98, 0, TAU); g.fill(); }
      else if (deep) { g.fillStyle = 'rgba(28,70,110,0.4)'; g.beginPath(); g.arc(px, py, TS * 1.05, 0, TAU); g.fill(); }
    }
  }
  // props estáticos
  const list = buckets.get(cy * ncx + cx) || [];
  for (const p of list) drawStaticProp(g, p, b.grass);
  return c;
}

function clover(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#3f9a3a';
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU - 0.4; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.arc(x, y - r * 0.3, r * 0.25, 0, TAU); g.fill();
}

function rockPath(g: CanvasRenderingContext2D, p: Prop, scale = 1) {
  g.beginPath();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU + p.rot;
    const rr = p.r * scale * (0.8 + hash2(i % n, Math.floor(p.x), Math.floor(p.y)) * 0.3);
    const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr * 0.85;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}

function drawStaticProp(g: CanvasRenderingContext2D, p: Prop, grass: readonly string[]) {
  switch (p.k) {
    case 'rock': {
      const cols = ['#9a958c', '#8a8378', '#a8a294', '#7d7a74'];
      const base = cols[p.c % 4];
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.translate(4, 6); rockPath(g, p, 1.02); g.fill(); g.translate(-4, -6);
      const gr = g.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
      gr.addColorStop(0, shade(base, 0.35)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.4));
      g.fillStyle = gr; rockPath(g, p); g.fill();
      g.strokeStyle = shade(base, -0.5); g.lineWidth = 1.2; g.stroke();
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.ellipse(p.x - p.r * 0.25, p.y - p.r * 0.35, p.r * 0.45, p.r * 0.25, -0.5, 0, TAU); g.fill();
      if (p.c % 2 === 0) { g.fillStyle = 'rgba(80,130,50,0.45)'; g.beginPath(); g.arc(p.x + p.r * 0.3, p.y - p.r * 0.5, p.r * 0.35, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(p.x - p.r * 0.2, p.y - p.r * 0.1); g.lineTo(p.x + p.r * 0.3, p.y + p.r * 0.2); g.stroke();
      g.restore();
      break;
    }
    case 'tree': {
      // sombra de copa
      const sg = g.createRadialGradient(p.x + 18, p.y + 22, p.r, p.x + 18, p.y + 22, p.r * 3.1);
      sg.addColorStop(0, 'rgba(0,20,0,0.32)'); sg.addColorStop(1, 'rgba(0,20,0,0)');
      g.fillStyle = sg; g.beginPath(); g.arc(p.x + 18, p.y + 22, p.r * 3.1, 0, TAU); g.fill();
      // raíces
      g.strokeStyle = '#5a3c22'; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = p.rot + (i / 6) * TAU + hash2(i, p.x | 0, 3) * 0.5;
        g.lineWidth = 5 - i * 0.4;
        g.beginPath(); g.moveTo(p.x + Math.cos(a) * p.r * 0.4, p.y + Math.sin(a) * p.r * 0.4);
        g.quadraticCurveTo(p.x + Math.cos(a + 0.3) * p.r * 0.8, p.y + Math.sin(a + 0.3) * p.r * 0.8, p.x + Math.cos(a) * p.r * 1.25, p.y + Math.sin(a) * p.r * 1.25);
        g.stroke();
      }
      const tg = g.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.2, 2, p.x, p.y, p.r * 0.65);
      tg.addColorStop(0, '#a77a4c'); tg.addColorStop(0.6, '#6b4526'); tg.addColorStop(1, '#3d2410');
      g.fillStyle = tg; g.beginPath(); g.arc(p.x, p.y, p.r * 0.62, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,35,15,0.6)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(p.x, p.y, p.r * 0.15 * k, 0, TAU); g.stroke(); }
      break;
    }
    case 'pebble': {
      const cols = ['#b5ab98', '#8f877a', '#c9bfa8', '#a0968a'];
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(p.x + 1, p.y + 1.2, p.r, p.r * 0.7, p.rot, 0, TAU); g.fill();
      g.fillStyle = cols[p.c % 4]; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.7, p.rot, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.25, p.r * 0.4, p.r * 0.2, p.rot, 0, TAU); g.fill();
      break;
    }
    case 'twig': {
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-p.r / 2 + 1, 2); g.lineTo(p.r / 2 + 1, 2); g.stroke();
      g.strokeStyle = '#7a5530'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-p.r / 2, 0); g.lineTo(p.r / 2, 0); g.stroke();
      g.lineWidth = 1.3; g.beginPath(); g.moveTo(p.r * 0.1, 0); g.lineTo(p.r * 0.3, -5); g.stroke();
      g.strokeStyle = 'rgba(255,220,170,0.35)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-p.r / 2, -0.6); g.lineTo(p.r / 2, -0.6); g.stroke();
      g.restore();
      break;
    }
    case 'leaf': {
      const cols = ['#a8742f', '#c9862c', '#8a5a24', '#6f8f2c'];
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(1, 1.5, p.r, p.r * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = cols[p.c % 4]; g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,30,5,0.45)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-p.r, 0); g.lineTo(p.r, 0); g.stroke();
      g.restore();
      break;
    }
    case 'clover': clover(g, p.x, p.y, p.r); break;
    case 'tile': {
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-p.r / 2 + 2, -p.r / 2 + 3, p.r, p.r);
      g.fillStyle = p.c ? '#c7b9a0' : '#b8a08a'; g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.strokeRect(-p.r / 2, -p.r / 2, p.r, p.r);
      g.restore();
      break;
    }
    case 'tuft': {
      // mata baja (no alta)
      g.strokeStyle = shade(grass[p.c % grass.length], 0.12); g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.35; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); g.stroke(); }
      break;
    }
  }
}

/** Dibuja el suelo para el rectángulo visible en coordenadas de mundo */
export function drawGround(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  if (!tiny) buildTiny();
  const cx0 = Math.max(0, Math.floor(x0 / CH)), cy0 = Math.max(0, Math.floor(y0 / CH));
  const cx1 = Math.min(ncx - 1, Math.floor(x1 / CH)), cy1 = Math.min(ncy - 1, Math.floor(y1 / CH));
  let built = 0;
  const W0 = WORLD.W;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W0.w * TS, W0.h * TS); ctx.clip();
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const k = cy * ncx + cx;
    let c = chunks.get(k);
    if (!c && built < 2) {
      c = renderChunk(cx, cy); built++;
      chunks.set(k, c); order.push(k);
      if (order.length > 48) { const old = order.shift()!; chunks.delete(old); }
    }
    if (c) ctx.drawImage(c, cx * CH - 0.5, cy * CH - 0.5, CH + 1, CH + 1);
    else {
      ctx.imageSmoothingEnabled = true;
      const W = WORLD.W;
      ctx.drawImage(tiny!, cx * CH / TS, cy * CH / TS, CH / TS, CH / TS, cx * CH, cy * CH, CH, CH);
      void W;
    }
  }
  ctx.restore();
  void pending;
}
