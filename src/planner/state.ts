/* Estado del diseñador de planos: el plano que se edita, la vista, el historial y lo que está haciendo el usuario
   (herramienta, selección, arrastre…). Es un único objeto compartido: el editor lo carga al arrancar (init) y los
   módulos del diseñador lo leen y lo cambian. */
import { plan as P } from "../../lib/plan";
import type { Id, Item, Opening, Plan, Point } from "../types/plan";
import type { SketchBox, SketchOpening, SketchSegment } from "../types/modules";
import type { Selection } from "./context";
import { LAYERS } from "./constants";
import type { ShelfItem } from "./library";

/** Porción del plano a la vista, en cm (el viewBox del lienzo). */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lo que se está arrastrando: el plano (pan), un recuadro, un trazo, un muro, un extremo, un objeto… */
export interface Drag {
  type: string;
  [key: string]: unknown;
}

/** Boceto a mano analizado, todavía sin convertir en paredes. */
export interface Sketch {
  src: string;
  gray: Uint8Array;
  w: number;
  h: number;
  /** Ancho real de la casa, en m. */
  width: number;
  detail: number;
  origin: Point;
  /** Lo que detectó lib/sketch.js, en píxeles de la imagen. */
  segments: SketchSegment[];
  openings: SketchOpening[];
  angle: number;
  box: SketchBox;
}

export type Model = ReturnType<typeof P.compute>;

export interface EditorState {
  /** El lienzo SVG del plano. */
  canvas: SVGSVGElement;
  plan: Plan;
  view: View;
  /** Planos anteriores y deshechos, como JSON (sin la imagen de referencia). */
  history: string[];
  future: string[];
  /** Cómputo del plano a la vista; lo rehace cada dibujo. */
  model: Model | null;
  tool: string;
  /** Abertura o mueble de la biblioteca que se está colocando. */
  pick: string | null;
  sel: Selection | null;
  /** Punto donde arranca lo que se está dibujando (cadena de muros, ambiente, arco, superficie, corte). */
  chain: Point | null;
  hover: Point | null;
  /** Vista previa de la abertura o el objeto que se va a colocar. */
  ghost: Opening | Item | null;
  /** Largo tecleado mientras se dibuja un muro. */
  typed: string;
  drag: Drag | null;
  /** Texto del cómputo, para copiarlo. */
  text: string;
  measure: { a: Point; b?: Point } | null;
  arcEnd: Point | null;
  /** Boca desde la que sale el cable que se está tendiendo. */
  wireFrom: Id | null;
  sketch: Sketch | null;
  /** Barra espaciadora apretada: arrastrar desplaza el plano, con cualquier herramienta. */
  spaceDown: boolean;
  /** Tipo de muro (id) de los muros que se dibujen a continuación; vacío = el tipo por defecto de su clase. */
  nextType: string;
  /** Tipo de muro abierto en el panel "Tipos de muro". */
  editType: string;
  /** Fase de los muros que se dibujen: vacío = a construir; "existente" para relevar lo que ya está. */
  nextPhase: string;
  /** "Elegir varios": cada toque suma o quita muros, como Shift; para pantallas táctiles. */
  multi: boolean;
  /** Color y grosor de las anotaciones que se dibujen a continuación. */
  nextNote: { color: string; w: string };
  /** Biblioteca personal de muebles ("Mis muebles"). */
  shelf: ShelfItem[];
  /** Mueble de la biblioteca personal que se está colocando; si no, se coloca el de la biblioteca general (pick). */
  stamp: ShelfItem | null;
  /** Modo presentación: solo el plano, para mostrarlo y marcarlo frente al cliente. */
  presenting: boolean;
}

/** El estado del editor. Vacío hasta que init() lo carga. */
export const st = {} as EditorState;

export function nextId(): number { st.plan.nextId = (st.plan.nextId || 1) + 1; return st.plan.nextId; }
/** Capas visibles: las por defecto con lo que haya cambiado el usuario. */
export const layers = (): Record<string, boolean> => Object.assign({}, LAYERS, st.plan.layers);
export const wallById = (id: Id) => st.plan.walls.find((w) => w.id === id);
export const openingById = (id: Id) => st.plan.openings.find((o) => o.id === id);
export const itemById = (id: Id) => st.plan.items.find((it) => it.id === id);
export const surfaceById = (id: Id) => st.plan.surfaces.find((sf) => sf.id === id);
export const noteById = (id: Id) => st.plan.notes.find((nt) => nt.id === id);
/** El ambiente que contiene el punto (del último cómputo). */
export const roomAt = (p: Point) => (st.model as Model).rooms.find((r) => P.inside(r.points, p));
/** Ids de los muros elegidos (uno o varios). */
export const pickedWalls = (): Id[] => !st.sel ? [] : st.sel.type === "wall" ? [st.sel.id as Id] : st.sel.type === "walls" ? st.sel.ids as Id[] : [];
/** Selección de muros: ninguno, uno solo o varios. */
export const wallsSel = (ids: Id[]): Selection | null => ids.length > 1 ? { type: "walls", ids: ids } : ids.length ? { type: "wall", id: ids[0] } : null;
/** Lo elegido, como objeto del plano: un muro, varios (lista), una abertura, un objeto, una superficie, una anotación o un ambiente.
 *  Si eran varios muros y alguno ya no existe, la selección se achica a los que quedan. */
export function selected() {
  if (!st.sel) return null;
  if (st.sel.type === "walls") { // varios muros: quedan los que sigan existiendo
    st.sel = wallsSel((st.sel.ids as Id[]).filter((id) => wallById(id)));
    if (!st.sel || st.sel.type === "wall") return st.sel ? wallById(st.sel.id as Id) : null;
    return (st.sel.ids as Id[]).map(wallById);
  }
  const id = st.sel.id as Id;
  return st.sel.type === "wall" ? wallById(id) : st.sel.type === "opening" ? openingById(id) : st.sel.type === "item" ? itemById(id) : st.sel.type === "surface" ? surfaceById(id) :
    st.sel.type === "note" ? noteById(id) : roomAt(st.sel as unknown as Point);
}
