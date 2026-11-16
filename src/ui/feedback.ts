// Conecta los eventos de la simulación con efectos visuales, sonido y notificaciones.
import { on } from '../core/bus';
import { CASTES, COLONY_COLORS, CREATURES, RES_INFO, TECH_BY_ID, BUILDINGS } from '../game/defs';
import { G, NTS } from '../game/state';
import { SFX, setMusicMood } from '../audio/audio';
import { PK, burst, floatText, gainText, ring, spawn } from '../render/particles';
import { banner, confetti, toast } from './dom';
import { UI, flash, shake } from './uistate';
import { APP, jumpTo, worldToScreen } from './camera';
import { bumpRes, refreshHUD } from './hud';
import { showEnd } from './menus';
import { isVisibleWorld } from '../render/surface';
import { isNight, WEATHER_ICON, WEATHER_NAME } from '../game/time';
import { saveGame } from '../game/save';

export const FX = { on: false };
let tension = 0, lastLost = 0, lastStructHit = 0, lastQueenHit = 0;

function inView(layer: number, x: number, y: number) {
  const S = G.S;
  if ((layer === 0) !== (S.view === 'surface')) return false;
  const p = worldToScreen(x, y);
  return p.x > -50 && p.y > -50 && p.x < APP.w + 50 && p.y < APP.h + 50;
}

export function initFeedback() {
  on('gain', d => {
    if (!FX.on) return;
    const info = RES_INFO[d.k as keyof typeof RES_INFO];
    if (d.amt > 0) {
      bumpRes(d.k);
      if (inView(d.layer, d.x, d.y)) {
        gainText(d.layer, d.x, d.y - 6, d.amt, info.icon, info.color);
        SFX.gain(d.k);
        if (Math.random() < 0.5) spawn(d.layer, d.x, d.y - 4, PK.Star, info.color, { vy: -30, life: 0.6, size: 3, vr: 5 });
      }
    }
    if (d.lost > 0.5 && performance.now() - lastLost > 20000) {
      lastLost = performance.now();
      toast('📦', '¡Almacén lleno!', `Se pierde ${info.name.toLowerCase()}. Excava o mejora una Despensa.`, 'bad');
      SFX.lost();
    }
  });
  on('pick', d => { if (FX.on && inView(0, d.x, d.y) && G.S.cam.sz > 1.1) SFX.pick(); });
  on('digTick', d => { if (!FX.on || G.S.view !== 'nest') return; burst(1, d.x, d.y, 2, PK.Dirt, ['#8a5a30', '#6a4024', '#a87a4c'], 40, { grav: 160, life: 0.5, size: 1.6 }); SFX.dig(); });
  on('dug', d => { if (!FX.on || G.S.view !== 'nest') return; burst(1, d.x, d.y, 6, PK.Dirt, ['#8a5a30', '#6a4024', '#c49a6a'], 70, { grav: 200, life: 0.6, size: 2 }); SFX.dug(); if (Math.random() < 0.3) gainText(1, d.x, d.y, 1, '🟫', '#c58b55'); });
  on('treasure', d => {
    if (!FX.on) return;
    const info = RES_INFO[d.k as keyof typeof RES_INFO];
    burst(1, d.x, d.y, 26, PK.Star, ['#fff6c0', info.color, '#ffffff'], 120, { life: 1.1, size: 4 });
    ring(1, d.x, d.y, info.color, 40, 0.8);
    floatText(1, d.x, d.y - 18, '✦ ' + d.name + ' ✦', '#fff2c0', 15, 2);
    SFX.treasure();
    toast('💎', d.name + ' encontrado', `+${d.amt} ${info.icon} ${info.name}`, 'good', () => jumpTo(d.x, d.y, 'nest'));
  });
  on('chamberPlaced', d => {
    if (!FX.on) return;
    SFX.place();
    const x = (d.c.cx + 0.5) * NTS, y = (d.c.cy + 0.5) * NTS;
    ring(1, x, y, '#ffd27a', d.c.rx * NTS, 0.6);
    burst(1, x, y, 14, PK.Dirt, ['#8a5a30', '#c49a6a'], 90, { grav: 200 });
  });
  on('chamberDone', d => {
    if (!FX.on) return;
    const x = (d.c.cx + 0.5) * NTS, y = (d.c.cy + 0.5) * NTS;
    ring(1, x, y, '#fff2b0', d.c.rx * NTS * 1.4, 0.9);
    burst(1, x, y, 40, PK.Confetti, ['#ffd27a', '#ff8f1f', '#79e38a', '#7fc8ff', '#ff6fa8'], 160, { grav: 120, life: 1.4, size: 4, drag: 0.95 });
    burst(1, x, y, 20, PK.Star, ['#fff6c0', '#ffd27a'], 90, { life: 1, size: 4 });
    SFX.complete();
    toast('🏗️', d.name + ' completada', 'Una nueva cámara está lista para trabajar.', 'good', () => jumpTo(x, y, 'nest'));
    shake(2);
  });
  on('chamberUpgraded', d => {
    if (!FX.on) return;
    const x = (d.c.cx + 0.5) * NTS, y = (d.c.cy + 0.5) * NTS;
    burst(1, x, y, 30, PK.Star, ['#fff6c0', '#ffd27a', '#ffb347'], 130, { life: 1.2, size: 4 });
    ring(1, x, y, '#ffd27a', d.c.rx * NTS * 1.5, 1);
    SFX.complete();
    floatText(1, x, y - d.c.ry * NTS, '¡NIVEL ' + d.c.level + '!', '#ffe9a8', 18, 2);
  });
  on('decorPlaced', d => {
    if (!FX.on) return;
    const x = d.x * NTS, y = d.y * NTS;
    burst(1, x, y - 6, 16, PK.Star, ['#fff6c0', '#ffb3e0', '#b3e6ff'], 70, { life: 0.9, size: 3 });
    SFX.place(); SFX.coinBig();
    floatText(1, x, y - 18, '+✨ Belleza', '#ffd6f0', 13);
  });
  on('egg', d => { if (!FX.on || G.S.view !== 'nest') return; spawn(1, d.x, d.y, PK.Glow, '#fff6d8', { size: 14, life: 0.8 }); SFX.egg(); });
  on('broodStage', d => { if (!FX.on || G.S.view !== 'nest') return; burst(1, d.b.x, d.b.y, 4, PK.Star, ['#fff6d8'], 30, { life: 0.5, size: 2 }); });
  on('hatch', d => {
    if (!FX.on) return;
    if (inView(d.layer, d.x, d.y)) {
      ring(d.layer, d.x, d.y, '#fff2c0', 18, 0.6);
      burst(d.layer, d.x, d.y, 10, PK.Star, ['#fff6c0', '#ffe08a'], 60, { life: 0.7, size: 2.5 });
      SFX.hatch();
      if (d.caste !== 'worker') floatText(d.layer, d.x, d.y - 12, '¡' + CASTES[d.caste as keyof typeof CASTES].name + '!', '#ffe9a8', 13);
    }
    if (d.caste === 'princess') { toast('👑', '¡Ha nacido una princesa!', 'Selecciónala y haz clic derecho sobre un Montículo para fundar un nido satélite.', 'good'); SFX.levelup(); }
  });
  on('hit', d => {
    if (!FX.on) return;
    if (d.layer === 0 && !isVisibleWorld(d.x, d.y)) return;
    if (!inView(d.layer, d.x, d.y)) return;
    burst(d.layer, d.x, d.y, 3, PK.Spark, d.victimCol === 0 ? ['#ff8a7a', '#fff'] : ['#ffe08a', '#fff'], 90, { life: 0.25, size: 1.5 });
    if (d.dmg >= 6) floatText(d.layer, d.x + (Math.random() - 0.5) * 8, d.y - 8, Math.round(d.dmg).toString(), d.victimCol === 0 ? '#ff8a7a' : '#fff0c0', 10, 0.7);
    if (d.tk === 2) burst(0, d.x, d.y, 4, PK.Dirt, ['#8a5a30', '#c49a6a'], 60, { grav: 150 });
    SFX.bite();
  });
  on('death', d => {
    if (!FX.on) return;
    if (d.layer === 0 && !isVisibleWorld(d.x, d.y)) return;
    if (!inView(d.layer, d.x, d.y)) return;
    if (d.ant) {
      const c = COLONY_COLORS[G.S.colonies[d.col]?.color ?? 0];
      burst(d.layer, d.x, d.y, 8, PK.Dot, [c.body, c.light, '#3a2a1a'], 50, { life: 0.6, size: 2 });
      SFX.death();
    } else {
      const def = CREATURES[d.type as keyof typeof CREATURES];
      burst(0, d.x, d.y, 22, PK.Dot, ['#7a5a3a', '#e8c890', '#4a3a26'], 90, { life: 0.9, size: 2.5 });
      ring(0, d.x, d.y, '#ffe08a', def.size * 1.5, 0.7);
      if (d.killerCol === 0) {
        SFX.bigDeath();
        floatText(0, d.x, d.y - def.size, '¡' + def.name + ' cazado!', '#ffe9a8', 14, 1.8);
        if (d.boss) { banner('¡JEFE DERROTADO!', def.name, ''); shake(8); confetti(APP.w / 2, APP.h * 0.3, 80); }
      } else SFX.death();
    }
  });
  on('levelup', d => {
    if (!FX.on) return;
    banner('¡NIVEL ' + d.level + '!', `Colonia ${G.S.cfg.colonyName} · +${d.reward.food} 🍯 +${d.reward.amber} 💎`);
    SFX.levelup();
    confetti(APP.w / 2, APP.h * 0.3, 70);
    flash('#ffd27a', 0.4);
    refreshHUD(true);
  });
  on('quest', d => {
    if (!FX.on) return;
    const r = Object.entries(d.q.reward).map(([k, v]) => `+${v} ${RES_INFO[k as keyof typeof RES_INFO].icon}`).join('  ');
    toast('✅', 'Objetivo cumplido: ' + d.q.title, r + `  +${d.q.xp} XP`, 'quest');
    SFX.quest();
    const el = document.querySelector('.quests');
    if (el) { const rr = el.getBoundingClientRect(); confetti(rr.left + rr.width / 2, rr.top + 40, 30); }
    refreshHUD(true);
  });
  on('achievement', d => { if (!FX.on) return; toast(d.a.icon, 'Logro: ' + d.a.name, d.a.desc, 'ach', undefined, 6000); SFX.achievement(); });
  on('research', d => {
    if (!FX.on) return;
    const t = TECH_BY_ID[d.id];
    banner(t.icon + ' ' + t.name, '¡Investigación completada!', 'cool');
    SFX.research(); SFX.complete();
    toast('🧪', t.name, t.desc, 'info');
    refreshHUD(true);
  });
  on('researchStart', () => { if (FX.on) SFX.research(); });
  on('discover', d => {
    if (!FX.on) return;
    if (d.kind === 'zone') { banner('🗺️ ' + d.name, 'Nueva zona descubierta · +2 💎', 'cool'); toast('🧭', 'Zona descubierta', d.name, 'info', () => jumpTo(d.x, d.y)); }
    else { banner('★ ' + d.name, '¡Un lugar legendario!', ''); toast('★', 'Lugar legendario: ' + d.name, 'Una fuente enorme de recursos. ¡Envía a tus recolectoras!', 'good', () => jumpTo(d.x, d.y)); confetti(APP.w / 2, APP.h * 0.3, 40); }
    SFX.discover();
    ring(0, d.x, d.y, '#8fd3ff', 120, 1.2);
  });
  on('worldEvent', d => {
    if (!FX.on) return;
    const def = d.def;
    toast(def.icon, def.name, def.desc, def.good ? 'good' : 'bad', d.e.x ? () => jumpTo(d.e.x, d.e.y) : undefined, 7000);
    banner(def.icon + ' ' + def.name, '', def.good ? '' : 'bad');
    if (def.good) SFX.event(); else SFX.alarm();
    if (def.id === 'bird') SFX.bird();
    if (def.id === 'quake') { shake(14); SFX.thunder(); }
  });
  on('raid', d => {
    if (!FX.on) return;
    toast('⚔️', `¡${d.col.name} ataca!`, `${d.n} guerreras marchan hacia tu territorio.`, 'bad', () => jumpTo(d.sx, d.sy), 8000);
    banner('¡INCURSIÓN!', d.col.name + ' marcha hacia ti', 'bad');
    SFX.alarm();
    tension = 1;
  });
  on('placed', d => { if (!FX.on) return; SFX.place(); ring(0, d.s.x, d.s.y, '#ffd27a', 30, 0.5); });
  on('built', d => {
    if (!FX.on || d.s.col !== 0) return;
    SFX.complete();
    ring(0, d.s.x, d.s.y, '#fff2b0', 60, 0.8);
    burst(0, d.s.x, d.s.y, 30, PK.Confetti, ['#ffd27a', '#ff8f1f', '#79e38a', '#7fc8ff'], 140, { grav: 100, life: 1.2, size: 4, drag: 0.95 });
    toast(BUILDINGS[d.s.type as keyof typeof BUILDINGS].icon, BUILDINGS[d.s.type as keyof typeof BUILDINGS].name + ' terminado', 'Tu territorio crece.', 'good', () => jumpTo(d.s.x, d.s.y));
  });
  on('buildTick', d => { if (!FX.on || !inView(0, d.x, d.y)) return; burst(0, d.x, d.y, 2, PK.Dirt, ['#8a5a30', '#c49a6a'], 40, { grav: 120, life: 0.4 }); });
  on('structHit', d => {
    if (!FX.on) return;
    if (performance.now() - lastStructHit > 12000) {
      lastStructHit = performance.now();
      toast('🛡️', '¡Atacan tu ' + BUILDINGS[d.s.type as keyof typeof BUILDINGS].name.toLowerCase() + '!', 'Envía a tus soldados a defender.', 'bad', () => jumpTo(d.s.x, d.s.y));
      SFX.warn();
    }
    tension = 1;
  });
  on('structDestroyed', d => {
    if (!FX.on) return;
    burst(0, d.s.x, d.s.y, 40, PK.Dirt, ['#8a5a30', '#6a4024', '#c49a6a'], 140, { grav: 150, life: 1 });
    burst(0, d.s.x, d.s.y, 10, PK.Smoke, ['#6a5a4a'], 30, { life: 1.4, size: 10 });
    shake(5);
    if (d.s.col === 0) { toast('💥', BUILDINGS[d.s.type as keyof typeof BUILDINGS].name + ' destruido', '', 'bad'); SFX.bigDeath(); }
  });
  on('nestBreached', () => { if (!FX.on) return; banner('¡ENTRADA DERRUIDA!', 'La Reina está en peligro', 'bad'); SFX.alarm(); flash('#ff3b30', 0.6); shake(10); });
  on('queenHit', () => { if (!FX.on) return; if (performance.now() - lastQueenHit > 3000) { lastQueenHit = performance.now(); flash('#ff3b30', 0.35); toast('♛', '¡La Reina está siendo atacada!', 'Defiende la entrada del hormiguero.', 'bad'); } });
  on('colonyDestroyed', d => {
    if (!FX.on) return;
    if (d.by === 0) { banner('¡IMPERIO CAÍDO!', d.col.name + ' ha sido destruida · +60 💎 +300 🍯', ''); confetti(APP.w / 2, APP.h * 0.3, 120); SFX.levelup(); shake(12); }
    else toast('☠️', d.col.name + ' ha caído', 'Otra colonia ha sido destruida.', 'info');
    burst(0, d.x, d.y, 60, PK.Dirt, ['#8a5a30', '#6a4024'], 200, { grav: 150, life: 1.4 });
  });
  on('satellite', d => { if (!FX.on) return; banner('👑 Nueva dinastía', 'Un nido satélite ha sido fundado', ''); SFX.levelup(); ring(0, d.s.x, d.s.y, '#ffd27a', 120, 1.2); confetti(APP.w / 2, APP.h * 0.3, 60); });
  on('royalGuard', d => { if (!FX.on) return; banner('👑 ¡Guardia Real!', 'La Reina despierta a sus defensoras de élite', ''); SFX.levelup(); ring(0, d.x, d.y, '#ffd27a', 140, 1.2); });
  on('alarm', () => { tension = Math.max(tension, 0.8); });
  on('emergency', d => { if (!FX.on) return; toast('🛡️', d.col.name + ' se defiende', '¡Su reina ha despertado a la guardia de élite!', 'bad', () => jumpTo(d.x, d.y)); ring(0, d.x, d.y, '#ff5b4f', 120, 1); tension = 1; });
  on('shoot', d => { if (FX.on && inView(0, d.x, d.y)) SFX.shoot(); });
  on('splash', d => { if (FX.on && inView(0, d.x, d.y)) { SFX.splash(); burst(0, d.x, d.y, 6, PK.Drop, ['#b9ff5a', '#7fe03a'], 50, { life: 0.4, size: 1.5, grav: 100 }); } });
  on('thunder', () => { if (FX.on) { SFX.thunder(); shake(3); } });
  on('weather', d => { if (FX.on) toast(WEATHER_ICON[d.kind], WEATHER_NAME[d.kind], d.kind === 'rain' ? 'Las feromonas se borran antes y aparecerán setas.' : d.kind === 'storm' ? 'Las hormigas se mueven más despacio.' : d.kind === 'heat' ? 'Los arbustos dejan de dar fruto.' : 'La visibilidad se reduce.', 'info'); });
  on('nightfall', d => { if (FX.on) toast('🌙', 'Cae la noche', `Día ${d.day}. Los ciempiés salen a cazar.`, 'info'); });
  on('dawn', d => { if (FX.on) { toast('🌅', 'Amanece el día ' + d.day, 'La colonia despierta.', 'info'); saveGame(); } });
  on('rankup', d => { if (!FX.on) return; burst(0, d.x, d.y, 12, PK.Star, ['#ffd24a', '#fff'], 60, { life: 0.8, size: 3 }); floatText(0, d.x, d.y - 14, '¡Rango ' + d.rank + '!', '#ffd24a', 13); SFX.quest(); });
  on('error', d => { if (!FX.on) return; toast('⚠️', d.text, '', 'bad', undefined, 2200); SFX.error(); });
  on('stored', d => { if (FX.on && G.S.view === 'nest') spawn(1, d.x, d.y, PK.Glow, '#ffd27a', { size: 10, life: 0.5 }); });
  on('bossSpawn', d => { if (FX.on) toast('☠️', d.c.name + ' ha aparecido', 'Un enemigo formidable acecha.', 'bad', () => jumpTo(d.c.x, d.c.y)); });
  on('queued', () => { if (FX.on) SFX.click(); });
  on('rally', d => { if (FX.on) { SFX.click(); ring(0, d.x, d.y, '#7fd3ff', 20, 0.5); } });
  on('demolish', d => { if (FX.on) { burst(d.layer, d.x, d.y, 20, PK.Dirt, ['#8a5a30', '#c49a6a'], 100, { grav: 150 }); SFX.dug(); } });
  on('victory', () => { if (!FX.on) return; showEnd(true); SFX.levelup(); confetti(APP.w / 2, APP.h * 0.4, 160); });
  on('defeat', () => { if (!FX.on) return; showEnd(false); SFX.alarm(); });
}

/** Música adaptativa: tensión según amenazas cercanas */
export function updateTension(dt: number) {
  const S = G.S;
  tension = Math.max(0, tension - dt * 0.05);
  let threat = 0;
  if (S.tick % 30 === 0) {
    const mine = S.structures.filter(s => s.col === 0);
    for (const a of S.ants) {
      if (a.col === 0 || a.layer !== 0 || !CASTES[a.caste].military) continue;
      for (const s of mine) if ((a.x - s.x) ** 2 + (a.y - s.y) ** 2 < 450 * 450) { threat++; break; }
      if (threat > 3) break;
    }
    if (threat > 3) tension = Math.max(tension, 1);
  }
  setMusicMood(tension, isNight());
  void UI;
}
