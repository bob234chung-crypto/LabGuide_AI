import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  apparatusName,
  canConnect,
  connectionOptions,
  containerOptions,
  descendants,
  emptyScene,
  getApparatus,
  hasSafetyBlock,
  itemBox,
  moveWithChildren,
  placeInside,
  relationText,
  snap,
  WORLD,
  type Apparatus,
  type DiagramCheck,
  type Scene,
  type SceneItem,
} from '@labguide/shared';
import { api } from '../../api';
import { errorMessage, useSession } from '../../session';
import { useSaveStatus } from '../../saveStatus';
import { useIsDesktop } from '../../hooks';
import { useApparatusLibrary } from '../../useApparatus';
import { CheckList, ErrorState, Icon, SafetyBlock, useAnnouncer } from '../../components/ui';
import { ApparatusDrawing, ApparatusThumb } from '../../canvas/ApparatusSvg';
import { Bench, Connections, LabelGraphic, layoutLabels, renderOrder, sceneBounds } from '../../canvas/render';
import { useHistory } from '../../canvas/useHistory';

let idSeq = 0;
const newItemId = () => `it${Date.now().toString(36)}${(idSeq++).toString(36)}`;

interface View {
  x: number;
  y: number;
  w: number;
}

type Drag =
  | { kind: 'item'; id: string; startX: number; startY: number; base: Scene; moved: boolean; pointerId: number }
  | { kind: 'label'; index: number; startX: number; startY: number; base: Scene; pointerId: number }
  | { kind: 'pan'; startClientX: number; startClientY: number; view: View; pointerId: number };

function nameOf(scene: Scene, id: string): string {
  const it = scene.items.find((i) => i.id === id);
  return it ? it.label || apparatusName(it.apparatusId) : 'item';
}

function inside(box: { x: number; y: number; w: number; h: number }, px: number, py: number, m = 12) {
  return px >= box.x - m && px <= box.x + box.w + m && py >= box.y - m && py <= box.y + box.h + m;
}

/** Leftmost bench position where a new item of this width does not overlap a free-standing item. */
function freeBenchX(scene: Scene, width: number): number {
  const roots = scene.items
    .filter((i) => !scene.containment.some((c) => c.childId === i.id))
    .map(itemBox)
    .filter((b) => b.y + b.h > WORLD.bench - 200);
  for (let x = 40; x + width <= WORLD.width - 20; x += 10) {
    if (roots.every((b) => x + width + 20 <= b.x || x >= b.x + b.w + 20)) return x;
  }
  return snap(60 + ((scene.items.length * 70) % 800));
}

/** After a drop: snap into a container, connect tubes, or rest on the bench. */
function settle(scene: Scene, id: string): { scene: Scene; message: string } {
  const item = scene.items.find((i) => i.id === id)!;
  const box = itemBox(item);
  const px = box.x + box.w / 2;
  const py = box.y + box.h - 4;
  const desc = new Set(descendants(scene, id));
  const candidates = scene.items
    .filter((p) => p.id !== id && !desc.has(p.id) && getApparatus(p.apparatusId)?.canContain?.includes(item.apparatusId))
    .filter((p) => inside(itemBox(p), px, py, 16))
    .sort((a, b) => itemBox(a).w * itemBox(a).h - itemBox(b).w * itemBox(b).h);
  const name = nameOf(scene, id);
  let next = scene;
  let message = '';
  if (candidates[0]) {
    next = placeInside(scene, id, candidates[0].id);
    message = `${name} placed ${relationText(next, id)}.`;
  } else {
    const wasIn = scene.containment.find((c) => c.childId === id);
    next = wasIn ? placeInside(scene, id, null) : scene;
    const moved = next.items.find((i) => i.id === id)!;
    const b = itemBox(moved);
    if (Math.abs(b.y + b.h - WORLD.bench) < 36) {
      next = moveWithChildren(next, id, 0, WORLD.bench - (b.y + b.h));
      message = `${name} placed on the bench.`;
    } else message = `${name} moved.`;
    if (wasIn) message = `${name} is no longer ${relationText(scene, id)}. ${message}`;
  }
  const me = next.items.find((i) => i.id === id)!;
  const meBox = itemBox(me);
  const grow = { x: meBox.x - 24, y: meBox.y - 24, w: meBox.w + 48, h: meBox.h + 48 };
  const linkable = next.items.filter(
    (o) =>
      o.id !== id &&
      canConnect(me.apparatusId, o.apparatusId) &&
      (me.apparatusId === 'delivery-tube' || o.apparatusId === 'delivery-tube') &&
      !next.connections.some((c) => (c.fromId === id && c.toId === o.id) || (c.toId === id && c.fromId === o.id)),
  );
  for (const o of linkable) {
    const ob = itemBox(o);
    const overlap = ob.x < grow.x + grow.w && grow.x < ob.x + ob.w && ob.y < grow.y + grow.h && grow.y < ob.y + ob.h;
    if (overlap) {
      next = { ...next, connections: [...next.connections, { fromId: id, toId: o.id }] };
      message += ` ${name} connected to ${nameOf(next, o.id)}.`;
    }
  }
  return { scene: next, message };
}

export function CanvasEditor() {
  const { session, plan } = useSession();
  const nav = useNavigate();
  const desktop = useIsDesktop();
  const { data: lib, all, error: libError, retry: retryLib } = useApparatusLibrary(plan.theme.theme);
  const hist = useHistory<Scene>(emptyScene());
  const scene = hist.present;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setDiagramId] = useState<string | null>(null);
  const [checks, setChecks] = useState<DiagramCheck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trayId, setTrayId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ x: 0, y: 0, w: WORLD.width });
  const [aspect, setAspect] = useState(WORLD.height / WORLD.width);
  const [measured, setMeasured] = useState(false);
  const [ghost, setGhost] = useState<{ apparatusId: string; x: number; y: number; startX: number; startY: number; active: boolean } | null>(null);
  const [sheetH, setSheetH] = useState(260);
  const [sheetTab, setSheetTab] = useState<'tray' | 'placed' | 'checks'>('tray');
  const [versionMsg, setVersionMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const { announce, region } = useAnnouncer();
  const { setStatus, setRetry } = useSaveStatus();

  /* ---------- Load & autosave ---------- */
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.diagrams(session.id);
      const start = res.working?.scene ?? emptyScene();
      hist.reset(start);
      setDiagramId(res.working?.id ?? null);
      setChecks(res.working?.checks ?? []);
      setLoaded(true);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const latest = useRef(scene);
  latest.current = scene;
  const dirty = useRef(false);
  const saveNow = useCallback(
    async (keepalive = false) => {
      if (!dirty.current) return;
      dirty.current = false;
      setStatus('saving');
      try {
        const d = await api.saveWorking(session.id, latest.current, keepalive);
        setDiagramId(d.id);
        setChecks(d.checks);
        setStatus(dirty.current ? 'saving' : 'saved');
        setSaveErr(null);
        setRetry(null);
      } catch (e) {
        dirty.current = true;
        setStatus('error');
        setSaveErr(errorMessage(e));
        setRetry(() => void saveNow());
      }
    },
    [session.id, setStatus, setRetry],
  );
  const firstRender = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (drag.current) return;
    dirty.current = true;
    setStatus('saving');
    const t = window.setTimeout(() => void saveNow(), 800);
    return () => window.clearTimeout(t);
  }, [scene, loaded, saveNow, setStatus]);
  useEffect(() => {
    const onHide = () => void saveNow(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void saveNow(true);
      setStatus('idle');
    };
  }, [saveNow, setStatus]);

  /* ---------- Geometry ---------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        setAspect(r.height / r.width);
        setMeasured(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, desktop]);
  const viewBox = `${view.x} ${view.y} ${view.w} ${view.w * aspect}`;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  }, []);

  const zoom = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const w = Math.min(3000, Math.max(250, v.w / factor));
        const ox = cx ?? v.x + v.w / 2;
        const oy = cy ?? v.y + (v.w * aspect) / 2;
        return { x: ox - ((ox - v.x) * w) / v.w, y: oy - ((oy - v.y) * w) / v.w, w };
      });
    },
    [aspect],
  );
  const fit = useCallback(() => {
    if (!latest.current.items.length) {
      setView({ x: 0, y: 0, w: WORLD.width });
      return;
    }
    const b = sceneBounds(latest.current, 30, layoutLabels(latest.current, { avoidOverlap: false }));
    const w = Math.max(b.w, b.h / aspect, 300);
    setView({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - (w * aspect) / 2, w });
  }, [aspect]);

  const fittedOnce = useRef(false);
  useEffect(() => {
    if (loaded && measured && !fittedOnce.current && latest.current.items.length) {
      fittedOnce.current = true;
      fit();
    }
  }, [loaded, measured, fit]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toWorld, zoom, loaded, desktop]);

  /* ---------- Scene operations ---------- */
  const focusItem = (id: string) => window.setTimeout(() => document.getElementById(`ci-${id}`)?.focus(), 40);

  function addItem(apparatusId: string, at?: { x: number; y: number }) {
    const a = getApparatus(apparatusId);
    if (!a) return;
    if (scene.items.length >= 60) {
      announce('The canvas is full. Remove an item first.');
      return;
    }
    const id = newItemId();
    let x: number;
    let y: number;
    if (at) {
      x = snap(at.x - a.width / 2);
      y = snap(at.y - a.height / 2);
    } else {
      x = freeBenchX(scene, a.width);
      y = WORLD.bench - a.height;
    }
    const item: SceneItem = { id, apparatusId, x, y, rotation: 0, label: a.name };
    const added: Scene = { ...scene, items: [...scene.items, item] };
    const { scene: settled, message } = at ? settle(added, id) : { scene: added, message: '' };
    hist.commit(settled);
    setSelectedId(id);
    announce(`${a.name} added to the canvas. ${message} Use the arrow keys to move it.`);
    focusItem(id);
  }

  function update(fn: (s: Scene) => Scene, message?: string) {
    hist.commit(fn(scene));
    if (message) announce(message);
  }

  function removeItem(id: string) {
    const name = nameOf(scene, id);
    const kids = new Set(scene.containment.filter((c) => c.parentId === id).map((c) => c.childId));
    update(
      (s) => ({
        items: s.items.filter((i) => i.id !== id),
        containment: s.containment.filter((c) => c.childId !== id && c.parentId !== id),
        connections: s.connections.filter((c) => c.fromId !== id && c.toId !== id),
        labels: s.labels.filter((l) => l.itemId !== id),
      }),
      `${name} removed.${kids.size ? ' Items inside it are now on their own.' : ''}`,
    );
    if (selectedId === id) setSelectedId(null);
  }

  function duplicate(id: string) {
    const it = scene.items.find((i) => i.id === id);
    if (!it) return;
    const copy = { ...it, id: newItemId(), x: it.x + 30, y: it.y - 30 };
    update((s) => ({ ...s, items: [...s.items, copy] }), `${nameOf(scene, id)} duplicated.`);
    setSelectedId(copy.id);
    focusItem(copy.id);
  }

  function rotate(id: string) {
    update(
      (s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i)) }),
      `${nameOf(scene, id)} rotated to ${((scene.items.find((i) => i.id === id)?.rotation ?? 0) + 90) % 360} degrees.`,
    );
  }

  function addLabel(id: string) {
    const it = scene.items.find((i) => i.id === id);
    if (!it) return;
    const b = itemBox(it);
    const right = b.x + b.w / 2 >= WORLD.width / 2;
    update(
      (s) => ({
        ...s,
        labels: [...s.labels, { itemId: id, text: 'New label', anchor: { x: right ? b.x + b.w + 50 : b.x - 50, y: b.y + b.h * 0.7 } }],
      }),
      `Label line added to ${nameOf(scene, id)}. Edit its text in the Placed items list.`,
    );
  }

  function setContainer(childId: string, parentId: string | null) {
    const next = placeInside(scene, childId, parentId);
    hist.commit(next);
    announce(parentId ? `${nameOf(scene, childId)} placed ${relationText(next, childId)}.` : `${nameOf(scene, childId)} is not inside anything now.`);
  }

  function setConnection(id: string, targetId: string | null) {
    update(
      (s) => ({
        ...s,
        connections: [
          ...s.connections.filter((c) => c.fromId !== id && c.toId !== id),
          ...(targetId ? [{ fromId: id, toId: targetId }] : []),
        ],
      }),
      targetId ? `${nameOf(scene, id)} connected to ${nameOf(scene, targetId)}.` : `${nameOf(scene, id)} disconnected.`,
    );
  }

  /* ---------- Pointer: items, labels, pan ---------- */
  function onItemPointerDown(e: RPointerEvent, id: string) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = toWorld(e.clientX, e.clientY);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'item', id, startX: p.x, startY: p.y, base: scene, moved: false, pointerId: e.pointerId };
    setSelectedId(id);
  }
  function onLabelPointerDown(e: RPointerEvent, index: number) {
    e.stopPropagation();
    const p = toWorld(e.clientX, e.clientY);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'label', index, startX: p.x, startY: p.y, base: scene, pointerId: e.pointerId };
  }
  function onBgPointerDown(e: RPointerEvent) {
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'pan', startClientX: e.clientX, startClientY: e.clientY, view, pointerId: e.pointerId };
    setSelectedId(null);
  }
  function onPointerMove(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const svg = svgRef.current!;
      const scale = d.view.w / svg.getBoundingClientRect().width;
      setView({ ...d.view, x: d.view.x - (e.clientX - d.startClientX) * scale, y: d.view.y - (e.clientY - d.startClientY) * scale });
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    const dx = snap(p.x - d.startX);
    const dy = snap(p.y - d.startY);
    if (d.kind === 'item') {
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 10) return;
      d.moved = true;
      hist.preview(moveWithChildren(d.base, d.id, dx, dy));
    } else {
      hist.preview({
        ...d.base,
        labels: d.base.labels.map((l, i) => (i === d.index ? { ...l, anchor: { x: l.anchor.x + dx, y: l.anchor.y + dy } } : l)),
      });
    }
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'item') {
      if (!d.moved) {
        hist.cancelPreview();
        return;
      }
      const { scene: settled, message } = settle(latest.current, d.id);
      hist.commit(settled);
      announce(message);
    } else {
      hist.commit(latest.current);
    }
  }

  function onItemKeyDown(e: RKeyboardEvent, id: string) {
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      let next = moveWithChildren(scene, id, dx, dy);
      const link = next.containment.find((c) => c.childId === id);
      let msg = '';
      if (link) {
        const parent = next.items.find((i) => i.id === link.parentId)!;
        const me = itemBox(next.items.find((i) => i.id === id)!);
        if (!inside(itemBox(parent), me.x + me.w / 2, me.y + me.h - 4, 4)) {
          msg = ` ${nameOf(scene, id)} is no longer ${relationText(scene, id)}.`;
          next = { ...next, containment: next.containment.filter((c) => c.childId !== id) };
        }
      }
      hist.commit(next);
      const it = next.items.find((i) => i.id === id)!;
      announce(`${nameOf(scene, id)} at x ${it.x}, y ${it.y}.${msg}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeItem(id);
    } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      rotate(id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedId(id);
      document.getElementById(`placed-${id}`)?.focus();
    }
  }

  function onLabelKeyDown(e: RKeyboardEvent, index: number) {
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!moves[e.key]) return;
    e.preventDefault();
    const [dx, dy] = moves[e.key];
    update((s) => ({ ...s, labels: s.labels.map((l, i) => (i === index ? { ...l, anchor: { x: l.anchor.x + dx, y: l.anchor.y + dy } } : l)) }));
  }

  function onFrameKeyDown(e: RKeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) hist.redo();
      else hist.undo();
      announce(e.shiftKey ? 'Redo.' : 'Undo.');
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      hist.redo();
      announce('Redo.');
    } else if (!mod && (e.key === '+' || e.key === '=')) zoom(1.2);
    else if (!mod && (e.key === '-' || e.key === '_')) zoom(1 / 1.2);
    else if (!mod && e.key === '0') fit();
  }

  /* ---------- Tray drag (pointer) ---------- */
  function onTrayPointerDown(e: RPointerEvent, apparatusId: string, viaGrip: boolean) {
    if (e.pointerType !== 'mouse' && !viaGrip) return;
    if (e.button !== 0) return;
    setGhost({ apparatusId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, active: false });
  }
  useEffect(() => {
    if (!ghost) return;
    const move = (e: PointerEvent) => {
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY, active: g.active || Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 8 } : g));
    };
    const up = (e: PointerEvent) => {
      setGhost((g) => {
        if (g?.active && svgRef.current) {
          const r = svgRef.current.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            const p = toWorld(e.clientX, e.clientY);
            window.setTimeout(() => addItem(g.apparatusId, p), 0);
          } else announce('Dropped outside the canvas. Nothing was added.');
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost?.apparatusId, ghost?.startX]);

  /* ---------- Derived ---------- */
  const labels = useMemo(() => layoutLabels(scene, { avoidOverlap: false }), [scene]);
  const selected = scene.items.find((i) => i.id === selectedId) ?? null;
  const blocked = hasSafetyBlock(checks);
  const blockedIds = new Set(checks.filter((c) => c.severity === 'safety_block' && !c.passed).flatMap((c) => c.itemIds ?? []));

  const trayGroups: { title: string; items: Apparatus[] }[] = useMemo(() => {
    if (!lib) return [];
    const fromPlan = plan.apparatus.selected.map((id) => all.find((a) => a.id === id)).filter((a): a is Apparatus => !!a);
    const planIds = new Set(fromPlan.map((a) => a.id));
    const isCustom = !lib.themeItems.length;
    const q = query.trim().toLowerCase();
    const groups = [
      { title: 'From your plan', items: fromPlan },
      ...(isCustom
        ? [
            { title: 'Common', items: lib.common.filter((a) => !planIds.has(a.id)) },
            { title: 'Full list', items: (lib.all ?? []).filter((a) => !a.common && !planIds.has(a.id) && a.name.toLowerCase().includes(q)) },
          ]
        : [
            { title: 'For this theme', items: lib.themeItems.filter((a) => !planIds.has(a.id)) },
            { title: 'Common', items: lib.common.filter((a) => !planIds.has(a.id)) },
          ]),
    ];
    return groups.filter((g) => g.items.length || g.title === 'Full list');
  }, [lib, all, plan.apparatus.selected, query]);

  async function saveVersion() {
    setVersionMsg(null);
    try {
      await saveNow();
      const key = `${session.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const d = await api.saveVersion(session.id, latest.current, key);
      setVersionMsg(`Version ${d.version} saved.`);
      announce(`Version ${d.version} saved.`);
    } catch (e) {
      setVersionMsg(errorMessage(e));
    }
  }

  async function generate() {
    dirty.current = true;
    await saveNow();
    nav(`/s/${session.id}/diagram/result`);
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!loaded) return <p className="muted">Loading your canvas…</p>;

  /* ---------- Pieces ---------- */
  const trayTrayItem = (a: Apparatus) => (
    <li key={a.id}>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="tray-item" aria-pressed={trayId === a.id}
          onClick={() => setTrayId(trayId === a.id ? null : a.id)}
          onPointerDown={(e) => onTrayPointerDown(e, a.id, false)}
          onDoubleClick={() => addItem(a.id)}
          aria-label={`${a.name}. Select, then press Add to canvas.`}>
          <span className="mini"><ApparatusThumb a={a} size={40} /></span>
          <span className="tname">{a.name}</span>
        </button>
        {!desktop && (
          <button type="button" className="btn btn-icon drag-handle" style={{ minWidth: 44 }} tabIndex={-1}
            aria-label={`Drag ${a.name} onto the canvas`} onPointerDown={(e) => onTrayPointerDown(e, a.id, true)}>
            <Icon name="grip" />
          </button>
        )}
      </div>
    </li>
  );

  const tray = (
    <div className="tray">
      <h2 style={{ fontSize: '1.1rem' }}>Apparatus</h2>
      {lib?.note && <p className="notice" style={{ fontSize: '0.92rem' }}>{lib.note}</p>}
      {libError && <ErrorState message={libError} onRetry={retryLib} />}
      {trayGroups.some((g) => g.title === 'Full list') && (
        <div>
          <label htmlFor="tray-search">Search all apparatus</label>
          <input id="tray-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {trayGroups.map((g) => (
        <div className="tray-group" key={g.title}>
          <h3>{g.title}</h3>
          <ul className="tray-list" aria-label={g.title}>{g.items.map(trayTrayItem)}</ul>
        </div>
      ))}
      <div className="tray-add">
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={!trayId} onClick={() => trayId && addItem(trayId)}>
          <Icon name="plus" /> {trayId ? `Add ${apparatusName(trayId).toLowerCase()} to canvas` : 'Add to canvas'}
        </button>
        <p className="hint-text" style={{ margin: '0.3rem 0 0' }}>
          {desktop ? 'Or drag an item onto the canvas.' : 'Or drag the grip onto the canvas.'}
        </p>
      </div>
    </div>
  );

  const placed = (
    <section aria-labelledby="placed-h">
      <h2 id="placed-h" style={{ fontSize: '1.1rem' }}>Placed items ({scene.items.length})</h2>
      {scene.items.length === 0 && <p className="muted">Nothing placed yet. Choose an item in the apparatus tray and press “Add to canvas”.</p>}
      <ul className="placed-list">
        {scene.items.map((it) => {
          const opts = containerOptions(scene, it.id);
          const parent = scene.containment.find((c) => c.childId === it.id)?.parentId ?? '';
          const conns = connectionOptions(scene, it.id);
          const connected = scene.connections.find((c) => c.fromId === it.id || c.toId === it.id);
          const connectedTo = connected ? (connected.fromId === it.id ? connected.toId : connected.fromId) : '';
          const extra = scene.labels.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId === it.id);
          return (
            <li key={it.id} data-selected={selectedId === it.id}>
              <div className="placed-row">
                <div>
                  <label htmlFor={`placed-${it.id}`}>
                    Label <span className="hint-text">({apparatusName(it.apparatusId)}{relationText(scene, it.id) ? `, ${relationText(scene, it.id)}` : ''})</span>
                  </label>
                  <input id={`placed-${it.id}`} type="text" maxLength={60} value={it.label}
                    onFocus={() => setSelectedId(it.id)}
                    onChange={(e) => update((s) => ({ ...s, items: s.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) }))} />
                </div>
                <div>
                  <label htmlFor={`in-${it.id}`}>Place inside…</label>
                  <select id={`in-${it.id}`} value={parent} onChange={(e) => setContainer(it.id, e.target.value || null)} disabled={!opts.length && !parent}>
                    <option value="">Not inside anything</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {(getApparatus(o.apparatusId)?.containVerb ?? 'inside')} {o.label || apparatusName(o.apparatusId)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {(conns.length > 0 || connectedTo) ? (
                    <>
                      <label htmlFor={`cn-${it.id}`}>Connect to…</label>
                      <select id={`cn-${it.id}`} value={connectedTo} onChange={(e) => setConnection(it.id, e.target.value || null)}>
                        <option value="">Not connected</option>
                        {conns.map((o) => <option key={o.id} value={o.id}>{o.label || apparatusName(o.apparatusId)}</option>)}
                      </select>
                    </>
                  ) : <span className="hint-text">No connections for this item.</span>}
                </div>
                <div className="btn-row">
                  <button className="btn btn-small" onClick={() => { setSelectedId(it.id); focusItem(it.id); }} aria-label={`Select ${it.label || apparatusName(it.apparatusId)} on the canvas`}>Select</button>
                  <button className="btn btn-small" onClick={() => addLabel(it.id)} aria-label={`Add a label line to ${it.label || apparatusName(it.apparatusId)}`}><Icon name="tag" /></button>
                  <button className="btn btn-small" onClick={() => removeItem(it.id)} aria-label={`Remove ${it.label || apparatusName(it.apparatusId)}`}><Icon name="trash" /></button>
                </div>
              </div>
              {extra.map(({ l, i }) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor={`lab-${i}`}>Extra label line</label>
                    <input id={`lab-${i}`} type="text" maxLength={60} value={l.text}
                      onChange={(e) => update((s) => ({ ...s, labels: s.labels.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                  </div>
                  <button className="btn btn-small" aria-label="Remove this label line"
                    onClick={() => update((s) => ({ ...s, labels: s.labels.filter((_, j) => j !== i) }), 'Label line removed.')}>
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const checksPanel = (
    <section aria-labelledby="checks-h">
      <h2 id="checks-h" style={{ fontSize: '1.1rem' }}>Diagram checks</h2>
      <p className="hint-text">LabGuide checks your diagram with fixed rules each time it saves.</p>
      <CheckList checks={checks} />
    </section>
  );

  const firstBlock = checks.find((c) => c.severity === 'safety_block' && !c.passed);
  const toolbar = (
    <>
      {firstBlock && (
        <div style={{ marginBottom: '0.5rem' }}>
          {desktop ? (
            <SafetyBlock compact message={firstBlock.message} alternative={firstBlock.alternative} />
          ) : (
            <SafetyBlock
              compact
              message={firstBlock.message}
              action={<button className="btn btn-small" onClick={() => setSheetTab('checks')}>What to do</button>}
            />
          )}
        </div>
      )}
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <button className="btn btn-small" onClick={() => { hist.undo(); announce('Undo.'); }} disabled={!hist.canUndo} aria-label="Undo"><Icon name="undo" /></button>
      <button className="btn btn-small" onClick={() => { hist.redo(); announce('Redo.'); }} disabled={!hist.canRedo} aria-label="Redo"><Icon name="redo" /></button>
      <span className="sep" aria-hidden="true" />
      <button className="btn btn-small" onClick={() => selected && rotate(selected.id)} disabled={!selected} aria-label="Rotate selected item"><Icon name="rotate" /></button>
      <button className="btn btn-small" onClick={() => selected && duplicate(selected.id)} disabled={!selected} aria-label="Duplicate selected item"><Icon name="copy" /></button>
      <button className="btn btn-small" onClick={() => selected && addLabel(selected.id)} disabled={!selected} aria-label="Add label line to selected item"><Icon name="tag" /></button>
      <button className="btn btn-small" onClick={() => selected && removeItem(selected.id)} disabled={!selected} aria-label="Delete selected item"><Icon name="trash" /></button>
      <span className="sep" aria-hidden="true" />
      <button className="btn btn-small" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Icon name="minus" /></button>
      <button className="btn btn-small" onClick={() => zoom(1.2)} aria-label="Zoom in"><Icon name="plus" /></button>
      <button className="btn btn-small" onClick={fit} aria-label="Fit to screen"><Icon name="fit" /> <span className="topbar-label">Fit</span></button>
    </div>
    </>
  );

  const canvas = (
    <div className="canvas-frame" onKeyDown={onFrameKeyDown}>
      <svg ref={svgRef} className="stage" viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
        role="group" aria-label="Diagram canvas. Tab to an item, then use the arrow keys to move it. Hold Shift for bigger steps."
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <defs>
          <pattern id="grid" width={WORLD.grid * 2} height={WORLD.grid * 2} patternUnits="userSpaceOnUse">
            <path d={`M ${WORLD.grid * 2} 0 L 0 0 0 ${WORLD.grid * 2}`} fill="none" stroke="rgba(27,42,74,0.08)" strokeWidth={1} />
          </pattern>
        </defs>
        <rect x={-3000} y={-3000} width={9000} height={9000} fill="url(#grid)" onPointerDown={onBgPointerDown} />
        <Bench x0={-3000} x1={6000} />
        <text x={10} y={WORLD.bench + 30} fontSize={13} fill="#4d5a75" fontFamily="Arial, sans-serif" aria-hidden="true">Bench</text>
        {renderOrder(scene).map((it) => {
          const a = getApparatus(it.apparatusId);
          if (!a) return null;
          const b = itemBox(it);
          const sel = it.id === selectedId;
          const rel = relationText(scene, it.id);
          return (
            <g key={it.id} id={`ci-${it.id}`} className="canvas-item" tabIndex={0} role="button"
              aria-label={`${it.label || a.name}${rel ? `, ${rel}` : ''}. Arrow keys move, R rotates, Delete removes.`}
              aria-pressed={sel}
              onFocus={() => setSelectedId(it.id)}
              onKeyDown={(e) => onItemKeyDown(e, it.id)}
              onPointerDown={(e) => onItemPointerDown(e, it.id)}>
              <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="transparent" />
              <g transform={`translate(${it.x} ${it.y}) rotate(${it.rotation} ${a.width / 2} ${a.height / 2})`}>
                <ApparatusDrawing a={a} />
              </g>
              {blockedIds.has(it.id) && (
                <rect x={b.x - 8} y={b.y - 8} width={b.w + 16} height={b.h + 16} fill="none" stroke="#b3261e" strokeWidth={3} strokeDasharray="8 4" rx={6} />
              )}
              {sel && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} fill="none" stroke="#0f766e" strokeWidth={2} strokeDasharray="5 4" rx={4} />}
              <rect className="focus-ring" x={b.x - 9} y={b.y - 9} width={b.w + 18} height={b.h + 18} fill="none" stroke="#1d4ed8" strokeWidth={3} rx={6} />
            </g>
          );
        })}
        <Connections scene={scene} />
        {labels.map((l) =>
          l.extraIndex === undefined ? (
            <g key={l.key} pointerEvents="none"><LabelGraphic l={l} /></g>
          ) : (
            <g key={l.key} className="canvas-item" tabIndex={0} role="button" aria-label={`Label line "${l.text}". Arrow keys move it.`}
              onPointerDown={(e) => onLabelPointerDown(e, l.extraIndex!)} onKeyDown={(e) => onLabelKeyDown(e, l.extraIndex!)} style={{ cursor: 'move' }}>
              <rect x={l.side === 'left' ? l.x - l.text.length * 8.5 - 4 : l.x - 4} y={l.y - 12} width={l.text.length * 8.5 + 8} height={24} fill="rgba(255,255,255,0.7)" />
              <LabelGraphic l={l} />
              <rect className="focus-ring" x={l.side === 'left' ? l.x - l.text.length * 8.5 - 6 : l.x - 6} y={l.y - 14} width={l.text.length * 8.5 + 12} height={28} fill="none" stroke="#1d4ed8" strokeWidth={2.5} rx={4} />
            </g>
          ),
        )}
      </svg>
      {scene.items.length === 0 && <div className="canvas-hint">Add apparatus from the tray. Nothing is pre-assembled.</div>}
    </div>
  );

  const actions = (
    <div className="stack" style={{ marginTop: '0.75rem' }}>
      {blocked && (
        <p className="hint-text" style={{ margin: 0 }}>A safety stop is shown in Diagram checks. You can keep editing, but you cannot submit until it is fixed.</p>
      )}
      <div className="btn-row">
        <Link className="btn" to={`/s/${session.id}/diagram`}><Icon name="arrowLeft" /> Back</Link>
        <button className="btn" onClick={saveVersion}><Icon name="history" /> Save version</button>
        <button className="btn btn-primary" onClick={generate} disabled={!scene.items.length}>
          <Icon name="pencil" /> Generate labelled diagram
        </button>
      </div>
      {versionMsg && <p role="status" style={{ margin: 0 }}>{versionMsg}</p>}
      {saveErr && <ErrorState message={`${saveErr} Your canvas is kept on this page.`} onRetry={() => void saveNow()} />}
    </div>
  );

  return (
    <section aria-labelledby="stage-h">
      {region}
      <div className="stage-head">
        <h1 id="stage-h">Build your diagram</h1>
      </div>
      <p className="hint-text canvas-intro">Side view, 2D. Place and label every item yourself. Drop an item into a container to snap it inside.</p>
      {desktop ? (
        <div className="canvas-shell">
          <aside className="tray-panel card" aria-label="Apparatus tray">{tray}</aside>
          <div style={{ minWidth: 0 }}>
            {toolbar}
            {canvas}
            {actions}
            <div className="below-canvas">
              <div className="card">{placed}</div>
              <div className="card">{checksPanel}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ['--sheet-h' as string]: `${sheetH}px` }}>
          {toolbar}
          {canvas}
          {actions}
          <div className="sheet" style={{ ['--sheet-h' as string]: `${sheetH}px` }} aria-label="Apparatus and items">
            <button className="sheet-handle" aria-label={`Resize panel. Now ${sheetH > 400 ? 'expanded' : 'collapsed'}. Press to ${sheetH > 400 ? 'collapse' : 'expand'}.`}
              onClick={() => setSheetH((h) => (h > 400 ? 260 : Math.round(window.innerHeight * 0.72)))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); setSheetH((h) => Math.min(window.innerHeight * 0.85, h + 60)); }
                if (e.key === 'ArrowDown') { e.preventDefault(); setSheetH((h) => Math.max(140, h - 60)); }
              }}
              onPointerDown={(e) => {
                const startY = e.clientY;
                const startH = sheetH;
                let moved = false;
                const move = (ev: PointerEvent) => {
                  if (Math.abs(ev.clientY - startY) > 5) moved = true;
                  setSheetH(Math.max(140, Math.min(window.innerHeight * 0.85, startH + (startY - ev.clientY))));
                };
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  if (moved) window.addEventListener('click', (ce) => ce.stopPropagation(), { capture: true, once: true });
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up, { once: true });
              }}>
              <span className="bar" />
            </button>
            <div className="sheet-tabs" role="tablist" aria-label="Panel">
              {(['tray', 'placed', 'checks'] as const).map((t) => (
                <button key={t} role="tab" id={`tab-${t}`} aria-selected={sheetTab === t} aria-controls="sheet-panel" className="btn btn-small" onClick={() => setSheetTab(t)}>
                  {t === 'tray' ? 'Apparatus' : t === 'placed' ? `Placed (${scene.items.length})` : `Checks${blocked ? ' ⚠' : ''}`}
                </button>
              ))}
            </div>
            <div className="sheet-body" id="sheet-panel" role="tabpanel" aria-labelledby={`tab-${sheetTab}`}>
              {sheetTab === 'tray' ? tray : sheetTab === 'placed' ? placed : checksPanel}
            </div>
          </div>
        </div>
      )}
      {ghost?.active && (
        <div aria-hidden="true" style={{ position: 'fixed', left: ghost.x - 30, top: ghost.y - 30, width: 60, height: 60, pointerEvents: 'none', zIndex: 80, opacity: 0.85, background: 'rgba(224,242,239,0.8)', borderRadius: 10, border: '2px dashed #0f766e', display: 'grid', placeItems: 'center' }}>
          {getApparatus(ghost.apparatusId) && <ApparatusThumb a={getApparatus(ghost.apparatusId)!} size={52} />}
        </div>
      )}
    </section>
  );
}
