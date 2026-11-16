// Estado de interfaz (no se guarda en la partida).
import type { BuildingType, ChamberType } from '../game/defs';

export interface Marker { x: number; y: number; t: number; kind: 'move' | 'attack' | 'gather' | 'rally' | 'build' | 'ping' }
export const UI = {
  sel: new Set<number>(),         // ids de hormigas seleccionadas
  selStruct: 0, selCre: 0, selNode: 0, selChamber: 0,
  placing: null as null | { kind: 'building'; type: BuildingType } | { kind: 'chamber'; type: ChamberType } | { kind: 'decor'; type: string } | { kind: 'rally' },
  nestTool: 'none' as 'none' | 'dig' | 'undig',
  brush: 1,
  mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, right: false, inside: false },
  drag: null as null | { x0: number; y0: number; x1: number; y1: number; active: boolean },
  markers: [] as Marker[],
  showPher: true,
  showTerritory: true,
  hoverInfo: '',
  shake: 0,
  flash: 0,
  flashColor: '#fff',
  modalOpen: false,
  panelTab: 'colony',
  lastPing: null as null | { x: number; y: number; t: number },
  fps: 60,
};
export function addMarker(x: number, y: number, kind: Marker['kind']) {
  UI.markers.push({ x, y, t: 0, kind });
  if (UI.markers.length > 30) UI.markers.shift();
}
export function shake(amt: number) { UI.shake = Math.min(14, UI.shake + amt); }
export function flash(color: string, amt = 0.5) { UI.flash = Math.max(UI.flash, amt); UI.flashColor = color; }
