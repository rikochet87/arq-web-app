/* Presupuesto de obra: carga los scripts de la página en este orden (cada uno usa lo que dejaron los anteriores en
   window.__BRAND__). Vite los empaqueta en un solo archivo. */
import "../../lib/manifest.js";
import "../../lib/calc.js";
import "../../lib/rubros.js";
import "../../lib/costs.js";
import "../../lib/apu.js";
import "../../presupuesto.js";
