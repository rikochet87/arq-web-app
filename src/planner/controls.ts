/* Los controles alrededor del lienzo: botones y bibliotecas (clic), atajos de teclado, campos del inspector, ajustes,
   capas, planta, opción, título, imagen de referencia, boceto y archivos. */
import { engine as E } from "../../lib/calc";
import type { Id, Item, Note, Opening, Surface, Wall } from "../types/plan";
import { actions } from "./actions";
import { GRID, KEYS, UNTITLED } from "./constants";
import { $, $$ } from "./dom";
import { addWallPoint, commit, removeSelection, renderLibrary, setColor, setTool, tagRoom } from "./edit";
import { dist } from "./geometry";
import { renderInspector } from "./inspector";
import { openPlanFile, openRefImage } from "./io";
import { showLevel, showVariant, stashLevel, stashVariant } from "./levels";
import { render } from "./render";
import { applyViewTemplate, readSettings, syncTemplates } from "./settings";
import { detectSketch, readSketch } from "./sketch";
import { itemById, layers, noteById, openingById, pickedWalls, selected, st, surfaceById, wallById, wallsSel } from "./state";
import { pushHistory, save, saveShelf } from "./store";
import { ui } from "./ui";
import { present, showView } from "./views";
import { clampT, movePoints } from "./viewport";
import { typeInput } from "./walltypes";

type Fields = Record<string, unknown>;
type Field = HTMLInputElement; // campos del inspector y los formularios: input o select, con name y value

function onClick(e: MouseEvent) {
  const target = e.target as Element, near = (sel: string) => target.closest(sel);
  const t = near("[data-tool]"), a = near("[data-action]") as HTMLElement | null, item = near("[data-pick]"), thing = near("[data-pick-item]");
  const gone = near("[data-shelf-remove]"), mine = near("[data-pick-shelf]");
  if (gone) { // quitar un mueble de la biblioteca personal; los que ya están en el plano no cambian
    const id = gone.getAttribute("data-shelf-remove");
    st.shelf = st.shelf.filter((o) => o.id !== id);
    saveShelf();
    if (st.stamp && st.stamp.id === id) setTool("select");
    renderLibrary();
    return;
  }
  if (mine) { const own = st.shelf.find((o) => o.id === mine.getAttribute("data-pick-shelf")); if (own) setTool("item", own.type, own); return; }
  const tpl = near("[data-view-tpl]");
  if (tpl) { applyViewTemplate(tpl.getAttribute("data-view-tpl") as string); return; }
  const swatch = near("[data-swatch]");
  if (swatch) { setColor(swatch.getAttribute("data-swatch") as string); return; }
  const view = near("[data-view]");
  if (view) { showView(view.getAttribute("data-view") as string); return; }
  if (t) setTool(t.getAttribute("data-tool") as string);
  else if (item) setTool("opening", item.getAttribute("data-pick"));
  else if (thing) setTool("item", thing.getAttribute("data-pick-item"));
  else if (a && actions[a.getAttribute("data-action") as string]) {
    actions[a.getAttribute("data-action") as string](a);
    const menu = a.closest(".ws-menu");
    if (menu) menu.removeAttribute("open");
  }
  else if (near("[data-copy]")) {
    const button = near("[data-copy]") as HTMLElement;
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(st.text) : Promise.reject()).then(
      function () { button.textContent = "✓ Copiado"; }, function () { button.textContent = "No se pudo copiar"; });
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target as Element).tagName)) return;
  if (e.code === "Space") { // mientras esté apretada, arrastrar desplaza el plano
    e.preventDefault();
    st.spaceDown = true;
    ui.svg.setAttribute("data-pan", "");
    return;
  }
  const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (st.tool === "wall" && st.chain && !ctrl) { // largo escrito a mano
    const chain = st.chain;
    if (/^[0-9.,]$/.test(e.key)) { st.typed += e.key; if (!st.hover) st.hover = { x: chain.x + 100, y: chain.y }; render(); return; }
    if (e.key === "Backspace" && st.typed) { e.preventDefault(); st.typed = st.typed.slice(0, -1); render(); return; }
    if (e.key === "Enter" && st.typed) {
      const hover = st.hover, len = E.parseNum(st.typed) * 100, d = hover && dist(chain, hover);
      if (hover && len >= GRID && d) addWallPoint({ x: Math.round(chain.x + (hover.x - chain.x) / d * len), y: Math.round(chain.y + (hover.y - chain.y) / d * len) });
      return;
    }
  }
  if (e.key === "Escape") {
    if (st.chain || st.wireFrom) { st.chain = null; st.arcEnd = null; st.wireFrom = null; st.typed = ""; render(); }
    else if (st.sel && (st.tool === "select" || st.tool === "pan")) commit(null);
    else if (st.presenting && st.tool === "pan") present(false);
    else setTool(st.presenting ? "pan" : "select");
  }
  else if (ctrl && key === "a" && st.tool === "select") { e.preventDefault(); commit(wallsSel(st.plan.walls.map((w) => w.id))); }
  else if (e.key === "Delete" || e.key === "Backspace") { if (st.sel) { e.preventDefault(); removeSelection(); } }
  else if (ctrl && key === "z") { e.preventDefault(); actions[e.shiftKey ? "redo" : "undo"](ui.root); }
  else if (ctrl && key === "y") { e.preventDefault(); actions.redo(ui.root); }
  else if (!ctrl && !e.altKey && KEYS[key]) setTool(KEYS[key][0], KEYS[key][1]);
}

// Lo que se cambia en el inspector: medidas, tipo, fase, nombre, piso, texto…
function onInspectorChange(e: Event) {
  const el = e.target as Field, name = el.name;
  // Sin nada seleccionado, el único campo posible es el ladrillo de los muros nuevos.
  if (name === "nextType") { st.nextType = el.value; renderInspector(); return; }
  if (name === "nextPhase") { st.nextPhase = el.value; renderInspector(); return; }
  const sel = st.sel;
  if (name === "phase") {
    pushHistory();
    const v = el.value;
    if ((sel as NonNullable<typeof sel>).type === "opening") {
      const o = selected() as Opening;
      if (v) o.phase = v as Opening["phase"]; else delete o.phase;
    } else {
      pickedWalls().map(wallById).forEach(function (wall) {
        const w = wall as Wall;
        // Un muro que pasa a existente conserva el tipo que tiene hoy, aunque después cambie la planta a su alrededor.
        if (v && !w.type) { const edge = (st.model as NonNullable<typeof st.model>).edges.find((x) => x.wall === w.id); if (edge) w.type = edge.wt; }
        if (v) w.phase = v as Wall["phase"]; else delete w.phase;
      });
    }
    commit(st.sel);
    return;
  }
  if (name === "nextW") { st.nextNote.w = el.value; return; }
  if (!sel) return;
  const id = sel.id as Id;
  if (sel.type === "room") { tagRoom(name as "name" | "floor" | "color", el.value.trim()); return; }
  if (sel.type === "note") {
    pushHistory();
    (noteById(id) as Note as unknown as Fields)[name] = name === "text" ? el.value.trim() || "Nota" : el.value;
    commit(st.sel);
    return;
  }
  if (sel.type === "surface") {
    const sf = surfaceById(id) as Surface, v = Math.round(E.parseNum(el.value) * 100);
    if (name !== "type" && !(v >= GRID)) { renderInspector(); return; }
    pushHistory();
    (sf as unknown as Fields)[name] = name === "type" ? el.value : v;
    commit(st.sel);
    return;
  }
  if (sel.type === "item" && (name === "name" || name === "shape")) { // solo en muebles a medida
    pushHistory();
    (itemById(id) as Item as unknown as Fields)[name] = el.value.trim().slice(0, 40);
    commit(st.sel);
    return;
  }
  if (sel.type === "item") {
    const it = itemById(id) as Item, v = E.parseNum(el.value);
    if (name === "r" ? !isFinite(v) : !(v * 100 >= 5)) { renderInspector(); return; }
    pushHistory();
    if (name === "r") it.r = ((Math.round(v) % 360) + 360) % 360;
    else (it as unknown as Fields)[name] = Math.round(v * 100);
    commit(st.sel);
    return;
  }
  if (name === "type" && (sel.type === "wall" || sel.type === "walls")) { // ladrillo propio de cada muro elegido; vacío = el tipo por defecto
    pushHistory();
    pickedWalls().map(wallById).forEach(function (w) { if (el.value) (w as Wall).type = el.value; else delete (w as Wall).type; });
    commit(st.sel);
    return;
  }
  const value = E.parseNum(el.value) * 100;
  if (!(value >= GRID)) { renderInspector(); return; }
  pushHistory();
  if (sel.type === "wall") {
    const w = wallById(id) as Wall, len = dist(w.a, w.b);
    movePoints([{ from: w.b, to: { x: Math.round(w.a.x + (w.b.x - w.a.x) / len * value), y: Math.round(w.a.y + (w.b.y - w.a.y) / len * value) } }]);
  } else {
    const o = openingById(id) as Opening;
    (o as unknown as Fields)[name] = Math.round(value);
    o.t = clampT(o, o.t);
  }
  commit(st.sel);
}

// Boceto, planta, opción y capas: los selectores y casillas que no están en un formulario propio.
function onRootChange(e: Event) {
  const el = e.target as Field;
  const sketchField = el.getAttribute && el.getAttribute("data-sketch");
  if (sketchField && st.sketch) {
    const v = E.parseNum(el.value);
    if (sketchField === "width" && v >= 1 && v <= 200) st.sketch.width = v;
    if (sketchField === "detail") st.sketch.detail = v;
    detectSketch();
    return;
  }
  if (el.hasAttribute && el.hasAttribute("data-level")) { stashLevel(); showLevel(Number(el.value)); return; }
  if (el.hasAttribute && el.hasAttribute("data-variant")) { stashVariant(); showVariant(Number(el.value)); if (st.presenting) setTool("pan"); return; }
  const layer = el.getAttribute && el.getAttribute("data-layer");
  if (!layer) return;
  st.plan.layers = Object.assign(layers(), { [layer]: el.checked });
  delete st.plan.viewTemplate; // tocó una capa a mano: la vista ya no es la de la plantilla
  save();
  syncTemplates();
  render();
  if (!ui.stage3d.hidden) showView("3d"); // el techo se muestra u oculta también en 3D
}

// Ancho y transparencia de la imagen de referencia, mientras se escribe.
function onRootInput(e: Event) {
  const el = e.target as Field, key = el.getAttribute && el.getAttribute("data-ref");
  if (!key || !st.plan.ref) return;
  const v = E.parseNum(el.value);
  if (key === "w" ? !(v >= 0.5) : !(v >= 0)) return;
  (st.plan.ref as unknown as Fields)[key] = key === "w" ? Math.round(v * 100) : v;
  save();
  render();
}

/** Conecta botones, teclado, inspector, formularios y archivos. */
export function bindControls() {
  const { root, svg, settings, title, phaseView } = ui;
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);
  const releaseSpace = function () { st.spaceDown = false; svg.removeAttribute("data-pan"); };
  document.addEventListener("keyup", function (e) { if (e.code === "Space") releaseSpace(); });
  window.addEventListener("blur", releaseSpace);
  document.addEventListener("fullscreenchange", function () { if (st.presenting && !document.fullscreenElement) present(false); });

  ui.inspector.addEventListener("change", onInspectorChange);
  settings.addEventListener("input", readSettings);
  settings.addEventListener("change", readSettings);
  settings.addEventListener("submit", function (e) { e.preventDefault(); });
  if (phaseView) phaseView.addEventListener("change", function () { st.plan.phaseView = phaseView.value; delete st.plan.viewTemplate; save(); syncTemplates(); render(); });
  const typesBox = $("[data-types]", root);
  if (typesBox) typesBox.addEventListener("change", typeInput);
  root.addEventListener("change", onRootChange);
  title.addEventListener("change", function () {
    st.plan.name = title.value.trim();
    title.value = st.plan.name || UNTITLED;
    save();
    render();
  });
  title.addEventListener("focus", function () { title.select(); });
  root.addEventListener("input", onRootInput);
  $$<HTMLInputElement>("[data-file]", root).forEach(function (input) {
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (file) (({ plan: openPlanFile, sketch: readSketch } as Record<string, (f: File) => void>)[input.getAttribute("data-file") as string] || openRefImage)(file);
      input.value = "";
    });
  });
}
