// Ciclo día/noche y clima.
import { G } from './state';
import { emit } from '../core/bus';
import { clamp } from '../core/util';

export const DAY_LEN = 420;
export const dayPhase = () => ((G.S.time + DAY_LEN * 0.12) % DAY_LEN) / DAY_LEN;
export const dayNumber = () => Math.floor((G.S.time + DAY_LEN * 0.12) / DAY_LEN) + 1;
export function isNight() { const p = dayPhase(); return p > 0.74 && p < 0.97; }
/** 1 = pleno día, ~0.3 = noche */
export function lightLevel(): number {
  const p = dayPhase();
  if (p < 0.66) return 1;
  if (p < 0.76) return 1 - ((p - 0.66) / 0.1) * 0.68;
  if (p < 0.94) return 0.32;
  return 0.32 + ((p - 0.94) / 0.06) * 0.68;
}
/** 0..1 cuánto atardecer (tinte cálido) */
export function duskLevel(): number {
  const p = dayPhase();
  if (p > 0.6 && p < 0.78) return clamp(1 - Math.abs(p - 0.7) / 0.08, 0, 1);
  if (p > 0.93) return clamp(1 - Math.abs(p - 0.975) / 0.04, 0, 1) * 0.7;
  return 0;
}

let wasNight = false;
export function updateTime(dt: number) {
  const S = G.S;
  const n = isNight();
  if (n !== wasNight) { wasNight = n; emit(n ? 'nightfall' : 'dawn', { day: dayNumber() }); }
  const w = S.weather;
  w.t += dt;
  if (w.kind !== 'clear') {
    if (w.t >= w.dur) { const old = w.kind; w.kind = 'clear'; w.t = 0; w.next = 150 + Math.random() * 200; emit('weatherEnd', { kind: old }); }
  } else {
    w.next -= dt;
    if (w.next <= 0) {
      const r = Math.random();
      w.kind = r < 0.42 ? 'rain' : r < 0.55 ? 'storm' : r < 0.78 ? 'heat' : 'fog';
      w.t = 0; w.dur = 60 + Math.random() * 90;
      emit('weather', { kind: w.kind });
    }
  }
}
export function initWeatherClock() { wasNight = isNight(); }
export const WEATHER_NAME: Record<string, string> = { clear: 'Despejado', rain: 'Lluvia', storm: 'Tormenta', heat: 'Ola de calor', fog: 'Niebla' };
export const WEATHER_ICON: Record<string, string> = { clear: '☀️', rain: '🌧️', storm: '⛈️', heat: '🔥', fog: '🌫️' };
