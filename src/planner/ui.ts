/* Elementos fijos de la pantalla del diseñador. bindUI los busca una vez al arrancar; los módulos los usan desde acá. */
import { $ } from "./dom";

export interface PlannerUI {
  root: HTMLElement;
  svg: SVGSVGElement;
  hint: HTMLElement;
  inspector: HTMLElement;
  settings: HTMLFormElement;
  title: HTMLInputElement;
  phaseView: HTMLSelectElement | null;
  compareBox: HTMLElement;
  compareOut: HTMLElement;
  refBox: HTMLElement;
  stage3d: HTMLElement;
  note3d: HTMLElement;
  coords: HTMLElement;
}

export const ui = {} as PlannerUI;

export function bindUI(root: HTMLElement) {
  const get = <T extends Element = HTMLElement>(sel: string) => $<T>(sel, root) as T;
  Object.assign(ui, {
    root: root, svg: get<SVGSVGElement>("[data-canvas]"), hint: get("[data-hint]"), inspector: get("[data-inspector]"),
    settings: get<HTMLFormElement>("[data-settings]"), title: get<HTMLInputElement>("[data-title]"), phaseView: $<HTMLSelectElement>("[data-phase-view]", root),
    compareBox: get("[data-compare-box]"), compareOut: get("[data-compare]"), refBox: get("[data-ref-box]"), stage3d: get("[data-view3d]"),
    note3d: get("[data-view3d-msg]"), coords: get("[data-coords]")
  });
}
