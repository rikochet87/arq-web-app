/* Lo que el editor (src/planner/editor.js) les presta a los módulos del diseñador: el plano y la selección
   de ese momento, los elementos de la pantalla que usan y las operaciones que guardan y redibujan. */
import type { Plan } from "../types/plan";

/** Lo elegido en el plano: un muro, varios, una abertura, un objeto, una superficie, una anotación o un ambiente. */
export interface Selection {
  type: string;
  [key: string]: unknown;
}

export interface EditorContext {
  /** El plano tal como está ahora (cambia al deshacer, abrir un archivo o cambiar de planta). */
  readonly plan: Plan;
  readonly sel: Selection | null;
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
}
