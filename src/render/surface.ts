// Render de la vista de superficie.
import { BIOMES, BUILDINGS, CASTES, COLONY_COLORS, CREATURES, EMBLEMS } from '../game/defs';
import { AS, Ant, G, ResNode, Structure, TS, PS } from '../game/state';
import { WORLD, passableAt } from '../game/world';
import { VIS, TERR } from '../game/sim';
import { PW, PH } from '../game/ants';
import { lightLevel, duskLevel, isNight } from '../game/time';
import { drawGround } from './terrain';
import { ANT_FRAMES, CRE_FRAMES, VT, antSprite, blit, creatureSprite, flowerSprite, reedSprite, setWorldTransform, shadowSprite, shroomSprite, tuftSprite } from './sprites';
import { drawParticles, drawTexts } from './particles';
import { UI } from '../ui/uistate';
import { TAU, clamp, hash2, lerp, rgba, shade } from '../core/util';
import { emit } from '../core/bus';
import { canPlaceBuilding } from '../game/actions';

let overlay: HTMLCanvasElement | null = null, overlayImg: ImageData | null = null;
let fogC: HTMLCanvasElement | null = null, fogImg: ImageData | null = null;
let lightC: HTMLCanvasElement | null = null;
let frame = 0;
let terrPaths: { col: number; path: Path2D }[] = [];
let terrRef: Int8Array | null = null;

export const RENDER_OPTS = { noFog: false };
export function resetSurfaceRender() { overlay = null; fogC = null; terrRef = null; terrPaths = []; ambient.length = 0; }

function ensureCanvases() {
  const W = WORLD.W;
  if (!overlay || overlay.width !== PW) {
    overlay = document.createElement('canvas'); overlay.width = PW; overlay.height = PH;
    overlayImg = overlay.getContext('2d')!.createImageData(PW, PH);
  }
  if (!fogC || fogC.width !== W.w) {
    fogC = document.createElement('canvas'); fogC.width = W.w; fogC.height = W.h;
    fogImg = fogC.getContext('2d')!.createImageData(W.w, W.h);
  }
  if (!lightC) lightC = document.createElement('canvas');
}

function updateOverlay() {
  const S = G.S;
  const d = overlayImg!.data;
  const p = S.pher[0], w = S.wear;
  const col = COLONY_COLORS[S.colonies[0].color];
  const lc = parseInt(col.light.slice(1), 16);
  const lr = (lc >> 16) & 255, lg = (lc >> 8) & 255, lb = lc & 255;
  const show = UI.showPher;
  for (let i = 0; i < p.length; i++) {
    const ww = Math.min(1, w[i] * 1.4);
    const pp = show ? Math.min(1, p[i] * 1.6) : 0;
    const j = i * 4;
    if (pp > ww * 0.6) {
      d[j] = lr; d[j + 1] = lg; d[j + 2] = lb; d[j + 3] = Math.min(255, pp * 110 + ww * 40);
    } else {
      d[j] = 112; d[j + 1] = 84; d[j + 2] = 52; d[j + 3] = ww * 120;
    }
  }
  overlay!.getContext('2d')!.putImageData(overlayImg!, 0, 0);
}

function updateFogCanvas() {
  const S = G.S;
  const W = WORLD.W;
  const d = fogImg!.data;
  for (let i = 0; i < W.w * W.h; i++) {
    const j = i * 4;
    d[j] = 10; d[j + 1] = 12; d[j + 2] = 18;
    d[j + 3] = !S.fog[i] ? 255 : VIS[i] ? 0 : 105;
  }
  fogC!.getContext('2d')!.putImageData(fogImg!, 0, 0);
}

function buildTerritoryPaths() {
  const W = WORLD.W;
  terrRef = TERR;
  terrPaths = [];
  const byCol = new Map<number, Path2D>();
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const o = TERR[y * W.w + x];
    if (o < 0) continue;
    let p = byCol.get(o); if (!p) byCol.set(o, (p = new Path2D()));
    const px = x * TS, py = y * TS;
    if (x === W.w - 1 || TERR[y * W.w + x + 1] !== o) { p.moveTo(px + TS, py); p.lineTo(px + TS, py + TS); }
    if (x === 0 || TERR[y * W.w + x - 1] !== o) { p.moveTo(px, py); p.lineTo(px, py + TS); }
    if (y === W.h - 1 || TERR[(y + 1) * W.w + x] !== o) { p.moveTo(px, py + TS); p.lineTo(px + TS, py + TS); }
    if (y === 0 || TERR[(y - 1) * W.w + x] !== o) { p.moveTo(px, py); p.lineTo(px + TS, py); }
  }
  for (const [col, path] of byCol) terrPaths.push({ col, path });
}

// ---------------- Vida ambiental ----------------
interface Amb { k: number; x: number; y: number; vx: number; vy: number; t: number; c: number }
const ambient: Amb[] = [];
function updateAmbient(dt: number, x0: number, y0: number, x1: number, y1: number) {
  const night = isNight();
  const wantB = night ? 0 : 7, wantF = night ? 45 : 0;
  const wantL = WORLD.W.biome === 'forest' ? 10 : 3;
  let nb = 0, nf = 0, nl = 0;
  for (let i = ambient.length - 1; i >= 0; i--) {
    const a = ambient[i];
    a.t += dt;
    if (a.k === 0) { a.vx += Math.sin(a.t * 3 + a.c) * 30 * dt; a.vy += Math.cos(a.t * 2.3 + a.c) * 30 * dt; a.vx *= 0.98; a.vy *= 0.98; nb++; }
    else if (a.k === 1) { a.vx += Math.sin(a.t * 1.3 + a.c) * 8 * dt; a.vy += Math.cos(a.t * 1.1 + a.c * 2) * 8 * dt; nf++; }
    else { a.vy = 18 + Math.sin(a.t * 2 + a.c) * 6; a.vx = Math.sin(a.t * 1.5 + a.c) * 20; nl++; }
    a.x += a.vx * dt; a.y += a.vy * dt;
    const m = 300;
    if (a.x < x0 - m || a.x > x1 + m || a.y < y0 - m || a.y > y1 + m || (a.k === 1 && !night && Math.random() < dt) || (a.k === 0 && night) || a.t > 40) ambient.splice(i, 1);
  }
  const sp = (k: number) => ambient.push({ k, x: lerp(x0, x1, Math.random()), y: k === 2 ? y0 - 20 : lerp(y0, y1, Math.random()), vx: 0, vy: 0, t: 0, c: Math.random() * 10 });
  if (nb < wantB && Math.random() < dt * 2) sp(0);
  if (nf < wantF && Math.random() < dt * 20) sp(1);
  if (nl < wantL && Math.random() < dt * 1.5) sp(2);
}
function drawAmbient(ctx: CanvasRenderingContext2D, t: number) {
  setWorldTransform(ctx);
  for (const a of ambient) {
    if (a.k === 0) {
      const flap = Math.abs(Math.sin(t * 14 + a.c));
      const cols = ['#ffd84a', '#ff8ad8', '#8ad8ff', '#ffffff', '#ffa94a'];
      ctx.fillStyle = cols[Math.floor(a.c) % cols.length];
      ctx.save(); ctx.translate(a.x, a.y - 20); ctx.rotate(Math.atan2(a.vy, a.vx));
      ctx.beginPath(); ctx.ellipse(0, -3 * flap, 3.5, 3 * flap + 0.5, 0.3, 0, TAU); ctx.ellipse(0, 3 * flap, 3.5, 3 * flap + 0.5, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-2.5, -0.5, 5, 1);
      ctx.restore();
    } else if (a.k === 2) {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.t * 2 + a.c);
      ctx.fillStyle = ['#c9862c', '#a8742f', '#8fae3c'][Math.floor(a.c) % 3];
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
}
function drawFireflies(ctx: CanvasRenderingContext2D, t: number) {
  setWorldTransform(ctx);
  ctx.globalCompositeOperation = 'lighter';
  for (const a of ambient) {
    if (a.k !== 1) continue;
    const b = 0.5 + 0.5 * Math.sin(t * 3 + a.c * 5);
    const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 9);
    g.addColorStop(0, `rgba(230,255,120,${0.9 * b})`); g.addColorStop(1, 'rgba(230,255,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, 9, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------- Lluvia ----------------
const drops: { x: number; y: number; s: number }[] = [];
let lightning = 0;

// ---------------- Principal ----------------
export function drawSurface(ctx: CanvasRenderingContext2D, cw: number, ch: number, alpha: number, dt: number) {
  const S = G.S;
  const W = WORLD.W;
  ensureCanvases();
  frame++;
  const dpr = VT.dpr;
  const sh = UI.shake > 0 ? UI.shake : 0;
  VT.z = S.cam.sz * dpr; VT.x = S.cam.sx + (Math.random() - 0.5) * sh; VT.y = S.cam.sy + (Math.random() - 0.5) * sh;
  VT.cx = cw / 2; VT.cy = ch / 2;
  const x0 = VT.x - cw / 2 / VT.z, y0 = VT.y - ch / 2 / VT.z, x1 = VT.x + cw / 2 / VT.z, y1 = VT.y + ch / 2 / VT.z;
  const t = performance.now() / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, cw, ch);
  setWorldTransform(ctx);
  ctx.imageSmoothingEnabled = true;
  drawGround(ctx, x0, y0, x1, y1);

  // brillos del agua
  drawWater(ctx, x0, y0, x1, y1, t);

  // caminos y feromonas
  if (frame % 8 === 1) updateOverlay();
  ctx.globalAlpha = 1;
  ctx.drawImage(overlay!, 0, 0, PW * PS, PH * PS);

  // territorio
  if (UI.showTerritory) {
    if (terrRef !== TERR) buildTerritoryPaths();
    for (const tp of terrPaths) {
      const c = COLONY_COLORS[S.colonies[tp.col]?.color ?? 0];
      ctx.strokeStyle = rgba(c.ui, 0.55 + 0.15 * Math.sin(t * 2));
      ctx.lineWidth = 2.2 / S.cam.sz + 0.8;
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 8;
      ctx.stroke(tp.path);
    }
    ctx.setLineDash([]);
  }

  // marcas de lluvia/eventos en suelo
  drawEventGround(ctx, t);

  // nodos de recurso
  for (const n of S.nodes) {
    if (n.x < x0 - 40 || n.x > x1 + 40 || n.y < y0 - 40 || n.y > y1 + 40) continue;
    const ti = Math.floor(n.y / TS) * W.w + Math.floor(n.x / TS);
    if (!S.fog[ti]) continue;
    drawNode(ctx, n, t);
  }

  // estructuras
  for (const s of S.structures) {
    if (s.x < x0 - 60 || s.x > x1 + 60 || s.y < y0 - 60 || s.y > y1 + 60) continue;
    const ti = Math.floor(s.y / TS) * W.w + Math.floor(s.x / TS);
    if (s.col !== 0 && !S.fog[ti]) continue;
    drawStructure(ctx, s, t);
  }

  // anillos de selección
  const shadow = shadowSprite();
  for (const a of S.ants) {
    if (a.layer !== 0) continue;
    if (!UI.sel.has(a.id)) continue;
    const x = lerp(a.px, a.x, alpha), y = lerp(a.py, a.y, alpha);
    const r = 7 * CASTES[a.caste].size;
    setWorldTransform(ctx);
    ctx.strokeStyle = 'rgba(140,255,160,0.95)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y + 1, r, r * 0.7, 0, 0, TAU); ctx.stroke();
  }

  // hormigas
  const vis = VIS;
  for (const a of S.ants) {
    if (a.layer !== 0) continue;
    const x = lerp(a.px, a.x, alpha), y = lerp(a.py, a.y, alpha);
    if (x < x0 - 20 || x > x1 + 20 || y < y0 - 20 || y > y1 + 20) continue;
    if (a.col !== 0) { const ti = Math.floor(y / TS) * W.w + Math.floor(x / TS); if (!vis[ti]) continue; }
    drawAnt(ctx, a, x, y, shadow);
  }

  // criaturas
  for (const c of S.creatures) {
    const x = lerp(c.px, c.x, alpha), y = lerp(c.py, c.y, alpha);
    if (x < x0 - 60 || x > x1 + 60 || y < y0 - 60 || y > y1 + 60) continue;
    const ti = Math.floor(y / TS) * W.w + Math.floor(x / TS);
    if (!vis[ti]) continue;
    const d = CREATURES[c.type];
    const sp = creatureSprite(c.type, Math.floor(c.ph * 0.6) % CRE_FRAMES, !!c.boss);
    const k = c.boss ? 1 : 1;
    ctx.globalAlpha = 0.9;
    blit(ctx, shadow, x + 3, y + 4, c.a, (sp.w / 30) * k);
    ctx.globalAlpha = 1;
    const bite = (c as any).bite || 0;
    if (bite > 0) (c as any).bite = bite - dt;
    blit(ctx, sp, x + Math.cos(c.a) * bite * 8, y + Math.sin(c.a) * bite * 8, c.a, k);
    if (UI.selCre === c.id) {
      setWorldTransform(ctx);
      ctx.strokeStyle = 'rgba(255,220,120,0.95)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, d.size * 0.8, d.size * 0.6, 0, 0, TAU); ctx.stroke();
    }
    if (c.hp < c.mhp || UI.selCre === c.id) hpBar(ctx, x, y - d.size * 0.7 - 4, Math.max(16, d.size * 0.9), c.hp / c.mhp, d.behavior === 'hunter' || c.angry > 0 ? '#ff5b4f' : '#ffd24a');
    if (c.boss || c.type === 'mantis') {
      setWorldTransform(ctx);
      ctx.font = '700 9px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffdf8a';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2.5;
      const nm = c.name || d.name;
      ctx.strokeText('☠ ' + nm, x, y - d.size * 0.7 - 12); ctx.fillText('☠ ' + nm, x, y - d.size * 0.7 - 12);
    }
  }

  // proyectiles
  setWorldTransform(ctx);
  for (const p of S.projectiles) {
    const k = clamp(p.t / p.dur, 0, 1);
    const arc = Math.sin(k * Math.PI) * 18;
    const g = ctx.createRadialGradient(p.x, p.y - arc, 0, p.x, p.y - arc, 5);
    g.addColorStop(0, '#f4ffb0'); g.addColorStop(0.5, '#9dff3c'); g.addColorStop(1, 'rgba(80,200,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - arc, 5, 0, TAU); ctx.fill();
  }

  drawParticles(ctx, 0);

  // props altos con balanceo
  const wind = S.weather.kind === 'storm' ? 2.2 : S.weather.kind === 'rain' ? 1.4 : 1;
  const grass = BIOMES[W.biome].grass as unknown as string[];
  for (const p of W.tallProps) {
    if (p.x < x0 - 30 || p.x > x1 + 30 || p.y < y0 - 30 || p.y > y1 + 30) continue;
    if (p.k === 'tree') continue;
    const sway = Math.sin(t * 1.6 + p.x * 0.05 + p.y * 0.03) * 0.12 * wind + p.rot * 0.5;
    if (p.k === 'flower') {
      setWorldTransform(ctx);
      ctx.strokeStyle = '#3f7a2c'; ctx.lineWidth = 1.2;
      const hx = p.x + Math.sin(sway) * 10, hy = p.y - 9;
      ctx.beginPath(); ctx.moveTo(p.x, p.y + 2); ctx.quadraticCurveTo(p.x, p.y - 4, hx, hy); ctx.stroke();
      blit(ctx, flowerSprite(p.c), hx, hy, sway, p.r / 6.5);
    } else if (p.k === 'tuft') blit(ctx, tuftSprite(p.c, grass), p.x, p.y, sway * 0.8, p.r / 9);
    else if (p.k === 'shroom') blit(ctx, shroomSprite(p.c), p.x, p.y, 0, p.r / 5);
    else if (p.k === 'reed') blit(ctx, reedSprite(p.c), p.x, p.y, sway, p.r / 12);
  }
  // copas de árboles
  setWorldTransform(ctx);
  for (const tr of W.trees) {
    const R = tr.r * 2.6;
    if (tr.x < x0 - R || tr.x > x1 + R || tr.y < y0 - R || tr.y > y1 + R) continue;
    drawCanopy(ctx, tr.x, tr.y, R, tr.c, t, wind);
  }

  // ambiente
  updateAmbient(dt, x0, y0, x1, y1);
  drawAmbient(ctx, t);

  // evento pájaro
  drawBird(ctx, t);

  // niebla de guerra
  if (frame % 5 === 1) updateFogCanvas();
  setWorldTransform(ctx);
  ctx.imageSmoothingEnabled = true;
  if (!RENDER_OPTS.noFog) ctx.drawImage(fogC!, 0, 0, W.w * TS, W.h * TS);
  ctx.fillStyle = '#0a0c12';
  const big = 20000;
  ctx.fillRect(-big, -big, big * 2 + W.w * TS, big); ctx.fillRect(-big, W.h * TS, big * 2 + W.w * TS, big);
  ctx.fillRect(-big, 0, big, W.h * TS); ctx.fillRect(W.w * TS, 0, big, W.h * TS);

  // iluminación
  drawLighting(ctx, cw, ch, t);
  drawFireflies(ctx, t);
  drawWeather(ctx, cw, ch, dt, t);

  // marcadores y fantasma de construcción
  drawMarkers(ctx, dt, t);
  drawPlacement(ctx, t);
  drawTexts(ctx, 0);

  // caja de selección
  if (UI.drag && UI.drag.active) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const d = UI.drag;
    const rx = Math.min(d.x0, d.x1) * dpr, ry = Math.min(d.y0, d.y1) * dpr, rw = Math.abs(d.x1 - d.x0) * dpr, rh = Math.abs(d.y1 - d.y0) * dpr;
    ctx.fillStyle = 'rgba(120,255,150,0.1)'; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(140,255,160,0.9)'; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(rx, ry, rw, rh);
  }
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, col: string) {
  setWorldTransform(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 0.5, y - 0.5, w + 1, 3);
  ctx.fillStyle = f > 0.5 ? col : f > 0.25 ? '#ffb02e' : '#ff3b30';
  ctx.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 2);
}

function drawAnt(ctx: CanvasRenderingContext2D, a: Ant, x: number, y: number, shadow: ReturnType<typeof shadowSprite>) {
  const S = G.S;
  const col = S.colonies[a.col];
  const def = CASTES[a.caste];
  const fr = Math.floor(a.ph) % ANT_FRAMES;
  const sp = antSprite(col.color, a.caste, fr, def.size);
  ctx.globalAlpha = 0.85;
  blit(ctx, shadow, x + 2, y + 3, a.a, 0.62 * def.size);
  ctx.globalAlpha = 1;
  if (def.flies) {
    const hover = Math.sin(performance.now() / 120 + a.id) * 1.5;
    blit(ctx, sp, x, y - 6 + hover, a.a, 0.78);
  } else {
    const bite = (a as any).bite || 0;
    if (bite > 0) (a as any).bite = bite - 1 / 60;
    blit(ctx, sp, x + Math.cos(a.a) * bite * 6, y + Math.sin(a.a) * bite * 6, a.a, 0.78);
  }
  if (a.carry) drawCarry(ctx, x, y, a.a, a.carry, def.size, a.ca);
  if (a.hp < a.mhp * 0.999 || UI.sel.has(a.id)) hpBar(ctx, x, y - 9 * def.size, 12 * def.size, a.hp / a.mhp, a.col === 0 ? '#5dff7a' : '#ff6a5a');
  if (a.rank > 0) {
    setWorldTransform(ctx);
    ctx.fillStyle = '#ffd24a';
    for (let k = 0; k < a.rank; k++) { ctx.beginPath(); ctx.moveTo(x - 3 + k * 3, y - 12 * def.size); ctx.lineTo(x - 1.5 + k * 3, y - 13.5 * def.size); ctx.lineTo(x + k * 3, y - 12 * def.size); ctx.fill(); }
  }
}

export function drawCarry(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, k: string, size: number, amt: number) {
  const hx = x + Math.cos(ang) * 9.5 * size, hy = y + Math.sin(ang) * 9.5 * size;
  setWorldTransform(ctx);
  const s = 0.8 + Math.min(1.2, amt * 0.25);
  if (k === 'leaves') {
    ctx.save(); ctx.translate(hx, hy - 2); ctx.rotate(ang + 0.6);
    ctx.fillStyle = '#5fbf3a'; ctx.beginPath(); ctx.ellipse(0, 0, 5 * s, 3 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2f7a1c'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-5 * s, 0); ctx.lineTo(5 * s, 0); ctx.stroke();
    ctx.restore();
  } else {
    const c = k === 'food' ? '#ffcf4a' : k === 'amber' ? '#ff9a1f' : k === 'soil' ? '#8a5a30' : '#fff';
    ctx.fillStyle = shade(c, -0.3); ctx.beginPath(); ctx.arc(hx, hy, 2.1 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(hx - 0.4, hy - 0.4, 1.6 * s, 0, TAU); ctx.fill();
    if (k === 'amber') { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(hx - 0.8, hy - 0.8, 0.6, 0, TAU); ctx.fill(); }
  }
}

function drawWater(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  const W = WORLD.W;
  const tx0 = Math.max(0, Math.floor(x0 / TS)), ty0 = Math.max(0, Math.floor(y0 / TS));
  const tx1 = Math.min(W.w - 1, Math.floor(x1 / TS)), ty1 = Math.min(W.h - 1, Math.floor(y1 / TS));
  if ((tx1 - tx0) * (ty1 - ty0) > 40000) return;
  ctx.strokeStyle = 'rgba(220,245,255,0.5)'; ctx.lineWidth = 1;
  const rain = G.S.weather.kind === 'rain' || G.S.weather.kind === 'storm';
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (W.tiles[y * W.w + x] !== 3) continue;
    const h = hash2(x, y, 33);
    if (h < 0.18) {
      const a = 0.5 + 0.5 * Math.sin(t * 2 + h * 40);
      ctx.globalAlpha = a * 0.6;
      const px = x * TS + h * 10, py = y * TS + 8 + Math.sin(t + h * 9) * 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 5, py); ctx.stroke();
    }
    if (rain && hash2(x, y, Math.floor(t * 3)) < 0.05) {
      const k = (t * 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(x * TS + 8, y * TS + 8, 1 + k * 6, 0, TAU); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawCanopy(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, c: number, t: number, wind: number) {
  const S = G.S;
  // transparencia si hay hormigas del jugador debajo o cámara cerca
  const pal = WORLD.W.biome === 'forest' ? ['#2f6a2c', '#3c7d33', '#285a26'] : WORLD.W.biome === 'garden' ? ['#6a8f34', '#7da43c', '#5a7d2c'] : ['#3f8a35', '#4f9c3c', '#357a2e'];
  const base = pal[c % 3];
  ctx.globalAlpha = S.cam.sz > 2.2 ? 0.45 : 0.82;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + c;
    const sw = Math.sin(t * 0.9 + i + x * 0.01) * 2.5 * wind;
    const bx = x + Math.cos(a) * R * 0.45 + sw, by = y + Math.sin(a) * R * 0.4 - 6;
    const r = R * (0.48 + hash2(i, c, 5) * 0.2);
    const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.35, r * 0.1, bx, by, r);
    g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
  }
  const g = ctx.createRadialGradient(x - R * 0.2, y - R * 0.3, 2, x, y - 6, R * 0.6);
  g.addColorStop(0, shade(base, 0.5)); g.addColorStop(1, shade(base, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 6, R * 0.55, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------- Nodos ----------------
function drawNode(ctx: CanvasRenderingContext2D, n: ResNode, t: number) {
  setWorldTransform(ctx);
  const f = clamp(n.amt / Math.max(1, n.max), 0, 1);
  const x = n.x, y = n.y;
  if (n.poi) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, n.r * 3);
    g.addColorStop(0, `rgba(255,230,140,${0.35 + 0.15 * Math.sin(t * 2)})`); g.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.r * 3, 0, TAU); ctx.fill();
  }
  if (UI.selNode === n.id) { ctx.strokeStyle = 'rgba(255,240,140,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, n.r + 6, 0, TAU); ctx.stroke(); }
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, n.r * 1.05, n.r * 0.6, 0, 0, TAU); ctx.fill();
  const seed = n.v * 1000;
  switch (n.kind) {
    case 'berry': {
      for (let i = 0; i < 6; i++) { const a = i + seed; ctx.fillStyle = i % 2 ? '#2f7a2c' : '#3d8f34'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * n.r * 0.5, y + Math.sin(a) * n.r * 0.45, n.r * 0.55, 0, TAU); ctx.fill(); }
      const k = Math.ceil(f * 9);
      for (let i = 0; i < k; i++) {
        const a = i * 2.4 + seed, r = n.r * 0.55 * ((i % 3) / 3 + 0.3);
        const bx = x + Math.cos(a) * r, by = y + Math.sin(a) * r * 0.8;
        ctx.fillStyle = '#4b2a8a'; ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7c56d6'; ctx.beginPath(); ctx.arc(bx - 0.6, by - 0.6, 1.7, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(bx - 1, by - 1, 0.6, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'seeds': case 'crumbs': {
      const k = Math.max(1, Math.ceil(f * (n.poi ? 22 : 12)));
      const c1 = n.kind === 'seeds' ? '#d9b46a' : '#e6c58f', c2 = n.kind === 'seeds' ? '#9a7434' : '#b88a50';
      for (let i = 0; i < k; i++) {
        const a = i * 2.39996 + seed, r = Math.sqrt(i / k) * n.r * 0.9;
        ctx.save(); ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8); ctx.rotate(a);
        ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 0, n.poi ? 4 : 2.8, n.poi ? 2.6 : 1.7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(-0.4, -0.4, n.poi ? 3 : 2, n.poi ? 1.6 : 1, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      if (n.poi) { ctx.fillStyle = '#c99a3a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 8, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7a5226'; ctx.beginPath(); ctx.ellipse(x, y - 11, 8.5, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,240,180,0.6)'; ctx.beginPath(); ctx.ellipse(x - 3, y - 4, 2, 4, 0, 0, TAU); ctx.fill(); }
      break;
    }
    case 'leaf': {
      const k = Math.max(1, Math.ceil(f * 7));
      for (let i = 0; i < k; i++) {
        const a = i * 2.1 + seed;
        ctx.save(); ctx.translate(x + Math.cos(a) * n.r * 0.4, y + Math.sin(a) * n.r * 0.35); ctx.rotate(a * 1.7);
        ctx.fillStyle = ['#5fae3a', '#76c442', '#4b9a30', '#8acc4a'][i % 4];
        ctx.beginPath(); ctx.ellipse(0, 0, n.r * 0.75, n.r * 0.35, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,70,15,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-n.r * 0.75, 0); ctx.lineTo(n.r * 0.75, 0); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'carcass': {
      const r = n.r * (0.5 + f * 0.5);
      ctx.fillStyle = '#4a2a1a'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, seed, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a160c'; ctx.lineWidth = 0.9;
      for (let i = 0; i < 6; i++) { const a = seed + i * 1.05; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.2); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,190,140,0.35)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.2, r * 0.4, r * 0.2, seed, 0, TAU); ctx.fill();
      break;
    }
    case 'sugar': {
      const s = n.r * (0.6 + 0.4 * f);
      ctx.fillStyle = '#e8ecf2'; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y - s * 0.5); ctx.lineTo(x + s, y + s * 0.5); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y + s * 0.5); ctx.lineTo(x - s, y - s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y - s * 0.5); ctx.lineTo(x, y); ctx.lineTo(x - s, y - s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9d2de'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y - s * 0.5); ctx.lineTo(x + s, y + s * 0.5); ctx.lineTo(x, y + s); ctx.closePath(); ctx.fill();
      const tw = (Math.sin(t * 4 + seed) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${tw})`; ctx.beginPath(); ctx.arc(x - s * 0.4, y - s * 0.4, 1.4, 0, TAU); ctx.fill();
      break;
    }
    case 'amber': {
      const k = Math.max(1, Math.ceil(f * 4));
      const g = ctx.createRadialGradient(x, y, 1, x, y, n.r * 2.4);
      g.addColorStop(0, `rgba(255,170,40,${0.25 + 0.1 * Math.sin(t * 3 + seed)})`); g.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.r * 2.4, 0, TAU); ctx.fill();
      for (let i = 0; i < k; i++) {
        const a = seed + i * 1.7, r = i ? n.r * 0.6 : 0;
        const bx = x + Math.cos(a) * r, by = y + Math.sin(a) * r;
        const s = n.r * (i ? 0.5 : 0.75);
        const gg = ctx.createRadialGradient(bx - s * 0.3, by - s * 0.4, 0.3, bx, by, s);
        gg.addColorStop(0, '#fff2b0'); gg.addColorStop(0.4, '#ffaa2a'); gg.addColorStop(1, '#a24a08');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(bx, by - s * 1.3); ctx.quadraticCurveTo(bx + s, by - s * 0.2, bx, by + s); ctx.quadraticCurveTo(bx - s, by - s * 0.2, bx, by - s * 1.3); ctx.fill();
      }
      break;
    }
    case 'nectar': {
      const pc = n.poi ? '#d8e6ff' : '#ff8ac8';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + seed; ctx.fillStyle = i % 2 ? pc : shade(pc, -0.12); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * n.r * 0.7, y + Math.sin(a) * n.r * 0.7, n.r * 0.6, n.r * 0.32, a, 0, TAU); ctx.fill(); }
      const g = ctx.createRadialGradient(x, y, 0, x, y, n.r * 0.6);
      g.addColorStop(0, '#fff6a0'); g.addColorStop(1, `rgba(255,200,40,${0.5 + 0.5 * f})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.r * 0.55, 0, TAU); ctx.fill();
      break;
    }
    case 'honeydew': {
      const r = 2 + 2.5 * f;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#ffe58a'); g.addColorStop(1, '#d99a1a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      break;
    }
    case 'mushroom': blit(ctx, shroomSprite(Math.floor(seed) % 4), x, y, 0, (n.r / 4) * (0.6 + 0.4 * f)); break;
    case 'fruit': {
      const r = n.r * (0.55 + 0.45 * f);
      const big = n.name === 'Manzana caída';
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r * 1.1);
      g.addColorStop(0, big ? '#ffb0a0' : '#ff8a7a'); g.addColorStop(0.5, big ? '#d8352a' : '#e0262a'); g.addColorStop(1, '#7a0a0a');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (big) ctx.arc(x, y, r, 0, TAU);
      else { ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 1.3, y + r * 0.2, x - r, y - r * 0.9, x, y - r * 0.7); ctx.bezierCurveTo(x + r, y - r * 0.9, x + r * 1.3, y + r * 0.2, x, y + r); }
      ctx.fill();
      if (!big) { ctx.fillStyle = '#ffe680'; for (let i = 0; i < 10; i++) { const a = i * 2.3, rr = r * 0.6 * ((i % 4) / 4 + 0.2); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.7, 1.1, a, 0, TAU); ctx.fill(); } }
      ctx.fillStyle = '#3f9a2a';
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.4, y - r * 0.7 + Math.sin(a) * r * 0.2, r * 0.35, r * 0.15, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.3, r * 0.2, r * 0.12, -0.6, 0, TAU); ctx.fill();
      break;
    }
  }
  if (n.poi && n.name && G.S.cam.sz > 0.7) {
    ctx.font = '800 8px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2.5; ctx.fillStyle = '#ffe9a8';
    ctx.strokeText('★ ' + n.name, x, y + n.r + 10); ctx.fillText('★ ' + n.name, x, y + n.r + 10);
  }
}

// ---------------- Estructuras ----------------
function mound(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tint: string) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(tint, 0.3)); g.addColorStop(0.7, tint); g.addColorStop(1, shade(tint, -0.4));
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, r * 1.05, r * 0.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.82, 0, 0, TAU); ctx.fill();
  // grumos
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, rr = r * Math.sqrt(((i * 7) % 18) / 18);
    ctx.fillStyle = i % 2 ? 'rgba(255,230,190,0.18)' : 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, 1.6, 0, TAU); ctx.fill();
  }
}
function drawStructure(ctx: CanvasRenderingContext2D, s: Structure, t: number) {
  const S = G.S;
  setWorldTransform(ctx);
  const col = S.colonies[s.col];
  const cc = COLONY_COLORS[col?.color ?? 0];
  const d = BUILDINGS[s.type];
  const x = s.x, y = s.y, r = d.radius;
  const soil = BIOMES[WORLD.W.biome].dirt;
  if (!s.built) ctx.globalAlpha = 0.55;
  if (UI.selStruct === s.id) {
    ctx.strokeStyle = rgba(cc.ui, 0.9); ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 10;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  switch (s.type) {
    case 'nest': case 'rivalnest': case 'satellite': {
      mound(ctx, x, y, r * 1.25, s.type === 'rivalnest' ? shade(soil, -0.15) : soil);
      // entrada
      const g = ctx.createRadialGradient(x, y - 2, 1, x, y - 2, r * 0.42);
      g.addColorStop(0, '#000'); g.addColorStop(0.7, '#1a0e06'); g.addColorStop(1, 'rgba(40,20,8,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 2, r * 0.42, r * 0.3, 0, 0, TAU); ctx.fill();
      // estandarte
      flag(ctx, x + r * 0.9, y - r * 0.5, cc.ui, EMBLEMS[col?.emblem ?? 0], t, s.type === 'satellite' ? '👑' : '');
      if (s.type === 'rivalnest') { ctx.fillStyle = rgba(cc.ui, 0.25 + 0.1 * Math.sin(t * 3)); ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, TAU); ctx.fill(); }
      break;
    }
    case 'outpost': mound(ctx, x, y, r, soil); ctx.fillStyle = '#1a0e06'; ctx.beginPath(); ctx.ellipse(x, y - 1, r * 0.3, r * 0.2, 0, 0, TAU); ctx.fill(); flag(ctx, x + r * 0.7, y - r * 0.4, cc.ui, EMBLEMS[col?.emblem ?? 0], t, ''); break;
    case 'tower': {
      mound(ctx, x, y + 4, r, soil);
      const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0);
      g.addColorStop(0, shade(soil, 0.25)); g.addColorStop(1, shade(soil, -0.35));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 8, y + 2); ctx.lineTo(x - 4, y - 22); ctx.lineTo(x + 4, y - 22); ctx.lineTo(x + 8, y + 2); ctx.closePath(); ctx.fill();
      const gl = ctx.createRadialGradient(x, y - 23, 0, x, y - 23, 7);
      gl.addColorStop(0, '#e9ffa0'); gl.addColorStop(1, 'rgba(120,230,40,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - 23, 7 + Math.sin(t * 4) * 1, 0, TAU); ctx.fill();
      ctx.fillStyle = cc.ui; ctx.fillRect(x - 4, y - 14, 8, 2);
      break;
    }
    case 'aphidfarm': {
      ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8 - 7); ctx.stroke(); }
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y - 4, r, r * 0.8, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#6fbf3a'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * 0.3, 0.4, 0, TAU); ctx.fill();
      break;
    }
    case 'banner': flag(ctx, x, y + 6, cc.ui, EMBLEMS[col?.emblem ?? 0], t, '', 1.5); break;
  }
  ctx.globalAlpha = 1;
  if (!s.built) {
    const f = s.prog / d.work;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    ctx.font = '700 8px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
    ctx.fillText('🔨 ' + Math.floor(f * 100) + '%', x, y + r + 14);
  }
  if (s.hp < s.mhp && s.built) hpBar(ctx, x, y - r - 12, r * 2, s.hp / s.mhp, s.col === 0 ? '#5dff7a' : '#ff6a5a');
  if (s.type === 'rivalnest' && G.S.cam.sz > 0.5) {
    setWorldTransform(ctx);
    ctx.font = '800 10px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.fillStyle = cc.ui;
    ctx.strokeText(col.name, x, y + r + 26); ctx.fillText(col.name, x, y + r + 26);
  }
  if (s.type === 'nest' && s.hp <= 1) {
    ctx.font = '800 10px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5b4f';
    ctx.fillText('¡ENTRADA DERRUIDA! La Reina está expuesta', x, y - r - 20);
  }
}
function flag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, emblem: string, t: number, extra: string, k = 1) {
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.6 * k;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 24 * k); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y - 24 * k);
  for (let i = 0; i <= 6; i++) { const fx = x + i * 2.4 * k; ctx.lineTo(fx, y - 24 * k + Math.sin(t * 5 + i * 0.8) * 1.5 * (i / 6)); }
  for (let i = 6; i >= 0; i--) { const fx = x + i * 2.4 * k; ctx.lineTo(fx, y - 14 * k + Math.sin(t * 5 + i * 0.8) * 1.5 * (i / 6)); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.font = `${7 * k}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(extra || emblem, x + 7 * k, y - 19 * k);
  ctx.textBaseline = 'alphabetic';
}

// ---------------- Eventos ----------------
function drawEventGround(ctx: CanvasRenderingContext2D, t: number) {
  for (const e of G.S.events) {
    if (e.id !== 'bird') continue;
    if (e.t < 2.5) {
      setWorldTransform(ctx);
      const k = e.t / 2.5;
      ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.4 * Math.sin(t * 12)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 120 * (1.2 - k * 0.5), 0, TAU); ctx.stroke();
    }
  }
}
function drawBird(ctx: CanvasRenderingContext2D, t: number) {
  for (const e of G.S.events) {
    if (e.id !== 'bird' || !e.data) continue;
    const d = e.data;
    if (e.t < 2.5) continue;
    setWorldTransform(ctx);
    ctx.save(); ctx.translate(d.bx, d.by); ctx.rotate(d.ang);
    const flap = Math.sin(t * 8) * 0.3;
    ctx.fillStyle = 'rgba(5,8,12,0.42)';
    ctx.beginPath(); ctx.ellipse(0, 0, 70, 22, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(-10, -90 - flap * 60, -50, -120 - flap * 40); ctx.quadraticCurveTo(-20, -40, -30, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(-10, 90 + flap * 60, -50, 120 + flap * 40); ctx.quadraticCurveTo(-20, 40, -30, 0); ctx.fill();
    ctx.restore();
  }
}

// ---------------- Iluminación y clima ----------------
function drawLighting(ctx: CanvasRenderingContext2D, cw: number, ch: number, t: number) {
  const S = G.S;
  let light = lightLevel();
  if (S.weather.kind === 'storm') light *= 0.7; else if (S.weather.kind === 'rain') light *= 0.85;
  const dusk = duskLevel();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (dusk > 0) { ctx.fillStyle = `rgba(255,120,50,${dusk * 0.16})`; ctx.fillRect(0, 0, cw, ch); }
  if (S.weather.kind === 'heat') { ctx.fillStyle = 'rgba(255,170,60,0.09)'; ctx.fillRect(0, 0, cw, ch); }
  if (light > 0.97) return;
  const L = lightC!;
  const lw = Math.ceil(cw / 3), lh = Math.ceil(ch / 3);
  if (L.width !== lw || L.height !== lh) { L.width = lw; L.height = lh; }
  const g = L.getContext('2d')!;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, lw, lh);
  g.fillStyle = `rgba(8,14,40,${(1 - light) * 0.95})`;
  g.fillRect(0, 0, lw, lh);
  g.globalCompositeOperation = 'destination-out';
  const sc = VT.z / 3;
  const hole = (x: number, y: number, r: number, a: number) => {
    const sx = ((x - VT.x) * VT.z + VT.cx) / 3, sy = ((y - VT.y) * VT.z + VT.cy) / 3, sr = r * sc;
    if (sx < -sr || sy < -sr || sx > lw + sr || sy > lh + sr) return;
    const gr = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
  };
  for (const s of S.structures) if (s.col === 0 || s.type === 'rivalnest') hole(s.x, s.y, s.type === 'nest' ? 220 : 140, 0.85);
  for (const n of S.nodes) if (n.kind === 'amber' || n.kind === 'nectar' || n.poi) hole(n.x, n.y, 50, 0.6);
  for (const p of S.projectiles) hole(p.x, p.y, 30, 0.7);
  for (const a of ambient) if (a.k === 1) hole(a.x, a.y, 26, 0.5 + 0.3 * Math.sin(t * 3 + a.c * 5));
  let k = 0;
  for (const a of S.ants) { if (a.col === 0 && a.layer === 0 && UI.sel.has(a.id) && k++ < 80) hole(a.x, a.y, 40, 0.5); }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(L, 0, 0, lw * 3, lh * 3);
  // brillo nocturno en el horizonte
  ctx.fillStyle = `rgba(90,120,255,${(1 - light) * 0.05})`; ctx.fillRect(0, 0, cw, ch);
}

function drawWeather(ctx: CanvasRenderingContext2D, cw: number, ch: number, dt: number, t: number) {
  const S = G.S;
  const k = S.weather.kind;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const rain = k === 'rain' || k === 'storm';
  const want = rain ? (k === 'storm' ? 520 : 300) : 0;
  const ramp = clamp(Math.min(S.weather.t / 6, (S.weather.dur - S.weather.t) / 6), 0, 1);
  while (drops.length < want * ramp) drops.push({ x: Math.random() * cw, y: Math.random() * ch, s: 0.6 + Math.random() * 0.8 });
  if (drops.length > want * ramp) drops.length = Math.floor(want * ramp);
  if (drops.length) {
    ctx.strokeStyle = 'rgba(190,210,255,0.45)'; ctx.lineWidth = 1.2 * VT.dpr;
    ctx.beginPath();
    const wx = k === 'storm' ? -260 : -120;
    for (const d of drops) {
      d.x += wx * dt * d.s * VT.dpr; d.y += 900 * dt * d.s * VT.dpr;
      if (d.y > ch) { d.y = -10; d.x = Math.random() * (cw + 200); }
      if (d.x < -20) d.x += cw + 40;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + wx * 0.018 * d.s, d.y + 16 * d.s * VT.dpr);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(20,30,50,${0.12 * ramp})`; ctx.fillRect(0, 0, cw, ch);
  }
  if (k === 'storm') {
    lightning -= dt;
    if (lightning <= 0 && Math.random() < dt * 0.12) { lightning = 0.35; emit('thunder', {}); }
    if (lightning > 0) { ctx.fillStyle = `rgba(230,240,255,${lightning * 1.6 * (Math.random() * 0.5 + 0.5)})`; ctx.fillRect(0, 0, cw, ch); }
  }
  if (k === 'fog') {
    const a = 0.32 * ramp;
    for (let i = 0; i < 4; i++) {
      const fx = ((t * 12 * (i + 1) + i * 400) % (cw + 800)) - 400, fy = ch * (0.2 + i * 0.22);
      const g = ctx.createRadialGradient(fx, fy, 10, fx, fy, cw * 0.5);
      g.addColorStop(0, `rgba(230,235,240,${a})`); g.addColorStop(1, 'rgba(230,235,240,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    ctx.fillStyle = `rgba(220,225,230,${a * 0.5})`; ctx.fillRect(0, 0, cw, ch);
  }
  if (UI.flash > 0) {
    ctx.fillStyle = rgba(UI.flashColor, UI.flash * 0.5); ctx.fillRect(0, 0, cw, ch);
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, dt: number, t: number) {
  setWorldTransform(ctx);
  for (let i = UI.markers.length - 1; i >= 0; i--) {
    const m = UI.markers[i];
    m.t += dt;
    if (m.t > 0.9) { UI.markers.splice(i, 1); continue; }
    const k = m.t / 0.9;
    const c = m.kind === 'attack' ? '#ff5b4f' : m.kind === 'gather' ? '#ffd24a' : m.kind === 'rally' ? '#7fd3ff' : m.kind === 'build' ? '#ffb347' : '#7dff8f';
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 14 * (1 - k * 0.6), 9 * (1 - k * 0.6), 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 5, 3, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // punto de reunión
  const p = G.S.colonies[0];
  if (p.rally) {
    const x = p.rally.x, y = p.rally.y;
    ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
    ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 10, y - 14 + Math.sin(t * 5)); ctx.lineTo(x, y - 10); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, TAU); ctx.stroke();
  }
}

function drawPlacement(ctx: CanvasRenderingContext2D, t: number) {
  const pl = UI.placing;
  if (!pl || G.S.view !== 'surface') return;
  const x = UI.mouse.wx, y = UI.mouse.wy;
  setWorldTransform(ctx);
  if (pl.kind === 'building') {
    const d = BUILDINGS[pl.type];
    const ok = canPlaceBuilding(pl.type, x, y);
    ctx.fillStyle = ok.ok ? 'rgba(120,255,140,0.2)' : 'rgba(255,90,80,0.25)';
    ctx.strokeStyle = ok.ok ? '#7dff8f' : '#ff5b4f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, d.radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.arc(x, y, d.territory * TS, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 10px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = ok.ok ? '#c9ffd0' : '#ffb0a8';
    ctx.fillText(ok.ok ? d.name : ok.reason, x, y - d.radius - 8);
  } else if (pl.kind === 'rally') {
    ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.stroke();
  }
  void passableAt;
}

export function isVisibleWorld(x: number, y: number) {
  const W = WORLD.W;
  const i = Math.floor(y / TS) * W.w + Math.floor(x / TS);
  return VIS[i] === 1;
}
export { AS };
