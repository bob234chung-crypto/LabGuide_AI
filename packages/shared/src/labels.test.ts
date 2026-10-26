import { describe, expect, it } from 'vitest';
import type { Scene, SceneItem } from './types.js';
import { itemBox } from './rules/diagram.js';
import { boxesOverlap, labelTextBox, layoutLabels } from './labels.js';
import { WORLD } from './scene.js';

const item = (id: string, apparatusId: string, x: number, y: number, label = ''): SceneItem => ({
  id,
  apparatusId,
  x,
  y,
  rotation: 0,
  label,
});

/** The live-site layout: an extra label on the beaker, added from the editor's default spot, landed on the stopwatch. */
function liveScene(): Scene {
  const items = [
    item('lamp', 'lamp', 140, 430, 'Lamp'),
    item('watch', 'stopwatch', 235, 520, 'Stopwatch'),
    item('beaker', 'beaker', 310, 440, 'Beaker'),
    item('rule', 'metre-rule', 450, 560, 'Metre rule'),
  ];
  const beaker = itemBox(items[2]);
  return {
    items,
    containment: [],
    connections: [],
    labels: [{ itemId: 'beaker', text: 'Water (heat shield)', anchor: { x: beaker.x - 50, y: beaker.y + beaker.h * 0.7 } }],
  };
}

function overlaps(scene: Scene, opts?: { avoidOverlap?: boolean }) {
  const labels = layoutLabels(scene, opts);
  const found: string[] = [];
  labels.forEach((l, i) => {
    const t = labelTextBox(l);
    for (const it of scene.items) if (boxesOverlap(t, itemBox(it))) found.push(`"${l.text}" on ${it.id}`);
    labels.slice(i + 1).forEach((o) => {
      if (boxesOverlap(t, labelTextBox(o))) found.push(`"${l.text}" on "${o.text}"`);
    });
  });
  return found;
}

describe('diagram label layout', () => {
  it('reproduces the live overlap when placement is left exactly where the student put it', () => {
    expect(overlaps(liveScene(), { avoidOverlap: false })).toContain('"Water (heat shield)" on watch');
  });

  it('moves an extra label off items and other labels in the clean diagram', () => {
    expect(overlaps(liveScene())).toEqual([]);
    const extra = layoutLabels(liveScene()).find((l) => l.extraIndex === 0)!;
    expect(extra.y + 10).toBeLessThanOrEqual(WORLD.bench);
    const beaker = itemBox(liveScene().items[2]);
    expect(extra.ax).toBeGreaterThanOrEqual(beaker.x);
    expect(extra.ax).toBeLessThanOrEqual(beaker.x + beaker.w);
  });

  it('keeps an extra label where it is when that spot is already clear', () => {
    const scene = liveScene();
    scene.labels[0].anchor = { x: 300, y: 380 };
    const extra = layoutLabels(scene).find((l) => l.extraIndex === 0)!;
    expect([extra.x, extra.y]).toEqual([300, 380]);
  });

  it('spreads several extra labels added at the same spot', () => {
    const scene = liveScene();
    const a = scene.labels[0];
    scene.labels.push({ ...a, text: 'Hot water' }, { ...a, text: 'Boiling tube of ethanol' });
    expect(overlaps(scene)).toEqual([]);
  });
});
