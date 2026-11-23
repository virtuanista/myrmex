// Utilidades matemáticas, RNG determinista y ruido.

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** RNG mulberry32 determinista */
export class RNG {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
}

/** RNG global no determinista para efectos visuales */
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const rndi = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise 2D suavizado con fbm */
export class Noise {
  seed: number;
  constructor(seed: number) { this.seed = seed; }
  v(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), w = smooth(yf);
    const a = hash2(xi, yi, this.seed), b = hash2(xi + 1, yi, this.seed);
    const c = hash2(xi, yi + 1, this.seed), d = hash2(xi + 1, yi + 1, this.seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  }
  fbm(x: number, y: number, oct = 4): number {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += this.v(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return s / norm;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (f >= 0) return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
}
export function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return Math.floor(n).toString();
}
export function fmtTime(sec: number): string {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + 'h ' : '') + m.toString().padStart(h ? 2 : 1, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
}

/** Typed array <-> base64 */
export function u8ToB64(u8: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)));
  return btoa(s);
}
export function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/** «Reina X» sin duplicar el título si el nombre ya lo lleva. */
export const queenTitle = (n: string) => (/^reina(\s|$)/i.test(n.trim()) ? n.trim() : 'Reina ' + n.trim());
/** Escapa texto para insertarlo en HTML. */
export const escHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
