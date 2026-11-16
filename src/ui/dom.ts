// Utilidades DOM: creación de elementos, tooltips, notificaciones, banners y confeti.
import { Cost, RES_INFO, ResKey } from '../game/defs';
import { SFX } from '../audio/audio';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'tip') bindTip(el, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

// ------------------ Tooltip ------------------
const tip = () => document.getElementById('tooltip')!;
let tipFn: (() => string) | null = null;
export function bindTip(el: HTMLElement, content: string | (() => string)) {
  el.addEventListener('mouseenter', e => { tipFn = typeof content === 'string' ? () => content : content; showTip(e as MouseEvent); });
  el.addEventListener('mousemove', e => showTip(e as MouseEvent));
  el.addEventListener('mouseleave', () => { tipFn = null; tip().classList.add('hidden'); });
}
function showTip(e: MouseEvent) {
  if (!tipFn) return;
  const t = tip();
  t.innerHTML = tipFn();
  t.classList.remove('hidden');
  const r = t.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 16;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 12;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
export function hideTip() { tipFn = null; tip().classList.add('hidden'); }
export function showWorldTip(x: number, y: number, html: string) {
  const t = tip();
  if (!html) { if (!tipFn) t.classList.add('hidden'); return; }
  if (tipFn) return;
  t.innerHTML = html;
  t.classList.remove('hidden');
  const r = t.getBoundingClientRect();
  let px = x + 16, py = y + 18;
  if (px + r.width > innerWidth - 8) px = x - r.width - 16;
  if (py + r.height > innerHeight - 8) py = y - r.height - 12;
  t.style.left = px + 'px'; t.style.top = py + 'px';
}

export function costHTML(cost: Cost, res?: Record<string, number>): string {
  return Object.entries(cost).filter(([, v]) => v).map(([k, v]) => {
    const ok = !res || res[k] >= (v as number);
    return `<span class="${ok ? '' : 'no'}">${RES_INFO[k as ResKey].icon}${v}</span>`;
  }).join(' ');
}
export function costEl(cost: Cost, res?: Record<string, number>) { return h('span', { class: 'cost', html: costHTML(cost, res) }); }

// ------------------ Toasts ------------------
let toastBox: HTMLElement | null = null;
export function setToastBox(el: HTMLElement) { toastBox = el; }
export function toast(icon: string, title: string, text = '', kind = 'info', onClick?: () => void, dur = 4500) {
  if (!toastBox) return;
  while (toastBox.children.length > 3) toastBox.firstElementChild!.remove();
  const el = h('div', { class: 'toast ' + kind + (onClick ? ' click' : '') },
    h('div', { class: 'ti' }, icon),
    h('div', {}, h('div', { class: 'tt' }, title), text ? h('div', { class: 'tx' }, text) : null));
  if (onClick) el.addEventListener('click', () => { onClick(); SFX.click(); el.remove(); });
  toastBox.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 380); }, dur);
}

// ------------------ Banner ------------------
let bannerEl: HTMLElement | null = null;
let bannerQueue: { a: string; b: string; kind: string }[] = [];
let bannerBusy = false;
export function setBanner(el: HTMLElement) { bannerEl = el; }
export function banner(a: string, b = '', kind = '') {
  bannerQueue.push({ a, b, kind });
  if (bannerQueue.length > 3) bannerQueue.shift();
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const it = bannerQueue.shift();
  if (!it || !bannerEl) { bannerBusy = false; return; }
  bannerBusy = true;
  bannerEl.className = 'banner ' + it.kind;
  bannerEl.innerHTML = `<div class="b1">${it.a}</div>${it.b ? `<div class="b2">${it.b}</div>` : ''}`;
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  setTimeout(nextBanner, 2300);
}

// ------------------ Confeti DOM ------------------
let confettiAlive = 0;
export function confetti(x: number, y: number, n = 40, colors = ['#ffd27a', '#ff8f1f', '#79e38a', '#7fc8ff', '#ff6fa8', '#c49bff']) {
  n = Math.min(n, 220 - confettiAlive);
  for (let i = 0; i < n; i++) {
    confettiAlive++;
    const el = h('div', { class: 'confetti' });
    el.style.background = colors[i % colors.length];
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.append(el);
    const a = Math.random() * Math.PI * 2, s = 180 + Math.random() * 380;
    const dx = Math.cos(a) * s, dy = Math.sin(a) * s - 260;
    const rot = (Math.random() - 0.5) * 1080;
    el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.3}px, ${dy + 520}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => { el.remove(); confettiAlive--; };
  }
}
