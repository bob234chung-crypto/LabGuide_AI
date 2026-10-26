import { apparatusName, getApparatus } from './apparatus.js';
import type { Scene, SceneItem } from './types.js';
import { ancestors } from './rules/diagram.js';

export const WORLD = { width: 1000, height: 640, bench: 580, grid: 10 } as const;
export const MAX_ITEMS = 60;
export const MAX_LABEL = 60;

export function snap(n: number, grid: number = WORLD.grid): number {
  return Math.round(n / grid) * grid;
}

export function descendants(scene: Scene, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of scene.containment) {
      if (c.parentId === pid && !out.includes(c.childId)) {
        out.push(c.childId);
        walk(c.childId);
      }
    }
  };
  walk(id);
  return out;
}

export function canContain(parentApparatusId: string, childApparatusId: string): boolean {
  return !!getApparatus(parentApparatusId)?.canContain?.includes(childApparatusId);
}

export function canConnect(a: string, b: string): boolean {
  return !!(getApparatus(a)?.canConnect?.includes(b) || getApparatus(b)?.canConnect?.includes(a));
}

export function containerOptions(scene: Scene, childId: string): SceneItem[] {
  const child = scene.items.find((i) => i.id === childId);
  if (!child) return [];
  const desc = descendants(scene, childId);
  return scene.items.filter(
    (p) => p.id !== childId && !desc.includes(p.id) && canContain(p.apparatusId, child.apparatusId),
  );
}

export function connectionOptions(scene: Scene, itemId: string): SceneItem[] {
  const item = scene.items.find((i) => i.id === itemId);
  if (!item) return [];
  return scene.items.filter((o) => o.id !== itemId && canConnect(item.apparatusId, o.apparatusId));
}

/** Position for a child placed in a parent, using the parent's snap point. */
export function snapIntoParent(parent: SceneItem, child: SceneItem): { x: number; y: number } {
  const pa = getApparatus(parent.apparatusId);
  const ca = getApparatus(child.apparatusId);
  const pt = pa?.containSnap?.[child.apparatusId] ?? pa?.containSnap?.default ?? { x: 0, y: 0 };
  return {
    x: Math.round(parent.x + pt.x - (ca?.width ?? 0) / 2),
    y: Math.round(parent.y + pt.y - (ca?.height ?? 0)),
  };
}

export function moveWithChildren(scene: Scene, id: string, dx: number, dy: number): Scene {
  const ids = new Set([id, ...descendants(scene, id)]);
  return {
    ...scene,
    items: scene.items.map((i) => (ids.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
    labels: scene.labels.map((l) =>
      ids.has(l.itemId) ? { ...l, anchor: { x: l.anchor.x + dx, y: l.anchor.y + dy } } : l,
    ),
  };
}

export function placeInside(scene: Scene, childId: string, parentId: string | null): Scene {
  let next: Scene = { ...scene, containment: scene.containment.filter((c) => c.childId !== childId) };
  if (!parentId) return next;
  const parent = next.items.find((i) => i.id === parentId);
  const child = next.items.find((i) => i.id === childId);
  if (!parent || !child || !canContain(parent.apparatusId, child.apparatusId)) return scene;
  if (ancestors(next, parentId).includes(childId)) return scene;
  next = { ...next, containment: [...next.containment, { childId, parentId }] };
  const pos = snapIntoParent(parent, child);
  return moveWithChildren(next, childId, pos.x - child.x, pos.y - child.y);
}

export function relationText(scene: Scene, childId: string): string {
  const link = scene.containment.find((c) => c.childId === childId);
  if (!link) return '';
  const parent = scene.items.find((i) => i.id === link.parentId);
  if (!parent) return '';
  const verb = getApparatus(parent.apparatusId)?.containVerb ?? 'inside';
  const word = verb === 'in' ? 'in' : verb;
  return `${word} ${parent.label || apparatusName(parent.apparatusId).toLowerCase()}`;
}

/** Server-side schema check for an untrusted scene. Returns a cleaned copy or throws. */
export function sanitizeScene(input: unknown): Scene {
  if (!input || typeof input !== 'object') throw new Error('scene must be an object');
  const raw = input as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('invalid number');
    return Math.min(hi, Math.max(lo, Math.round(n)));
  };
  const str = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max);

  const items: SceneItem[] = arr(raw.items)
    .slice(0, MAX_ITEMS)
    .map((it: any) => {
      if (!getApparatus(String(it?.apparatusId))) throw new Error('unknown apparatus');
      return {
        id: str(it.id, 40),
        apparatusId: String(it.apparatusId),
        x: num(it.x, -2000, 4000),
        y: num(it.y, -2000, 4000),
        rotation: num(it.rotation, -360, 360),
        label: str(it.label, MAX_LABEL),
      };
    });
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length || [...ids].some((id) => !id)) throw new Error('item ids must be unique');
  const byId = new Map(items.map((i) => [i.id, i]));

  const containment = arr(raw.containment)
    .map((c: any) => ({ childId: str(c?.childId, 40), parentId: str(c?.parentId, 40) }))
    .filter(
      (c) =>
        byId.has(c.childId) &&
        byId.has(c.parentId) &&
        c.childId !== c.parentId &&
        canContain(byId.get(c.parentId)!.apparatusId, byId.get(c.childId)!.apparatusId),
    )
    .filter((c, i, all) => all.findIndex((o) => o.childId === c.childId) === i);
  const partial: Scene = { items, containment, connections: [], labels: [] };
  for (const c of containment) {
    if (ancestors(partial, c.parentId).includes(c.childId)) throw new Error('containment cycle');
  }
  const connections = arr(raw.connections)
    .map((c: any) => ({ fromId: str(c?.fromId, 40), toId: str(c?.toId, 40) }))
    .filter((c) => byId.has(c.fromId) && byId.has(c.toId) && c.fromId !== c.toId)
    .slice(0, MAX_ITEMS);
  const labels = arr(raw.labels)
    .map((l: any) => ({
      itemId: str(l?.itemId, 40),
      text: str(l?.text, MAX_LABEL),
      anchor: { x: num(l?.anchor?.x, -2000, 4000), y: num(l?.anchor?.y, -2000, 4000) },
    }))
    .filter((l) => byId.has(l.itemId))
    .slice(0, MAX_ITEMS * 2);
  return { items, containment, connections, labels };
}
