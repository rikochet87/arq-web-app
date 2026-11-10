/* window.__BRAND__: el espacio común donde cada script del sitio deja lo suyo (datos de obra, fórmulas, plano…).
   Los scripts que siguen en JavaScript lo leen de acá; los que pasan a TypeScript además exportan sus funciones.
   Lo crea lib/manifest.ts con los datos de obra; lib/calc.ts le suma el motor de cálculo. */
import type { engine } from "../../lib/calc";
import type { plan } from "../../lib/plan";
import type { BrandData } from "./data";
import type { Plan } from "./plan";

export type { BrandData };
/** Fórmulas de lib/calc.ts. */
export type BrandEngine = typeof engine;

/** Renglón de un resultado del cómputo: "Muros exteriores" → "30,0 m · 78,0 m²". */
export interface Row {
  label: string;
  value: string;
}

/** Bloque del cómputo con su título. */
export interface ResultSection {
  title: string;
  rows: Row[];
}

/** Lo que devuelve la verificación CIRSOC (lib/cirsoc.js). */
export interface CirsocReview {
  checks: unknown[];
  sections: ResultSection[];
  materials: Record<string, number>;
  ties?: unknown;
}

export interface Brand {
  name: string;
  tagline: string;
  data: BrandData;
  engine: BrandEngine;
  plan?: typeof plan;
  cirsoc?: { review(plan: Plan, context: unknown): CirsocReview };
  [key: string]: unknown;
}

declare global {
  interface Window {
    __BRAND__: Brand;
  }
}
