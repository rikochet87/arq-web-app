/* CalcuObra — diseñador de planos: el editor SVG (estado, dibujo, inspector y eventos). La geometría, el cómputo y los
   símbolos están en lib/plan.ts; las constantes, las bibliotecas, las planillas y el presupuesto, en los otros módulos de
   src/planner/. */
import * as G from "./geometry.ts";
import { GRID, KEYS, OPTIONS, SHELF_MAX, UNTITLED } from "./constants.ts";
import { $, $$ } from "./dom.ts";
import { download, fileName as planFileName } from "./files.ts";
import { libraryHTML } from "./library.ts";
import { openBudget } from "./budget.ts";
import { openSchedules } from "./schedules.ts";
import { itemById, layers, nextId, noteById, openingById, pickedWalls, roomAt, selected, st, surfaceById, wallById, wallsSel } from "./state.ts";
import { bindRender, render } from "./render.ts";
import { renderInspector } from "./inspector.ts";
import { defaultType, ensureTypes, everyWall, renderTypes, typeInput } from "./walltypes.ts";
import { applySketch, cancelSketch, detectSketch, readSketch } from "./sketch.ts";
import { exportDrawing, exportDxf, exportJson, openPlanFile, openRefImage } from "./io.ts";
import { ops } from "./context.ts";
import { bindUI, ui } from "./ui.ts";
import { loadShelf, normalize, pushHistory, restore, save, saveShelf, snapshot, start } from "./store.ts";
import { addOpening, addRoomPoint, addWallPoint, addWalls, center, changeOpening, commit, newItem, removeSelection, renderLibrary, setColor, setTool, tagRoom } from "./edit.ts";
import { renderVariants, showLevel, showVariant, stashLevel, stashVariant, variantCount } from "./levels.ts";
import { applyViewTemplate, readSettings, syncSettings, syncTemplates } from "./settings.ts";
import { present, showView } from "./views.ts";
import { clampT, fit, hitItem, hitNote, hitOpening, hitSurface, hitWall, itemPoint, movePoints, px, snap, toWorld } from "./viewport.ts";

const { dist, same, copy, round, n1, pt1, project, straight, simplify } = G;

const brand = window.__BRAND__ || {};
const E = brand.engine, P = brand.plan, D = brand.data;

const NOTES = P.NOTE_KINDS; // herramientas de anotación: trazo, línea, flecha, formas, nube y nota de texto

function init(root) {
  bindUI(root);
  const { svg, hint, inspector, settings, title, phaseView, stage3d, coords } = ui;
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

  // ---------- Estado, historial y arranque: src/planner/store.ts · Plantas y opciones: src/planner/levels.ts ----------
  // ---------- Edición: src/planner/edit.ts · Ajustes: src/planner/settings.ts · 3D y presentación: src/planner/views.ts ----------

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

  settings.addEventListener("input", readSettings);
  settings.addEventListener("change", readSettings);
  settings.addEventListener("submit", function (e) { e.preventDefault(); });
  if (phaseView) phaseView.addEventListener("change", function () { st.plan.phaseView = phaseView.value; delete st.plan.viewTemplate; save(); syncTemplates(); render(); });
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
