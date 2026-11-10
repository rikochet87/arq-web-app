/* Inspector: el panel con las propiedades de lo elegido (muro, varios muros, abertura, superficie, objeto, anotación
   o ambiente) y, sin nada elegido, las opciones de lo que se está por dibujar (tipo y fase de los muros, color y
   grosor de las anotaciones). */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P, type Room } from "../../lib/plan";
import type { Item, Note, Opening, Phase, Surface, Wall } from "../types/plan";
import { COLOR_NAMES } from "./constants";
import { ops } from "./context";
import { $, escHTML } from "./dom";
import { dist } from "./geometry";
import { selected, st, wallById } from "./state";
import { hasWires } from "./viewport";
import { defaultType, thickText } from "./walltypes";

const NOTES: Record<string, string> = P.NOTE_KINDS; // herramientas de anotación y su nombre

const PHASE_OPTIONS = [["", "A construir"], ["existente", "Existente"], ["demoler", "Existente a demoler"]];
const phaseSelect = (current: Phase | undefined, mixed?: boolean) => '<label>Fase <select name="phase">' + (mixed ? '<option value="mixed" selected disabled>Varias</option>' : "") +
  PHASE_OPTIONS.map((o) => '<option value="' + o[0] + '"' + (!mixed && (current || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";

export function renderInspector() {
  const inspector = $("[data-inspector]", ops.root) as HTMLElement;
  const item = selected();
  const field = (name: string, labelText: string, value: number) => "<label>" + labelText + ' <input name="' + name + '" type="text" inputmode="decimal" autocomplete="off" value="' +
    E.fmt(value, 2) + '"> m</label>';
  const button = (action: string, labelText: string) => '<button type="button" class="btn btn-ghost" data-action="' + action + '">' + labelText + "</button>";
  const typeOptions = (current: string | null | undefined) => P.wallTypeList(st.plan).map((t) => '<option value="' + escHTML(t.id) + '"' + (t.id === current ? " selected" : "") + ">" +
    escHTML(t.name) + "</option>").join("");
  const swatches = (current: string | undefined, first: string) => '<span class="swatches" role="group" aria-label="Color">' + [""].concat(P.PALETTE).map((c) => '<button type="button" class="swatch" data-swatch="' + c +
    '" aria-pressed="' + ((current || "") === c) + '" title="' + (c ? COLOR_NAMES[c] : first) + '" aria-label="' + (c ? COLOR_NAMES[c] : first) + '"' + (c ? ' style="--sw:' + c + '"' : "") + "></button>").join("") + "</span>";
  const weight = (name: string, current: string | undefined, isText: boolean) => "<label>" + (isText ? "Tamaño" : "Grosor") + ' <select name="' + name + '">' + [["s", isText ? "Chico" : "Fino"], ["m", "Medio"], ["l", isText ? "Grande" : "Grueso"]]
    .map((o) => '<option value="' + o[0] + '"' + ((current || "m") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
  const drawing = st.tool === "wall" || st.tool === "room" || st.tool === "arc", annotating = !!NOTES[st.tool];
  inspector.hidden = !item && !drawing && !annotating;
  if (!item && annotating) { // anotando: color y grosor de lo que se dibuje a continuación
    inspector.innerHTML = "<strong>" + escHTML(NOTES[st.tool]) + "</strong>" + swatches(st.nextNote.color, "Tinta") + weight("nextW", st.nextNote.w, st.tool === "text");
    return;
  }
  if (!item) { // dibujando: se elige el ladrillo de los muros que vienen
    if (drawing) {
      const t = P.wallTypesOf(st.plan)[st.nextType];
      inspector.innerHTML = '<strong>Muros nuevos</strong><label>Tipo <select name="nextType"><option value="">Por defecto, según quede exterior o interior</option>' + typeOptions(st.nextType) +
        "</select></label><span>" + (t ? thickText(t) : "se define en Ajustes de obra") + "</span>" +
        '<label>Fase <select name="nextPhase"><option value="">A construir</option><option value="existente"' + (st.nextPhase === "existente" ? " selected" : "") +
        ">Existente (relevamiento)</option></select></label>";
    }
    return;
  }
  const sel = st.sel as NonNullable<typeof st.sel>;
  if (sel.type === "note") {
    const note = item as Note;
    inspector.innerHTML = "<strong>" + escHTML(NOTES[note.kind]) + "</strong>" +
      (note.kind === "text" ? '<label>Texto <input name="text" type="text" autocomplete="off" maxlength="120" value="' + escHTML(note.text) + '"></label>' : "") +
      swatches(note.color, "Tinta") + weight("w", note.w, note.kind === "text") + button("duplicate", "Duplicar") + button("delete", "Borrar");
    return;
  }
  if (sel.type === "walls") {
    const walls = item as Wall[];
    const types = Object.keys(walls.reduce((set: Record<string, boolean>, w) => { set[w.type || ""] = true; return set; }, {})), mixed = types.length > 1;
    inspector.innerHTML = "<strong>" + walls.length + " muros</strong>" + '<label>Tipo <select name="type">' + (mixed ? '<option value="mixed" selected disabled>Varios</option>' : "") +
      '<option value=""' + (!mixed && types[0] === "" ? " selected" : "") + ">Por defecto</option>" + typeOptions(mixed ? null : types[0]) + "</select></label>" +
      phaseSelect(walls[0].phase, walls.some((w) => (w.phase || "") !== (walls[0].phase || ""))) + "<span>" +
      E.fmt(walls.reduce((sum, w) => sum + dist(w.a, w.b), 0) / 100, 2) + " m en total</span>" + button("delete", "Borrar");
    return;
  }
  if (sel.type === "wall") {
    const wall = item as Wall;
    // Clase (exterior o interior) detectada sola, y tipo que le tocaría por defecto.
    const edge = (st.model as NonNullable<typeof st.model>).edges.find((e) => e.wall === wall.id) || { cls: "ext" as const }, outside = edge.cls !== "int";
    const types = P.wallTypesOf(st.plan), usual = defaultType(edge.cls), t = types[wall.type as string] || usual;
    inspector.innerHTML = "<strong>" + (outside ? "Muro exterior" : "Muro interior") + "</strong>" + field("length", "Largo", dist(wall.a, wall.b) / 100) +
      '<label>Tipo <select name="type"><option value="">Por defecto: ' + escHTML(usual.name) + "</option>" + typeOptions(wall.type) + "</select></label>" +
      "<span>" + E.fmt(P.typeThick(t, edge.cls), 1) + " cm terminado · ladrillo de " + E.fmt(D.bricks[t.brick].e, 1) + " cm</span>" + phaseSelect(wall.phase) +
      '<button type="button" class="btn btn-ghost" data-action="type-edit" data-type="' + escHTML(t.id) + '">Editar el tipo</button>' +
      button("split", "Dividir en dos") + button("delete", "Borrar");
  } else if (sel.type === "opening") {
    const o = item as Opening, def = P.typeOf(o), host = wallById(o.wall), hostPhase = host ? P.wallPhase(host) : "nueva";
    // En un muro existente la abertura puede quedar, retirarse o ser un vano nuevo; en un muro nuevo siempre es nueva.
    const phaseBox = hostPhase === "existente" ? '<label>Fase <select name="phase">' + [["", "Existente, como su muro"], ["nueva", "Vano nuevo (a construir)"], ["demoler", "A retirar"]]
      .map((op) => '<option value="' + op[0] + '"' + ((o.phase === "existente" ? "" : o.phase || "") === op[0] ? " selected" : "") + ">" + op[1] + "</option>").join("") + "</select></label>"
      : hostPhase === "demoler" ? "<span>Se retira con su muro</span>" : "";
    inspector.innerHTML = "<strong>" + escHTML(def.label) + "</strong>" + field("w", "Ancho", o.w / 100) + field("h", "Alto", o.h / 100) + phaseBox +
      (/swing|double|garage/.test(def.symbol) ? button("flip-side", "Cambiar lado") : "") +
      (def.symbol === "swing" ? button("flip-hinge", "Cambiar bisagra") : "") + button("duplicate", "Duplicar") + button("delete", "Borrar");
  } else if (sel.type === "surface") {
    const sf = item as Surface;
    inspector.innerHTML = '<strong>Exterior</strong><label>Tipo <select name="type">' + Object.keys(D.surfaces).map((key) => '<option value="' + key + '"' + (key === sf.type ? " selected" : "") + ">" +
      escHTML(D.surfaces[key].label) + "</option>").join("") + "</select></label>" + field("w", "Ancho", sf.w / 100) + field("h", "Largo", sf.h / 100) + button("delete", "Borrar");
  } else if (sel.type === "item") {
    const it = item as Item, own = D.items[it.type].custom;
    inspector.innerHTML = "<strong>" + escHTML(D.items[it.type].label) + "</strong>" +
      (own ? '<label>Nombre <input name="name" type="text" autocomplete="off" maxlength="40" value="' + escHTML(it.name || "") + '"></label>' : "") +
      field("w", "Ancho", it.w / 100) + field("d", "Fondo", it.d / 100) +
      (own ? field("tall", "Alto", (it.tall || (D.items[it.type].tall as number)) / 100) + '<label>Forma <select name="shape"><option value="">Rectangular</option><option value="round"' +
        (it.shape === "round" ? " selected" : "") + ">Redonda</option></select></label>" : "") +
      '<label>Giro <input name="r" type="text" inputmode="numeric" autocomplete="off" value="' + (it.r || 0) + '"> °</label>' +
      button("rotate", "Girar 90°") + button("duplicate", "Duplicar") + button("shelf-add", "Guardar en Mis muebles") + (hasWires(it.id) ? button("unwire", "Quitar cables") : "") + button("delete", "Borrar");
  } else {
    const room = item as Room;
    inspector.innerHTML = "<strong>Ambiente</strong><label>Nombre " + '<input name="name" type="text" list="room-types" autocomplete="off" value="' +
      escHTML(room.name) + '"></label><datalist id="room-types">' + D.roomTypes.map((n) => '<option value="' + escHTML(n) + '">').join("") +
      '</datalist><label>Piso <select name="floor">' + Object.keys(D.floors).map((key) => '<option value="' + key + '"' + (key === room.floor ? " selected" : "") + ">" +
        escHTML(D.floors[key].label) + "</option>").join("") + "</select></label>" + swatches(room.color, "Sin color") + "<span>" + E.fmt(room.area, 1) + " m²</span>";
  }
}
