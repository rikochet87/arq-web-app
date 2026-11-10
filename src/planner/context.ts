/* Operaciones del editor (src/planner/editor.js) que usan los demás módulos del diseñador: guardar, redibujar,
   cambiar de herramienta… El editor las registra al arrancar (init); el estado está en state.ts. */
import type { Plan, Point } from "../types/plan";
import type { ShelfItem } from "./library";

/** Lo elegido en el plano: un muro, varios, una abertura, un objeto, una superficie, una anotación o un ambiente. */
export interface Selection {
  type: string;
  [key: string]: unknown;
}

export interface EditorOps {
  /** El contenedor del diseñador ([data-planner]). */
  root: HTMLElement;
  /** Renglón de ayuda bajo el plano. */
  hint: HTMLElement;
  /** Campo con el nombre del plano. */
  title: HTMLInputElement;
  /** Guarda el estado actual para poder deshacer. */
  pushHistory(): void;
  /** Guarda, cambia la selección y redibuja todo. */
  commit(selection: Selection | null): void;
  /** Guarda el plano en el navegador. */
  save(): void;
  /** Redibuja el plano, sin guardar. */
  render(): void;
  setTool(name: string, type?: string | null, own?: ShelfItem): void;
  /** Pasa los ajustes, capas, plantas e imagen de referencia del plano a los controles de la pantalla. */
  syncSettings(): void;
  /** Un plano leído de un archivo o del navegador, completado y migrado; null si no es un plano. */
  normalize(saved: unknown): Plan | null;
  /** El plano como JSON, sin la imagen de referencia. */
  snapshot(): string;
  /** Suma muros (pares de extremos), uniéndolos a los que ya están. */
  addWalls(list: [Point, Point][]): void;
}

/** Las operaciones del editor. Vacío hasta que init() las registra. */
export const ops = {} as EditorOps;
