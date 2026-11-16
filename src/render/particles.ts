// Partículas y textos flotantes (no se guardan).
import { TAU, easeOutBack, rnd } from '../core/util';
import { VT } from './sprites';

export interface P {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number;
  color: string; kind: number; grav: number; layer: number; rot: number; vr: number; drag: number;
}
export const enum PK { Dot = 0, Spark, Ring, Glow, Leaf, Dirt, Star, Confetti, Smoke, Drop, Heart }
const parts: P[] = [];
const MAX = 3500;

export function spawn(layer: number, x: number, y: number, kind: PK, color: string, o: Partial<P> = {}) {
  if (parts.length >= MAX) parts.shift();
  parts.push({
    x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life ?? 0.8, max: o.life ?? 0.8, size: o.size ?? 2,
    color, kind, grav: o.grav ?? 0, layer, rot: o.rot ?? Math.random() * TAU, vr: o.vr ?? 0, drag: o.drag ?? 0.92,
  });
}
export function burst(layer: number, x: number, y: number, n: number, kind: PK, colors: string[], speed = 60, o: Partial<P> = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
    spawn(layer, x, y, kind, colors[i % colors.length], { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.8), size: (o.size ?? 2) * (0.6 + Math.random() * 0.8), grav: o.grav, vr: rnd(-8, 8), drag: o.drag });
  }
}
export function ring(layer: number, x: number, y: number, color: string, size = 30, life = 0.6) {
  spawn(layer, x, y, PK.Ring, color, { size, life });
}

export function updateParticles(dt: number) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, layer: number) {
  ctx.setTransform(VT.z, 0, 0, VT.z, -VT.x * VT.z + VT.cx, -VT.y * VT.z + VT.cy);
  for (const p of parts) {
    if (p.layer !== layer) continue;
    const t = p.life / p.max;
    switch (p.kind) {
      case PK.Dot: case PK.Dirt:
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        break;
      case PK.Spark: {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke();
        break;
      }
      case PK.Ring: {
        const k = 1 - t;
        ctx.globalAlpha = t * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * t + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.2 + k * 0.8), 0, TAU); ctx.stroke();
        break;
      }
      case PK.Glow: {
        ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        break;
      }
      case PK.Leaf: case PK.Confetti: {
        ctx.globalAlpha = Math.min(1, t * 3);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === PK.Leaf) { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.rot * 2)) + 0.5);
        ctx.restore();
        break;
      }
      case PK.Star: {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const r = k % 2 ? p.size * 0.4 : p.size; const a = (k / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case PK.Smoke: {
        ctx.globalAlpha = t * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - t), 0, TAU); ctx.fill();
        break;
      }
      case PK.Drop: {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        break;
      }
      case PK.Heart: {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.font = `${p.size}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('✦', p.x, p.y);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ------------------ Textos flotantes ------------------
interface FT { x: number; y: number; text: string; color: string; life: number; max: number; size: number; layer: number; key: string; val: number; icon: string; vy: number }
const texts: FT[] = [];
export function floatText(layer: number, x: number, y: number, text: string, color: string, size = 13, life = 1.3) {
  texts.push({ x, y, text, color, life, max: life, size, layer, key: '', val: 0, icon: '', vy: -26 });
  if (texts.length > 160) texts.shift();
}
/** Texto de ganancia que se acumula si se repite en el mismo sitio */
export function gainText(layer: number, x: number, y: number, val: number, icon: string, color: string) {
  const key = icon + Math.round(x / 40) + ',' + Math.round(y / 40) + layer;
  for (const t of texts) {
    if (t.key === key && t.life > t.max * 0.45) {
      t.val += val; t.text = '+' + fmtv(t.val) + ' ' + icon; t.life = t.max; t.size = Math.min(22, 13 + Math.log2(1 + t.val) * 1.5);
      return;
    }
  }
  texts.push({ x, y, text: '+' + fmtv(val) + ' ' + icon, color, life: 1.4, max: 1.4, size: 13, layer, key, val, icon, vy: -22 });
}
const fmtv = (v: number) => (v < 10 && v % 1 ? v.toFixed(1) : Math.round(v).toString());

export function updateTexts(dt: number) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    t.y += t.vy * dt; t.vy *= Math.pow(0.95, dt * 60);
    if (t.life <= 0) texts.splice(i, 1);
  }
}
export function drawTexts(ctx: CanvasRenderingContext2D, layer: number) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of texts) {
    if (t.layer !== layer) continue;
    const age = t.max - t.life;
    const pop = age < 0.25 ? easeOutBack(age / 0.25) : 1;
    const sx = (t.x - VT.x) * VT.z + VT.cx, sy = (t.y - VT.y) * VT.z + VT.cy;
    const fs = t.size * VT.dpr * pop * Math.max(0.8, Math.min(1.4, VT.z / VT.dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
    ctx.font = `800 ${fs}px Nunito, system-ui, sans-serif`;
    ctx.lineWidth = 3.5 * VT.dpr; ctx.strokeStyle = 'rgba(20,12,4,0.85)';
    ctx.strokeText(t.text, sx, sy);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}
export function clearFx() { parts.length = 0; texts.length = 0; }
