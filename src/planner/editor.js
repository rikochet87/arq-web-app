/* CalcuObra — diseñador de planos: el editor SVG (estado, dibujo, inspector y eventos). La geometría, el cómputo y los
   símbolos están en lib/plan.ts; las constantes, las bibliotecas, las planillas y el presupuesto, en los otros módulos de
   src/planner/. */
import * as G from "./geometry.ts";
import { COLOR_NAMES, GRID, HANDOFF, HINTS, KEYS, OPTIONS, SHELF, SHELF_MAX, STORE, UNTITLED, VIEW_TEMPLATES } from "./constants.ts";
import { $, $$, escHTML } from "./dom.ts";
import { download, fileName as planFileName } from "./files.ts";
import { itemLibraryHTML, libraryHTML } from "./library.ts";
import { openBudget } from "./budget.ts";
import { openSchedules } from "./schedules.ts";
import { itemById, layers, nextId, noteById, openingById, pickedWalls, roomAt, st, surfaceById, wallById } from "./state.ts";
import { bindRender, render } from "./render.ts";
import { applySketch, cancelSketch, detectSketch, readSketch } from "./sketch.ts";
import { exportDrawing, exportDxf, exportJson, openPlanFile, openRefImage } from "./io.ts";
import { ops } from "./context.ts";
import { clampT, fit, hasWires, hitItem, hitNote, hitOpening, hitSurface, hitWall, itemPoint, movePoints, px, snap, toWorld } from "./viewport.ts";

const { dist, same, copy, round, n1, pt1, project, straight, simplify } = G;

const brand = window.__BRAND__ || {};
const E = brand.engine, P = brand.plan, D = brand.data;

const NOTES = P.NOTE_KINDS; // herramientas de anotación: trazo, línea, flecha, formas, nube y nota de texto

function init(root) {
  const svg = $("[data-canvas]", root), hint = $("[data-hint]", root), inspector = $("[data-inspector]", root);
  const settings = $("[data-settings]", root), title = $("[data-title]", root);
  const phaseView = $("[data-phase-view]", root);
  const compareBox = $("[data-compare-box]", root), compareOut = $("[data-compare]", root);
  const refBox = $("[data-ref-box]", root), stage3d = $("[data-view3d]", root), note3d = $("[data-view3d-msg]", root);
  const coords = $("[data-coords]", root);
  bindRender(root);
  st.canvas = svg;
  st.view = { x: 0, y: 0, w: 1000, h: 1000 };
  st.history = []; st.future = [];
  st.plan = start();
  st.tool = "select"; st.pick = null; st.sel = null; st.chain = null; st.hover = null; st.ghost = null; st.typed = ""; st.drag = null; st.model = null; st.text = ""; st.measure = null; st.arcEnd = null; st.wireFrom = null; st.sketch = null;
  st.spaceDown = false; // barra espaciadora apretada: arrastrar desplaza el plano, con cualquier herramienta
  st.nextType = ""; // tipo de muro (id) de los muros que se dibujen a continuación; vacío = el tipo por defecto de su clase
  st.editType = ""; // tipo de muro abierto en el panel "Tipos de muro"
  st.nextPhase = ""; // fase de los muros que se dibujen: vacío = a construir; "existente" para relevar lo que ya está
  st.multi = false; // "Elegir varios": cada toque suma o quita muros, como Shift; para pantallas táctiles
  st.nextNote = { color: "", w: "m" }; // color y grosor de las anotaciones que se dibujen a continuación
  st.shelf = loadShelf(); // biblioteca personal de muebles
  st.stamp = null; // mueble de la biblioteca personal que se está colocando; si no, se coloca el de la biblioteca general ("pick")
  st.presenting = false; // modo presentación: solo el plano, para mostrarlo y marcarlo frente al cliente

  // ---------- Estado ----------
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      return normalize(saved);
    } catch (e) { return null; }
  }
  // Acepta planos guardados por versiones anteriores y archivos abiertos desde el disco.
  function normalize(saved) {
    if (!saved || !Array.isArray(saved.walls) || !Array.isArray(saved.openings)) return null;
    saved.labels = saved.labels || [];
    saved.wires = saved.wires || [];
    saved.surfaces = saved.surfaces || [];
    saved.items = (saved.items || []).filter(function (it) { return D.items[it.type]; });
    saved.openings.forEach(function (o) { if (!D.openings[o.type]) o.type = o.kind === "window" ? "v120" : "p80"; });
    saved.notes = cleanNotes(saved.notes);
    saved.levels = cleanLevels(saved.levels);
    saved.level = Math.min(saved.level || 0, Math.max(0, saved.levels.length - 1));
    saved.variants = (Array.isArray(saved.variants) ? saved.variants : []).filter(function (v) { return v && Array.isArray(v.levels) && v.levels.length; }).slice(0, OPTIONS.length)
      .map(function (v) { const levels = cleanLevels(v.levels); return { levels: levels, level: Math.min(v.level || 0, levels.length - 1), section: v.section || null }; });
    saved.variant = Math.min(saved.variant || 0, Math.max(0, saved.variants.length - 1));
    P.migrateWalls(saved); // ladrillo por muro (planos viejos) → tipos de muro
    return saved;
  }
  // Biblioteca personal: solo entradas de un tipo conocido y con medidas.
  function loadShelf() {
    try {
      const list = JSON.parse(localStorage.getItem(SHELF));
      return (Array.isArray(list) ? list : []).filter((o) => o && D.items[o.type] && o.w >= 5 && o.d >= 5 && /^[a-z0-9]+$/.test(String(o.id))).slice(0, SHELF_MAX)
        .map((o) => ({ id: String(o.id), type: o.type, name: String(o.name || D.items[o.type].label).slice(0, 40), w: Math.round(o.w), d: Math.round(o.d), tall: o.tall >= 5 ? Math.round(o.tall) : undefined, shape: o.shape === "round" ? "round" : undefined }));
    } catch (e) { return []; }
  }
  function saveShelf() { try { localStorage.setItem(SHELF, JSON.stringify(st.shelf)); } catch (e) { /* sin almacenamiento */ } }
  // Vuelve a armar la biblioteca de equipamiento sin plegar los grupos que estaban abiertos.
  function renderLibrary() {
    const box = $("[data-items]", root), open = $$("details[open]", box).map((d) => d.getAttribute("data-group"));
    const first = !box.firstChild;
    box.innerHTML = itemLibraryHTML(st.shelf);
    if (!first) $$("details", box).forEach(function (d) { d.open = open.indexOf(d.getAttribute("data-group")) >= 0; });
    syncPicks();
  }
  function syncPicks() {
    $$("[data-pick]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-pick") === st.pick)));
    $$("[data-pick-item]", root).forEach((b) => b.setAttribute("aria-pressed", String(!st.stamp && b.getAttribute("data-pick-item") === st.pick)));
    $$("[data-pick-shelf]", root).forEach((b) => b.setAttribute("aria-pressed", String(!!st.stamp && b.getAttribute("data-pick-shelf") === st.stamp.id)));
  }
  // Objeto nuevo: el de la biblioteca general o, si se eligió uno propio, con sus medidas, nombre y forma.
  function newItem(id, q) {
    const it = P.item(id, st.pick, q.x, q.y, 0);
    if (!st.stamp) return it;
    it.w = st.stamp.w; it.d = st.stamp.d;
    if (D.items[it.type].custom) { it.name = st.stamp.name; if (st.stamp.shape) it.shape = st.stamp.shape; }
    if (st.stamp.tall) it.tall = st.stamp.tall;
    return it;
  }
  // Anotaciones bien formadas: un tipo conocido y puntos con números.
  function cleanNotes(list) {
    return (Array.isArray(list) ? list : []).filter(function (nt) {
      return nt && NOTES[nt.kind] && Array.isArray(nt.pts) && nt.pts.length >= (nt.kind === "text" ? 1 : 2) && nt.pts.every(function (q) { return q && isFinite(q.x) && isFinite(q.y); });
    });
  }
  function cleanLevels(list) {
    return (list || []).map(function (lv, i) {
      const level = { name: lv.name || P.LEVEL_NAMES[i] };
      P.LEVEL_FIELDS.forEach(function (f) { level[f] = lv[f] || []; });
      level.items = level.items.filter(function (it) { return D.items[it.type]; });
      level.notes = cleanNotes(level.notes);
      return level;
    });
  }
  // Arranca con el plano guardado o vacío. Con #ejemplo en la dirección carga la casa de muestra y con
  // #importado el plano que se subió en la portada (el plano guardado, si había, queda a un "Deshacer" de distancia).
  function start() {
    const saved = load();
    let fresh = null;
    if (location.hash === "#ejemplo") fresh = P.sample();
    else if (location.hash === "#importado") {
      try { fresh = normalize(JSON.parse(localStorage.getItem(HANDOFF))); localStorage.removeItem(HANDOFF); } catch (e) { /* sin almacenamiento */ }
    }
    if (!fresh) return saved || P.empty();
    if (saved && saved.walls.length) st.history.push(JSON.stringify(Object.assign({}, saved, { ref: undefined })));
    try { window.history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    return fresh;
  }
  // La imagen de referencia pesa mucho: no entra en el historial y, si no cabe, tampoco en el guardado.
  const snapshot = () => JSON.stringify(Object.assign({}, st.plan, { ref: undefined }));
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(st.plan)); }
    catch (e) { try { localStorage.setItem(STORE, snapshot()); } catch (err) { /* sin almacenamiento */ } }
  }
  function pushHistory() { st.history.push(snapshot()); if (st.history.length > 60) st.history.shift(); st.future.length = 0; }
  function restore(from, to) {
    if (!from.length) return;
    const ref = st.plan.ref;
    to.push(snapshot());
    st.plan = JSON.parse(from.pop());
    st.plan.ref = ref;
    st.chain = null;
    commit(null);
    syncSettings();
  }

  // Plantas: los campos de P.LEVEL_FIELDS son siempre los de la planta activa; las demás esperan en plan.levels.
  function stashLevel() {
    if (!st.plan.levels || !st.plan.levels.length) st.plan.levels = [{ name: P.LEVEL_NAMES[0] }];
    st.plan.level = Math.min(st.plan.level || 0, st.plan.levels.length - 1);
    const level = { name: st.plan.levels[st.plan.level].name };
    P.LEVEL_FIELDS.forEach(function (f) { level[f] = st.plan[f] || []; });
    st.plan.levels[st.plan.level] = level;
  }
  function loadLevel(index) {
    const level = st.plan.levels[index];
    st.plan.level = index;
    P.LEVEL_FIELDS.forEach(function (f) { st.plan[f] = level[f] || []; });
  }
  function showLevel(index) {
    loadLevel(index);
    st.chain = null;
    fit();
    commit(null);
    syncSettings();
    setTool("select");
  }
  /* Opciones de diseño (variantes): igual que las plantas, la opción activa vive en los campos de trabajo del plano
     y las demás esperan en plan.variants. Comparten los ajustes de obra, las capas y los datos de carátula. */
  const variantCount = () => Math.max(1, (st.plan.variants || []).length);
  function stashVariant() {
    stashLevel();
    if (!st.plan.variants || !st.plan.variants.length) st.plan.variants = [{}];
    st.plan.variant = Math.min(st.plan.variant || 0, st.plan.variants.length - 1);
    st.plan.variants[st.plan.variant] = { levels: JSON.parse(JSON.stringify(st.plan.levels)), level: st.plan.level, section: st.plan.section || null };
  }
  function showVariant(index) {
    const v = st.plan.variants[index];
    st.plan.variant = index;
    st.plan.levels = JSON.parse(JSON.stringify(v.levels));
    st.plan.section = v.section || null;
    showLevel(Math.min(v.level || 0, st.plan.levels.length - 1));
  }
  const wallsSel = (ids) => ids.length > 1 ? { type: "walls", ids: ids } : ids.length ? { type: "wall", id: ids[0] } : null;
  function selected() {
    if (!st.sel) return null;
    if (st.sel.type === "walls") { // varios muros: quedan los que sigan existiendo
      st.sel = wallsSel(st.sel.ids.filter((id) => wallById(id)));
      if (!st.sel || st.sel.type === "wall") return st.sel ? wallById(st.sel.id) : null;
      return st.sel.ids.map(wallById);
    }
    return st.sel.type === "wall" ? wallById(st.sel.id) : st.sel.type === "opening" ? openingById(st.sel.id) : st.sel.type === "item" ? itemById(st.sel.id) : st.sel.type === "surface" ? surfaceById(st.sel.id) :
      st.sel.type === "note" ? noteById(st.sel.id) : roomAt(st.sel);
  }

  // Guarda, cambia la selección y redibuja todo.
  function commit(selection) {
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

  // Operaciones que usan los demás módulos del diseñador (src/planner/context.ts).
  Object.assign(ops, { root: root, hint: hint, title: title, pushHistory: pushHistory, commit: commit, save: save, render: render, setTool: setTool,
    syncSettings: syncSettings, normalize: normalize, snapshot: snapshot, addWalls: addWalls });

  // ---------- Geometría de pantalla: src/planner/viewport.ts ----------
  function zoomAt(p, factor) {
    const w = Math.max(150, Math.min(20000, st.view.w * factor)), s = w / st.view.w;
    st.view.x = p.x - (p.x - st.view.x) * s;
    st.view.y = p.y - (p.y - st.view.y) * s;
    st.view.w = w;
    render();
  }

  // ---------- Dibujo: src/planner/render.ts ----------

  // ---------- Tipos de muro ----------
  function defaultType(cls) {
    const types = P.wallTypesOf(st.plan), lib = P.wallTypesOf({});
    return types[(st.plan.settings || {})[cls]] || types[P.DEFAULTS[cls]] || lib[P.DEFAULTS[cls]];
  }
  const thickText = (t) => E.fmt(P.typeThick(t, "ext"), 1) + " cm como exterior · " + E.fmt(P.typeThick(t, "int"), 1) + " cm como interior";
  // Todos los muros del plano: plantas y opciones de diseño, con la planta activa tomada de los campos de trabajo.
  function everyWall() {
    const list = st.plan.walls.slice();
    (st.plan.levels || []).forEach(function (lv, i) { if (i !== (st.plan.level || 0)) list.push.apply(list, lv.walls || []); });
    (st.plan.variants || []).forEach(function (v, i) {
      if (i === (st.plan.variant || 0)) return;
      (v.levels || []).forEach(function (lv) { list.push.apply(list, lv.walls || []); });
    });
    return list;
  }
  function ensureTypes() { if (!Array.isArray(st.plan.wallTypes) || !st.plan.wallTypes.length) st.plan.wallTypes = P.wallTypeList(st.plan); }

  const LAYER_COLORS = { azotado: "#4f9bd9", grueso: "#8d8d8d", fino: "#d9d9d9" };
  // Corte del muro, capa por capa y a escala: de la cara exterior (izquierda) a la interior.
  function layerSVG(t) {
    const parts = [];
    const face = (f, outer) => {
      const list = [["azotado", f.azotado], ["grueso", f.grueso], ["fino", f.fino ? D.finishes.fineThick : 0]].filter((l) => l[1] > 0);
      return outer ? list.slice().reverse() : list;
    };
    face(t.ext, true).forEach((l) => parts.push({ cls: l[0], w: l[1] }));
    parts.push({ cls: "core", w: D.bricks[t.brick].e });
    face(t.int, false).forEach((l) => parts.push({ cls: l[0], w: l[1] }));
    const total = parts.reduce((s, p) => s + p.w, 0), W = 260, k = W / total;
    let x = 0;
    const rects = parts.map(function (p) {
      const r = '<rect x="' + (x * k).toFixed(1) + '" y="0" width="' + Math.max(1, p.w * k).toFixed(1) + '" height="34" fill="' +
        (p.cls === "core" ? "url(#brick-hatch)" : LAYER_COLORS[p.cls]) + '"/>';
      x += p.w;
      return r;
    }).join("");
    return '<svg class="type-svg" viewBox="0 0 260 46" role="img" aria-label="Capas del muro, de afuera hacia adentro">' +
      '<defs><pattern id="brick-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#5a3b2e"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c2785a" stroke-width="2"/></pattern></defs>' +
      rects + '<text x="0" y="45">Afuera</text><text x="260" y="45" text-anchor="end">Ambiente</text></svg>';
  }
  function renderTypes() {
    // Los tipos de muro por defecto de los Ajustes de obra se eligen entre los tipos de este plano.
    ["ext", "int"].forEach(function (cls) {
      const el = settings.elements[cls];
      if (!el) return;
      el.innerHTML = P.wallTypeList(st.plan).map((t) => '<option value="' + escHTML(t.id) + '">' + escHTML(t.name) + "</option>").join("");
      el.value = defaultType(cls).id;
    });
    const box = $("[data-types]", root);
    if (!box) return;
    const list = P.wallTypeList(st.plan);
    if (!list.some((t) => t.id === st.editType)) st.editType = list[0].id;
    const t = list.find((x) => x.id === st.editType), used = everyWall().filter((w) => w.type === t.id).length;
    const isDefault = ["ext", "int"].filter((c) => defaultType(c).id === t.id);
    const num = (face, layer, labelText) => "<label>" + labelText + ' (cm) <input type="text" inputmode="decimal" autocomplete="off" data-layer-cm="' + face + "." + layer +
      '" value="' + E.fmt(t[face][layer], 1) + '"></label>';
    const fine = (face) => '<label class="type-check"><input type="checkbox" data-layer-fino="' + face + '"' + (t[face].fino ? " checked" : "") + "> Revoque fino</label>";
    const faceBox = (face, title) => '<fieldset class="type-face"><legend>' + title + "</legend>" + num(face, "azotado", "Azotado") +
      num(face, "grueso", "Grueso") + fine(face) + "</fieldset>";
    box.innerHTML =
      '<div class="type-pick"><select data-type-pick aria-label="Tipo de muro">' + list.map((x) => '<option value="' + escHTML(x.id) + '"' + (x.id === t.id ? " selected" : "") + ">" +
        escHTML(x.name) + "</option>").join("") + "</select>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="type-new">Duplicar</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="type-delete"' + (isDefault.length ? " disabled" : "") + ">Borrar</button></div>" +
      layerSVG(t) +
      '<p class="type-sum">' + thickText(t) + "<br>" + (used ? "Lo usan " + used + (used === 1 ? " muro" : " muros") : "Ningún muro lo usa directamente") +
      (isDefault.length ? " · es el tipo por defecto de los muros " + isDefault.map((c) => c === "ext" ? "exteriores" : "interiores").join(" e ") : "") + ".</p>" +
      '<div class="type-form"><label>Nombre <input type="text" maxlength="60" autocomplete="off" data-type-name value="' + escHTML(t.name) + '"></label>' +
      '<label>Ladrillo <select data-type-brick>' + Object.keys(D.bricks).map((key) => '<option value="' + key + '"' + (key === t.brick ? " selected" : "") + ">" +
        escHTML(D.bricks[key].label) + "</option>").join("") + "</select></label>" +
      faceBox("ext", "Cara exterior") + faceBox("int", "Cara hacia un ambiente") + "</div>" +
      '<p class="ws-tip">Los cambios valen para todos los muros de este tipo, en todas las plantas y opciones. La cara exterior se usa del lado de afuera de los muros exteriores.</p>';
  }
  // Cambia una propiedad del tipo abierto y vuelve a calcular todo.
  function editTypeWith(fn) {
    pushHistory();
    ensureTypes();
    const t = st.plan.wallTypes.find((x) => x.id === st.editType);
    if (!t) return;
    fn(t);
    Object.assign(t, P.cleanType(t));
    save();
    render();
    renderTypes();
  }
  function typeInput(e) {
    const el = e.target;
    if (el.matches("[data-type-pick]")) { st.editType = el.value; renderTypes(); return; }
    if (e.type !== "change") return; // nombre y espesores se toman al confirmar, para no rehacer el panel mientras se tipea
    if (el.matches("[data-type-name]")) {
      const name = el.value.trim();
      if (!name) return;
      editTypeWith((t) => { t.name = name; });
      return;
    }
    if (el.matches("[data-type-brick]")) { editTypeWith((t) => { t.brick = el.value; }); return; }
    if (el.matches("[data-layer-fino]")) { const face = el.getAttribute("data-layer-fino"); editTypeWith((t) => { t[face].fino = el.checked; }); return; }
    if (el.matches("[data-layer-cm]")) {
      const parts = el.getAttribute("data-layer-cm").split("."), v = el.value.trim() === "" ? 0 : E.parseNum(el.value);
      if (!(v >= 0 && v <= 5)) { el.setAttribute("aria-invalid", "true"); return; }
      editTypeWith((t) => { t[parts[0]][parts[1]] = v; });
    }
  }

  const PHASE_OPTIONS = [["", "A construir"], ["existente", "Existente"], ["demoler", "Existente a demoler"]];
  const phaseSelect = (current, mixed) => '<label>Fase <select name="phase">' + (mixed ? '<option value="mixed" selected disabled>Varias</option>' : "") +
    PHASE_OPTIONS.map((o) => '<option value="' + o[0] + '"' + (!mixed && (current || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";

  function renderInspector() {
    const item = selected();
    const field = (name, labelText, value) => "<label>" + labelText + ' <input name="' + name + '" type="text" inputmode="decimal" autocomplete="off" value="' +
      E.fmt(value, 2) + '"> m</label>';
    const button = (action, labelText) => '<button type="button" class="btn btn-ghost" data-action="' + action + '">' + labelText + "</button>";
    const typeOptions = (current) => P.wallTypeList(st.plan).map((t) => '<option value="' + escHTML(t.id) + '"' + (t.id === current ? " selected" : "") + ">" +
      escHTML(t.name) + "</option>").join("");
    const swatches = (current, first) => '<span class="swatches" role="group" aria-label="Color">' + [""].concat(P.PALETTE).map((c) => '<button type="button" class="swatch" data-swatch="' + c +
      '" aria-pressed="' + ((current || "") === c) + '" title="' + (c ? COLOR_NAMES[c] : first) + '" aria-label="' + (c ? COLOR_NAMES[c] : first) + '"' + (c ? ' style="--sw:' + c + '"' : "") + "></button>").join("") + "</span>";
    const weight = (name, current, isText) => "<label>" + (isText ? "Tamaño" : "Grosor") + ' <select name="' + name + '">' + [["s", isText ? "Chico" : "Fino"], ["m", "Medio"], ["l", isText ? "Grande" : "Grueso"]]
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
    if (st.sel.type === "note") {
      inspector.innerHTML = "<strong>" + escHTML(NOTES[item.kind]) + "</strong>" +
        (item.kind === "text" ? '<label>Texto <input name="text" type="text" autocomplete="off" maxlength="120" value="' + escHTML(item.text) + '"></label>' : "") +
        swatches(item.color, "Tinta") + weight("w", item.w, item.kind === "text") + button("duplicate", "Duplicar") + button("delete", "Borrar");
      return;
    }
    if (st.sel.type === "walls") {
      const types = Object.keys(item.reduce((set, w) => { set[w.type || ""] = true; return set; }, {})), mixed = types.length > 1;
      inspector.innerHTML = "<strong>" + item.length + " muros</strong>" + '<label>Tipo <select name="type">' + (mixed ? '<option value="mixed" selected disabled>Varios</option>' : "") +
        '<option value=""' + (!mixed && types[0] === "" ? " selected" : "") + ">Por defecto</option>" + typeOptions(mixed ? null : types[0]) + "</select></label>" +
        phaseSelect(item[0].phase, item.some((w) => (w.phase || "") !== (item[0].phase || ""))) + "<span>" +
        E.fmt(item.reduce((sum, w) => sum + dist(w.a, w.b), 0) / 100, 2) + " m en total</span>" + button("delete", "Borrar");
      return;
    }
    if (st.sel.type === "wall") {
      // Clase (exterior o interior) detectada sola, y tipo que le tocaría por defecto.
      const edge = st.model.edges.find((e) => e.wall === item.id) || { cls: "ext" }, outside = edge.cls !== "int";
      const types = P.wallTypesOf(st.plan), usual = defaultType(edge.cls), t = types[item.type] || usual;
      inspector.innerHTML = "<strong>" + (outside ? "Muro exterior" : "Muro interior") + "</strong>" + field("length", "Largo", dist(item.a, item.b) / 100) +
        '<label>Tipo <select name="type"><option value="">Por defecto: ' + escHTML(usual.name) + "</option>" + typeOptions(item.type) + "</select></label>" +
        "<span>" + E.fmt(P.typeThick(t, edge.cls), 1) + " cm terminado · ladrillo de " + E.fmt(D.bricks[t.brick].e, 1) + " cm</span>" + phaseSelect(item.phase) +
        '<button type="button" class="btn btn-ghost" data-action="type-edit" data-type="' + escHTML(t.id) + '">Editar el tipo</button>' +
        button("split", "Dividir en dos") + button("delete", "Borrar");
    } else if (st.sel.type === "opening") {
      const def = P.typeOf(item), host = wallById(item.wall), hostPhase = host ? P.wallPhase(host) : "nueva";
      // En un muro existente la abertura puede quedar, retirarse o ser un vano nuevo; en un muro nuevo siempre es nueva.
      const phaseBox = hostPhase === "existente" ? '<label>Fase <select name="phase">' + [["", "Existente, como su muro"], ["nueva", "Vano nuevo (a construir)"], ["demoler", "A retirar"]]
        .map((o) => '<option value="' + o[0] + '"' + ((item.phase === "existente" ? "" : item.phase || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>"
        : hostPhase === "demoler" ? "<span>Se retira con su muro</span>" : "";
      inspector.innerHTML = "<strong>" + escHTML(def.label) + "</strong>" + field("w", "Ancho", item.w / 100) + field("h", "Alto", item.h / 100) + phaseBox +
        (/swing|double|garage/.test(def.symbol) ? button("flip-side", "Cambiar lado") : "") +
        (def.symbol === "swing" ? button("flip-hinge", "Cambiar bisagra") : "") + button("duplicate", "Duplicar") + button("delete", "Borrar");
    } else if (st.sel.type === "surface") {
      inspector.innerHTML = '<strong>Exterior</strong><label>Tipo <select name="type">' + Object.keys(D.surfaces).map((key) => '<option value="' + key + '"' + (key === item.type ? " selected" : "") + ">" +
        escHTML(D.surfaces[key].label) + "</option>").join("") + "</select></label>" + field("w", "Ancho", item.w / 100) + field("h", "Largo", item.h / 100) + button("delete", "Borrar");
    } else if (st.sel.type === "item") {
      const own = D.items[item.type].custom;
      inspector.innerHTML = "<strong>" + escHTML(D.items[item.type].label) + "</strong>" +
        (own ? '<label>Nombre <input name="name" type="text" autocomplete="off" maxlength="40" value="' + escHTML(item.name || "") + '"></label>' : "") +
        field("w", "Ancho", item.w / 100) + field("d", "Fondo", item.d / 100) +
        (own ? field("tall", "Alto", (item.tall || D.items[item.type].tall) / 100) + '<label>Forma <select name="shape"><option value="">Rectangular</option><option value="round"' +
          (item.shape === "round" ? " selected" : "") + ">Redonda</option></select></label>" : "") +
        '<label>Giro <input name="r" type="text" inputmode="numeric" autocomplete="off" value="' + (item.r || 0) + '"> °</label>' +
        button("rotate", "Girar 90°") + button("duplicate", "Duplicar") + button("shelf-add", "Guardar en Mis muebles") + (hasWires(item.id) ? button("unwire", "Quitar cables") : "") + button("delete", "Borrar");
    } else {
      inspector.innerHTML = "<strong>Ambiente</strong><label>Nombre " + '<input name="name" type="text" list="room-types" autocomplete="off" value="' +
        escHTML(item.name) + '"></label><datalist id="room-types">' + D.roomTypes.map((n) => '<option value="' + escHTML(n) + '">').join("") +
        '</datalist><label>Piso <select name="floor">' + Object.keys(D.floors).map((key) => '<option value="' + key + '"' + (key === item.floor ? " selected" : "") + ">" +
          escHTML(D.floors[key].label) + "</option>").join("") + "</select></label>" + swatches(item.color, "Sin color") + "<span>" + E.fmt(item.area, 1) + " m²</span>";
    }
  }

  function setTool(name, type, own) {
    st.tool = name; st.pick = type || null; st.stamp = own || null; st.chain = null; st.hover = null; st.ghost = null; st.typed = ""; st.measure = null; st.arcEnd = null; st.wireFrom = null;
    if (name !== "select" && name !== "pan") { st.sel = null; st.multi = false; } // al empezar a dibujar se suelta la selección
    $$("[data-tool]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === name)));
    $('[data-action="multi"]', root).setAttribute("aria-pressed", String(st.multi));
    syncPicks();
    hint.textContent = HINTS[name === "select" && st.multi ? "multi" : name];
    svg.setAttribute("data-tool", NOTES[name] ? "note" : name);
    if (NOTES[name] && !layers().notes) { st.plan.layers = Object.assign(layers(), { notes: true }); save(); syncSettings(); } // no se anota sobre una capa oculta
    render();
    renderInspector();
  }

  // ---------- Acciones ----------
  function removeSelection() {
    if (!st.sel || st.sel.type === "room") return;
    pushHistory();
    if (st.sel.type === "wall" || st.sel.type === "walls") { const gone = pickedWalls(); st.plan.walls = st.plan.walls.filter((w) => gone.indexOf(w.id) < 0); }
    else if (st.sel.type === "item") st.plan.items = st.plan.items.filter((it) => it.id !== st.sel.id);
    else if (st.sel.type === "surface") st.plan.surfaces = st.plan.surfaces.filter((sf) => sf.id !== st.sel.id);
    else if (st.sel.type === "note") st.plan.notes = st.plan.notes.filter((nt) => nt.id !== st.sel.id);
    else st.plan.openings = st.plan.openings.filter((o) => o.id !== st.sel.id);
    commit(null);
  }
  // No agrega una pared que ya está dibujada encima de otra (pasa al dibujar ambientes pegados).
  function addWalls(list) {
    const onWall = (w, p) => { const h = project(w, p); return h.d < 0.5 && h.raw > -1e-6 && h.raw < 1 + 1e-6; };
    const fresh = list.filter((s) => dist(s[0], s[1]) >= GRID && !st.plan.walls.some((w) => onWall(w, s[0]) && onWall(w, s[1])));
    if (!fresh.length) return;
    pushHistory();
    fresh.forEach(function (s) { st.plan.walls.push(Object.assign({ id: nextId(), a: copy(s[0]), b: copy(s[1]) }, st.nextType ? { type: st.nextType } : {}, st.nextPhase ? { phase: st.nextPhase } : {})); });
  }
  function addWallPoint(p) {
    st.typed = "";
    if (!st.chain) { st.chain = p; render(); return; }
    if (dist(st.chain, p) < GRID) return;
    const closes = st.plan.walls.some((w) => same(w.a, p) || same(w.b, p));
    addWalls([[st.chain, p]]);
    st.chain = closes ? null : p; // al llegar a otra pared la cadena se corta sola
    commit(null);
  }
  function addRoomPoint(p) {
    if (!st.chain) { st.chain = p; render(); return; }
    if (Math.abs(p.x - st.chain.x) < GRID || Math.abs(p.y - st.chain.y) < GRID) return;
    const a = st.chain, b = { x: p.x, y: a.y }, c = p, d = { x: a.x, y: p.y };
    addWalls([[a, b], [b, c], [c, d], [d, a]]);
    st.chain = null;
    commit(null);
  }
  function addOpening(hit, type) {
    pushHistory();
    const o = P.opening(nextId(), hit.wall.id, hit.t, type);
    o.t = clampT(o, o.t);
    st.plan.openings.push(o);
    st.ghost = null;
    commit({ type: "opening", id: o.id });
  }
  function changeOpening(change) {
    const o = openingById(st.sel.id);
    pushHistory();
    change(o);
    commit(st.sel);
  }
  const center = () => ({ x: st.view.x + st.view.w / 2, y: st.view.y + st.view.h / 2 });
  // Nombre, piso o color de un ambiente: se guardan en una etiqueta ubicada dentro de él.
  function tagRoom(field, value) {
    const room = roomAt(st.sel), old = (st.plan.labels || []).find((l) => P.inside(room.points, l)) || {};
    const tag = { x: st.sel.x, y: st.sel.y, name: old.name || "", floor: old.floor, color: old.color };
    tag[field] = value;
    pushHistory();
    st.plan.labels = (st.plan.labels || []).filter((l) => !P.inside(room.points, l));
    st.plan.labels.push(tag);
    commit(st.sel);
  }
  // Un toque en la paleta: pinta la anotación o el ambiente elegido, o fija el color de las anotaciones que vienen.
  function setColor(color) {
    if (st.sel && st.sel.type === "note") { pushHistory(); noteById(st.sel.id).color = color; commit(st.sel); }
    else if (st.sel && st.sel.type === "room") tagRoom("color", color);
    else { st.nextNote.color = color; renderInspector(); }
  }

  // ---------- Opciones de diseño: selector y tabla que las compara ----------
  function renderVariants() {
    const list = st.plan.variants || [], many = list.length > 1, current = Math.min(st.plan.variant || 0, Math.max(0, list.length - 1));
    $$("[data-variant]", root).forEach(function (el) {
      el.hidden = !many;
      el.innerHTML = list.map((v, i) => '<option value="' + i + '"' + (i === current ? " selected" : "") + ">Opción " + OPTIONS[i] + "</option>").join("");
    });
    compareBox.hidden = !many;
    if (!many) return;
    const cols = list.map(function (v, i) {
      if (i === current) return st.model.main;
      const lv = v.levels[Math.min(v.level || 0, v.levels.length - 1)], other = Object.assign({}, st.plan, { levels: v.levels, level: v.level || 0, section: v.section });
      P.LEVEL_FIELDS.forEach(function (f) { other[f] = lv[f] || []; });
      return P.compute(other).main;
    });
    compareOut.innerHTML = '<table class="compare"><thead><tr><th></th>' + list.map((v, i) => "<th" + (i === current ? ' class="is-on"' : "") + ">" + OPTIONS[i] + "</th>").join("") + "</tr></thead><tbody>" +
      cols[0].map(function (m, r) {
        return "<tr><th>" + escHTML(m.label) + " <small>" + escHTML(m.unit) + "</small></th>" + cols.map((c, i) => "<td" + (i === current ? ' class="is-on"' : "") + ">" + escHTML(c[r].value) + "</td>").join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  // ---------- Modo presentación ----------
  function present(on) {
    st.presenting = on;
    root.classList.toggle("is-presenting", on);
    document.documentElement.classList.toggle("is-presenting", on);
    try {
      if (on && root.requestFullscreen) root.requestFullscreen().catch(function () { /* sin pantalla completa: igual ocupa toda la ventana */ });
      else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    } catch (e) { /* navegador sin pantalla completa */ }
    setTool(on ? "pan" : "select");
    setTimeout(function () { fit(); render(); }, 120); // el lienzo ya tomó su tamaño nuevo
  }
  document.addEventListener("fullscreenchange", function () { if (st.presenting && !document.fullscreenElement) present(false); });

  // ---------- Archivos: src/planner/io.ts ----------
  const fileName = (ext) => planFileName(st.plan.name, ext);
  const actions = {
    undo: function () { restore(st.history, st.future); },
    redo: function () { restore(st.future, st.history); },
    delete: removeSelection,
    "flip-side": function () { changeOpening(function (o) { o.side = !o.side; }); },
    "flip-hinge": function () { changeOpening(function (o) { o.hinge = !o.hinge; }); },
    rotate: function () {
      pushHistory();
      const it = itemById(st.sel.id);
      it.r = ((it.r || 0) + 90) % 360;
      commit(st.sel);
    },
    snap: function () { st.plan.snap = st.plan.snap === false; save(); syncSettings(); },
    multi: function () { st.multi = !st.multi; setTool("select"); },
    // Parte el muro por la mitad, para poder darle a cada tramo un ladrillo distinto. Las aberturas quedan en su lugar.
    split: function () {
      const w = wallById(st.sel.id), len = dist(w.a, w.b), mid = { x: Math.round((w.a.x + w.b.x) / 2), y: Math.round((w.a.y + w.b.y) / 2) };
      if (len < 4 * GRID) return;
      pushHistory();
      const rest = Object.assign({}, w, { id: nextId(), a: copy(mid), b: copy(w.b) });
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
    unwire: function () { pushHistory(); st.plan.wires = st.plan.wires.filter((w) => w.a !== st.sel.id && w.b !== st.sel.id); commit(st.sel); },
    "section-clear": function () { pushHistory(); st.plan.section = null; commit(st.sel); },
    "level-add": function () {
      const count = (st.plan.levels || []).length || 1;
      if (count >= P.LEVEL_NAMES.length) { hint.textContent = "Se pueden cargar hasta " + P.LEVEL_NAMES.length + " plantas."; return; }
      pushHistory();
      stashLevel();
      // La planta nueva arranca con los muros exteriores de la última: lo habitual es apoyar muro sobre muro.
      const top = st.plan.levels[count - 1];
      const edges = P.compute(Object.assign({}, st.plan, { level: count - 1, walls: top.walls, openings: top.openings, items: top.items, labels: top.labels })).edges;
      const inner = {}, outer = {};
      edges.forEach(function (e) { (e.cls === "ext" ? outer : inner)[e.wall] = true; });
      st.plan.levels.push({
        name: P.LEVEL_NAMES[count], openings: [], items: [], labels: [],
        walls: top.walls.filter((w) => outer[w.id] && !inner[w.id]).map((w) => Object.assign({ id: nextId(), a: copy(w.a), b: copy(w.b) }, w.type ? { type: w.type } : {}))
      });
      showLevel(count);
    },
    "level-remove": function () {
      if (!st.plan.levels || st.plan.levels.length < 2) { hint.textContent = "El plano tiene una sola planta."; return; }
      pushHistory();
      stashLevel();
      st.plan.levels.splice(st.plan.level, 1);
      st.plan.levels.forEach(function (level, i) { level.name = P.LEVEL_NAMES[i]; });
      showLevel(Math.min(st.plan.level, st.plan.levels.length - 1));
    },
    "export-svg": function () { exportDrawing(false); },
    "export-png": function () { exportDrawing(true); },
    "export-dxf": exportDxf,
    "export-json": exportJson,
    "open-file": function () { $('[data-file="plan"]', root).click(); },
    "type-edit": function (el) { // del inspector del muro al panel de tipos, con su tipo abierto
      st.editType = el.getAttribute("data-type") || "";
      const box = $("[data-types-box]", root);
      box.open = true;
      renderTypes();
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const pick = $("[data-type-pick]", root);
      if (pick) pick.focus({ preventScroll: true });
    },
    "type-new": function () { // duplica el tipo abierto: así se arma uno nuevo sin empezar de cero
      pushHistory();
      ensureTypes();
      const from = st.plan.wallTypes.find((x) => x.id === st.editType) || st.plan.wallTypes[0];
      const copyType = JSON.parse(JSON.stringify(from));
      copyType.id = "t-" + nextId();
      copyType.name = ("Copia de " + from.name).slice(0, 60);
      st.plan.wallTypes.push(copyType);
      st.editType = copyType.id;
      save(); render(); renderTypes();
      const name = $("[data-type-name]", root);
      if (name) { name.focus(); name.select(); }
    },
    "type-delete": function () { // los muros que lo usaban vuelven al tipo por defecto de su clase
      ensureTypes();
      if (st.plan.wallTypes.length < 2 || ["ext", "int"].some((c) => defaultType(c).id === st.editType)) return;
      const used = everyWall().filter((w) => w.type === st.editType);
      if (used.length && !window.confirm("Lo usan " + used.length + (used.length === 1 ? " muro, que pasa" : " muros, que pasan") + " al tipo por defecto. ¿Borrar el tipo?")) return;
      pushHistory();
      used.forEach((w) => { delete w.type; });
      st.plan.wallTypes = st.plan.wallTypes.filter((x) => x.id !== st.editType);
      if (st.nextType === st.editType) st.nextType = "";
      st.editType = "";
      save(); render(); renderTypes(); renderInspector();
    },
    "ref-load": function () { $('[data-file="ref"]', root).click(); },
    "sketch-load": function () { $('[data-file="sketch"]', root).click(); },
    "sketch-cancel": cancelSketch,
    "sketch-apply": applySketch,
    "ref-clear": function () { st.plan.ref = null; save(); syncSettings(); render(); },
    "variant-add": function () {
      if (variantCount() >= OPTIONS.length) { hint.textContent = "Se pueden cargar hasta " + OPTIONS.length + " opciones."; return; }
      pushHistory();
      stashVariant();
      const from = st.plan.variant;
      st.plan.variants.push(JSON.parse(JSON.stringify(st.plan.variants[from])));
      showVariant(st.plan.variants.length - 1);
      hint.textContent = "Opción " + OPTIONS[st.plan.variant] + " creada como copia de la " + OPTIONS[from] + ". Lo que cambies acá no toca las otras; cambiá de opción con el selector de arriba.";
    },
    "variant-remove": function () {
      if (variantCount() < 2) { hint.textContent = "El plano tiene una sola opción."; return; }
      pushHistory();
      const gone = OPTIONS[st.plan.variant];
      st.plan.variants.splice(st.plan.variant, 1);
      showVariant(Math.min(st.plan.variant, st.plan.variants.length - 1));
      if (st.plan.variants.length === 1) { st.plan.variants = []; st.plan.variant = 0; commit(null); }
      hint.textContent = "Se eliminó la opción " + gone + ". Con Deshacer la recuperás.";
    },
    // Guarda el objeto elegido, con sus medidas, en la biblioteca personal.
    "shelf-add": function () {
      const it = itemById(st.sel.id), def = D.items[it.type];
      const entry = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), type: it.type, name: (def.custom && it.name) || def.label, w: it.w, d: it.d,
        tall: it.tall || undefined, shape: def.custom && it.shape === "round" ? "round" : undefined };
      const same = (o) => o.type === entry.type && o.name === entry.name && o.w === entry.w && o.d === entry.d && o.tall === entry.tall && o.shape === entry.shape;
      if (st.shelf.some(same)) { hint.textContent = "«" + entry.name + "» con esas medidas ya está en Mis muebles."; return; }
      if (st.shelf.length >= SHELF_MAX) { hint.textContent = "Mis muebles admite hasta " + SHELF_MAX + ". Quitá alguno con la × para guardar otro."; return; }
      st.shelf.push(entry);
      saveShelf();
      renderLibrary();
      const group = $('[data-items] [data-group="propios"]', root);
      if (group) group.open = true;
      hint.textContent = "«" + entry.name + "» quedó guardado en Equipamiento → Mis muebles, en este navegador. Lo podés usar en cualquier plano.";
    },
    present: function () { present(true); },
    "present-exit": function () { present(false); },
    duplicate: function () {
      if (st.sel.type === "note") {
        const twin = JSON.parse(JSON.stringify(noteById(st.sel.id)));
        twin.id = nextId();
        twin.pts.forEach(function (q) { q.x += 20; q.y += 20; });
        pushHistory();
        st.plan.notes.push(twin);
        commit({ type: "note", id: twin.id });
        return;
      }
      if (st.sel.type === "item") {
        const it = itemById(st.sel.id), copyOf = Object.assign({}, it, { id: nextId(), x: it.x + 20, y: it.y + 20 });
        pushHistory();
        st.plan.items.push(copyOf);
        commit({ type: "item", id: copyOf.id });
        return;
      }
      const o = openingById(st.sel.id), twin = Object.assign({}, o, { id: nextId() });
      pushHistory();
      twin.t = clampT(twin, o.t + (o.w + 20) / dist(wallById(o.wall).a, wallById(o.wall).b));
      st.plan.openings.push(twin);
      commit({ type: "opening", id: twin.id });
    },
    fit: function () { fit(); render(); },
    "zoom-in": function () { zoomAt(center(), 1 / 1.25); },
    "zoom-out": function () { zoomAt(center(), 1.25); },
    print: function () { window.print(); },
    // Planillas de carpinterías y locales: se leen del plano y lo que se edita en la tabla vuelve al plano.
    // Planillas de carpinterías y locales, y presupuesto de obra: src/planner/schedules.ts y budget.ts.
    schedules: function () { openSchedules(); },
    budget: function () { openBudget(); },
    docs: function () {
      if (!brand.docs) return;
      brand.docs.open({ plan: function () { return st.plan; }, save: function (doc) { st.plan.doc = doc; save(); }, download: download, fileName: fileName });
    },
    clear: function () { // vacía el plano entero: todas las plantas y el corte, no solo la planta a la vista
      pushHistory();
      P.LEVEL_FIELDS.forEach(function (f) { st.plan[f] = []; });
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

  // ---------- Boceto a plano: src/planner/sketch.ts ----------

  // ---------- Vista 3D ----------
  function showView(mode) {
    const on = mode === "3d";
    $$("[data-view]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === mode)));
    stage3d.hidden = !on;
    if (brand.view3d) brand.view3d.close();
    if (!on) { render(); return; }
    note3d.hidden = false;
    if (!st.plan.walls.length) { note3d.textContent = "Dibujá al menos una pared para verla en 3D."; return; }
    if (!brand.view3d) { note3d.textContent = "No se pudo cargar la vista 3D. Recargá la página."; return; }
    note3d.textContent = "Preparando la vista 3D…";
    brand.view3d.open(stage3d, st.plan, { roof: layers().roof }).then(function (info) {
      note3d.hidden = true;
      stage3d.setAttribute("data-meshes", info.meshes);
    }, function (e) {
      console.warn("[3d]", e);
      // Sin WebGL no hay nada que hacer; cualquier otra falla suele ser que no se pudo descargar el motor 3D.
      note3d.textContent = /WebGL/.test(e && e.message)
        ? "Este navegador no puede mostrar la vista 3D. El plano y el cómputo siguen funcionando."
        : "No se pudo cargar la vista 3D. Revisá la conexión, recargá la página y probá de nuevo. El plano y el cómputo siguen funcionando.";
    });
  }

  // ---------- Eventos ----------
  function touch() { if (!st.drag.dirty) { pushHistory(); st.drag.dirty = true; } }
  function startPan(e, p) { st.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y, p: p }; }

  svg.addEventListener("pointerdown", function (e) {
    if (e.button === 2) return;
    const p = toWorld(e);
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    if (e.button === 1 || st.tool === "pan" || st.spaceDown) { e.preventDefault(); startPan(e); return; }
    if (NOTES[st.tool]) {
      const fresh = { id: 0, kind: st.tool, color: st.nextNote.color, w: st.nextNote.w };
      if (st.tool !== "text") { st.drag = { type: "draw", sx: e.clientX, sy: e.clientY, note: Object.assign(fresh, { pts: st.tool === "pen" ? [pt1(p)] : [pt1(p), pt1(p)] }) }; return; }
      e.preventDefault(); // el foco tiene que quedar en el campo de texto, no volver al lienzo
      Object.assign(fresh, { id: nextId(), pts: [pt1(p)], text: "Nota" });
      pushHistory();
      st.plan.notes.push(fresh);
      setTool(st.presenting ? "pan" : "select");
      commit({ type: "note", id: fresh.id });
      const input = $('input[name="text"]', inspector);
      if (input) { input.focus(); input.select(); }
      return;
    }
    if (st.tool === "wall") { addWallPoint(snap(p, { from: st.chain })); return; }
    if (st.tool === "room") { addRoomPoint(snap(p)); return; }
    if (st.tool === "opening") { const hit = hitWall(p); if (hit) addOpening(hit, st.pick); return; }
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
        addWalls(pts.slice(1).map((point, i) => [pts[i], point]));
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
      const sf = { id: nextId(), x: Math.min(st.chain.x, q.x), y: Math.min(st.chain.y, q.y), w: Math.abs(q.x - st.chain.x), h: Math.abs(q.y - st.chain.y), type: "patio" };
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
      const linked = st.wireFrom && st.plan.wires.some((w) => (w.a === st.wireFrom && w.b === it.id) || (w.a === it.id && w.b === st.wireFrom));
      if (st.wireFrom && st.wireFrom !== it.id && !linked) { pushHistory(); st.plan.wires.push({ id: nextId(), a: st.wireFrom, b: it.id }); }
      st.wireFrom = it.id;
      commit(null);
      return;
    }

    const adding = e.shiftKey || st.multi; // "Elegir varios" hace lo mismo que Shift, también con el dedo
    const wall = !adding && st.sel && st.sel.type === "wall" && wallById(st.sel.id);
    const end = wall && [wall.a, wall.b].find((q) => dist(q, p) < 11 * px());
    if (end) { st.drag = { type: "node", cur: copy(end) }; return; }
    if (adding) { // sumar o quitar muros de la selección, o empezar un recuadro
      const more = hitWall(p);
      if (!more) { st.drag = { type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY, add: true }; return; }
      const ids = pickedWalls().slice(), at = ids.indexOf(more.wall.id);
      if (at >= 0) ids.splice(at, 1); else ids.push(more.wall.id);
      commit(wallsSel(ids));
      return;
    }
    // Las anotaciones van dibujadas encima de todo: son lo primero que se elige.
    const marked = !adding && st.sel && st.sel.type === "note" && noteById(st.sel.id);
    const corner = marked && marked.kind !== "pen" && marked.kind !== "text" ? marked.pts.findIndex((q) => dist(q, p) < 11 * px()) : -1;
    if (corner >= 0) { st.drag = { type: "notept", id: marked.id, i: corner }; return; }
    const note = !adding && hitNote(p);
    if (note) { commit({ type: "note", id: note.id }); st.drag = { type: "note", id: note.id, start: p, from: note.pts.map(copy) }; return; }
    const opening = hitOpening(p);
    if (opening) { commit({ type: "opening", id: opening.id }); st.drag = { type: "opening", id: opening.id }; return; }
    // Un clic sobre el cuerpo del muro elige el muro, aunque haya un mueble arrimado; el margen extra del mueble vale solo fuera del muro.
    const hit = hitWall(p), onWall = hit && hit.d <= (st.model.wallThick[hit.wall.id] || 12) / 2;
    const thing = !onWall && hitItem(p);
    if (thing) { commit({ type: "item", id: thing.id }); st.drag = { type: "item", id: thing.id, dx: p.x - thing.x, dy: p.y - thing.y }; return; }
    if (hit) {
      commit({ type: "wall", id: hit.wall.id });
      st.drag = { type: "wall", start: p, a: copy(hit.wall.a), b: copy(hit.wall.b), curA: copy(hit.wall.a), curB: copy(hit.wall.b) };
      return;
    }
    // Sobre el fondo: con mouse o lápiz, arrastrar abre un recuadro de selección; con el dedo, desplaza el plano.
    // En los dos casos, un toque sin arrastre elige el ambiente o la superficie que haya debajo.
    if (e.pointerType === "touch") startPan(e, p);
    else st.drag = { type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY };
  });

  svg.addEventListener("pointermove", function (e) {
    const p = toWorld(e);
    coords.textContent = "X " + E.fmt(p.x / 100, 2) + " · Y " + E.fmt(p.y / 100, 2);
    if (!st.drag) {
      if (st.tool === "wall") { st.hover = snap(p, { from: st.chain }); render(); }
      else if (st.tool === "room") { st.hover = snap(p); render(); }
      else if (st.tool === "opening") {
        const hit = hitWall(p);
        st.ghost = hit ? P.opening(0, hit.wall.id, hit.t, st.pick) : null;
        if (st.ghost) st.ghost.t = clampT(st.ghost, st.ghost.t);
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
    if (st.drag.type === "pan") {
      const k = px();
      if (Math.abs(e.clientX - st.drag.sx) + Math.abs(e.clientY - st.drag.sy) > 4) st.drag.moved = true;
      st.view.x = st.drag.vx - (e.clientX - st.drag.sx) * k;
      st.view.y = st.drag.vy - (e.clientY - st.drag.sy) * k;
      render();
    } else if (st.drag.type === "box") {
      if (Math.abs(e.clientX - st.drag.sx) + Math.abs(e.clientY - st.drag.sy) > 4) st.drag.moved = true;
      st.drag.cur = p;
      render();
    } else if (st.drag.type === "draw") {
      const nt = st.drag.note, q = pt1(p);
      if (Math.abs(e.clientX - st.drag.sx) + Math.abs(e.clientY - st.drag.sy) > 4) st.drag.moved = true;
      if (nt.kind !== "pen") nt.pts[1] = e.shiftKey ? straight(nt.pts[0], q, nt.kind) : q;
      else if (dist(nt.pts[nt.pts.length - 1], q) >= 2 * px()) nt.pts.push(q);
      render();
    } else if (st.drag.type === "note") {
      const nt = noteById(st.drag.id), dx = p.x - st.drag.start.x, dy = p.y - st.drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) < 2 * px() && !st.drag.dirty) return;
      touch();
      nt.pts = st.drag.from.map((q) => pt1({ x: q.x + dx, y: q.y + dy }));
      render();
    } else if (st.drag.type === "notept") {
      const nt = noteById(st.drag.id);
      touch();
      nt.pts[st.drag.i] = e.shiftKey ? straight(nt.pts[1 - st.drag.i], pt1(p), nt.kind) : pt1(p);
      render();
    } else if (st.drag.type === "node") {
      const to = snap(p, { skip: st.drag.cur });
      if (same(to, st.drag.cur)) return;
      touch();
      movePoints([{ from: st.drag.cur, to: to }]);
      st.drag.cur = to;
      render();
    } else if (st.drag.type === "wall") {
      const dx = round(p.x - st.drag.start.x), dy = round(p.y - st.drag.start.y);
      const a = { x: st.drag.a.x + dx, y: st.drag.a.y + dy }, b = { x: st.drag.b.x + dx, y: st.drag.b.y + dy };
      if (same(a, st.drag.curA)) return;
      touch();
      movePoints([{ from: st.drag.curA, to: a }, { from: st.drag.curB, to: b }]);
      st.drag.curA = a; st.drag.curB = b;
      render();
    } else if (st.drag.type === "item") {
      const it = itemById(st.drag.id), q = itemPoint({ x: p.x - st.drag.dx, y: p.y - st.drag.dy });
      if (q.x === it.x && q.y === it.y) return;
      touch();
      it.x = q.x; it.y = q.y;
      render();
    } else if (st.drag.type === "opening") {
      const o = openingById(st.drag.id);
      const t = clampT(o, project(wallById(o.wall), p).t);
      if (t === o.t) return;
      touch();
      o.t = t;
      render();
    }
  });

  function endDrag() {
    if (!st.drag) return;
    const done = st.drag;
    st.drag = null;
    // Lo que haya bajo un toque sin arrastre: un ambiente o una superficie exterior.
    const under = function (q) {
      const outside = !roomAt(q) && hitSurface(q);
      return roomAt(q) ? { type: "room", x: n1(q.x), y: n1(q.y) } : outside ? { type: "surface", id: outside.id } : null;
    };
    if (done.type === "draw") {
      const nt = done.note;
      if (nt.kind === "pen") nt.pts = simplify(nt.pts, 1.2 * px());
      if (!done.moved || nt.pts.length < 2 || dist(nt.pts[0], nt.pts[1]) < 1 && nt.pts.length === 2) { hint.textContent = "Mantené apretado y arrastrá para dibujar."; render(); return; }
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
      const inside = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
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
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", function () { if (!st.drag && (st.hover || st.ghost)) { st.hover = null; st.ghost = null; render(); } });
  svg.addEventListener("dblclick", function () { if (st.chain) { st.chain = null; render(); } });
  svg.addEventListener("contextmenu", function (e) { if (st.chain) { e.preventDefault(); st.chain = null; render(); } });
  svg.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(toWorld(e), e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  root.addEventListener("click", function (e) {
    const t = e.target.closest("[data-tool]"), a = e.target.closest("[data-action]"), item = e.target.closest("[data-pick]"), thing = e.target.closest("[data-pick-item]");
    const gone = e.target.closest("[data-shelf-remove]"), mine = e.target.closest("[data-pick-shelf]");
    if (gone) { // quitar un mueble de la biblioteca personal; los que ya están en el plano no cambian
      const id = gone.getAttribute("data-shelf-remove");
      st.shelf = st.shelf.filter((o) => o.id !== id);
      saveShelf();
      if (st.stamp && st.stamp.id === id) setTool("select");
      renderLibrary();
      return;
    }
    if (mine) { const own = st.shelf.find((o) => o.id === mine.getAttribute("data-pick-shelf")); if (own) setTool("item", own.type, own); return; }
    const tpl = e.target.closest("[data-view-tpl]");
    if (tpl) { applyViewTemplate(tpl.getAttribute("data-view-tpl")); return; }
    const swatch = e.target.closest("[data-swatch]");
    if (swatch) { setColor(swatch.getAttribute("data-swatch")); return; }
    if (e.target.closest("[data-view]")) { showView(e.target.closest("[data-view]").getAttribute("data-view")); return; }
    if (t) setTool(t.getAttribute("data-tool"));
    else if (item) setTool("opening", item.getAttribute("data-pick"));
    else if (thing) setTool("item", thing.getAttribute("data-pick-item"));
    else if (a && actions[a.getAttribute("data-action")]) {
      actions[a.getAttribute("data-action")](a);
      if (a.closest(".ws-menu")) a.closest(".ws-menu").removeAttribute("open");
    }
    else if (e.target.closest("[data-copy]")) {
      const button = e.target.closest("[data-copy]");
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(st.text) : Promise.reject()).then(
        function () { button.textContent = "✓ Copiado"; }, function () { button.textContent = "No se pudo copiar"; });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === "Space") { // mientras esté apretada, arrastrar desplaza el plano
      e.preventDefault();
      st.spaceDown = true;
      svg.setAttribute("data-pan", "");
      return;
    }
    const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (st.tool === "wall" && st.chain && !ctrl) { // largo escrito a mano
      if (/^[0-9.,]$/.test(e.key)) { st.typed += e.key; if (!st.hover) st.hover = { x: st.chain.x + 100, y: st.chain.y }; render(); return; }
      if (e.key === "Backspace" && st.typed) { e.preventDefault(); st.typed = st.typed.slice(0, -1); render(); return; }
      if (e.key === "Enter" && st.typed) {
        const len = E.parseNum(st.typed) * 100, d = st.hover && dist(st.chain, st.hover);
        if (len >= GRID && d) addWallPoint({ x: Math.round(st.chain.x + (st.hover.x - st.chain.x) / d * len), y: Math.round(st.chain.y + (st.hover.y - st.chain.y) / d * len) });
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
    else if (ctrl && key === "z") { e.preventDefault(); actions[e.shiftKey ? "redo" : "undo"](); }
    else if (ctrl && key === "y") { e.preventDefault(); actions.redo(); }
    else if (!ctrl && !e.altKey && KEYS[key]) setTool(KEYS[key][0], KEYS[key][1]);
  });

  const releaseSpace = function () { st.spaceDown = false; svg.removeAttribute("data-pan"); };
  document.addEventListener("keyup", function (e) { if (e.code === "Space") releaseSpace(); });
  window.addEventListener("blur", releaseSpace);

  inspector.addEventListener("change", function (e) {
    // Sin nada seleccionado, el único campo posible es el ladrillo de los muros nuevos.
    if (e.target.name === "nextType") { st.nextType = e.target.value; renderInspector(); return; }
    if (e.target.name === "nextPhase") { st.nextPhase = e.target.value; renderInspector(); return; }
    if (e.target.name === "phase") {
      pushHistory();
      const v = e.target.value;
      if (st.sel.type === "opening") {
        const o = selected();
        if (v) o.phase = v; else delete o.phase;
      } else {
        pickedWalls().map(wallById).forEach(function (w) {
          // Un muro que pasa a existente conserva el tipo que tiene hoy, aunque después cambie la planta a su alrededor.
          if (v && !w.type) { const edge = st.model.edges.find((x) => x.wall === w.id); if (edge) w.type = edge.wt; }
          if (v) w.phase = v; else delete w.phase;
        });
      }
      commit(st.sel);
      return;
    }
    if (e.target.name === "nextW") { st.nextNote.w = e.target.value; return; }
    if (!st.sel) return;
    if (st.sel.type === "room") { tagRoom(e.target.name, e.target.value.trim()); return; }
    if (st.sel.type === "note") {
      pushHistory();
      noteById(st.sel.id)[e.target.name] = e.target.name === "text" ? e.target.value.trim() || "Nota" : e.target.value;
      commit(st.sel);
      return;
    }
    if (st.sel.type === "surface") {
      const sf = surfaceById(st.sel.id), v = Math.round(E.parseNum(e.target.value) * 100);
      if (e.target.name !== "type" && !(v >= GRID)) { renderInspector(); return; }
      pushHistory();
      sf[e.target.name] = e.target.name === "type" ? e.target.value : v;
      commit(st.sel);
      return;
    }
    if (st.sel.type === "item" && (e.target.name === "name" || e.target.name === "shape")) { // solo en muebles a medida
      pushHistory();
      itemById(st.sel.id)[e.target.name] = e.target.value.trim().slice(0, 40);
      commit(st.sel);
      return;
    }
    if (st.sel.type === "item") {
      const it = itemById(st.sel.id), v = E.parseNum(e.target.value);
      if (e.target.name === "r" ? !isFinite(v) : !(v * 100 >= 5)) { renderInspector(); return; }
      pushHistory();
      if (e.target.name === "r") it.r = ((Math.round(v) % 360) + 360) % 360;
      else it[e.target.name] = Math.round(v * 100);
      commit(st.sel);
      return;
    }
    if (e.target.name === "type" && (st.sel.type === "wall" || st.sel.type === "walls")) { // ladrillo propio de cada muro elegido; vacío = el tipo por defecto
      pushHistory();
      pickedWalls().map(wallById).forEach(function (w) { if (e.target.value) w.type = e.target.value; else delete w.type; });
      commit(st.sel);
      return;
    }
    const value = E.parseNum(e.target.value) * 100;
    if (!(value >= GRID)) { renderInspector(); return; }
    pushHistory();
    if (st.sel.type === "wall") {
      const w = wallById(st.sel.id), len = dist(w.a, w.b);
      movePoints([{ from: w.b, to: { x: Math.round(w.a.x + (w.b.x - w.a.x) / len * value), y: Math.round(w.a.y + (w.b.y - w.a.y) / len * value) } }]);
    } else {
      const o = openingById(st.sel.id);
      o[e.target.name] = Math.round(value);
      o.t = clampT(o, o.t);
    }
    commit(st.sel);
  });

  // Cada ajuste numérico: [factor a cm, mínimo, máximo] en la unidad del formulario.
  const LIMITS = { height: [100, 2, 6], slab: [1, 0, 50], screed: [1, 0, 10], coats: [1, 1, 5] };
  function syncSettings() {
    const s = Object.assign({}, P.DEFAULTS, st.plan.settings), show = layers();
    ["ext", "int"].forEach(function (cls) { s[cls] = defaultType(cls).id; });
    renderTypes();
    $$("input, select", settings).forEach(function (el) {
      if (el.type === "checkbox") el.checked = !!s[el.name];
      else if (LIMITS[el.name]) el.value = E.fmt(s[el.name] / LIMITS[el.name][0], 2);
      else el.value = s[el.name];
    });
    $$("[data-layer]", root).forEach(function (el) { el.checked = show[el.getAttribute("data-layer")]; });
    if (phaseView) phaseView.value = st.plan.phaseView || "obra";
    syncTemplates();
    title.value = st.plan.name || UNTITLED;
    $("[data-level]", root).innerHTML = P.levelsOf(st.plan).map((level, i) => '<option value="' + i + '"' + (i === (st.plan.level || 0) ? " selected" : "") + ">" +
      escHTML(level.name) + "</option>").join("");
    $('[data-action="snap"]', root).setAttribute("aria-pressed", String(st.plan.snap !== false));
    if (st.model) renderVariants();
    refBox.hidden = !(st.plan.ref && st.plan.ref.src);
    if (st.plan.ref) {
      $('[data-ref="w"]', root).value = E.fmt(st.plan.ref.w / 100, 2);
      $('[data-ref="opacity"]', root).value = st.plan.ref.opacity;
    }
  }
  function readSettings() {
    const s = Object.assign({}, P.DEFAULTS, st.plan.settings);
    $$("input, select", settings).forEach(function (el) {
      if (el.type === "checkbox") { s[el.name] = el.checked; return; }
      if (!LIMITS[el.name]) { s[el.name] = el.value; return; }
      const v = E.parseNum(el.value), lim = LIMITS[el.name], ok = v >= lim[1] && v <= lim[2];
      el.setAttribute("aria-invalid", String(!ok));
      if (ok) s[el.name] = v * lim[0];
    });
    st.plan.settings = s;
    save();
    render();
    renderVariants();
  }
  settings.addEventListener("input", readSettings);
  settings.addEventListener("change", readSettings);
  settings.addEventListener("submit", function (e) { e.preventDefault(); });
  if (phaseView) phaseView.addEventListener("change", function () { st.plan.phaseView = phaseView.value; delete st.plan.viewTemplate; save(); syncTemplates(); render(); });
  function syncTemplates() {
    $$("[data-view-tpl]", root).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view-tpl") === st.plan.viewTemplate)); });
  }
  function applyViewTemplate(key) {
    const t = VIEW_TEMPLATES[key];
    if (!t) return;
    st.plan.layers = Object.assign(layers(), t.layers);
    st.plan.phaseView = t.phaseView;
    st.plan.viewTemplate = key;
    if (brand.sheets) st.plan.doc = brand.sheets.applyTemplate(st.plan.doc || {}, key);
    save();
    syncSettings();
    render();
    if (!stage3d.hidden) showView("3d");
  }
  const typesBox = $("[data-types]", root);
  if (typesBox) typesBox.addEventListener("change", typeInput);
  root.addEventListener("change", function (e) {
    const sketchField = e.target.getAttribute && e.target.getAttribute("data-sketch");
    if (sketchField && st.sketch) {
      const v = E.parseNum(e.target.value);
      if (sketchField === "width" && v >= 1 && v <= 200) st.sketch.width = v;
      if (sketchField === "detail") st.sketch.detail = v;
      detectSketch();
      return;
    }
    if (e.target.hasAttribute && e.target.hasAttribute("data-level")) { stashLevel(); showLevel(Number(e.target.value)); return; }
    if (e.target.hasAttribute && e.target.hasAttribute("data-variant")) { stashVariant(); showVariant(Number(e.target.value)); if (st.presenting) setTool("pan"); return; }
    const layer = e.target.getAttribute && e.target.getAttribute("data-layer");
    if (!layer) return;
    st.plan.layers = Object.assign(layers(), { [layer]: e.target.checked });
    delete st.plan.viewTemplate; // tocó una capa a mano: la vista ya no es la de la plantilla
    save();
    syncTemplates();
    render();
    if (!stage3d.hidden) showView("3d"); // el techo se muestra u oculta también en 3D
  });
  title.addEventListener("change", function () {
    st.plan.name = title.value.trim();
    title.value = st.plan.name || UNTITLED;
    save();
    render();
  });
  title.addEventListener("focus", function () { title.select(); });
  root.addEventListener("input", function (e) {
    const key = e.target.getAttribute && e.target.getAttribute("data-ref");
    if (!key || !st.plan.ref) return;
    const v = E.parseNum(e.target.value);
    if (key === "w" ? !(v >= 0.5) : !(v >= 0)) return;
    st.plan.ref[key] = key === "w" ? Math.round(v * 100) : v;
    save();
    render();
  });
  $$("[data-file]", root).forEach(function (input) {
    input.addEventListener("change", function () {
      if (input.files[0]) (({ plan: openPlanFile, sketch: readSketch })[input.getAttribute("data-file")] || openRefImage)(input.files[0]);
      input.value = "";
    });
  });
  // El lienzo cambia de tamaño al aparecer el inspector o plegar paneles: hay que redibujar a escala.
  if (window.ResizeObserver) new ResizeObserver(render).observe(svg);
  else window.addEventListener("resize", render);

  // En pantallas chicas las secciones largas arrancan plegadas para que el lienzo quede a la vista.
  if (matchMedia("(max-width: 959px)").matches) $$("[data-collapse-mobile]", root).forEach((d) => d.removeAttribute("open"));
  $("[data-library]", root).innerHTML = libraryHTML();
  renderLibrary();
  syncSettings();
  fit();
  setTool("select");
  renderInspector();
  renderVariants();
}

function boot() {
  const root = $("[data-planner]");
  if (!root) return;
  try {
    if (!E || !P) throw new Error("motor no disponible");
    init(root);
  } catch (e) {
    console.warn("[planner]", e);
    $("[data-result]", root).innerHTML = '<p class="result-error">No se pudo cargar el diseñador. Recargá la página.</p>';
  }
  document.documentElement.classList.add("is-ready");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
