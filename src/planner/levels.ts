/* Plantas y opciones de diseño. Los campos de P.LEVEL_FIELDS son siempre los de la planta activa; las demás esperan
   en plan.levels. Igual con las opciones: la activa vive en los campos de trabajo y las demás en plan.variants
   (comparten ajustes de obra, capas y carátula). También arma el selector de opciones y la tabla que las compara. */
import { plan as P } from "../../lib/plan";
import type { Level, Plan } from "../types/plan";
import { OPTIONS } from "./constants";
import { $$, escHTML } from "./dom";
import { commit, setTool } from "./edit";
import { syncSettings } from "./settings";
import { st } from "./state";
import { ui } from "./ui";
import { fit } from "./viewport";

type Fields = Record<string, unknown>;

export function stashLevel() {
  if (!st.plan.levels || !st.plan.levels.length) st.plan.levels = [{ name: P.LEVEL_NAMES[0] }];
  st.plan.level = Math.min(st.plan.level || 0, st.plan.levels.length - 1);
  const level: Level = { name: st.plan.levels[st.plan.level].name };
  P.LEVEL_FIELDS.forEach(function (f) { (level as unknown as Fields)[f] = (st.plan as unknown as Fields)[f] || []; });
  st.plan.levels[st.plan.level] = level;
}
function loadLevel(index: number) {
  const level = (st.plan.levels as Level[])[index];
  st.plan.level = index;
  P.LEVEL_FIELDS.forEach(function (f) { (st.plan as unknown as Fields)[f] = (level as unknown as Fields)[f] || []; });
}
export function showLevel(index: number) {
  loadLevel(index);
  st.chain = null;
  fit();
  commit(null);
  syncSettings();
  setTool("select");
}
export const variantCount = () => Math.max(1, (st.plan.variants || []).length);
export function stashVariant() {
  stashLevel();
  if (!st.plan.variants || !st.plan.variants.length) st.plan.variants = [{} as NonNullable<Plan["variants"]>[number]];
  st.plan.variant = Math.min(st.plan.variant || 0, st.plan.variants.length - 1);
  st.plan.variants[st.plan.variant] = { levels: JSON.parse(JSON.stringify(st.plan.levels)), level: st.plan.level as number, section: st.plan.section || null };
}
export function showVariant(index: number) {
  const v = (st.plan.variants as NonNullable<Plan["variants"]>)[index];
  st.plan.variant = index;
  st.plan.levels = JSON.parse(JSON.stringify(v.levels));
  st.plan.section = v.section || null;
  showLevel(Math.min(v.level || 0, (st.plan.levels as Level[]).length - 1));
}

// Selector de opciones y tabla que las compara.
export function renderVariants() {
  const list = st.plan.variants || [], many = list.length > 1, current = Math.min(st.plan.variant || 0, Math.max(0, list.length - 1));
  $$("[data-variant]", ui.root).forEach(function (el) {
    (el as HTMLElement).hidden = !many;
    el.innerHTML = list.map((_v, i) => '<option value="' + i + '"' + (i === current ? " selected" : "") + ">Opción " + OPTIONS[i] + "</option>").join("");
  });
  ui.compareBox.hidden = !many;
  if (!many) return;
  const cols = list.map(function (v, i) {
    if (i === current) return (st.model as NonNullable<typeof st.model>).main;
    const lv = v.levels[Math.min(v.level || 0, v.levels.length - 1)], other = Object.assign({}, st.plan, { levels: v.levels, level: v.level || 0, section: v.section });
    P.LEVEL_FIELDS.forEach(function (f) { (other as unknown as Fields)[f] = (lv as unknown as Fields)[f] || []; });
    return P.compute(other).main;
  });
  ui.compareOut.innerHTML = '<table class="compare"><thead><tr><th></th>' + list.map((_v, i) => "<th" + (i === current ? ' class="is-on"' : "") + ">" + OPTIONS[i] + "</th>").join("") + "</tr></thead><tbody>" +
    cols[0].map(function (m, r) {
      return "<tr><th>" + escHTML(m.label) + " <small>" + escHTML(m.unit) + "</small></th>" + cols.map((c, i) => "<td" + (i === current ? ' class="is-on"' : "") + ">" + escHTML(c[r].value) + "</td>").join("") + "</tr>";
    }).join("") + "</tbody></table>";
}
