// Definiciones estáticas de contenido del juego.

export type ResKey = 'food' | 'leaves' | 'soil' | 'amber' | 'science';
export type Cost = Partial<Record<ResKey, number>>;

export const RES_INFO: Record<ResKey, { name: string; icon: string; color: string }> = {
  food: { name: 'Comida', icon: '🍯', color: '#ffc94a' },
  leaves: { name: 'Hojas', icon: '🍃', color: '#7ee06a' },
  soil: { name: 'Tierra', icon: '🟫', color: '#c58b55' },
  amber: { name: 'Ámbar', icon: '💎', color: '#ff9f2e' },
  science: { name: 'Saber', icon: '🧪', color: '#9fd8ff' },
};

export const COLONY_COLORS = [
  { name: 'Ámbar', body: '#c46a1c', light: '#ffb14a', ui: '#ffae3d' },
  { name: 'Carmesí', body: '#9e1c22', light: '#ff5a4f', ui: '#ff5b55' },
  { name: 'Azabache', body: '#24222b', light: '#7a7590', ui: '#b7b1d6' },
  { name: 'Esmeralda', body: '#1d6b3a', light: '#5de08b', ui: '#4fe08a' },
  { name: 'Cobalto', body: '#1f3f9a', light: '#6b9bff', ui: '#6fa0ff' },
  { name: 'Violeta', body: '#5b2690', light: '#bb7dff', ui: '#c08bff' },
  { name: 'Turquesa', body: '#127a7a', light: '#4fe6e0', ui: '#45e3dc' },
  { name: 'Marfil', body: '#9c8d6a', light: '#fff1c4', ui: '#f3e3b0' },
];

export const EMBLEMS = ['🜂', '✦', '❖', '☀', '☾', '♛', '✿', '⚔', '❂', '♆', '✺', '◈'];

export type CasteId = 'worker' | 'scout' | 'soldier' | 'harvester' | 'acid' | 'major' | 'princess' | 'queen';

export interface CasteDef {
  id: CasteId; name: string; plural: string; desc: string; icon: string;
  hp: number; dmg: number; range: number; cd: number; armor: number; speed: number;
  vision: number; carry: number; size: number; cost: Cost; time: number;
  military: boolean; tech?: string; level?: number; flies?: boolean;
}

export const CASTES: Record<CasteId, CasteDef> = {
  worker: {
    id: 'worker', name: 'Obrera', plural: 'Obreras', icon: '🐜',
    desc: 'La columna vertebral de la colonia: recolecta, excava, cuida de la cría y construye.',
    hp: 20, dmg: 2, range: 10, cd: 1, armor: 0, speed: 40, vision: 90, carry: 1, size: 1,
    cost: { food: 10 }, time: 28, military: false,
  },
  scout: {
    id: 'scout', name: 'Exploradora', plural: 'Exploradoras', icon: '🔭',
    desc: 'Patas largas y antenas sensibles. Muy rápida, ve muy lejos y descubre el mundo por su cuenta.',
    hp: 14, dmg: 1.5, range: 10, cd: 1, armor: 0, speed: 78, vision: 190, carry: 1, size: 0.9,
    cost: { food: 16 }, time: 30, military: false, tech: 'scouts',
  },
  soldier: {
    id: 'soldier', name: 'Soldado', plural: 'Soldados', icon: '⚔️',
    desc: 'Cabeza acorazada y mandíbulas poderosas. Defiende la colonia y ataca a quien se interponga.',
    hp: 60, dmg: 7, range: 12, cd: 0.9, armor: 1, speed: 36, vision: 115, carry: 1, size: 1.25,
    cost: { food: 25, leaves: 4 }, time: 42, military: true,
  },
  harvester: {
    id: 'harvester', name: 'Cortadora', plural: 'Cortadoras', icon: '✂️',
    desc: 'Una recolectora especializada que carga el triple que una obrera y corta hojas sin descanso.',
    hp: 32, dmg: 3, range: 10, cd: 1, armor: 0.5, speed: 37, vision: 100, carry: 3, size: 1.15,
    cost: { food: 18, leaves: 5 }, time: 38, military: false, tech: 'harvesters',
  },
  acid: {
    id: 'acid', name: 'Lanzaácido', plural: 'Lanzaácidos', icon: '🧪',
    desc: 'Rocía ácido fórmico a distancia. Frágil, pero devastadora detrás de una línea de soldados.',
    hp: 30, dmg: 6.5, range: 95, cd: 1.5, armor: 0, speed: 33, vision: 140, carry: 0, size: 1.1,
    cost: { food: 30, amber: 4 }, time: 50, military: true, tech: 'formic',
  },
  major: {
    id: 'major', name: 'Coloso', plural: 'Colosos', icon: '🛡️',
    desc: 'Una soldado mayor de cabeza descomunal. Lenta, casi indestructible, aplasta a sus enemigos.',
    hp: 200, dmg: 19, range: 16, cd: 1.3, armor: 4, speed: 25, vision: 120, carry: 0, size: 1.9,
    cost: { food: 65, leaves: 10, amber: 10 }, time: 80, military: true, tech: 'majors',
  },
  princess: {
    id: 'princess', name: 'Princesa alada', plural: 'Princesas', icon: '👑',
    desc: 'Una futura reina con alas. Vuela a un montículo y lo convierte en un nido satélite que pone huevos.',
    hp: 70, dmg: 3, range: 12, cd: 1, armor: 1, speed: 60, vision: 160, carry: 0, size: 1.6,
    cost: { food: 120, amber: 30 }, time: 110, military: false, tech: 'nuptial', flies: true,
  },
  queen: {
    id: 'queen', name: 'Reina', plural: 'Reinas', icon: '♛',
    desc: 'El corazón de la colonia.',
    hp: 800, dmg: 20, range: 16, cd: 1, armor: 5, speed: 10, vision: 60, carry: 0, size: 3,
    cost: {}, time: 0, military: false,
  },
};
export const TRAINABLE: CasteId[] = ['worker', 'scout', 'harvester', 'soldier', 'acid', 'major', 'princess'];

// ------------------------- Cámaras del hormiguero -------------------------
export type ChamberType = 'royal' | 'nursery' | 'storage' | 'fungus' | 'barracks' | 'lab' | 'dorm' | 'hall' | 'midden';

export interface ChamberDef {
  id: ChamberType; name: string; icon: string; desc: string;
  rx: number; ry: number; cost: Cost[]; maxLevel: number; tech?: string; unique?: boolean;
  color: string; effect: string[];
}

export const CHAMBERS: Record<ChamberType, ChamberDef> = {
  royal: {
    id: 'royal', name: 'Cámara Real', icon: '♛', color: '#ffcf6b', unique: true,
    desc: 'Donde reside la Reina. Mejorarla acelera la puesta de huevos.',
    rx: 7, ry: 4, cost: [{}, { food: 120, leaves: 40, amber: 15 }, { food: 300, leaves: 90, amber: 50 }], maxLevel: 3,
    effect: ['Puesta base', 'Puesta +35%', 'Puesta +70%'],
  },
  nursery: {
    id: 'nursery', name: 'Guardería', icon: '🥚', color: '#fff2c9',
    desc: 'Aloja huevos, larvas y pupas. Las nodrizas aceleran su desarrollo.',
    rx: 6, ry: 3, cost: [{ food: 20, leaves: 10 }, { food: 60, leaves: 30 }, { food: 140, leaves: 60, amber: 10 }], maxLevel: 3,
    effect: ['+10 plazas de cría', '+18 plazas de cría', '+28 plazas de cría'],
  },
  storage: {
    id: 'storage', name: 'Despensa', icon: '🍯', color: '#ffb84a',
    desc: 'Almacena comida y hojas. Sin espacio, lo recolectado se pierde.',
    rx: 6, ry: 3, cost: [{ food: 15, leaves: 5 }, { food: 50, leaves: 25 }, { food: 120, leaves: 60, amber: 8 }], maxLevel: 3,
    effect: ['+250 capacidad', '+550 capacidad', '+1000 capacidad'],
  },
  dorm: {
    id: 'dorm', name: 'Dormitorio', icon: '🛏️', color: '#c9a7ff',
    desc: 'Galerías de descanso. Cada nivel permite más hormigas en la colonia.',
    rx: 6, ry: 3, cost: [{ food: 25, leaves: 15 }, { food: 70, leaves: 35 }, { food: 150, leaves: 70, amber: 12 }], maxLevel: 3,
    effect: ['+18 población', '+34 población', '+55 población'],
  },
  fungus: {
    id: 'fungus', name: 'Jardín de Hongos', icon: '🍄', color: '#e9d8c4', tech: 'fungus',
    desc: 'Las hormigas cultivan hongos sobre hojas troceadas: convierte hojas en comida.',
    rx: 6, ry: 3, cost: [{ food: 30, leaves: 30 }, { food: 60, leaves: 70 }, { food: 120, leaves: 140, amber: 12 }], maxLevel: 3,
    effect: ['0,6 hojas/s → x2,2 comida', '1,2 hojas/s → x2,4 comida', '2 hojas/s → x2,6 comida'],
  },
  barracks: {
    id: 'barracks', name: 'Cuartel', icon: '⚔️', color: '#ff7a6b',
    desc: 'Entrenamiento militar. Necesario para mantener un ejército.',
    rx: 6, ry: 3, cost: [{ food: 40, leaves: 15 }, { food: 90, leaves: 40, amber: 10 }, { food: 180, leaves: 80, amber: 30 }], maxLevel: 3,
    effect: ['+12 militares', '+26 militares, +10% daño', '+45 militares, +20% daño'],
  },
  lab: {
    id: 'lab', name: 'Cámara de Feromonas', icon: '🧪', color: '#8fd3ff',
    desc: 'Las obreras estudian química de feromonas. Genera Saber para investigar.',
    rx: 5, ry: 3, cost: [{ food: 30, leaves: 10 }, { food: 80, leaves: 30, amber: 10 }, { food: 160, leaves: 60, amber: 30 }], maxLevel: 3,
    effect: ['0,35 saber/s', '0,8 saber/s', '1,4 saber/s'],
  },
  midden: {
    id: 'midden', name: 'Basurero', icon: '♻️', color: '#a39a6a',
    desc: 'Los restos se compostan: mejora la salud y la regeneración de las hormigas y produce algo de tierra.',
    rx: 5, ry: 3, cost: [{ food: 10 }, { food: 40, leaves: 20 }, { food: 90, leaves: 50, amber: 6 }], maxLevel: 3,
    effect: ['+50% regeneración', '+100% regeneración', '+160% regeneración'],
  },
  hall: {
    id: 'hall', name: 'Gran Salón', icon: '🏛️', color: '#ffe08a', tech: 'grandhall', unique: true,
    desc: 'Una catedral subterránea. Multiplica el prestigio de todas las decoraciones.',
    rx: 9, ry: 5, cost: [{ food: 200, leaves: 100, amber: 60 }, { food: 400, leaves: 200, amber: 120 }, { food: 800, leaves: 400, amber: 250 }], maxLevel: 3,
    effect: ['Prestigio x1,5', 'Prestigio x2', 'Prestigio x2,6'],
  },
};
export const CHAMBER_ORDER: ChamberType[] = ['nursery', 'storage', 'dorm', 'fungus', 'barracks', 'lab', 'midden', 'hall'];

// ------------------------- Decoraciones -------------------------
export interface DecorDef { id: string; name: string; icon: string; cost: Cost; beauty: number; level: number; tech?: string; glow?: string }
export const DECORS: DecorDef[] = [
  { id: 'moss', name: 'Musgo mullido', icon: '🌿', cost: { leaves: 6 }, beauty: 2, level: 1 },
  { id: 'pebbles', name: 'Mosaico de guijarros', icon: '🪨', cost: { soil: 15 }, beauty: 3, level: 1 },
  { id: 'petal', name: 'Pétalo de flor', icon: '🌸', cost: { leaves: 10, food: 5 }, beauty: 4, level: 2 },
  { id: 'mushroom', name: 'Seta luminosa', icon: '🍄', cost: { leaves: 15, food: 10 }, beauty: 6, level: 3, glow: '#9dffcf' },
  { id: 'shell', name: 'Concha de caracol', icon: '🐚', cost: { soil: 25, food: 15 }, beauty: 7, level: 4 },
  { id: 'banner', name: 'Estandarte colonial', icon: '🚩', cost: { leaves: 20, amber: 3 }, beauty: 8, level: 5 },
  { id: 'crystal', name: 'Cristal de cuarzo', icon: '🔮', cost: { soil: 40, amber: 6 }, beauty: 12, level: 6, glow: '#c9b8ff' },
  { id: 'lantern', name: 'Farol de luciérnaga', icon: '🏮', cost: { food: 30, amber: 8 }, beauty: 14, level: 8, glow: '#fff09a' },
  { id: 'fountain', name: 'Fuente de rocío', icon: '⛲', cost: { soil: 60, amber: 12 }, beauty: 18, level: 10, glow: '#8fe6ff' },
  { id: 'amberdrop', name: 'Lágrima de ámbar', icon: '🟠', cost: { amber: 25 }, beauty: 22, level: 12, glow: '#ffb347' },
  { id: 'throne', name: 'Trono de semilla', icon: '🪑', cost: { food: 80, leaves: 40, amber: 20 }, beauty: 28, level: 14, tech: 'art' },
  { id: 'statue', name: 'Estatua de la Reina', icon: '🗿', cost: { soil: 120, amber: 40 }, beauty: 40, level: 16, tech: 'art', glow: '#ffd27a' },
];

// ------------------------- Edificios de superficie -------------------------
export type BuildingType = 'nest' | 'outpost' | 'tower' | 'aphidfarm' | 'banner' | 'satellite' | 'rivalnest';
export interface BuildingDef { id: BuildingType; name: string; icon: string; desc: string; cost: Cost; hp: number; work: number; radius: number; tech?: string; territory: number; vision: number; level?: number }
export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  nest: { id: 'nest', name: 'Entrada del hormiguero', icon: '⛰️', desc: 'La entrada a tu colonia. Si cae, la Reina queda expuesta.', cost: {}, hp: 2500, work: 0, radius: 22, territory: 12, vision: 210 },
  outpost: { id: 'outpost', name: 'Montículo', icon: '🏔️', desc: 'Un puesto avanzado: amplía tu territorio, da visión y sirve de punto de entrega de recursos.', cost: { soil: 40, leaves: 10 }, hp: 400, work: 30, radius: 16, territory: 9, vision: 170 },
  tower: { id: 'tower', name: 'Garita ácida', icon: '🗼', desc: 'Una torre de tierra donde vigías disparan ácido a los intrusos.', cost: { soil: 60, amber: 15 }, hp: 500, work: 40, radius: 12, territory: 3, vision: 200, tech: 'towers' },
  aphidfarm: { id: 'aphidfarm', name: 'Corral de pulgones', icon: '🐛', desc: 'Atrae y protege pulgones que producen melaza dulce sin parar.', cost: { soil: 35, leaves: 25 }, hp: 300, work: 30, radius: 14, territory: 4, vision: 120, tech: 'herding' },
  banner: { id: 'banner', name: 'Estandarte', icon: '🚩', desc: 'Marca tu dominio: +territorio, +visión y prestigio.', cost: { soil: 20, amber: 5 }, hp: 150, work: 12, radius: 8, territory: 6, vision: 150, level: 3 },
  satellite: { id: 'satellite', name: 'Nido satélite', icon: '👑', desc: 'Una princesa reina aquí: pone obreras, es punto de entrega y gran territorio.', cost: {}, hp: 900, work: 0, radius: 20, territory: 13, vision: 200 },
  rivalnest: { id: 'rivalnest', name: 'Hormiguero rival', icon: '☠️', desc: 'El corazón de una colonia enemiga. Destruye su entrada para aniquilarla.', cost: {}, hp: 3800, work: 0, radius: 24, territory: 12, vision: 200 },
};
export const BUILD_MENU: BuildingType[] = ['outpost', 'tower', 'aphidfarm', 'banner'];

// ------------------------- Criaturas -------------------------
export type CreatureType = 'aphid' | 'caterpillar' | 'beetle' | 'ladybug' | 'spider' | 'mantis' | 'cricket' | 'snail' | 'centipede' | 'termite';
export interface CreatureDef {
  id: CreatureType; name: string; hp: number; dmg: number; armor: number; speed: number; range: number; cd: number;
  aggro: number; behavior: 'passive' | 'neutral' | 'hunter'; size: number; loot: Cost; xp: number; night?: boolean; desc: string;
}
export const CREATURES: Record<CreatureType, CreatureDef> = {
  aphid: { id: 'aphid', name: 'Pulgón', hp: 10, dmg: 0, armor: 0, speed: 5, range: 0, cd: 1, aggro: 0, behavior: 'passive', size: 7, loot: { food: 6 }, xp: 2, desc: 'Produce melaza dulce. Mejor cuidarlo que comérselo.' },
  caterpillar: { id: 'caterpillar', name: 'Oruga', hp: 70, dmg: 0, armor: 0, speed: 8, range: 0, cd: 1, aggro: 0, behavior: 'passive', size: 16, loot: { food: 70, leaves: 25 }, xp: 15, desc: 'Lenta, jugosa e indefensa. Un banquete.' },
  cricket: { id: 'cricket', name: 'Grillo', hp: 45, dmg: 3, armor: 0, speed: 30, range: 12, cd: 1.2, aggro: 0, behavior: 'passive', size: 14, loot: { food: 50 }, xp: 10, desc: 'Salta lejos al menor peligro.' },
  snail: { id: 'snail', name: 'Caracol', hp: 140, dmg: 2, armor: 5, speed: 5, range: 12, cd: 2, aggro: 0, behavior: 'neutral', size: 18, loot: { food: 120, soil: 20 }, xp: 22, desc: 'Su concha es dura, pero no infinita.' },
  ladybug: { id: 'ladybug', name: 'Mariquita', hp: 55, dmg: 4, armor: 2, speed: 22, range: 12, cd: 1.2, aggro: 0, behavior: 'neutral', size: 12, loot: { food: 40 }, xp: 10, desc: 'Devora pulgones. Enemiga de tus rebaños.' },
  beetle: { id: 'beetle', name: 'Escarabajo', hp: 160, dmg: 7, armor: 3, speed: 18, range: 14, cd: 1.2, aggro: 0, behavior: 'neutral', size: 20, loot: { food: 100, amber: 4 }, xp: 25, desc: 'Un tanque con patas. Solo pelea si lo provocan.' },
  termite: { id: 'termite', name: 'Termita', hp: 22, dmg: 3, armor: 0.5, speed: 30, range: 10, cd: 1, aggro: 70, behavior: 'hunter', size: 9, loot: { food: 10, leaves: 6 }, xp: 4, desc: 'Las termitas odian a las hormigas. Siempre llegan en grupo.' },
  centipede: { id: 'centipede', name: 'Ciempiés', hp: 230, dmg: 11, armor: 1.5, speed: 55, range: 16, cd: 0.9, aggro: 130, behavior: 'hunter', size: 26, loot: { food: 150, amber: 6 }, xp: 40, night: true, desc: 'Cazador nocturno. Rapidísimo y letal.' },
  spider: { id: 'spider', name: 'Araña lobo', hp: 320, dmg: 15, armor: 2, speed: 48, range: 18, cd: 1, aggro: 140, behavior: 'hunter', size: 28, loot: { food: 180, amber: 12 }, xp: 60, desc: 'Acecha cerca de su madriguera y caza todo lo que se mueve.' },
  mantis: { id: 'mantis', name: 'Mantis religiosa', hp: 900, dmg: 32, armor: 3, speed: 34, range: 26, cd: 1.4, aggro: 160, behavior: 'hunter', size: 44, loot: { food: 450, amber: 45 }, xp: 200, desc: 'La reina de los depredadores. Un jefe que exige un ejército.' },
};

// ------------------------- Tecnologías -------------------------
export type Branch = 'eco' | 'war' | 'col';
export interface TechDef { id: string; name: string; icon: string; desc: string; branch: Branch; cost: Cost; req: string[]; tier: number }
export const TECHS: TechDef[] = [
  // Economía
  { id: 'strongpher', name: 'Feromonas persistentes', icon: '〰️', branch: 'eco', tier: 1, cost: { science: 30 }, req: [], desc: 'Los rastros duran el doble: las rutas de recolección se forman antes.' },
  { id: 'mandibles', name: 'Mandíbulas de carga', icon: '🦷', branch: 'eco', tier: 1, cost: { science: 45 }, req: [], desc: 'Obreras y exploradoras cargan +1 unidad por viaje.' },
  { id: 'fungus', name: 'Cultivo de hongos', icon: '🍄', branch: 'eco', tier: 2, cost: { science: 60 }, req: ['strongpher'], desc: 'Desbloquea el Jardín de Hongos: convierte hojas en comida.' },
  { id: 'digging', name: 'Excavación veloz', icon: '⛏️', branch: 'eco', tier: 2, cost: { science: 55 }, req: ['mandibles'], desc: 'Las excavadoras trabajan un 60% más rápido.' },
  { id: 'herding', name: 'Pastoreo de pulgones', icon: '🐛', branch: 'eco', tier: 3, cost: { science: 110, amber: 5 }, req: ['fungus'], desc: 'Desbloquea el Corral de pulgones. Los pulgones en tu territorio producen el doble.' },
  { id: 'harvesters', name: 'Casta cortadora', icon: '✂️', branch: 'eco', tier: 3, cost: { science: 120 }, req: ['mandibles', 'fungus'], desc: 'Desbloquea las Cortadoras, que cargan el triple.' },
  { id: 'deepstore', name: 'Despensas profundas', icon: '🏺', branch: 'eco', tier: 3, cost: { science: 100 }, req: ['digging'], desc: '+50% de capacidad en todas las despensas.' },
  { id: 'resin', name: 'Recolección de resina', icon: '💎', branch: 'eco', tier: 4, cost: { science: 160 }, req: ['deepstore'], desc: 'Las fuentes de ámbar rinden el doble y se regeneran.' },
  { id: 'trails', name: 'Autopistas de feromona', icon: '🛣️', branch: 'eco', tier: 4, cost: { science: 200, amber: 10 }, req: ['harvesters'], desc: 'Las hormigas se mueven un 25% más rápido sobre caminos marcados.' },
  // Guerra
  { id: 'chitin', name: 'Exoesqueleto quitinoso', icon: '🛡️', branch: 'war', tier: 1, cost: { science: 40 }, req: [], desc: '+1 armadura para todas tus hormigas.' },
  { id: 'sharp', name: 'Mandíbulas afiladas', icon: '🗡️', branch: 'war', tier: 1, cost: { science: 50 }, req: [], desc: '+25% de daño cuerpo a cuerpo.' },
  { id: 'alarm', name: 'Feromona de alarma', icon: '🚨', branch: 'war', tier: 2, cost: { science: 70 }, req: ['chitin'], desc: 'Las obreras atacadas llaman a soldados cercanos y se defienden con más fiereza.' },
  { id: 'formic', name: 'Ácido fórmico', icon: '🧪', branch: 'war', tier: 2, cost: { science: 90, amber: 5 }, req: ['sharp'], desc: 'Desbloquea las Lanzaácido, tiradoras a distancia.' },
  { id: 'towers', name: 'Garitas ácidas', icon: '🗼', branch: 'war', tier: 3, cost: { science: 120, amber: 10 }, req: ['formic'], desc: 'Desbloquea las torres defensivas de superficie.' },
  { id: 'majors', name: 'Casta de colosos', icon: '🐘', branch: 'war', tier: 3, cost: { science: 160, amber: 15 }, req: ['chitin', 'sharp'], desc: 'Desbloquea los Colosos: soldados mayores casi indestructibles.' },
  { id: 'swarm', name: 'Táctica de enjambre', icon: '🌀', branch: 'war', tier: 4, cost: { science: 220, amber: 20 }, req: ['alarm', 'majors'], desc: '+4% de daño por cada aliada cercana (máx. +40%).' },
  { id: 'veteran', name: 'Veteranía', icon: '🎖️', branch: 'war', tier: 4, cost: { science: 200, amber: 15 }, req: ['majors'], desc: 'Las hormigas ganan rangos al matar: +vida y +daño por rango.' },
  { id: 'corrosive', name: 'Ácido corrosivo', icon: '☣️', branch: 'war', tier: 5, cost: { science: 320, amber: 35 }, req: ['towers', 'swarm'], desc: 'El ácido ignora la armadura y salpica a enemigos cercanos.' },
  // Colonia
  { id: 'scouts', name: 'Exploradoras', icon: '🔭', branch: 'col', tier: 1, cost: { science: 25 }, req: [], desc: 'Desbloquea la casta Exploradora.' },
  { id: 'fertility', name: 'Fertilidad real', icon: '🥚', branch: 'col', tier: 1, cost: { science: 50 }, req: [], desc: 'La reina pone huevos un 30% más rápido.' },
  { id: 'nurses', name: 'Nodrizas expertas', icon: '🍼', branch: 'col', tier: 2, cost: { science: 70 }, req: ['fertility'], desc: 'La cría se desarrolla un 35% más rápido.' },
  { id: 'architecture', name: 'Arquitectura', icon: '📐', branch: 'col', tier: 2, cost: { science: 60 }, req: [], desc: 'Permite mejorar cámaras a nivel 2.' },
  { id: 'nightvision', name: 'Antenas nocturnas', icon: '🌙', branch: 'col', tier: 2, cost: { science: 80 }, req: ['scouts'], desc: 'Sin penalización de visión ni velocidad de noche.' },
  { id: 'masonry', name: 'Arquitectura avanzada', icon: '🏗️', branch: 'col', tier: 3, cost: { science: 150, amber: 10 }, req: ['architecture'], desc: 'Permite mejorar cámaras a nivel 3. Edificios de superficie +50% vida.' },
  { id: 'art', name: 'Arte subterráneo', icon: '🎨', branch: 'col', tier: 3, cost: { science: 130, amber: 10 }, req: ['architecture'], desc: 'Desbloquea las decoraciones más majestuosas y +25% de prestigio.' },
  { id: 'grandhall', name: 'Gran Salón', icon: '🏛️', branch: 'col', tier: 4, cost: { science: 250, amber: 30 }, req: ['art', 'masonry'], desc: 'Desbloquea el Gran Salón, que multiplica el prestigio.' },
  { id: 'nuptial', name: 'Vuelo nupcial', icon: '🪽', branch: 'col', tier: 4, cost: { science: 280, amber: 30 }, req: ['nurses', 'masonry'], desc: 'Desbloquea Princesas aladas para fundar nidos satélite.' },
  { id: 'longevity', name: 'Longevidad', icon: '♾️', branch: 'col', tier: 5, cost: { science: 300, amber: 25 }, req: ['nuptial'], desc: '+30% de vida para todas las castas y regeneración constante.' },
];
export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map(t => [t.id, t]));

// ------------------------- Recursos de superficie -------------------------
export type NodeKind = 'berry' | 'seeds' | 'leaf' | 'carcass' | 'sugar' | 'amber' | 'nectar' | 'honeydew' | 'mushroom' | 'crumbs' | 'fruit';
export const NODE_INFO: Record<NodeKind, { name: string; res: ResKey; icon: string }> = {
  berry: { name: 'Arbusto de bayas', res: 'food', icon: '🫐' },
  seeds: { name: 'Montón de semillas', res: 'food', icon: '🌾' },
  leaf: { name: 'Hojas caídas', res: 'leaves', icon: '🍂' },
  carcass: { name: 'Restos', res: 'food', icon: '🍖' },
  sugar: { name: 'Terrón de azúcar', res: 'food', icon: '🧊' },
  amber: { name: 'Resina de ámbar', res: 'amber', icon: '💎' },
  nectar: { name: 'Flor de néctar', res: 'food', icon: '🌼' },
  honeydew: { name: 'Gota de melaza', res: 'food', icon: '💧' },
  mushroom: { name: 'Seta', res: 'food', icon: '🍄' },
  crumbs: { name: 'Migas', res: 'food', icon: '🍞' },
  fruit: { name: 'Fruta caída', res: 'food', icon: '🍓' },
};

export const DIFFICULTIES = [
  { name: 'Apacible', desc: 'Rivales lentos y pocas amenazas. Ideal para construir.', ai: 0.55, creatures: 0.6, waveDelay: 1.6 },
  { name: 'Normal', desc: 'Un equilibrio entre crecer y defenderse.', ai: 0.85, creatures: 1, waveDelay: 1.1 },
  { name: 'Feroz', desc: 'Rivales agresivos y depredadores hambrientos.', ai: 1.2, creatures: 1.25, waveDelay: 0.85 },
  { name: 'Pesadilla', desc: 'Solo para reinas legendarias.', ai: 1.6, creatures: 1.5, waveDelay: 0.65 },
];

export const BIOMES = {
  meadow: { name: 'Pradera', desc: 'Hierba alta, flores y tréboles. Comida abundante.', grass: ['#5f9a3a', '#6fae43', '#4f8a33', '#7cba4c'], dirt: '#8b6a42', sand: '#cdb27a', accent: '#f6d34c' },
  forest: { name: 'Bosque', desc: 'Sombra, setas, hojarasca y mucho ámbar. Más depredadores.', grass: ['#3f6e34', '#4a7d3a', '#355f2d', '#567f3b'], dirt: '#6a4a2e', sand: '#9c8a5c', accent: '#d58bff' },
  garden: { name: 'Jardín seco', desc: 'Arena, piedras y migas humanas. Escaso pero con tesoros.', grass: ['#8ba04a', '#9aad55', '#7d9142', '#a7b860'], dirt: '#a07a4c', sand: '#e0c98f', accent: '#ff7b5c' },
} as const;
export type BiomeId = keyof typeof BIOMES;

export const MAP_SIZES = {
  small: { name: 'Pequeño', w: 130, h: 100 },
  medium: { name: 'Mediano', w: 180, h: 135 },
  large: { name: 'Grande', w: 240, h: 180 },
} as const;
export type MapSizeId = keyof typeof MAP_SIZES;

export const RIVAL_NAMES = ['Mandíbula Roja', 'Enjambre Negro', 'Las Tejedoras', 'Imperio Ceniza', 'Clan Espina', 'Horda Carmesí', 'Corte Sombría', 'Legión Salvaje'];
export const RIVAL_QUEENS = ['Reina Vorax', 'Reina Ixtla', 'Reina Morda', 'Reina Calyx', 'Reina Thessa', 'Reina Nyxa'];

export const ZONE_PREFIX = ['Pradera', 'Charca', 'Bosquecillo', 'Colina', 'Valle', 'Hondonada', 'Llanura', 'Cañada', 'Jardín', 'Claro', 'Pedregal', 'Ribera'];
export const ZONE_SUFFIX = ['de los Tréboles', 'Susurrante', 'de las Setas', 'del Rocío', 'Dorada', 'de la Luna', 'Escondida', 'de los Grillos', 'Olvidada', 'de Ámbar', 'del Viento', 'Brillante', 'de las Espinas', 'Sombría', 'de las Abejas', 'Perdida'];
