// Cámara: conversión de coordenadas y límites.
import { G, NTS, TS } from '../game/state';
import { WORLD } from '../game/world';
import { clamp } from '../core/util';

export const APP = { mode: 'menu' as 'menu' | 'game', canvas: null as unknown as HTMLCanvasElement, dpr: 1, w: 0, h: 0 };

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const S = G.S;
  if (S.view === 'surface') return { x: S.cam.sx + (sx - APP.w / 2) / S.cam.sz, y: S.cam.sy + (sy - APP.h / 2) / S.cam.sz };
  return { x: S.cam.nx + (sx - APP.w / 2) / S.cam.nz, y: S.cam.ny + (sy - APP.h / 2) / S.cam.nz };
}
export function worldToScreen(x: number, y: number) {
  const S = G.S;
  if (S.view === 'surface') return { x: (x - S.cam.sx) * S.cam.sz + APP.w / 2, y: (y - S.cam.sy) * S.cam.sz + APP.h / 2 };
  return { x: (x - S.cam.nx) * S.cam.nz + APP.w / 2, y: (y - S.cam.ny) * S.cam.nz + APP.h / 2 };
}
export function clampCam() {
  const S = G.S;
  const W = WORLD.W;
  S.cam.sz = clamp(S.cam.sz, 0.3, 3.6);
  const mw = W.w * TS, mh = W.h * TS;
  S.cam.sx = clamp(S.cam.sx, 0, mw); S.cam.sy = clamp(S.cam.sy, 0, mh);
  S.cam.nz = clamp(S.cam.nz, 0.45, 3.2);
  S.cam.nx = clamp(S.cam.nx, 0, S.nest.W * NTS); S.cam.ny = clamp(S.cam.ny, -60, S.nest.H * NTS);
}
let tween: { x: number; y: number; t: number; sx: number; sy: number; view: 'surface' | 'nest' } | null = null;
export function jumpTo(x: number, y: number, view: 'surface' | 'nest' = 'surface') {
  const S = G.S;
  if (S.view !== view) S.view = view;
  tween = { x, y, t: 0, sx: view === 'surface' ? S.cam.sx : S.cam.nx, sy: view === 'surface' ? S.cam.sy : S.cam.ny, view };
}
export function updateCamTween(dt: number) {
  if (!tween) return;
  const S = G.S;
  tween.t = Math.min(1, tween.t + dt * 2.2);
  const k = 1 - Math.pow(1 - tween.t, 3);
  const x = tween.sx + (tween.x - tween.sx) * k, y = tween.sy + (tween.y - tween.sy) * k;
  if (tween.view === 'surface') { S.cam.sx = x; S.cam.sy = y; } else { S.cam.nx = x; S.cam.ny = y; }
  if (tween.t >= 1) tween = null;
}
export function cancelTween() { tween = null; }
