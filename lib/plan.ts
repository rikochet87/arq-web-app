/* CalcuObra — plano de vivienda: geometría y cómputo. Sin DOM. Todas las medidas en cm.
   Plano = { walls: [{id, a:{x,y}, b:{x,y}, type}] (type: id del tipo de muro en wallTypes; sin type usa el de su clase en los ajustes),
             wallTypes: [{id, name, brick, ext, int}] (tipos de muro del plano, ver "Tipos de muro"), openings: [{id, wall, t, type, w, h, side, hinge}],
             items: [{id, type, x, y, r, w, d}] (muebles, artefactos y bocas; x, y = centro; r = giro en grados),
             labels: [{x, y, name, floor}], settings,
             wires: [{id, a, b}] (cables entre dos bocas, por id de objeto), surfaces: [{id, x, y, w, h, type}] (exteriores),
             section: {a, b} (línea de corte), levels: [{name, walls, openings, items, labels, wires, surfaces}], level }.
   Con varias plantas, walls/openings/items/labels son siempre los de la planta activa (level);
   las demás se guardan en levels. La entrada de la planta activa dentro de levels puede estar desactualizada.
   t es la posición del centro de la abertura a lo largo de su pared (0 = extremo a, 1 = extremo b).
   type es una clave de la biblioteca data.openings. Cada label nombra al ambiente que contiene su punto y le asigna un piso.
   Los tipos del modelo están en src/types/plan.ts. El módulo exporta sus funciones (plan) y además las deja en
   window.__BRAND__.plan para los scripts que siguen en JavaScript. */

import type { Id, Item, LevelContent, LevelData, Note, Opening, Phase, Plan, Point, Section, Settings, Wall, WallFace, WallType } from "../src/types/plan";
import type { ResultSection, Row } from "../src/types/brand";

type Dict<T> = Record<string, T>;
/** Clase de un muro: con ambientes de los dos lados es interior; si no, exterior. */
type Cls = "ext" | "int";
/** Ajustes de obra completos, con los tipos de muro del plano adjuntos (lo que devuelve settingsOf). */
export type FullSettings = Settings & { types: Dict<WallType> };
/** Punto con altura, en cm. */
export interface Point3 extends Point {
  z: number;
}

const B = window.__BRAND__;
const D = B.data, E = B.engine;

// ext / int: tipo de muro por defecto de cada clase (id de plan.wallTypes). Planos viejos guardaban acá una clave de ladrillo.
const DEFAULTS: Settings = { height: 260, ext: "ext-portante18", int: "int-hueco8", slab: 10, screed: 2, coats: 2, ceiling: true, roof: "chapa", system: "portante", zone: "0", mortar: "mI" };
const WASTE = 1.05;        // ladrillos, mortero, contrapiso y carpeta
const TILE_WASTE = 1.1;    // piso
const PAINT_YIELD = 8;     // m² por litro y por mano (1 L a dos manos ≈ 4 m²)
const MIN_ROOM = 5000;     // cm²: por debajo de 0,5 m² no se considera ambiente

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const key = (p: Point) => Math.round(p.x) + "," + Math.round(p.y);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const at = (w: { a: Point; b: Point }, t: number): Point => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
const hex = (c?: string): string => /^#[0-9a-f]{6}$/i.test(c || "") ? c as string : ""; // único formato de color que se acepta de un archivo
const typeOf = (o: { type?: string; kind?: string }) => D.openings[o.type as string] || D.openings[o.kind === "window" ? "v120" : "p80"]; // kind: planos guardados antes de la biblioteca

/* ---------- Tipos de muro ----------
   plan.wallTypes = [{ id, name, brick, ext: {azotado, grueso, fino}, int: {azotado, grueso, fino} }]: los tipos del plano.
   Un muro guarda en type el id de su tipo; sin type usa el de su clase (settings.ext o settings.int).
   Planos guardados antes de los tipos tienen en esos lugares una clave de ladrillo: migrateWalls los convierte,
   y mientras tanto resolveType los toma como un muro de ese ladrillo revocado como siempre. */
const FACE_LIMIT = 5; // cm por capa
const STD = { ext: { azotado: 0.5, grueso: 1.5, fino: true }, int: { azotado: 0, grueso: 1.5, fino: true } };
const layerCm = (v: unknown) => { const x = Number(v); return isFinite(x) ? Math.round(Math.max(0, Math.min(FACE_LIMIT, x)) * 10) / 10 : 0; };
// any: datos sin validar, leídos de un archivo
const cleanFace = (f: any, std: WallFace): WallFace => (f && typeof f === "object" ? { azotado: layerCm(f.azotado), grueso: layerCm(f.grueso), fino: !!f.fino } : Object.assign({}, std));
// any: datos sin validar, leídos de un archivo
function cleanType(t: any): WallType | null {
  if (!t || typeof t !== "object" || !t.id) return null;
  const brick = D.bricks[t.brick] ? t.brick : "hueco8";
  return { id: String(t.id).slice(0, 40), name: String(t.name || D.bricks[brick].label).slice(0, 60), brick: brick, ext: cleanFace(t.ext, STD.ext), int: cleanFace(t.int, STD.int) };
}
const faceThick = (f: WallFace): number => f.azotado + f.grueso + (f.fino ? D.finishes.fineThick : 0);
// Espesor terminado según la clase: interior = dos caras a ambientes; exterior = una de cada; aislado = dos caras afuera.
const typeThick = (t: WallType, cls: string): number => D.bricks[t.brick].e + (cls === "int" ? 2 * faceThick(t.int) : faceThick(t.ext) + faceThick(t.int));
function wallTypeList(plan: { wallTypes?: WallType[] }): WallType[] {
  const list: WallType[] = Array.isArray(plan.wallTypes) && plan.wallTypes.length ? plan.wallTypes : D.wallTypes;
  const seen: Dict<boolean> = {};
  return list.map(cleanType).filter(function (t): t is WallType { if (!t || seen[t.id]) return false; seen[t.id] = true; return true; });
}
function wallTypesOf(plan: { wallTypes?: WallType[] }): Dict<WallType> {
  const map: Dict<WallType> = {};
  wallTypeList(plan).forEach(function (t) { map[t.id] = t; });
  return map;
}
const legacyType = (brick: string): WallType => ({ id: brick, name: D.bricks[brick].label, brick: brick, ext: Object.assign({}, STD.ext), int: Object.assign({}, STD.int) });
const resolveType = (types: Dict<WallType>, key?: string): WallType | null => key === undefined ? null : types[key] || (D.bricks[key] ? legacyType(key) : null);
const sameFace = (a: WallFace, b: WallFace) => a.azotado === b.azotado && a.grueso === b.grueso && a.fino === b.fino;

// Pasa un plano viejo (ladrillo por muro) a tipos de muro. Cambia el plano y devuelve si tocó algo.
function migrateWalls(plan: Partial<Plan>): boolean {
  let changed = false;
  if (!Array.isArray(plan.wallTypes) || !plan.wallTypes.length) { plan.wallTypes = JSON.parse(JSON.stringify(D.wallTypes)); changed = true; }
  const types = plan.wallTypes = wallTypeList(plan);
  const ids: Dict<boolean> = {};
  types.forEach(function (t) { ids[t.id] = true; });
  const idFor = function (brick: string) {
    const found = types.find(function (t) { return t.brick === brick && sameFace(t.ext, STD.ext) && sameFace(t.int, STD.int); });
    if (found) return found.id;
    let id = "m-" + brick, n = 2;
    while (ids[id]) id = "m-" + brick + "-" + n++;
    ids[id] = true;
    types.push(Object.assign(legacyType(brick), { id: id, name: "Muro de " + D.bricks[brick].label.toLowerCase() }));
    return id;
  };
  const fix = function (w: Wall) {
    if (w.type === undefined || ids[w.type]) return;
    if (D.bricks[w.type]) w.type = idFor(w.type); else delete w.type;
    changed = true;
  };
  const settings = plan.settings = plan.settings || {};
  (["ext", "int"] as const).forEach(function (cls) {
    const v = settings[cls];
    if (v === undefined || ids[v]) return;
    if (D.bricks[v]) settings[cls] = idFor(v); else delete settings[cls];
    changed = true;
  });
  (plan.walls || []).forEach(fix);
  (plan.levels || []).forEach(function (lv) { (lv.walls || []).forEach(fix); });
  (plan.variants || []).forEach(function (v) { (v.levels || []).forEach(function (lv) { (lv.walls || []).forEach(fix); }); });
  return changed;
}

const polyArea = (pts: Point[]) => pts.reduce(function (a, p, i) { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;

function inside(points: Point[], p: Point): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/* Convierte las paredes dibujadas en un grafo plano: las corta donde se tocan o se cruzan
   y recorre las caras. Cada cara acotada es un ambiente. */
/* Grafo de los muros: nodos (esquinas y cruces), aristas (tramos de muro entre nodos), medias aristas y caras. */
interface TNode extends Point {
  out: Half[];
}
interface TEdge {
  u: number;
  v: number;
  wall: Id;
  t0: number;
  t1: number;
  len: number;
  /** Cuántos lados del tramo dan a un ambiente: 0, 1 o 2. */
  sides: number;
}
interface Half {
  from: number;
  to: number;
  edge: number;
  twin: Half;
  angle: number;
  idx: number;
  face?: number;
}
interface Face {
  loop: Half[];
  area: number;
}
/** Tramo de muro después de survey(): con su clase, fase, tipo y espesores. */
interface WallEdge extends TEdge {
  cls: Cls;
  phase: "nueva" | "existente";
  wt: string;
  brick: string;
  core: number;
  thick: number;
}

function topology(walls: Wall[]) {
  const segs = walls.filter(function (w) { return dist(w.a, w.b) >= 1; });
  const cuts = segs.map(function () { return [0, 1]; });

  function onto(i: number, p: Point) {
    const w = segs[i], rx = w.b.x - w.a.x, ry = w.b.y - w.a.y, len2 = rx * rx + ry * ry;
    const t = ((p.x - w.a.x) * rx + (p.y - w.a.y) * ry) / len2;
    if (t > 0 && t < 1 && dist(at(w, t), p) < 0.5) cuts[i].push(t);
  }

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i].a, q = segs[j].a;
      const rx = segs[i].b.x - p.x, ry = segs[i].b.y - p.y, sx = segs[j].b.x - q.x, sy = segs[j].b.y - q.y;
      const lenI = Math.hypot(rx, ry), lenJ = Math.hypot(sx, sy);
      const den = rx * sy - ry * sx;
      if (Math.abs(den) > 1e-6 * lenI * lenJ) {
        const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
        const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
        const et = 0.5 / lenI, eu = 0.5 / lenJ;
        if (t > -et && t < 1 + et && u > -eu && u < 1 + eu) { cuts[i].push(clamp01(t)); cuts[j].push(clamp01(u)); }
      } else { // paralelas: si están en la misma línea, cada una se corta en los extremos de la otra
        onto(i, segs[j].a); onto(i, segs[j].b); onto(j, segs[i].a); onto(j, segs[i].b);
      }
    }
  }

  const nodes: TNode[] = [], index: Dict<number> = {}, edges: TEdge[] = [], seen: Dict<boolean> = {};
  function nodeAt(p: Point) {
    const k = key(p);
    if (!(k in index)) { index[k] = nodes.length; nodes.push({ x: p.x, y: p.y, out: [] }); }
    return index[k];
  }
  segs.forEach(function (w, i) {
    const ts = cuts[i].sort(function (a, b) { return a - b; });
    let prevT = ts[0], prev = nodeAt(at(w, prevT));
    for (let k = 1; k < ts.length; k++) {
      const n = nodeAt(at(w, ts[k]));
      if (n === prev) continue;
      const id = Math.min(prev, n) + "-" + Math.max(prev, n);
      if (!seen[id]) {
        seen[id] = true;
        edges.push({ u: prev, v: n, wall: w.id, t0: prevT, t1: ts[k], len: dist(nodes[prev], nodes[n]), sides: 0 });
      }
      prev = n; prevT = ts[k];
    }
  });

  // Medias aristas ordenadas por ángulo en cada nodo; girando siempre hacia el mismo lado
  // se recorre cada cara. Las caras acotadas dan área positiva y la exterior, negativa.
  const halves: Half[] = [];
  edges.forEach(function (e, i) {
    const a = { from: e.u, to: e.v, edge: i } as Half, b = { from: e.v, to: e.u, edge: i } as Half;
    a.twin = b; b.twin = a;
    halves.push(a, b);
    nodes[e.u].out.push(a); nodes[e.v].out.push(b);
  });
  nodes.forEach(function (n) {
    n.out.forEach(function (h) { h.angle = Math.atan2(nodes[h.to].y - n.y, nodes[h.to].x - n.x); });
    n.out.sort(function (a, b) { return a.angle - b.angle; });
    n.out.forEach(function (h, i) { h.idx = i; });
  });
  const faces: Face[] = [];
  halves.forEach(function (start) {
    if (start.face !== undefined) return;
    const loop: Half[] = [];
    let h = start, area = 0, guard = halves.length + 1;
    do {
      h.face = faces.length;
      loop.push(h);
      area += nodes[h.from].x * nodes[h.to].y - nodes[h.to].x * nodes[h.from].y;
      const out = nodes[h.to].out;
      h = out[(h.twin.idx - 1 + out.length) % out.length];
    } while (h !== start && guard--);
    faces.push({ loop: loop, area: area / 2 });
  });
  edges.forEach(function (e, i) {
    e.sides = (faces[halves[2 * i].face!].area > MIN_ROOM ? 1 : 0) + (faces[halves[2 * i + 1].face!].area > MIN_ROOM ? 1 : 0);

  });

  return { nodes: nodes, edges: edges, faces: faces };
}

/* ---------- Fases (como las de Revit): para ampliaciones y refacciones ----------
   phase en muros y aberturas: sin valor = a construir; "existente" = se conserva; "demoler" = existente que se demuele.
   Una abertura sin fase propia hereda la de su muro; con "nueva" es un vano nuevo abierto en un muro existente.
   El estado "obra" (el de siempre) es como queda la vivienda terminada: sin lo demolido. El cómputo cuenta solo
   lo nuevo y suma la demolición. El estado "actual" es la vivienda antes de la obra: existente y a demoler. */
const PHASES = { nueva: "A construir", existente: "Existente", demoler: "Existente a demoler" };
const wallPhase = (w: { phase?: Phase }): Phase => w.phase === "existente" || w.phase === "demoler" ? w.phase : "nueva";
function openingPhase(o: Opening, wall?: Wall): Phase {
  if (o.phase === "nueva" || o.phase === "existente" || o.phase === "demoler") return wall && wallPhase(wall) === "demoler" ? "demoler" : o.phase;
  return wall ? wallPhase(wall) : "nueva";
}
const isOld = (phase: Phase) => phase === "existente" || phase === "demoler";
// Deja en una planta solo lo que existe en el estado pedido.
function phaseLevel(level: LevelData, state?: "actual"): LevelData {
  const walls = level.walls.filter(function (w) { return state === "actual" ? isOld(wallPhase(w)) : wallPhase(w) !== "demoler"; });
  const alive: Dict<Wall> = {};
  walls.forEach(function (w) { alive[w.id] = w; });
  const openings = level.openings.filter(function (o) {
    const ph = openingPhase(o, alive[o.wall]);
    return alive[o.wall] && (state === "actual" ? isOld(ph) : ph !== "demoler");
  });
  return Object.assign({}, level, { walls: walls, openings: openings });
}
// ¿El plano tiene algo existente? Sin existente, todo funciona como obra nueva.
function hasPhases(plan: Plan): boolean {
  return levelsOf(plan, "todo").some(function (lv) { return lv.walls.some(function (w) { return isOld(wallPhase(w)); }); });
}

const LEVEL_NAMES = ["Planta baja", "Planta alta", "Segundo piso", "Tercer piso"];
const LEVEL_FIELDS: (keyof LevelContent)[] = ["walls", "openings", "items", "labels", "wires", "surfaces", "notes"]; // lo que es propio de cada planta

/* Lista de plantas, con la activa tomada de los campos de trabajo del plano.
   state: sin valor = vivienda terminada (sin lo demolido); "actual" = antes de la obra; "todo" = tal como está guardado. */
function levelsOf(plan: Plan, state?: "actual" | "todo"): LevelData[] {
  const list = plan.levels && plan.levels.length ? plan.levels : [{ name: LEVEL_NAMES[0] }];
  const active = Math.min(plan.level || 0, list.length - 1);
  return list.map(function (lv, i) {
    const src: Partial<LevelContent> = i === active ? plan : lv;
    const level = { name: lv.name || LEVEL_NAMES[i] } as LevelData;
    LEVEL_FIELDS.forEach(function (f) { (level as unknown as Dict<unknown>)[f] = src[f] || []; });
    return state === "todo" ? level : phaseLevel(level, state);
  });
}

// Mide una planta: muros, aberturas, ambientes y objetos. Devuelve números sin formato.
/* Altura de un muro en cm, en el punto t (0 en a, 1 en b): la de su tramo (wall.hs: [{t0, t1, h}], cuando cambia a lo
   largo, como el muro que es parapeto de un lado y tabique bajo la losa del otro), la suya (wall.h) o la de la planta. */
const wallHeight = function (w: Wall | undefined, s: Settings, t?: number): number {
  if (w && w.hs && t !== undefined) { const part = w.hs.find(function (p) { return t >= p.t0 - 1e-6 && t <= p.t1 + 1e-6; }); if (part) return part.h; }
  return w && w.h && w.h > 0 ? w.h : s.height;
};

/** Ambiente: una cara cerrada del grafo de muros, con su superficie útil (m²), centro y lo que dice su etiqueta. */
export interface Room {
  phase: "nueva" | "existente";
  points: Point[];
  area: number;
  cx: number;
  cy: number;
  name: string;
  floor: string;
  color: string;
}
/** Tramo de muro medido: extremos, clase, espesores y tipo. Lo usan el dibujo, el corte, el 3D y el CIRSOC. */
export interface SurveyEdge {
  a: Point;
  b: Point;
  t: number;
  cls: Cls;
  thick: number;
  core: number;
  wt: string;
  wall: Id;
  brick: string;
  phase: "nueva" | "existente";
}
interface TypeSum {
  name: string;
  thick: Partial<Record<Cls, number>>;
  len: number;
  area: number;
}
export type Survey = ReturnType<typeof survey>;

// bricks ya no se usa: se conserva el parámetro porque así lo llaman los demás scripts.
function survey(level: LevelData, s: FullSettings, _bricks?: unknown) {
  const topo = topology(level.walls), edges = topo.edges as WallEdge[];
  const walls = { ext: { len: 0, area: 0 }, int: { len: 0, area: 0 } }, count: Dict<number> = { door: 0, window: 0 };
  const wallThick: Dict<number> = {}, placed: Dict<boolean> = {}, openingList: Dict<number> = {}, bills: Dict<Dict<number>> = {};
  let paintArea = 0, doorLen = 0;

  // Un muro con ambientes de los dos lados es interior; con uno solo (o ninguno), exterior.
  // Cada muro usa su propio tipo si lo tiene; si no, el tipo por defecto de su clase.
  const types = s.types || wallTypesOf({}), own: Dict<WallType> = {}, byBrick: Dict<number> = {}, byType: Dict<TypeSum> = {};
  const lib = wallTypesOf({});
  const fallback: Record<Cls, WallType> = {
    ext: resolveType(types, s.ext) || types[DEFAULTS.ext] || lib[DEFAULTS.ext],
    int: resolveType(types, s.int) || types[DEFAULTS.int] || lib[DEFAULTS.int]
  };
  const finish = { azotado: { area: 0, vol: 0 }, grueso: { area: 0, vol: 0 }, fino: { area: 0 } };
  const byId: Dict<Wall> = {}, workBrick: Dict<number> = {};
  level.walls.forEach(function (w) { byId[w.id] = w; const t = resolveType(types, w.type); if (t) own[w.id] = t; });
  edges.forEach(function (e) {
    e.cls = e.sides === 2 ? "int" : "ext";
    e.phase = wallPhase(byId[e.wall] || {}) === "nueva" ? "nueva" : "existente";
    const isNew = e.phase === "nueva"; // el cómputo cuenta solo la obra nueva
    const wt = own[e.wall] || fallback[e.cls];
    e.wt = wt.id;
    e.brick = wt.brick;
    e.core = D.bricks[e.brick].e;              // espesor del ladrillo: el que vale para el CIRSOC
    e.thick = typeThick(wt, e.cls);             // espesor terminado: el que se dibuja y se descuenta de los ambientes
    wallThick[e.wall] = Math.max(wallThick[e.wall] || 0, e.thick);
    let open = 0;
    level.openings.forEach(function (o) {
      if (placed[o.id] || o.wall !== e.wall || o.t < e.t0 - 1e-9 || o.t > e.t1 + 1e-9) return;
      placed[o.id] = true;
      open += Math.min(o.w, e.len) * Math.min(o.h, s.height) / 1e4;
      if (openingPhase(o, byId[o.wall]) !== "nueva") return; // las aberturas existentes no se compran
      const def = typeOf(o), name = def.label + " · " + E.fmt(o.w / 100, 2) + " × " + E.fmt(o.h / 100, 2) + " m";
      count[def.group]++;
      if (def.group === "door") doorLen += Math.min(o.w, e.len) / 100 * e.sides;
      openingList[name] = (openingList[name] || 0) + 1;
    });
    const net = Math.max(0, e.len / 100 * (wallHeight(byId[e.wall], s, (e.t0 + e.t1) / 2) / 100) - open); // un muro puede tener su propia altura (wall.h)
    byBrick[e.brick] = (byBrick[e.brick] || 0) + net; // todos los muros en pie: es lo que carga la estructura
    if (!isNew) return;
    walls[e.cls].len += e.len / 100;
    walls[e.cls].area += net;
    workBrick[e.brick] = (workBrick[e.brick] || 0) + net;
    byType[wt.id] = byType[wt.id] || { name: wt.name, thick: {}, len: 0, area: 0 };
    byType[wt.id].len += e.len / 100; byType[wt.id].area += net; byType[wt.id].thick[e.cls] = e.thick;
    // Revoques capa por capa: cada cara que da a un ambiente lleva la terminación interior; las que dan afuera, la exterior.
    (e.sides === 2 ? [wt.int, wt.int] : e.sides === 1 ? [wt.ext, wt.int] : [wt.ext, wt.ext]).forEach(function (f) {
      if (f.azotado) { finish.azotado.area += net; finish.azotado.vol += net * f.azotado / 100; }
      if (f.grueso) { finish.grueso.area += net; finish.grueso.vol += net * f.grueso / 100; }
      if (f.fino) finish.fino.area += net;
    });
    paintArea += net * e.sides; // solo caras que dan a un ambiente
  });

  const rooms = topo.faces.filter(function (f) { return f.area > MIN_ROOM; }).map(function (f, i) {
    let net = f.area, cx = 0, cy = 0;
    f.loop.forEach(function (h) {
      const a = topo.nodes[h.from], b = topo.nodes[h.to], c = a.x * b.y - b.x * a.y;
      cx += (a.x + b.x) * c; cy += (a.y + b.y) * c;
      net -= edges[h.edge].len * edges[h.edge].thick / 2; // medio espesor de cada muro
    });
    const points = f.loop.map(function (h) { return { x: topo.nodes[h.from].x, y: topo.nodes[h.from].y }; });
    const tag = level.labels.find(function (l) { return inside(points, l); });
    const room: Room = {
      phase: f.loop.every(function (h) { return edges[h.edge].phase === "existente"; }) ? "existente" : "nueva", // ambiente ya construido o nuevo
      points: points, area: Math.max(0, net) / 1e4, cx: cx / (6 * f.area), cy: cy / (6 * f.area),
      name: tag && tag.name ? tag.name : "Ambiente " + (i + 1), floor: tag && tag.floor && D.floors[tag.floor] ? tag.floor : "ceramico", color: tag ? hex(tag.color) : ""
    };
    return room;
  });
  level.items.forEach(function (it) {
    const def = D.items[it.type];
    if (!def || !def.bill) return;
    bills[def.bill] = bills[def.bill] || {};
    bills[def.bill][def.label] = (bills[def.bill][def.label] || 0) + 1;
  });

  // Cableado: recorrido en planta más la bajada desde el techo hasta la altura de cada boca.
  let conduit = 0;
  level.wires.forEach(function (wire) {
    const from = level.items.find(function (it) { return it.id === wire.a; }), to = level.items.find(function (it) { return it.id === wire.b; });
    if (!from || !to) return;
    conduit += dist(from, to) / 100;
    [from, to].forEach(function (it) { conduit += Math.max(0, s.height - (D.items[it.type].mount || 0)) / 100; });
  });
  const outdoor: Dict<number> = {};
  level.surfaces.forEach(function (sf) {
    const key = D.surfaces[sf.type] ? sf.type : "patio";
    outdoor[key] = (outdoor[key] || 0) + sf.w * sf.h / 1e4;
  });

  // Lo nuevo: los ambientes que tienen al menos un muro a construir llevan contrapiso, piso, cielorraso y techo.
  const fresh = rooms.filter(function (r) { return r.phase === "nueva"; });
  const work = {
    floor: fresh.reduce(function (sum, r) { return sum + r.area; }, 0),
    perimeter: fresh.reduce(function (sum, r) { return sum + r.points.reduce(function (q, p, i) { return q + dist(p, r.points[(i + 1) % r.points.length]); }, 0); }, 0) / 100,
    footprint: fresh.reduce(function (sum, r) { return sum + Math.abs(polyArea(r.points)); }, 0) / 1e4,
    byBrick: workBrick
  };
  return {
    work: work,
    conduit: conduit, outdoor: outdoor, byBrick: byBrick, byType: byType, finish: finish,
    walls: walls, count: count, openingList: openingList, bills: bills, paintArea: paintArea, doorLen: doorLen, rooms: rooms, wallThick: wallThick,
    floor: rooms.reduce(function (sum, r) { return sum + r.area; }, 0),
    perimeter: rooms.reduce(function (sum, r) {
      return sum + r.points.reduce(function (q, p, i) { return q + dist(p, r.points[(i + 1) % r.points.length]); }, 0);
    }, 0) / 100,
    footprint: topo.faces.reduce(function (sum, f) { return sum + (f.area > MIN_ROOM ? f.area : 0); }, 0) / 1e4,
    edges: edges.map(function (e): SurveyEdge { return { a: topo.nodes[e.u], b: topo.nodes[e.v], t: (e.t0 + e.t1) / 2, cls: e.cls, thick: e.thick, core: e.core, wt: e.wt, wall: e.wall, brick: e.brick, phase: e.phase }; })
  };
}

const merge = function (into: Dict<number>, from: Dict<number>) {
 for (const k in from) into[k] = (into[k] || 0) + from[k]; return into; };

/* Control (plano de ejemplo, 8 × 7 m con 5 ambientes): 30 m de muro exterior y 18,5 m de
   muro interior. Superficie útil = 56 m² menos lo que ocupan los muros terminados (con revoques) ≈ 50,3 m².
   Con varias plantas se suman todas, con estas reglas: contrapiso grueso y capa aisladora solo en
   planta baja; sobre losa va un contrapiso fino; la cubierta cubre la planta más grande; las plantas
   que tienen otra encima llevan cielorraso aplicado bajo la losa de entrepiso. */
/* Control de fases (plano de ejemplo todo existente, se demuele el tabique de 4,5 m entre living y cocina
   y se amplía con un estudio de 4 × 3 m): demolición = 4,5 × 2,6 − vano 0,9 × 2 = 9,9 m² × 0,116 m = 1,15 m³;
   muros nuevos 11 m × 2,6 = 28,6 m²; contrapiso solo del estudio. */
function compute(plan: Plan) {
  const s = settingsOf(plan), F = D.finishes, roof = D.roofs[s.roof] ? s.roof : "none";
  const bricks = bricksOf(s);
  const levels = levelsOf(plan), active = Math.min(plan.level || 0, levels.length - 1), top = levels.length - 1;
  const sv = levels.map(function (lv) { return survey(lv, s, bricks); });
  const phased = hasPhases(plan);
  const fmt: (x: number, digits: number) => string = E.fmt, m2 = function (x: number) { return fmt(x, 1) + " m²"; }, m3 = function (x: number) { return fmt(x, 2) + " m³"; };

  const walls = { ext: { len: 0, area: 0 }, int: { len: 0, area: 0 } }, count = { door: 0, window: 0 }, openingList: Dict<number> = {}, bills: Dict<Dict<number>> = {}, byFloor: Dict<number> = {};
  const roomRows: Row[] = [], slabRows: Row[] = [], outdoor: Dict<number> = {}, byBrick: Dict<number> = {}, byType: Dict<TypeSum> = {};
  const fin = { azotado: { area: 0, vol: 0 }, grueso: { area: 0, vol: 0 }, fino: { area: 0 } };
  // useful: superficie útil de toda la vivienda (se informa). floor, perimeter: solo lo nuevo (se computa).
  let paintArea = 0, doorLen = 0, useful = 0, floor = 0, perimeter = 0, applied = 0, slab = 0, conduit = 0;
  sv.forEach(function (v, i) {
    (["ext", "int"] as const).forEach(function (c) { walls[c].len += v.walls[c].len; walls[c].area += v.walls[c].area; });
    merge(count, v.count); merge(openingList, v.openingList);
    for (const b in v.bills) bills[b] = merge(bills[b] || {}, v.bills[b]);
    paintArea += v.paintArea; doorLen += v.doorLen; useful += v.floor; floor += v.work.floor; perimeter += v.work.perimeter; conduit += v.conduit;
    merge(outdoor, v.outdoor); merge(byBrick, v.work.byBrick);
    for (const k in fin) { const part = k as keyof typeof fin; merge(fin[part], v.finish[part]); }
    for (const id in v.byType) {
      const t = v.byType[id], into = byType[id] = byType[id] || { name: t.name, thick: {}, len: 0, area: 0 };
      into.len += t.len; into.area += t.area; Object.assign(into.thick, t.thick);
    }
    const underSlab = i < top || roof === "losa"; // cielorraso aplicado
    if (underSlab) applied += v.work.floor;
    slab += v.work.floor * (i === 0 ? s.slab : F.upperSlab) / 100 * WASTE;
    v.rooms.forEach(function (r) {
      if (r.phase === "nueva") byFloor[r.floor] = (byFloor[r.floor] || 0) + r.area;
      roomRows.push({ label: (top ? levels[i].name + " · " : "") + r.name + (phased && r.phase === "existente" ? " (existente)" : ""), value: m2(r.area) });
    });
    if (i > 0 && v.work.footprint) slabRows.push({ label: "Losa bajo " + levels[i].name.toLowerCase(), value: m2(v.work.footprint) });
  });

  // Ladrillos y mortero, sumados por tipo de ladrillo realmente usado.
  const brickRows: Row[] = [];
  let units = 0, mortarVol = 0;
  Object.keys(D.bricks).forEach(function (key) {
    if (!byBrick[key]) return;
    const q = E.brickwork(byBrick[key], D.bricks[key], D.bricks[key].j, WASTE);
    units += q.units; mortarVol += q.mortar;
    brickRows.push({ label: D.bricks[key].label, value: fmt(q.units, 0) + " u · " + m2(byBrick[key]) });
  });
  const mortar = D.cirsoc.mortars[s.mortar] ? s.mortar : DEFAULTS.mortar;
  const wallMat = E.addMaterials({}, mortar, mortarVol);
  const screed = floor * s.screed / 100 * WASTE;
  const floorMat = E.addMaterials({}, "ccas", slab);
  if (screed) E.addMaterials(floorMat, "m13", screed);

  // Revoques según las capas de cada tipo de muro: grueso a la cal reforzada, fino en bolsa y azotado hidrófugo.
  // El cielorraso aplicado bajo losa lleva grueso y fino con los espesores de siempre.
  fin.grueso.area += applied; fin.grueso.vol += applied * F.coarse / 100; fin.fino.area += applied;
  const coarse = fin.grueso.vol * WASTE, splash = fin.azotado.vol * WASTE;
  const plasterMat = E.addMaterials({}, "mcal", coarse);
  if (splash) E.addMaterials(plasterMat, "m13", splash);
  // Exteriores: contrapiso y piso según el tipo de superficie.
  const outRows: Row[] = [];
  let outSlab = 0, outTiles = 0;
  Object.keys(D.surfaces).forEach(function (key) {
    const def = D.surfaces[key], area = outdoor[key];
    if (!area) return;
    outRows.push({ label: def.label, value: m2(area) });
    if (def.slab) outSlab += area * def.slab / 100 * WASTE;
    if (def.tiled) outTiles += area;
  });
  const outMat = outSlab ? E.addMaterials({}, "ccas", outSlab) : {};
  if (outSlab) outRows.push({ label: "Contrapiso exterior", value: m3(outSlab) });
  if (outTiles) outRows.push({ label: "Piso exterior (10 % de desperdicio)", value: m2(outTiles * TILE_WASTE) });
  const total = merge(merge(merge(merge({}, wallMat), floorMat), plasterMat), outMat);
  const liters = (paintArea + (s.ceiling ? floor : 0)) * s.coats / PAINT_YIELD;

  const floorRows: Row[] = [];
  let adhesive = 0, skirting = false;
  Object.keys(D.floors).forEach(function (key) {
    const def = D.floors[key], area = byFloor[key];
    if (!area) return;
    floorRows.push(def.waste ? { label: def.label + " (" + def.waste + " % de desperdicio)", value: m2(area * (1 + def.waste / 100)) } : { label: def.label, value: m2(area) });
    if (def.waste) skirting = true;
    if (def.adhesive) adhesive += area * def.adhesive;
  });
  if (adhesive) floorRows.push({ label: "Adhesivo", value: E.bags(adhesive, D.tile.adhesiveBag) });
  if (skirting) floorRows.push({ label: "Zócalos", value: fmt(Math.max(0, perimeter - doorLen) * WASTE, 1) + " m" });

  // Cubierta: la planta de mayor superficie + alero, corregida por la pendiente.
  // Con existente, la cubierta es la de los ambientes nuevos (la ampliación); sin existente, la de siempre.
  const widest = sv.reduce(function (best, v) { return v.work.footprint > best.work.footprint ? v : best; }, sv[0]);
  const roofPlan = sv.reduce(function (m, v) { return Math.max(m, v.footprint); }, 0); // toda la vivienda: para las cargas
  const slope = (D.roofs[roof].slope || 0) / 100;
  const roofArea = roof === "losa" ? widest.work.footprint : (widest.work.footprint + widest.walls.ext.len * F.eave / 100) * Math.sqrt(1 + slope * slope);
  const roofRows: Row[] = widest.work.footprint && roof !== "none" ? [{ label: D.roofs[roof].label, value: m2(roofArea) }] : [];
  if (roofRows.length && roof === "losa") roofRows.push({ label: "Membrana asfáltica (rollos de " + F.membrane + " m²)", value: E.ceil(roofArea * 1.15 / F.membrane) + " u" });
  if (roofRows.length && roof === "chapa") {
    roofRows.push({ label: "Chapa (ancho útil " + fmt(F.sheetWidth / 100, 2) + " m)", value: fmt(roofArea / (F.sheetWidth / 100), 1) + " m lineales" },
      { label: "Tornillos autoperforantes", value: fmt(E.ceil(roofArea * F.screwsPerM2), 0) + " u" },
      { label: "Aislación bajo chapa", value: m2(roofArea * 1.1) });
  }
  if (roofRows.length && roof === "tejas") {
    roofRows.push({ label: "Tejas francesas", value: fmt(E.ceil(roofArea * F.tilesPerM2 * WASTE), 0) + " u" },
      { label: "Aislación hidrófuga", value: m2(roofArea * 1.1) });
  }
  const boards = roof === "chapa" || roof === "tejas" ? E.ceil(sv[top].work.floor * 1.1 / F.board) : 0;
  const ceilingRows = (boards ? [{ label: "Placas de yeso de 1,20 × 2,40 m", value: boards + " u" }] : [] as Row[])
    .concat(applied ? [{ label: "Aplicado bajo losa (incluido en revoques)", value: m2(applied) }] : []);

  // Demolición: muros marcados "a demoler" (con sus aberturas) y aberturas que se retiran de muros que quedan.
  const demo = { len: 0, area: 0, vol: 0, openings: 0 };
  let kept = 0;
  // Espesor de cada muro a demoler tal como está hoy (estado actual), donde todavía es interior o exterior.
  const nowThick: Dict<number>[] = phased ? levelsOf(plan, "actual").map(function (lv) { return survey(lv, s, bricks).wallThick; }) : [];
  levelsOf(plan, "todo").forEach(function (lv, li) {
    const byId: Dict<Wall> = {};
    lv.walls.forEach(function (w) { byId[w.id] = w; });
    lv.walls.forEach(function (w) {
      if (wallPhase(w) !== "demoler") return;
      const len = dist(w.a, w.b) / 100, holes = lv.openings.filter(function (o) { return o.wall === w.id; });
      const area = Math.max(0, len * s.height / 100 - holes.reduce(function (a, o) { return a + Math.min(o.w, len * 100) * Math.min(o.h, s.height) / 1e4; }, 0));
      demo.len += len; demo.area += area; demo.vol += area * ((nowThick[li] || {} as Dict<number>)[w.id] || 15) / 100;
    });
    lv.openings.forEach(function (o) { if (byId[o.wall] && openingPhase(o, byId[o.wall]) === "demoler") demo.openings++; });
  });
  sv.forEach(function (v) { v.edges.forEach(function (e) { if (e.phase === "existente") kept += dist(e.a, e.b) / 100; }); });
  const debris = demo.vol * F.debrisSwell;
  const demoRows: Row[] = demo.len || demo.openings ? [
    demo.len ? { label: "Muros a demoler", value: fmt(demo.len, 1) + " m · " + m2(demo.area) } : null,
    demo.len ? { label: "Volumen de muros", value: m3(demo.vol) } : null,
    demo.openings ? { label: "Aberturas a retirar", value: demo.openings + " u" } : null,
    debris ? { label: "Escombro (con " + Math.round((F.debrisSwell - 1) * 100) + " % de esponjamiento)", value: m3(debris) } : null,
    debris ? { label: "Contenedores de " + F.container + " m³", value: E.ceil(debris / F.container) + " u" } : null
  ].filter(function (r): r is Row { return Boolean(r); }) : [];

  const billRows = function (name: string): Row[] {
    const list = bills[name] || {}, rows = Object.keys(list).sort().map(function (label) { return { label: label, value: list[label] + " u" }; });
    return rows.length > 1 ? rows.concat([{ label: "Total", value: rows.reduce(function (n, r) { return n + parseInt(r.value, 10); }, 0) + " u" }]) : rows;
  };

  const sections: ResultSection[] = [
    { title: "Ambientes", rows: roomRows.concat([{ label: "Superficie útil total", value: m2(useful) }])
      .concat(phased ? [{ label: "De la obra nueva", value: m2(floor) }] : []) },
    { title: "Aberturas", rows: Object.keys(openingList).sort().map(function (name) { return { label: name, value: openingList[name] + " u" }; })
      .concat([{ label: "Puertas y ventanas", value: count.door + " y " + count.window }]) },
    { title: "Demolición", rows: demoRows },
    { title: "Muros", rows: (kept ? [{ label: "Existentes que se conservan (no se computan)", value: fmt(kept, 1) + " m" }] : []).concat([
      { label: "Muros exteriores", value: fmt(walls.ext.len, 1) + " m · " + m2(walls.ext.area) },
      { label: "Muros interiores", value: fmt(walls.int.len, 1) + " m · " + m2(walls.int.area) },
      { label: "Mortero de asiento tipo " + D.cirsoc.mortars[mortar].type, value: m3(mortarVol) },
      { label: "Capa aisladora horizontal", value: fmt(sv[0].walls.ext.len + sv[0].walls.int.len, 1) + " m" }
    ].concat(Object.keys(byType).sort(function (a, b) { return byType[a].name.localeCompare(byType[b].name); }).map(function (id) {
      const t = byType[id], cm = (Object.keys(t.thick) as Cls[]).map(function (c) { return fmt(t.thick[c] as number, 1); }).filter(function (v, i, l) { return l.indexOf(v) === i; }).join(" y ");
      return { label: t.name + " (" + cm + " cm terminado)", value: fmt(t.len, 1) + " m · " + m2(t.area) };
    })).concat(brickRows).concat(E.materialRows(wallMat))) },
    { title: "Entrepisos", rows: slabRows.length ? slabRows.concat([{ label: "Espesor, hierro y hormigón", value: "según cálculo" }]) : [] },
    { title: "Revoques", rows: [
      fin.azotado.area ? { label: "Azotado hidrófugo", value: m2(fin.azotado.area) } : null,
      fin.grueso.area ? { label: "Revoque grueso" + (applied ? " (con cielorraso bajo losa)" : ""), value: m2(fin.grueso.area) } : null,
      fin.fino.area ? { label: "Revoque fino", value: m2(fin.fino.area) } : null,
      fin.fino.area ? { label: "Revoque fino en bolsa", value: E.bags(fin.fino.area * F.fine, F.fineBag) } : null
    ].filter(function (r): r is Row { return Boolean(r); }).concat(E.materialRows(plasterMat)) },

    { title: "Contrapiso y carpeta", rows: [
      { label: top ? "Contrapiso (" + fmt(s.slab, 1) + " cm abajo, " + F.upperSlab + " cm sobre losa)" : "Contrapiso de " + fmt(s.slab, 1) + " cm", value: m3(slab) },
      { label: "Carpeta de " + fmt(s.screed, 1) + " cm", value: m3(screed) }
    ].concat(E.materialRows(floorMat)) },
    { title: "Pisos y zócalos", rows: floorRows },
    { title: "Cielorraso", rows: ceilingRows },
    { title: "Cubierta", rows: roofRows },
    { title: "Exteriores", rows: outRows.concat(E.materialRows(outMat)) },
    { title: "Pintura interior", rows: [
      { label: "Paredes" + (s.ceiling ? " y cielorraso" : ""), value: m2(paintArea + (s.ceiling ? floor : 0)) },
      { label: "Pintura (" + s.coats + (s.coats === 1 ? " mano" : " manos") + ")", value: fmt(liters, 1) + " L" }
    ].concat(liters > 0 ? [{ label: "Qué comprar", value: E.paintCans(liters) }] : []) },
    { title: "Artefactos", rows: billRows("Artefactos") },
    { title: "Instalación eléctrica", rows: billRows("Instalación eléctrica").concat(conduit ? [
      { label: "Caño corrugado (estimado)", value: fmt(conduit * 1.1, 1) + " m" },
      { label: "Cable unipolar, 3 conductores (estimado)", value: fmt(conduit * 1.1 * 3, 0) + " m" }
    ] : []) },
    { title: "Total de cemento, cal y áridos", rows: E.materialRows(total) }
  ].filter(function (sec) { return sec.rows.length; });

  // Revisión contra los reglamentos CIRSOC: suma el análisis de cargas y los encadenados, con su hormigón.
  const review = B.cirsoc ? B.cirsoc.review(plan, { levels: levels, surveys: sv, s: s, bricks: bricks, roof: roof, roofPlan: roofPlan }) : { checks: [], sections: [], materials: {} };
  merge(total, review.materials);
  if (sections.length && sections[sections.length - 1].title.indexOf("Total de cemento") === 0) sections.pop();
  review.sections.forEach(function (sec) { sections.push(sec); });
  if (E.materialRows(total).length) sections.push({ title: "Total de cemento, cal y áridos", rows: E.materialRows(total) });

  // Cantidades sin formato, para el presupuesto (lib/budget.js). Solo la obra nueva, como el resto del cómputo.
  const qty = {
    demo: { area: demo.area, vol: demo.vol, openings: demo.openings, containers: debris ? E.ceil(debris / F.container) : 0 },
    walls: Object.keys(D.bricks).filter(function (k) { return byBrick[k]; }).map(function (k) {
      return { brick: k, area: byBrick[k], units: E.brickwork(byBrick[k], D.bricks[k], D.bricks[k].j, WASTE).units };
    }),
    wallMat: wallMat,
    plaster: { azotado: fin.azotado.area, grueso: fin.grueso.area, fino: fin.fino.area, finoBags: fin.fino.area * F.fine / F.fineBag, mat: plasterMat },
    slab: { area: floor, mat: floorMat, screed: screed > 0 },
    floors: byFloor, floorWaste: TILE_WASTE, adhesive: adhesive, skirting: skirting ? Math.max(0, perimeter - doorLen) * WASTE : 0,
    ceiling: { boards: boards, area: boards ? sv[top].work.floor : 0 },
    roof: { type: roofRows.length ? roof : "none", area: roofRows.length ? roofArea : 0 },
    paint: { area: paintArea + (s.ceiling ? floor : 0), liters: liters, coats: s.coats, ceiling: s.ceiling ? floor : 0 },
    bills: bills, conduit: conduit * 1.1,
    outdoor: { mat: outMat, slab: outSlab, tiles: outTiles * TILE_WASTE, area: Object.keys(outdoor).reduce(function (a, k) { return a + outdoor[k]; }, 0) },
    ties: review.ties || null
  };

  return {
    qty: qty,
    checks: review.checks,
    rooms: sv[active].rooms,
    edges: sv[active].edges,
    wallThick: sv[active].wallThick,
    under: active > 0 ? sv[active - 1].edges : [], // muros de la planta de abajo, como guía
    phased: phased,
    // Estado actual (antes de la obra) de la planta activa, para dibujarlo; solo si hay existente.
    before: phased ? (function () { const lv = levelsOf(plan, "actual")[active], v = survey(lv, s, bricks); return { edges: v.edges, rooms: v.rooms, wallThick: v.wallThick }; })() : null,
    level: active,
    levels: levels.map(function (lv) { return lv.name; }),
    main: [
      { label: phased ? "Superficie nueva" : "Superficie útil", value: fmt(phased ? floor : useful, 1), unit: "m²" },
      { label: "Ladrillos", value: fmt(units, 0), unit: "unidades" },
      { label: "Cemento", value: fmt(E.ceil((total.cemento || 0) / D.materials.cemento.bag), 0), unit: "bolsas de " + D.materials.cemento.bag + " kg" }
    ],
    sections: sections,
    notes: (phased ? ["Obra con partes existentes: los materiales son solo de lo que se construye. Los ambientes rodeados solo por muros existentes no llevan contrapiso, piso, cielorraso ni techo nuevos."] : []).concat([
      "Incluye 5 % de desperdicio en muros, revoques, contrapiso y carpeta.",
      "No incluye estructura, tirantería del techo, cañerías ni cableado.",
      "Estimación para presupuestar: no reemplaza el cómputo de un profesional."
    ])
  };
}

// Antepecho de una abertura en cm: el suyo (o.sill, por ejemplo leído de las notas de un plano) o el de su tipo.
const sillOf = function (o: Opening): number { return typeof o.sill === "number" && o.sill >= 0 ? o.sill : typeOf(o).sill || 0; };

function opening(id: Id, wall: Id, t: number, type: string): Opening {
  const def = D.openings[type];
  return { id: id, wall: wall, t: t, type: type, w: def.w, h: def.h, side: false, hinge: false };
}

function item(id: Id, type: string, x: number, y: number, r?: number): Item {
  const def = D.items[type];
  return { id: id, type: type, x: x, y: y, r: r || 0, w: def.w, d: def.d };
}

// ¿El punto p cae dentro del objeto (rectángulo girado)? tol amplía el borde en cm.
function itemHit(it: Item, p: Point, tol?: number): boolean {
  const a = -(it.r || 0) * Math.PI / 180, dx = p.x - it.x, dy = p.y - it.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= it.w / 2 + (tol || 0) && Math.abs(ly) <= it.d / 2 + (tol || 0);
}

function sample(): Plan {
  const wall = function (id: Id, x1: number, y1: number, x2: number, y2: number): Wall { return { id: id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 } }; };
  return {
    nextId: 110,
    settings: Object.assign({}, DEFAULTS),
    wallTypes: JSON.parse(JSON.stringify(D.wallTypes)),
    walls: [
      wall(1, 0, 0, 800, 0), wall(2, 800, 0, 800, 700), wall(3, 800, 700, 0, 700), wall(4, 0, 700, 0, 0),
      wall(5, 450, 0, 450, 700), wall(6, 450, 300, 800, 300), wall(7, 450, 450, 800, 450), wall(8, 0, 450, 450, 450)
    ],
    openings: [
      opening(10, 4, 0.75, "p90"), opening(11, 1, 0.28, "v150"), opening(12, 1, 0.78, "v120"),
      opening(13, 2, 0.82, "v120"), opening(14, 3, 0.72, "v120"), opening(15, 2, 0.535, "vlux"),
      opening(16, 5, 0.21, "p80"), opening(17, 5, 0.535, "p70"), opening(18, 5, 0.82, "p80"), opening(19, 8, 0.5, "vano")
    ],
    items: [
      item(40, "sofa3", 120, 60, 0), item(41, "ratona", 120, 165, 0), item(42, "mesa6", 310, 330, 90), item(43, "rack", 120, 420, 180),
      item(44, "cama2", 690, 150, 90), item(45, "placard", 560, 265, 180), item(46, "cama1", 730, 590, 0), item(47, "placard", 560, 655, 0),
      item(48, "inodoro", 690, 335, 0), item(49, "bidet", 635, 335, 0), item(50, "vanitory", 560, 422, 180), item(51, "ducha", 750, 405, 0),
      item(52, "mesada", 120, 660, 180), item(53, "cocina", 250, 660, 180), item(54, "heladera", 395, 650, 180),
      item(55, "bocaTecho", 190, 290, 0), item(56, "bocaTecho", 530, 120, 0), item(57, "bocaTecho", 225, 520, 0), item(58, "tablero", 30, 300, 90),
      item(59, "toma", 30, 130, 0), item(60, "llave", 30, 245, 0), item(61, "toma", 770, 40, 0),
      // Cada ambiente con su boca de techo y su llave junto a la puerta.
      item(62, "bocaTecho", 600, 515, 0), item(63, "bocaTecho", 525, 350, 0),
      item(64, "llave", 480, 510, 0), item(65, "llave", 480, 428, 0), item(66, "llave", 480, 205, 0), item(67, "llave", 310, 480, 0),
      // Tomacorrientes: living (TV y comedor), dos por dormitorio, uno junto al vanitory y dos en la cocina.
      item(86, "toma", 30, 365, 0), item(87, "toma", 420, 30, 0), item(88, "toma", 420, 260, 0), item(89, "toma", 770, 260, 0), item(90, "toma", 480, 40, 0),
      item(91, "toma", 770, 475, 0), item(92, "toma", 640, 480, 0), item(93, "toma", 690, 428, 0), item(94, "toma", 30, 600, 0), item(95, "toma", 320, 670, 0)
    ],
    wires: [
      { id: 70, a: 58, b: 55 }, { id: 71, a: 55, b: 60 }, { id: 72, a: 55, b: 59 }, { id: 73, a: 55, b: 57 }, { id: 74, a: 55, b: 56 }, { id: 75, a: 56, b: 61 },
      { id: 80, a: 57, b: 62 }, { id: 81, a: 56, b: 63 }, { id: 82, a: 62, b: 64 }, { id: 83, a: 63, b: 65 }, { id: 84, a: 56, b: 66 }, { id: 85, a: 57, b: 67 },
      { id: 96, a: 55, b: 86 }, { id: 97, a: 55, b: 87 }, { id: 98, a: 55, b: 88 }, { id: 99, a: 56, b: 89 }, { id: 100, a: 56, b: 90 },
      { id: 101, a: 62, b: 91 }, { id: 102, a: 62, b: 92 }, { id: 103, a: 63, b: 93 }, { id: 104, a: 57, b: 94 }, { id: 105, a: 57, b: 95 }
    ],
    notes: [],
    surfaces: [{ id: 76, x: -160, y: 0, w: 151, h: 700, type: "vereda" }, { id: 77, x: 809, y: 300, w: 300, h: 400, type: "patio" }],
    labels: [
      { x: 225, y: 225, name: "Living comedor" }, { x: 625, y: 150, name: "Dormitorio 1" }, { x: 625, y: 375, name: "Baño" },
      { x: 625, y: 575, name: "Dormitorio 2" }, { x: 225, y: 575, name: "Cocina" }
    ]
  };
}

function empty(): Plan {
  return { nextId: 1, settings: Object.assign({}, DEFAULTS), wallTypes: JSON.parse(JSON.stringify(D.wallTypes)), walls: [], openings: [], items: [], labels: [], wires: [], surfaces: [], notes: [] };
}

// ---------- Dibujo: cadenas SVG sin DOM. Las usan el editor y la vista previa de la portada. ----------
const n1 = (v: number) => Math.round(v * 10) / 10;
const pt = (p: Point) => n1(p.x) + " " + n1(p.y);

function lineSVG(a: Point, b: Point, cls: string, width?: number, extra?: string): string {
  return '<line class="' + cls + '" x1="' + n1(a.x) + '" y1="' + n1(a.y) + '" x2="' + n1(b.x) + '" y2="' + n1(b.y) + '"' +
    (width ? ' stroke-width="' + n1(width) + '"' : "") + (extra || "") + "/>";
}

/* Símbolo de una abertura en planta. p0→p1 es el vano sobre el eje del muro, k = cm por píxel.
   o.side elige hacia qué lado del muro abre y o.hinge de qué extremo cuelga la hoja. */
// any: def: entrada de data.openings (lib/manifest.js, sin tipar todavía)
function symbolSVG(def: any, p0: Point, p1: Point, thick: number, k: number, o: { side?: boolean; hinge?: boolean }, cls: string): string {
  const W = dist(p0, p1), dx = (p1.x - p0.x) / W, dy = (p1.y - p0.y) / W, s = o.side ? -1 : 1;
  const nx = -dy * s, ny = dx * s;
  const off = (along: number, across: number): Point => ({ x: p0.x + dx * along + nx * across, y: p0.y + dy * along + ny * across });
  const thin = ' stroke-width="' + n1(1.5 * k) + '"';
  function leaf(hinge: Point, other: Point, len: number) { // hoja abierta a 90° y el arco que barre
    const tip = { x: hinge.x + nx * len, y: hinge.y + ny * len };
    const cross = (tip.x - hinge.x) * (other.y - hinge.y) - (tip.y - hinge.y) * (other.x - hinge.x);
    return '<path class="door' + cls + '"' + thin + ' d="M' + pt(hinge) + "L" + pt(tip) + "A" + n1(len) + " " + n1(len) +
      " 0 0 " + (cross > 0 ? 1 : 0) + " " + pt(other) + '"/>';
  }
  let out = lineSVG(p0, p1, "gap", thick + 2 * k);
  const q = thick / 5;
  switch (def.symbol) {
    case "swing": out += o.hinge ? leaf(p1, p0, W) : leaf(p0, p1, W); break;
    case "double": out += leaf(p0, off(W / 2, 0), W / 2) + leaf(p1, off(W / 2, 0), W / 2); break;
    case "sliding":
      out += lineSVG(off(0, q), off(W * 0.56, q), "door" + cls, 1.5 * k) + lineSVG(off(W * 0.44, -q), off(W, -q), "door" + cls, 1.5 * k);
      break;
    case "garage":
      out += '<path class="door' + cls + '"' + thin + ' stroke-dasharray="' + n1(5 * k) + " " + n1(4 * k) + '" d="M' + pt(p0) + "L" +
        pt(off(0, W * 0.4)) + "L" + pt(off(W, W * 0.4)) + "L" + pt(p1) + '"/>';
      break;
    case "open": out += lineSVG(p0, p1, "door" + cls, k, ' stroke-dasharray="' + n1(3 * k) + " " + n1(4 * k) + '"'); break;
    case "fixed": out += lineSVG(off(0, q), off(W, q), "window" + cls, 1.5 * k) + lineSVG(off(0, -q), off(W, -q), "window" + cls, 1.5 * k); break;
    default: out += lineSVG(p0, p1, "window" + cls, 4 * k);
  }
  return out;
}

function openingSVG(wall: Wall, o: Opening, thick: number, k: number, cls: string): string {
  const len = dist(wall.a, wall.b), half = Math.min(o.w, len) / 2 / len;
  return symbolSVG(typeOf(o), at(wall, o.t - half), at(wall, o.t + half), thick, k, o, cls);
}

// Primitivas que dibujan un objeto: las de la biblioteca o, en un mueble a medida, su forma (rectangular o redonda).
/** Primitiva de dibujo de un objeto, en fracciones de su ancho y fondo: rectángulo, elipse o línea. */
type DrawOp = [string, number, number, number, number];
// any: def: entrada de data.items (lib/manifest.js, sin tipar todavía)
function itemDraw(it: Item, def: any): DrawOp[] {
  if (def.custom) return it.shape === "round" ? [["e", 0.5, 0.5, 0.5, 0.5]] : [["r", 0, 0, 1, 1]];
  return def.draw || [["r", 0, 0, 1, 1]];
}
// Alto de la letra del nombre de un mueble a medida, para que entre en él.
const itemNameSize = (it: Item) => Math.max(6, Math.min(20, Math.max(it.w, it.d) * 1.5 / Math.max(4, String(it.name).length), Math.min(it.w, it.d) * 0.5));

function itemSVG(it: Item, k: number, cls: string): string {
  const def = D.items[it.type];
  if (!def) return "";
  const w = it.w, d = it.d, rx = n1(Math.min(w, d) * 0.06);
  let body = "";
  if (def.shape === "stair") { // peldaños cada ~27 cm y flecha de subida
    const steps = Math.max(2, Math.round(d / 27));
    body = '<rect width="' + w + '" height="' + d + '"/>';
    for (let i = 1; i < steps; i++) body += '<line x1="0" y1="' + n1(d * i / steps) + '" x2="' + w + '" y2="' + n1(d * i / steps) + '"/>';
    body += '<path fill="none" d="M' + n1(w / 2) + " " + n1(d * 0.92) + "V" + n1(d * 0.08) + "m" + n1(-w * 0.15) + " " + n1(w * 0.15) + "l" + n1(w * 0.15) + " " + n1(-w * 0.15) + "l" + n1(w * 0.15) + " " + n1(w * 0.15) + '"/>';
  } else {
    itemDraw(it, def).forEach(function (p) {
      if (p[0] === "r") body += '<rect x="' + n1(p[1] * w) + '" y="' + n1(p[2] * d) + '" width="' + n1(p[3] * w) + '" height="' + n1(p[4] * d) + '" rx="' + rx + '"/>';
      else if (p[0] === "e") body += '<ellipse cx="' + n1(p[1] * w) + '" cy="' + n1(p[2] * d) + '" rx="' + n1(p[3] * w) + '" ry="' + n1(p[4] * d) + '"/>';
      else body += '<line x1="' + n1(p[1] * w) + '" y1="' + n1(p[2] * d) + '" x2="' + n1(p[3] * w) + '" y2="' + n1(p[4] * d) + '"/>';
    });
  }
  return '<g class="item' + (def.group === "electricidad" ? " electric" : "") + cls + '" stroke-width="' + n1(1.5 * k) + '" transform="translate(' + n1(it.x) + " " + n1(it.y) +
    ") rotate(" + (it.r || 0) + ") translate(" + n1(-w / 2) + " " + n1(-d / 2) + ')">' + body + "</g>" +
    (def.custom && it.name ? '<text class="item-name" x="' + n1(it.x) + '" y="' + n1(it.y) + '" font-size="' + n1(itemNameSize(it)) + '">' + escText(it.name) + "</text>" : "");
}

// ---------- Anotaciones: trazos, flechas, formas, nubes de revisión y notas de texto. No entran en el cómputo. ----------
const PALETTE = ["#e5484d", "#f08c00", "#2fa84f", "#12a5a5", "#3b82f6", "#9b59d0", "#a0785a"]; // se leen sobre fondo oscuro y sobre papel
const NOTE_KINDS = { pen: "Trazo a mano", line: "Línea", arrow: "Flecha", rect: "Rectángulo", ellipse: "Elipse", cloud: "Nube de revisión", text: "Nota de texto" };
const NOTE_STROKE: Dict<number> = { s: 3, m: 6, l: 12 }, NOTE_TEXT: Dict<number> = { s: 18, m: 28, l: 44 }; // cm: van a escala con el plano
const noteStroke = (note: Note) => NOTE_STROKE[note.w || "m"] || NOTE_STROKE.m;
const noteSize = (note: Note) => NOTE_TEXT[note.w || "m"] || NOTE_TEXT.m;
const ESCAPES: Dict<string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escText = (t: unknown) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ESCAPES[c]);

// Polilíneas que dibujan una anotación (el texto no tiene). Las comparten la pantalla, las imágenes exportadas y el DXF.
function notePolys(note: Note): Point[][] {
  const pts = note.pts, a = pts[0], b = pts[pts.length - 1];
  if (note.kind === "text") return [];
  if (note.kind === "pen") return [pts];
  if (note.kind === "line") return [[a, b]];
  if (note.kind === "arrow") {
    const len = dist(a, b) || 1, head = Math.min(len * 0.45, Math.max(18, noteStroke(note) * 4)), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const wing = (side: number): Point => ({ x: b.x - ux * head - uy * head * 0.45 * side, y: b.y - uy * head + ux * head * 0.45 * side });
    return [[a, b], [wing(1), b, wing(-1)]];
  }
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  if (note.kind === "ellipse") {
    const ring: Point[] = [];
    for (let i = 0; i <= 48; i++) ring.push({ x: (x0 + x1) / 2 + (x1 - x0) / 2 * Math.cos(i * Math.PI / 24), y: (y0 + y1) / 2 + (y1 - y0) / 2 * Math.sin(i * Math.PI / 24) });
    return [ring];
  }
  if (note.kind !== "cloud") return [corners.concat([corners[0]])];
  // Nube de revisión: semicírculos hacia afuera a lo largo de cada lado.
  const step = Math.max(20, Math.min(60, Math.min(x1 - x0, y1 - y0) / 3)), ring: Point[] = [];
  corners.forEach(function (c, i) {
    const d = corners[(i + 1) % 4], len = dist(c, d), count = Math.max(1, Math.round(len / step));
    if (!len) return;
    const ux = (d.x - c.x) / len, uy = (d.y - c.y) / len, r = len / count / 2;
    for (let j = 0; j < count; j++) {
      const mx = c.x + ux * r * (2 * j + 1), my = c.y + uy * r * (2 * j + 1);
      for (let q = j ? 1 : 0; q <= 8; q++) {
        const ang = Math.PI * q / 8;
        ring.push({ x: mx - ux * r * Math.cos(ang) + uy * r * Math.sin(ang), y: my - uy * r * Math.cos(ang) - ux * r * Math.sin(ang) });
      }
    }
  });
  return ring.length ? [ring.concat([ring[0]])] : [];
}

// Rectángulo que encierra la anotación.
function noteBox(note: Note): { x0: number; y0: number; x1: number; y1: number } {
  if (note.kind === "text") {
    const size = noteSize(note), half = Math.max(size, String(note.text || "").length * size * 0.31), c = note.pts[0];
    return { x0: c.x - half, y0: c.y - size * 0.7, x1: c.x + half, y1: c.y + size * 0.7 };
  }
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  notePolys(note).forEach(function (poly) {
    poly.forEach(function (p) { box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y); });
  });
  return box;
}

function noteHit(note: Note, p: Point, tol: number): boolean {
  if (note.kind === "text") { const box = noteBox(note); return p.x >= box.x0 - tol && p.x <= box.x1 + tol && p.y >= box.y0 - tol && p.y <= box.y1 + tol; }
  const reach = Math.max(noteStroke(note) / 2, tol);
  return notePolys(note).some(function (poly) {
    return poly.some(function (b, i) {
      if (!i) return false;
      const a = poly[i - 1], rx = b.x - a.x, ry = b.y - a.y, len2 = rx * rx + ry * ry;
      const t = len2 ? clamp01(((p.x - a.x) * rx + (p.y - a.y) * ry) / len2) : 0;
      return dist(p, { x: a.x + rx * t, y: a.y + ry * t }) <= reach;
    });
  });
}

// k = cm por píxel. Con halo dibuja el resalte de la anotación elegida, que va por debajo del trazo.
function noteSVG(note: Note, k: number, halo: boolean): string {
  const color = hex(note.color);
  if (note.kind === "text") {
    const box = noteBox(note), pad = 4 * k;
    if (halo) return '<rect class="note-halo" x="' + n1(box.x0 - pad) + '" y="' + n1(box.y0 - pad) + '" width="' + n1(box.x1 - box.x0 + 2 * pad) + '" height="' + n1(box.y1 - box.y0 + 2 * pad) + '" stroke-width="' + n1(k) + '"/>';
    return '<text class="note-text" x="' + n1(note.pts[0].x) + '" y="' + n1(note.pts[0].y) + '" font-size="' + noteSize(note) + '"' + (color ? ' style="fill:' + color + '"' : "") + ">" + escText(note.text) + "</text>";
  }
  const width = Math.max(noteStroke(note), 1.2 * k) + (halo ? 7 * k : 0);
  return notePolys(note).map(function (poly) {
    return '<polyline class="' + (halo ? "note-halo" : "note") + '" stroke-width="' + n1(width) + '"' + (color && !halo ? ' style="stroke:' + color + '"' : "") +
      ' points="' + poly.map(function (p) { return n1(p.x) + "," + n1(p.y); }).join(" ") + '"/>';
  }).join("");
}

// Relleno de un ambiente con color propio: translúcido, para que sirva sobre fondo oscuro y sobre papel.
const roomFill = (room: { color?: string }, strong?: boolean) => room.color ? ' style="fill:' + room.color + ";fill-opacity:" + (strong ? 0.5 : 0.3) + '"' : "";

// Colores fijos para los archivos exportados (fuera de la página no existen las variables de estilo).
const EXPORT_CSS = ".room{fill:#f8e9e0}.wall{stroke:#26221e;stroke-linecap:square}.wall.int{stroke:#6b635a}.gap{stroke:#fff}" +
  ".door{fill:none;stroke:#26221e}.window{stroke:#3b82c4}.item{fill:#fff;stroke:#26221e}.item.electric{stroke:#b4451f}" +
  "text{text-anchor:middle;dominant-baseline:middle;fill:#26221e;font-family:Arial,sans-serif}.room-label{font-weight:700}" +
  ".note{fill:none;stroke:#26221e;stroke-linecap:round;stroke-linejoin:round}";

// Plano completo como imagen fija (sin interacción), para mostrarlo fuera del editor.
// Con standalone devuelve un archivo SVG independiente, con fondo y colores propios.
function staticSVG(plan: Plan, standalone?: boolean) {
  const model = compute(plan), xs: number[] = [], ys: number[] = [];
  plan.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
  const notes = standalone && (plan.layers || {}).notes !== false ? plan.notes || [] : []; // la vista previa de la portada va sin anotaciones
  notes.forEach(function (note) { const b = noteBox(note); if (b.x0 <= b.x1) { xs.push(b.x0, b.x1); ys.push(b.y0, b.y1); } });
  const minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys), w = Math.max.apply(null, xs) - minX, h = Math.max.apply(null, ys) - minY;
  const pad = w * 0.07, k = w / 420, font = w / 38;
  const text = (x: number, y: number, cls: string, s: string) => '<text class="' + cls + '" x="' + n1(x) + '" y="' + n1(y) + '" font-size="' + n1(font) + '">' + s + "</text>";
  const box = [minX - pad, minY - pad, w + 2 * pad, h + 2 * pad].map(n1);
  let html = '<svg class="plan-svg" viewBox="' + box.join(" ") + '" role="img" aria-label="Plano de una vivienda de ' + model.rooms.length + ' ambientes"' +
    (standalone ? ' xmlns="http://www.w3.org/2000/svg" width="' + Math.round(box[2] * 2) + '" height="' + Math.round(box[3] * 2) + '"><style>' + EXPORT_CSS +
      '</style><rect x="' + box[0] + '" y="' + box[1] + '" width="' + box[2] + '" height="' + box[3] + '" fill="#fff"/>' : ">");
  model.rooms.forEach(function (r) { html += '<polygon class="room"' + roomFill(r) + ' points="' + r.points.map(function (p) { return n1(p.x) + "," + n1(p.y); }).join(" ") + '"/>'; });
  model.edges.forEach(function (e) { html += lineSVG(e.a, e.b, "wall " + e.cls, e.thick); });
  plan.openings.forEach(function (o) {
    const wall = plan.walls.find(function (x) { return x.id === o.wall; }) as Wall;
    html += openingSVG(wall, o, model.wallThick[wall.id] || 12, k, "");
  });
  (plan.items || []).forEach(function (it) { html += itemSVG(it, k, ""); });
  model.rooms.forEach(function (r) {
    html += text(r.cx, r.cy - font * 0.65, "room-label", r.name) + text(r.cx, r.cy + font * 0.7, "room-area", E.fmt(r.area, 1) + " m²");
  });
  notes.forEach(function (note) { html += noteSVG(note, k, false); });
  return { svg: html + "</svg>", model: model, width: Math.round(box[2] * 2), height: Math.round(box[3] * 2) };
}

// Ajustes de obra con los tipos de muro del plano adjuntos (s.types), que es lo que necesita survey.
const settingsOf = function (plan: Partial<Plan>): FullSettings { return Object.assign({}, DEFAULTS, plan.settings || {}, { types: wallTypesOf(plan) }); };
// Ladrillo de los muros por defecto de cada clase (lo usa la verificación CIRSOC).
const bricksOf = function (s: FullSettings) {
  const types = s.types || wallTypesOf({}), lib = wallTypesOf({});
  const of = function (cls: Cls) { const t = resolveType(types, s[cls]) || lib[DEFAULTS[cls]]; return D.bricks[t.brick]; };
  return { ext: of("ext"), int: of("int") };
};

/* Techo simplificado: cubre el rectángulo que envuelve la última planta, más el alero.
   Chapa: un agua. Tejas: dos aguas con la cumbrera paralela al lado largo. Losa: plana.
   heightAt(x, y) da la altura del techo en cm sobre cada punto del plano. */
/** Techo simplificado sobre el rectángulo de la última planta (ver roofShape). */
export interface RoofShape {
  type: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  alongX: boolean;
  base: number;
  eave: number;
  heightAt(x: number, y: number): number;
}
/** Cara del techo o cerramiento, en 3D. holes: agujeros (patios interiores). */
export interface RoofPoly {
  kind: string;
  points: Point3[];
  holes?: Point3[][];
  hole?: boolean;
}

function roofShape(plan: Plan): RoofShape | null {
  const s = settingsOf(plan), type = D.roofs[s.roof] ? s.roof : "none", levels = levelsOf(plan), top = levels[levels.length - 1];
  if (type === "none" || !top.walls.length) return null;
  const xs: number[] = [], ys: number[] = [];
  top.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
  const eave = type === "losa" ? 15 : D.finishes.eave;
  const x0 = Math.min.apply(null, xs) - eave, x1 = Math.max.apply(null, xs) + eave, y0 = Math.min.apply(null, ys) - eave, y1 = Math.max.apply(null, ys) + eave;
  const base = (levels.length - 1) * (s.height + D.finishes.storeyGap) + s.height, slope = (D.roofs[type].slope || 0) / 100;
  const alongX = x1 - x0 >= y1 - y0, span = alongX ? y1 - y0 : x1 - x0;
  return {
    type: type, x0: x0, y0: y0, x1: x1, y1: y1, alongX: alongX, base: base, eave: eave,
    heightAt: function (x: number, y: number) {
      const d = alongX ? y - y0 : x - x0; // distancia medida a través de la pendiente
      if (type === "tejas") return base + slope * (span / 2 - Math.abs(d - span / 2));
      return type === "chapa" ? base + slope * (span - d) : base;
    }
  };
}

/* Techo que sigue la forma de la casa (para la vista 3D y el render). En una casa en L o en U, el rectángulo que la
   envuelve dejaba techado el patio. Se arma así:
     1. el contorno de la casa: los lados de los ambientes de la última planta que no lindan con otro ambiente,
        encadenados en vueltas cerradas (la de afuera y, si hay un patio interior cerrado, la del patio);
     2. ese contorno corrido hacia afuera hasta la punta del alero, con las esquinas a inglete;
     3. la cubierta: un polígono con agujeros sobre el plano del techo. Las tejas a dos aguas se parten por la cumbrera
        para que cada agua sea plana;
     4. los cerramientos entre el muro y la cubierta, sobre la cara exterior de cada lado del contorno.
   Cada polígono de la cubierta trae `holes`; los que lo dibujan lo triangulan con roofTriangles. null si no hay ambientes. */
const OUTER = 15; // cm: del eje del muro a su cara exterior, aproximado
// Vueltas del contorno de un conjunto de ambientes, con lo construido a la izquierda: positivas por fuera, negativas los patios.
interface OutlineEdge {
  a: Point;
  b: Point;
  used: boolean;
}
function outline(rooms: { points: Point[] }[]): Point[][] {
  const edges: OutlineEdge[] = [], kp = function (p: Point) { return Math.round(p.x) + "," + Math.round(p.y); };
  rooms.forEach(function (room) {
    const pts = polyArea(room.points) >= 0 ? room.points : room.points.slice().reverse(), n = pts.length;
    pts.forEach(function (p, i) {
      const q = pts[(i + 1) % n], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1) return;
      const probe = { x: (p.x + q.x) / 2 + (q.y - p.y) / len * 30, y: (p.y + q.y) / 2 - (q.x - p.x) / len * 30 }; // 30 cm a la derecha: afuera del ambiente
      if (rooms.some(function (o) { return o !== room && inside(o.points, probe); })) return;
      edges.push({ a: p, b: q, used: false });
    });
  });
  const from: Dict<OutlineEdge[]> = {};
  edges.forEach(function (e) { (from[kp(e.a)] = from[kp(e.a)] || []).push(e); });
  const loops: Point[][] = [];
  edges.forEach(function (start) {
    if (start.used) return;
    const loop: Point[] = [];
    let e: OutlineEdge | undefined = start, guard = edges.length + 1;
    while (e && !e.used && guard--) {
      e.used = true; loop.push(e.a);
      e = (from[kp(e.b)] || []).find(function (x) { return !x.used; });
    }
    // Sin los vértices que quedan en medio de un lado recto.
    const clean = loop.filter(function (p, i) {
      const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-6 * Math.hypot(p.x - a.x, p.y - a.y) * Math.hypot(b.x - p.x, b.y - p.y) + 1;
    });
    if (clean.length >= 3) loops.push(clean);
  });
  return loops;
}
/* La vuelta corrida hacia la derecha (afuera de lo construido), con las esquinas a inglete y un tope en las muy agudas.
   d es la distancia, o una función (lado i, que va del punto i al i+1) → distancia, para correr cada lado distinto. */
function offsetLoop(loop: Point[], d: number | ((side: number) => number)): Point[] {
  const n = loop.length, dist = typeof d === "function" ? d : function () { return d; };
  return loop.map(function (p, i) {
    const a = loop[(i + n - 1) % n], b = loop[(i + 1) % n], da = dist((i + n - 1) % n), db = dist(i);
    const l1 = Math.hypot(p.x - a.x, p.y - a.y), l2 = Math.hypot(b.x - p.x, b.y - p.y);
    const d1 = { x: (p.x - a.x) / l1, y: (p.y - a.y) / l1 }, d2 = { x: (b.x - p.x) / l2, y: (b.y - p.y) / l2 };
    const n1 = { x: d1.y, y: -d1.x }, n2 = { x: d2.y, y: -d2.x };
    const p1 = { x: p.x + n1.x * da, y: p.y + n1.y * da }, p2 = { x: p.x + n2.x * db, y: p.y + n2.y * db }, den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-6) return p2; // lados alineados
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den, X = { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
    const far = 3 * Math.max(da, db, 1), off = Math.hypot(X.x - p.x, X.y - p.y);
    return off > far ? { x: p.x + (X.x - p.x) * far / off, y: p.y + (X.y - p.y) * far / off } : X;
  });
}
// Recorte de un polígono por un semiplano (Sutherland–Hodgman): se queda lo que cumple keep(p) ≥ 0.
function clipPoly(pts: Point[], keep: (p: Point) => number): Point[] {
  const out: Point[] = [];
  pts.forEach(function (p, i) {
    const q = pts[(i + 1) % pts.length], kp = keep(p), kq = keep(q);
    if (kp >= 0) out.push(p);
    if ((kp >= 0) !== (kq >= 0)) { const t = kp / (kp - kq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
  });
  return out;
}
function footprintRoof(plan: Plan, r: RoofShape): RoofPoly[] | null {
  const levels = levelsOf(plan), top = levels[levels.length - 1], s = settingsOf(plan), rooms = survey(top, s, bricksOf(s)).rooms;
  if (!rooms.length) return null;
  const kind = "roof-" + r.type, w = OUTER + r.eave, polys: RoofPoly[] = [];
  // Losas a distintas alturas (plan.slabs: un punto {x, y} dentro de un ambiente y la cara superior de su losa, z en cm desde
  // el piso de la planta): una losa por cada altura, con alero solo donde da afuera y no contra la otra losa.
  const slabs = plan.slabs || [];
  if (r.type === "losa" && slabs.length) {
    const w = OUTER; // con parapetos la losa no vuela: llega a la cara de afuera del muro
    const base = r.base - s.height, zOf = function (room: Room) { const sl = slabs.find(function (p) { return inside(room.points, p); }); return sl ? base + sl.z : r.base; };
    const groups: Dict<Room[]> = {};
    rooms.forEach(function (room) { const z = zOf(room); (groups[z] = groups[z] || []).push(room); });
    Object.keys(groups).forEach(function (zKey) {
      const z = Number(zKey);
      outline(groups[z]).forEach(function (loop) {
        const away = function (i: number) { // ¿del otro lado de este lado hay otro ambiente (de otra losa)? Entonces no lleva alero.
          const p = loop[i], q = loop[(i + 1) % loop.length], len = Math.hypot(q.x - p.x, q.y - p.y);
          const probe = { x: (p.x + q.x) / 2 + (q.y - p.y) / len * 30, y: (p.y + q.y) / 2 - (q.x - p.x) / len * 30 };
          return rooms.some(function (o) { return inside(o.points, probe); }) ? 0 : w;
        };
        const pts = offsetLoop(loop, away).map(function (p) { return { x: p.x, y: p.y, z: z }; });
        polys.push({ kind: kind, points: polyArea(loop) > 0 ? pts : pts.slice().reverse(), holes: [], hole: polyArea(loop) < 0 });
      });
    });
    // Un patio cerrado es un agujero de la losa que lo rodea.
    const holes = polys.filter(function (p) { return p.hole; }), solid = polys.filter(function (p) { return !p.hole; });
    holes.forEach(function (h) { const owner = solid.find(function (p) { return p.points[0].z === h.points[0].z && inside(p.points, h.points[0]); }); if (owner) (owner.holes as Point3[][]).push(h.points); });
    solid.forEach(function (p) { delete p.hole; });
    return solid;
  }
  const loops = outline(rooms);
  if (!loops.length) return null;
  const P3 = function (p: Point): Point3 { return { x: p.x, y: p.y, z: r.heightAt(p.x, p.y) }; }, low = function (p: Point): Point3 { return { x: p.x, y: p.y, z: r.base }; };
  const outers: Point[][] = [], holes: Point[][] = [];
  loops.forEach(function (loop) { const off = offsetLoop(loop, w); (polyArea(loop) > 0 ? outers : holes).push(off); });
  // Las tejas a dos aguas se parten por la cumbrera: a cada lado, un plano.
  const ym = (r.y0 + r.y1) / 2, xm = (r.x0 + r.x1) / 2;
  const halves: (((p: Point) => number) | null)[] = r.type !== "tejas" ? [null] : r.alongX ? [function (p: Point) { return ym - p.y; }, function (p: Point) { return p.y - ym; }] : [function (p: Point) { return xm - p.x; }, function (p: Point) { return p.x - xm; }];
  outers.forEach(function (outer) {
    const mine = holes.filter(function (h) { return inside(outer, h[0]); });
    halves.forEach(function (keep) {
      const pts = keep ? clipPoly(outer, keep) : outer;
      if (pts.length < 3 || Math.abs(polyArea(pts)) < 1) return;
      const hs = mine.map(function (h) { return keep ? clipPoly(h, keep) : h; }).filter(function (h) { return h.length >= 3 && Math.abs(polyArea(h)) >= 1; });
      polys.push({ kind: kind, points: pts.map(P3), holes: hs.map(function (h) { return h.map(P3); }) });
    });
  });
  if (r.type !== "losa") {
    loops.forEach(function (loop) {
      const face = offsetLoop(loop, OUTER);
      face.forEach(function (f, i) { const g = face[(i + 1) % face.length]; polys.push({ kind: "ext", points: [low(f), low(g), P3(g), P3(f)] }); });
    });
  }
  return polys;
}
/* Triángulos de una cara del techo, como lista de sus puntos de a tres. Usa THREE.ShapeUtils (lo recibe en THREE,
   así este archivo sigue sin depender del motor): la cara puede ser cóncava y tener agujeros, y un abanico no alcanza. */
// any: THREE: el motor 3D, que este archivo recibe sin depender de él
function roofTriangles(poly: RoofPoly, THREE: any): Point3[] {
  const all = poly.points.concat(...(poly.holes || [])), out: Point3[] = [];
  if (!poly.holes && poly.points.length <= 4 && poly.kind === "ext") { // cerramiento: un cuadrilátero convexo
    for (let i = 1; i < poly.points.length - 1; i++) out.push(poly.points[0], poly.points[i], poly.points[i + 1]);
    return out;
  }
  const v2 = function (p: Point) { return new THREE.Vector2(p.x, p.y); };
  THREE.ShapeUtils.triangulateShape(poly.points.map(v2), (poly.holes || []).map(function (h) { return h.map(v2); })).forEach(function (t: number[]) { out.push(all[t[0]], all[t[1]], all[t[2]]); });
  return out;
}

// Caras del techo y cerramientos entre el muro y la cubierta. Con opts.footprint, el techo sigue la forma de la casa
// (vista 3D y render); sin eso, cubre el rectángulo que envuelve los muros (fachadas de las láminas).
function roofPolys(plan: Plan, opts?: { footprint?: boolean }): RoofPoly[] {
  const r = roofShape(plan);
  if (!r) return [];
  if (opts && opts.footprint) { const fit = footprintRoof(plan, r); if (fit) return fit; }
  const P3 = function (x: number, y: number): Point3 { return { x: x, y: y, z: r.heightAt(x, y) }; }, low = function (x: number, y: number): Point3 { return { x: x, y: y, z: r.base }; };
  const xm = (r.x0 + r.x1) / 2, ym = (r.y0 + r.y1) / 2, polys: RoofPoly[] = [], kind = "roof-" + r.type;
  if (r.type !== "tejas") polys.push({ kind: kind, points: [P3(r.x0, r.y0), P3(r.x1, r.y0), P3(r.x1, r.y1), P3(r.x0, r.y1)] });
  else if (r.alongX) polys.push({ kind: kind, points: [P3(r.x0, r.y0), P3(r.x1, r.y0), P3(r.x1, ym), P3(r.x0, ym)] }, { kind: kind, points: [P3(r.x0, ym), P3(r.x1, ym), P3(r.x1, r.y1), P3(r.x0, r.y1)] });
  else polys.push({ kind: kind, points: [P3(r.x0, r.y0), P3(xm, r.y0), P3(xm, r.y1), P3(r.x0, r.y1)] }, { kind: kind, points: [P3(xm, r.y0), P3(r.x1, r.y0), P3(r.x1, r.y1), P3(xm, r.y1)] });
  if (r.type === "losa") return polys;
  // Cerramiento sobre cada lado del rectángulo de muros, desde el nivel de encadenado hasta el techo.
  const a = { x: r.x0 + r.eave, y: r.y0 + r.eave }, b = { x: r.x1 - r.eave, y: r.y0 + r.eave }, c = { x: r.x1 - r.eave, y: r.y1 - r.eave }, d = { x: r.x0 + r.eave, y: r.y1 - r.eave };
  [[a, b], [b, c], [c, d], [d, a]].forEach(function (side) {
    const p = side[0], q = side[1], mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    polys.push({ kind: "ext", points: [low(p.x, p.y), low(q.x, q.y), P3(q.x, q.y), P3(mid.x, mid.y), P3(p.x, p.y)] });
  });
  return polys;
}

// Puntos de un arco de pared que va de a hasta b pasando por m. null si los tres puntos están alineados.
function arcPoints(a: Point, b: Point, m: Point): Point[] | null {
  const d = 2 * (a.x * (b.y - m.y) + b.x * (m.y - a.y) + m.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const qa = a.x * a.x + a.y * a.y, qb = b.x * b.x + b.y * b.y, qm = m.x * m.x + m.y * m.y;
  const cx = (qa * (b.y - m.y) + qb * (m.y - a.y) + qm * (a.y - b.y)) / d, cy = (qa * (m.x - b.x) + qb * (a.x - m.x) + qm * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy), TAU = Math.PI * 2;
  if (r > 20000) return null;
  const ang = function (p: Point) { return Math.atan2(p.y - cy, p.x - cx); }, norm = function (v: number) { return ((v % TAU) + TAU) % TAU; };
  const a0 = ang(a);
  let sweep = norm(ang(b) - a0);
  if (norm(ang(m) - a0) > sweep) sweep -= TAU; // se recorre por el lado que pasa por m
  const n = Math.max(4, Math.min(24, Math.ceil(Math.abs(sweep) * r / 45))), points = [{ x: a.x, y: a.y }];
  for (let i = 1; i < n; i++) points.push({ x: Math.round(cx + r * Math.cos(a0 + sweep * i / n)), y: Math.round(cy + r * Math.sin(a0 + sweep * i / n)) });
  return points.concat([{ x: b.x, y: b.y }]);
}

/* Corte vertical por la línea plan.section: muros cortados con sus vanos, contrapiso,
   entrepisos y perfil del techo. Devuelve un SVG, o "" si la línea no corta ningún muro. */
function sectionSVG(plan: Plan): string {
  const g = sectionData(plan, plan.section);
  if (!g) return "";
  const rects = g.rects, marks = g.marks, profile = g.profile, lo = g.lo, hi = g.hi, topZ = g.topZ, H = g.H;
  const pad = 110, left = lo - pad - 150, width = hi - lo + 2 * pad + 150, top = topZ + 70, font = Math.max(14, width / 46);
  const Y = function (z: number) { return n1(top - z); };
  let html = '<svg class="section-svg" viewBox="' + [n1(left), 0, n1(width), n1(top + 50)].join(" ") + '" role="img" aria-label="Corte vertical de la vivienda">' +
    '<line class="ground" x1="' + n1(left) + '" x2="' + n1(left + width) + '" y1="' + Y(-12) + '" y2="' + Y(-12) + '"/>';
  rects.forEach(function (r) { html += '<rect class="' + r.cls + '" x="' + n1(r.x) + '" y="' + Y(r.z1) + '" width="' + n1(r.w) + '" height="' + n1(r.z1 - r.z0) + '"/>'; });
  if (profile.length > 1) html += '<polyline class="roofline" points="' + profile.map(function (p) { return n1(p.d) + "," + Y(p.z); }).join(" ") + '"/>';
  marks.concat([{ z: marks[marks.length - 1].z + H, name: "" }]).forEach(function (m) {
    html += '<line class="level" x1="' + n1(left + 10) + '" x2="' + n1(lo - 20) + '" y1="' + Y(m.z) + '" y2="' + Y(m.z) + '"/>' +
      '<text x="' + n1(left + 10) + '" y="' + n1(top - m.z - font * 0.4) + '" font-size="' + n1(font) + '">' + (m.z >= 0 ? "+" : "") + E.fmt(m.z / 100, 2) + (m.name ? " " + m.name : "") + "</text>";
  });
  return html + "</svg>";
}

/* Geometría del corte por la línea cut = {a, b}, en cm: rects (x a lo largo de la línea, z0–z1 en altura;
   cls cut = muro cortado, void = abertura, slab = contrapiso o entrepiso), marks (nivel de cada planta) y
   profile (perfil del techo). null si la línea no corta ningún muro. La usan el panel y las láminas. */
/** Rectángulo del corte: x a lo largo de la línea, z0–z1 en altura. cls: cut = muro cortado, void = abertura, slab = losa o contrapiso. */
interface SectionRect {
  x: number;
  w: number;
  z0: number;
  z1: number;
  cls: "cut" | "void" | "slab";
}
function sectionData(plan: Plan, cut?: Section | null) {
  if (!cut || dist(cut.a, cut.b) < 10) return null;
  const s = settingsOf(plan), bricks = bricksOf(s), H = s.height, gap = D.finishes.storeyGap, L = dist(cut.a, cut.b);
  const rx = cut.b.x - cut.a.x, ry = cut.b.y - cut.a.y, rects: SectionRect[] = [], marks: { z: number; name: string }[] = [];
  let lo = Infinity, hi = -Infinity, topZ = 0;
  levelsOf(plan).forEach(function (level, i) {
    const base = i * (H + gap), v = survey(level, s, bricks);
    let from = Infinity, to = -Infinity;
    v.edges.forEach(function (e) {
      const sx = e.b.x - e.a.x, sy = e.b.y - e.a.y, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) return;
      const t = ((e.a.x - cut.a.x) * sy - (e.a.y - cut.a.y) * sx) / den, u = ((e.a.x - cut.a.x) * ry - (e.a.y - cut.a.y) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return;
      const w = e.thick / Math.max(Math.abs(den) / (L * Math.hypot(sx, sy)), 0.25), x = t * L - w / 2; // un corte oblicuo ensancha el muro
      const hit = { x: e.a.x + sx * u, y: e.a.y + sy * u }, wall = level.walls.find(function (q) { return q.id === e.wall; }) as Wall;
      const o = level.openings.find(function (q) { return q.wall === e.wall && dist(at(wall, q.t), hit) <= q.w / 2; });
      const sill = o ? Math.min(sillOf(o), Math.max(0, H - o.h)) : 0, lintel = o ? Math.min(H, sill + o.h) : 0;
      (o ? [[0, sill], [lintel, H]] : [[0, H]]).forEach(function (z) {
        if (z[1] - z[0] > 0.5) rects.push({ x: x, w: w, z0: base + z[0], z1: base + z[1], cls: "cut" });
      });
      if (o) rects.push({ x: x + w / 2 - 2, w: 4, z0: base + sill, z1: base + lintel, cls: "void" });
      from = Math.min(from, x); to = Math.max(to, x + w);
    });
    if (from > to) return;
    rects.push({ x: from, w: to - from, z0: base - (i ? gap : 12), z1: base, cls: "slab" });
    marks.push({ z: base, name: level.name });
    lo = Math.min(lo, from); hi = Math.max(hi, to); topZ = base + H;
  });
  if (lo > hi) return null;

  const roof = roofShape(plan), profile: { d: number; z: number }[] = [];
  if (roof) {
    for (let i = 0; i <= 40; i++) {
      const d = lo - roof.eave + (hi - lo + 2 * roof.eave) * i / 40, x = cut.a.x + rx * d / L, y = cut.a.y + ry * d / L;
      if (x < roof.x0 - 1 || x > roof.x1 + 1 || y < roof.y0 - 1 || y > roof.y1 + 1) continue;
      const z = roof.heightAt(x, y);
      profile.push({ d: d, z: z });
      topZ = Math.max(topZ, z);
    }
  }
  return { rects: rects, marks: marks, profile: profile, lo: lo, hi: hi, topZ: topZ, H: H };
}

/* Volúmenes para la vista 3D, en cm. Cada muro se parte según sus aberturas en tramos macizos,
   antepechos y dinteles; las ventanas llevan además un paño de vidrio. Las plantas se apilan y cada
   volumen dice a qué planta pertenece (level), para poder separarlas o recorrerlas.
   doors son las hojas de las puertas de abrir: solo las dibuja el render. */
/** Volumen de un tramo de muro o de un vidrio, entre a y b, de z0 a z1. */
export interface SolidBox {
  a: Point;
  b: Point;
  thick: number;
  z0: number;
  z1: number;
  kind: string;
  level: number;
}
/** Piso de un ambiente (con color y piso) o de una superficie exterior (con surface). */
export interface SolidFloor {
  points: Point[];
  z: number;
  level: number;
  color?: string;
  floor?: string;
  surface?: string;
}
export interface SolidItem {
  type: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  r: number;
  h: number;
  level: number;
}
/** Hoja de una puerta de abrir, para el render. */
export interface SolidDoor {
  a: Point;
  b: Point;
  z0: number;
  z1: number;
  level: number;
}
interface WallCut {
  from: number;
  to: number;
  sill: number;
  top: number;
  glass: boolean;
  leaf: boolean;
}

function solids(plan: Plan, opts?: { roof?: boolean }) {
  const s = settingsOf(plan), H = s.height, boxes: SolidBox[] = [], rooms: SolidFloor[] = [], items: SolidItem[] = [], doors: SolidDoor[] = [];
  const bricks = bricksOf(s);
  levelsOf(plan).forEach(function (level, index) {
    const base = index * (H + D.finishes.storeyGap), v = survey(level, s, bricks);
    v.edges.forEach(function (e) {
      const len = dist(e.a, e.b), wall = level.walls.find(function (w) { return w.id === e.wall; }) as Wall, cuts: WallCut[] = [], H = wallHeight(wall, s, e.t);
      level.openings.forEach(function (o) {
        if (o.wall !== e.wall) return;
        const c = at(wall, o.t), pos = ((c.x - e.a.x) * (e.b.x - e.a.x) + (c.y - e.a.y) * (e.b.y - e.a.y)) / len;
        if (pos < 0 || pos > len) return;
        const def = typeOf(o), sill = Math.min(sillOf(o), Math.max(0, H - o.h));
        cuts.push({ from: Math.max(0, pos - o.w / 2), to: Math.min(len, pos + o.w / 2), sill: sill, top: Math.min(H, sill + o.h), glass: def.group === "window" || def.symbol === "sliding", leaf: def.group === "door" && def.symbol !== "sliding" && def.symbol !== "open" });
      });
      cuts.sort(function (p, q) { return p.from - q.from; });
      // Los tramos que llegan a un extremo se alargan medio espesor para cerrar las esquinas.
      const piece = function (from: number, to: number, z0: number, z1: number, kind: string) {

        if (to - from < 0.5 || z1 - z0 < 0.5) return;
        const f = from === 0 ? -e.thick / 2 : from, t = to === len ? len + e.thick / 2 : to;
        boxes.push({ a: at(e, f / len), b: at(e, t / len), thick: kind === "glass" ? 3 : e.thick, z0: base + z0, z1: base + z1, kind: kind, level: index });
      };
      let pos = 0;
      cuts.forEach(function (c) {
        piece(pos, c.from, 0, H, e.cls);
        piece(c.from, c.to, 0, c.sill, e.cls);
        piece(c.from, c.to, c.top, H, e.cls);
        if (c.glass) piece(c.from, c.to, c.sill, c.top, "glass");
        if (c.leaf && c.to - c.from > 1) doors.push({ a: at(e, c.from / len), b: at(e, c.to / len), z0: base, z1: base + c.top, level: index });
        pos = Math.max(pos, c.to);
      });
      piece(pos, len, 0, H, e.cls);
    });
    v.rooms.forEach(function (r) { rooms.push({ points: r.points, z: base, level: index, color: r.color, floor: r.floor }); });
    level.surfaces.forEach(function (sf) {
      rooms.push({ z: base - 1, level: index, surface: D.surfaces[sf.type] ? sf.type : "patio", points: [{ x: sf.x, y: sf.y }, { x: sf.x + sf.w, y: sf.y }, { x: sf.x + sf.w, y: sf.y + sf.h }, { x: sf.x, y: sf.y + sf.h }] });
    });
    level.items.forEach(function (it) {
      const def = D.items[it.type];
      if (def && def.group !== "electricidad") items.push({ type: it.type, x: it.x, y: it.y, z: base, w: it.w, d: it.d, r: it.r || 0, h: it.tall || def.tall || 75, level: index });
    });
  });
  return { boxes: boxes, items: items, rooms: rooms, doors: doors, height: H, storey: H + D.finishes.storeyGap, levels: levelsOf(plan).length, roof: opts && opts.roof ? roofPolys(plan, { footprint: true }) : [] };
}

export const plan = {
  solids: solids,
  DEFAULTS: DEFAULTS, LEVEL_NAMES: LEVEL_NAMES, LEVEL_FIELDS: LEVEL_FIELDS, levelsOf: levelsOf, compute: compute,
  PHASES: PHASES, wallPhase: wallPhase, openingPhase: openingPhase, hasPhases: hasPhases,
  wallTypeList: wallTypeList, wallTypesOf: wallTypesOf, resolveType: resolveType, typeThick: typeThick, faceThick: faceThick, cleanType: cleanType, migrateWalls: migrateWalls, STD_FACES: STD,
  sillOf: sillOf, roofShape: roofShape, roofPolys: roofPolys, roofTriangles: roofTriangles, arcPoints: arcPoints, sectionSVG: sectionSVG, sectionData: sectionData, survey: survey, settingsOf: settingsOf, bricksOf: bricksOf, at: at, sample: sample, empty: empty, opening: opening, typeOf: typeOf, inside: inside,
  item: item, itemHit: itemHit, lineSVG: lineSVG, symbolSVG: symbolSVG, openingSVG: openingSVG, itemSVG: itemSVG, staticSVG: staticSVG,
  PALETTE: PALETTE, NOTE_KINDS: NOTE_KINDS, hex: hex, notePolys: notePolys, noteBox: noteBox, noteHit: noteHit, noteSVG: noteSVG, noteSize: noteSize, roomFill: roomFill, itemDraw: itemDraw, itemNameSize: itemNameSize
};
B.plan = plan;
