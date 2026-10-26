import { ancestors, getApparatus, itemBox, WORLD, type Box, type Scene, type SceneItem } from '@labguide/shared';
import { ApparatusDrawing } from './ApparatusSvg';

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

function outerBox(scene: Scene, item: SceneItem): Box {
  const top = ancestors(scene, item.id).at(-1);
  const root = top ? scene.items.find((i) => i.id === top) ?? item : item;
  const a = itemBox(root);
  const b = itemBox(item);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const LABEL_GAP = 24;

/**
 * Default leader-line label for every item. Labels sit in a left and a right margin
 * outside the whole setup (textbook style), sorted by height so leader lines do not cross.
 */
export function layoutLabels(scene: Scene): PlacedLabel[] {
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
  const extras: PlacedLabel[] = scene.labels.map((l, i) => {
    const item = scene.items.find((it) => it.id === l.itemId)!;
    const box = itemBox(item);
    const ax = Math.min(Math.max(l.anchor.x, box.x + 4), box.x + box.w - 4);
    const ay = Math.min(Math.max(l.anchor.y, box.y + 4), box.y + box.h - 4);
    return {
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
  });
  return [...main, ...extras];
}

function connectPoint(item: SceneItem, role: 'from' | 'to'): { x: number; y: number } {
  const b = itemBox(item);
  switch (item.apparatusId) {
    case 'delivery-tube':
      return { x: b.x + b.w - 2, y: b.y + 6 };
    case 'gas-syringe':
      return { x: b.x + 2, y: b.y + b.h / 2 };
    case 'inverted-measuring-cylinder':
      return { x: b.x + b.w / 2, y: b.y + b.h - 12 };
    default:
      return role === 'from' ? { x: b.x + b.w / 2, y: b.y + 8 } : { x: b.x + b.w / 2, y: b.y + 10 };
  }
}

export function connectionPath(scene: Scene, fromId: string, toId: string): string | null {
  let from = scene.items.find((i) => i.id === fromId);
  let to = scene.items.find((i) => i.id === toId);
  if (!from || !to) return null;
  if (to.apparatusId === 'delivery-tube' && from.apparatusId !== 'delivery-tube') [from, to] = [to, from];
  const a = connectPoint(from, 'from');
  const b = connectPoint(to, 'to');
  if (to.apparatusId === 'inverted-measuring-cylinder') {
    return `M${a.x} ${a.y} L${b.x - 20} ${a.y} Q${b.x} ${a.y} ${b.x} ${a.y + 20} L${b.x} ${b.y}`;
  }
  if (to.apparatusId === 'boiling-tube' || to.apparatusId === 'test-tube') {
    return `M${a.x} ${a.y} L${b.x} ${a.y} L${b.x} ${b.y + 30}`;
  }
  const midX = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} L${midX} ${a.y} L${midX} ${b.y} L${b.x} ${b.y}`;
}

export function renderOrder(scene: Scene): SceneItem[] {
  return scene.items
    .map((it, i) => ({ it, i, depth: ancestors(scene, it.id).length }))
    .sort((a, b) => a.depth - b.depth || a.i - b.i)
    .map((x) => x.it);
}

export function ItemGraphic({ item }: { item: SceneItem }) {
  const a = getApparatus(item.apparatusId);
  if (!a) return null;
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${a.width / 2} ${a.height / 2})`}>
      <ApparatusDrawing a={a} />
    </g>
  );
}

export function Connections({ scene }: { scene: Scene }) {
  return (
    <g aria-hidden="true">
      {scene.connections.map((c) => {
        const d = connectionPath(scene, c.fromId, c.toId);
        if (!d) return null;
        return (
          <g key={`${c.fromId}-${c.toId}`} fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d={d} stroke="#1b2a4a" strokeWidth={6} />
            <path d={d} stroke="#fffefb" strokeWidth={2.5} />
          </g>
        );
      })}
    </g>
  );
}

export function LabelGraphic({ l, fontSize = 15 }: { l: PlacedLabel; fontSize?: number }) {
  return (
    <g>
      <line x1={l.ax} y1={l.ay} x2={l.side === 'left' ? l.x + 4 : l.x - 4} y2={l.y} stroke="#1b2a4a" strokeWidth={1.3} />
      <circle cx={l.ax} cy={l.ay} r={2} fill="#1b2a4a" />
      <text x={l.x} y={l.y + 5} fontSize={fontSize} fill="#1b2a4a" fontFamily="Arial, Helvetica, sans-serif"
        textAnchor={l.side === 'left' ? 'end' : 'start'}>
        {l.text}
      </text>
    </g>
  );
}

export function Bench({ x0, x1 }: { x0: number; x1: number }) {
  const y = WORLD.bench;
  const hatches = [];
  for (let x = Math.ceil(x0 / 20) * 20; x < x1; x += 20) hatches.push(`M${x} ${y} l-10 12`);
  return (
    <g aria-hidden="true">
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#1b2a4a" strokeWidth={2.5} />
      <path d={hatches.join(' ')} stroke="#1b2a4a" strokeWidth={1} />
    </g>
  );
}

export function sceneBounds(scene: Scene, pad = 40): Box {
  const labels = layoutLabels(scene);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const it of scene.items) {
    const b = itemBox(it);
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  }
  for (const l of labels) {
    const w = l.text.length * 8.2;
    xs.push(l.side === 'left' ? l.x - w : l.x + w, l.ax);
    ys.push(l.y - 12, l.y + 12);
  }
  if (!xs.length) return { x: 0, y: 0, w: WORLD.width, h: WORLD.height };
  ys.push(WORLD.bench + 14);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
}

/** Clean, labelled 2D diagram (no grid, no handles), used for the result view and export. */
export function CleanDiagram({ scene, title, svgRef }: { scene: Scene; title: string; svgRef?: React.Ref<SVGSVGElement> }) {
  const b = sceneBounds(scene);
  const labels = layoutLabels(scene);
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`${b.x} ${b.y - 30} ${b.w} ${b.h + 30}`}
      className="result-svg" role="img" aria-label={`Labelled diagram: ${title}. ${scene.items.map((i) => i.label || 'unlabelled item').join(', ')}.`}>
      <rect x={b.x} y={b.y - 30} width={b.w} height={b.h + 30} fill="#ffffff" />
      <text x={b.x + b.w / 2} y={b.y - 6} textAnchor="middle" fontSize={18} fontWeight={700} fill="#1b2a4a" fontFamily="Arial, Helvetica, sans-serif">
        {title}
      </text>
      <Bench x0={b.x + 10} x1={b.x + b.w - 10} />
      {renderOrder(scene).map((it) => <ItemGraphic key={it.id} item={it} />)}
      <Connections scene={scene} />
      {labels.map((l) => <LabelGraphic key={l.key} l={l} />)}
    </svg>
  );
}
