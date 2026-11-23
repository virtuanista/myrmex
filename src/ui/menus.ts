// Menús y pantallas fuera de partida.
import { BIOMES, BiomeId, COLONY_COLORS, DIFFICULTIES, EMBLEMS, MAP_SIZES, MapSizeId } from '../game/defs';
import { G, GameConfig } from '../game/state';
import { deleteSave, lastSlot, listSaves, saveGame } from '../game/save';
import { Settings, SFX, applyVolumes, initAudio } from '../audio/audio';
import { antSprite } from '../render/sprites';
import { $, h, hideTip, toast } from './dom';
import { fmtTime, escHtml, ls } from '../core/util';
import { dayNumber } from '../game/time';
import { UI } from './uistate';
import { CC } from '../game/colony';
import { openJoinDialog, openHostDialog } from './netui';
import { NET, closeNet } from '../net/net';

export const Nav = {
  start: (_cfg: GameConfig) => { /* asignado en main */ },
  load: (_slot: string) => { /* */ },
  menu: () => { /* */ },
  resume: () => { /* */ },
  join: () => { /* */ },
};

const screens = () => $('#screens');
function clear() { screens().innerHTML = ''; }
function btn(label: string, cls: string, fn: () => void) { return h('button', { class: 'btn ' + cls, onclick: () => { initAudio(); SFX.click(); fn(); }, onmouseenter: () => SFX.hover() }, label); }

// ---------------- Título ----------------
export function showTitle() {
  clear();
  const last = lastSlot();
  const meta = listSaves().find(s => s.slot === last);
  const col = h('div', { class: 'menu-col' });
  if (meta) {
    const b = btn('▶  Continuar', 'primary', () => Nav.load(meta.slot));
    col.append(b, h('div', { class: 'hint', style: { textAlign: 'center', marginTop: '-6px' } }, `${meta.colony} · Día ${meta.day} · ${meta.pop} hormigas · ${fmtTime(meta.played)}`));
  }
  col.append(
    btn('✦  Nueva colonia', meta ? '' : 'primary', () => showNewGame()),
    btn('📂  Cargar partida', '', () => showLoad()),
    btn('🌐  Unirse a una colonia', '', () => openJoinDialog(() => Nav.join())),
    btn('⚙️  Opciones', '', () => showSettings(() => showTitle())),
    btn('❓  Cómo jugar', '', () => showHelpScreen(() => showTitle())),
    btn('📜  Créditos', 'ghost', () => showCredits()),
  );
  screens().append(h('div', { class: 'screen title' },
    h('div', { class: 'title-wrap' }, h('div', { class: 'logo' }, 'MYRMEX'), h('div', { class: 'subtitle' }, 'Imperio bajo la hierba'), col),
    h('div', { class: 'menu-foot' }, 'Un RTS de hormigas · Haz clic en cualquier lugar para activar el sonido')));
}

// ---------------- Nueva partida ----------------
const QUEENS = ['Amaranta', 'Isolda', 'Formia', 'Myrta', 'Odalis', 'Clío', 'Selene', 'Briseida', 'Ágata', 'Nerea', 'Ofelia', 'Hiedra', 'Melisa', 'Azucena', 'Casandra'];
const CP = ['Colonia', 'Imperio', 'Reino', 'Clan', 'Casa', 'Dinastía', 'Legión', 'Hermandad'];
const CS = ['del Ámbar', 'Raíz Profunda', 'Hoja Dorada', 'Mandíbula de Hierro', 'Miel Oscura', 'del Sol Naciente', 'Musgo Eterno', 'de la Brisa', 'Grano de Oro', 'Piedra Lunar', 'del Rocío', 'Espiga Roja'];
const rp = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function showNewGame() {
  clear();
  const cfg: GameConfig = {
    playerName: ls.get('myrmex.player') || 'Jugadora', colonyName: rp(CP) + ' ' + rp(CS), queenName: 'Reina ' + rp(QUEENS),
    color: 0, emblem: 0, biome: 'meadow', size: 'medium', rivals: 2, difficulty: 1, seed: Math.floor(Math.random() * 999999),
    mode: 'conquest', startRes: 1, creatures: 1,
  };
  const dlg = h('div', { class: 'card dialog' });
  const input = (label: string, key: 'playerName' | 'colonyName' | 'queenName', rnd?: () => string) => {
    const inp = h('input', { type: 'text', value: cfg[key], maxlength: '28', oninput: (e: Event) => { (cfg as any)[key] = (e.target as HTMLInputElement).value; } }) as HTMLInputElement;
    return h('div', { class: 'field' }, h('label', {}, label), rnd ? h('div', { style: { display: 'flex', gap: '6px' } }, inp, h('button', { class: 'btn small', onclick: () => { inp.value = rnd(); (cfg as any)[key] = inp.value; SFX.click(); }, tip: 'Nombre aleatorio' }, '🎲')) : inp);
  };
  const seg = <T,>(label: string, opts: [T, string, string?][], get: () => T, set: (v: T) => void, desc?: HTMLElement) => {
    const row = h('div', { class: 'seg' });
    const render = () => {
      row.innerHTML = '';
      for (const [v, name, d] of opts) {
        const b = h('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); SFX.click(); render(); if (desc) desc.textContent = d || ''; } }, name);
        row.append(b);
      }
    };
    render();
    if (desc) desc.textContent = opts.find(o => o[0] === get())?.[2] || '';
    return h('div', { class: 'field' }, h('label', {}, label), row, desc || null);
  };
  // vista previa de hormiga
  const prev = h('canvas', { width: '240', height: '180' }) as HTMLCanvasElement;
  const drawPrev = () => {
    const g = prev.getContext('2d')!;
    g.clearRect(0, 0, 240, 180);
    const t = performance.now() / 1000;
    const s = antSprite(cfg.color, 'soldier', Math.floor(t * 8) % 6, 1.25);
    const k = 3.2;
    g.save(); g.translate(80, 95); g.rotate(-0.3); g.drawImage(s.c, -s.w * k / 2, -s.h * k / 2, s.w * k, s.h * k); g.restore();
    const w = antSprite(cfg.color, 'worker', Math.floor(t * 8 + 3) % 6, 1);
    g.save(); g.translate(180, 120); g.rotate(-0.8); g.drawImage(w.c, -w.w * 2.6 / 2, -w.h * 2.6 / 2, w.w * 2.6, w.h * 2.6); g.restore();
    g.font = '40px serif'; g.textAlign = 'center'; g.fillStyle = COLONY_COLORS[cfg.color].ui; g.fillText(EMBLEMS[cfg.emblem], 200, 50);
    if (document.body.contains(prev)) requestAnimationFrame(drawPrev);
  };
  const sw = h('div', { class: 'swatches' });
  const renderSw = () => { sw.innerHTML = ''; COLONY_COLORS.forEach((c, i) => sw.append(h('div', { class: 'swatch' + (cfg.color === i ? ' on' : ''), style: { background: `radial-gradient(circle at 35% 30%, ${c.light}, ${c.body})`, color: c.ui }, tip: c.name, onclick: () => { cfg.color = i; SFX.click(); renderSw(); } }))); };
  renderSw();
  const em = h('div', { class: 'emblems' });
  const renderEm = () => { em.innerHTML = ''; EMBLEMS.forEach((e, i) => em.append(h('div', { class: 'emblem' + (cfg.emblem === i ? ' on' : ''), onclick: () => { cfg.emblem = i; SFX.click(); renderEm(); } }, e))); };
  renderEm();
  const seedIn = h('input', { type: 'number', value: String(cfg.seed), oninput: (e: Event) => { cfg.seed = Math.abs(parseInt((e.target as HTMLInputElement).value) || 1); } }) as HTMLInputElement;
  const bDesc = h('div', { class: 'hint' }), dDesc = h('div', { class: 'hint' });
  dlg.append(
    h('button', { class: 'close-x', onclick: () => { SFX.close(); showTitle(); } }, '✕'),
    h('h2', {}, 'Fundar una colonia'),
    h('p', { class: 'lead' }, 'Tras el vuelo nupcial, tu reina se ha enterrado bajo la hierba. De ella nacerá un imperio.'),
    h('div', { class: 'grid2' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        input('Tu nombre', 'playerName'),
        input('Nombre de la colonia', 'colonyName', () => rp(CP) + ' ' + rp(CS)),
        input('Nombre de la reina', 'queenName', () => 'Reina ' + rp(QUEENS)),
        h('div', { class: 'field' }, h('label', {}, 'Color de la colonia'), sw),
        h('div', { class: 'field' }, h('label', {}, 'Emblema'), em),
        h('div', { class: 'preview-ant' }, prev, h('div', { class: 'hint' }, 'Así lucirán tus hormigas. Cada casta tiene su propio aspecto.')),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        seg<BiomeId>('Bioma', (Object.keys(BIOMES) as BiomeId[]).map(k => [k, BIOMES[k].name, BIOMES[k].desc]), () => cfg.biome, v => cfg.biome = v, bDesc),
        seg<MapSizeId>('Tamaño del mundo', (Object.keys(MAP_SIZES) as MapSizeId[]).map(k => [k, MAP_SIZES[k].name]), () => cfg.size, v => cfg.size = v),
        seg<number>('Colonias rivales', [[0, 'Ninguna'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], () => cfg.rivals, v => cfg.rivals = v),
        seg<number>('Dificultad', DIFFICULTIES.map((d, i) => [i, d.name, d.desc] as [number, string, string]), () => cfg.difficulty, v => cfg.difficulty = v, dDesc),
        seg<number>('Fauna', [[0, 'Escasa'], [1, 'Normal'], [2, 'Salvaje']], () => cfg.creatures, v => cfg.creatures = v),
        seg<0 | 1 | 2>('Recursos iniciales', [[0, 'Pocos'], [1, 'Normales'], [2, 'Abundantes']], () => cfg.startRes, v => cfg.startRes = v),
        seg<'conquest' | 'sandbox'>('Modo', [['conquest', '⚔️ Conquista', 'Destruye todas las colonias rivales para ganar.'], ['sandbox', '🌱 Libre', 'Sin condición de victoria: crece y construye a tu ritmo.']], () => cfg.mode, v => cfg.mode = v, h('div', { class: 'hint' })),
        h('div', { class: 'field' }, h('label', {}, 'Semilla del mundo'), h('div', { style: { display: 'flex', gap: '6px' } }, seedIn, h('button', { class: 'btn small', onclick: () => { cfg.seed = Math.floor(Math.random() * 999999); seedIn.value = String(cfg.seed); SFX.click(); } }, '🎲'))),
      )),
    h('div', { class: 'dlg-foot' },
      btn('Volver', '', () => showTitle()),
      btn('🐜  ¡Fundar colonia!', 'primary', () => {
        if (!cfg.playerName.trim()) cfg.playerName = 'Jugadora';
        if (!cfg.colonyName.trim()) cfg.colonyName = 'Colonia sin nombre';
        if (!cfg.queenName.trim()) cfg.queenName = 'Reina ' + rp(QUEENS);
        if (cfg.size === 'small' && cfg.rivals > 3) cfg.rivals = 3;
        ls.set('myrmex.player', cfg.playerName);
        Nav.start(cfg);
      })),
  );
  screens().append(h('div', { class: 'screen' }, dlg));
  requestAnimationFrame(drawPrev);
}

// ---------------- Cargar ----------------
export function showLoad(back: () => void = () => showTitle()) {
  clear();
  const dlg = h('div', { class: 'card dialog' });
  dlg.append(h('button', { class: 'close-x', onclick: () => { SFX.close(); back(); } }, '✕'), h('h2', {}, 'Cargar partida'));
  const list = h('div', { class: 'saves' });
  const render = () => {
    list.innerHTML = '';
    const saves = listSaves();
    if (!saves.length) list.append(h('p', { class: 'lead' }, 'Todavía no hay partidas guardadas.'));
    for (const s of saves) {
      list.append(h('div', { class: 'save-row', onclick: () => { SFX.click(); Nav.load(s.slot); } },
        h('div', { style: { fontSize: '28px' } }, s.over === 1 ? '👑' : s.over === 2 ? '☠️' : '🐜'),
        h('div', {}, h('div', { class: 'nm' }, s.colony + (s.slot === 'auto' ? '  · Autoguardado' : '  · ' + s.slot)), h('div', { class: 'meta' }, `${s.player} · ${BIOMES[s.biome as BiomeId]?.name ?? ''} · Día ${s.day} · ${s.pop} hormigas · Nivel ${s.level} · ${fmtTime(s.played)} · ${new Date(s.date).toLocaleString('es-ES')}`)),
        h('div', { class: 'sp' }),
        h('button', { class: 'btn small danger', onclick: async (e: MouseEvent) => { e.stopPropagation(); if (confirmDelete(s.slot)) { await deleteSave(s.slot); render(); } } }, '🗑')));
    }
  };
  render();
  dlg.append(list);
  screens().append(h('div', { class: 'screen' }, dlg));
}
const pendingDelete = new Set<string>();
function confirmDelete(slot: string) {
  if (pendingDelete.has(slot)) { pendingDelete.delete(slot); return true; }
  pendingDelete.add(slot);
  toast('🗑', 'Pulsa de nuevo para borrar', 'Esta acción no se puede deshacer.', 'bad', undefined, 2500);
  setTimeout(() => pendingDelete.delete(slot), 3000);
  return false;
}

// ---------------- Opciones ----------------
export function showSettings(back: () => void, inGame = false) {
  if (!inGame) clear();
  const host = inGame ? modalHost() : screens();
  const dlg = h('div', { class: 'card dialog', style: { width: 'min(620px, 94vw)' } });
  const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'amb') => {
    const val = h('span', { style: { fontWeight: '900' } }, Math.round(Settings[key] * 100) + '%');
    return h('div', { class: 'slider-row' }, h('span', { style: { fontWeight: '800' } }, label), h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(Settings[key] * 100)), oninput: (e: Event) => { Settings[key] = +(e.target as HTMLInputElement).value / 100; val.textContent = Math.round(Settings[key] * 100) + '%'; applyVolumes(); Settings.save(); } }), val);
  };
  const chk = (label: string, key: 'edgePan' | 'showFps') => h('label', { class: 'toggle', style: { margin: '10px 0' } }, h('input', { type: 'checkbox', checked: Settings[key] ? true : undefined, onchange: (e: Event) => { (Settings as any)[key] = (e.target as HTMLInputElement).checked; Settings.save(); } }), label);
  const q = h('div', { class: 'seg' });
  const rq = () => { q.innerHTML = ''; [[0, 'Rendimiento'], [1, 'Equilibrado'], [2, 'Máxima']].forEach(([v, n]) => q.append(h('button', { class: Settings.quality === v ? 'on' : '', onclick: () => { Settings.quality = v as number; Settings.save(); rq(); window.dispatchEvent(new Event('resize')); } }, n as string))); };
  rq();
  dlg.append(
    h('button', { class: 'close-x', onclick: () => { SFX.close(); close(); } }, '✕'),
    h('h2', {}, 'Opciones'),
    h('h4', { style: { color: '#ffb547' } }, 'SONIDO'), slider('General', 'master'), slider('Música', 'music'), slider('Efectos', 'sfx'), slider('Ambiente', 'amb'),
    h('h4', { style: { color: '#ffb547' } }, 'GRÁFICOS'), h('div', { class: 'field' }, h('label', {}, 'Calidad'), q),
    h('h4', { style: { color: '#ffb547' } }, 'CONTROL'), chk('Mover la cámara al acercar el ratón al borde', 'edgePan'), chk('Mostrar FPS', 'showFps'),
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '16px' } }, btn('Listo', 'primary', () => close())),
  );
  const wrap = inGame ? h('div', { class: 'modal-bg' }, dlg) : h('div', { class: 'screen' }, dlg);
  const close = () => { if (inGame) wrap.remove(); back(); };
  host.append(wrap);
}
function modalHost() { return $('#hud'); }

// ---------------- Ayuda ----------------
const HELP_HTML = `
<h4>🐜 Tu colonia</h4>
<p>Las hormigas tienen vida propia: las <b>obreras</b> salen solas a buscar comida, dejan <b>rastros de feromonas</b> al volver y, poco a poco, forman <b>caminos</b> hacia las mejores fuentes. Tú decides el reparto del trabajo (recolectar, excavar, interior) desde el panel de <b>Colonia</b> <span class="kbd">C</span>.</p>
<p>La <b>Reina</b> pone huevos sin parar si hay comida, plazas de cría y población disponible. Pon castas en la <b>cola de cría</b>: Exploradoras, Cortadoras, Soldados, Lanzaácidos, Colosos y Princesas aladas.</p>
<h4>🕳️ El hormiguero</h4>
<p>Pulsa <span class="kbd">Tab</span> para ver el corte del hormiguero. Usa <b>Excavar</b> <span class="kbd">F</span> para pintar túneles, y <b>Cámaras</b> <span class="kbd">B</span> para colocar Despensas, Guarderías, Dormitorios, Cuarteles, Cámaras de Feromonas… Se excavará un túnel automáticamente hasta ellas.</p>
<p>Al excavar obtienes <b>tierra</b> y, a veces, <b>tesoros</b> (busca los destellos). Decora las cámaras <span class="kbd">V</span> para ganar <b>Prestigio</b>: bonifica todo el trabajo de la colonia.</p>
<h4>🌿 La superficie</h4>
<p>Arrastra para seleccionar · <b>Clic derecho</b> para mover (las militares atacan por el camino), atacar o recolectar · <span class="kbd">Q</span> selecciona el ejército · <span class="kbd">Ctrl</span>+<span class="kbd">1-9</span> crea grupos · <span class="kbd">X</span> detener · <span class="kbd">H</span> volver · <span class="kbd">Shift</span>+clic derecho patrullar.</p>
<p><b>Construye</b> <span class="kbd">B</span> Montículos para expandir tu territorio y acortar los viajes, Garitas ácidas para defenderte y Corrales de pulgones para obtener melaza.</p>
<h4>🧪 Progreso</h4>
<p>Las <b>Cámaras de Feromonas</b> generan Saber para investigar <span class="kbd">R</span> 28 tecnologías. Cumple <b>objetivos</b> y <b>logros</b>, sube de nivel tu colonia y desbloquea decoraciones.</p>
<h4>⚔️ Peligros</h4>
<p>Arañas, ciempiés nocturnos, termitas, mantis gigantes, pájaros… y las <b>colonias rivales</b>, que crecen, se expanden y lanzan incursiones. Destruye la entrada de sus hormigueros para eliminarlas. Si cae tu entrada, la Reina queda expuesta.</p>
<h4>🌐 Cooperativo online</h4>
<p>Desde el menú de pausa, <b>Invitar a una amiga</b> genera un código. Tu compañera lo pega en <b>Unirse a una colonia</b> (menú principal) y te devuelve otro código. Conexión directa entre navegadores: ambas dirigís la misma colonia. <span class="kbd">Enter</span> abre el chat y <span class="kbd">Alt</span>+clic marca un punto en el mapa.</p>
<h4>⌨️ Atajos</h4>
<p><span class="kbd">WASD</span>/<span class="kbd">flechas</span> cámara · <span class="kbd">Rueda</span> zoom · <span class="kbd">Espacio</span> pausa · <span class="kbd">,</span> <span class="kbd">.</span> velocidad · <span class="kbd">P</span> feromonas · <span class="kbd">T</span> territorio · <span class="kbd">L</span> logros · <span class="kbd">E</span> estadísticas · <span class="kbd">F5</span> guardado rápido · <span class="kbd">Esc</span> menú.</p>
<p>La partida se <b>guarda automáticamente</b> cada minuto, al amanecer y al cerrar la página.</p>`;
export function showHelpScreen(back: () => void) {
  clear();
  const dlg = h('div', { class: 'card dialog' }, h('button', { class: 'close-x', onclick: () => back() }, '✕'), h('h2', {}, 'Cómo jugar'), h('div', { class: 'help', html: HELP_HTML }));
  screens().append(h('div', { class: 'screen' }, dlg));
}
export function openHelp() {
  const wrap = h('div', { class: 'modal-bg', onclick: (e: MouseEvent) => { if (e.target === wrap) { wrap.remove(); UI.modalOpen = false; } } });
  const dlg = h('div', { class: 'card dialog' }, h('button', { class: 'close-x', onclick: () => { wrap.remove(); UI.modalOpen = false; } }, '✕'), h('h2', {}, 'Cómo jugar'), h('div', { class: 'help', html: HELP_HTML }));
  wrap.append(dlg);
  UI.modalOpen = true;
  modalHost().append(wrap);
}
function showCredits() {
  clear();
  const dlg = h('div', { class: 'card dialog', style: { width: 'min(640px, 94vw)', textAlign: 'center' } },
    h('button', { class: 'close-x', onclick: () => showTitle() }, '✕'),
    h('h2', {}, 'MYRMEX'),
    h('p', { class: 'lead' }, 'Imperio bajo la hierba'),
    h('p', {}, 'Diseño, programación, arte procedural, música generativa y efectos de sonido sintetizados creados íntegramente para este juego.'),
    h('p', { class: 'hint' }, 'Todo el contenido visual y sonoro se genera en tiempo real con Canvas 2D y Web Audio, sin imágenes ni sonidos de terceros.'),
    h('p', { class: 'hint' }, 'Tipografías: Nunito (Vernon Adams y otros) y Fraunces (Undercase Type), con licencia SIL Open Font License 1.1, servidas por Google Fonts.'),
    h('p', { class: 'hint' }, 'Código publicado con licencia MIT.'),
    h('p', { class: 'hint' }, 'Inspirado por la extraordinaria vida de las hormigas: feromonas, castas, cultivo de hongos, pastoreo de pulgones y vuelos nupciales.'),
    h('p', { style: { marginTop: '20px' } }, btn('Volver', 'primary', () => showTitle())));
  screens().append(h('div', { class: 'screen' }, dlg));
}

// ---------------- Intro de partida ----------------
const BIOME_ART: Record<string, string> = { meadow: 'la pradera', forest: 'el bosque', garden: 'el jardín seco' };
export function showIntro(onGo: () => void) {
  const S = G.S;
  clear();
  const dlg = h('div', { class: 'card dialog', style: { width: 'min(640px, 94vw)', textAlign: 'center' } },
    h('div', { style: { fontSize: '54px' } }, EMBLEMS[S.cfg.emblem]),
    h('h2', {}, S.cfg.colonyName),
    h('p', { class: 'lead', html: `Tras el vuelo nupcial, <b>${escHtml(S.cfg.queenName)}</b> se ha enterrado en ${BIOME_ART[S.cfg.biome] ?? BIOMES[S.cfg.biome].name.toLowerCase()}. Sus primeras hijas ya exploran la hierba.<br><br>${S.cfg.rivals ? `<b style="color:#ff8a7a">${S.cfg.rivals} colonia${S.cfg.rivals > 1 ? 's' : ''} rival${S.cfg.rivals > 1 ? 'es' : ''}</b> acechan en algún lugar del mapa.` : 'No hay rivales: el mundo es tuyo.'}` }),
    h('p', { class: 'hint' }, 'Consejo: sigue los objetivos de la izquierda. Pulsa Tab para ver tu hormiguero.'),
    h('div', { style: { marginTop: '14px' } }, btn('🌱  Comenzar', 'primary', () => { clear(); onGo(); })));
  screens().append(h('div', { class: 'screen', style: { background: 'rgba(5,4,3,0.55)' } }, dlg));
}

// ---------------- Pausa ----------------
export function openPauseMenu() {
  const S = G.S;
  if (document.getElementById('pause')) return;
  const wasPaused = S.paused;
  S.paused = true;
  hideTip();
  UI.modalOpen = true;
  const wrap = h('div', { class: 'modal-bg', id: 'pause' });
  const close = () => { wrap.remove(); S.paused = wasPaused; UI.modalOpen = false; };
  const slotIn = h('input', { type: 'text', value: S.slot !== 'auto' ? S.slot : 'Partida ' + new Date().toLocaleDateString('es-ES'), maxlength: '30' }) as HTMLInputElement;
  const dlg = h('div', { class: 'card dialog', style: { width: 'min(460px, 94vw)', textAlign: 'center' } },
    h('h2', {}, '⏸ Pausa'),
    h('p', { class: 'lead' }, `${S.cfg.colonyName} · Día ${dayNumber()} · ${CC[0]?.total ?? 0} hormigas`),
    h('div', { class: 'menu-col', style: { minWidth: '0', animation: 'none' } },
      btn('▶  Reanudar', 'primary', close),
      h('div', { style: { display: 'flex', gap: '6px' } }, slotIn, btn('💾 Guardar', '', async () => { const ok = await saveGame(slotIn.value.trim() || 'manual'); toast(ok ? '💾' : '⚠️', ok ? 'Guardado en «' + slotIn.value + '»' : 'Error al guardar', '', ok ? 'info' : 'bad'); })),
      btn('📂  Cargar partida', '', () => { close(); S.paused = true; showLoadInGame(); }),
      NET.role === 'guest' ? null : btn(NET.connected ? '🌐  Cooperativo activo' : '🌐  Invitar a una amiga', '', () => { if (!NET.connected) { close(); openHostDialog(); } }),
      btn('⚙️  Opciones', '', () => { showSettings(() => { /* */ }, true); }),
      btn('❓  Cómo jugar', '', () => openHelp()),
      btn(NET.role === 'guest' ? '🏠  Salir de la colonia' : '🏠  Guardar y salir al menú', 'danger', async () => { if (NET.role !== 'guest') await saveGame(); closeNet(); wrap.remove(); UI.modalOpen = false; Nav.menu(); }),
    ));
  wrap.append(dlg);
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  (wrap as any)._close = close;
  modalHost().append(wrap);
}
export function closePause(): boolean { const p = document.getElementById('pause') as any; if (p) { p._close(); return true; } return false; }
function showLoadInGame() {
  const wrap = h('div', { class: 'modal-bg' });
  const dlg = h('div', { class: 'card dialog' }, h('button', { class: 'close-x', onclick: () => { wrap.remove(); G.S.paused = false; UI.modalOpen = false; } }, '✕'), h('h2', {}, 'Cargar partida'));
  const list = h('div', { class: 'saves' });
  for (const s of listSaves()) list.append(h('div', { class: 'save-row', onclick: () => { wrap.remove(); UI.modalOpen = false; Nav.load(s.slot); } }, h('div', { style: { fontSize: '26px' } }, '🐜'), h('div', {}, h('div', { class: 'nm' }, s.colony + ' · ' + s.slot), h('div', { class: 'meta' }, `Día ${s.day} · ${s.pop} hormigas · ${new Date(s.date).toLocaleString('es-ES')}`))));
  dlg.append(list); wrap.append(dlg);
  UI.modalOpen = true;
  modalHost().append(wrap);
}

// ---------------- Final ----------------
export function showEnd(victory: boolean) {
  const S = G.S;
  if (victory && S.victoryShown) return;
  if (victory) S.victoryShown = true;
  S.paused = true;
  const st = S.stats;
  const wrap = h('div', { class: 'modal-bg' });
  const dlg = h('div', { class: 'card dialog endscreen', style: { width: 'min(640px, 94vw)' } },
    h('div', { style: { fontSize: '64px' } }, victory ? '👑' : '☠️'),
    h('h1', { class: 'big', style: { color: victory ? '#ffd27a' : '#ff8a7a' } }, victory ? '¡Victoria!' : 'La Reina ha caído'),
    h('p', { class: 'lead' }, victory ? `${S.cfg.colonyName} reina sobre toda la hierba. ${S.cfg.queenName} será recordada durante mil generaciones.` : `${S.cfg.colonyName} ha sido derrotada en el día ${dayNumber()}. Pero las colonias siempre renacen…`),
    h('div', { class: 'statgrid', style: { gridTemplateColumns: 'repeat(3,1fr)', margin: '16px 0' }, html: [['Tiempo', fmtTime(S.time)], ['Población máx.', st.maxPop], ['Comida', Math.floor(st.gathered.food)], ['Enemigos abatidos', st.antKills], ['Colonias destruidas', st.coloniesDestroyed], ['Nivel', S.colonies[0].level]].map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('') }),
    h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } },
      victory ? btn('🌱 Seguir jugando', 'primary', () => { wrap.remove(); S.paused = false; UI.modalOpen = false; }) : btn('📂 Cargar partida', 'primary', () => { wrap.remove(); UI.modalOpen = false; showLoadInGame(); }),
      btn('🏠 Menú principal', '', async () => { await saveGame(); wrap.remove(); UI.modalOpen = false; Nav.menu(); })));
  wrap.append(dlg);
  UI.modalOpen = true;
  modalHost().append(wrap);
}
