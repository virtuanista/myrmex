// Render de la vista del hormiguero (corte lateral).
import { CASTES, CHAMBERS, COLONY_COLORS, DECORS, EMBLEMS } from '../game/defs';
import { Chamber, G, NEST_SKY, NTS } from '../game/state';
import { nestVersion, canPlaceChamber, chamberProgress, inEllipse, floorY } from '../game/nest';
import { pstats, stageOf, CC } from '../game/colony';
import { lightLevel, dayPhase, isNight } from '../game/time';
import { ANT_FRAMES, VT, antSprite, blit, setWorldTransform, shadowSprite } from './sprites';
import { drawCarry } from './surface';
import { drawParticles, drawTexts } from './particles';
import { UI } from '../ui/uistate';
import { Noise, TAU, clamp, hash2, lerp, mixHex, rgba, shade } from '../core/util';

let dirtC: HTMLCanvasElement | null = null;
let tunC: HTMLCanvasElement | null = null;
let tunVer = -1, rockSig = -1, lastTun = 0;
let seed = 0;

export function resetNestRender() { dirtC = null; tunC = null; tunVer = -1; rockSig = -1; }

const STRATA = ['#7a5232', '#6e4628', '#5f3b22', '#6a4426', '#55341d', '#4a2c18', '#5a361e', '#43281a'];
function depthColor(y: number, H: number) {
  const t = clamp((y - NEST_SKY) / (H - NEST_SKY), 0, 1);
  const i = t * (STRATA.length - 1);
  const a = Math.floor(i);
  return mixHex(STRATA[a], STRATA[Math.min(STRATA.length - 1, a + 1)], i - a);
}

function buildDirt() {
  const n = G.S.nest;
  seed = G.S.cfg.seed;
  const W = n.W * NTS, H = n.H * NTS;
  dirtC = document.createElement('canvas'); dirtC.width = W; dirtC.height = H;
  const g = dirtC.getContext('2d')!;
  const nz = new Noise(seed + 5);
  // estratos ondulados
  for (let y = NEST_SKY; y < n.H; y++) for (let x = 0; x < n.W; x++) {
    const wob = (nz.fbm(x / 12, y / 5, 3) - 0.5) * 6;
    const c = depthColor(y + wob * 0.6, n.H);
    g.fillStyle = shade(c, (hash2(x, y, 4) - 0.5) * 0.08);
    g.fillRect(x * NTS, y * NTS, NTS, NTS);
  }
  // suavizar con ruido de grano
  for (let k = 0; k < (W * H) / 30; k++) {
    const x = Math.random() * W, y = NEST_SKY * NTS + Math.random() * (H - NEST_SKY * NTS);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,220,180,0.07)';
    const s = 0.7 + Math.random() * 1.8;
    g.fillRect(x, y, s, s);
  }
  // guijarros
  for (let k = 0; k < 420; k++) {
    const x = Math.random() * W, y = NEST_SKY * NTS + 20 + Math.random() * (H - NEST_SKY * NTS - 20);
    const r = 1.2 + Math.random() * 3.5;
    g.fillStyle = `rgba(${150 + Math.random() * 60},${130 + Math.random() * 50},${110 + Math.random() * 40},0.55)`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, Math.random() * 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
  }
  // raíces desde arriba
  g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    let x = Math.random() * W, y = NEST_SKY * NTS;
    let a = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    let w = 3 + Math.random() * 3;
    g.strokeStyle = 'rgba(150,105,60,0.55)';
    for (let s = 0; s < 40 && w > 0.4; s++) {
      const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; a += (Math.random() - 0.5) * 0.5; w *= 0.93;
      if (Math.random() < 0.12) { g.lineWidth = w * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + 20); g.stroke(); }
    }
  }
  // fósiles decorativos lejanos
  for (let k = 0; k < 5; k++) {
    const x = 60 + Math.random() * (W - 120), y = NEST_SKY * NTS + 200 + Math.random() * (H - 300);
    g.strokeStyle = 'rgba(230,210,170,0.18)'; g.lineWidth = 1.5;
    g.beginPath(); for (let t = 0; t < 12; t += 0.25) { const r = 2 + t * 1.4; g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); } g.stroke();
  }
  // rocas
  drawRocks(g);
}
function drawRocks(g: CanvasRenderingContext2D) {
  const n = G.S.nest;
  let sig = 0;
  const cells: number[] = [];
  for (let y = 0; y < n.H; y++) for (let x = 0; x < n.W; x++) if (n.grid[y * n.W + x] === 2) { cells.push(x, y); sig += x * 7 + y * 13; }
  // contorno oscuro
  g.fillStyle = '#2e2a28';
  g.beginPath();
  for (let i = 0; i < cells.length; i += 2) { const px = (cells[i] + 0.5) * NTS, py = (cells[i + 1] + 0.5) * NTS; g.moveTo(px + NTS, py + 1); g.arc(px, py + 1, NTS * 0.95, 0, TAU); }
  g.fill();
  // cuerpo de piedra
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i], y = cells[i + 1];
    const px = (x + 0.5) * NTS, py = (y + 0.5) * NTS;
    const v = hash2(Math.floor(x / 3), Math.floor(y / 3), 77);
    g.fillStyle = mixHex('#86817c', '#6a6662', v);
    g.beginPath(); g.arc(px, py, NTS * 0.86, 0, TAU); g.fill();
  }
  // brillos y vetas
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i], y = cells[i + 1];
    const up = y > 0 && n.grid[(y - 1) * n.W + x] !== 2;
    const px = (x + 0.5) * NTS, py = (y + 0.5) * NTS;
    if (up) { g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.ellipse(px, py - NTS * 0.35, NTS * 0.6, NTS * 0.25, 0, 0, TAU); g.fill(); }
    const h = hash2(x, y, 31);
    if (h < 0.12) { g.strokeStyle = 'rgba(40,36,34,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - 4, py - 2); g.lineTo(px + 3, py + 3); g.stroke(); }
    else if (h > 0.93) { g.fillStyle = 'rgba(210,200,255,0.35)'; g.beginPath(); g.arc(px, py, 1.5, 0, TAU); g.fill(); }
  }
  rockSig = sig;
}
function rockSignature() {
  const n = G.S.nest;
  let sig = 0;
  for (let y = 0; y < n.H; y++) for (let x = 0; x < n.W; x++) if (n.grid[y * n.W + x] === 2) sig += x * 7 + y * 13;
  return sig;
}

function buildTunnels() {
  const n = G.S.nest;
  const W = n.W * NTS, H = n.H * NTS;
  if (!tunC) { tunC = document.createElement('canvas'); tunC.width = W; tunC.height = H; }
  const g = tunC.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  // borde oscuro
  g.fillStyle = 'rgba(22,12,6,0.92)';
  g.beginPath();
  for (let y = NEST_SKY; y < n.H; y++) for (let x = 0; x < n.W; x++) {
    if (n.grid[y * n.W + x] !== 1) continue;
    const px = (x + 0.5) * NTS, py = (y + 0.5) * NTS;
    g.moveTo(px + NTS, py); g.arc(px, py, NTS * 1.0, 0, TAU);
  }
  g.fill();
  // interior por filas
  for (let y = NEST_SKY; y < n.H; y++) {
    g.fillStyle = shade(depthColor(y, n.H), -0.42);
    g.beginPath();
    let any = false;
    for (let x = 0; x < n.W; x++) {
      if (n.grid[y * n.W + x] !== 1) continue;
      any = true;
      const px = (x + 0.5) * NTS, py = (y + 0.5) * NTS;
      g.moveTo(px + NTS * 0.8, py); g.arc(px, py, NTS * 0.8, 0, TAU);
    }
    if (any) g.fill();
  }
  // suelo iluminado (casilla abierta con tierra debajo)
  g.fillStyle = 'rgba(255,200,140,0.10)';
  for (let y = NEST_SKY; y < n.H - 1; y++) for (let x = 0; x < n.W; x++) {
    const i = y * n.W + x;
    if (n.grid[i] === 1 && n.grid[i + n.W] !== 1) {
      g.beginPath(); g.ellipse((x + 0.5) * NTS, (y + 0.85) * NTS, NTS * 0.7, NTS * 0.22, 0, 0, TAU); g.fill();
    }
  }
  // techo sombreado
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = NEST_SKY + 1; y < n.H; y++) for (let x = 0; x < n.W; x++) {
    const i = y * n.W + x;
    if (n.grid[i] === 1 && n.grid[i - n.W] !== 1 && n.grid[i - n.W] !== 3) {
      g.beginPath(); g.ellipse((x + 0.5) * NTS, (y + 0.15) * NTS, NTS * 0.7, NTS * 0.25, 0, 0, TAU); g.fill();
    }
  }
  tunVer = nestVersion;
}

// ---------------------------------------------------------------
export function drawNest(ctx: CanvasRenderingContext2D, cw: number, ch: number, alpha: number, dt: number) {
  const S = G.S;
  const n = S.nest;
  const dpr = VT.dpr;
  const t = performance.now() / 1000;
  if (!dirtC) buildDirt();
  if (tunVer !== nestVersion && t - lastTun > 0.15) {
    const rs = rockSignature();
    if (rs !== rockSig) buildDirt();
    buildTunnels(); lastTun = t;
  }
  if (!tunC) buildTunnels();
  const sh = UI.shake;
  VT.z = S.cam.nz * dpr; VT.x = S.cam.nx + (Math.random() - 0.5) * sh; VT.y = S.cam.ny + (Math.random() - 0.5) * sh;
  VT.cx = cw / 2; VT.cy = ch / 2;
  const x0 = VT.x - cw / 2 / VT.z, y0 = VT.y - ch / 2 / VT.z, x1 = VT.x + cw / 2 / VT.z, y1 = VT.y + ch / 2 / VT.z;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // cielo
  const light = lightLevel();
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  const top = isNight() ? '#0b1030' : mixHex('#1b2450', '#7fc4ff', light);
  const bot = isNight() ? '#1a1838' : mixHex('#3a2a50', '#d8f0ff', light);
  sky.addColorStop(0, top); sky.addColorStop(1, bot);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
  setWorldTransform(ctx);
  const WP = n.W * NTS, HP = n.H * NTS, GY = NEST_SKY * NTS;
  // sol / luna
  const ph = dayPhase();
  const sx = WP * (0.1 + 0.8 * ((ph < 0.75 ? ph / 0.75 : (ph - 0.75) / 0.25)));
  const sy = GY - 40 - Math.sin((ph < 0.75 ? ph / 0.75 : (ph - 0.75) / 0.25) * Math.PI) * 30;
  const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 40);
  if (ph < 0.75) { sg.addColorStop(0, '#fff8d0'); sg.addColorStop(0.3, 'rgba(255,230,120,0.8)'); sg.addColorStop(1, 'rgba(255,200,80,0)'); }
  else { sg.addColorStop(0, '#f0f4ff'); sg.addColorStop(0.3, 'rgba(200,210,255,0.6)'); sg.addColorStop(1, 'rgba(160,180,255,0)'); }
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 40, 0, TAU); ctx.fill();
  // colinas lejanas
  ctx.fillStyle = mixHex('#1c2a20', '#6a9a5a', light * 0.8);
  ctx.beginPath(); ctx.moveTo(-200, GY);
  for (let x = -200; x <= WP + 200; x += 40) ctx.lineTo(x, GY - 18 - Math.sin(x * 0.006 + 1) * 12 - Math.sin(x * 0.017) * 6);
  ctx.lineTo(WP + 200, GY); ctx.fill();
  // tierra fuera del mapa
  ctx.fillStyle = '#2a170c'; ctx.fillRect(-2000, GY, WP + 4000, HP + 2000);
  // tierra
  ctx.drawImage(dirtC!, 0, 0);
  ctx.drawImage(tunC!, 0, 0);
  // hierba superficie
  ctx.fillStyle = mixHex('#24401c', '#5f9a3a', light);
  ctx.fillRect(-2000, GY - 4, WP + 4000, 6);
  ctx.strokeStyle = mixHex('#2c5022', '#76b84a', light); ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = Math.max(-200, Math.floor(x0)); x < Math.min(WP + 200, x1); x += 3) {
    const h = 4 + hash2(x, 1, 2) * 7, sw = Math.sin(t * 1.5 + x * 0.05) * 1.5;
    ctx.moveTo(x, GY - 2); ctx.lineTo(x + sw, GY - 2 - h);
  }
  ctx.stroke();
  // montículo de la entrada
  const ex = (n.ex + 0.5) * NTS;
  const mg = ctx.createRadialGradient(ex - 10, GY - 10, 4, ex, GY, 60);
  mg.addColorStop(0, '#a87a4c'); mg.addColorStop(1, '#5a3a20');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(ex, GY, 60, 22, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#140a04'; ctx.beginPath(); ctx.ellipse(ex, GY - 1, 11, 6, 0, 0, TAU); ctx.fill();
  const pc = COLONY_COLORS[S.colonies[0].color];
  ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex + 40, GY - 8); ctx.lineTo(ex + 40, GY - 46); ctx.stroke();
  ctx.fillStyle = pc.ui; ctx.beginPath(); ctx.moveTo(ex + 40, GY - 46);
  for (let i = 0; i <= 6; i++) ctx.lineTo(ex + 40 + i * 4, GY - 46 + Math.sin(t * 4 + i) * 2 * (i / 6));
  for (let i = 6; i >= 0; i--) ctx.lineTo(ex + 40 + i * 4, GY - 32 + Math.sin(t * 4 + i) * 2 * (i / 6));
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(EMBLEMS[S.colonies[0].emblem], ex + 52, GY - 39); ctx.textBaseline = 'alphabetic';

  // designaciones de excavación
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const tx0 = Math.max(0, Math.floor(x0 / NTS)), ty0 = Math.max(0, Math.floor(y0 / NTS));
  const tx1 = Math.min(n.W - 1, Math.floor(x1 / NTS)), ty1 = Math.min(n.H - 1, Math.floor(y1 / NTS));
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const i = y * n.W + x;
    if (n.dig[i] && n.grid[i] === 0) {
      ctx.fillStyle = `rgba(255,170,60,${0.16 + pulse * 0.14})`;
      ctx.fillRect(x * NTS + 1, y * NTS + 1, NTS - 2, NTS - 2);
      ctx.strokeStyle = 'rgba(255,200,110,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x * NTS + 2, y * NTS + NTS - 2); ctx.lineTo(x * NTS + NTS - 2, y * NTS + 2); ctx.stroke();
      const p = n.digp[i];
      if (p > 0) {
        ctx.strokeStyle = `rgba(20,10,4,${0.4 + p * 0.5})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x * NTS + 6, y * NTS + 6); ctx.lineTo(x * NTS + 6 - p * 4, y * NTS + 6 + p * 5); ctx.moveTo(x * NTS + 6, y * NTS + 6); ctx.lineTo(x * NTS + 6 + p * 5, y * NTS + 6 - p * 2); ctx.stroke();
      }
    }
    // destellos de tesoro cercanos a túneles
    const tr = n.treas[i];
    if (tr && n.grid[i] === 0) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * n.W + x + dx; if (n.grid[j] === 1) { near = true; break; } }
      if (near) {
        const tw = Math.max(0, Math.sin(t * 2.5 + x * 1.7 + y));
        if (tw > 0.6) {
          const col = tr === 1 ? '#ffb347' : tr === 2 ? '#fff0c8' : tr === 3 ? '#d6b8ff' : '#ffe08a';
          ctx.fillStyle = rgba(col, (tw - 0.6) * 2);
          const cx = (x + 0.5) * NTS, cy = (y + 0.5) * NTS, r = 3 * (tw - 0.5);
          ctx.beginPath(); ctx.moveTo(cx, cy - r * 2); ctx.lineTo(cx + r * 0.5, cy); ctx.lineTo(cx, cy + r * 2); ctx.lineTo(cx - r * 0.5, cy); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx - r * 2, cy); ctx.lineTo(cx, cy + r * 0.5); ctx.lineTo(cx + r * 2, cy); ctx.lineTo(cx, cy - r * 0.5); ctx.fill();
        }
      }
    }
  }

  // cámaras
  for (const c of n.chambers) drawChamber(ctx, c, t);

  // cría
  for (const b of n.brood) {
    const st = stageOf(b.prog);
    const w = Math.sin(t * 3 + b.id) * 0.3;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(w * (st === 1 ? 1 : 0.2));
    if (st === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0.5, 1.5, 2.6, 1.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fbf7ea'; ctx.beginPath(); ctx.ellipse(0, 0, 2, 2.8, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-0.6, -1, 0.7, 0, TAU); ctx.fill();
    } else if (st === 1) {
      const s = 0.8 + (b.prog - 0.3) / 0.45 * 0.8;
      ctx.scale(s, s);
      ctx.fillStyle = '#fff6df'; ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0.3, Math.PI * 1.7); ctx.lineWidth = 3.4; ctx.strokeStyle = '#fff3d6'; ctx.stroke();
      ctx.fillStyle = '#e8d6b0'; ctx.beginPath(); ctx.arc(Math.cos(0.3) * 3.5, Math.sin(0.3) * 3.5, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(180,150,100,0.5)'; ctx.lineWidth = 0.4;
      for (let k = 0; k < 5; k++) { const a = 0.6 + k * 0.45; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2); ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.stroke(); }
    } else {
      const big = CASTES[b.caste].size;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0.5, 2.5, 4 * big, 1.6, 0, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(-3, -4, 3, 4);
      g.addColorStop(0, '#f2dfb6'); g.addColorStop(1, '#b8945a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 2.8 * big, 4.6 * big, 1.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,40,0.5)'; ctx.lineWidth = 0.5;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(k * 1.8 * big, 0, 0.6, 2.4 * big, 1.2, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  // reina
  const p = S.colonies[0];
  const qs = antSprite(p.color, 'queen', Math.floor(t * 2) % ANT_FRAMES, 3);
  n.queenA = Math.sin(t * 0.2) * 0.3;
  const breathe = 1 + Math.sin(t * 2) * 0.02;
  ctx.globalAlpha = 0.8; blit(ctx, shadowSprite(), n.queenX + 2, n.queenY + 5, n.queenA, 1.4); ctx.globalAlpha = 1;
  blit(ctx, qs, n.queenX, n.queenY, n.queenA, 0.62 * breathe);
  if (p.queenHp < p.queenMhp) {
    setWorldTransform(ctx);
    const f = p.queenHp / p.queenMhp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(n.queenX - 20, n.queenY - 26, 40, 4);
    ctx.fillStyle = f > 0.5 ? '#5dff7a' : '#ff5b4f'; ctx.fillRect(n.queenX - 20, n.queenY - 26, 40 * f, 4);
  }

  // hormigas del nido
  for (const a of S.ants) {
    if (a.layer !== 1) continue;
    const x = lerp(a.px, a.x, alpha), y = lerp(a.py, a.y, alpha);
    if (x < x0 - 20 || x > x1 + 20 || y < y0 - 20 || y > y1 + 20) continue;
    const def = CASTES[a.caste];
    const sp = antSprite(p.color, a.caste, Math.floor(a.ph) % ANT_FRAMES, def.size);
    blit(ctx, sp, x, y, a.a, 0.9);
    if (a.carry) drawCarry(ctx, x, y, a.a, a.carry, def.size, a.ca);
    if (UI.sel.has(a.id)) { setWorldTransform(ctx); ctx.strokeStyle = '#8cff9a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke(); }
  }

  drawParticles(ctx, 1);

  // brillos de luz (aditivo)
  setWorldTransform(ctx);
  ctx.globalCompositeOperation = 'lighter';
  for (const c of n.chambers) {
    if (c.state !== 1) continue;
    for (const d of c.decor) {
      const def = DECORS.find(x => x.id === d.k);
      if (!def?.glow) continue;
      const px = d.x * NTS, py = d.y * NTS;
      const r = 22 + Math.sin(t * 2 + px) * 3;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(def.glow, 0.35)); g.addColorStop(1, rgba(def.glow, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    if (c.type === 'royal' || c.type === 'lab' || c.type === 'hall') {
      const col = CHAMBERS[c.type].color;
      const px = c.cx * NTS + NTS / 2, py = c.cy * NTS + NTS / 2;
      const r = c.rx * NTS * 1.1;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(col, 0.13 + 0.04 * Math.sin(t * 1.5))); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // fantasmas de colocación
  drawNestPlacement(ctx, t);
  drawTexts(ctx, 1);

  // viñeta
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
  if (UI.flash > 0) { ctx.fillStyle = rgba(UI.flashColor, UI.flash * 0.5); ctx.fillRect(0, 0, cw, ch); }
  void dt;
}

function drawChamber(ctx: CanvasRenderingContext2D, c: Chamber, t: number) {
  const S = G.S;
  const d = CHAMBERS[c.type];
  const cx = (c.cx + 0.5) * NTS, cy = (c.cy + 0.5) * NTS;
  const rx = (c.rx + 0.35) * NTS, ry = (c.ry + 0.35) * NTS;
  setWorldTransform(ctx);
  const sel = UI.selChamber === c.id;
  if (c.state === 0) {
    const prog = chamberProgress(c);
    ctx.strokeStyle = rgba(d.color, 0.75); ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 10;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '800 10px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9b8';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
    const label = `${d.icon} ${d.name} · ${Math.floor(prog * 100)}%`;
    ctx.strokeText(label, cx, cy - ry - 6); ctx.fillText(label, cx, cy - ry - 6);
    return;
  }
  // suelo tintado
  const fg = ctx.createRadialGradient(cx, cy + ry * 0.5, 2, cx, cy, rx);
  fg.addColorStop(0, rgba(d.color, 0.16)); fg.addColorStop(1, rgba(d.color, 0));
  ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
  if (sel) { ctx.strokeStyle = rgba(d.color, 0.9); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 12; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  const floor = (fx: number) => floorY(c, fx / NTS - 0.5) * NTS + NTS / 2;
  switch (c.type) {
    case 'royal': {
      // cojín de pétalos
      ctx.fillStyle = 'rgba(255,190,90,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, floor(cx) - 2, rx * 0.55, 6, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 9; i++) {
        const px = cx - rx * 0.5 + i * rx * 0.125, py = floor(px) - 2;
        ctx.fillStyle = i % 2 ? '#ff9fb8' : '#ffd0de'; ctx.beginPath(); ctx.ellipse(px, py, 5, 2.4, i, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'storage': {
      const p = S.colonies[0];
      const ps = pstats();
      const f = clamp(p.res.food / ps.foodCap, 0, 1), fl = clamp(p.res.leaves / ps.leafCap, 0, 1);
      heap(ctx, cx - rx * 0.25, floor(cx - rx * 0.25), rx * 0.55, f, ['#ffcf4a', '#e8a838', '#7c56d6', '#d9b46a', '#ff8a5a'], c.id);
      heap(ctx, cx + rx * 0.45, floor(cx + rx * 0.45), rx * 0.35, fl, ['#5fae3a', '#76c442', '#8acc4a'], c.id + 7, true);
      break;
    }
    case 'fungus': {
      const p = S.colonies[0];
      const k = Math.ceil(clamp(p.res.leaves / 60, 0.2, 1) * (8 + c.level * 5));
      for (let i = 0; i < k; i++) {
        const px = cx - rx * 0.75 + hash2(i, c.id, 1) * rx * 1.5, py = floor(px) - 2 - hash2(c.id, i, 2) * 8;
        const r = 3 + hash2(i, i, c.id) * 4 + Math.sin(t + i) * 0.4;
        ctx.fillStyle = 'rgba(80,120,40,0.6)'; ctx.beginPath(); ctx.ellipse(px, py + 2, r * 1.1, r * 0.5, 0, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.4, 0.5, px, py, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8cdb8');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'lab': {
      for (let i = 0; i < 3 + c.level * 2; i++) {
        const px = cx - rx * 0.6 + (i / (2 + c.level * 2)) * rx * 1.2, py = floor(px) - 4;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 5);
        const hue = ['#8fd3ff', '#b9ff8f', '#ffcf8f', '#e0a8ff'][i % 4];
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, hue); g.addColorStop(1, rgba(hue, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py + Math.sin(t * 2 + i) * 1.5, 5, 0, TAU); ctx.fill();
      }
      // burbujas
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.4 + i / 6) % 1;
        const px = cx + Math.sin(i * 3 + t) * rx * 0.5, py = cy + ry * 0.5 - k * ry * 1.2;
        ctx.strokeStyle = `rgba(160,220,255,${0.6 * (1 - k)})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(px, py, 1.5 + k * 1.5, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'barracks': {
      for (let i = 0; i < 2 + c.level; i++) {
        const px = cx - rx * 0.5 + i * (rx / (1 + c.level)), py = floor(px);
        ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 16); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(px + 2, py - 16); ctx.lineTo(px + 10, py - 13); ctx.lineTo(px + 2, py - 10); ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,180,140,0.5)'; ctx.beginPath(); ctx.ellipse(cx + rx * 0.4, floor(cx + rx * 0.4) - 4, 5, 6, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'dorm': {
      for (let i = 0; i < 5; i++) {
        const px = cx - rx * 0.6 + i * rx * 0.3, py = floor(px) - 1;
        ctx.fillStyle = 'rgba(200,170,255,0.25)'; ctx.beginPath(); ctx.ellipse(px, py, 8, 2.5, 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(230,220,255,0.7)'; ctx.font = '8px Nunito'; ctx.textAlign = 'center';
      ctx.fillText('z', cx + Math.sin(t) * 3, cy - ry * 0.3 - (t * 6) % 10);
      break;
    }
    case 'midden': {
      heap(ctx, cx, floor(cx), rx * 0.6, 0.6, ['#6a5a3a', '#4a3a26', '#8a7a5a', '#3a2a1a'], c.id);
      break;
    }
    case 'hall': {
      for (let i = 0; i < 4; i++) {
        const px = cx - rx * 0.7 + i * rx * 0.466;
        const fy = floor(px);
        const top = cy - ry * 0.75 + Math.abs(px - cx) * 0.25;
        const g = ctx.createLinearGradient(px - 4, 0, px + 4, 0);
        g.addColorStop(0, '#e8d8a8'); g.addColorStop(1, '#9a8458');
        ctx.fillStyle = g; ctx.fillRect(px - 3.5, top, 7, fy - top);
        ctx.fillStyle = '#fff1c8'; ctx.fillRect(px - 5, top - 2, 10, 3); ctx.fillRect(px - 5, fy - 3, 10, 3);
      }
      const g = ctx.createRadialGradient(cx, cy - ry * 0.5, 0, cx, cy - ry * 0.5, 10);
      g.addColorStop(0, '#fffbe0'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - ry * 0.5, 10 + Math.sin(t * 3), 0, TAU); ctx.fill();
      break;
    }
  }
  // decoraciones
  for (const dd of c.decor) drawDecor(ctx, dd.k, dd.x * NTS, dd.y * NTS, t, S.colonies[0].color);
  // etiqueta
  if (S.cam.nz > 0.75) {
    ctx.font = '800 9px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; ctx.fillStyle = rgba(d.color, 0.95);
    const stars = '★'.repeat(c.level);
    const w = CC[0]?.inChamber.get(c.id) || 0;
    const label = `${d.icon} ${d.name} ${stars}${w ? ' · 🐜' + w : ''}`;
    ctx.strokeText(label, cx, cy - ry - 4); ctx.fillText(label, cx, cy - ry - 4);
  }
}

function heap(ctx: CanvasRenderingContext2D, x: number, fy: number, w: number, f: number, cols: string[], sd: number, leaves = false) {
  const n = Math.floor(f * 70);
  const rows = Math.ceil(Math.sqrt(n));
  let k = 0;
  for (let r = 0; r < rows && k < n; r++) {
    const rw = w * (1 - r / (rows + 1));
    const cnt = Math.max(1, Math.round((rw / w) * rows * 1.4));
    for (let i = 0; i < cnt && k < n; i++, k++) {
      const px = x - rw + (i + 0.5) * (2 * rw / cnt) + (hash2(i, r, sd) - 0.5) * 3;
      const py = fy - 2 - r * 3.2 + (hash2(r, i, sd) - 0.5) * 1.5;
      const c = cols[Math.floor(hash2(i * 3, r * 7, sd) * cols.length)];
      if (leaves) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(hash2(i, r, 9) * 3);
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 4, 1.8, 0, 0, TAU); ctx.fill(); ctx.restore();
      } else {
        ctx.fillStyle = shade(c, -0.3); ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px - 0.4, py - 0.5, 1.9, 0, TAU); ctx.fill();
      }
    }
  }
}

export function drawDecor(ctx: CanvasRenderingContext2D, k: string, x: number, y: number, t: number, color: number) {
  const pc = COLONY_COLORS[color];
  switch (k) {
    case 'moss':
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#4f8a33' : '#6fae43'; ctx.beginPath(); ctx.arc(x - 6 + i * 2.4, y - 1 - Math.abs(Math.sin(i)) * 2, 2.6, 0, TAU); ctx.fill(); }
      break;
    case 'pebbles':
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#c9bfa8', '#a0968a', '#e0d6c0', '#8f877a'][i % 4]; ctx.beginPath(); ctx.ellipse(x - 6 + i * 3, y - 1.5, 2.2, 1.6, i, 0, TAU); ctx.fill(); }
      break;
    case 'petal':
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.fillStyle = '#ff9fc4'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 3, y - 4 + Math.sin(a) * 3, 3.2, 1.8, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(x, y - 4, 1.6, 0, TAU); ctx.fill();
      break;
    case 'mushroom': {
      ctx.fillStyle = '#efe3c8'; ctx.fillRect(x - 1.2, y - 7, 2.4, 7);
      const g = ctx.createRadialGradient(x, y - 8, 0, x, y - 8, 7);
      g.addColorStop(0, '#e8fff4'); g.addColorStop(1, '#5fdca8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 7, 6, 4, 0, Math.PI, TAU); ctx.fill();
      break;
    }
    case 'shell': {
      const g = ctx.createRadialGradient(x - 2, y - 6, 0.5, x, y - 5, 7);
      g.addColorStop(0, '#fff0d8'); g.addColorStop(1, '#c27a3a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 5, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(90,40,10,0.7)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) { const r = 5.5 - a * 0.42; ctx.lineTo(x + Math.cos(a) * r, y - 5 + Math.sin(a) * r); } ctx.stroke();
      break;
    }
    case 'banner':
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16); ctx.stroke();
      ctx.fillStyle = pc.ui; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x + 9, y - 13 + Math.sin(t * 3)); ctx.lineTo(x, y - 9); ctx.fill();
      break;
    case 'crystal': {
      for (const [dx, h, a] of [[-3, 10, -0.25], [0, 14, 0], [3, 9, 0.3]] as number[][]) {
        ctx.save(); ctx.translate(x + dx, y); ctx.rotate(a);
        const g = ctx.createLinearGradient(-2, 0, 2, 0);
        g.addColorStop(0, '#f2e8ff'); g.addColorStop(1, '#9a7ad8');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-2, -h * 0.75); ctx.lineTo(0, -h); ctx.lineTo(2, -h * 0.75); ctx.lineTo(2, 0); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'lantern': {
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 14); ctx.stroke();
      const b = 0.7 + 0.3 * Math.sin(t * 4 + x);
      const g = ctx.createRadialGradient(x, y - 16, 0, x, y - 16, 4);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, `rgba(255,240,120,${b})`); g.addColorStop(1, 'rgba(255,200,60,0.2)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 16, 3, 4, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#a8a294'; ctx.beginPath(); ctx.ellipse(x, y - 2, 8, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6fc8ff'; ctx.beginPath(); ctx.ellipse(x, y - 3, 6.5, 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(180,230,255,0.85)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1; ctx.beginPath(); ctx.arc(x + (i - 1) * 2, y - 4 - Math.sin(k * Math.PI) * 9, 0.9, 0, TAU); ctx.stroke(); }
      break;
    }
    case 'amberdrop': {
      const g = ctx.createRadialGradient(x - 1.5, y - 8, 0.5, x, y - 6, 7);
      g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ffab2a'); g.addColorStop(1, '#8a3a04');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.quadraticCurveTo(x + 7, y - 4, x, y); ctx.quadraticCurveTo(x - 7, y - 4, x, y - 15); ctx.fill();
      ctx.fillStyle = 'rgba(60,20,0,0.6)'; ctx.beginPath(); ctx.ellipse(x, y - 5, 1.5, 0.8, 0.4, 0, TAU); ctx.fill();
      break;
    }
    case 'throne': {
      ctx.fillStyle = '#c99a3a'; ctx.beginPath(); ctx.ellipse(x, y - 9, 6, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a5226'; ctx.fillRect(x - 7, y - 5, 14, 5);
      ctx.fillStyle = pc.ui; ctx.fillRect(x - 5, y - 7, 10, 2.5);
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y - 16, 1.8, 0, TAU); ctx.fill();
      break;
    }
    case 'statue': {
      ctx.fillStyle = '#9a8e7a'; ctx.fillRect(x - 6, y - 4, 12, 4);
      const g = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
      g.addColorStop(0, '#ffe6a0'); g.addColorStop(1, '#b07a2a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x - 2, y - 9, 3.5, 5, 0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 1.5, y - 15, 2, 2.5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 3, y - 19, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(x + 1.5, y - 21); ctx.lineTo(x + 2.2, y - 23.5); ctx.lineTo(x + 3, y - 21.5); ctx.lineTo(x + 3.8, y - 23.5); ctx.lineTo(x + 4.5, y - 21); ctx.fill();
      break;
    }
  }
}

function drawNestPlacement(ctx: CanvasRenderingContext2D, t: number) {
  const S = G.S;
  const pl = UI.placing;
  const mx = UI.mouse.wx, my = UI.mouse.wy;
  const tx = Math.floor(mx / NTS), ty = Math.floor(my / NTS);
  setWorldTransform(ctx);
  if (pl && pl.kind === 'chamber') {
    const d = CHAMBERS[pl.type];
    const ok = canPlaceChamber(pl.type, tx, ty);
    const cx = (tx + 0.5) * NTS, cy = (ty + 0.5) * NTS;
    ctx.fillStyle = ok.ok ? rgba(d.color, 0.22) : 'rgba(255,80,70,0.25)';
    ctx.strokeStyle = ok.ok ? d.color : '#ff5b4f'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, (d.rx + 0.35) * NTS, (d.ry + 0.35) * NTS, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '800 11px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.fillStyle = ok.ok ? '#fff' : '#ffb0a8';
    const label = ok.ok ? `${d.icon} ${d.name}` : ok.reason;
    ctx.strokeText(label, cx, cy - (d.ry + 1) * NTS); ctx.fillText(label, cx, cy - (d.ry + 1) * NTS);
  } else if (pl && pl.kind === 'decor') {
    const c = S.nest.chambers.find(ch => ch.state === 1 && inEllipse(ch, tx, ty));
    if (c) {
      const fx = mx / NTS - 0.5;
      const fy = floorY(c, fx) + 0.5;
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5);
      drawDecor(ctx, pl.type, mx, fy * NTS, t, S.colonies[0].color);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = '#ff5b4f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, 8, 0, TAU); ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5); ctx.stroke();
    }
  } else if (UI.nestTool !== 'none') {
    const b = UI.brush;
    ctx.strokeStyle = UI.nestTool === 'dig' ? 'rgba(255,190,90,0.9)' : 'rgba(255,110,90,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((tx - b + 1) * NTS, (ty - b + 1) * NTS, (b * 2 - 1) * NTS, (b * 2 - 1) * NTS);
  }
}
