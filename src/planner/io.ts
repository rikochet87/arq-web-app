/* Archivos del diseñador: exportar el plano (SVG, PNG, DXF y JSON) y abrir un plano propio, un DXF de AutoCAD o una
   imagen para calcar. */
import { plan as P } from "../../lib/plan";
import { ops } from "./context";
import { download, fileName } from "./files";
import { st } from "./state";
import { fit } from "./viewport";

const nameFor = (ext: string) => fileName(st.plan.name, ext);

export function exportDrawing(asImage: boolean) {
  if (!st.plan.walls.length) { ops.hint.textContent = "Todavía no hay nada dibujado para exportar."; return; }
  const drawing = P.staticSVG(st.plan, true);
  if (!asImage) { download(nameFor("svg"), new Blob([drawing.svg], { type: "image/svg+xml" })); return; }
  const image = new Image();
  image.onload = function () {
    const canvas = document.createElement("canvas");
    canvas.width = drawing.width; canvas.height = drawing.height;
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(image, 0, 0, drawing.width, drawing.height);
    canvas.toBlob(function (blob) { download(nameFor("png"), blob as Blob); }, "image/png");
  };
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(drawing.svg);
}

export function exportDxf() {
  const dxf = window.__BRAND__.dxf!;
  if (!P.levelsOf(st.plan).some((lv) => lv.walls.length)) { ops.hint.textContent = "Todavía no hay nada dibujado para exportar."; return; }
  download(nameFor("dxf"), new Blob([dxf.build(st.plan)], { type: "application/dxf" }));
  ops.hint.textContent = "DXF descargado: está en metros, con una capa por rubro (" + dxf.layers.join(", ").toLowerCase() + ").";
}

export function exportJson() {
  download(nameFor("json"), new Blob([JSON.stringify(Object.assign({ app: "arqium", version: 1 }, JSON.parse(ops.snapshot())), null, 1)], { type: "application/json" }));
}

export function openPlanFile(file: File) {
  const brand = window.__BRAND__, reader = new FileReader();
  reader.onload = function () {
    const text = reader.result as string;
    let opened = null, read = null;
    try { opened = ops.normalize(JSON.parse(text)); } catch (e) { /* no es JSON */ }
    if (!opened && brand.cad) { // un dibujo de AutoCAD: se deducen los muros y las aberturas
      try {
        // Si el archivo trae cortes y vistas, se toma el dibujo que parece la planta; los cercos quedan afuera.
        const cad = brand.cad, drawing = cad.read(text), sh = cad.sheets ? cad.sheets(drawing) : { planta: -1, regions: [], unit: undefined };
        // La planta de techos y los cortes del mismo archivo dan las alturas de las losas y los parapetos.
        const techo = sh.planta >= 0 && sh.regions.find(function (r) { return r.kind === "techo"; }), levels: number[] = [];
        if (techo) sh.regions.forEach(function (r) { if (r.kind === "corte" || r.kind === "vista") cad.levelsIn(drawing, r.box).forEach(function (l) { levels.push(l.v); }); });
        read = cad.toPlan(drawing, sh.planta >= 0 ? { box: sh.regions[sh.planta].box, unit: sh.unit, heights: techo ? { techo: { drawing: drawing, box: techo.box }, levels: levels } : null } : {});
        opened = ops.normalize(read.plan);
      } catch (e) { /* tampoco es un DXF que se pueda leer */ }
    }
    if (!opened) { ops.hint.textContent = "Ese archivo no es un plano de " + (brand.name || "este sitio") + " ni un DXF con muros que se puedan leer."; return; }
    ops.pushHistory();
    st.plan = opened; st.chain = null;
    fit(); ops.commit(null); ops.syncSettings(); ops.setTool("select");
    if (read) ops.hint.textContent = "DXF abierto: " + read.stats.walls + " muros y " + (read.stats.doors + read.stats.windows + read.stats.opens) + " aberturas deducidos del dibujo. Revisalos; con Deshacer volvés al plano anterior.";
  };
  reader.readAsText(file);
}

export function openRefImage(file: File) {
  const reader = new FileReader();
  reader.onload = function () {
    const image = new Image();
    image.onload = function () {
      const w = Math.round(st.view.w * 0.7);
      st.plan.ref = { src: reader.result as string, ratio: image.naturalHeight / image.naturalWidth, w: w, x: Math.round(st.view.x + st.view.w * 0.15), y: Math.round(st.view.y + st.view.h * 0.12), opacity: 0.5 };
      ops.save(); ops.syncSettings(); ops.render();
    };
    image.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}
