/* Mouse, lápiz y dedo sobre el lienzo: dibujar con la herramienta activa, elegir, arrastrar muros, extremos, aberturas,
   objetos y anotaciones, recuadro de selección, desplazar y acercar con la rueda. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Id, Item, Note, NoteKind, Opening, Point, Surface, Wall } from "../types/plan";
import { zoomAt } from "./actions";
import { GRID } from "./constants";
import type { Selection } from "./context";
import { $ } from "./dom";
import { addOpening, addRoomPoint, addWallPoint, addWalls, commit, newItem, setTool } from "./edit";
import { copy, dist, n1, project, pt1, round, same, simplify, straight } from "./geometry";
import { render } from "./render";
import { itemById, nextId, noteById, openingById, pickedWalls, roomAt, st, wallById, wallsSel } from "./state";
import { pushHistory } from "./store";
import { ui } from "./ui";
import { clampT, hitItem, hitNote, hitOpening, hitSurface, hitWall, itemPoint, movePoints, px, snap, toWorld } from "./viewport";

const NOTES: Record<string, string> = P.NOTE_KINDS; // herramientas de anotación: trazo, línea, flecha, formas, nube y nota de texto

/** Cada clase de arrastre, con lo que necesita recordar mientras dura. */
type PointerDrag =
  | { type: "pan"; sx: number; sy: number; vx: number; vy: number; p?: Point; moved?: boolean; dirty?: boolean }
  | { type: "box"; start: Point; cur: Point; sx: number; sy: number; add?: boolean; moved?: boolean; dirty?: boolean }
  | { type: "draw"; sx: number; sy: number; note: Note; moved?: boolean; dirty?: boolean }
  | { type: "note"; id: Id; start: Point; from: Point[]; dirty?: boolean }
  | { type: "notept"; id: Id; i: number; dirty?: boolean }
  | { type: "node"; cur: Point; dirty?: boolean }
  | { type: "wall"; start: Point; a: Point; b: Point; curA: Point; curB: Point; dirty?: boolean }
  | { type: "item"; id: Id; dx: number; dy: number; dirty?: boolean }
  | { type: "opening"; id: Id; dirty?: boolean };

const drag = () => st.drag as unknown as PointerDrag | null;
const setDrag = (d: PointerDrag | null) => { st.drag = d as unknown as typeof st.drag; };

function touch() { const d = drag() as PointerDrag; if (!d.dirty) { pushHistory(); d.dirty = true; } }
function startPan(e: PointerEvent, p?: Point) { setDrag({ type: "pan", sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y, p: p }); }

function pointerDown(e: PointerEvent) {
  const svg = ui.svg;
  if (e.button === 2) return;
  const p = toWorld(e);
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
  if (e.button === 1 || st.tool === "pan" || st.spaceDown) { e.preventDefault(); startPan(e); return; }
  if (NOTES[st.tool]) {
    const fresh = { id: 0, kind: st.tool as NoteKind, color: st.nextNote.color, w: st.nextNote.w as Note["w"] } as Note;
    if (st.tool !== "text") { setDrag({ type: "draw", sx: e.clientX, sy: e.clientY, note: Object.assign(fresh, { pts: st.tool === "pen" ? [pt1(p)] : [pt1(p), pt1(p)] }) }); return; }
    e.preventDefault(); // el foco tiene que quedar en el campo de texto, no volver al lienzo
    Object.assign(fresh, { id: nextId(), pts: [pt1(p)], text: "Nota" });
    pushHistory();
    st.plan.notes.push(fresh);
    setTool(st.presenting ? "pan" : "select");
    commit({ type: "note", id: fresh.id });
    const input = $<HTMLInputElement>('input[name="text"]', ui.inspector);
    if (input) { input.focus(); input.select(); }
    return;
  }
  if (st.tool === "wall") { addWallPoint(snap(p, { from: st.chain })); return; }
  if (st.tool === "room") { addRoomPoint(snap(p)); return; }
  if (st.tool === "opening") { const hit = hitWall(p); if (hit) addOpening(hit, st.pick as string); return; }
  if (st.tool === "item") {
    const q = itemPoint(p), it = newItem(nextId(), q);
    pushHistory();
    st.plan.items.push(it);
    st.ghost = null;
    commit({ type: "item", id: it.id });
    return;
  }
  if (st.tool === "measure") {
    const q = snap(p);
    st.measure = !st.measure || st.measure.b ? { a: q } : { a: st.measure.a, b: q };
    st.hover = null;
    render();
    return;
  }

  if (st.tool === "arc") { // inicio, final y un punto de paso
    const q = snap(p);
    if (!st.chain) st.chain = q;
    else if (!st.arcEnd) { if (dist(st.chain, q) >= GRID) st.arcEnd = q; }
    else {
      const pts = P.arcPoints(st.chain, st.arcEnd, q) || [st.chain, st.arcEnd];
      addWalls(pts.slice(1).map((point, i): [Point, Point] => [pts[i], point]));
      st.chain = null; st.arcEnd = null;
      commit(null);
      return;
    }
    render();
    return;
  }
  if (st.tool === "surface") {
    const q = snap(p);
    if (!st.chain) { st.chain = q; render(); return; }
    if (Math.abs(q.x - st.chain.x) < GRID || Math.abs(q.y - st.chain.y) < GRID) return;
    const sf: Surface = { id: nextId(), x: Math.min(st.chain.x, q.x), y: Math.min(st.chain.y, q.y), w: Math.abs(q.x - st.chain.x), h: Math.abs(q.y - st.chain.y), type: "patio" };
    pushHistory();
    st.plan.surfaces.push(sf);
    st.chain = null;
    commit({ type: "surface", id: sf.id });
    return;
  }
  if (st.tool === "section") {
    const q = snap(p);
    if (!st.chain) { st.chain = q; render(); return; }
    if (dist(st.chain, q) < GRID) return;
    pushHistory();
    st.plan.section = { a: st.chain, b: q };
    commit(null);
    setTool("select");
    return;
  }
  if (st.tool === "wire") {
    const it = hitItem(p);
    if (!it || D.items[it.type].group !== "electricidad") return;
    const from = st.wireFrom;
    const linked = from && st.plan.wires.some((w) => (w.a === from && w.b === it.id) || (w.a === it.id && w.b === from));
    if (from && from !== it.id && !linked) { pushHistory(); st.plan.wires.push({ id: nextId(), a: from, b: it.id }); }
    st.wireFrom = it.id;
    commit(null);
    return;
  }

  const adding = e.shiftKey || st.multi; // "Elegir varios" hace lo mismo que Shift, también con el dedo
  const wall = !adding && st.sel && st.sel.type === "wall" && wallById(st.sel.id as Id);
  const end = wall && [wall.a, wall.b].find((q) => dist(q, p) < 11 * px());
  if (end) { setDrag({ type: "node", cur: copy(end) }); return; }
  if (adding) { // sumar o quitar muros de la selección, o empezar un recuadro
    const more = hitWall(p);
    if (!more) { setDrag({ type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY, add: true }); return; }
    const ids = pickedWalls().slice(), at = ids.indexOf(more.wall.id);
    if (at >= 0) ids.splice(at, 1); else ids.push(more.wall.id);
    commit(wallsSel(ids));
    return;
  }
  // Las anotaciones van dibujadas encima de todo: son lo primero que se elige.
  const marked = !adding && st.sel && st.sel.type === "note" && noteById(st.sel.id as Id);
  const corner = marked && marked.kind !== "pen" && marked.kind !== "text" ? marked.pts.findIndex((q) => dist(q, p) < 11 * px()) : -1;
  if (marked && corner >= 0) { setDrag({ type: "notept", id: marked.id, i: corner }); return; }
  const note = !adding && hitNote(p);
  if (note) { commit({ type: "note", id: note.id }); setDrag({ type: "note", id: note.id, start: p, from: note.pts.map(copy) }); return; }
  const opening = hitOpening(p);
  if (opening) { commit({ type: "opening", id: opening.id }); setDrag({ type: "opening", id: opening.id }); return; }
  // Un clic sobre el cuerpo del muro elige el muro, aunque haya un mueble arrimado; el margen extra del mueble vale solo fuera del muro.
  const hit = hitWall(p), onWall = hit && hit.d <= ((st.model as NonNullable<typeof st.model>).wallThick[hit.wall.id] || 12) / 2;
  const thing = !onWall && hitItem(p);
  if (thing) { commit({ type: "item", id: thing.id }); setDrag({ type: "item", id: thing.id, dx: p.x - thing.x, dy: p.y - thing.y }); return; }
  if (hit) {
    commit({ type: "wall", id: hit.wall.id });
    setDrag({ type: "wall", start: p, a: copy(hit.wall.a), b: copy(hit.wall.b), curA: copy(hit.wall.a), curB: copy(hit.wall.b) });
    return;
  }
  // Sobre el fondo: con mouse o lápiz, arrastrar abre un recuadro de selección; con el dedo, desplaza el plano.
  // En los dos casos, un toque sin arrastre elige el ambiente o la superficie que haya debajo.
  if (e.pointerType === "touch") startPan(e, p);
  else setDrag({ type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY });
}

function pointerMove(e: PointerEvent) {
  const p = toWorld(e);
  ui.coords.textContent = "X " + E.fmt(p.x / 100, 2) + " · Y " + E.fmt(p.y / 100, 2);
  const d = drag();
  if (!d) {
    if (st.tool === "wall") { st.hover = snap(p, { from: st.chain }); render(); }
    else if (st.tool === "room") { st.hover = snap(p); render(); }
    else if (st.tool === "opening") {
      const hit = hitWall(p), ghost = hit ? P.opening(0, hit.wall.id, hit.t, st.pick as string) : null;
      if (ghost) ghost.t = clampT(ghost, ghost.t);
      st.ghost = ghost;
      render();
    } else if (st.tool === "item") {
      const q = itemPoint(p);
      st.ghost = newItem(0, q);
      render();
    } else if (st.tool === "measure" && st.measure && !st.measure.b) { st.hover = snap(p); render(); }
    else if (st.tool === "arc" || st.tool === "surface" || st.tool === "section") { st.hover = snap(p); render(); }
    else if (st.tool === "wire" && st.wireFrom) { st.hover = p; render(); }
    return;
  }
  if (d.type === "pan") {
    const k = px();
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    st.view.x = d.vx - (e.clientX - d.sx) * k;
    st.view.y = d.vy - (e.clientY - d.sy) * k;
    render();
  } else if (d.type === "box") {
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    d.cur = p;
    render();
  } else if (d.type === "draw") {
    const nt = d.note, q = pt1(p);
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (nt.kind !== "pen") nt.pts[1] = e.shiftKey ? straight(nt.pts[0], q, nt.kind) : q;
    else if (dist(nt.pts[nt.pts.length - 1], q) >= 2 * px()) nt.pts.push(q);
    render();
  } else if (d.type === "note") {
    const nt = noteById(d.id) as Note, dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) < 2 * px() && !d.dirty) return;
    touch();
    nt.pts = d.from.map((q) => pt1({ x: q.x + dx, y: q.y + dy }));
    render();
  } else if (d.type === "notept") {
    const nt = noteById(d.id) as Note;
    touch();
    nt.pts[d.i] = e.shiftKey ? straight(nt.pts[1 - d.i], pt1(p), nt.kind) : pt1(p);
    render();
  } else if (d.type === "node") {
    const to = snap(p, { skip: d.cur });
    if (same(to, d.cur)) return;
    touch();
    movePoints([{ from: d.cur, to: to }]);
    d.cur = to;
    render();
  } else if (d.type === "wall") {
    const dx = round(p.x - d.start.x), dy = round(p.y - d.start.y);
    const a = { x: d.a.x + dx, y: d.a.y + dy }, b = { x: d.b.x + dx, y: d.b.y + dy };
    if (same(a, d.curA)) return;
    touch();
    movePoints([{ from: d.curA, to: a }, { from: d.curB, to: b }]);
    d.curA = a; d.curB = b;
    render();
  } else if (d.type === "item") {
    const it = itemById(d.id) as Item, q = itemPoint({ x: p.x - d.dx, y: p.y - d.dy });
    if (q.x === it.x && q.y === it.y) return;
    touch();
    it.x = q.x; it.y = q.y;
    render();
  } else if (d.type === "opening") {
    const o = openingById(d.id) as Opening;
    const t = clampT(o, project(wallById(o.wall) as Wall, p).t);
    if (t === o.t) return;
    touch();
    o.t = t;
    render();
  }
}

function endDrag() {
  const done = drag();
  if (!done) return;
  setDrag(null);
  // Lo que haya bajo un toque sin arrastre: un ambiente o una superficie exterior.
  const under = function (q: Point): Selection | null {
    const outside = !roomAt(q) && hitSurface(q);
    return roomAt(q) ? { type: "room", x: n1(q.x), y: n1(q.y) } : outside ? { type: "surface", id: outside.id } : null;
  };
  if (done.type === "draw") {
    const nt = done.note;
    if (nt.kind === "pen") nt.pts = simplify(nt.pts, 1.2 * px());
    if (!done.moved || nt.pts.length < 2 || dist(nt.pts[0], nt.pts[1]) < 1 && nt.pts.length === 2) { ui.hint.textContent = "Mantené apretado y arrastrá para dibujar."; render(); return; }
    pushHistory();
    nt.id = nextId();
    st.plan.notes.push(nt);
    commit(null); // la herramienta sigue activa para seguir anotando
    return;
  }
  if (done.type === "box") {
    if (!done.moved) { // fue un clic, no un recuadro
      if (!done.add) commit(under(done.start));
      else render();
      return;
    }
    // Quedan elegidos los muros que tocan el recuadro; con Shift se suman a los que ya estaban.
    const x0 = Math.min(done.start.x, done.cur.x), x1 = Math.max(done.start.x, done.cur.x), y0 = Math.min(done.start.y, done.cur.y), y1 = Math.max(done.start.y, done.cur.y);
    const inside = (q: Point) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
    const ids = done.add ? pickedWalls().slice() : [];
    st.plan.walls.forEach(function (w) {
      if (ids.indexOf(w.id) < 0 && (inside(w.a) || inside(w.b) || inside({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }))) ids.push(w.id);
    });
    commit(wallsSel(ids));
    return;
  }
  if (done.type === "pan") {
    if (!done.moved && done.p && st.tool === "select") commit(under(done.p));
  } else if (done.dirty) commit(st.sel);
}

/** Conecta el lienzo a los eventos del puntero y la rueda. */
export function bindPointer() {
  const svg = ui.svg;
  svg.addEventListener("pointerdown", pointerDown);
  svg.addEventListener("pointermove", pointerMove);
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", function () { if (!st.drag && (st.hover || st.ghost)) { st.hover = null; st.ghost = null; render(); } });
  svg.addEventListener("dblclick", function () { if (st.chain) { st.chain = null; render(); } });
  svg.addEventListener("contextmenu", function (e) { if (st.chain) { e.preventDefault(); st.chain = null; render(); } });
  svg.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(toWorld(e), e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
}
