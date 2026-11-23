// Consejos contextuales que se muestran una sola vez.
import { G } from '../game/state';
import { CC, pstats, player } from '../game/colony';
import { toast } from './dom';
import { on } from '../core/bus';
import { TECHS } from '../game/defs';
import { techAvailable } from '../game/actions';
import { APP } from './camera';
import { ls } from '../core/util';

let shown: Set<string> = new Set();
try { shown = new Set(JSON.parse(localStorage.getItem('myrmex.tips') || '[]')); } catch { /* */ }
let lastTip = -1e9;
function tip(id: string, title: string, text: string) {
  if (APP.mode !== 'game' || shown.has(id)) return false;
  if (performance.now() - lastTip < 22000) return false;
  lastTip = performance.now();
  shown.add(id);
  try { localStorage.setItem('myrmex.tips', JSON.stringify([...shown])); } catch { /* */ }
  toast('💡', title, text, 'info', undefined, 11000);
  return true;
}
export function resetTips() { shown.clear(); ls.del('myrmex.tips'); }

let acc = 0, started = 0;
export function initTips() {
  on('raid', () => tip('raid', 'Defiende tu colonia', 'Pulsa Q para seleccionar tu ejército y haz clic derecho sobre los enemigos. Las garitas ácidas y el cuartel ayudan mucho.'));
  on('chamberDone', d => { if (d.c.type === 'lab') tip('lab', 'Ya generas Saber', 'Abre el árbol de Investigación con R y elige tu primera tecnología.'); });
  on('treasure', () => tip('treasure', '¡Tesoros bajo tierra!', 'Busca los destellos cerca de tus túneles: excavar allí da ámbar, fósiles y cristales.'));
  on('hatch', d => { if (d.caste === 'soldier') tip('soldier', 'Tu primera soldado', 'Las militares vigilan el punto de reunión. Selecciónalas arrastrando y dales órdenes con clic derecho.'); });
}
export function updateTips(dt: number) {
  const S = G.S;
  if (!S || S.paused) return;
  acc += dt; started += dt;
  if (acc < 1) return;
  acc = 0;
  const p = player();
  const ps = pstats();
  const cc = CC[0];
  if (started > 4) tip('start', 'Bienvenida a tu colonia', 'Tus obreras ya buscan comida solas y, al volver, dejan rastros de feromonas que se convierten en caminos. Sigue los objetivos de la izquierda.');
  if (started > 40) tip('nest', 'Mira bajo tierra', 'Pulsa Tab para ver tu hormiguero. Allí excavarás túneles y cámaras: empieza por una Despensa y una Guardería.');
  if (S.view === 'nest') tip('nestTools', 'Construir el hormiguero', 'Usa Cámaras (B) para colocar salas: se excava un túnel hasta ellas automáticamente. Con Excavar (F) puedes pintar túneles libremente.');
  if (cc && cc.total + S.nest.brood.length >= ps.popCap) tip('popcap', 'Población al máximo', 'Excava un Dormitorio para que la Reina pueda seguir poniendo huevos.');
  if (p.res.soil >= 40 && started > 120) tip('outpost', 'Expande tu territorio', 'Con tierra puedes construir Montículos en superficie (B): acortan los viajes de las recolectoras y amplían tu territorio.');
  if (!p.research && TECHS.some(t => techAvailable(t.id).ok) && S.nest.chambers.some(c => c.type === 'lab' && c.state === 1)) tip('research', 'Investigación disponible', 'Tienes Saber suficiente para investigar algo nuevo. Pulsa R.');
  if (p.level >= 3) tip('decor', 'Decora tu hogar', 'En el hormiguero pulsa V para decorar cámaras. La belleza otorga Prestigio, que acelera todo el trabajo.');
  if (S.time > 600) tip('army', 'Prepara un ejército', 'Las colonias rivales crecen. Construye un Cuartel y cría Soldados desde el panel de Colonia (C).');
}
