/* Vista 3D (lib/view3d.js con Three.js) y modo presentación: solo el plano, a pantalla completa, para mostrarlo y
   marcarlo frente al cliente. */
import type { Plan } from "../types/plan";
import { $$ } from "./dom";
import { setTool } from "./edit";
import { render } from "./render";
import { layers, st } from "./state";
import { ui } from "./ui";
import { fit } from "./viewport";

interface View3D {
  open(stage: HTMLElement, plan: Plan, options: { roof?: boolean }): Promise<{ meshes: number }>;
  close(): void;
}

export function showView(mode: string) {
  const on = mode === "3d", view3d = window.__BRAND__.view3d as View3D | undefined, note3d = ui.note3d, stage3d = ui.stage3d;
  $$("[data-view]", ui.root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === mode)));
  stage3d.hidden = !on;
  if (view3d) view3d.close();
  if (!on) { render(); return; }
  note3d.hidden = false;
  if (!st.plan.walls.length) { note3d.textContent = "Dibujá al menos una pared para verla en 3D."; return; }
  if (!view3d) { note3d.textContent = "No se pudo cargar la vista 3D. Recargá la página."; return; }
  note3d.textContent = "Preparando la vista 3D…";
  view3d.open(stage3d, st.plan, { roof: layers().roof }).then(function (info) {
    note3d.hidden = true;
    stage3d.setAttribute("data-meshes", String(info.meshes));
  }, function (e: Error | undefined) {
    console.warn("[3d]", e);
    // Sin WebGL no hay nada que hacer; cualquier otra falla suele ser que no se pudo descargar el motor 3D.
    note3d.textContent = /WebGL/.test(String(e && e.message))
      ? "Este navegador no puede mostrar la vista 3D. El plano y el cómputo siguen funcionando."
      : "No se pudo cargar la vista 3D. Revisá la conexión, recargá la página y probá de nuevo. El plano y el cómputo siguen funcionando.";
  });
}

export function present(on: boolean) {
  const root = ui.root;
  st.presenting = on;
  root.classList.toggle("is-presenting", on);
  document.documentElement.classList.toggle("is-presenting", on);
  try {
    if (on && root.requestFullscreen) root.requestFullscreen().catch(function () { /* sin pantalla completa: igual ocupa toda la ventana */ });
    else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  } catch (e) { /* navegador sin pantalla completa */ }
  setTool(on ? "pan" : "select");
  setTimeout(function () { fit(); render(); }, 120); // el lienzo ya tomó su tamaño nuevo
}
