/* Tipos de los datos de obra (lib/manifest.ts): materiales, mezclas, ladrillos, valores del CIRSOC, costos,
   aberturas, muebles, pisos, exteriores, cubiertas, tipos de muro, terminaciones y escaleras.
   Unidades como en el manifiesto: medidas de piezas en cm, volúmenes en m³, pesos en kg. */
import type { WallType } from "./plan";

type Dict<T> = Record<string, T>;

/** Material de una mezcla. aporte: fracción del volumen aparente que ocupa lugar. density: kg/m³ (solo ligantes). bag: kg. */
export interface Material {
  label: string;
  aporte: number;
  density?: number;
  bag?: number;
}

/** Ligante: se compra por peso, en bolsas. */
export interface Binder extends Material {
  density: number;
  bag: number;
}

/** Mezcla: proporciones en volumen y agua como fracción del volumen aparente. */
export interface Mix {
  label: string;
  water: number;
  parts: Dict<number>;
}

export type BrickKind = "macizo" | "hueco" | "bloque" | "cerramiento";

/** Ladrillo o bloque: cara vista l × h, espesor de pared e y junta j, en cm. */
export interface Brick {
  label: string;
  l: number;
  h: number;
  e: number;
  j: number;
  kind: BrickKind;
}

export interface MortarSpec {
  type: string;
  ratio: string;
  /** Tensión admisible, MPa. */
  stress: number;
}

/** Valores de los reglamentos CIRSOC y supuestos propios que usa lib/cirsoc.js (ver lib/manifest.ts). */
export interface CirsocData {
  maxHeight: number;
  maxStoreys: number;
  minThick: Dict<number>;
  table71: { max: number; storey: number; support: number; multi: boolean }[];
  minLength: number;
  minWall: number;
  maxOpening: number;
  minPier: number;
  lintelSeat: number;
  mortars: Dict<MortarSpec>;
  ties: {
    height: number;
    width: number;
    thinMax: number;
    barsThin: number;
    barsThick: number;
    stirrupGap: number;
    splice: number;
    mix: string;
    kg6: number;
    kg42: number;
  };
  seismic: { thick: number; thin: number };
  live: number;
  weights: { masonry: Dict<number>; screedBase: number; mortar: number; plaster: number; tile: number };
  slab: number;
  plaster: number;
  ceiling: number;
  roofs: Dict<{ dead: number }>;
}

/** Ítem con precio: lo carga cada usuario (price siempre null en el manifiesto). */
export interface PriceItem {
  label: string;
  unit: string;
  price: number | null;
}

/** Horas de [oficial, ayudante] por unidad de trabajo. */
export type Hours = [number, number];

export interface CostData {
  prices: Dict<PriceItem>;
  hours: {
    wall: Dict<{ price: string; h: Hours }>;
    slab: Hours;
    screed: Hours;
    floor: Hours;
    paint: Hours;
    ceiling: Hours;
    plasterExt: Hours;
    plasterInt: Hours;
    roofSheet: Hours;
    board: Hours;
    skirting: Hours;
    door: Hours;
    window: Hours;
    smallWindow: Hours;
  };
}

export type OpeningSymbol = "swing" | "double" | "sliding" | "garage" | "open" | "window" | "fixed";

/** Abertura de la biblioteca: w × h y antepecho (sill) en cm. */
export interface OpeningDef {
  group: "door" | "window";
  label: string;
  w: number;
  h: number;
  sill?: number;
  symbol: OpeningSymbol;
}

/** Primitiva de dibujo en fracciones del rectángulo del objeto: ["r", x, y, ancho, alto], ["e", cx, cy, rx, ry] o ["l", x1, y1, x2, y2]. */
export type DrawOp = [string, number, number, number, number];

/** Mueble, artefacto o boca eléctrica: w × d en cm. */
export interface ItemDef {
  group: string;
  label: string;
  w: number;
  d: number;
  /** Alto para la vista 3D (75 si no se indica). */
  tall?: number;
  /** Mueble a medida: nombre, medidas y forma los pone cada uno. */
  custom?: boolean;
  draw?: DrawOp[];
  /** Rubro del cómputo donde se cuenta. */
  bill?: string;
  /** Altura de montaje de la boca, cm. */
  mount?: number;
  shape?: "stair";
}

export interface FloorDef {
  label: string;
  /** % de desperdicio. */
  waste?: number;
  /** kg de adhesivo por m². */
  adhesive?: number;
}

export interface SurfaceDef {
  label: string;
  /** cm de contrapiso. */
  slab?: number;
  tiled?: boolean;
}

export interface RoofDef {
  label: string;
  /** Pendiente habitual, %. */
  slope?: number;
}

export interface Finishes {
  fineThick: number;
  debrisSwell: number;
  container: number;
  upperSlab: number;
  storeyGap: number;
  coarse: number;
  splash: number;
  fine: number;
  fineBag: number;
  board: number;
  membrane: number;
  tilesPerM2: number;
  screwsPerM2: number;
  eave: number;
  sheetWidth: number;
}

export interface StairRules {
  blondel: number;
  blondelMin: number;
  blondelMax: number;
  maxRiser: number;
  minTread: number;
}

export interface BrandData {
  materials: Dict<Material> & { cemento: Binder; cal: Binder };
  mixes: Dict<Mix>;
  bricks: Dict<Brick>;
  cirsoc: CirsocData;
  /** m² que se descuentan por cada puerta y ventana. */
  paint: { door: number; window: number };
  tile: { adhesiveBag: number; adhesive: Dict<number>; groutDensity: number };
  costs: CostData;
  openings: Dict<OpeningDef>;
  openingGroups: Dict<string>;
  roomTypes: string[];
  items: Dict<ItemDef>;
  itemGroups: Dict<string>;
  floors: Dict<FloorDef>;
  surfaces: Dict<SurfaceDef>;
  roofs: Dict<RoofDef>;
  wallTypes: WallType[];
  finishes: Finishes;
  stairs: StairRules;
}
