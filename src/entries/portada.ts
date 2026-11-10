/* Portada (vista previa del plano, DXF y render): carga los scripts de la página en este orden (cada uno usa lo que dejaron los anteriores en
   window.__BRAND__). Vite los empaqueta en un solo archivo. */
import "../../lib/manifest.ts";
import "../../lib/calc.ts";
import "../../lib/plan.ts";
import "../../lib/dxfin.js";
import "../../view3d.js";
import "../../render.js";
import "../../cad.js";
