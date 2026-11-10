/* Boceto a plano: una foto de un dibujo a mano se analiza (lib/sketch.js) y se muestra como vista previa sobre el
   plano; recién al aceptar se convierte en paredes y aberturas. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Point, Wall } from "../types/plan";
import { ops } from "./context";
import { $ } from "./dom";
import { dist, project, round } from "./geometry";
import { nextId, st, type Sketch } from "./state";
import { clampT, fit } from "./viewport";

const sk = () => st.sketch as Sketch;
/** cm del plano por píxel del boceto. */
export const sketchScale = () => sk().width * 100 / Math.max(1, sk().box.x1 - sk().box.x0);
/** Un punto del boceto (en píxeles) en el plano. */
export const sketchPoint = (x: number, y: number): Point => ({ x: sk().origin.x + (x - sk().box.x0) * sketchScale(), y: sk().origin.y + (y - sk().box.y0) * sketchScale() });

/** Barra del boceto: lo que se detectó, el ancho y el detalle. */
export function syncSketch() {
  const root = ops.root;
  ($("[data-sketch-bar]", root) as HTMLElement).hidden = !st.sketch;
  if (!st.sketch) return;
  const sketch = st.sketch, n = sketch.segments.length, count = (kind: string) => sketch.openings.filter((o) => o.kind === kind).length;
  const parts = ([[n, "pared", "paredes"], [count("door"), "puerta", "puertas"], [count("window"), "ventana", "ventanas"], [count("open"), "vano", "vanos"]] as [number, string, string][])
    .filter((p) => p[0]).map((p) => p[0] + " " + (p[0] === 1 ? p[1] : p[2]));
  ($("[data-sketch-count]", root) as HTMLElement).textContent = n ? "Detecté " + parts.slice(0, -1).join(", ") + (parts.length > 1 ? " y " : "") + parts[parts.length - 1] + "."
    : "No encontré trazos rectos. Probá con más detalle o con una foto más nítida y de frente.";
  ($('[data-sketch="width"]', root) as HTMLInputElement).value = E.fmt(sketch.width, 2);
  ($('[data-sketch="detail"]', root) as HTMLInputElement).value = String(sketch.detail);
  ($('[data-action="sketch-apply"]', root) as HTMLButtonElement).disabled = !n;
}

/** Analiza el boceto con el ancho y el detalle elegidos y lo encuadra. */
export function detectSketch() {
  const sketch = sk(), found = window.__BRAND__.sketch!.vectorize(sketch.gray, sketch.w, sketch.h, sketch.detail);
  sketch.segments = found.segments;
  sketch.openings = found.openings;
  sketch.angle = found.angle;
  sketch.box = found.box || { x0: 0, y0: 0, x1: sketch.w, y1: sketch.h };
  const k = sketchScale(), corner = sketchPoint(0, 0), r = st.canvas.getBoundingClientRect(), ratio = r.width && r.height ? r.height / r.width : 0.75;
  st.view.w = Math.max(sketch.w * k, sketch.h * k / ratio) * 1.15; // encuadra el boceto
  st.view.x = corner.x + sketch.w * k / 2 - st.view.w / 2;
  st.view.y = corner.y + sketch.h * k / 2 - st.view.w * ratio / 2;
  syncSketch();
  ops.render();
}

export function readSketch(file: File) {
  const fail = function () { ops.hint.textContent = "No se pudo leer esa imagen."; };
  const reader = new FileReader();
  reader.onerror = fail;
  reader.onload = function () {
    const image = new Image();
    image.onerror = fail;
    image.onload = function () {
      const shrink = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)); // 900 px alcanzan y lo mantienen rápido
      const w = Math.max(1, Math.round(image.naturalWidth * shrink)), h = Math.max(1, Math.round(image.naturalHeight * shrink));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) gray[i] = Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114);
      // Se ubica a la derecha de lo que ya esté dibujado, para no pisarlo.
      const right = st.plan.walls.reduce((m, wall) => Math.max(m, wall.a.x, wall.b.x), -Infinity);
      ops.setTool("select"); // antes de crear el boceto: setTool redibuja y la vista previa todavía no tiene trazos
      // segments, openings, angle y box los completa detectSketch.
      st.sketch = { src: canvas.toDataURL("image/jpeg", 0.8), gray: gray, w: w, h: h, width: 10, detail: 0.05, origin: { x: isFinite(right) ? round(right + 300) : 0, y: 0 } } as Sketch;
      detectSketch();
    };
    image.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

export function cancelSketch() { st.sketch = null; syncSketch(); fit(); ops.render(); }

/** Convierte el boceto en paredes y aberturas; el boceto queda de fondo para comparar. */
export function applySketch() {
  const sketch = sk(), k2 = sketchScale(), corner = sketchPoint(0, 0), before = st.plan.walls.length, steps = st.history.length;
  // Los dos extremos se redondean a la grilla; como las esquinas comparten coordenada, siguen cerradas.
  ops.addWalls(sketch.segments.map(function (s): [Point, Point] {
    const a = sketchPoint(s.x1, s.y1), b = sketchPoint(s.x2, s.y2);
    return [{ x: round(a.x), y: round(a.y) }, { x: round(b.x), y: round(b.y) }];
  }));
  if (st.history.length === steps) ops.pushHistory(); // las paredes ya estaban: igual se suman las aberturas
  // Cada abertura va a la pared de su misma dirección que pasa por su centro, con la medida comercial más cercana.
  let placed = 0;
  sketch.openings.forEach(function (o) {
    const c = sketchPoint(o.x, o.y);
    const host: { wall: Wall; hit: ReturnType<typeof project> } | undefined = st.plan.walls.filter((wl) => (Math.abs(wl.a.y - wl.b.y) < 1) === o.horizontal).map((wl) => ({ wall: wl, hit: project(wl, c) }))
      .filter((q) => q.hit.d <= 20 && q.hit.raw > 0 && q.hit.raw < 1).sort((p, q) => p.hit.d - q.hit.d)[0];
    if (!host) return;
    const width = Math.max(40, Math.round(o.w * k2 / 5) * 5);
    const type = o.kind === "open" ? "vano" : o.kind === "door" ? (width <= 75 ? "p70" : width <= 85 ? "p80" : width <= 125 ? "p90" : "pdoble")
      : ["v100", "v120", "v150", "v180"].reduce((best, key) => Math.abs(D.openings[key].w - width) < Math.abs(D.openings[best].w - width) ? key : best);
    const added = P.opening(nextId(), host.wall.id, host.hit.t, type);
    added.w = width;
    if (o.kind === "door") { // mismo lado y misma bisagra que en el dibujo
      const hinge = sketchPoint(o.hx, o.hy), tip = sketchPoint(o.tx, o.ty), len = dist(host.wall.a, host.wall.b);
      const dx = (host.wall.b.x - host.wall.a.x) / len, dy = (host.wall.b.y - host.wall.a.y) / len;
      added.side = (tip.x - hinge.x) * -dy + (tip.y - hinge.y) * dx < 0;
      added.hinge = (hinge.x - c.x) * dx + (hinge.y - c.y) * dy > 0;
    }
    added.t = clampT(Object.assign({}, added), added.t);
    st.plan.openings.push(added);
    placed++;
  });
  st.plan.ref = { src: sketch.src, ratio: sketch.h / sketch.w, w: Math.round(sketch.w * k2), x: Math.round(corner.x), y: Math.round(corner.y), opacity: 0.35, rot: sketch.angle };
  const added = st.plan.walls.length - before;
  st.sketch = null;
  syncSketch();
  fit();
  ops.commit(null);
  ops.syncSettings();
  ops.hint.textContent = "Se agregaron " + added + " paredes y " + placed + " aberturas. Revisá las medidas: el boceto queda de fondo para comparar y lo quitás desde «Imagen para calcar».";
}
