/* Operaciones de edición del plano: guardar y redibujar (commit), cambiar de herramienta, agregar muros, ambientes,
   aberturas y objetos, borrar lo elegido y cambiar nombre, piso o color de un ambiente o una anotación. */
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Item, Opening, Point, RoomLabel } from "../types/plan";
import { GRID, HINTS } from "./constants";
import type { Selection } from "./context";
import { $, $$ } from "./dom";
import { copy, dist, project, same } from "./geometry";
import { renderInspector } from "./inspector";
import { renderVariants } from "./levels";
import { itemLibraryHTML, type ShelfItem } from "./library";
import { render } from "./render";
import { syncSettings } from "./settings";
import { pushHistory, save } from "./store";
import { itemById, layers, nextId, noteById, openingById, pickedWalls, roomAt, selected, st, wallById } from "./state";
import { ui } from "./ui";
import { clampT, type WallHit } from "./viewport";
import { renderTypes } from "./walltypes";

const NOTES: Record<string, string> = P.NOTE_KINDS;

// Guarda, cambia la selección y redibuja todo.
export function commit(selection: Selection | null) {
  st.plan.walls = st.plan.walls.filter((w) => dist(w.a, w.b) >= GRID);
  st.plan.openings = st.plan.openings.filter((o) => wallById(o.wall));
  st.plan.items = st.plan.items || [];
  st.plan.surfaces = st.plan.surfaces || [];
  st.plan.notes = st.plan.notes || [];
  st.plan.wires = (st.plan.wires || []).filter((w) => itemById(w.a) && itemById(w.b)); // un cable sin una de sus bocas no existe
  st.sel = selection;
  save();
  render();
  if (!selected()) st.sel = null;
  renderInspector();
  renderVariants();
  renderTypes();
}

export function setTool(name: string, type?: string | null, own?: ShelfItem) {
  const root = ui.root;
  st.tool = name; st.pick = type || null; st.stamp = own || null; st.chain = null; st.hover = null; st.ghost = null; st.typed = ""; st.measure = null; st.arcEnd = null; st.wireFrom = null;
  if (name !== "select" && name !== "pan") { st.sel = null; st.multi = false; } // al empezar a dibujar se suelta la selección
  $$("[data-tool]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === name)));
  ($('[data-action="multi"]', root) as HTMLElement).setAttribute("aria-pressed", String(st.multi));
  syncPicks();
  ui.hint.textContent = HINTS[name === "select" && st.multi ? "multi" : name];
  ui.svg.setAttribute("data-tool", NOTES[name] ? "note" : name);
  if (NOTES[name] && !layers().notes) { st.plan.layers = Object.assign(layers(), { notes: true }); save(); syncSettings(); } // no se anota sobre una capa oculta
  render();
  renderInspector();
}

// Vuelve a armar la biblioteca de equipamiento sin plegar los grupos que estaban abiertos.
export function renderLibrary() {
  const box = $("[data-items]", ui.root) as HTMLElement, open = $$("details[open]", box).map((d) => d.getAttribute("data-group"));
  const first = !box.firstChild;
  box.innerHTML = itemLibraryHTML(st.shelf);
  if (!first) $$<HTMLDetailsElement>("details", box).forEach(function (d) { d.open = open.indexOf(d.getAttribute("data-group")) >= 0; });
  syncPicks();
}
export function syncPicks() {
  const root = ui.root;
  $$("[data-pick]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-pick") === st.pick)));
  $$("[data-pick-item]", root).forEach((b) => b.setAttribute("aria-pressed", String(!st.stamp && b.getAttribute("data-pick-item") === st.pick)));
  $$("[data-pick-shelf]", root).forEach((b) => b.setAttribute("aria-pressed", String(!!st.stamp && b.getAttribute("data-pick-shelf") === st.stamp.id)));
}
// Objeto nuevo: el de la biblioteca general o, si se eligió uno propio, con sus medidas, nombre y forma.
export function newItem(id: number, q: Point): Item {
  const it = P.item(id, st.pick as string, q.x, q.y, 0);
  if (!st.stamp) return it;
  it.w = st.stamp.w; it.d = st.stamp.d;
  if (D.items[it.type].custom) { it.name = st.stamp.name; if (st.stamp.shape) it.shape = st.stamp.shape; }
  if (st.stamp.tall) it.tall = st.stamp.tall;
  return it;
}

export function removeSelection() {
  const sel = st.sel;
  if (!sel || sel.type === "room") return;
  pushHistory();
  if (sel.type === "wall" || sel.type === "walls") { const gone = pickedWalls(); st.plan.walls = st.plan.walls.filter((w) => gone.indexOf(w.id) < 0); }
  else if (sel.type === "item") st.plan.items = st.plan.items.filter((it) => it.id !== sel.id);
  else if (sel.type === "surface") st.plan.surfaces = st.plan.surfaces.filter((sf) => sf.id !== sel.id);
  else if (sel.type === "note") st.plan.notes = st.plan.notes.filter((nt) => nt.id !== sel.id);
  else st.plan.openings = st.plan.openings.filter((o) => o.id !== sel.id);
  commit(null);
}
// No agrega una pared que ya está dibujada encima de otra (pasa al dibujar ambientes pegados).
export function addWalls(list: [Point, Point][]) {
  const onWall = (w: { a: Point; b: Point }, p: Point) => { const h = project(w, p); return h.d < 0.5 && h.raw > -1e-6 && h.raw < 1 + 1e-6; };
  const fresh = list.filter((s) => dist(s[0], s[1]) >= GRID && !st.plan.walls.some((w) => onWall(w, s[0]) && onWall(w, s[1])));
  if (!fresh.length) return;
  pushHistory();
  fresh.forEach(function (s) { st.plan.walls.push(Object.assign({ id: nextId(), a: copy(s[0]), b: copy(s[1]) }, st.nextType ? { type: st.nextType } : {}, st.nextPhase ? { phase: st.nextPhase as "existente" } : {})); });
}
export function addWallPoint(p: Point) {
  st.typed = "";
  if (!st.chain) { st.chain = p; render(); return; }
  if (dist(st.chain, p) < GRID) return;
  const closes = st.plan.walls.some((w) => same(w.a, p) || same(w.b, p));
  addWalls([[st.chain, p]]);
  st.chain = closes ? null : p; // al llegar a otra pared la cadena se corta sola
  commit(null);
}
export function addRoomPoint(p: Point) {
  if (!st.chain) { st.chain = p; render(); return; }
  if (Math.abs(p.x - st.chain.x) < GRID || Math.abs(p.y - st.chain.y) < GRID) return;
  const a = st.chain, b = { x: p.x, y: a.y }, c = p, d = { x: a.x, y: p.y };
  addWalls([[a, b], [b, c], [c, d], [d, a]]);
  st.chain = null;
  commit(null);
}
export function addOpening(hit: WallHit, type: string) {
  pushHistory();
  const o = P.opening(nextId(), hit.wall.id, hit.t, type);
  o.t = clampT(o, o.t);
  st.plan.openings.push(o);
  st.ghost = null;
  commit({ type: "opening", id: o.id });
}
export function changeOpening(change: (o: Opening) => void) {
  const o = openingById((st.sel as Selection).id as number) as Opening;
  pushHistory();
  change(o);
  commit(st.sel);
}
/** Centro de la vista. */
export const center = (): Point => ({ x: st.view.x + st.view.w / 2, y: st.view.y + st.view.h / 2 });
// Nombre, piso o color de un ambiente: se guardan en una etiqueta ubicada dentro de él.
export function tagRoom(field: "name" | "floor" | "color", value: string) {
  const sel = st.sel as Selection & Point;
  const room = roomAt(sel) as NonNullable<ReturnType<typeof roomAt>>, old: Partial<RoomLabel> = (st.plan.labels || []).find((l) => P.inside(room.points, l)) || {};
  const tag: RoomLabel = { x: sel.x, y: sel.y, name: old.name || "", floor: old.floor, color: old.color };
  tag[field] = value;
  pushHistory();
  st.plan.labels = (st.plan.labels || []).filter((l) => !P.inside(room.points, l));
  st.plan.labels.push(tag);
  commit(st.sel);
}
// Un toque en la paleta: pinta la anotación o el ambiente elegido, o fija el color de las anotaciones que vienen.
export function setColor(color: string) {
  if (st.sel && st.sel.type === "note") { pushHistory(); (noteById(st.sel.id as number) as NonNullable<ReturnType<typeof noteById>>).color = color; commit(st.sel); }
  else if (st.sel && st.sel.type === "room") tagRoom("color", color);
  else { st.nextNote.color = color; renderInspector(); }
}
