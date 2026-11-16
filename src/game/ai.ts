// IA de las colonias rivales.
import { BUILDINGS, CASTES, CasteId, DIFFICULTIES } from './defs';
import { AS, Colony, G, Structure, TS, newId } from './state';
import { spawnAnt, CC } from './colony';
import { passableAt } from './world';
import { emit } from '../core/bus';
import { dist2, rnd } from '../core/util';

export function updateAI(dt: number) {
  const S = G.S;
  const diff = DIFFICULTIES[S.cfg.difficulty];
  for (const col of S.colonies) {
    if (col.isPlayer || !col.alive) continue;
    const ai = col.ai;
    const nest = S.structures.find(s => s.id === col.nestId);
    if (!nest) continue;
    const minutes = S.time / 60;
    ai.power = Math.min(3.2, diff.ai * (1 + minutes * 0.018));
    // ingresos pasivos (la colonia también se alimenta bajo tierra)
    col.res.food += 0.3 * ai.power * dt;
    col.res.leaves += 0.2 * dt;
    col.res.amber += 0.02 * ai.power * dt;
    const cc = CC[col.id];
    const workers = (cc?.byCaste.worker || 0);
    const military = cc?.military || 0;
    const wantW = Math.min(70, Math.round((9 + minutes * 1.0) * Math.sqrt(diff.ai)));
    const wantM = Math.min(80, Math.round((3 + minutes * 0.5) * diff.ai));
    ai.spawnTimer -= dt * (0.7 + 0.3 * ai.power);
    if (ai.spawnTimer <= 0) {
      ai.spawnTimer = 5;
      let caste: CasteId | null = null;
      if (workers < wantW && (military >= wantM * 0.5 || workers < 6)) caste = 'worker';
      else if (military < wantM) {
        const r = Math.random();
        caste = minutes > 22 && r < 0.18 ? 'major' : minutes > 10 && r < 0.45 ? 'acid' : 'soldier';
      } else if (workers < wantW) caste = 'worker';
      if (caste) {
        const cost = CASTES[caste].cost.food || 10;
        if (col.res.food >= cost) {
          col.res.food -= cost;
          const a = spawnAnt(col.id, caste, 0, nest.x + rnd(-8, 8), nest.y + rnd(-8, 8));
          a.st = CASTES[caste].military ? AS.Guard : AS.Search;
        }
      }
    }
    // Vida del hormiguero escala con la fuerza
    const wantHp = Math.round(3800 * (0.8 + 0.2 * ai.power));
    if (nest.mhp < wantHp) { nest.hp += wantHp - nest.mhp; nest.mhp = wantHp; }
    // Refuerzos de emergencia
    (ai as any)._emg = ((ai as any)._emg ?? 0) - dt;
    if (nest.hp < nest.mhp * 0.5 && (ai as any)._emg <= 0) {
      (ai as any)._emg = 120;
      const k = 2 + Math.floor(ai.power);
      for (let i = 0; i < k; i++) {
        const a = spawnAnt(col.id, Math.random() < 0.25 ? 'major' : 'soldier', 0, nest.x + rnd(-10, 10), nest.y + rnd(-10, 10));
        a.st = AS.Guard;
      }
      emit('emergency', { col, x: nest.x, y: nest.y });
    }
    // Defensa: si atacan el nido, todos a defender
    const lastHp = (ai as any)._lastHp ?? nest.hp;
    if (nest.hp < lastHp - 0.5) {
      (ai as any)._def = 12;
    }
    (ai as any)._lastHp = nest.hp;
    if ((ai as any)._def > 0) {
      (ai as any)._def -= dt;
      if (Math.floor((ai as any)._def * 2) !== Math.floor(((ai as any)._def + dt) * 2)) {
        for (const a of S.ants) {
          if (a.col !== col.id || !CASTES[a.caste].military || a.order) continue;
          if (dist2(a.x, a.y, nest.x, nest.y) < 500 * 500 && a.st !== AS.Attack) {
            a.order = { k: 'move', x: nest.x + rnd(-30, 30), y: nest.y + rnd(-30, 30), id: 0, am: true };
            a.st = AS.Move;
          }
        }
      }
    }
    // Oleadas
    ai.waveTimer -= dt;
    if (ai.waveTimer <= 0) {
      ai.waveN++;
      ai.waveTimer = (220 + Math.random() * 110) * diff.waveDelay / Math.min(1.6, 0.8 + ai.waveN * 0.05);
      launchWave(col);
    }
    // Expansión
    ai.expandTimer -= dt;
    if (ai.expandTimer <= 0) {
      ai.expandTimer = 200 + Math.random() * 160;
      const own = S.structures.filter(s => s.col === col.id).length;
      if (own < 2 + Math.floor(minutes / 12)) tryExpand(col, nest);
    }
  }
}

export function launchWave(col: Colony, forceTarget = -1) {
  const S = G.S;
  const nest = S.structures.find(s => s.id === col.nestId);
  if (!nest) return;
  // objetivo
  const alive = S.colonies.filter(c => c.alive && c.id !== col.id);
  if (!alive.length) return;
  let target: Colony = alive[0];
  if (forceTarget >= 0) target = S.colonies[forceTarget];
  else {
    // preferir colonias cercanas (el jugador algo más atractivo)
    const ws = alive.map(c => {
      const n2 = S.structures.find(s => s.id === c.nestId);
      const d = n2 ? Math.hypot(n2.x - nest.x, n2.y - nest.y) : 5000;
      return (c.isPlayer ? 1.35 : 1) / Math.pow(d + 300, 2);
    });
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < alive.length; i++) { r -= ws[i]; if (r <= 0) { target = alive[i]; break; } }
  }
  // estructura objetivo: la más cercana de esa colonia
  let ts: Structure | null = null, bd = 1e12;
  for (const s of S.structures) {
    if (s.col !== target.id) continue;
    const d = dist2(s.x, s.y, nest.x, nest.y);
    if (d < bd) { bd = d; ts = s; }
  }
  if (!ts) return;
  // refuerzos de oleada gratuitos
  const bonus = Math.min(10, Math.floor(col.ai.waveN * 1.0 * col.ai.power));
  for (let i = 0; i < bonus; i++) {
    const r = Math.random();
    const caste: CasteId = S.time > 1200 && r < 0.15 ? 'major' : S.time > 600 && r < 0.4 ? 'acid' : 'soldier';
    const a = spawnAnt(col.id, caste, 0, nest.x + rnd(-14, 14), nest.y + rnd(-14, 14));
    a.st = AS.Guard;
  }
  const soldiers = S.ants.filter(a => a.col === col.id && CASTES[a.caste].military && a.layer === 0 && !a.order);
  const n = Math.max(3, Math.floor(soldiers.length * (0.45 + Math.random() * 0.15)));
  const group = soldiers.slice(0, n);
  const cap = group.length ? Math.min(...group.map(a => CASTES[a.caste].speed)) : 0;
  for (const a of group) {
    a.order = { k: 'move', x: ts.x + rnd(-25, 25), y: ts.y + rnd(-25, 25), id: 0, am: true };
    (a.order as any).cap = cap;
    a.st = AS.Move;
  }
  if (target.isPlayer && group.length) {
    emit('raid', { col, n: group.length, x: ts.x, y: ts.y, sx: nest.x, sy: nest.y });
  }
}

function tryExpand(col: Colony, nest: Structure) {
  const S = G.S;
  for (let k = 0; k < 12; k++) {
    const ang = Math.random() * Math.PI * 2, r = 220 + Math.random() * 220;
    const x = nest.x + Math.cos(ang) * r, y = nest.y + Math.sin(ang) * r;
    if (!passableAt(x, y)) continue;
    if (S.structures.some(s => dist2(s.x, s.y, x, y) < 200 * 200)) continue;
    const s: Structure = { id: newId(), type: Math.random() < 0.3 ? 'tower' : 'outpost', col: col.id, x, y, hp: 50, mhp: BUILDINGS.outpost.hp, built: false, prog: 0, cd: 0, t: 0, lvl: 1 };
    if (s.type === 'tower') s.mhp = BUILDINGS.tower.hp;
    S.structures.push(s);
    void TS;
    return;
  }
}
