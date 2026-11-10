/* Bibliotecas del panel izquierdo: aberturas (puertas y ventanas) y equipamiento (muebles, artefactos y bocas),
   con un dibujo de cada pieza hecho con los mismos símbolos del plano. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import { escHTML } from "./dom";
import { n1 } from "./geometry";

/** Mueble guardado por el usuario en "Mis muebles". */
export interface ShelfItem {
  id: string;
  type: string;
  name: string;
  w: number;
  d: number;
  tall?: number;
  shape?: "round";
}

const size = (o: { w: number; h: number }) => E.fmt(o.w / 100, 2) + " × " + E.fmt(o.h / 100, 2);

export function libraryHTML(): string {
  return Object.keys(D.openingGroups).map(function (group) {
    const items = Object.keys(D.openings).filter((key) => D.openings[key].group === group).map(function (key) {
      const def = D.openings[key];
      return '<button type="button" class="lib-item" data-pick="' + key + '" aria-pressed="false">' +
        '<svg class="plan-svg" viewBox="0 0 100 62" aria-hidden="true">' + P.lineSVG({ x: 4, y: 48 }, { x: 96, y: 48 }, "wall ext", 9) +
        P.symbolSVG(def, { x: 24, y: 48 }, { x: 76, y: 48 }, 9, 1, { side: true }, "") + "</svg>" +
        "<span>" + escHTML(def.label) + "</span><small>" + size(def) + "</small></button>";
    }).join("");
    return '<h3 class="lib-title">' + escHTML(D.openingGroups[group]) + '</h3><div class="lib-grid">' + items + "</div>";
  }).join("");
}

// shelf: los muebles guardados por el usuario; van en el primer grupo, junto al mueble a medida en blanco.
export function itemLibraryHTML(shelf: ShelfItem[]): string {
  const tile = function (attr: string, o: { type: string; w: number; d: number; shape?: "round" }, label: string) {
    const side = Math.max(o.w, o.d) * 1.15;
    return '<button type="button" class="lib-item" ' + attr + ' aria-pressed="false">' +
      '<svg class="plan-svg" viewBox="' + [-side / 2, -side / 2, side, side].map(n1).join(" ") + '" aria-hidden="true">' +
      P.itemSVG({ id: 0, type: o.type, x: 0, y: 0, r: 0, w: o.w, d: o.d, shape: o.shape }, side / 60, "") + "</svg>" +
      "<span>" + escHTML(label) + "</span><small>" + size({ w: o.w, h: o.d }) + "</small></button>";
  };
  return Object.keys(D.itemGroups).map(function (group) {
    const own = group === "propios";
    const items = Object.keys(D.items).filter((key) => D.items[key].group === group).map(function (key) {
      return tile('data-pick-item="' + key + '"', { type: key, w: D.items[key].w, d: D.items[key].d }, D.items[key].label);
    }).join("") + (own ? shelf.map(function (o) {
      return '<div class="lib-own">' + tile('data-pick-shelf="' + o.id + '"', o, o.name) +
        '<button type="button" class="lib-remove" data-shelf-remove="' + o.id + '" title="Quitar de Mis muebles" aria-label="Quitar ' + escHTML(o.name) + ' de Mis muebles">×</button></div>';
    }).join("") : "");
    return '<details class="lib-group" data-group="' + group + '"' + (own ? " open" : "") + "><summary>" + escHTML(D.itemGroups[group]) + "</summary>" +
      (own ? '<p class="ws-tip">Colocá un mueble a medida, ponele nombre, medidas y forma, y guardalo acá con «Guardar en Mis muebles». También podés guardar cualquier mueble de la biblioteca con otra medida.</p>' : "") +
      '<div class="lib-grid">' + items + "</div></details>";
  }).join("");
}
