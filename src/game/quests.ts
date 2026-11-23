// Objetivos encadenados y logros.
import type { Cost } from './defs';
import { G, GameState } from './state';
import { CC, addXP, pstats, refund } from './colony';
import { emit } from '../core/bus';

export interface QuestDef { id: string; title: string; desc: string; goal: number; prog: (S: GameState) => number; reward: Cost; xp: number; hint?: string }

const cham = (S: GameState, t: string) => S.nest.chambers.filter(c => c.type === t && c.state === 1).length;
const kills = (S: GameState) => Object.entries(S.stats.kills).filter(([k]) => k !== 'aphid').reduce((a, [, v]) => a + v, 0);
const mil = () => CC[0]?.military ?? 0;
const pop = () => CC[0]?.total ?? 0;

export const QUESTS: QuestDef[] = [
  { id: 'food50', title: 'Primeras provisiones', desc: 'Recolecta 50 de comida.', goal: 50, prog: S => S.stats.gathered.food, reward: { amber: 5, leaves: 10 }, xp: 25, hint: 'Las obreras recolectan solas. Sigue sus rastros de feromonas.' },
  { id: 'storage', title: 'Una buena despensa', desc: 'Excava una Despensa en el hormiguero.', goal: 1, prog: S => cham(S, 'storage'), reward: { food: 40 }, xp: 30, hint: 'Pulsa Tab para ver el hormiguero y elige Cámaras → Despensa.' },
  { id: 'nursery', title: 'Cuna de la colonia', desc: 'Excava una Guardería.', goal: 1, prog: S => cham(S, 'nursery'), reward: { food: 50, leaves: 20 }, xp: 35, hint: 'La guardería permite criar muchas más larvas a la vez.' },
  { id: 'pop15', title: 'Población creciente', desc: 'Alcanza 15 hormigas.', goal: 15, prog: () => pop(), reward: { food: 40, amber: 4 }, xp: 35 },
  { id: 'dorm', title: 'Descanso merecido', desc: 'Excava un Dormitorio para aumentar la población máxima.', goal: 1, prog: S => cham(S, 'dorm'), reward: { food: 60 }, xp: 35 },
  { id: 'lab', title: 'Química de feromonas', desc: 'Excava una Cámara de Feromonas para generar Saber.', goal: 1, prog: S => cham(S, 'lab'), reward: { science: 20 }, xp: 40 },
  { id: 'research1', title: 'Primer descubrimiento', desc: 'Investiga una tecnología.', goal: 1, prog: S => S.stats.techs, reward: { science: 15, amber: 5 }, xp: 40, hint: 'Abre el árbol de Investigación (tecla R).' },
  { id: 'zone3', title: 'Más allá de la hierba', desc: 'Descubre 3 zonas del mapa.', goal: 3, prog: S => S.stats.zones, reward: { amber: 8 }, xp: 40, hint: 'Las Exploradoras revelan el mundo rapidísimo.' },
  { id: 'dig150', title: 'Ingenieras', desc: 'Excava 150 casillas de tierra.', goal: 150, prog: S => S.stats.dug, reward: { leaves: 30, amber: 5 }, xp: 40 },
  { id: 'soldiers5', title: 'Guardia real', desc: 'Ten 5 hormigas militares.', goal: 5, prog: () => mil(), reward: { food: 60 }, xp: 40, hint: 'Pon Soldados en la cola de cría desde el panel de Colonia.' },
  { id: 'leaves100', title: 'Hojarasca', desc: 'Recolecta 100 hojas.', goal: 100, prog: S => S.stats.gathered.leaves, reward: { food: 50, amber: 4 }, xp: 40 },
  { id: 'hunt3', title: 'Cazadoras', desc: 'Caza 3 criaturas.', goal: 3, prog: S => kills(S), reward: { amber: 8 }, xp: 50, hint: 'Selecciona soldados y haz clic derecho sobre una presa.' },
  { id: 'outpost', title: 'Puesto avanzado', desc: 'Construye un Montículo en la superficie.', goal: 1, prog: S => S.structures.filter(s => s.col === 0 && s.built && s.type === 'outpost').length + S.structures.filter(s => s.col === 0 && s.type === 'satellite').length, reward: { soil: 30, amber: 6 }, xp: 50, hint: 'Usa el menú Construir (tecla B). Necesita tierra de las excavaciones.' },
  { id: 'decor3', title: 'Un hogar bonito', desc: 'Coloca 3 decoraciones en el hormiguero.', goal: 3, prog: S => S.stats.decor, reward: { amber: 6 }, xp: 45, hint: 'En la vista del hormiguero, usa Decorar.' },
  { id: 'treasure3', title: 'Buscatesoros', desc: 'Encuentra 3 tesoros enterrados.', goal: 3, prog: S => S.stats.treasures, reward: { amber: 10 }, xp: 50, hint: 'Al excavar aparecen ámbar, fósiles y cristales.' },
  { id: 'upgrade', title: 'Reformas', desc: 'Mejora una cámara de nivel.', goal: 1, prog: S => S.stats.upgrades, reward: { food: 80, amber: 6 }, xp: 50, hint: 'Necesitas la tecnología Arquitectura.' },
  { id: 'barracks', title: 'Academia militar', desc: 'Excava un Cuartel.', goal: 1, prog: S => cham(S, 'barracks'), reward: { food: 80 }, xp: 50 },
  { id: 'pop40', title: 'Ciudad bajo tierra', desc: 'Alcanza 40 hormigas.', goal: 40, prog: () => pop(), reward: { food: 120, amber: 10 }, xp: 80 },
  { id: 'army15', title: 'Un ejército', desc: 'Ten 15 hormigas militares a la vez.', goal: 15, prog: () => mil(), reward: { amber: 12 }, xp: 80 },
  { id: 'research5', title: 'Sabiduría ancestral', desc: 'Investiga 5 tecnologías.', goal: 5, prog: S => S.stats.techs, reward: { amber: 15, science: 30 }, xp: 90 },
  { id: 'spider', title: 'Cazadora de arañas', desc: 'Mata una araña lobo.', goal: 1, prog: S => S.stats.kills.spider || 0, reward: { amber: 15 }, xp: 90 },
  { id: 'poi2', title: 'Maravillas del mundo', desc: 'Descubre 2 lugares legendarios.', goal: 2, prog: S => S.stats.poi, reward: { amber: 12 }, xp: 80 },
  { id: 'food1000', title: 'Abundancia', desc: 'Recolecta 1000 de comida en total.', goal: 1000, prog: S => S.stats.gathered.food, reward: { amber: 15 }, xp: 100 },
  { id: 'beauty100', title: 'Prestigio colonial', desc: 'Alcanza 100 de belleza en el hormiguero.', goal: 100, prog: () => pstats().beauty, reward: { amber: 20 }, xp: 100 },
  { id: 'kill40', title: 'Guerra de hormigas', desc: 'Elimina 40 hormigas enemigas.', goal: 40, prog: S => S.stats.antKills, reward: { amber: 20, food: 150 }, xp: 120 },
  { id: 'pop80', title: 'Metrópolis', desc: 'Alcanza 80 hormigas.', goal: 80, prog: () => pop(), reward: { amber: 25, food: 200 }, xp: 150 },
  { id: 'tower', title: 'Defensas de ácido', desc: 'Construye una Garita ácida.', goal: 1, prog: S => S.structures.filter(s => s.col === 0 && s.built && s.type === 'tower').length, reward: { amber: 15 }, xp: 90 },
  { id: 'colony1', title: 'Caída de un imperio', desc: 'Destruye una colonia rival.', goal: 1, prog: S => S.stats.coloniesDestroyed, reward: { amber: 40, science: 60 }, xp: 300, hint: 'Lleva un gran ejército al hormiguero rival y ataca su entrada.' },
  { id: 'boss', title: 'Matagigantes', desc: 'Derrota a un jefe (Mantis o Rinoceronte).', goal: 1, prog: S => S.stats.bosses, reward: { amber: 40 }, xp: 250 },
  { id: 'satellite', title: 'Nueva dinastía', desc: 'Funda un nido satélite con una princesa.', goal: 1, prog: S => S.structures.filter(s => s.col === 0 && s.type === 'satellite').length, reward: { amber: 30 }, xp: 200, hint: 'Investiga Vuelo nupcial, cría una princesa y envíala a un Montículo.' },
  { id: 'research15', title: 'Omnisciencia', desc: 'Investiga 15 tecnologías.', goal: 15, prog: S => S.stats.techs, reward: { amber: 40 }, xp: 250 },
  { id: 'zonesAll', title: 'Cartógrafa', desc: 'Descubre el 80% de las zonas.', goal: 80, prog: S => Math.round(100 * S.stats.zones / Math.max(1, S.zones.length)), reward: { amber: 30 }, xp: 200 },
  { id: 'pop150', title: 'Superorganismo', desc: 'Alcanza 150 hormigas.', goal: 150, prog: () => pop(), reward: { amber: 60 }, xp: 400 },
  { id: 'conquer', title: 'Emperatriz de la hierba', desc: 'Destruye todas las colonias rivales.', goal: 1, prog: S => S.colonies.every(c => c.isPlayer || !c.alive) ? 1 : 0, reward: { amber: 100 }, xp: 1000 },
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map(q => [q.id, q]));

export interface AchDef { id: string; name: string; icon: string; desc: string; check: (S: GameState) => boolean }
export const ACHIEVEMENTS: AchDef[] = [
  { id: 'firstblood', name: 'Primera sangre', icon: '🩸', desc: 'Elimina a tu primera hormiga enemiga.', check: S => S.stats.antKills >= 1 },
  { id: 'digger', name: 'Topo honorario', icon: '⛏️', desc: 'Excava 1000 casillas.', check: S => S.stats.dug >= 1000 },
  { id: 'miner', name: 'Corazón de la tierra', icon: '💎', desc: 'Encuentra 15 tesoros.', check: S => S.stats.treasures >= 15 },
  { id: 'nights', name: 'Noctámbula', icon: '🌙', desc: 'Sobrevive 5 noches.', check: S => S.time > 420 * 5 },
  { id: 'storm', name: 'Tras la tormenta', icon: '⛈️', desc: 'Sobrevive a una tormenta.', check: S => !!(S as any)._stormSurvived },
  { id: 'veteran', name: 'Leyenda viva', icon: '🎖️', desc: 'Una hormiga alcanza el rango 3.', check: S => S.ants.some(a => a.col === 0 && a.rank >= 3) },
  { id: 'army50', name: 'Marea negra', icon: '🌊', desc: 'Ten 50 hormigas militares.', check: S => S.stats.maxArmy >= 50 },
  { id: 'pop100', name: 'Centenaria', icon: '💯', desc: 'Alcanza 100 hormigas.', check: S => S.stats.maxPop >= 100 },
  { id: 'pop250', name: 'Megacolonia', icon: '🌍', desc: 'Alcanza 250 hormigas.', check: S => S.stats.maxPop >= 250 },
  { id: 'hunter', name: 'Depredadora', icon: '🦴', desc: 'Caza 50 criaturas.', check: S => kills(S) >= 50 },
  { id: 'centipede', name: 'Cien patas menos', icon: '🐛', desc: 'Mata un ciempiés.', check: S => (S.stats.kills.centipede || 0) >= 1 },
  { id: 'termites', name: 'Plaga controlada', icon: '🪳', desc: 'Elimina 30 termitas.', check: S => (S.stats.kills.termite || 0) >= 30 },
  { id: 'architect', name: 'Arquitecta', icon: '📐', desc: 'Ten 10 cámaras activas.', check: S => S.nest.chambers.filter(c => c.state === 1).length >= 10 },
  { id: 'decorator', name: 'Decoradora', icon: '🎨', desc: 'Coloca 25 decoraciones.', check: S => S.stats.decor >= 25 },
  { id: 'beauty', name: 'Palacio subterráneo', icon: '🏰', desc: 'Alcanza 400 de belleza.', check: () => pstats().beauty >= 400 },
  { id: 'scholar', name: 'Erudita', icon: '📚', desc: 'Investiga todas las tecnologías.', check: S => S.stats.techs >= 27 },
  { id: 'rich', name: 'Tesoro de ámbar', icon: '🟠', desc: 'Acumula 300 de ámbar.', check: S => S.colonies[0].res.amber >= 300 },
  { id: 'explorer', name: 'Trotamundos', icon: '🧭', desc: 'Descubre todas las zonas.', check: S => S.stats.zones >= S.zones.length },
  { id: 'conqueror', name: 'Conquistadora', icon: '👑', desc: 'Destruye 3 colonias rivales.', check: S => S.stats.coloniesDestroyed >= 3 },
  { id: 'lvl10', name: 'Colonia ilustre', icon: '⭐', desc: 'Alcanza el nivel de colonia 10.', check: S => S.colonies[0].level >= 10 },
  { id: 'lvl20', name: 'Colonia legendaria', icon: '🌟', desc: 'Alcanza el nivel de colonia 20.', check: S => S.colonies[0].level >= 20 },
  { id: 'gatherer', name: 'Incansables', icon: '🧺', desc: 'Entrega 10.000 unidades de recursos.', check: S => S.stats.delivered >= 10000 },
  { id: 'mantis', name: 'Cazamantis', icon: '🦗', desc: 'Derrota a la mantis.', check: S => (S.stats.kills.mantis || 0) >= 1 },
  { id: 'satellites3', name: 'Dinastía', icon: '🏯', desc: 'Ten 3 nidos satélite.', check: S => S.structures.filter(s => s.col === 0 && s.type === 'satellite').length >= 3 },
];

export function initQuests(S: GameState) {
  S.quests = { active: QUESTS.slice(0, 3).map(q => q.id), done: [], prog: {} };
}

export function updateQuests() {
  const S = G.S;
  const q = S.quests;
  for (const id of [...q.active]) {
    const d = QUEST_BY_ID[id];
    if (!d) { q.active.splice(q.active.indexOf(id), 1); continue; }
    const p = Math.min(d.goal, d.prog(S));
    q.prog[id] = p;
    if (p >= d.goal) {
      q.active.splice(q.active.indexOf(id), 1);
      q.done.push(id);
      refund(S.colonies[0].res, d.reward);
      addXP(d.xp);
      emit('quest', { q: d });
    }
  }
  // rellenar
  while (q.active.length < 3) {
    const next = QUESTS.find(x => !q.done.includes(x.id) && !q.active.includes(x.id));
    if (!next) break;
    if (next.id === 'conquer' && S.cfg.mode === 'sandbox' && S.cfg.rivals === 0) { q.done.push(next.id); continue; }
    q.active.push(next.id);
  }
  for (const a of ACHIEVEMENTS) {
    if (S.ach.includes(a.id)) continue;
    if (a.check(S)) { S.ach.push(a.id); emit('achievement', { a }); addXP(40); }
  }
}
