// Minimapa (superficie y hormiguero).
import { BUILDINGS, CHAMBERS, COLONY_COLORS, CREATURES } from '../game/defs';
import { G, NEST_SKY, NTS, TS } from '../game/state';
import { WORLD } from '../game/world';
import { VIS, TERR } from '../game/sim';
import { tinyMap } from '../render/terrain';
import { h } from './dom';
import { APP, cancelTween } from './camera';
import { UI } from './uistate';
import { CASTES } from '../game/defs';

let cv: HTMLCanvasElement, g: CanvasRenderingContext2D;
let fogC: HTMLCanvasElement | null = null, fogImg: ImageData | null = null;
let frame = 0;
const MW = 440, MH = 330;

export function initMinimap(host: HTMLElement) {
  cv = h('canvas', { width: String(MW), height: String(MH) }) as HTMLCanvasElement;
  g = cv.getContext('2d')!;
  host.append(cv);
  const tools = h('div', { class: 'mm-tools' });
  host.append(tools);
  let drag = false;
  const go = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const S = G.S;
    cancelTween();
    const { ox, oy, sc } = mapXf();
    const wx = (fx * MW - ox) / sc, wy = (fy * MH - oy) / sc;
    if (S.view === 'surface') { S.cam.sx = wx; S.cam.sy = wy; } else { S.cam.nx = wx; S.cam.ny = wy; }
  };
  cv.addEventListener('mousedown', e => { if (e.button === 0) { drag = true; go(e); } else if (e.button === 2) { rightCmd(e); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mousemove', e => { if (drag) go(e); });
  window.addEventListener('mouseup', () => { drag = false; });
}
function rightCmd(e: MouseEvent) {
  const S = G.S;
  if (S.view !== 'surface' || !UI.sel.size) return;
  const r = cv.getBoundingClientRect();
  const { ox, oy, sc } = mapXf();
  const wx = ((e.clientX - r.left) / r.width * MW - ox) / sc, wy = ((e.clientY - r.top) / r.height * MH - oy) / sc;
  import('../game/actions').then(m => m.commandSelected(UI.sel, wx, wy, null, 0, 0, true, e.shiftKey));
}

function mapXf() {
  const S = G.S;
  if (S.view === 'surface') {
    const W = WORLD.W;
    const sc = Math.min(MW / (W.w * TS), MH / (W.h * TS));
    return { sc, ox: (MW - W.w * TS * sc) / 2, oy: (MH - W.h * TS * sc) / 2 };
  }
  const n = S.nest;
  const sc = Math.min(MW / (n.W * NTS), MH / (n.H * NTS));
  return { sc, ox: (MW - n.W * NTS * sc) / 2, oy: (MH - n.H * NTS * sc) / 2 };
}

export function drawMinimap() {
  if (!g) return;
  const S = G.S;
  frame++;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0a0806'; g.fillRect(0, 0, MW, MH);
  const { sc, ox, oy } = mapXf();
  if (S.view === 'surface') {
    const W = WORLD.W;
    g.imageSmoothingEnabled = true;
    g.drawImage(tinyMap(), ox, oy, W.w * TS * sc, W.h * TS * sc);
    // territorio
    g.globalAlpha = 0.28;
    const tw = TS * sc;
    for (let y = 0; y < W.h; y += 2) for (let x = 0; x < W.w; x += 2) {
      const o = TERR[y * W.w + x];
      if (o < 0 || !S.fog[y * W.w + x]) continue;
      g.fillStyle = COLONY_COLORS[S.colonies[o]?.color ?? 0].ui;
      g.fillRect(ox + x * tw, oy + y * tw, tw * 2, tw * 2);
    }
    g.globalAlpha = 1;
    // niebla
    if (!fogC || fogC.width !== W.w) { fogC = document.createElement('canvas'); fogC.width = W.w; fogC.height = W.h; fogImg = fogC.getContext('2d')!.createImageData(W.w, W.h); }
    if (frame % 4 === 1) {
      const d = fogImg!.data;
      for (let i = 0; i < W.w * W.h; i++) { const j = i * 4; d[j] = 8; d[j + 1] = 8; d[j + 2] = 12; d[j + 3] = S.fog[i] ? (VIS[i] ? 0 : 90) : 245; }
      fogC.getContext('2d')!.putImageData(fogImg!, 0, 0);
    }
    g.drawImage(fogC, ox, oy, W.w * TS * sc, W.h * TS * sc);
    // nodos legendarios
    for (const n of S.nodes) if (n.poi && n.found) { g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(ox + n.x * sc, oy + n.y * sc, 3.5, 0, 6.3); g.fill(); }
    // estructuras
    for (const s of S.structures) {
      const ti = Math.floor(s.y / TS) * W.w + Math.floor(s.x / TS);
      if (s.col !== 0 && !S.fog[ti]) continue;
      const c = COLONY_COLORS[S.colonies[s.col]?.color ?? 0];
      const r = s.type === 'nest' || s.type === 'rivalnest' ? 7 : 4.5;
      g.fillStyle = '#000'; g.fillRect(ox + s.x * sc - r - 1, oy + s.y * sc - r - 1, r * 2 + 2, r * 2 + 2);
      g.fillStyle = c.ui; g.fillRect(ox + s.x * sc - r, oy + s.y * sc - r, r * 2, r * 2);
      void BUILDINGS;
    }
    // hormigas
    let k = 0;
    for (const a of S.ants) {
      if (a.layer !== 0) continue;
      const ti = Math.floor(a.y / TS) * W.w + Math.floor(a.x / TS);
      if (a.col !== 0 && !VIS[ti]) continue;
      if (a.col === 0 && !CASTES[a.caste].military && (k++ & 1)) continue;
      g.fillStyle = a.col === 0 ? (CASTES[a.caste].military ? '#b8ffc0' : '#7dff8f') : COLONY_COLORS[S.colonies[a.col].color].ui;
      const s = CASTES[a.caste].military ? 2.6 : 1.8;
      g.fillRect(ox + a.x * sc - s / 2, oy + a.y * sc - s / 2, s, s);
    }
    for (const c of S.creatures) {
      const ti = Math.floor(c.y / TS) * W.w + Math.floor(c.x / TS);
      if (!VIS[ti]) continue;
      const d = CREATURES[c.type];
      g.fillStyle = d.behavior === 'hunter' ? '#ff4a3a' : d.behavior === 'neutral' ? '#ffb347' : '#e8e0c8';
      const s = c.boss || c.type === 'mantis' ? 6 : d.size > 15 ? 3.5 : 2;
      g.beginPath(); g.arc(ox + c.x * sc, oy + c.y * sc, s / 2 + 0.5, 0, 6.3); g.fill();
    }
    // eventos
    for (const e of S.events) if (e.id === 'bird' && e.data) { g.fillStyle = 'rgba(255,60,40,0.8)'; g.beginPath(); g.arc(ox + e.data.bx * sc, oy + e.data.by * sc, 5, 0, 6.3); g.fill(); }
    // cámara
    const vw = APP.w / S.cam.sz, vh = APP.h / S.cam.sz;
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 2;
    g.strokeRect(ox + (S.cam.sx - vw / 2) * sc, oy + (S.cam.sy - vh / 2) * sc, vw * sc, vh * sc);
  } else {
    const n = S.nest;
    const tw = NTS * sc;
    g.fillStyle = '#3a2414'; g.fillRect(ox, oy + NEST_SKY * tw, n.W * tw, (n.H - NEST_SKY) * tw);
    g.fillStyle = '#6fa8d8'; g.fillRect(ox, oy, n.W * tw, NEST_SKY * tw);
    for (let y = 0; y < n.H; y++) for (let x = 0; x < n.W; x++) {
      const v = n.grid[y * n.W + x];
      if (v === 1) { g.fillStyle = '#c8a070'; g.fillRect(ox + x * tw, oy + y * tw, tw + 0.5, tw + 0.5); }
      else if (v === 2) { g.fillStyle = '#5a5654'; g.fillRect(ox + x * tw, oy + y * tw, tw + 0.5, tw + 0.5); }
      else if (n.dig[y * n.W + x]) { g.fillStyle = 'rgba(255,170,60,0.6)'; g.fillRect(ox + x * tw, oy + y * tw, tw + 0.5, tw + 0.5); }
    }
    for (const c of n.chambers) {
      g.strokeStyle = CHAMBERS[c.type].color; g.lineWidth = 2;
      g.beginPath(); g.ellipse(ox + (c.cx + 0.5) * tw, oy + (c.cy + 0.5) * tw, (c.rx + 0.5) * tw, (c.ry + 0.5) * tw, 0, 0, 6.3); g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (const a of S.ants) if (a.layer === 1) g.fillRect(ox + a.x * sc - 1, oy + a.y * sc - 1, 2, 2);
    const vw = APP.w / S.cam.nz, vh = APP.h / S.cam.nz;
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 2;
    g.strokeRect(ox + (S.cam.nx - vw / 2) * sc, oy + (S.cam.ny - vh / 2) * sc, vw * sc, vh * sc);
  }
}
