/* Tipos del modelo del plano, tal como lo guarda hoy el diseñador (localStorage "calcuobra.plano.v1" y los archivos
   exportados). Describen los datos existentes; no cambian nada. Son la base para migrar el editor (src/planner/) y los demás scripts a
   TypeScript y, más adelante, para el modelo BIM (identificadores estables, propiedades por elemento, IFC).

   Unidades: todas las medidas en cm. Coordenadas en planta: x hacia la derecha, y hacia abajo (como el SVG).
   Los campos opcionales faltan en planos guardados por versiones anteriores: normalize() en src/planner/editor.js los completa. */

/** Identificador numérico de un elemento, único dentro del plano (plan.nextId da el siguiente). */
export type Id = number;

export interface Point {
  x: number;
  y: number;
}

/* ---------- Fases (obra nueva, existente, a demoler) ---------- */

/** Sin valor = a construir. "existente" se conserva; "demoler" es existente que se demuele. */
export type Phase = "nueva" | "existente" | "demoler";

/* ---------- Muros ---------- */

/** Revoque de una cara del muro: espesores en cm (0 a 5) y si lleva fino. */
export interface WallFace {
  azotado: number;
  grueso: number;
  fino: boolean;
}

/** Tipo de muro: la receta (ladrillo + revoques de cada cara). Los muros lo referencian por id. */
export interface WallType {
  id: string;
  name: string;
  /** Clave de ladrillo en data.bricks (lib/manifest.ts). */
  brick: string;
  /** Cara exterior. */
  ext: WallFace;
  /** Cara interior. */
  int: WallFace;
}

/** Tramo de un muro con altura propia: t0 y t1 van de 0 (extremo a) a 1 (extremo b). */
export interface WallHeightSpan {
  t0: number;
  t1: number;
  h: number;
}

export interface Wall {
  id: Id;
  /** Extremos del eje del muro. */
  a: Point;
  b: Point;
  /** Id del tipo de muro (plan.wallTypes). Sin valor usa el de su clase en los ajustes (exterior o interior).
   *  Planos viejos guardaban acá una clave de ladrillo: migrateWalls la convierte. */
  type?: string;
  /** Altura propia; sin valor usa la de la planta (settings.height). */
  h?: number;
  /** Alturas por tramo, cuando cambia a lo largo del muro. */
  hs?: WallHeightSpan[];
  phase?: Phase;
}

/* ---------- Aberturas ---------- */

export interface Opening {
  id: Id;
  /** Muro que la aloja. */
  wall: Id;
  /** Posición del centro a lo largo del muro: 0 = extremo a, 1 = extremo b. */
  t: number;
  /** Clave de la biblioteca data.openings (p80, v120…). */
  type: string;
  /** Ancho y alto: al crearla se copian del tipo y después se pueden cambiar. */
  w: number;
  h: number;
  /** Antepecho propio; sin valor, el del tipo. */
  sill?: number;
  /** Hacia qué lado del muro abre (true = el opuesto). */
  side?: boolean;
  /** De qué extremo cuelga la hoja. */
  hinge?: boolean;
  /** Sin valor hereda la del muro; "nueva" en un muro existente es un vano nuevo. */
  phase?: Phase;
  /** Solo en planos anteriores a la biblioteca de aberturas. */
  kind?: "door" | "window";
}

/* ---------- Equipamiento, bocas eléctricas y cableado ---------- */

export interface Item {
  id: Id;
  /** Clave de data.items (muebles, artefactos y bocas eléctricas). */
  type: string;
  /** Centro del objeto. */
  x: number;
  y: number;
  /** Giro en grados. */
  r: number;
  /** Ancho y fondo. */
  w: number;
  d: number;
  /** Alto, para la vista 3D. */
  tall?: number;
  /** Solo muebles a medida. */
  name?: string;
  shape?: "round";
}

/** Cable entre dos bocas eléctricas (ids de Item). */
export interface Wire {
  id: Id;
  a: Id;
  b: Id;
}

/* ---------- Ambientes, exteriores y anotaciones ---------- */

/** Etiqueta de ambiente: nombra al ambiente que contiene su punto y le asigna un piso. */
export interface RoomLabel {
  x: number;
  y: number;
  name: string;
  /** Clave de data.floors; sin valor, cerámico. */
  floor?: string;
  /** Color de relleno en el plano, "#rrggbb". */
  color?: string;
}

/** Superficie exterior (patio, vereda, galería): rectángulo con su tipo. */
export interface Surface {
  id: Id;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clave del tipo de superficie exterior. */
  type: string;
}

export type NoteKind = "pen" | "line" | "arrow" | "rect" | "ellipse" | "cloud" | "text";

/** Anotación libre sobre el plano. No entra en el cómputo. */
export interface Note {
  id: Id;
  kind: NoteKind;
  /** Puntos del trazo; una nota de texto usa solo el primero. */
  pts: Point[];
  text?: string;
  color?: string;
  /** Grosor o tamaño de letra: chico, mediano, grande. */
  w?: "s" | "m" | "l";
}

/* ---------- Plantas ---------- */

/** Lo que es propio de cada planta (P.LEVEL_FIELDS en lib/plan.ts). */
export interface LevelContent {
  walls: Wall[];
  openings: Opening[];
  items: Item[];
  labels: RoomLabel[];
  wires: Wire[];
  surfaces: Surface[];
  notes: Note[];
}

export interface Level extends Partial<LevelContent> {
  name: string;
}

/** Una planta con todo su contenido, como la devuelve levelsOf(). */
export interface LevelData extends LevelContent {
  name: string;
}

/* ---------- Ajustes de obra ---------- */

export type RoofKind = "none" | "losa" | "chapa" | "tejas";

export interface Settings {
  /** Altura de piso a techo de la planta. */
  height: number;
  /** Tipo de muro por defecto de los muros exteriores e interiores (id de WallType). */
  ext: string;
  int: string;
  /** Espesor del contrapiso en planta baja. */
  slab: number;
  /** Espesor de la carpeta. */
  screed: number;
  /** Manos de pintura. */
  coats: number;
  /** Lleva cielorraso. */
  ceiling: boolean;
  roof: RoofKind;
  /** Sistema constructivo para la verificación CIRSOC. */
  system: string;
  /** Zona sísmica. */
  zone: string;
  /** Mortero de asiento (clave de data.mixes). */
  mortar: string;
}

/* ---------- Plano ---------- */

/** Otra opción de diseño del mismo plano (Opción B, C…). */
export interface Variant {
  levels: Level[];
  level: number;
  section: Section | null;
}

/** Línea de corte para la vista en sección. */
export interface Section {
  a: Point;
  b: Point;
}

/**
 * El plano completo.
 * Los campos de LevelContent son siempre los de la planta activa (`level`); las demás plantas esperan en `levels`.
 * La entrada de la planta activa dentro de `levels` puede estar desactualizada hasta que se cambia de planta.
 */
export interface Plan extends LevelContent {
  nextId: number;
  settings: Partial<Settings>;
  wallTypes: WallType[];
  levels?: Level[];
  level?: number;
  section?: Section | null;
  variants?: Variant[];
  variant?: number;
  /** Nombre del plano (el título del editor). */
  name?: string;
  /** Capas visibles en el editor. */
  layers?: Partial<Record<string, boolean>>;
  /** false: sin imán a la grilla ni a los extremos de los muros. */
  snap?: boolean;
  /** Cómo se ven las fases en el plano: "obra", "actual" o "municipal". */
  phaseView?: string;
  /** Plantilla de vista aplicada (municipal, obra o cliente), mientras no se toque una capa a mano. */
  viewTemplate?: string;
  /** Presupuesto del plano: gastos generales, beneficio e IVA propios y precios de aberturas y artefactos. */
  budget?: { pase?: Partial<Record<string, number>>; prices?: Record<string, number> };
  /** Datos de las láminas: carátula, plantilla y hojas. */
  doc?: unknown;
  /** Losas a distintas alturas: un punto dentro de un ambiente y la cara superior de su losa (z, desde el piso de la planta). */
  slabs?: SlabMark[];
  /** Imagen de referencia para calcar (o el boceto aplicado). No se guarda en el historial. */
  ref?: RefImage | null;
}

/** Imagen de fondo para calcar: posición y ancho en cm, opacidad y giro en grados. */
export interface RefImage {
  src: string;
  ratio: number;
  w: number;
  x: number;
  y: number;
  opacity: number;
  rot?: number;
}

export interface SlabMark extends Point {
  z: number;
}
