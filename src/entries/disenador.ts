/* Diseñador de planos: carga los scripts de la página en este orden (cada uno usa lo que dejaron los anteriores en
   window.__BRAND__). Vite los empaqueta en un solo archivo. */
import "../../lib/manifest.js";
import "../../lib/calc.js";
import "../../lib/plan.ts";
import "../../lib/cirsoc.js";
import "../../lib/sketch.js";
import "../../lib/sheets.js";
import "../../lib/dxf.js";
import "../../lib/dxfin.js";
import "../../lib/schedules.js";
import "../../lib/costs.js";
import "../../lib/budget.js";
import "../../lib/apu.js";
import "../../view3d.js";
import "../../docs.js";
import "../../panel.js";
import "../../planner.js";
