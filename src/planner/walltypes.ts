/* Tipos de muro: el ladrillo y los revoques de cada cara. El panel "Tipos de muro" los muestra en corte, capa por
   capa, y permite crearlos y cambiarlos; los cambios valen para todos los muros de ese tipo, en todas las plantas
   y opciones. También llena los selectores de tipo por defecto de los Ajustes de obra. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Wall, WallFace, WallType } from "../types/plan";
import { ops } from "./context";
import { $, escHTML } from "./dom";
import { st } from "./state";

type Cls = "ext" | "int";

/** El tipo de muro que les toca por defecto a los muros de una clase. */
export function defaultType(cls: Cls): WallType {
  const types = P.wallTypesOf(st.plan), lib = P.wallTypesOf({});
  return types[(st.plan.settings || {})[cls] as string] || types[P.DEFAULTS[cls]] || lib[P.DEFAULTS[cls]];
}
export const thickText = (t: WallType) => E.fmt(P.typeThick(t, "ext"), 1) + " cm como exterior · " + E.fmt(P.typeThick(t, "int"), 1) + " cm como interior";

// Todos los muros del plano: plantas y opciones de diseño, con la planta activa tomada de los campos de trabajo.
export function everyWall(): Wall[] {
  const list = st.plan.walls.slice();
  (st.plan.levels || []).forEach(function (lv, i) { if (i !== (st.plan.level || 0)) list.push.apply(list, lv.walls || []); });
  (st.plan.variants || []).forEach(function (v, i) {
    if (i === (st.plan.variant || 0)) return;
    (v.levels || []).forEach(function (lv) { list.push.apply(list, lv.walls || []); });
  });
  return list;
}
export function ensureTypes() { if (!Array.isArray(st.plan.wallTypes) || !st.plan.wallTypes.length) st.plan.wallTypes = P.wallTypeList(st.plan); }

const LAYER_COLORS: Record<string, string> = { azotado: "#4f9bd9", grueso: "#8d8d8d", fino: "#d9d9d9" };
// Corte del muro, capa por capa y a escala: de la cara exterior (izquierda) a la interior.
function layerSVG(t: WallType): string {
  const parts: { cls: string; w: number }[] = [];
  const face = (f: WallFace, outer: boolean) => {
    const list = ([["azotado", f.azotado], ["grueso", f.grueso], ["fino", f.fino ? D.finishes.fineThick : 0]] as [string, number][]).filter((l) => l[1] > 0);
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

export function renderTypes() {
  const root = ops.root, settings = $("[data-settings]", root) as HTMLFormElement;
  // Los tipos de muro por defecto de los Ajustes de obra se eligen entre los tipos de este plano.
  (["ext", "int"] as const).forEach(function (cls) {
    const el = settings.elements.namedItem(cls) as HTMLSelectElement | null;
    if (!el) return;
    el.innerHTML = P.wallTypeList(st.plan).map((t) => '<option value="' + escHTML(t.id) + '">' + escHTML(t.name) + "</option>").join("");
    el.value = defaultType(cls).id;
  });
  const box = $("[data-types]", root);
  if (!box) return;
  const list = P.wallTypeList(st.plan);
  if (!list.some((t) => t.id === st.editType)) st.editType = list[0].id;
  const t = list.find((x) => x.id === st.editType) as WallType, used = everyWall().filter((w) => w.type === t.id).length;
  const isDefault = (["ext", "int"] as const).filter((c) => defaultType(c).id === t.id);
  const num = (face: Cls, layer: "azotado" | "grueso", labelText: string) => "<label>" + labelText + ' (cm) <input type="text" inputmode="decimal" autocomplete="off" data-layer-cm="' + face + "." + layer +
    '" value="' + E.fmt(t[face][layer], 1) + '"></label>';
  const fine = (face: Cls) => '<label class="type-check"><input type="checkbox" data-layer-fino="' + face + '"' + (t[face].fino ? " checked" : "") + "> Revoque fino</label>";
  const faceBox = (face: Cls, title: string) => '<fieldset class="type-face"><legend>' + title + "</legend>" + num(face, "azotado", "Azotado") +
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
function editTypeWith(fn: (t: WallType) => void) {
  ops.pushHistory();
  ensureTypes();
  const t = st.plan.wallTypes.find((x) => x.id === st.editType);
  if (!t) return;
  fn(t);
  Object.assign(t, P.cleanType(t));
  ops.save();
  ops.render();
  renderTypes();
}

/** Lo que se escribe o elige en el panel de tipos de muro. */
export function typeInput(e: Event) {
  const el = e.target as HTMLInputElement;
  if (el.matches("[data-type-pick]")) { st.editType = el.value; renderTypes(); return; }
  if (e.type !== "change") return; // nombre y espesores se toman al confirmar, para no rehacer el panel mientras se tipea
  if (el.matches("[data-type-name]")) {
    const name = el.value.trim();
    if (!name) return;
    editTypeWith((t) => { t.name = name; });
    return;
  }
  if (el.matches("[data-type-brick]")) { editTypeWith((t) => { t.brick = el.value; }); return; }
  if (el.matches("[data-layer-fino]")) { const face = el.getAttribute("data-layer-fino") as Cls; editTypeWith((t) => { t[face].fino = el.checked; }); return; }
  if (el.matches("[data-layer-cm]")) {
    const parts = (el.getAttribute("data-layer-cm") as string).split("."), v = el.value.trim() === "" ? 0 : E.parseNum(el.value);
    if (!(v >= 0 && v <= 5)) { el.setAttribute("aria-invalid", "true"); return; }
    editTypeWith((t) => { t[parts[0] as Cls][parts[1] as "azotado" | "grueso"] = v; });
  }
}
