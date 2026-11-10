/* Dibujo del plano en el lienzo SVG: imagen de referencia y boceto, grilla, superficies, ambientes, muros por
   fases, aberturas, muebles, cables, etiquetas, cotas, anotaciones, vistas previas de lo que se está dibujando,
   techo, línea de corte, medición y reglas. También la escala, el zoom, el corte y el panel de resultados. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Row } from "../types/brand";
import type { Id, Item, Note, Opening, Phase, Point, Wall } from "../types/plan";
import { STEPS, UNTITLED } from "./constants";
import { $, escHTML } from "./dom";
import { dist, n1 } from "./geometry";
import { sketchPoint, sketchScale } from "./sketch";
import { itemById, layers, noteById, pickedWalls, roomAt, st, wallById, type Model } from "./state";
import { itemLayer, px } from "./viewport";

/** Elementos de la pantalla que actualiza el dibujo; bindRender los busca una vez al arrancar. */
interface RenderUI {
  out: HTMLElement;
  legend: HTMLElement;
  emptyNote: HTMLElement;
  checksOut: HTMLElement;
  checksCount: HTMLElement;
  sectionBox: HTMLElement;
  sectionOut: HTMLElement;
  zoomOut: HTMLElement;
  scaleBar: HTMLElement;
  emptyBox: HTMLElement;
}
let refs: RenderUI | null = null;
const ui = () => refs as RenderUI;

export function bindRender(root: HTMLElement) {
  const get = (sel: string) => $(sel, root) as HTMLElement;
  refs = {
    out: get("[data-result]"), legend: $("[data-phase-legend]", root) || document.createElement("div"), emptyNote: get("[data-empty-note]"),
    checksOut: get("[data-checks]"), checksCount: get("[data-checks-count]"), sectionBox: get("[data-section-box]"), sectionOut: get("[data-section]"),
    zoomOut: get("[data-zoom]"), scaleBar: get("[data-scale]"), emptyBox: get("[data-empty]")
  };
}
const openingSVG = (model: Model, o: Opening, k: number, cls: string) => P.openingSVG(wallById(o.wall) as Wall, o, model.wallThick[o.wall] || (model.before && model.before.wallThick[o.wall]) || 12, k, cls);

function rulersSVG(k: number): string {
  const band = 18 * k, step = STEPS.find((s) => s / k >= 56) || STEPS[STEPS.length - 1], font = ' font-size="' + n1(9 * k) + '"';
  let html = '<rect class="ruler" x="' + n1(st.view.x) + '" y="' + n1(st.view.y) + '" width="' + n1(st.view.w) + '" height="' + n1(band) + '"/>' +
    '<rect class="ruler" x="' + n1(st.view.x) + '" y="' + n1(st.view.y) + '" width="' + n1(band) + '" height="' + n1(st.view.h) + '"/>';
  for (let x = Math.ceil((st.view.x + band) / step) * step; x < st.view.x + st.view.w; x += step) {
    html += P.lineSVG({ x: x, y: st.view.y + band * 0.5 }, { x: x, y: st.view.y + band }, "ruler-tick", k) +
      '<text class="ruler-text"' + font + ' x="' + n1(x + 3 * k) + '" y="' + n1(st.view.y + band * 0.42) + '">' + E.fmt((x || 0) / 100, 1) + "</text>";
  }
  for (let y = Math.ceil((st.view.y + band) / step) * step; y < st.view.y + st.view.h; y += step) {
    const tx = n1(st.view.x + band * 0.42), ty = n1(y - 3 * k);
    html += P.lineSVG({ x: st.view.x + band * 0.5, y: y }, { x: st.view.x + band, y: y }, "ruler-tick", k) +
      '<text class="ruler-text"' + font + ' x="' + tx + '" y="' + ty + '" transform="rotate(-90 ' + tx + " " + ty + ')">' + E.fmt((y || 0) / 100, 1) + "</text>";
  }
  return html + '<rect class="ruler" x="' + n1(st.view.x) + '" y="' + n1(st.view.y) + '" width="' + n1(band) + '" height="' + n1(band) + '"/>';
}

// Giro de una imagen alrededor de su centro (la foto de un boceto torcido se muestra ya enderezada).
const turn = (deg: number | undefined, cx: number, cy: number) => deg ? ' transform="rotate(' + deg + " " + n1(cx) + " " + n1(cy) + ')"' : "";

export function render() {
  const svg = st.canvas, brand = window.__BRAND__, { legend, scaleBar, zoomOut, emptyBox, emptyNote, sectionBox, sectionOut } = ui();
  const r = svg.getBoundingClientRect();
  if (r.width && r.height) st.view.h = st.view.w * r.height / r.width;
  svg.setAttribute("viewBox", [st.view.x, st.view.y, st.view.w, st.view.h].map(n1).join(" "));
  const model = P.compute(st.plan);
  st.model = model;
  const k = px(), font = 12 * k, show = layers();
  const label = (x: number, y: number, cls: string, s: string) => '<text class="' + cls + '" x="' + n1(x) + '" y="' + n1(y) + '" font-size="' + n1(font) + '">' + escHTML(s) + "</text>";
  const dash = ' stroke-dasharray="' + n1(8 * k) + " " + n1(6 * k) + '"';
  const active = st.sel && st.sel.type === "room" ? roomAt(st.sel as unknown as Point) : null, picked = pickedWalls();

  let html = "";
  if (st.plan.ref && st.plan.ref.src) {
    html += '<image href="' + st.plan.ref.src + '" x="' + n1(st.plan.ref.x) + '" y="' + n1(st.plan.ref.y) + '" width="' + n1(st.plan.ref.w) + '" height="' + n1(st.plan.ref.w * st.plan.ref.ratio) +
      '" opacity="' + st.plan.ref.opacity + '" preserveAspectRatio="none"' + turn(st.plan.ref.rot, st.plan.ref.x + st.plan.ref.w / 2, st.plan.ref.y + st.plan.ref.w * st.plan.ref.ratio / 2) + "/>";
  }
  if (st.sketch) {
    const k2 = sketchScale(), corner = sketchPoint(0, 0);
    html += '<image href="' + st.sketch.src + '" x="' + n1(corner.x) + '" y="' + n1(corner.y) + '" width="' + n1(st.sketch.w * k2) + '" height="' + n1(st.sketch.h * k2) + '" opacity="0.5" preserveAspectRatio="none"' + turn(st.sketch.angle, corner.x + st.sketch.w * k2 / 2, corner.y + st.sketch.h * k2 / 2) + "/>";
  }
  if (show.grid) {
    html += '<defs><pattern id="plan-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path class="grid-line" d="M100 0H0V100" stroke-width="' +
      n1(k) + '"/></pattern></defs><rect x="' + n1(st.view.x) + '" y="' + n1(st.view.y) + '" width="' + n1(st.view.w) + '" height="' + n1(st.view.h) + '" fill="url(#plan-grid)"/>';
  }
  st.plan.surfaces.forEach(function (sf) {
    html += '<rect class="surface' + (st.sel && st.sel.type === "surface" && st.sel.id === sf.id ? " sel" : "") + '" x="' + sf.x + '" y="' + sf.y + '" width="' + sf.w + '" height="' + sf.h + '" stroke-width="' + n1(k) + '"/>';
    if (show.names) html += label(sf.x + sf.w / 2, sf.y + sf.h / 2 - font * 0.65, "room-label", (D.surfaces[sf.type] || D.surfaces.patio).label);
    if (show.areas) html += label(sf.x + sf.w / 2, sf.y + sf.h / 2 + font * 0.7, "room-area", E.fmt(sf.w * sf.h / 1e4, 1) + " m²");
  });
  // Fases: "obra" = cómo queda (lo existente en gris), "actual" = antes de la obra, "municipal" = colores de plano municipal.
  const pv = model.phased ? (st.plan.phaseView || "obra") : "obra", shown = pv === "actual" ? model.before! : model;
  const phaseOf: Record<string, Phase> = {};
  st.plan.walls.forEach(function (w) { phaseOf[w.id] = P.wallPhase(w); });
  const phaseCls = (ph: Phase) => !model.phased ? "" : ph === "demoler" ? " ph-demo" : ph === "existente" ? " ph-old" : pv === "municipal" ? " ph-new" : "";
  const openingShown = (o: Opening) => {
    const ph = P.openingPhase(o, wallById(o.wall));
    return pv === "municipal" || (pv === "actual" ? ph !== "nueva" : ph !== "demoler");
  };
  legend.hidden = pv !== "municipal";
  svg.setAttribute("data-phase", pv);
  shown.rooms.forEach(function (room) {
    html += '<polygon class="room' + (room === active ? " sel" : "") + '"' + P.roomFill(room, room === active) + ' points="' + room.points.map((p) => n1(p.x) + "," + n1(p.y)).join(" ") + '"/>';
  });
  // La guía de la planta de abajo va sobre el relleno de los ambientes y debajo de los muros propios.
  if (show.below) model.under.forEach(function (e) { html += P.lineSVG(e.a, e.b, "wall under", e.thick); });
  // Cada muro en dos pasadas, como el nivel de detalle "fino" de Revit: primero el espesor terminado
  // (revoques, en tono suave) y encima el núcleo de ladrillo.
  shown.edges.forEach(function (e) {
    if (e.thick - e.core > 0.5) html += P.lineSVG(e.a, e.b, "wall-fin", e.thick);
  });
  shown.edges.forEach(function (e) {
    const ph = pv === "actual" ? "existente" : phaseOf[e.wall];
    html += P.lineSVG(e.a, e.b, "wall " + e.cls + (pv === "actual" ? "" : phaseCls(ph)) + (picked.indexOf(e.wall) >= 0 ? " sel" : ""), e.core || e.thick);
  });
  if (pv === "municipal") { // lo que se demuele: en amarillo y a trazos, con el espesor que tiene hoy
    st.plan.walls.forEach(function (w) {
      if (phaseOf[w.id] !== "demoler") return;
      html += P.lineSVG(w.a, w.b, "wall ph-demo" + (picked.indexOf(w.id) >= 0 ? " sel" : ""), (model.before && model.before.wallThick[w.id]) || 12, dash);
    });
  }
  st.plan.openings.forEach(function (o) {
    if (!openingShown(o)) return;
    const ph = P.openingPhase(o, wallById(o.wall));
    html += openingSVG(model, o, k, (pv === "actual" ? "" : phaseCls(ph)) + (st.sel && st.sel.type === "opening" && st.sel.id === o.id ? " sel" : ""));
  });
  st.plan.items.forEach(function (it) {
    if (show[itemLayer(it)]) html += P.itemSVG(it, k, st.sel && st.sel.type === "item" && st.sel.id === it.id ? " sel" : "");
  });
  if (show.electric) {
    st.plan.wires.forEach(function (w) { // cable: arco suave entre las dos bocas
      const a = itemById(w.a) as Item, b = itemById(w.b) as Item, bend = 0.18;
      html += '<path class="wire" stroke-width="' + n1(1.5 * k) + '" d="M' + n1(a.x) + " " + n1(a.y) + "Q" + n1((a.x + b.x) / 2 - (b.y - a.y) * bend) + " " +
        n1((a.y + b.y) / 2 + (b.x - a.x) * bend) + " " + n1(b.x) + " " + n1(b.y) + '"/>';
    });
  }
  if (st.ghost) html += '<g class="ghost">' + ((st.ghost as Opening).wall ? openingSVG(model, st.ghost as Opening, k, " sel") : P.itemSVG(st.ghost as Item, k, " sel")) + "</g>";

  shown.rooms.forEach(function (room) {
    const both = show.names && show.areas;
    if (show.names) html += label(room.cx, room.cy - (both ? font * 0.65 : 0), "room-label", room.name);
    if (show.areas) html += label(room.cx, room.cy + (both ? font * 0.7 : 0), "room-area", E.fmt(room.area, 1) + " m²");
  });
  // Etiquetas de carpintería (P1, V2…): las mismas que la planilla. Van sobre los muebles y, en un muro
  // exterior, del lado de afuera, donde no tapan nada.
  if (show.tags && brand.schedules && pv !== "actual") {
    const codes = brand.schedules.build(st.plan).codeOf;
    st.plan.openings.forEach(function (o) {
      const w = wallById(o.wall), code = codes[o.id];
      if (!w || !code) return;
      const len = dist(w.a, w.b), c = P.at(w, o.t), off = (model.wallThick[o.wall] || 12) / 2 + 13 * k;
      const nx = -(w.b.y - w.a.y) / len * off, ny = (w.b.x - w.a.x) / len * off;
      const inRoom = (q: Point) => shown.rooms.some((r) => P.inside(r.points, q));
      const flip = inRoom({ x: c.x + nx, y: c.y + ny }) && !inRoom({ x: c.x - nx, y: c.y - ny }) ? -1 : 1;
      const x = c.x + nx * flip, y = c.y + ny * flip, bw = (code.length * 7.4 + 8) * k, bh = 15 * k;
      html += '<g class="tag"><rect x="' + n1(x - bw / 2) + '" y="' + n1(y - bh / 2) + '" width="' + n1(bw) + '" height="' + n1(bh) + '" rx="' + n1(3 * k) + '" stroke-width="' + n1(k) + '"/>' +
        '<text x="' + n1(x) + '" y="' + n1(y + 4 * k) + '" font-size="' + n1(11 * k) + '" text-anchor="middle">' + code + "</text></g>";
    });
  }
  if (show.dims) {
    st.plan.walls.forEach(function (w) {
      const len = dist(w.a, w.b), ph = phaseOf[w.id];
      if (len / k < 46 || (pv === "actual" ? ph === "nueva" : pv === "obra" && ph === "demoler")) return;
      const offset = (model.wallThick[w.id] || 12) / 2 + 11 * k;
      html += label((w.a.x + w.b.x) / 2 + (w.b.y - w.a.y) / len * offset, (w.a.y + w.b.y) / 2 - (w.b.x - w.a.x) / len * offset, "dim", E.fmt(len / 100, 2));
    });
  }

  if (show.notes) {
    const chosen = st.sel && st.sel.type === "note" && noteById(st.sel.id as Id);
    st.plan.notes.forEach(function (nt) { html += (nt === chosen ? P.noteSVG(nt, k, true) : "") + P.noteSVG(nt, k, false); });
    if (chosen && chosen.kind !== "pen" && chosen.kind !== "text") { // los dos puntos que la definen se pueden arrastrar
      chosen.pts.forEach(function (p) { html += '<circle class="handle" cx="' + n1(p.x) + '" cy="' + n1(p.y) + '" r="' + n1(6 * k) + '" stroke-width="' + n1(2 * k) + '"/>'; });
    }
  }
  if (st.drag && st.drag.type === "draw") html += P.noteSVG(st.drag.note as Note, k, false);
  if (st.sel && st.sel.type === "wall" && wallById(st.sel.id as Id)) {
    [(wallById(st.sel.id as Id) as Wall).a, (wallById(st.sel.id as Id) as Wall).b].forEach(function (p) {
      html += '<circle class="handle" cx="' + n1(p.x) + '" cy="' + n1(p.y) + '" r="' + n1(6 * k) + '" stroke-width="' + n1(2 * k) + '"/>';
    });
  }
  if ((st.tool === "wall" || st.tool === "room") && st.hover) {
    if (st.chain && st.tool === "wall") {
      html += P.lineSVG(st.chain, st.hover, "preview", 3 * k, dash);
      html += label(st.hover.x + 10 * k, st.hover.y - 10 * k, "dim preview-label", (st.typed || E.fmt(dist(st.chain, st.hover) / 100, 2)) + " m");
    }
    if (st.chain && st.tool === "room") {
      html += '<rect class="preview" fill="none" stroke-width="' + n1(3 * k) + '"' + dash + ' x="' + Math.min(st.chain.x, st.hover.x) + '" y="' + Math.min(st.chain.y, st.hover.y) +
        '" width="' + Math.abs(st.hover.x - st.chain.x) + '" height="' + Math.abs(st.hover.y - st.chain.y) + '"/>';
      html += label(st.hover.x + 10 * k, st.hover.y - 10 * k, "dim preview-label",
        E.fmt(Math.abs(st.hover.x - st.chain.x) / 100, 2) + " × " + E.fmt(Math.abs(st.hover.y - st.chain.y) / 100, 2) + " m");
    }
    html += '<circle class="cursor" cx="' + n1(st.hover.x) + '" cy="' + n1(st.hover.y) + '" r="' + n1(4 * k) + '"/>';
  }
  if (st.sketch) {
    st.sketch.segments.forEach(function (s) { html += P.lineSVG(sketchPoint(s.x1, s.y1), sketchPoint(s.x2, s.y2), "sketch-wall", 5 * k); });
    st.sketch.openings.forEach(function (o) { // vista previa de lo detectado: hueco, y además hoja y arco en las puertas
      const half = o.w / 2, a = o.horizontal ? sketchPoint(o.x - half, o.y) : sketchPoint(o.x, o.y - half), b = o.horizontal ? sketchPoint(o.x + half, o.y) : sketchPoint(o.x, o.y + half);
      html += P.lineSVG(a, b, o.kind === "window" ? "sketch-window" : "gap", 7 * k);
      if (o.kind !== "door") return;
      const hinge = sketchPoint(o.hx, o.hy), tip = sketchPoint(o.tx, o.ty), far = dist(a, hinge) < dist(b, hinge) ? b : a, r = dist(hinge, tip);
      const cross = (tip.x - hinge.x) * (far.y - hinge.y) - (tip.y - hinge.y) * (far.x - hinge.x);
      html += '<path class="sketch-door" stroke-width="' + n1(2 * k) + '" d="M' + n1(hinge.x) + " " + n1(hinge.y) + "L" + n1(tip.x) + " " + n1(tip.y) + "A" + n1(r) + " " + n1(r) +
        " 0 0 " + (cross > 0 ? 1 : 0) + " " + n1(far.x) + " " + n1(far.y) + '"/>';
    });
  }
  const roofShape = show.roof && P.roofShape(st.plan);
  if (roofShape) { // contorno del alero y cumbrera
    html += '<rect class="roof-outline" x="' + roofShape.x0 + '" y="' + roofShape.y0 + '" width="' + (roofShape.x1 - roofShape.x0) + '" height="' + (roofShape.y1 - roofShape.y0) + '" stroke-width="' + n1(1.5 * k) + '"' + dash + "/>";
    if (roofShape.type === "tejas") {
      const xm = (roofShape.x0 + roofShape.x1) / 2, ym = (roofShape.y0 + roofShape.y1) / 2;
      html += roofShape.alongX ? P.lineSVG({ x: roofShape.x0, y: ym }, { x: roofShape.x1, y: ym }, "roof-outline", 1.5 * k) : P.lineSVG({ x: xm, y: roofShape.y0 }, { x: xm, y: roofShape.y1 }, "roof-outline", 1.5 * k);
    }
  }
  if (st.plan.section) {
    html += P.lineSVG(st.plan.section.a, st.plan.section.b, "section-line", 2 * k, ' stroke-dasharray="' + n1(14 * k) + " " + n1(5 * k) + " " + n1(3 * k) + " " + n1(5 * k) + '"') +
      label(st.plan.section.a.x, st.plan.section.a.y - 14 * k, "section-tag", "A") + label(st.plan.section.b.x, st.plan.section.b.y - 14 * k, "section-tag", "A");
  }
  if (st.hover && st.chain && st.tool === "surface") {
    html += '<rect class="preview" stroke-width="' + n1(3 * k) + '"' + dash + ' x="' + Math.min(st.chain.x, st.hover.x) + '" y="' + Math.min(st.chain.y, st.hover.y) +
      '" width="' + Math.abs(st.hover.x - st.chain.x) + '" height="' + Math.abs(st.hover.y - st.chain.y) + '"/>';
  }
  if (st.hover && st.chain && st.tool === "section") html += P.lineSVG(st.chain, st.hover, "preview", 2 * k, dash);
  if (st.hover && st.chain && st.tool === "arc") {
    const chain = st.chain, hover = st.hover, pts = st.arcEnd ? P.arcPoints(chain, st.arcEnd, hover) || [chain, st.arcEnd] : [chain, hover];
    html += '<polyline class="preview" stroke-width="' + n1(3 * k) + '"' + dash + ' points="' + pts.map((q) => n1(q.x) + "," + n1(q.y)).join(" ") + '"/>';
  }
  if (st.hover && st.wireFrom && st.tool === "wire" && itemById(st.wireFrom)) html += P.lineSVG(itemById(st.wireFrom) as Item, st.hover, "preview", 2 * k, dash);
  if (st.drag && st.drag.type === "box") { // recuadro de selección
    const box = st.drag as unknown as { start: Point; cur: Point };
    html += '<rect class="select-box" stroke-width="' + n1(k) + '" x="' + n1(Math.min(box.start.x, box.cur.x)) + '" y="' + n1(Math.min(box.start.y, box.cur.y)) +
      '" width="' + n1(Math.abs(box.cur.x - box.start.x)) + '" height="' + n1(Math.abs(box.cur.y - box.start.y)) + '"/>';
  }
  if (st.measure) {
    const measure = st.measure, end = measure.b || st.hover;
    html += '<circle class="cursor" cx="' + n1(measure.a.x) + '" cy="' + n1(measure.a.y) + '" r="' + n1(4 * k) + '"/>';
    if (end) {
      html += P.lineSVG(measure.a, end, "preview", 2 * k, dash) + '<circle class="cursor" cx="' + n1(end.x) + '" cy="' + n1(end.y) + '" r="' + n1(4 * k) + '"/>' +
        label((measure.a.x + end.x) / 2, (measure.a.y + end.y) / 2 - 12 * k, "dim measure-label", E.fmt(dist(measure.a, end) / 100, 2) + " m");
    }
  }
  svg.innerHTML = html + (st.presenting ? "" : rulersSVG(k));

  const bar = STEPS.find((s) => s / k >= 70) || STEPS[STEPS.length - 1];
  scaleBar.style.width = Math.round(bar / k) + "px";
  scaleBar.textContent = E.fmt(bar / 100, 1) + " m";
  zoomOut.textContent = Math.round(100 / k) + "%";
  emptyBox.hidden = st.plan.walls.length > 0 || !!st.chain || !!st.sketch;
  // Planta vacía pero con otra dibujada: se avisa, porque el cómputo sigue sumando la otra.
  const drawn = P.levelsOf(st.plan).filter((level, i) => i !== model.level && level.walls.length).map((level) => level.name.toLowerCase());
  emptyNote.hidden = !drawn.length;
  emptyNote.textContent = drawn.length ? "Esta planta está vacía, pero el plano tiene dibujada la " + drawn.join(" y la ") + ". Cambiá de planta con el selector de arriba; el cómputo suma todas." : "";
  const cutSVG = P.sectionSVG(st.plan);
  sectionBox.hidden = !st.plan.section;
  sectionOut.innerHTML = cutSVG || '<p class="ws-tip">La línea de corte no atraviesa ningún muro de la vivienda.</p>';
  renderResult(model);
}

/** Panel de resultados (cómputo y acciones) y verificación CIRSOC; también arma el texto para copiar. */
function renderResult(model: Model) {
  const brand = window.__BRAND__, { out, checksOut, checksCount } = ui();
  const stat = (m: { label: string; value: string; unit: string }) => '<div class="stat"><span class="stat-label">' + escHTML(m.label) + '</span><span class="stat-value">' +
    escHTML(m.value) + '</span><span class="stat-unit">' + escHTML(m.unit) + "</span></div>";
  const row = (r: Row) => "<div><dt>" + escHTML(r.label) + "</dt><dd>" + escHTML(r.value) + "</dd></div>";
  const lines = [(st.plan.name || UNTITLED) + " — cómputo de materiales"];
  model.main.forEach(function (m) { lines.push("• " + m.label + ": " + m.value + " " + m.unit); });
  model.sections.forEach(function (s) {
    lines.push("", s.title.toUpperCase());
    s.rows.forEach(function (r) { lines.push("• " + r.label + ": " + r.value); });
  });
  if (model.checks.length) {
    lines.push("", "VERIFICACIÓN CIRSOC");
    model.checks.forEach(function (c) { lines.push((c.state === "ok" ? "✓ " : c.state === "fail" ? "✗ " : "· ") + c.text + " [" + c.ref + "]"); });
  }
  lines.push("", "Calculado con " + (brand.name || "") + " — " + location.href);
  st.text = lines.join("\n");

  const failed = model.checks.filter((c) => c.state === "fail").length;
  checksCount.textContent = !model.checks.length ? "" : failed ? failed + (failed === 1 ? " observación" : " observaciones") : "sin observaciones";
  checksCount.className = failed ? "is-fail" : "is-ok";
  checksOut.innerHTML = model.checks.length ? '<ul class="checks">' + model.checks.map(function (c) {
    return '<li class="check is-' + c.state + '"><span class="check-mark" aria-hidden="true">' + (c.state === "ok" ? "✓" : c.state === "fail" ? "✗" : "i") + '</span><span><span class="check-state">' +
      (c.state === "ok" ? "Cumple: " : c.state === "fail" ? "No cumple: " : "Nota: ") + "</span>" + escHTML(c.text) + ' <small class="check-ref">' + escHTML(c.ref) + "</small></span></li>";
  }).join("") + '</ul><p class="ws-tip">Verificación automática de apoyo sobre el texto de los reglamentos publicados por el INTI. No reemplaza el proyecto ni la firma de un profesional matriculado.</p>'
    : '<p class="ws-tip">Dibujá los muros para verificarlos contra los reglamentos CIRSOC.</p>';

  out.innerHTML = '<div class="result-main">' + model.main.map(stat).join("") + "</div>" +
    model.sections.map(function (s) {
      return '<h3 class="result-section">' + escHTML(s.title) + '</h3><dl class="result-rows">' + s.rows.map(row).join("") + "</dl>";
    }).join("") +
    '<ul class="result-notes">' + model.notes.map((n) => "<li>" + escHTML(n) + "</li>").join("") + "</ul>" +
    '<div class="result-actions"><button type="button" class="btn" data-copy>Copiar cómputo</button>' +
    '<button type="button" class="btn btn-ghost" data-action="schedules">Planillas</button>' +
    '<button type="button" class="btn btn-ghost" data-action="budget">Presupuesto</button>' +
    '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(st.text) + '">Enviar por WhatsApp</a></div>';
}
