/* Geometría del diseñador sin estado: distancias, redondeos, proyección sobre un muro, trazos y movimiento de muros.
   Todo en cm. */
import type { Point, Wall } from "../types/plan";
import { GRID } from "./constants";

export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const copy = (p: Point): Point => ({ x: p.x, y: p.y });
/** A la grilla del dibujo. */
export const round = (v: number) => Math.round(v / GRID) * GRID;
export const n1 = (v: number) => Math.round(v * 10) / 10;
export const n2 = (v: number) => Math.round(v * 100) / 100;
export const pt1 = (p: Point): Point => ({ x: n1(p.x), y: n1(p.y) });

/** Proyección de p sobre el muro: t (0 a 1, recortado), raw (sin recortar) y d (distancia al muro). */
export function project(w: { a: Point; b: Point }, p: Point) {
  const rx = w.b.x - w.a.x, ry = w.b.y - w.a.y, len2 = rx * rx + ry * ry;
  const raw = ((p.x - w.a.x) * rx + (p.y - w.a.y) * ry) / len2, t = Math.max(0, Math.min(1, raw));
  return { t: t, raw: raw, d: dist(p, { x: w.a.x + rx * t, y: w.a.y + ry * t }) };
}
export const along = (w: { a: Point; b: Point }, t: number): Point => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });

// Con Shift: líneas y flechas a 0°, 45° o 90°; rectángulos, elipses y nubes de lados iguales.
export function straight(from: Point, to: Point, kind: string): Point {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (kind === "line" || kind === "arrow") {
    const len = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    return pt1({ x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len });
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return pt1({ x: from.x + (dx < 0 ? -side : side), y: from.y + (dy < 0 ? -side : side) });
}

// Aligera un trazo a mano: quita los puntos que se apartan menos que tol de la recta entre sus vecinos (Ramer–Douglas–Peucker).
export function simplify(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1], len = dist(a, b);
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len ? Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len : dist(a, pts[i]);
    if (d > far) { far = d; at = i; }
  }
  return far <= tol ? [a, b] : simplify(pts.slice(0, at + 1), tol).slice(0, -1).concat(simplify(pts.slice(at), tol));
}

/* Mueve a la vez todos los extremos que coinciden con cada punto "from": las esquinas siguen unidas.
   Las paredes apoyadas en T sobre una pared que se mueve conservan su posición a lo largo de ella. */
export function movePoints(walls: Wall[], pairs: { from: Point; to: Point }[]) {
  const moving = (p: Point) => pairs.some((m) => same(p, m.from));
  const moved = walls.filter((w) => moving(w.a) || moving(w.b));
  const attached: { wall: Wall; end: "a" | "b"; on: Wall; t: number }[] = [];
  moved.forEach(function (w) {
    walls.forEach(function (other) {
      if (other === w) return;
      (["a", "b"] as const).forEach(function (end) {
        if (moving(other[end])) return;
        const h = project(w, other[end]);
        if (h.raw > 0 && h.raw < 1 && h.d < 0.5) attached.push({ wall: other, end: end, on: w, t: h.raw });
      });
    });
  });
  walls.forEach(function (w) {
    (["a", "b"] as const).forEach(function (end) {
      const pair = pairs.find((m) => same(w[end], m.from));
      if (pair) w[end] = copy(pair.to);
    });
  });
  attached.forEach(function (link) {
    const p = along(link.on, link.t);
    link.wall[link.end] = { x: n2(p.x), y: n2(p.y) };
  });
}
