// Ejecución en el anfitrión de las órdenes enviadas por el invitado.
import { registerCmd } from './net';
import * as A from '../game/actions';
import { G } from '../game/state';
import { chamberById, designateDig } from '../game/nest';

export function initNetCommands() {
  const S = () => G.S;
  registerCmd('command', (ids: number[], x, y, target, nodeId, structId, am, shift) => A.commandSelected(new Set(ids), x, y, target, nodeId, structId, am, shift));
  registerCmd('stop', (ids: number[]) => A.stopSelected(new Set(ids)));
  registerCmd('return', (ids: number[]) => A.returnSelected(new Set(ids)));
  registerCmd('placeBuilding', (t, x, y) => A.placeBuilding(t, x, y));
  registerCmd('cancelStructure', (id: number) => { const s = S().structures.find(x => x.id === id); if (s) A.cancelStructure(s); });
  registerCmd('rally', (x, y) => A.setRally(x, y));
  registerCmd('resetRally', () => A.resetRally());
  registerCmd('queue', (c, n) => A.queueCaste(c, n));
  registerCmd('dequeue', (i: number) => A.dequeue(i));
  registerCmd('research', (id: string) => A.startResearch(id));
  registerCmd('cancelResearch', () => A.cancelResearch());
  registerCmd('placeChamber', (t, cx, cy) => A.tryPlaceChamber(t, cx, cy));
  registerCmd('upgradeChamber', (id: number) => { const c = chamberById(id); if (c) A.upgradeChamber(c); });
  registerCmd('demolishChamber', (id: number) => { const c = chamberById(id); if (c) A.demolishChamber(c); });
  registerCmd('placeDecor', (id: number, k, x, y) => { const c = chamberById(id); if (c) A.placeDecor(c, k, x, y); });
  registerCmd('removeDecor', (id: number, i: number) => { const c = chamberById(id); if (c) A.removeDecor(c, i); });
  registerCmd('alloc', (f, d, i) => A.setAlloc(f, d, i));
  registerCmd('prio', (k, v) => A.setPrio(k, v));
  registerCmd('auto', (v: boolean) => A.setAutoWorkers(v));
  registerCmd('speed', (v: number, p: boolean) => A.setSpeed(v, p));
  registerCmd('gather8', (id: number) => A.sendGatherers(id));
  registerCmd('dig', (cells: number[]) => { for (let i = 0; i < cells.length; i += 3) designateDig(cells[i], cells[i + 1], !!cells[i + 2]); });
}
