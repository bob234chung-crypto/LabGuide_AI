import type { Scene, SceneItem } from './types.js';
import { ancestors, itemBox, type Box } from './rules/diagram.js';
import { WORLD } from './scene.js';

export interface PlacedLabel {
  key: string;
  itemId: string;
  text: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  side: 'left' | 'right';
  extraIndex?: number;
}

export interface LabelLayoutOptions {
  /**
   * Move extra label lines off items and other labels. The canvas editor turns this off so a
   * label stays exactly where the student dragged it; the result view and export keep it on.
   */
  avoidOverlap?: boolean;
}

const LABEL_GAP = 24;
/** Rough width per character of the 15px Arial label text. */
export const LABEL_CHAR_WIDTH = 8.2;
const LABEL_HALF_HEIGHT = 10;
const CLEARANCE = 4;

function outerBox(scene: Scene, item: SceneItem): Box {
  const top = ancestors(scene, item.id).at(-1);
  const root = top ? scene.items.find((i) => i.id === top) ?? item : item;
  const a = itemBox(root);
  const b = itemBox(item);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Area covered by a label's text (the leader line is not included). */
export function labelTextBox(l: Pick<PlacedLabel, 'text' | 'x' | 'y' | 'side'>): Box {
  const w = l.text.length * LABEL_CHAR_WIDTH;
  return { x: l.side === 'left' ? l.x - w : l.x, y: l.y - LABEL_HALF_HEIGHT, w, h: LABEL_HALF_HEIGHT * 2 };
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

/** Flipping a label to the other side of its item costs as much as moving it this far. */
const FLIP_COST = 60;

/** Candidate moves from a label's chosen spot, cheapest first. Sideways moves cost more than vertical ones. */
const CANDIDATES: { dx: number; dy: number; flip: boolean }[] = (() => {
  const out: { dx: number; dy: number; flip: boolean; cost: number }[] = [];
  for (let dx = -400; dx <= 400; dx += 10) {
    for (let dy = -300; dy <= 300; dy += 6) {
      const cost = Math.hypot(dx * 1.5, dy);
      out.push({ dx, dy, flip: false, cost }, { dx, dy, flip: true, cost: cost + FLIP_COST });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
})();

function placeExtra(label: PlacedLabel, box: Box, obstacles: Box[]): PlacedLabel {
  const free = (c: PlacedLabel) => {
    const t = labelTextBox(c);
    return c.y + LABEL_HALF_HEIGHT <= WORLD.bench - 2 && !obstacles.some((o) => boxesOverlap(t, o, CLEARANCE));
  };
  const flipped: PlacedLabel = {
    ...label,
    side: label.side === 'left' ? 'right' : 'left',
    x: 2 * (box.x + box.w / 2) - label.x,
    ax: label.side === 'left' ? box.x + box.w - Math.min(5, box.w / 2) : box.x + Math.min(5, box.w / 2),
  };
  for (const c of CANDIDATES) {
    const base = c.flip ? flipped : label;
    const moved = { ...base, x: base.x + c.dx, y: base.y + c.dy };
    if (free(moved)) return moved;
  }
  return label;
}

/**
 * Leader-line labels. Item labels sit in a left and a right margin outside the whole setup
 * (textbook style), sorted by height so leader lines do not cross. Extra label lines start where
 * the student put them and, with `avoidOverlap`, move to the nearest spot clear of every item
 * and every other label.
 */
export function layoutLabels(scene: Scene, opts: LabelLayoutOptions = {}): PlacedLabel[] {
  const avoidOverlap = opts.avoidOverlap ?? true;
  const labelled = scene.items.filter((i) => i.label.trim());
  let minX = Infinity;
  let maxX = -Infinity;
  for (const it of scene.items) {
    const b = itemBox(it);
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.w);
  }
  const mid = (minX + maxX) / 2;
  const main: PlacedLabel[] = labelled.map((item) => {
    const box = itemBox(item);
    const outer = outerBox(scene, item);
    const cx = box.x + box.w / 2;
    const side: 'left' | 'right' = cx < mid || (cx === mid && outer.x + outer.w / 2 <= mid) ? 'left' : 'right';
    const ay = box.y + Math.min(box.h * 0.4, 40);
    return {
      key: `m-${item.id}`,
      itemId: item.id,
      text: item.label,
      side,
      x: side === 'left' ? minX - 40 : maxX + 40,
      y: ay,
      ax: side === 'left' ? box.x + Math.min(5, box.w / 2) : box.x + box.w - Math.min(5, box.w / 2),
      ay,
    };
  });
  for (const side of ['left', 'right'] as const) {
    const group = main.filter((l) => l.side === side).sort((a, b) => a.ay - b.ay || a.ax - b.ax);
    for (let i = 1; i < group.length; i++) {
      if (group[i].y - group[i - 1].y < LABEL_GAP) group[i].y = group[i - 1].y + LABEL_GAP;
    }
    const overflow = group.length ? group[group.length - 1].y - (WORLD.bench - 6) : 0;
    if (overflow > 0) for (const l of group) l.y -= overflow;
  }
  const obstacles: Box[] = [...scene.items.map(itemBox), ...main.map(labelTextBox)];
  const extras: PlacedLabel[] = [];
  scene.labels.forEach((l, i) => {
    const item = scene.items.find((it) => it.id === l.itemId);
    if (!item) return;
    const box = itemBox(item);
    const ax = Math.min(Math.max(l.anchor.x, box.x + 4), box.x + box.w - 4);
    const ay = Math.min(Math.max(l.anchor.y, box.y + 4), box.y + box.h - 4);
    let placed: PlacedLabel = {
      key: `x-${i}`,
      itemId: l.itemId,
      text: l.text,
      x: l.anchor.x,
      y: l.anchor.y,
      ax,
      ay,
      side: l.anchor.x < box.x + box.w / 2 ? 'left' : 'right',
      extraIndex: i,
    };
    if (avoidOverlap) {
      placed = placeExtra(placed, box, obstacles);
      obstacles.push(labelTextBox(placed));
    }
    extras.push(placed);
  });
  return [...main, ...extras];
}
