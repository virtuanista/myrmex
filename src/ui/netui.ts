// Interfaz del multijugador cooperativo.
import { NET, closeNet, guestAnswer, hostAcceptAnswer, hostCreateOffer, sendChat, setNetHandlers } from '../net/net';
import { $, h, toast } from './dom';
import { on } from '../core/bus';
import { SFX } from '../audio/audio';
import { UI, addMarker } from './uistate';
import { jumpTo, APP } from './camera';
import { G } from '../game/state';

function modal(content: HTMLElement, onClose?: () => void) {
  const wrap = h('div', { class: 'modal-bg' });
  const close = () => { wrap.remove(); UI.modalOpen = false; onClose?.(); };
  const dlg = h('div', { class: 'card dialog', style: { width: 'min(640px, 94vw)' } }, h('button', { class: 'close-x', onclick: close }, '✕'), content);
  wrap.append(dlg);
  UI.modalOpen = true;
  (APP.mode === 'game' ? $('#hud') : $('#screens')).append(wrap);
  return close;
}
function codeBox(value = '', readonly = false) {
  const t = h('textarea', { class: 'codebox', rows: '4', spellcheck: 'false' }) as HTMLTextAreaElement;
  t.value = value; t.readOnly = readonly;
  // los códigos de solo lectura se seleccionan enteros al hacer clic, para copiarlos a mano
  if (readonly) t.addEventListener('focus', () => t.select());
  return t;
}
/** Copia el código. Dentro de un iframe (itch.io) la API del portapapeles suele estar
 *  bloqueada: se prueba execCommand y, si tampoco va, se deja seleccionado para Ctrl+C. */
function copyBtn(t: HTMLTextAreaElement) {
  const hint = h('div', { class: 'hint', style: { flex: '1', minWidth: '0' } }, '');
  const b = h('button', { class: 'btn small', onclick: async () => {
    SFX.click();
    if (!t.value) { hint.textContent = 'El código aún se está generando…'; return; }
    // 1) copia clásica sobre la selección: funciona dentro del iframe con el gesto del clic
    t.focus(); t.select(); t.setSelectionRange(0, t.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    // 2) API moderna, solo si la política de permisos del iframe la permite (si no, Chrome avisa en consola)
    const pp = (document as any).permissionsPolicy ?? (document as any).featurePolicy;
    const allowed = !pp?.allowsFeature || pp.allowsFeature('clipboard-write');
    if (!ok && allowed && navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(t.value); ok = true; } catch { /* sin permiso */ }
    }
    if (ok) { b.textContent = '✔ Copiado'; hint.textContent = 'Código copiado. Envíaselo por chat, correo…'; setTimeout(() => { b.textContent = '📋 Copiar'; }, 1800); }
    else { t.focus(); t.select(); hint.textContent = 'Tu navegador no deja copiar automáticamente: el código ya está seleccionado, pulsa Ctrl+C (⌘+C en Mac).'; }
  } }, '📋 Copiar');
  return h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flex: '1' } }, b, hint);
}

/** Anfitrión: invitar a otra jugadora a la colonia */
export function openHostDialog() {
  const st = h('div', { class: 'hint', style: { margin: '8px 0' } }, 'Preparando invitación…');
  const offer = codeBox('', true);
  const answer = codeBox('');
  answer.placeholder = 'Pega aquí el código de respuesta de tu compañera…';
  const body = h('div', {},
    h('h2', {}, '🌐 Colonia compartida'),
    h('p', { class: 'lead' }, 'Juega en cooperativo por internet: tu compañera verá tu mundo y podrá dar órdenes a la misma colonia. Conexión directa entre navegadores, sin servidores.'),
    h('div', { class: 'field' }, h('label', {}, '1 · Envía este código de invitación'), offer, h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, copyBtn(offer))),
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, '2 · Pega su código de respuesta'), answer,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, h('button', { class: 'btn primary small', onclick: async () => { try { await hostAcceptAnswer(answer.value); } catch (e) { st.textContent = '⚠️ Código no válido: ' + e; } } }, '🔗 Conectar'))),
    st);
  setNetHandlers({ onStatus: s => { st.textContent = 'Estado: ' + s; if (s === 'Conectado') { SFX.complete(); setTimeout(() => close(), 900); } } });
  const close = modal(body);
  hostCreateOffer().then(c => { offer.value = c; }).catch(e => { st.textContent = '⚠️ ' + e; });
}

/** Invitado: unirse desde el menú principal */
export function openJoinDialog(onReady: () => void) {
  const st = h('div', { class: 'hint', style: { margin: '8px 0' } }, '');
  const offer = codeBox('');
  offer.placeholder = 'Pega aquí el código de invitación del anfitrión…';
  const answer = codeBox('', true);
  const ansWrap = h('div', { class: 'field hidden', style: { marginTop: '14px' } }, h('label', {}, '2 · Envía este código de respuesta al anfitrión'), answer, h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, copyBtn(answer)));
  const body = h('div', {},
    h('h2', {}, '🌐 Unirse a una colonia'),
    h('p', { class: 'lead' }, 'Pide a tu compañera que abra el menú de pausa → «Invitar a una amiga» y te pase su código.'),
    h('div', { class: 'field' }, h('label', {}, '1 · Código de invitación'), offer,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, h('button', { class: 'btn primary small', onclick: async () => { try { st.textContent = 'Generando respuesta…'; answer.value = await guestAnswer(offer.value); ansWrap.classList.remove('hidden'); } catch (e) { st.textContent = '⚠️ Código no válido: ' + e; } } }, '✔ Generar respuesta'))),
    ansWrap, st);
  setNetHandlers({
    onStatus: s => { st.textContent = 'Estado: ' + s + (s === 'Conectado' ? ' · recibiendo el mundo…' : ''); },
    onGuestReady: () => { close(); onReady(); },
  });
  const close = modal(body, () => { if (!NET.connected) closeNet(); });
}

// ------------------ Chat, señales e indicador ------------------
let chatEl: HTMLInputElement | null = null;
export function openChat() {
  if (!NET.connected || chatEl) return;
  chatEl = h('input', { type: 'text', class: 'chat-in', maxlength: '160', placeholder: 'Mensaje para ' + (NET.peerName || 'tu compañera') + '… (Enter)' }) as HTMLInputElement;
  $('#hud').append(chatEl);
  chatEl.focus();
  chatEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = chatEl!.value.trim(); if (v) { sendChat(v); toast('💬', 'Tú', v, 'info', undefined, 5000); } closeChat(); }
    if (e.key === 'Escape') closeChat();
  });
  chatEl.addEventListener('blur', () => setTimeout(closeChat, 100));
}
function closeChat() { chatEl?.remove(); chatEl = null; }

export function netIndicator(): HTMLElement {
  const el = h('div', { class: 'net-chip hidden' });
  setInterval(() => {
    const on = NET.role !== 'off' && NET.connected;
    el.classList.toggle('hidden', !on);
    if (on) el.textContent = `🌐 ${NET.role === 'host' ? 'Anfitrión' : 'Invitada'} · ${NET.peerName || '…'} · Enter: chat · Alt+clic: señal`;
  }, 500);
  return el;
}

export function initNetUI() {
  on('netChat', d => { toast('💬', d.name, d.text, 'info', undefined, 6000); SFX.quest(); });
  on('netJoin', d => { toast('🌐', d.name + ' se ha unido', 'Ahora dirigís juntas la colonia.', 'good'); SFX.levelup(); });
  on('netLost', d => { toast('🌐', 'Conexión perdida', d.role === 'guest' ? 'El anfitrión se ha desconectado.' : 'Tu compañera se ha desconectado.', 'bad', undefined, 6000); });
  on('netPing', d => {
    if (!G.S) return;
    addMarker(d.x, d.y, 'ping');
    toast('📍', d.name + ' marca un punto', d.view === 'nest' ? 'En el hormiguero' : 'En la superficie', 'info', () => jumpTo(d.x, d.y, d.view), 5000);
    SFX.event();
  });
}
