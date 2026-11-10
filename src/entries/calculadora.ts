/* Páginas de calculadoras: carga los scripts de la página en este orden (cada uno usa lo que dejaron los anteriores en
   window.__BRAND__). Vite los empaqueta en un solo archivo. */
import "../../lib/manifest.ts";
import "../../lib/calc.ts";
import "../../lib/costs.js";
import "../../lib/apu.js";
import "../../main.js";
