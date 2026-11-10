/* Ajustes de obra (altura, contrapiso, techo, tipos de muro por defecto…), capas, plantillas de vista y el resto de los
   campos que muestran el estado del plano: título, planta, imán e imagen de referencia. */
import { engine as E } from "../../lib/calc";
import { plan as P } from "../../lib/plan";
import type { Settings } from "../types/plan";
import { UNTITLED, VIEW_TEMPLATES } from "./constants";
import { $, $$, escHTML } from "./dom";
import { renderVariants } from "./levels";
import { render } from "./render";
import { save } from "./store";
import { layers, st } from "./state";
import { ui } from "./ui";
import { showView } from "./views";
import { defaultType, renderTypes } from "./walltypes";

type Values = Record<string, unknown>;

// Cada ajuste numérico: [factor a cm, mínimo, máximo] en la unidad del formulario.
const LIMITS: Record<string, [number, number, number]> = { height: [100, 2, 6], slab: [1, 0, 50], screed: [1, 0, 10], coats: [1, 1, 5] };

export function syncSettings() {
  const root = ui.root;
  const s: Values = Object.assign({} as Values, P.DEFAULTS, st.plan.settings), show = layers();
  (["ext", "int"] as const).forEach(function (cls) { s[cls] = defaultType(cls).id; });
  renderTypes();
  $$<HTMLInputElement>("input, select", ui.settings).forEach(function (el) {
    if (el.type === "checkbox") el.checked = !!s[el.name];
    else if (LIMITS[el.name]) el.value = E.fmt((s[el.name] as number) / LIMITS[el.name][0], 2);
    else el.value = s[el.name] as string;
  });
  $$<HTMLInputElement>("[data-layer]", root).forEach(function (el) { el.checked = show[el.getAttribute("data-layer") as string] as boolean; });
  if (ui.phaseView) ui.phaseView.value = st.plan.phaseView || "obra";
  syncTemplates();
  ui.title.value = st.plan.name || UNTITLED;
  ($("[data-level]", root) as HTMLElement).innerHTML = P.levelsOf(st.plan).map((level, i) => '<option value="' + i + '"' + (i === (st.plan.level || 0) ? " selected" : "") + ">" +
    escHTML(level.name) + "</option>").join("");
  ($('[data-action="snap"]', root) as HTMLElement).setAttribute("aria-pressed", String(st.plan.snap !== false));
  if (st.model) renderVariants();
  ui.refBox.hidden = !(st.plan.ref && st.plan.ref.src);
  if (st.plan.ref) {
    ($<HTMLInputElement>('[data-ref="w"]', root) as HTMLInputElement).value = E.fmt(st.plan.ref.w / 100, 2);
    ($<HTMLInputElement>('[data-ref="opacity"]', root) as HTMLInputElement).value = st.plan.ref.opacity as unknown as string;
  }
}
export function readSettings() {
  const s: Values = Object.assign({} as Values, P.DEFAULTS, st.plan.settings);
  $$<HTMLInputElement>("input, select", ui.settings).forEach(function (el) {
    if (el.type === "checkbox") { s[el.name] = el.checked; return; }
    if (!LIMITS[el.name]) { s[el.name] = el.value; return; }
    const v = E.parseNum(el.value), lim = LIMITS[el.name], ok = v >= lim[1] && v <= lim[2];
    el.setAttribute("aria-invalid", String(!ok));
    if (ok) s[el.name] = v * lim[0];
  });
  st.plan.settings = s as Partial<Settings>;
  save();
  render();
  renderVariants();
}
export function syncTemplates() {
  $$("[data-view-tpl]", ui.root).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view-tpl") === st.plan.viewTemplate)); });
}
interface SheetsModule { applyTemplate(doc: object, key: string): NonNullable<typeof st.plan.doc> }
export function applyViewTemplate(key: string) {
  const t = VIEW_TEMPLATES[key];
  if (!t) return;
  const sheets = window.__BRAND__.sheets as SheetsModule | undefined;
  st.plan.layers = Object.assign(layers(), t.layers);
  st.plan.phaseView = t.phaseView;
  st.plan.viewTemplate = key;
  if (sheets) st.plan.doc = sheets.applyTemplate(st.plan.doc || {}, key);
  save();
  syncSettings();
  render();
  if (!ui.stage3d.hidden) showView("3d");
}
