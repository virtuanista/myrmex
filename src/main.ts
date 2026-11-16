// Punto de entrada de MYRMEX.
import './style.css';
import { G, GameConfig, DT } from './game/state';
import { createGame } from './game/newgame';
import { advance, stepSim, updateFog, updateTerritory } from './game/sim';
import { loadGame, saveGame } from './game/save';
import { rebuildCache } from './game/colony';
import { rebuildSpatial } from './game/spatial';
import { rebuildNodeGrid, rebuildNodeIndex, rebuildKnown } from './game/ants';
import { updateNestFields } from './game/nest';
import { initWeatherClock, isNight } from './game/time';
import { drawSurface, resetSurfaceRender, RENDER_OPTS } from './render/surface';
import { drawNest, resetNestRender } from './render/nestview';
import { resetTerrain } from './render/terrain';
import { VT } from './render/sprites';
import { clearFx, updateParticles, updateTexts } from './render/particles';
import { APP, clampCam, updateCamTween } from './ui/camera';
import { UI } from './ui/uistate';
import { initInput, updateInput } from './ui/input';
import { FX, initFeedback, updateTension } from './ui/feedback';
import { buildHUD, hideHUD, refreshHUD } from './ui/hud';
import { Nav, showIntro, showTitle } from './ui/menus';
import { toast } from './ui/dom';
import { Settings, initAudio, setUnderground, startMusic, updateAmbience } from './audio/audio';
import { clearNavCaches } from './game/nav';
import { initTips, updateTips } from './ui/tips';
import { NET, closeNet, guestAlpha, hostTick, initNetForwarding, setNetHandlers, netHeartbeat } from './net/net';
import { initNetCommands } from './net/commands';
import { initNetUI } from './ui/netui';
import { updateFog as fogOnly } from './game/sim';
import * as ACT from './game/actions';
import * as SAVE from './game/save';
import * as COL from './game/colony';
import * as AU from './audio/audio';

let ctx: CanvasRenderingContext2D;
let last = performance.now();
let autosaveT = 0;
let fpsAcc = 0, fpsN = 0, fpsEl: HTMLElement | null = null;
let demoT = 0;
let guestFrame = 0;

function resize() {
  const q = Settings.quality;
  const dpr = q === 0 ? 1 : Math.min(window.devicePixelRatio || 1, q === 1 ? 1.5 : 2);
  APP.dpr = dpr; VT.dpr = dpr;
  APP.w = innerWidth; APP.h = innerHeight;
  APP.canvas.width = Math.floor(innerWidth * dpr);
  APP.canvas.height = Math.floor(innerHeight * dpr);
}

function prepareWorld() {
  resetTerrain(); resetSurfaceRender(); resetNestRender(); clearFx(); clearNavCaches();
  rebuildCache(); rebuildSpatial(); rebuildNodeIndex(); rebuildNodeGrid(); rebuildKnown();
  updateNestFields(true);
  updateTerritory(true);
  updateFog();
  initWeatherClock();
  UI.sel.clear(); UI.selStruct = 0; UI.selCre = 0; UI.selNode = 0; UI.selChamber = 0; UI.placing = null; UI.nestTool = 'none'; UI.panelTab = '';
}

function makeDemo() {
  FX.on = false;
  RENDER_OPTS.noFog = true;
  const cfg: GameConfig = {
    playerName: 'Demo', colonyName: 'Demo', queenName: 'Reina', color: Math.floor(Math.random() * 8), emblem: 0,
    biome: (['meadow', 'forest', 'garden'] as const)[Math.floor(Math.random() * 3)], size: 'small', rivals: 1, difficulty: 1,
    seed: Math.floor(Math.random() * 99999), mode: 'sandbox', startRes: 2, creatures: 1,
  };
  createGame(cfg);
  prepareWorld();
  const S = G.S;
  S.colonies[0].alloc = { forage: 0.85, dig: 0.1, inside: 0.05 };
  // simular unos segundos para que existan rastros
  for (let i = 0; i < 900; i++) stepSim();
  S.fog.fill(1);
  S.cam.sz = 1.7;
  S.view = 'surface';
  demoT = 0;
}

function showLoading(on: boolean, text = 'Excavando el mundo…') {
  const el = document.getElementById('loading')!;
  el.classList.toggle('hidden', !on);
  (el.querySelector('.ld-text') as HTMLElement).textContent = text;
}

function enterGame() {
  APP.mode = 'game';
  RENDER_OPTS.noFog = false;
  FX.on = true;
  document.getElementById('screens')!.innerHTML = '';
  buildHUD();
  setUnderground(G.S.view === 'nest');
  initAudio();
  startMusic();
  autosaveT = 0;
}

Nav.start = (cfg: GameConfig) => {
  showLoading(true, 'Excavando el mundo…');
  setTimeout(() => {
    try {
      createGame(cfg);
      prepareWorld();
      G.S.slot = 'auto';
      G.S.paused = true;
      enterGame();
      showLoading(false);
      showIntro(() => { G.S.paused = false; refreshHUD(true); saveGame(); });
    } catch (e) {
      console.error(e);
      showLoading(false);
      toast('⚠️', 'Error al crear el mundo', String(e), 'bad');
    }
  }, 60);
};
Nav.load = (slot: string) => {
  showLoading(true, 'Despertando a la colonia…');
  hideHUD();
  setTimeout(async () => {
    try {
      const S = await loadGame(slot);
      if (!S) throw new Error('Partida no encontrada');
      prepareWorld();
      enterGame();
      showLoading(false);
      toast('🐜', 'Bienvenida de vuelta', `${S.cfg.colonyName} te esperaba.`, 'good');
    } catch (e) {
      console.error(e);
      showLoading(false);
      toast('⚠️', 'No se pudo cargar', String(e), 'bad');
      Nav.menu();
    }
  }, 60);
};
Nav.join = () => {
  (globalThis as any).__netGuest = true;
  prepareWorld();
  G.S.view = 'surface';
  const home = G.S.structures.find(s => s.id === G.S.colonies[0].nestId);
  if (home) { G.S.cam.sx = home.x; G.S.cam.sy = home.y; }
  enterGame();
  toast('🌐', 'Te has unido a ' + G.S.cfg.colonyName, 'Colonia de ' + G.S.cfg.playerName + '. Enter: chat · Alt+clic: señal.', 'good');
};
Nav.menu = () => {
  closeNet(); (globalThis as any).__netGuest = false;
  hideHUD();
  APP.mode = 'menu';
  makeDemo();
  showTitle();
};

function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const S = G.S;
  if (S) {
    let alpha = 1;
    if (APP.mode === 'game') {
      if (NET.role === 'guest') {
        alpha = guestAlpha(dt);
        rebuildCache(); rebuildSpatial(); rebuildNodeIndex();
        guestFrame++;
        if (guestFrame % 5 === 0) fogOnly(false);
        if (guestFrame % 30 === 0) updateTerritory();
      } else { alpha = advance(dt); hostTick(dt); }
      updateInput(dt);
      updateCamTween(dt);
      updateTension(dt);
      netHeartbeat(dt);
      updateTips(dt);
      updateAmbience(dt, isNight(), S.weather.kind, S.view === 'nest');
      autosaveT += dt;
      if (autosaveT > 60 && !S.paused && NET.role !== 'guest') { autosaveT = 0; saveGame(); }
      refreshHUD();
    } else {
      // demo del menú
      S.paused = false; S.speed = 1;
      alpha = advance(dt);
      demoT += dt;
      const home = S.structures[0];
      S.cam.sx = home.x + Math.sin(demoT * 0.05) * 40;
      S.cam.sy = home.y + 60 + Math.cos(demoT * 0.04) * 25;
      S.cam.sz = 1.45 + Math.sin(demoT * 0.03) * 0.08;
      clampCam();
      // que la vista nunca muestre zona fuera del mundo
      const hw = APP.w / 2 / S.cam.sz, hh = APP.h / 2 / S.cam.sz;
      const mw = S.W * 16, mh = S.H * 16;
      S.cam.sx = mw > hw * 2 ? Math.min(Math.max(S.cam.sx, hw), mw - hw) : mw / 2;
      S.cam.sy = mh > hh * 2 ? Math.min(Math.max(S.cam.sy, hh), mh - hh) : mh / 2;
    }
    updateParticles(dt * (S.paused ? 0.2 : 1));
    updateTexts(dt);
    UI.shake = Math.max(0, UI.shake - dt * 30);
    UI.flash = Math.max(0, UI.flash - dt * 1.5);
    if (S.view === 'surface' || APP.mode === 'menu') drawSurface(ctx, APP.canvas.width, APP.canvas.height, alpha, dt);
    else drawNest(ctx, APP.canvas.width, APP.canvas.height, alpha, dt);
  }
  // FPS
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    UI.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
    if (Settings.showFps) {
      if (!fpsEl) { fpsEl = document.createElement('div'); fpsEl.style.cssText = 'position:fixed;left:8px;bottom:180px;font:800 12px Nunito;color:#9f9;z-index:99;pointer-events:none;text-shadow:0 1px 2px #000'; document.body.append(fpsEl); }
      fpsEl.textContent = UI.fps + ' fps · ' + (G.S?.ants.length ?? 0) + ' hormigas';
    } else if (fpsEl) { fpsEl.remove(); fpsEl = null; }
  }
  requestAnimationFrame(frame);
}

function boot() {
  APP.canvas = document.getElementById('game') as HTMLCanvasElement;
  ctx = APP.canvas.getContext('2d', { alpha: false })!;
  resize();
  window.addEventListener('resize', resize);
  initFeedback();
  initTips();
  initNetForwarding();
  initNetCommands();
  initNetUI();
  setNetHandlers({ onHostLost: () => { if (APP.mode === 'game' && NET.role === 'guest') Nav.menu(); } });
  initInput();
  window.addEventListener('pointerdown', () => initAudio(), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && APP.mode === 'game') saveGame(); });
  window.addEventListener('beforeunload', () => { if (APP.mode === 'game') saveGame(); });
  makeDemo();
  APP.mode = 'menu';
  showTitle();
  requestAnimationFrame(frame);
  void DT;
}
if (import.meta.env.DEV) { (window as any).__G = G; (window as any).__step = stepSim;  (window as any).__A = ACT; (window as any).__SV = SAVE; (window as any).__C = COL; (window as any).__N = Nav; (window as any).__AU = AU; (window as any).__NET = NET; }
boot();
