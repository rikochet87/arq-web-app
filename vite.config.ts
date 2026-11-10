/* Build del sitio con Vite.
   Cada página HTML de la raíz es una entrada y carga un solo módulo de src/entries/, que importa los scripts de la
   página en orden; Vite los empaqueta y les pone un hash en el nombre para que los navegadores tomen siempre la
   versión nueva. El motor 3D (lib/vendor/three) no se empaqueta: view3d.js lo descarga recién cuando se abre la
   vista 3D, así que el plugin "motor-3d" lo copia tal cual a dist/. */
import { defineConfig, type Plugin } from "vite";
import { cpSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dirname;
const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));

function copyEngine(): Plugin {
  return {
    name: "motor-3d",
    apply: "build",
    closeBundle() {
      cpSync(resolve(ROOT, "lib/vendor"), resolve(ROOT, "dist/lib/vendor"), { recursive: true });
    }
  };
}

export default defineConfig({
  base: "./", // rutas relativas: el sitio funciona en la raíz del dominio o en una subcarpeta
  plugins: [copyEngine()],
  server: { port: 8137 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((f) => [f.replace(/\.html$/, ""), resolve(ROOT, f)]))
    }
  }
});
