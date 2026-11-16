// HUD de partida.
import { BUILDINGS, BUILD_MENU, CASTES, CHAMBERS, CHAMBER_ORDER, COLONY_COLORS, CREATURES, CasteId, DECORS, EMBLEMS, NODE_INFO, RES_INFO, ResKey, TECHS, TRAINABLE, Branch, BuildingType, ChamberType } from '../game/defs';
import { AS, G } from '../game/state';
import { CC, broodCount, canAfford, pstats, player, stageOf, xpFor, chamberUpgradeCost } from '../game/colony';
import { setSpeed, setAutoWorkers, setPrio, sendGatherers, resetRally } from '../game/actions';
import { buildingUnlocked, cancelResearch, cancelStructure, canUpgrade, casteUnlocked, chamberUnlocked, decorUnlocked, demolishChamber, dequeue, queueCaste, removeDecor, returnSelected, setAlloc, startResearch, stopSelected, techAvailable, upgradeChamber } from '../game/actions';
import { QUESTS, QUEST_BY_ID, ACHIEVEMENTS } from '../game/quests';
import { chamberById, chamberProgress, digFrontier } from '../game/nest';
import { dayNumber, dayPhase, isNight, WEATHER_ICON, WEATHER_NAME } from '../game/time';
import { getNode } from '../game/ants';
import { territoryShare } from '../game/sim';
import { $, bindTip, costEl, costHTML, h, hideTip, setBanner, setToastBox, toast } from './dom';
import { UI } from './uistate';
import { jumpTo } from './camera';
import { SFX, setUnderground } from '../audio/audio';
import { fmt, fmtTime } from '../core/util';
import { drawMinimap, initMinimap } from './minimap';
import { openPauseMenu, openHelp } from './menus';
import { saveGame } from '../game/save';
import { antSprite } from '../render/sprites';
import { netIndicator } from './netui';

let root: HTMLElement;
const E: Record<string, HTMLElement> = {};
let live: (() => void)[] = [];
let liveDrawer: (() => void)[] = [];
let liveModal: (() => void)[] = [];
let ctxKey = '', drawerKey = '', questKey = '';
export let drawer: '' | 'colony' = '';
export let modal: '' | 'research' | 'ach' | 'stats' = '';
export let buildMode = false;
const rateHist: { t: number; g: Record<string, number> }[] = [];

export function buildHUD() {
  root = $('#hud');
  root.innerHTML = '';
  root.classList.remove('hidden');
  ctxKey = drawerKey = questKey = '';
  drawer = ''; modal = ''; buildMode = false;
  // barra superior
  const top = h('div', { class: 'topbar' });
  E.badge = h('div', { class: 'badge card' });
  E.res = h('div', { class: 'resbar card' });
  E.clock = h('div', { class: 'clock card' });
  const menuBtn = h('div', { class: 'iconbtn card', onclick: () => { SFX.open(); openPauseMenu(); }, tip: 'Menú <span class="kbd">Esc</span>' }, '⚙️');
  top.append(E.badge, E.res, E.clock, menuBtn);
  root.append(top);
  buildBadge(); buildRes(); buildClock();
  // objetivos
  E.quests = h('div', { class: 'quests card' });
  root.append(E.quests);
  // botones laterales
  E.side = h('div', { class: 'side' });
  root.append(E.side);
  buildSide();
  // toasts y banner
  const tb = h('div', { class: 'toasts' }); root.append(tb); setToastBox(tb);
  root.append(netIndicator());
  const bn = h('div', { class: 'banner' }); root.append(bn); setBanner(bn);
  // inferior
  const bottom = h('div', { class: 'bottom' });
  E.views = h('div', { class: 'views card' });
  E.ctx = h('div', { class: 'context card' });
  E.mm = h('div', { class: 'minimap card' });
  bottom.append(E.views, E.ctx, E.mm);
  root.append(bottom);
  buildViews();
  initMinimap(E.mm);
  E.drawer = h('div', { class: 'drawer card hidden' });
  root.append(E.drawer);
  E.modal = h('div', { class: 'modal-bg hidden', onclick: (e: MouseEvent) => { if (e.target === E.modal) closeModal(); } });
  root.append(E.modal);
  refreshHUD(true);
}
export function hideHUD() { const r = $('#hud'); r.classList.add('hidden'); r.innerHTML = ''; }

// ---------------- Barra superior ----------------
function buildBadge() {
  const S = G.S, p = player();
  const c = COLONY_COLORS[p.color];
  const emb = h('div', { class: 'emb', style: { background: `radial-gradient(circle at 35% 30%, ${c.light}, ${c.body})` } }, EMBLEMS[p.emblem], h('span', { class: 'lvl' }, ''));
  const xp = h('div', { class: 'xpbar' }, h('i'));
  E.badge.append(emb, h('div', {}, h('div', { class: 'nm' }, S.cfg.colonyName), h('div', { class: 'pl' }, '♛ ' + S.cfg.queenName + ' · ' + S.cfg.playerName), xp));
  bindTip(E.badge, () => `<b>Nivel de colonia ${p.level}</b><br>Experiencia: ${Math.floor(p.xp)} / ${xpFor(p.level)}<br><span style="color:#bfae98">Gana experiencia recolectando, excavando, criando, descubriendo y combatiendo. Cada nivel da recompensas y desbloquea decoraciones.</span>`);
}
const PILLS: { k: string; icon: string; tip: () => string }[] = [
  { k: 'food', icon: '🍯', tip: () => `<b>Comida</b><br>Para criar hormigas y construir cámaras.<br>Capacidad: ${pstats().foodCap} (amplíala con Despensas).` },
  { k: 'leaves', icon: '🍃', tip: () => `<b>Hojas</b><br>Material de construcción y alimento del Jardín de Hongos.<br>Capacidad: ${pstats().leafCap}.` },
  { k: 'soil', icon: '🟫', tip: () => '<b>Tierra</b><br>Se obtiene al excavar. Necesaria para edificios de superficie y decoraciones.' },
  { k: 'amber', icon: '💎', tip: () => '<b>Ámbar</b><br>Recurso valioso: tecnologías, castas de élite y decoraciones. Búscalo junto a árboles, bajo tierra o derrotando enemigos.' },
  { k: 'science', icon: '🧪', tip: () => `<b>Saber</b><br>Generado en las Cámaras de Feromonas (${pstats().labRate.toFixed(2)}/s base). Úsalo para investigar.` },
  { k: 'pop', icon: '🐜', tip: () => { const ps = pstats(); return `<b>Población</b><br>Hormigas: ${CC[0]?.total ?? 0} · Cría: ${broodCount()}<br>Máximo: ${ps.popCap} (amplíalo con Dormitorios).<br>En superficie: ${CC[0]?.surface ?? 0} · En el nido: ${CC[0]?.nest ?? 0}`; } },
  { k: 'army', icon: '⚔️', tip: () => `<b>Ejército</b><br>Militares: ${CC[0]?.military ?? 0} / ${pstats().milCap}<br>Amplía el límite con Cuarteles.` },
  { k: 'beauty', icon: '✨', tip: () => { const ps = pstats(); return `<b>Prestigio</b><br>Belleza: ${ps.beauty}<br>Bonificación: +${Math.round(ps.prestige * 100)}% a trabajo, cría e investigación.<br>Decora tus cámaras para aumentarlo.`; } },
];
function buildRes() {
  for (const p of PILLS) {
    const pill = h('div', { class: 'pill', 'data-k': p.k }, h('span', { class: 'ic' }, p.icon), h('div', { class: 'col' }, h('div', {}, h('span', { class: 'v' }, '0'), h('span', { class: 'cap' }, '')), h('span', { class: 'rate' }, '')));
    bindTip(pill, p.tip);
    E['pill_' + p.k] = pill;
    E.res.append(pill);
  }
}
export function bumpRes(k: string) {
  const el = E['pill_' + k];
  if (!el) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function buildClock() {
  E.day = h('div', { class: 'day' }, '');
  E.wt = h('div', { class: 'wt' }, '');
  const sp = h('div', { class: 'speed' });
  const mk = (label: string, v: number, tipText: string) => {
    const b = h('button', { onclick: () => { SFX.click(); if (v === 0) setSpeed(G.S.speed, !G.S.paused); else setSpeed(v, false); refreshClock(); }, tip: tipText }, label);
    b.dataset.v = String(v);
    sp.append(b);
  };
  mk('⏸', 0, 'Pausa <span class="kbd">Espacio</span>'); mk('1×', 1, 'Velocidad normal'); mk('2×', 2, 'Velocidad doble'); mk('3×', 3, 'Velocidad triple');
  E.speed = sp;
  E.clock.append(h('div', {}, E.day, E.wt), sp);
}
function refreshClock() {
  const S = G.S;
  const ph = dayPhase();
  const hour = Math.floor(((ph * 24) + 6) % 24), min = Math.floor((((ph * 24) + 6) % 1) * 60);
  E.day.textContent = `${isNight() ? '🌙' : ph > 0.62 ? '🌇' : '☀️'} Día ${dayNumber()} · ${String(hour).padStart(2, '0')}:${String(min - (min % 10)).padStart(2, '0')}`;
  E.wt.textContent = `${WEATHER_ICON[S.weather.kind]} ${WEATHER_NAME[S.weather.kind]} · ${fmtTime(S.time)}`;
  for (const b of Array.from(E.speed.children) as HTMLElement[]) {
    const v = +b.dataset.v!;
    b.classList.toggle('on', v === 0 ? S.paused : !S.paused && S.speed === v);
  }
}

// ---------------- Laterales ----------------
function buildSide() {
  const mk = (id: string, icon: string, key: string, label: string, fn: () => void) => {
    const b = h('div', { class: 'sidebtn card', onclick: () => { SFX.click(); fn(); }, tip: `<b>${label}</b> <span class="kbd">${key}</span>` }, h('span', { class: 'i' }, icon), h('span', { class: 'k' }, key), h('span', { class: 'dot' }, '!'));
    E['side_' + id] = b;
    E.side.append(b);
  };
  mk('colony', '👑', 'C', 'Colonia: cría, castas y trabajo', () => toggleDrawer('colony'));
  mk('research', '🧪', 'R', 'Investigación', () => toggleModal('research'));
  mk('build', '🏗️', 'B', 'Construir', () => toggleBuild());
  mk('ach', '🏆', 'L', 'Logros y objetivos', () => toggleModal('ach'));
  mk('stats', '📊', 'E', 'Estadísticas', () => toggleModal('stats'));
  mk('help', '❓', 'F1', 'Cómo jugar', () => openHelp());
}
export function toggleBuild() {
  const S = G.S;
  if (S.view === 'nest') { UI.panelTab = UI.panelTab === 'chambers' ? '' : 'chambers'; UI.placing = null; }
  else { buildMode = !buildMode; if (!buildMode && UI.placing?.kind === 'building') UI.placing = null; }
  refreshHUD(true);
}
function buildViews() {
  const mk = (v: 'surface' | 'nest', icon: string, label: string) => {
    const b = h('button', { class: 'viewbtn', onclick: () => { SFX.whoosh(); setView(v); }, tip: 'Cambiar de vista <span class="kbd">Tab</span>' }, icon, h('span', {}, label), h('span', { class: 'cnt', style: { marginLeft: 'auto', fontSize: '11px', color: '#bfae98' } }, ''));
    b.dataset.v = v;
    E.views.append(b);
  };
  mk('surface', '🌿', 'Superficie'); mk('nest', '🕳️', 'Hormiguero');
}
export function setView(v: 'surface' | 'nest') {
  const S = G.S;
  if (S.view === v) return;
  S.view = v;
  UI.placing = null; UI.nestTool = 'none'; UI.selChamber = 0; UI.panelTab = ''; buildMode = false;
  setUnderground(v === 'nest');
  refreshHUD(true);
}

// ---------------- Refresco ----------------
let lastRefresh = 0;
export function refreshHUD(force = false) {
  const S = G.S;
  if (!S || !E.res) return;
  const now = performance.now();
  if (!force && now - lastRefresh < 140) return;
  lastRefresh = now;
  const p = player();
  // tasas
  if (!rateHist.length || now - rateHist[rateHist.length - 1].t > 2000) {
    rateHist.push({ t: now, g: { ...S.stats.gathered } });
    if (rateHist.length > 32) rateHist.shift();
  }
  const old = rateHist[0], dtm = (now - old.t) / 60000;
  const ps = pstats();
  // badge
  const lvl = E.badge.querySelector('.lvl') as HTMLElement;
  lvl.textContent = String(p.level);
  (E.badge.querySelector('.xpbar i') as HTMLElement).style.width = Math.min(100, (p.xp / xpFor(p.level)) * 100) + '%';
  // recursos
  const cc = CC[0];
  for (const pl of PILLS) {
    const el = E['pill_' + pl.k];
    const v = el.querySelector('.v') as HTMLElement, cap = el.querySelector('.cap') as HTMLElement, rate = el.querySelector('.rate') as HTMLElement;
    let val = 0, capT = '', rateT = '', full = false;
    if (pl.k in RES_INFO) {
      val = p.res[pl.k as ResKey];
      if (pl.k === 'food') { capT = '/' + fmt(ps.foodCap); full = val >= ps.foodCap - 1; }
      if (pl.k === 'leaves') { capT = '/' + fmt(ps.leafCap); full = val >= ps.leafCap - 1; }
      if (pl.k === 'science') rateT = ps.labRate > 0 ? '+' + (ps.labRate * 60).toFixed(0) + '/min' : '';
      else if (dtm > 0.05) { const r = (S.stats.gathered[pl.k as ResKey] - old.g[pl.k]) / dtm; rateT = r > 0.5 ? '+' + fmt(r) + '/min' : ''; }
    } else if (pl.k === 'pop') { val = cc?.total ?? 0; capT = '/' + ps.popCap; rateT = broodCount() ? '🥚 ' + broodCount() : ''; full = val + broodCount() >= ps.popCap; }
    else if (pl.k === 'army') { val = cc?.military ?? 0; capT = '/' + ps.milCap; }
    else if (pl.k === 'beauty') { val = ps.beauty; rateT = ps.prestige > 0 ? '+' + Math.round(ps.prestige * 100) + '%' : ''; }
    v.textContent = fmt(val); cap.textContent = capT; rate.textContent = rateT;
    el.classList.toggle('full', full);
  }
  refreshClock();
  // vistas
  for (const b of Array.from(E.views.children) as HTMLElement[]) {
    b.classList.toggle('on', b.dataset.v === S.view);
    const cnt = b.querySelector('.cnt') as HTMLElement;
    cnt.textContent = '🐜' + (b.dataset.v === 'surface' ? cc?.surface ?? 0 : cc?.nest ?? 0);
  }
  // laterales
  E.side_colony.classList.toggle('on', drawer === 'colony');
  E.side_research.classList.toggle('on', modal === 'research');
  E.side_build.classList.toggle('on', buildMode || UI.panelTab === 'chambers');
  const canRes = !p.research && TECHS.some(t => techAvailable(t.id).ok);
  E.side_research.classList.toggle('alert', canRes);
  (E.side_build.querySelector('.i') as HTMLElement).textContent = S.view === 'nest' ? '🏛️' : '🏗️';
  refreshQuests(force);
  refreshContext(force);
  refreshDrawer(force);
  for (const f of liveModal) f();
  drawMinimap();
}

// ---------------- Objetivos ----------------
let questsMin = false;
function refreshQuests(force: boolean) {
  const S = G.S;
  const key = S.quests.active.join(',') + questsMin;
  if (key !== questKey || force) {
    questKey = key;
    E.quests.innerHTML = '';
    E.quests.classList.toggle('min', questsMin);
    E.quests.append(h('h3', {}, h('span', {}, '🎯 Objetivos'), h('span', { style: { cursor: 'pointer', color: '#8a7a66' }, onclick: () => { questsMin = !questsMin; refreshQuests(true); } }, questsMin ? '▸' : '▾')));
    for (const id of S.quests.active) {
      const q = QUEST_BY_ID[id];
      if (!q) continue;
      const rw = Object.entries(q.reward).map(([k, v]) => `${RES_INFO[k as ResKey].icon}${v}`).join(' ');
      E.quests.append(h('div', { class: 'quest', 'data-q': id },
        h('div', { class: 'qt' }, q.title),
        h('div', { class: 'qd' }, q.desc),
        h('div', { class: 'qb' }, h('i')),
        h('div', { class: 'qr' }, '🎁 ' + rw + ' · +' + q.xp + ' XP'),
        q.hint ? h('div', { class: 'qh' }, '💡 ' + q.hint) : null));
    }
  }
  for (const el of Array.from(E.quests.querySelectorAll('.quest')) as HTMLElement[]) {
    const q = QUEST_BY_ID[el.dataset.q!];
    const p = Math.min(q.goal, S.quests.prog[q.id] ?? q.prog(S));
    (el.querySelector('.qb i') as HTMLElement).style.width = (p / q.goal) * 100 + '%';
    const d = el.querySelector('.qd') as HTMLElement;
    d.textContent = q.desc + (q.goal > 1 ? `  (${Math.floor(p)}/${q.goal})` : '');
  }
}

// ---------------- Panel contextual ----------------
function contextKey(): string {
  const S = G.S;
  const p = player();
  const base = [S.view, UI.selStruct, UI.selCre, UI.selNode, UI.selChamber, UI.nestTool, UI.brush, UI.panelTab, buildMode, UI.placing ? (UI.placing as any).type || UI.placing.kind : '', p.techs.length, p.level].join('|');
  const sel = [...UI.sel].filter(id => S.ants.some(a => a.id === id));
  const castes: Record<string, number> = {};
  for (const a of S.ants) if (UI.sel.has(a.id)) castes[a.caste] = (castes[a.caste] || 0) + 1;
  return base + '|' + sel.length + JSON.stringify(castes);
}
function refreshContext(force: boolean) {
  const key = contextKey();
  if (key !== ctxKey || force) {
    ctxKey = key;
    live = [];
    E.ctx.innerHTML = '';
    buildContext();
  }
  for (const f of live) f();
}
function tool(icon: string, name: string, opts: { cost?: any; key?: string; on?: boolean; locked?: string; tip?: string; onclick: () => void; liveCost?: () => any }) {
  const el = h('div', { class: 'tool' + (opts.on ? ' on' : '') + (opts.locked ? ' locked' : ''), onclick: () => { SFX.click(); opts.onclick(); } },
    opts.key ? h('span', { class: 'tk' }, opts.key) : null,
    h('span', { class: 'ti' }, icon), h('span', { class: 'tn' }, name));
  if (opts.cost) {
    const c = h('span', { class: 'tc' });
    el.append(c);
    const upd = () => { c.innerHTML = costHTML(opts.liveCost ? opts.liveCost() : opts.cost, player().res as any); };
    upd(); live.push(upd);
  }
  if (opts.tip || opts.locked) bindTip(el, () => (opts.tip || '') + (opts.locked ? `<br><span style="color:#ff8a7a">🔒 ${opts.locked}</span>` : ''));
  return el;
}
function buildContext() {
  const S = G.S;
  const main = h('div', { class: 'ctx-main' });
  E.ctx.append(main);
  if (S.view === 'surface') {
    const sel = S.ants.filter(a => UI.sel.has(a.id));
    if (buildMode) return buildBuildMenu(main);
    if (sel.length) return buildSelection(main, sel);
    if (UI.selStruct) { const s = S.structures.find(x => x.id === UI.selStruct); if (s) return buildStructInfo(main, s); }
    if (UI.selCre) { const c = S.creatures.find(x => x.id === UI.selCre); if (c) return buildCreatureInfo(main, c); }
    if (UI.selNode) { const n = getNode(UI.selNode); if (n) return buildNodeInfo(main, n); }
    main.append(h('div', { class: 'ctx-title' }, '🌿 Superficie'),
      h('div', { class: 'ctx-sub', html: 'Arrastra para <b>seleccionar</b> hormigas · <b>Clic derecho</b> para ordenar (mover, atacar, recolectar) · <b>Rueda</b> para zoom · <b>WASD</b> mover cámara.' }));
    const tools = h('div', { class: 'tools' });
    tools.append(
      tool('⚔️', 'Ejército', { key: 'Q', tip: 'Selecciona a todas tus hormigas militares de superficie.', onclick: () => selectArmy() }),
      tool('🐜', 'Obreras', { key: 'Z', tip: 'Selecciona a las obreras visibles.', onclick: () => selectWorkersOnScreen() }),
      tool('🚩', 'Reunión', { tip: 'Fija el punto de reunión donde esperan las nuevas tropas.', on: UI.placing?.kind === 'rally', onclick: () => { UI.placing = UI.placing?.kind === 'rally' ? null : { kind: 'rally' }; refreshHUD(true); } }),
      tool('🏗️', 'Construir', { key: 'B', tip: 'Montículos, torres, corrales...', onclick: () => toggleBuild() }),
      tool('〰️', 'Feromonas', { key: 'P', on: UI.showPher, tip: 'Mostrar los rastros de feromonas de tu colonia.', onclick: () => { UI.showPher = !UI.showPher; refreshHUD(true); } }),
      tool('🗺️', 'Territorio', { key: 'T', on: UI.showTerritory, tip: 'Mostrar las fronteras.', onclick: () => { UI.showTerritory = !UI.showTerritory; refreshHUD(true); } }),
    );
    main.append(tools);
  } else {
    if (UI.selChamber) { const c = chamberById(UI.selChamber); if (c) return buildChamberInfo(main, c); }
    if (UI.panelTab === 'chambers') return buildChamberMenu(main);
    if (UI.panelTab === 'decor') return buildDecorMenu(main);
    main.append(h('div', { class: 'ctx-title' }, '🕳️ Hormiguero'));
    const sub = h('div', { class: 'ctx-sub' });
    main.append(sub);
    live.push(() => {
      const cc = CC[0];
      sub.innerHTML = `Excavadoras: <b>${cc?.roles.dig ?? 0}</b> · Casillas por excavar: <b>${countDig()}</b>${digFrontier === 0 && countDig() > 0 ? ' <span style="color:#ff8a7a">(¡sin acceso! conecta con un túnel)</span>' : ''} · Clic en una cámara para gestionarla.`;
    });
    const tools = h('div', { class: 'tools' });
    tools.append(
      tool('⛏️', 'Excavar', { key: 'F', on: UI.nestTool === 'dig', tip: 'Pinta casillas de tierra para que las excavadoras las abran. Cada casilla da 🟫 tierra y puede esconder tesoros.', onclick: () => { UI.nestTool = UI.nestTool === 'dig' ? 'none' : 'dig'; UI.placing = null; refreshHUD(true); } }),
      tool('🧹', 'Cancelar', { key: 'X', on: UI.nestTool === 'undig', tip: 'Quita marcas de excavación.', onclick: () => { UI.nestTool = UI.nestTool === 'undig' ? 'none' : 'undig'; UI.placing = null; refreshHUD(true); } }),
      tool(['▪', '◼', '⬛'][UI.brush - 1], 'Pincel ' + UI.brush, { tip: 'Tamaño del pincel (1-3). Atajo: rueda con Shift.', onclick: () => { UI.brush = UI.brush % 3 + 1; refreshHUD(true); } }),
      tool('🏛️', 'Cámaras', { key: 'B', tip: 'Coloca nuevas cámaras. Se excava un túnel automáticamente.', onclick: () => { UI.panelTab = 'chambers'; refreshHUD(true); } }),
      tool('🎨', 'Decorar', { key: 'V', tip: 'Embellece las cámaras para ganar prestigio.', onclick: () => { UI.panelTab = 'decor'; refreshHUD(true); } }),
    );
    main.append(tools);
  }
}
function countDig() { const n = G.S.nest; let k = 0; for (let i = 0; i < n.dig.length; i++) if (n.dig[i] && n.grid[i] === 0) k++; return k; }

export function selectArmy() {
  UI.sel.clear(); UI.selStruct = 0; UI.selCre = 0; UI.selNode = 0;
  for (const a of G.S.ants) if (a.col === 0 && a.layer === 0 && (CASTES[a.caste].military || a.caste === 'princess')) UI.sel.add(a.id);
  if (!UI.sel.size) toast('⚔️', 'No tienes ejército en superficie', 'Cría Soldados desde el panel de Colonia (C).', 'info', undefined, 2500);
  refreshHUD(true);
}
function selectWorkersOnScreen() {
  const S = G.S;
  UI.sel.clear();
  const vw = innerWidth / S.cam.sz / 2, vh = innerHeight / S.cam.sz / 2;
  for (const a of S.ants) if (a.col === 0 && a.layer === 0 && !CASTES[a.caste].military && Math.abs(a.x - S.cam.sx) < vw && Math.abs(a.y - S.cam.sy) < vh) UI.sel.add(a.id);
  refreshHUD(true);
}

function buildSelection(main: HTMLElement, sel: typeof G.S.ants) {
  const by: Record<string, number> = {};
  for (const a of sel) by[a.caste] = (by[a.caste] || 0) + 1;
  main.append(h('div', { class: 'ctx-title' }, `🐜 ${sel.length} seleccionada${sel.length > 1 ? 's' : ''}`));
  const chips = h('div', { class: 'unit-chips' });
  for (const k in by) {
    const def = CASTES[k as CasteId];
    chips.append(h('div', { class: 'uchip', onclick: () => { for (const a of sel) if (a.caste !== k) UI.sel.delete(a.id); refreshHUD(true); }, tip: `<b>${def.name}</b><br>${def.desc}<br>❤️ ${def.hp} · ⚔️ ${def.dmg} · 🛡️ ${def.armor} · 💨 ${def.speed}<br><i>Clic: seleccionar solo esta casta</i>` }, def.icon, ' ', by[k] + ' ' + (by[k] > 1 ? def.plural : def.name)));
  }
  main.append(chips);
  const hp = h('div', { class: 'hpline' }, h('i'));
  const info = h('div', { class: 'ctx-sub' });
  main.append(hp, info);
  live.push(() => {
    const S = G.S;
    let a = 0, m = 0, kills = 0, carrying = 0;
    const cur = S.ants.filter(x => UI.sel.has(x.id));
    for (const x of cur) { a += x.hp; m += x.mhp; kills += x.kills; if (x.carry) carrying++; }
    (hp.firstElementChild as HTMLElement).style.width = (m ? (a / m) * 100 : 0) + '%';
    const states = cur.length === 1 ? ' · ' + stateName(cur[0]) : '';
    info.textContent = `Vida ${Math.round(a)}/${Math.round(m)} · Bajas causadas ${kills}${carrying ? ' · Cargando ' + carrying : ''}${states}`;
  });
  const act = h('div', { class: 'ctx-actions' });
  act.append(
    h('button', { class: 'btn small', onclick: () => { stopSelected(UI.sel); SFX.click(); }, tip: 'Detener y mantener posición <span class="kbd">X</span>' }, '✋ Detener'),
    h('button', { class: 'btn small', onclick: () => { returnSelected(UI.sel); SFX.click(); }, tip: 'Volver al nido / punto de reunión <span class="kbd">H</span>' }, '🏠 Volver'),
    h('button', { class: 'btn small', onclick: () => { UI.sel.clear(); refreshHUD(true); } }, '✕ Deseleccionar'),
  );
  main.append(act, h('div', { class: 'hint' }, 'Ctrl+1…9 crea un grupo · 1…9 lo recupera · Clic derecho sobre enemigo: atacar · sobre recurso: recolectar · Shift+clic derecho: patrullar'));
}
function stateName(a: { st: AS; carry: any; role: string }): string {
  switch (a.st) {
    case AS.Search: return 'Buscando comida';
    case AS.Explore: return 'Explorando';
    case AS.ToNode: return 'Yendo a recolectar';
    case AS.Harvest: return 'Recolectando';
    case AS.Return: return a.carry ? 'Llevando recursos al nido' : 'Volviendo al nido';
    case AS.Attack: return 'Combatiendo';
    case AS.Flee: return '¡Huyendo!';
    case AS.Guard: return 'En guardia';
    case AS.Move: return 'En marcha';
    case AS.Build: return 'Construyendo';
    case AS.NestDig: return 'Excavando';
    case AS.NestWork: return 'Trabajando';
    default: return '—';
  }
}
function buildStructInfo(main: HTMLElement, s: typeof G.S.structures[0]) {
  const S = G.S;
  const d = BUILDINGS[s.type];
  const col = S.colonies[s.col];
  main.append(h('div', { class: 'ctx-title' }, d.icon + ' ' + (s.type === 'rivalnest' ? col.name : d.name), s.col !== 0 ? h('span', { style: { color: COLONY_COLORS[col.color].ui, fontSize: '13px' } }, ' (' + col.name + ')') : null));
  main.append(h('div', { class: 'ctx-sub' }, d.desc));
  const hp = h('div', { class: 'hpline' + (s.col !== 0 ? ' enemy' : '') }, h('i'));
  const txt = h('div', { class: 'ctx-sub' });
  main.append(hp, txt);
  live.push(() => {
    (hp.firstElementChild as HTMLElement).style.width = (s.hp / s.mhp) * 100 + '%';
    txt.textContent = s.built ? `Vida ${Math.ceil(s.hp)}/${s.mhp} · Territorio ${d.territory} · Visión ${d.vision}` : `En construcción: ${Math.floor((s.prog / d.work) * 100)}% — las obreras cercanas acudirán a construir`;
    if (s.type === 'rivalnest') txt.textContent += ` · Reina ${col.queenName} · Fuerza ×${col.ai.power.toFixed(2)}`;
  });
  const act = h('div', { class: 'ctx-actions' });
  if (s.type === 'nest') act.append(h('button', { class: 'btn small primary', onclick: () => setView('nest') }, '🕳️ Entrar al hormiguero'), h('button', { class: 'btn small', onclick: () => { resetRally(); toast('🚩', 'Punto de reunión restablecido', '', 'info', undefined, 1800); } }, '🚩 Reunión en el nido'));
  if (s.col === 0 && s.type !== 'nest' && s.type !== 'satellite') act.append(h('button', { class: 'btn small danger', onclick: () => { cancelStructure(s); UI.selStruct = 0; refreshHUD(true); } }, s.built ? '💥 Demoler (40%)' : '✕ Cancelar (80%)'));
  if (s.col === 0 && s.type === 'outpost' && s.built) act.append(h('div', { class: 'hint' }, '👑 Envía una Princesa alada aquí para fundar un nido satélite.'));
  if (s.col !== 0) act.append(h('button', { class: 'btn small primary', onclick: () => { selectArmy(); import('../game/actions').then(m => { m.commandSelected(UI.sel, s.x, s.y, { tk: 2, id: s.id }, 0, s.id, true, false); }); } }, '⚔️ ¡Atacar con todo el ejército!'));
  main.append(act);
}
function buildCreatureInfo(main: HTMLElement, c: typeof G.S.creatures[0]) {
  const d = CREATURES[c.type];
  const danger = d.behavior === 'hunter' ? '☠️ Depredador' : d.behavior === 'neutral' ? '⚠️ Neutral' : '🍃 Presa';
  main.append(h('div', { class: 'ctx-title' }, (c.name || d.name), h('span', { style: { fontSize: '12px', color: '#bfae98' } }, ' · ' + danger)));
  main.append(h('div', { class: 'ctx-sub' }, d.desc));
  const hp = h('div', { class: 'hpline enemy' }, h('i'));
  const txt = h('div', { class: 'ctx-sub' });
  main.append(hp, txt);
  live.push(() => { (hp.firstElementChild as HTMLElement).style.width = (c.hp / c.mhp) * 100 + '%'; txt.innerHTML = `Vida ${Math.ceil(c.hp)}/${Math.round(c.mhp)} · ⚔️ ${d.dmg} · 🛡️ ${d.armor} · Botín: ${costHTML(d.loot)}`; });
  main.append(h('div', { class: 'ctx-actions' }, h('button', { class: 'btn small primary', onclick: () => { selectArmy(); import('../game/actions').then(m => m.commandSelected(UI.sel, c.x, c.y, { tk: 1, id: c.id }, 0, 0, true, false)); } }, '⚔️ Cazar con el ejército')));
}
function buildNodeInfo(main: HTMLElement, n: NonNullable<ReturnType<typeof getNode>>) {
  const info = NODE_INFO[n.kind];
  main.append(h('div', { class: 'ctx-title' }, info.icon + ' ' + (n.name || info.name)));
  const txt = h('div', { class: 'ctx-sub' });
  main.append(txt);
  live.push(() => { txt.innerHTML = `Quedan <b>${Math.floor(n.amt)}</b> de ${RES_INFO[info.res].icon} ${RES_INFO[info.res].name}${n.regen > 0 ? ' · se regenera' : ''}${n.decay !== undefined ? ' · se pudre en ' + Math.ceil(n.decay) + ' s' : ''}`; });
  main.append(h('div', { class: 'ctx-actions' }, h('button', {
    class: 'btn small primary', onclick: () => {
      const k = sendGatherers(n.id);
      toast('🐜', `${k} recolectoras en camino`, '', 'info', undefined, 1800);
    },
  }, '🐜 Enviar 8 recolectoras')));
}
function buildBuildMenu(main: HTMLElement) {
  main.append(h('div', { class: 'ctx-title' }, '🏗️ Construir en superficie', h('span', { class: 'hint' }, ' · Coloca cerca de tu territorio · las obreras construyen')));
  const tools = h('div', { class: 'tools' });
  for (const t of BUILD_MENU) {
    const d = BUILDINGS[t];
    const u = buildingUnlocked(t);
    tools.append(tool(d.icon, d.name, { cost: d.cost, on: UI.placing?.kind === 'building' && UI.placing.type === t, locked: u.ok ? undefined : u.reason, tip: `<b>${d.name}</b><br>${d.desc}<br>Vida ${d.hp} · Territorio ${d.territory}`, onclick: () => { if (!u.ok) { toast('🔒', u.reason, '', 'bad', undefined, 2000); return; } UI.placing = { kind: 'building', type: t as BuildingType }; refreshHUD(true); } }));
  }
  tools.append(tool('✕', 'Cerrar', { onclick: () => toggleBuild() }));
  main.append(tools);
}
function buildChamberMenu(main: HTMLElement) {
  main.append(h('div', { class: 'ctx-title' }, '🏛️ Nuevas cámaras', h('span', { class: 'hint' }, ' · Clic para colocar · se excava un túnel automáticamente')));
  const tools = h('div', { class: 'tools' });
  for (const t of CHAMBER_ORDER) {
    const d = CHAMBERS[t];
    const u = chamberUnlocked(t);
    const count = G.S.nest.chambers.filter(c => c.type === t).length;
    tools.append(tool(d.icon, d.name + (count ? ` (${count})` : ''), { cost: d.cost[0], on: UI.placing?.kind === 'chamber' && UI.placing.type === t, locked: u.ok ? undefined : u.reason, tip: `<b>${d.name}</b><br>${d.desc}<br><span style="color:#79e38a">${d.effect[0]}</span>`, onclick: () => { if (!u.ok) { toast('🔒', u.reason, '', 'bad', undefined, 2000); return; } UI.placing = { kind: 'chamber', type: t as ChamberType }; UI.nestTool = 'none'; refreshHUD(true); } }));
  }
  tools.append(tool('✕', 'Cerrar', { onclick: () => { UI.panelTab = ''; UI.placing = null; refreshHUD(true); } }));
  main.append(tools);
}
function buildDecorMenu(main: HTMLElement) {
  const p = player();
  main.append(h('div', { class: 'ctx-title' }, '🎨 Decoraciones', h('span', { class: 'hint' }, ` · Clic en el suelo de una cámara · Prestigio actual ${pstats().beauty}`)));
  const tools = h('div', { class: 'tools' });
  for (const d of DECORS) {
    const locked = p.level < d.level ? 'Nivel de colonia ' + d.level : d.tech && !p.techs.includes(d.tech) ? 'Requiere investigación' : undefined;
    tools.append(tool(d.icon, d.name, { cost: d.cost, on: UI.placing?.kind === 'decor' && UI.placing.type === d.id, locked, tip: `<b>${d.name}</b><br>+${d.beauty} belleza${d.glow ? '<br>✨ Brilla en la oscuridad' : ''}`, onclick: () => { if (locked) { toast('🔒', locked, '', 'bad', undefined, 2000); return; } UI.placing = { kind: 'decor', type: d.id }; UI.nestTool = 'none'; refreshHUD(true); } }));
  }
  tools.append(tool('✕', 'Cerrar', { onclick: () => { UI.panelTab = ''; UI.placing = null; refreshHUD(true); } }));
  main.append(tools);
  void decorUnlocked;
}
function buildChamberInfo(main: HTMLElement, c: NonNullable<ReturnType<typeof chamberById>>) {
  const d = CHAMBERS[c.type];
  main.append(h('div', { class: 'ctx-title', html: `${d.icon} ${d.name} <span style="color:#ffd24a">${'★'.repeat(c.level)}</span><span style="color:#5a4a3a">${'★'.repeat(d.maxLevel - c.level)}</span>` }));
  main.append(h('div', { class: 'ctx-sub' }, d.desc));
  const txt = h('div', { class: 'ctx-sub' });
  main.append(txt);
  live.push(() => {
    const w = CC[0]?.inChamber.get(c.id) || 0;
    if (c.state === 0) { txt.innerHTML = `⛏️ Excavando: <b>${Math.floor(chamberProgress(c) * 100)}%</b>`; return; }
    let extra = '';
    if (c.type === 'nursery' || c.type === 'royal') { const b = G.S.nest.brood.filter(x => x.ch === c.id); const st = [0, 0, 0]; for (const x of b) st[Math.min(2, stageOf(x.prog))]++; extra = ` · 🥚${st[0]} 🐛${st[1]} 🫘${st[2]}`; }
    txt.innerHTML = `<span style="color:#79e38a">${d.effect[c.level - 1]}</span> · Trabajando aquí: 🐜${w}${extra} · Decoraciones ${c.decor.length}/${4 + c.rx + c.level * 2}`;
  });
  const act = h('div', { class: 'ctx-actions' });
  const cost = chamberUpgradeCost(c.type, c.level);
  if (cost) {
    const b = h('button', { class: 'btn small primary', onclick: () => { if (upgradeChamber(c)) refreshHUD(true); } }, '⬆️ Mejorar a nivel ' + (c.level + 1) + ' ', costEl(cost));
    bindTip(b, () => { const ok = canUpgrade(c); return `<b>Nivel ${c.level + 1}</b>: ${d.effect[c.level]}${ok.ok ? '' : `<br><span style="color:#ff8a7a">${ok.reason}</span>`}`; });
    live.push(() => { const ok = canUpgrade(c).ok; b.classList.toggle('disabled', !ok); (b.querySelector('.cost') as HTMLElement).innerHTML = costHTML(cost, player().res as any); });
    act.append(b);
  }
  act.append(h('button', { class: 'btn small', onclick: () => { UI.panelTab = 'decor'; UI.selChamber = 0; refreshHUD(true); } }, '🎨 Decorar'));
  if (c.decor.length) act.append(h('button', { class: 'btn small', onclick: () => { removeDecor(c, c.decor.length - 1); refreshHUD(true); } }, '↩️ Quitar última decoración'));
  if (c.type !== 'royal') act.append(h('button', { class: 'btn small danger', onclick: () => { demolishChamber(c); UI.selChamber = 0; refreshHUD(true); } }, '💥 Demoler'));
  main.append(act);
}

// ---------------- Panel de colonia ----------------
export function toggleDrawer(d: 'colony') {
  drawer = drawer === d ? '' : d;
  drawerKey = '';
  if (drawer) SFX.open(); else SFX.close();
  refreshHUD(true);
}
function refreshDrawer(force: boolean) {
  if (!drawer) { E.drawer.classList.add('hidden'); return; }
  E.drawer.classList.remove('hidden');
  const p = player();
  const key = drawer + p.techs.length + '|' + p.queue.join(',') + '|' + G.S.nest.chambers.filter(c => c.state === 1).length;
  if (key !== drawerKey || force) {
    drawerKey = key;
    liveDrawer = [];
    E.drawer.innerHTML = '';
    buildColonyDrawer(E.drawer);
  }
  for (const f of liveDrawer) f();
}
function buildColonyDrawer(el: HTMLElement) {
  const S = G.S;
  const p = player();
  el.append(h('button', { class: 'close-x', onclick: () => toggleDrawer('colony') }, '✕'));
  el.append(h('h2', {}, '👑 ' + S.cfg.colonyName));
  const sub = h('div', { class: 'hint' });
  el.append(sub);
  liveDrawer.push(() => { const ps = pstats(); sub.textContent = `La Reina ${S.cfg.queenName} pone un huevo cada ${ps.eggInterval.toFixed(1)} s · Cría ${broodCount()}/${ps.broodCap}`; });
  // castas
  el.append(h('h4', {}, '🥚 Criar castas', h('span', { class: 'hint', style: { textTransform: 'none', letterSpacing: '0', marginLeft: '6px' } }, 'Clic +1 · Shift +5')));
  const grid = h('div', { class: 'caste-grid' });
  for (const c of TRAINABLE) {
    const d = CASTES[c];
    const u = casteUnlocked(c);
    const cnt = h('span', { class: 'cnt' });
    const costS = h('span', { class: 'cc' });
    const cv = document.createElement('canvas'); cv.width = 72; cv.height = 64; cv.style.width = '36px'; cv.style.height = '32px';
    const g = cv.getContext('2d')!;
    const spr = antSprite(p.color, c, 0, d.size);
    const sc = Math.min(64 / spr.c.width, 56 / spr.c.height) * 2.3;
    g.translate(36, 32); g.rotate(-Math.PI / 2); g.drawImage(spr.c, -spr.c.width * sc / 2, -spr.c.height * sc / 2, spr.c.width * sc, spr.c.height * sc);
    const card = h('div', { class: 'caste' + (u.ok ? '' : ' locked'), onclick: (e: MouseEvent) => { queueCaste(c, e.shiftKey ? 5 : 1); refreshHUD(true); } }, cv, h('div', {}, h('div', { class: 'cn' }, d.name), costS), cnt);
    bindTip(card, () => `<b>${d.icon} ${d.name}</b><br>${d.desc}<br>❤️ ${d.hp} · ⚔️ ${d.dmg}${d.range > 30 ? ' (distancia)' : ''} · 🛡️ ${d.armor} · 💨 ${d.speed}${d.carry ? ' · 🎒 ' + d.carry : ''}<br>Desarrollo: ${d.time} s${d.military ? '<br><i>Cuenta para el límite militar</i>' : ''}${u.ok ? '' : `<br><span style="color:#ff8a7a">🔒 ${u.reason}</span>`}`);
    liveDrawer.push(() => { cnt.textContent = String(CC[0]?.byCaste[c] || 0); costS.innerHTML = costHTML(d.cost, p.res as any); });
    grid.append(card);
  }
  el.append(grid);
  el.append(h('h4', {}, 'Cola de cría'));
  const q = h('div', { class: 'queue' });
  if (!p.queue.length) q.append(h('span', { class: 'hint' }, p.autoWorkers ? 'Vacía: la Reina pondrá obreras automáticamente.' : 'Vacía.'));
  p.queue.forEach((c, i) => q.append(h('span', { class: 'qchip', onclick: () => { dequeue(i); refreshHUD(true); }, tip: 'Quitar de la cola' }, CASTES[c].icon)));
  el.append(q);
  const auto = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: p.autoWorkers ? true : undefined, onchange: (e: Event) => { setAutoWorkers((e.target as HTMLInputElement).checked); } }), 'Obreras automáticas cuando la cola está vacía');
  el.append(h('div', { style: { marginTop: '8px' } }, auto));
  // distribución
  el.append(h('h4', {}, '⚖️ Trabajo de las obreras'));
  const roles: [keyof typeof p.alloc, string, string][] = [['forage', '🌿 Recolectar', 'Salen a por comida, hojas y ámbar'], ['dig', '⛏️ Excavar', 'Abren túneles y cámaras'], ['inside', '🏠 Interior', 'Cuidan la cría, cultivan hongos e investigan']];
  for (const [k, label, tipT] of roles) {
    const val = h('span', { style: { fontWeight: '900', textAlign: 'right' } });
    const inp = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(p.alloc[k] * 100)) }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      const v = +inp.value / 100;
      const others = roles.map(r => r[0]).filter(r => r !== k);
      const rest = 1 - v;
      const sumO = others.reduce((s, o) => s + p.alloc[o], 0) || 1;
      const na: any = { [k]: v };
      for (const o of others) na[o] = (p.alloc[o] / sumO) * rest;
      setAlloc(na.forage, na.dig, na.inside);
      for (const r of Array.from(el.querySelectorAll('input[data-role]')) as HTMLInputElement[]) if (r !== inp) r.value = String(Math.round(p.alloc[r.dataset.role as 'forage'] * 100));
    });
    inp.dataset.role = k;
    const row = h('div', { class: 'slider-row' }, h('span', { style: { fontWeight: '800', fontSize: '13px' } }, label), inp, val);
    bindTip(row, tipT);
    liveDrawer.push(() => { const cc = CC[0]; const n = cc ? (k === 'forage' ? cc.roles.forage - (cc.byCaste.scout || 0) - (cc.byCaste.harvester || 0) : cc.roles[k]) : 0; val.textContent = '🐜' + n; });
    el.append(row);
  }
  // prioridades
  el.append(h('h4', {}, '🎯 Prioridad de recolección'));
  for (const k of ['food', 'leaves', 'amber'] as const) {
    const inp = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(p.prio[k] * 100)), oninput: (e: Event) => { setPrio(k, +(e.target as HTMLInputElement).value / 100); } });
    el.append(h('div', { class: 'slider-row' }, h('span', { style: { fontWeight: '800', fontSize: '13px' } }, RES_INFO[k].icon + ' ' + RES_INFO[k].name), inp, h('span')));
  }
  // resumen
  el.append(h('h4', {}, '📜 Estado de la colonia'));
  const sg = h('div', { class: 'statgrid' });
  el.append(sg);
  liveDrawer.push(() => {
    const ps = pstats();
    const cc = CC[0];
    sg.innerHTML = [
      ['Población', `${cc?.total ?? 0}/${ps.popCap}`], ['Militares', `${cc?.military ?? 0}/${ps.milCap}`],
      ['Plazas de cría', `${broodCount()}/${ps.broodCap}`], ['Despensa', `${Math.floor(p.res.food)}/${ps.foodCap}`],
      ['Vida de la Reina', `${Math.ceil(p.queenHp)}/${p.queenMhp}`], ['Prestigio', `+${Math.round(ps.prestige * 100)}%`],
      ['Territorio', (territoryShare(0) * 100).toFixed(1) + '%'], ['Tecnologías', `${p.techs.length}/${TECHS.length}`],
    ].map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('');
  });
}

// ---------------- Modales ----------------
export function toggleModal(m: 'research' | 'ach' | 'stats') {
  if (modal === m) { closeModal(); return; }
  modal = m;
  SFX.open();
  liveModal = [];
  E.modal.innerHTML = '';
  E.modal.classList.remove('hidden');
  UI.modalOpen = true;
  hideTip();
  const dlg = h('div', { class: 'card dialog', style: { width: m === 'research' ? 'min(1180px, 96vw)' : 'min(920px, 94vw)' } });
  dlg.append(h('button', { class: 'close-x', onclick: () => closeModal() }, '✕'));
  E.modal.append(dlg);
  if (m === 'research') buildResearch(dlg);
  else if (m === 'ach') buildAch(dlg);
  else buildStats(dlg);
  refreshHUD(true);
}
export function closeModal() {
  if (!modal) return;
  modal = ''; liveModal = [];
  E.modal.classList.add('hidden'); E.modal.innerHTML = '';
  UI.modalOpen = false;
  hideTip();
  SFX.close();
  refreshHUD(true);
}
function buildResearch(dlg: HTMLElement) {
  const p = player();
  dlg.append(h('h2', {}, '🧪 Investigación'));
  const cur = h('div', { style: { margin: '6px 0 16px' } });
  dlg.append(cur);
  liveModal.push(() => {
    if (!p.research) { cur.innerHTML = `<div class="lead">Elige una tecnología. Saber disponible: <b>${Math.floor(p.res.science)} 🧪</b> · Ámbar: <b>${Math.floor(p.res.amber)} 💎</b></div>`; return; }
    const t = TECHS.find(x => x.id === p.research)!;
    if (!cur.dataset.r || cur.dataset.r !== t.id) {
      cur.dataset.r = t.id;
      cur.innerHTML = '';
      cur.append(h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, h('b', {}, `${t.icon} Investigando: ${t.name}`), h('div', { class: 'progress', style: { flex: '1' } }, h('i')), h('button', { class: 'btn tiny danger', onclick: () => { cancelResearch(); cur.dataset.r = ''; rebuildTech(); } }, 'Cancelar')));
    }
    (cur.querySelector('.progress i') as HTMLElement).style.width = p.researchProg * 100 + '%';
  });
  const cols = h('div', { class: 'tech-cols' });
  dlg.append(cols);
  const branches: [Branch, string, string][] = [['eco', '🌾 Economía', '#ffd27a'], ['war', '⚔️ Guerra', '#ff8a7a'], ['col', '👑 Colonia', '#c49bff']];
  const rebuildTech = () => {
    cols.innerHTML = '';
    for (const [b, name, color] of branches) {
      const col = h('div', { class: 'tech-col' }, h('h3', { style: { color } }, name));
      for (const t of TECHS.filter(x => x.branch === b).sort((a, c) => a.tier - c.tier)) {
        const st = p.techs.includes(t.id) ? 'done' : p.research === t.id ? 'cur' : techAvailable(t.id).ok ? 'avail' : t.req.every(r => p.techs.includes(r)) ? '' : 'locked';
        const card = h('div', { class: 'tech ' + st, onclick: () => { if (startResearch(t.id)) { rebuildTech(); refreshHUD(true); } } },
          h('span', { class: 'tier' }, 'T' + t.tier),
          h('div', { class: 'th' }, h('span', {}, t.icon), h('span', {}, t.name)),
          h('div', { class: 'tdsc' }, t.desc),
          st !== 'done' ? costEl(t.cost, p.res as any) : null,
          t.req.length && st === 'locked' ? h('div', { class: 'hint' }, 'Requiere: ' + t.req.map(r => TECHS.find(x => x.id === r)!.name).join(', ')) : null);
        col.append(card);
      }
      cols.append(col);
    }
  };
  rebuildTech();
  let last = p.techs.length + (p.research || '') + Math.floor(p.res.science / 5);
  liveModal.push(() => { const k = p.techs.length + (p.research || '') + Math.floor(p.res.science / 5); if (k !== last) { last = k; rebuildTech(); } });
}
function buildAch(dlg: HTMLElement) {
  const S = G.S;
  dlg.append(h('h2', {}, '🏆 Logros y objetivos'));
  dlg.append(h('p', { class: 'lead' }, `Logros: ${S.ach.length}/${ACHIEVEMENTS.length} · Objetivos completados: ${S.quests.done.length}/${QUESTS.length}`));
  const g = h('div', { class: 'ach-grid' });
  for (const a of ACHIEVEMENTS) g.append(h('div', { class: 'ach' + (S.ach.includes(a.id) ? ' on' : '') }, h('div', { class: 'ai' }, a.icon), h('div', {}, h('div', { class: 'an' }, a.name), h('div', { class: 'ad' }, a.desc))));
  dlg.append(g);
  dlg.append(h('h4', { style: { color: '#ffb547', marginTop: '20px' } }, 'OBJETIVOS'));
  const g2 = h('div', { class: 'ach-grid' });
  for (const q of QUESTS) {
    const done = S.quests.done.includes(q.id), act = S.quests.active.includes(q.id);
    g2.append(h('div', { class: 'ach' + (done ? ' on' : '') }, h('div', { class: 'ai' }, done ? '✅' : act ? '🎯' : '🔒'), h('div', {}, h('div', { class: 'an' }, q.title), h('div', { class: 'ad' }, q.desc))));
  }
  dlg.append(g2);
}
function buildStats(dlg: HTMLElement) {
  const S = G.S;
  dlg.append(h('h2', {}, '📊 Crónica de la colonia'));
  const st = S.stats;
  const kills = Object.values(st.kills).reduce((a, b) => a + b, 0);
  const rows: [string, string][] = [
    ['Tiempo de juego', fmtTime(S.played)], ['Día', String(dayNumber())], ['Población máxima', String(st.maxPop)], ['Ejército máximo', String(st.maxArmy)],
    ['Comida recolectada', fmt(st.gathered.food)], ['Hojas recolectadas', fmt(st.gathered.leaves)], ['Ámbar obtenido', fmt(st.gathered.amber)], ['Tierra excavada', fmt(st.dug)],
    ['Tesoros', String(st.treasures)], ['Criaturas cazadas', String(kills)], ['Hormigas enemigas abatidas', String(st.antKills)], ['Bajas propias', String(st.deaths)],
    ['Colonias destruidas', String(st.coloniesDestroyed)], ['Zonas descubiertas', `${st.zones}/${S.zones.length}`], ['Cámaras excavadas', String(st.chambers)], ['Edificios', String(st.built)],
    ['Decoraciones', String(st.decor)], ['Acontecimientos', String(st.events)], ['Jefes derrotados', String(st.bosses)], ['Territorio', (territoryShare(0) * 100).toFixed(1) + '%'],
  ];
  dlg.append(h('div', { class: 'statgrid', style: { gridTemplateColumns: 'repeat(4, 1fr)' }, html: rows.map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('') }));
  // gráfico
  const cv = h('canvas', { width: '1600', height: '360', style: { width: '100%', height: '180px', marginTop: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)' } }) as HTMLCanvasElement;
  dlg.append(h('h4', { style: { color: '#ffb547' } }, 'EVOLUCIÓN'), cv);
  const g = cv.getContext('2d')!;
  const hst = S.stats.history;
  if (hst.length > 1) {
    const maxP = Math.max(10, ...hst.map(x => x.pop)), maxF = Math.max(10, ...hst.map(x => x.food));
    const line = (f: (x: typeof hst[0]) => number, max: number, color: string) => {
      g.strokeStyle = color; g.lineWidth = 4; g.beginPath();
      hst.forEach((x, i) => { const px = 20 + (i / (hst.length - 1)) * 1560, py = 340 - (f(x) / max) * 310; i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.stroke();
    };
    line(x => x.food, maxF, '#ffd27a'); line(x => x.pop, maxP, '#79e38a'); line(x => x.army, maxP, '#ff8a7a');
    g.font = '800 26px Nunito'; g.fillStyle = '#79e38a'; g.fillText('Población', 30, 40); g.fillStyle = '#ff8a7a'; g.fillText('Ejército', 200, 40); g.fillStyle = '#ffd27a'; g.fillText('Comida', 340, 40);
  } else { g.font = '800 28px Nunito'; g.fillStyle = '#8a7a66'; g.fillText('La crónica se irá escribiendo con el tiempo…', 40, 180); }
  // rivales
  dlg.append(h('h4', { style: { color: '#ffb547' } }, 'COLONIAS'));
  for (const c of S.colonies) {
    const cc = CC[c.id];
    dlg.append(h('div', { class: 'save-row', style: { cursor: 'default' } }, h('span', { style: { fontSize: '22px', color: COLONY_COLORS[c.color].ui } }, EMBLEMS[c.emblem]), h('div', {}, h('div', { class: 'nm', style: { color: COLONY_COLORS[c.color].ui } }, c.name + (c.isPlayer ? ' (tú)' : '')), h('div', { class: 'meta' }, c.alive ? `Hormigas ${cc?.total ?? 0} · Militares ${cc?.military ?? 0} · Territorio ${(territoryShare(c.id) * 100).toFixed(1)}%` : '☠️ Destruida'))));
  }
}

export function quickSave() { saveGame().then(ok => toast(ok ? '💾' : '⚠️', ok ? 'Partida guardada' : 'No se pudo guardar', '', ok ? 'info' : 'bad', undefined, 1800)); }
export { jumpTo };
