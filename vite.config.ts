/* Build del sitio con Vite.
   Cada página HTML de la raíz es una entrada. Los scripts actuales son clásicos (no módulos) y Vite no los
   empaqueta: el plugin "scripts-clasicos" los copia tal cual a dist/, con las mismas rutas, para que el sitio
   publicado funcione igual que antes. A medida que cada archivo pase a TypeScript y a módulo, sale de esta copia
   y lo empaqueta Vite. */
import { createLogger, defineConfig, type Plugin } from "vite";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dirname;
const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));

// Scripts locales que cargan las páginas con <script src> (sin type="module").
function classicScripts(): string[] {
  const found = new Set<string>();
  for (const page of pages) {
    const html = readFileSync(resolve(ROOT, page), "utf8");
    for (const m of html.matchAll(/<script(?![^>]*type="module")[^>]*\ssrc="([^"?#:]+\.js)/g)) found.add(m[1]);
  }
  return [...found];
}

function copyClassicScripts(): Plugin {
  return {
    name: "scripts-clasicos",
    apply: "build",
    closeBundle() {
      const out = resolve(ROOT, "dist");
      for (const file of classicScripts()) cpSync(resolve(ROOT, file), resolve(out, file));
      // El motor 3D lo descarga view3d.js en el momento, desde lib/vendor/three.
      cpSync(resolve(ROOT, "lib/vendor"), resolve(out, "lib/vendor"), { recursive: true });
    }
  };
}

// Vite avisa por cada script clásico que no puede empaquetar; esos los copia el plugin de arriba.
const logger = createLogger();
const warn = logger.warn;
logger.warn = (msg, options) => {
  if (msg.includes("can't be bundled without type=\"module\" attribute")) return;
  warn(msg, options);
};

export default defineConfig({
  base: "./", // rutas relativas: el sitio funciona en la raíz del dominio, en una subcarpeta o abierto desde el disco
  customLogger: logger,
  plugins: [copyClassicScripts()],
  server: { port: 8137 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((f) => [f.replace(/\.html$/, ""), resolve(ROOT, f)]))
    }
  }
});
