/* window.__BRAND__: el espacio común donde cada script del sitio deja lo suyo (datos de obra, fórmulas, plano…).
   Los scripts que siguen en JavaScript lo leen de acá; los que pasan a TypeScript además exportan sus funciones.
   data y engine se tiparán cuando lib/manifest.js y lib/calc.js pasen a TypeScript. */
import type { plan } from "../../lib/plan";
import type { Plan } from "./plan";

/** Datos de obra de lib/manifest.js: ladrillos, morteros, aberturas, muebles, pisos, cubiertas… */
export type BrandData = any;
/** Fórmulas de lib/calc.js. */
export type BrandEngine = any;

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
