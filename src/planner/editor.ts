/* Diseñador de planos: el arranque. Prepara el estado, registra las operaciones que usan los demás módulos, conecta
   los eventos y dibuja por primera vez. Cada parte del editor vive en su módulo de src/planner/:
   estado (state.ts) · guardado e historial (store.ts) · plantas y opciones (levels.ts) · edición (edit.ts) ·
   acciones de los botones (actions.ts) · lienzo (pointer.ts) · teclado, inspector y formularios (controls.ts) ·
   ajustes (settings.ts) · 3D y presentación (views.ts) · dibujo (render.ts) · inspector (inspector.ts) · tipos de
   muro (walltypes.ts) · archivos (io.ts) · boceto (sketch.ts). La geometría y el cómputo están en lib/plan.ts. */
import { engine as E } from "../../lib/calc";
import { plan as P } from "../../lib/plan";
import { ops } from "./context";
import { bindControls } from "./controls";
import { $, $$ } from "./dom";
import { addWalls, commit, renderLibrary, setTool } from "./edit";
import { renderInspector } from "./inspector";
import { renderVariants } from "./levels";
import { libraryHTML } from "./library";
import { bindPointer } from "./pointer";
import { bindRender, render } from "./render";
import { syncSettings } from "./settings";
import { st } from "./state";
import { loadShelf, normalize, pushHistory, save, snapshot, start } from "./store";
import { bindUI, ui } from "./ui";
import { fit } from "./viewport";

function init(root: HTMLElement) {
  bindUI(root);
  bindRender(root);
  st.canvas = ui.svg;
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

  // Operaciones que usan los módulos que no importan el editor directamente (src/planner/context.ts).
  Object.assign(ops, { root: root, hint: ui.hint, title: ui.title, pushHistory: pushHistory, commit: commit, save: save, render: render, setTool: setTool,
    syncSettings: syncSettings, normalize: normalize, snapshot: snapshot, addWalls: addWalls });

  bindPointer();
  bindControls();
  // El lienzo cambia de tamaño al aparecer el inspector o plegar paneles: hay que redibujar a escala.
  if (window.ResizeObserver) new ResizeObserver(render).observe(ui.svg);
  else (window as Window).addEventListener("resize", render);

  // En pantallas chicas las secciones largas arrancan plegadas para que el lienzo quede a la vista.
  if (matchMedia("(max-width: 959px)").matches) $$("[data-collapse-mobile]", root).forEach((d) => d.removeAttribute("open"));
  ($("[data-library]", root) as HTMLElement).innerHTML = libraryHTML();
  renderLibrary();
  syncSettings();
  fit();
  setTool("select");
  renderInspector();
  renderVariants();
}

function boot() {
  const root = $<HTMLElement>("[data-planner]");
  if (!root) return;
  try {
    if (!E || !P) throw new Error("motor no disponible");
    init(root);
  } catch (e) {
    console.warn("[planner]", e);
    ($("[data-result]", root) as HTMLElement).innerHTML = '<p class="result-error">No se pudo cargar el diseñador. Recargá la página.</p>';
  }
  document.documentElement.classList.add("is-ready");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
