// Entrada de ratón, teclado y táctil.
import { BUILDINGS, CASTES, CREATURES, NODE_INFO, RES_INFO } from '../game/defs';
import { G, NTS, TS } from '../game/state';
import { APP, cancelTween, clampCam, screenToWorld } from './camera';
import { UI, addMarker } from './uistate';
import { setSpeed } from '../game/actions';
import { NET, isGuest, sendCmd, sendPing } from '../net/net';
import { openChat } from './netui';
import { commandSelected, placeBuilding, placeDecor, setRally, stopSelected, returnSelected, tryPlaceChamber } from '../game/actions';
import { chamberAtTile, designateDig, floorY, inEllipse } from '../game/nest';
import { VIS } from '../game/sim';
import { WORLD } from '../game/world';
import { SFX, initAudio, Settings } from '../audio/audio';
import { buildMode, closeModal, modal, drawer, refreshHUD, selectArmy, setView, toggleBuild, toggleDrawer, toggleModal, quickSave } from './hud';
import { openHelp, openPauseMenu, closePause } from './menus';
import { showWorldTip } from './dom';
import { hostileCreature } from '../game/combat';
import { getNode } from '../game/ants';

const keys = new Set<string>();
let panDrag: { x: number; y: number; cx: number; cy: number; moved: boolean; btn: number } | null = null;
let painting = false;
let lastClick = 0;

export function initInput() {
  const cv = APP.canvas;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('mouseleave', () => { UI.mouse.inside = false; showWorldTip(0, 0, ''); });
  cv.addEventListener('mouseenter', () => { UI.mouse.inside = true; });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  initTouch(cv);
}

function inGame() { return APP.mode === 'game' && G.S && G.S.over !== 2; }

// ---------------- Picking ----------------
interface Pick { kind: 'ant' | 'cre' | 'struct' | 'node'; id: number; own?: boolean }
function pickSurface(wx: number, wy: number): Pick | null {
  const S = G.S;
  const W = WORLD.W;
  const tol = 9 / S.cam.sz + 3;
  let best = tol * tol, res: Pick | null = null;
  for (const a of S.ants) {
    if (a.layer !== 0) continue;
    if (a.col !== 0 && !VIS[Math.floor(a.y / TS) * W.w + Math.floor(a.x / TS)]) continue;
    const r = 5 * CASTES[a.caste].size;
    const d = (a.x - wx) ** 2 + (a.y - wy) ** 2 - r * r;
    if (d < best) { best = d; res = { kind: 'ant', id: a.id, own: a.col === 0 }; }
  }
  if (res) return res;
  for (const c of S.creatures) {
    if (!VIS[Math.floor(c.y / TS) * W.w + Math.floor(c.x / TS)]) continue;
    const r = CREATURES[c.type].size * 0.6 + tol;
    if ((c.x - wx) ** 2 + (c.y - wy) ** 2 < r * r) return { kind: 'cre', id: c.id };
  }
  for (const s of S.structures) {
    const r = BUILDINGS[s.type].radius + 4;
    if (s.col !== 0 && !S.fog[Math.floor(s.y / TS) * W.w + Math.floor(s.x / TS)]) continue;
    if ((s.x - wx) ** 2 + (s.y - wy) ** 2 < r * r) return { kind: 'struct', id: s.id, own: s.col === 0 };
  }
  for (const n of S.nodes) {
    if (!S.fog[Math.floor(n.y / TS) * W.w + Math.floor(n.x / TS)]) continue;
    const r = n.r + 5;
    if ((n.x - wx) ** 2 + (n.y - wy) ** 2 < r * r) return { kind: 'node', id: n.id };
  }
  return null;
}

function clearSel() { UI.sel.clear(); UI.selStruct = 0; UI.selCre = 0; UI.selNode = 0; UI.selChamber = 0; }

// ---------------- Ratón ----------------
function onDown(e: MouseEvent) {
  initAudio();
  if (!inGame() || UI.modalOpen) return;
  const S = G.S;
  const w = screenToWorld(e.clientX, e.clientY);
  UI.mouse.wx = w.x; UI.mouse.wy = w.y;
  if (e.button === 1 || (e.button === 2 && S.view === 'nest')) {
    panDrag = { x: e.clientX, y: e.clientY, cx: S.view === 'surface' ? S.cam.sx : S.cam.nx, cy: S.view === 'surface' ? S.cam.sy : S.cam.ny, moved: false, btn: e.button };
    cancelTween();
    e.preventDefault();
    return;
  }
  if (e.button === 2) {
    // superficie: órdenes
    if (UI.placing) { UI.placing = null; refreshHUD(true); return; }
    if (!UI.sel.size) { panDrag = { x: e.clientX, y: e.clientY, cx: S.cam.sx, cy: S.cam.sy, moved: false, btn: 2 }; return; }
    const p = pickSurface(w.x, w.y);
    let target: { tk: number; id: number } | null = null, nodeId = 0, structId = 0;
    if (p?.kind === 'ant' && !p.own) target = { tk: 0, id: p.id };
    else if (p?.kind === 'cre') { const c = S.creatures.find(x => x.id === p.id); if (c && c.type !== 'aphid') target = { tk: 1, id: p.id }; }
    else if (p?.kind === 'struct') { structId = p.id; if (!p.own) target = { tk: 2, id: p.id }; }
    else if (p?.kind === 'node') nodeId = p.id;
    const kind = commandSelected(UI.sel, w.x, w.y, target, nodeId, structId, true, e.shiftKey);
    addMarker(w.x, w.y, kind === 'attack' ? 'attack' : kind === 'gather' ? 'gather' : kind === 'build' || kind === 'found' ? 'build' : 'move');
    if (kind === 'attack') SFX.bite(); SFX.click();
    return;
  }
  if (e.button !== 0) return;
  if (e.altKey) { addMarker(w.x, w.y, 'ping'); sendPing(w.x, w.y, S.view); SFX.event(); return; }
  if (S.view === 'surface') {
    if (UI.placing) {
      if (UI.placing.kind === 'building') {
        const s = placeBuilding(UI.placing.type, w.x, w.y);
        if (s && !e.shiftKey) UI.placing = null;
      } else if (UI.placing.kind === 'rally') { setRally(w.x, w.y); addMarker(w.x, w.y, 'rally'); UI.placing = null; }
      refreshHUD(true);
      return;
    }
    UI.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
  } else {
    const tx = Math.floor(w.x / NTS), ty = Math.floor(w.y / NTS);
    if (UI.placing?.kind === 'chamber') {
      const c = tryPlaceChamber(UI.placing.type, tx, ty);
      if (c && !e.shiftKey) { UI.placing = null; UI.panelTab = ''; }
      refreshHUD(true);
      return;
    }
    if (UI.placing?.kind === 'decor') {
      const c = S.nest.chambers.find(ch => ch.state === 1 && inEllipse(ch, tx, ty));
      if (c) { const fx = w.x / NTS; placeDecor(c, UI.placing.type, fx, floorY(c, fx - 0.5) + 0.5); if (!e.shiftKey) UI.placing = null; refreshHUD(true); }
      else SFX.error();
      return;
    }
    if (UI.nestTool !== 'none') { lastPaint = null; painting = true; paint(w.x, w.y); return; }
    // seleccionar cámara
    const c = chamberAtTile(S.nest, tx, ty);
    UI.selChamber = c ? c.id : 0;
    if (c) SFX.click();
    refreshHUD(true);
  }
}

let lastPaint: { x: number; y: number } | null = null;
let digBuf: number[] = [];
function paint(wx: number, wy: number) {
  const tx = Math.floor(wx / NTS), ty = Math.floor(wy / NTS);
  const b = UI.brush - 1;
  let changed = false;
  const from = lastPaint && painting ? lastPaint : { x: tx, y: ty };
  const steps = Math.max(1, Math.abs(tx - from.x), Math.abs(ty - from.y));
  for (let s = 0; s <= steps; s++) {
    const cx = Math.round(from.x + (tx - from.x) * (s / steps)), cy = Math.round(from.y + (ty - from.y) * (s / steps));
    for (let dy = -b; dy <= b; dy++) for (let dx = -b; dx <= b; dx++) if (designateDig(cx + dx, cy + dy, UI.nestTool === 'dig')) { changed = true; if (isGuest()) digBuf.push(cx + dx, cy + dy, UI.nestTool === 'dig' ? 1 : 0); }
  }
  lastPaint = { x: tx, y: ty };
  if (digBuf.length) { sendCmd('dig', digBuf); digBuf = []; }
  if (changed) SFX.pick();
}

let lastHover = 0;
function onMove(e: MouseEvent) {
  UI.mouse.x = e.clientX; UI.mouse.y = e.clientY;
  if (!inGame()) return;
  const S = G.S;
  const w = screenToWorld(e.clientX, e.clientY);
  UI.mouse.wx = w.x; UI.mouse.wy = w.y;
  if (panDrag) {
    const dx = e.clientX - panDrag.x, dy = e.clientY - panDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) panDrag.moved = true;
    if (panDrag.moved) {
      const z = S.view === 'surface' ? S.cam.sz : S.cam.nz;
      if (S.view === 'surface') { S.cam.sx = panDrag.cx - dx / z; S.cam.sy = panDrag.cy - dy / z; }
      else { S.cam.nx = panDrag.cx - dx / z; S.cam.ny = panDrag.cy - dy / z; }
      clampCam();
    }
    return;
  }
  if (painting) { paint(w.x, w.y); return; }
  if (UI.drag) {
    UI.drag.x1 = e.clientX; UI.drag.y1 = e.clientY;
    if (Math.abs(UI.drag.x1 - UI.drag.x0) + Math.abs(UI.drag.y1 - UI.drag.y0) > 6) UI.drag.active = true;
  }
  // cursor y tooltip
  const now = performance.now();
  if (now - lastHover > 80 && e.target === APP.canvas) {
    lastHover = now;
    let cursor = 'default', tip = '';
    if (S.view === 'surface') {
      if (UI.placing) cursor = 'crosshair';
      else {
        const p = pickSurface(w.x, w.y);
        if (p) {
          cursor = UI.sel.size && p.kind !== 'ant' ? 'crosshair' : 'pointer';
          tip = hoverTip(p);
        }
      }
    } else {
      cursor = UI.nestTool !== 'none' ? 'cell' : UI.placing ? 'crosshair' : 'default';
      const c = chamberAtTile(S.nest, Math.floor(w.x / NTS), Math.floor(w.y / NTS));
      if (c && !UI.placing && UI.nestTool === 'none') cursor = 'pointer';
    }
    APP.canvas.style.cursor = cursor;
    showWorldTip(e.clientX, e.clientY, tip);
  }
}
function hoverTip(p: Pick): string {
  const S = G.S;
  if (p.kind === 'node') {
    const n = getNode(p.id);
    if (!n) return '';
    const info = NODE_INFO[n.kind];
    return `<b>${info.icon} ${n.name || info.name}</b><br>${Math.floor(n.amt)} ${RES_INFO[info.res].icon} ${RES_INFO[info.res].name}${UI.sel.size ? '<br><i>Clic derecho: recolectar</i>' : ''}`;
  }
  if (p.kind === 'cre') {
    const c = S.creatures.find(x => x.id === p.id);
    if (!c) return '';
    const d = CREATURES[c.type];
    return `<b>${c.name || d.name}</b> ${hostileCreature(c) ? '☠️' : ''}<br>Vida ${Math.ceil(c.hp)}/${Math.round(c.mhp)}<br><span style="color:#bfae98">${d.desc}</span>`;
  }
  if (p.kind === 'struct') {
    const s = S.structures.find(x => x.id === p.id);
    if (!s) return '';
    const d = BUILDINGS[s.type];
    return `<b>${d.icon} ${s.type === 'rivalnest' ? S.colonies[s.col].name : d.name}</b><br>Vida ${Math.ceil(s.hp)}/${s.mhp}`;
  }
  if (p.kind === 'ant' && !p.own) {
    const a = S.ants.find(x => x.id === p.id);
    if (!a) return '';
    return `<b>${CASTES[a.caste].name}</b> de ${S.colonies[a.col].name}<br>Vida ${Math.ceil(a.hp)}/${a.mhp}`;
  }
  return '';
}

function onUp(e: MouseEvent) {
  if (!inGame()) { panDrag = null; UI.drag = null; painting = false; return; }
  const S = G.S;
  if (panDrag) {
    const pd = panDrag; panDrag = null;
    if (!pd.moved && pd.btn === 2 && S.view === 'nest') {
      if (UI.placing || UI.nestTool !== 'none' || UI.panelTab) { UI.placing = null; UI.nestTool = 'none'; UI.panelTab = ''; refreshHUD(true); }
      else { UI.selChamber = 0; refreshHUD(true); }
    }
    return;
  }
  if (painting) { painting = false; return; }
  if (!UI.drag || e.button !== 0) return;
  const d = UI.drag;
  UI.drag = null;
  if (S.view !== 'surface') return;
  if (d.active) {
    // selección por caja
    const a0 = screenToWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), a1 = screenToWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
    if (!e.shiftKey) clearSel();
    const inBox = S.ants.filter(a => a.col === 0 && a.layer === 0 && a.x >= a0.x && a.x <= a1.x && a.y >= a0.y && a.y <= a1.y);
    const mil = inBox.filter(a => CASTES[a.caste].military || a.caste === 'princess');
    for (const a of (mil.length && !e.altKey ? mil : inBox)) UI.sel.add(a.id);
    if (UI.sel.size) SFX.click();
    refreshHUD(true);
    return;
  }
  // clic simple
  const w = screenToWorld(e.clientX, e.clientY);
  const p = pickSurface(w.x, w.y);
  const now = performance.now();
  const dbl = now - lastClick < 320;
  lastClick = now;
  if (!e.shiftKey) clearSel();
  if (p) {
    if (p.kind === 'ant' && p.own) {
      const a = S.ants.find(x => x.id === p.id)!;
      if (dbl) {
        const vw = APP.w / S.cam.sz / 2, vh = APP.h / S.cam.sz / 2;
        for (const o of S.ants) if (o.col === 0 && o.layer === 0 && o.caste === a.caste && Math.abs(o.x - S.cam.sx) < vw && Math.abs(o.y - S.cam.sy) < vh) UI.sel.add(o.id);
      } else if (UI.sel.has(a.id) && e.shiftKey) UI.sel.delete(a.id); else UI.sel.add(a.id);
    } else if (p.kind === 'ant') { /* enemiga: info vía tooltip */ }
    else if (p.kind === 'cre') UI.selCre = p.id;
    else if (p.kind === 'struct') { UI.selStruct = p.id; const s = S.structures.find(x => x.id === p.id); if (dbl && s?.type === 'nest') setView('nest'); }
    else if (p.kind === 'node') UI.selNode = p.id;
    SFX.click();
  }
  refreshHUD(true);
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (!inGame() || UI.modalOpen) return;
  const S = G.S;
  if (S.view === 'nest' && e.shiftKey) { UI.brush = Math.max(1, Math.min(3, UI.brush + (e.deltaY > 0 ? -1 : 1))); refreshHUD(true); return; }
  const before = screenToWorld(e.clientX, e.clientY);
  const k = Math.exp(-e.deltaY * 0.0015);
  if (S.view === 'surface') S.cam.sz *= k; else S.cam.nz *= k;
  clampCam();
  const after = screenToWorld(e.clientX, e.clientY);
  if (S.view === 'surface') { S.cam.sx += before.x - after.x; S.cam.sy += before.y - after.y; }
  else { S.cam.nx += before.x - after.x; S.cam.ny += before.y - after.y; }
  cancelTween();
  clampCam();
}

// ---------------- Teclado ----------------
function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!inGame()) return;
  const S = G.S;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === 'F5') { e.preventDefault(); quickSave(); return; }
  if (e.key === 'Escape') {
    if (closePause()) return;
    if (UI.placing || UI.nestTool !== 'none') { UI.placing = null; UI.nestTool = 'none'; refreshHUD(true); return; }
    if (modal) { closeModal(); return; }
    if (document.querySelector('#hud .modal-bg:not(.hidden)')) { (document.querySelector('#hud .modal-bg:not(.hidden) .close-x') as HTMLElement)?.click(); return; }
    if (drawer) { toggleDrawer('colony'); return; }
    if (buildMode || UI.panelTab) { if (buildMode) toggleBuild(); UI.panelTab = ''; refreshHUD(true); return; }
    if (UI.sel.size || UI.selStruct || UI.selCre || UI.selNode || UI.selChamber) { clearSel(); refreshHUD(true); return; }
    openPauseMenu();
    return;
  }
  if (UI.modalOpen && k !== 'r' && k !== 'l' && k !== 'e') return;
  if (e.key === 'Enter' && NET.connected) { e.preventDefault(); openChat(); return; }
  if (e.key === 'Tab') { e.preventDefault(); SFX.whoosh(); setView(S.view === 'surface' ? 'nest' : 'surface'); return; }
  if (e.key === ' ') { e.preventDefault(); setSpeed(S.speed, !S.paused); SFX.click(); refreshHUD(true); return; }
  if (e.key === 'F1') { e.preventDefault(); openHelp(); return; }
  if (k === ',') { setSpeed(Math.max(1, S.speed - 1), S.paused); refreshHUD(true); return; }
  if (k === '.') { setSpeed(Math.min(3, S.speed + 1), S.paused); refreshHUD(true); return; }
  // grupos
  if (/^[1-9]$/.test(k)) {
    const gi = +k;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); S.groups[gi] = [...UI.sel]; SFX.click(); return; }
    const ids = S.groups[gi] || [];
    const alive = ids.filter(id => S.ants.some(a => a.id === id && a.layer === 0));
    if (alive.length) {
      if (S.view !== 'surface') setView('surface');
      clearSel(); for (const id of alive) UI.sel.add(id);
      const now = performance.now();
      if ((onKey as any)._last === gi && now - (onKey as any)._t < 400) {
        const a = S.ants.find(x => x.id === alive[0]);
        if (a) { S.cam.sx = a.x; S.cam.sy = a.y; }
      }
      (onKey as any)._last = gi; (onKey as any)._t = now;
      refreshHUD(true);
    }
    return;
  }
  switch (k) {
    case 'c': toggleDrawer('colony'); break;
    case 'r': toggleModal('research'); break;
    case 'l': toggleModal('ach'); break;
    case 'e': toggleModal('stats'); break;
    case 'b': toggleBuild(); break;
    case 'p': UI.showPher = !UI.showPher; refreshHUD(true); break;
    case 't': UI.showTerritory = !UI.showTerritory; refreshHUD(true); break;
    case 'q': if (S.view !== 'surface') setView('surface'); selectArmy(); break;
    case 'z': {
      if (S.view !== 'surface') break;
      clearSel();
      const vw = APP.w / S.cam.sz / 2, vh = APP.h / S.cam.sz / 2;
      for (const a of S.ants) if (a.col === 0 && a.layer === 0 && !CASTES[a.caste].military && Math.abs(a.x - S.cam.sx) < vw && Math.abs(a.y - S.cam.sy) < vh) UI.sel.add(a.id);
      refreshHUD(true); break;
    }
    case 'x':
      if (S.view === 'nest') { UI.nestTool = UI.nestTool === 'undig' ? 'none' : 'undig'; UI.placing = null; refreshHUD(true); }
      else { stopSelected(UI.sel); SFX.click(); }
      break;
    case 'h': if (S.view === 'surface') { returnSelected(UI.sel); SFX.click(); } break;
    case 'f': if (S.view === 'nest') { UI.nestTool = UI.nestTool === 'dig' ? 'none' : 'dig'; UI.placing = null; refreshHUD(true); } break;
    case 'v': if (S.view === 'nest') { UI.panelTab = UI.panelTab === 'decor' ? '' : 'decor'; UI.placing = null; refreshHUD(true); } break;
  }
}

export function updateInput(dt: number) {
  if (!inGame() || UI.modalOpen) return;
  const S = G.S;
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (Settings.edgePan && UI.mouse.inside && !panDrag && !UI.drag?.active) {
    const m = 14;
    if (UI.mouse.x < m) dx -= 1; else if (UI.mouse.x > APP.w - m) dx += 1;
    if (UI.mouse.y < m) dy -= 1; else if (UI.mouse.y > APP.h - m) dy += 1;
  }
  if (dx || dy) {
    cancelTween();
    const z = S.view === 'surface' ? S.cam.sz : S.cam.nz;
    const sp = 720 / z * dt * (keys.has('shift') ? 2 : 1);
    if (S.view === 'surface') { S.cam.sx += dx * sp; S.cam.sy += dy * sp; } else { S.cam.nx += dx * sp; S.cam.ny += dy * sp; }
    clampCam();
  }
}

// ---------------- Táctil ----------------
function initTouch(cv: HTMLCanvasElement) {
  let t0: { x: number; y: number; t: number } | null = null, pinch = 0, cam0 = { x: 0, y: 0 };
  cv.addEventListener('touchstart', e => {
    initAudio();
    if (!inGame()) return;
    const S = G.S;
    if (e.touches.length === 1) { t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }; cam0 = S.view === 'surface' ? { x: S.cam.sx, y: S.cam.sy } : { x: S.cam.nx, y: S.cam.ny }; }
    else if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); t0 = null; }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    if (!inGame()) return;
    const S = G.S;
    if (e.touches.length === 1 && t0) {
      const z = S.view === 'surface' ? S.cam.sz : S.cam.nz;
      const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
      if (S.view === 'surface') { S.cam.sx = cam0.x - dx / z; S.cam.sy = cam0.y - dy / z; } else { S.cam.nx = cam0.x - dx / z; S.cam.ny = cam0.y - dy / z; }
      clampCam();
    } else if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (S.view === 'surface') S.cam.sz *= d / pinch; else S.cam.nz *= d / pinch;
      pinch = d; clampCam();
    }
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    if (!inGame() || !t0) return;
    const ch = e.changedTouches[0];
    if (performance.now() - t0.t < 250 && Math.hypot(ch.clientX - t0.x, ch.clientY - t0.y) < 10) {
      const fake = { clientX: ch.clientX, clientY: ch.clientY, button: UI.sel.size && G.S.view === 'surface' ? 2 : 0, shiftKey: false, altKey: false, preventDefault() { /* */ }, target: cv } as unknown as MouseEvent;
      onDown(fake);
      if (fake.button === 0) onUp(fake);
    }
    t0 = null;
  });
}
