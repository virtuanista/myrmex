// Bus de eventos simple: la simulación emite, el render/audio/UI escuchan.
type Fn = (d: any) => void;
const handlers = new Map<string, Fn[]>();
export function on(name: string, fn: Fn) {
  let l = handlers.get(name);
  if (!l) handlers.set(name, (l = []));
  l.push(fn);
}
export function emit(name: string, d: any = {}) {
  const l = handlers.get(name);
  if (l) for (const fn of l) fn(d);
}
