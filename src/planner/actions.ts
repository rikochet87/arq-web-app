/* Acciones de los botones del diseñador ([data-action]): deshacer, plantas, opciones, tipos de muro, archivos, zoom,
   planillas, presupuesto, láminas… También las usa el teclado (deshacer y rehacer). */
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Id, Item, Level, Note, Opening, Plan, Point, Wall, WallType } from "../types/plan";
import { GRID, OPTIONS, SHELF_MAX } from "./constants";
import { $ } from "./dom";
import { center, changeOpening, commit, removeSelection, renderLibrary, setTool } from "./edit";
import { download, fileName } from "./files";
import { copy, dist } from "./geometry";
import { renderInspector } from "./inspector";
import { exportDrawing, exportDxf, exportJson } from "./io";
import { showLevel, showVariant, stashLevel, stashVariant, variantCount } from "./levels";
import type { ShelfItem } from "./library";
import { openBudget } from "./budget";
import { render } from "./render";
import { openSchedules } from "./schedules";
import { syncSettings } from "./settings";
import { applySketch, cancelSketch } from "./sketch";
import { itemById, nextId, noteById, openingById, st, wallById, type View } from "./state";
import { pushHistory, restore, save, saveShelf } from "./store";
import { ui } from "./ui";
import { present } from "./views";
import { clampT, fit } from "./viewport";
import { defaultType, ensureTypes, everyWall, renderTypes } from "./walltypes";

type Fields = Record<string, unknown>;
interface DocsModule {
  open(api: { plan(): Plan; save(doc: NonNullable<Plan["doc"]>): void; download: typeof download; fileName(ext: string): string }): void;
}

const selId = () => (st.sel as NonNullable<typeof st.sel>).id;
const findItem = (id: unknown) => itemById(id as Id) as Item;
const findWall = (id: unknown) => wallById(id as Id) as Wall;
const findOpening = (id: unknown) => openingById(id as Id) as Opening;
const findNote = (id: unknown) => noteById(id as Id) as Note;
const hint = (text: string) => { ui.hint.textContent = text; };

/** Acerca o aleja el plano alrededor de un punto. */
export function zoomAt(p: Point, factor: number) {
  const view: View = st.view, w = Math.max(150, Math.min(20000, view.w * factor)), s = w / view.w;
  view.x = p.x - (p.x - view.x) * s;
  view.y = p.y - (p.y - view.y) * s;
  view.w = w;
  render();
}

export const actions: Record<string, (el: HTMLElement) => void> = {
  undo: function () { restore(st.history, st.future); },
  redo: function () { restore(st.future, st.history); },
  delete: removeSelection,
  "flip-side": function () { changeOpening(function (o) { o.side = !o.side; }); },
  "flip-hinge": function () { changeOpening(function (o) { o.hinge = !o.hinge; }); },
  rotate: function () {
    pushHistory();
    const it = findItem(selId());
    it.r = ((it.r || 0) + 90) % 360;
    commit(st.sel);
  },
  snap: function () { st.plan.snap = st.plan.snap === false; save(); syncSettings(); },
  multi: function () { st.multi = !st.multi; setTool("select"); },
  // Parte el muro por la mitad, para poder darle a cada tramo un ladrillo distinto. Las aberturas quedan en su lugar.
  split: function () {
    const w = findWall(selId()), len = dist(w.a, w.b), mid = { x: Math.round((w.a.x + w.b.x) / 2), y: Math.round((w.a.y + w.b.y) / 2) };
    if (len < 4 * GRID) return;
    pushHistory();
    const rest: Wall = Object.assign({}, w, { id: nextId(), a: copy(mid), b: copy(w.b) });
    const first = dist(w.a, mid);
    st.plan.openings.forEach(function (o) {
      if (o.wall !== w.id) return;
      const pos = o.t * len;
      if (pos > first) { o.wall = rest.id; o.t = (pos - first) / (len - first); } else o.t = pos / first;
    });
    w.b = copy(mid);
    st.plan.walls.push(rest);
    st.plan.openings.forEach(function (o) { if (o.wall === w.id || o.wall === rest.id) o.t = clampT(o, o.t); });
    commit({ type: "walls", ids: [w.id, rest.id] });
  },
  unwire: function () { pushHistory(); st.plan.wires = st.plan.wires.filter((w) => w.a !== selId() && w.b !== selId()); commit(st.sel); },
  "section-clear": function () { pushHistory(); st.plan.section = null; commit(st.sel); },
  "level-add": function () {
    const count = (st.plan.levels || []).length || 1;
    if (count >= P.LEVEL_NAMES.length) { hint("Se pueden cargar hasta " + P.LEVEL_NAMES.length + " plantas."); return; }
    pushHistory();
    stashLevel();
    const levels = st.plan.levels as Level[];
    // La planta nueva arranca con los muros exteriores de la última: lo habitual es apoyar muro sobre muro.
    const top = levels[count - 1], topWalls = top.walls || [];
    const edges = P.compute(Object.assign({}, st.plan, { level: count - 1, walls: topWalls, openings: top.openings || [], items: top.items || [], labels: top.labels || [] })).edges;
    const inner: Record<string, boolean> = {}, outer: Record<string, boolean> = {};
    edges.forEach(function (e) { (e.cls === "ext" ? outer : inner)[e.wall] = true; });
    levels.push({
      name: P.LEVEL_NAMES[count], openings: [], items: [], labels: [],
      walls: topWalls.filter((w) => outer[w.id] && !inner[w.id]).map((w) => Object.assign({ id: nextId(), a: copy(w.a), b: copy(w.b) }, w.type ? { type: w.type } : {}))
    });
    showLevel(count);
  },
  "level-remove": function () {
    if (!st.plan.levels || st.plan.levels.length < 2) { hint("El plano tiene una sola planta."); return; }
    pushHistory();
    stashLevel();
    const levels = st.plan.levels as Level[];
    levels.splice(st.plan.level as number, 1);
    levels.forEach(function (level, i) { level.name = P.LEVEL_NAMES[i]; });
    showLevel(Math.min(st.plan.level as number, levels.length - 1));
  },
  "export-svg": function () { exportDrawing(false); },
  "export-png": function () { exportDrawing(true); },
  "export-dxf": exportDxf,
  "export-json": exportJson,
  "open-file": function () { ($('[data-file="plan"]', ui.root) as HTMLElement).click(); },
  "type-edit": function (el) { // del inspector del muro al panel de tipos, con su tipo abierto
    st.editType = el.getAttribute("data-type") || "";
    const box = $<HTMLDetailsElement>("[data-types-box]", ui.root) as HTMLDetailsElement;
    box.open = true;
    renderTypes();
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const pick = $<HTMLElement>("[data-type-pick]", ui.root);
    if (pick) pick.focus({ preventScroll: true });
  },
  "type-new": function () { // duplica el tipo abierto: así se arma uno nuevo sin empezar de cero
    pushHistory();
    ensureTypes();
    const from = st.plan.wallTypes.find((x) => x.id === st.editType) || st.plan.wallTypes[0];
    const copyType: WallType = JSON.parse(JSON.stringify(from));
    copyType.id = "t-" + nextId();
    copyType.name = ("Copia de " + from.name).slice(0, 60);
    st.plan.wallTypes.push(copyType);
    st.editType = copyType.id;
    save(); render(); renderTypes();
    const name = $<HTMLInputElement>("[data-type-name]", ui.root);
    if (name) { name.focus(); name.select(); }
  },
  "type-delete": function () { // los muros que lo usaban vuelven al tipo por defecto de su clase
    ensureTypes();
    if (st.plan.wallTypes.length < 2 || (["ext", "int"] as const).some((c) => defaultType(c).id === st.editType)) return;
    const used = everyWall().filter((w) => w.type === st.editType);
    if (used.length && !window.confirm("Lo usan " + used.length + (used.length === 1 ? " muro, que pasa" : " muros, que pasan") + " al tipo por defecto. ¿Borrar el tipo?")) return;
    pushHistory();
    used.forEach((w) => { delete w.type; });
    st.plan.wallTypes = st.plan.wallTypes.filter((x) => x.id !== st.editType);
    if (st.nextType === st.editType) st.nextType = "";
    st.editType = "";
    save(); render(); renderTypes(); renderInspector();
  },
  "ref-load": function () { ($('[data-file="ref"]', ui.root) as HTMLElement).click(); },
  "sketch-load": function () { ($('[data-file="sketch"]', ui.root) as HTMLElement).click(); },
  "sketch-cancel": cancelSketch,
  "sketch-apply": applySketch,
  "ref-clear": function () { st.plan.ref = null; save(); syncSettings(); render(); },
  "variant-add": function () {
    if (variantCount() >= OPTIONS.length) { hint("Se pueden cargar hasta " + OPTIONS.length + " opciones."); return; }
    pushHistory();
    stashVariant();
    const from = st.plan.variant as number, variants = st.plan.variants as NonNullable<Plan["variants"]>;
    variants.push(JSON.parse(JSON.stringify(variants[from])));
    showVariant(variants.length - 1);
    hint("Opción " + OPTIONS[st.plan.variant as number] + " creada como copia de la " + OPTIONS[from] + ". Lo que cambies acá no toca las otras; cambiá de opción con el selector de arriba.");
  },
  "variant-remove": function () {
    if (variantCount() < 2) { hint("El plano tiene una sola opción."); return; }
    pushHistory();
    const gone = OPTIONS[st.plan.variant as number], variants = st.plan.variants as NonNullable<Plan["variants"]>;
    variants.splice(st.plan.variant as number, 1);
    showVariant(Math.min(st.plan.variant as number, variants.length - 1));
    if (st.plan.variants && st.plan.variants.length === 1) { st.plan.variants = []; st.plan.variant = 0; commit(null); }
    hint("Se eliminó la opción " + gone + ". Con Deshacer la recuperás.");
  },
  // Guarda el objeto elegido, con sus medidas, en la biblioteca personal.
  "shelf-add": function () {
    const it = findItem(selId()), def = D.items[it.type];
    const entry: ShelfItem = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), type: it.type, name: (def.custom && it.name) || def.label, w: it.w, d: it.d,
      tall: it.tall || undefined, shape: def.custom && it.shape === "round" ? "round" : undefined };
    const same = (o: ShelfItem) => o.type === entry.type && o.name === entry.name && o.w === entry.w && o.d === entry.d && o.tall === entry.tall && o.shape === entry.shape;
    if (st.shelf.some(same)) { hint("«" + entry.name + "» con esas medidas ya está en Mis muebles."); return; }
    if (st.shelf.length >= SHELF_MAX) { hint("Mis muebles admite hasta " + SHELF_MAX + ". Quitá alguno con la × para guardar otro."); return; }
    st.shelf.push(entry);
    saveShelf();
    renderLibrary();
    const group = $<HTMLDetailsElement>('[data-items] [data-group="propios"]', ui.root);
    if (group) group.open = true;
    hint("«" + entry.name + "» quedó guardado en Equipamiento → Mis muebles, en este navegador. Lo podés usar en cualquier plano.");
  },
  present: function () { present(true); },
  "present-exit": function () { present(false); },
  duplicate: function () {
    const sel = st.sel as NonNullable<typeof st.sel>;
    if (sel.type === "note") {
      const twin: Note = JSON.parse(JSON.stringify(findNote(sel.id)));
      twin.id = nextId();
      twin.pts.forEach(function (q) { q.x += 20; q.y += 20; });
      pushHistory();
      st.plan.notes.push(twin);
      commit({ type: "note", id: twin.id });
      return;
    }
    if (sel.type === "item") {
      const it = findItem(sel.id), copyOf: Item = Object.assign({}, it, { id: nextId(), x: it.x + 20, y: it.y + 20 });
      pushHistory();
      st.plan.items.push(copyOf);
      commit({ type: "item", id: copyOf.id });
      return;
    }
    const o = findOpening(sel.id), twin: Opening = Object.assign({}, o, { id: nextId() }), host = findWall(o.wall);
    pushHistory();
    twin.t = clampT(twin, o.t + (o.w + 20) / dist(host.a, host.b));
    st.plan.openings.push(twin);
    commit({ type: "opening", id: twin.id });
  },
  fit: function () { fit(); render(); },
  "zoom-in": function () { zoomAt(center(), 1 / 1.25); },
  "zoom-out": function () { zoomAt(center(), 1.25); },
  print: function () { window.print(); },
  // Planillas de carpinterías y locales, y presupuesto de obra: src/planner/schedules.ts y budget.ts.
  schedules: function () { openSchedules(); },
  budget: function () { openBudget(); },
  docs: function () {
    const docs = window.__BRAND__.docs as DocsModule | undefined;
    if (!docs) return;
    docs.open({ plan: function () { return st.plan; }, save: function (doc) { st.plan.doc = doc; save(); }, download: download, fileName: (ext) => fileName(st.plan.name, ext) });
  },
  clear: function () { // vacía el plano entero: todas las plantas y el corte, no solo la planta a la vista
    pushHistory();
    P.LEVEL_FIELDS.forEach(function (f) { (st.plan as unknown as Fields)[f] = []; });
    st.plan.levels = []; st.plan.level = 0; st.plan.section = null;
    st.chain = null;
    fit();
    commit(null);
    syncSettings();
  },
  sample: function () {
    pushHistory();
    const s = P.sample();
    s.settings = st.plan.settings; s.layers = st.plan.layers; s.snap = st.plan.snap; s.ref = st.plan.ref; s.name = st.plan.name; s.doc = st.plan.doc;
    s.variants = st.plan.variants; s.variant = st.plan.variant; // el ejemplo reemplaza solo la opción a la vista
    st.plan = s; st.chain = null;
    fit(); commit(null); syncSettings(); setTool("select");
  }
};
