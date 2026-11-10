/* Geometría de pantalla del diseñador: de la pantalla al plano, encuadre, imán y qué hay bajo el cursor.
   Todo en cm del plano; px() da cuántos cm mide un píxel con el zoom actual. */
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Id, Item, Note, Opening, Point, Surface, Wall } from "../types/plan";
import * as G from "./geometry";
import { copy, dist, project, round, same } from "./geometry";
import { layers, st, wallById } from "./state";

/** cm por píxel. */
export const px = () => st.view.w / (st.canvas.getBoundingClientRect().width || 1000);

export function toWorld(e: { clientX: number; clientY: number }): Point {
  const r = st.canvas.getBoundingClientRect();
  return { x: st.view.x + (e.clientX - r.left) / r.width * st.view.w, y: st.view.y + (e.clientY - r.top) / r.height * st.view.h };
}

export function fit() {
  // Encuadra los muros y también las superficies exteriores.
  const plan = st.plan, view = st.view;
  const pts = plan.walls.reduce((all: Point[], w) => all.concat([w.a, w.b]), [])
    .concat((plan.surfaces || []).reduce((all: Point[], sf) => all.concat([{ x: sf.x, y: sf.y }, { x: sf.x + sf.w, y: sf.y + sf.h }]), []))
    .concat((plan.notes || []).reduce(function (all: Point[], nt) { const b = P.noteBox(nt); return b.x0 <= b.x1 ? all.concat([{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]) : all; }, []));
  const r = st.canvas.getBoundingClientRect(), ratio = r.width && r.height ? r.height / r.width : 0.75;
  if (!pts.length) { view.w = Math.max(900, (r.width || 900) * 1.4); view.x = -view.w * 0.25; view.y = -view.w * ratio * 0.25; return; }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  view.w = Math.max(maxX - minX, (maxY - minY) / ratio, 300) * 1.3;
  view.x = (minX + maxX) / 2 - view.w / 2;
  view.y = (minY + maxY) / 2 - view.w * ratio / 2;
}

// Imán: primero a los extremos de otras paredes, después a la grilla. Con "from" endereza a 90°.
export function snap(p: Point, opts?: { from?: Point | null; skip?: Point }): Point {
  const o = opts || {};
  if (st.plan.snap === false) return { x: Math.round(p.x), y: Math.round(p.y) };
  let x = round(p.x), y = round(p.y);
  if (o.from) {
    const dx = p.x - o.from.x, dy = p.y - o.from.y;
    if (Math.abs(dx) < Math.abs(dy) * 0.15) x = o.from.x;
    else if (Math.abs(dy) < Math.abs(dx) * 0.15) y = o.from.y;
  }
  let best = { x: x, y: y }, bestD = 12 * px();
  // También atrae a las esquinas de la planta de abajo, para apoyar muro sobre muro.
  const ends: { a: Point; b: Point }[] = st.plan.walls;
  ends.concat(st.model && layers().below ? st.model.under : []).forEach(function (w) {
    [w.a, w.b].forEach(function (q) {
      if (o.skip && same(q, o.skip)) return;
      const d = dist(q, p);
      if (d < bestD) { bestD = d; best = copy(q); }
    });
  });
  return best;
}

export interface WallHit {
  wall: Wall;
  t: number;
  d: number;
}
export function hitWall(p: Point): WallHit | null {
  let best: WallHit | null = null;
  st.plan.walls.forEach(function (w) {
    const h = project(w, p);
    if (h.d <= Math.max(((st.model as NonNullable<typeof st.model>).wallThick[w.id] || 12) / 2, 9 * px()) && (!best || h.d < best.d)) best = { wall: w, t: h.t, d: h.d };
  });
  return best;
}
export function hitOpening(p: Point): Opening | undefined {
  return st.plan.openings.find((o) => dist(G.along(wallById(o.wall) as Wall, o.t), p) <= Math.max(o.w / 2, 10 * px()) &&
    project(wallById(o.wall) as Wall, p).d <= Math.max(15, 10 * px()));
}
// Los objetos se acomodan cada 5 cm.
export function itemPoint(p: Point): Point {
  const step = st.plan.snap === false ? 1 : 5;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}
/** Capa en la que se ve un objeto: las bocas eléctricas van en la suya. */
export const itemLayer = (it: Item) => D.items[it.type].group === "electricidad" ? "electric" : "items";
export function hitItem(p: Point): Item | null {
  const show = layers();
  for (let i = st.plan.items.length - 1; i >= 0; i--) {
    if (show[itemLayer(st.plan.items[i])] && P.itemHit(st.plan.items[i], p, 6 * px())) return st.plan.items[i];
  }
  return null;
}
export function hitNote(p: Point): Note | null {
  if (!layers().notes) return null;
  for (let i = st.plan.notes.length - 1; i >= 0; i--) if (P.noteHit(st.plan.notes[i], p, 7 * px())) return st.plan.notes[i];
  return null;
}
export const hitSurface = (p: Point): Surface | undefined => st.plan.surfaces.find((sf) => p.x >= sf.x && p.x <= sf.x + sf.w && p.y >= sf.y && p.y <= sf.y + sf.h);
export const hasWires = (id: Id) => st.plan.wires.some((w) => w.a === id || w.b === id);
/** Posición de una abertura a lo largo de su muro, sin que se salga de él. */
export function clampT(o: Opening, t: number): number {
  const wall = wallById(o.wall) as Wall, half = o.w / 2 / dist(wall.a, wall.b);
  return half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, t));
}
export const movePoints = (pairs: { from: Point; to: Point }[]) => G.movePoints(st.plan.walls, pairs);
