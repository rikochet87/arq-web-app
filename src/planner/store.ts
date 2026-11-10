/* Guardado del plano en el navegador, historial para deshacer y rehacer, biblioteca personal de muebles y arranque
   (plano guardado, casa de muestra con #ejemplo o plano subido en la portada con #importado). */
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { Level, LevelData, Note, Plan } from "../types/plan";
import { HANDOFF, OPTIONS, SHELF, SHELF_MAX, STORE } from "./constants";
import { commit } from "./edit";
import type { ShelfItem } from "./library";
import { syncSettings } from "./settings";
import { st } from "./state";

const NOTES: Record<string, string> = P.NOTE_KINDS;
/* Un plano tal como llega de un archivo o del navegador, antes de revisarlo. */
interface RawLevel {
  name?: string;
  [field: string]: unknown;
}
interface RawPlan {
  walls?: unknown;
  openings?: { type: string; kind?: string }[];
  labels?: unknown[];
  wires?: unknown[];
  surfaces?: unknown[];
  items?: { type: string }[];
  notes?: unknown;
  levels?: RawLevel[] | Level[];
  level?: number;
  variants?: unknown;
  variant?: number;
  [key: string]: unknown;
}

function load(): Plan | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) as string);
    return normalize(saved);
  } catch (e) { return null; }
}
// Acepta planos guardados por versiones anteriores y archivos abiertos desde el disco.
export function normalize(raw: unknown): Plan | null {
  const saved = raw as RawPlan;
  if (!saved || !Array.isArray(saved.walls) || !Array.isArray(saved.openings)) return null;
  saved.labels = saved.labels || [];
  saved.wires = saved.wires || [];
  saved.surfaces = saved.surfaces || [];
  saved.items = (saved.items || []).filter(function (it) { return D.items[it.type]; });
  saved.openings.forEach(function (o) { if (!D.openings[o.type]) o.type = o.kind === "window" ? "v120" : "p80"; });
  saved.notes = cleanNotes(saved.notes);
  const levels = cleanLevels(saved.levels as RawLevel[] | undefined);
  saved.levels = levels;
  saved.level = Math.min(saved.level || 0, Math.max(0, levels.length - 1));
  const variants: { levels: RawLevel[]; level?: number; section?: unknown }[] = Array.isArray(saved.variants) ? saved.variants : [];
  saved.variants = variants.filter(function (v) { return v && Array.isArray(v.levels) && v.levels.length; }).slice(0, OPTIONS.length)
    .map(function (v) { const levels = cleanLevels(v.levels); return { levels: levels, level: Math.min(v.level || 0, levels.length - 1), section: v.section || null }; });
  saved.variant = Math.min(saved.variant || 0, Math.max(0, (saved.variants as unknown[]).length - 1));
  P.migrateWalls(saved as Partial<Plan>); // ladrillo por muro (planos viejos) → tipos de muro
  return saved as unknown as Plan;
}
// Biblioteca personal: solo entradas de un tipo conocido y con medidas.
export function loadShelf(): ShelfItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(SHELF) as string);
    const items: { id: unknown; type: string; name?: string; w: number; d: number; tall?: number; shape?: string }[] = Array.isArray(list) ? list : [];
    return items.filter((o) => o && D.items[o.type] && o.w >= 5 && o.d >= 5 && /^[a-z0-9]+$/.test(String(o.id))).slice(0, SHELF_MAX)
      .map((o): ShelfItem => ({ id: String(o.id), type: o.type, name: String(o.name || D.items[o.type].label).slice(0, 40), w: Math.round(o.w), d: Math.round(o.d), tall: (o.tall as number) >= 5 ? Math.round(o.tall as number) : undefined, shape: o.shape === "round" ? "round" : undefined }));
  } catch (e) { return []; }
}
export function saveShelf() { try { localStorage.setItem(SHELF, JSON.stringify(st.shelf)); } catch (e) { /* sin almacenamiento */ } }
// Anotaciones bien formadas: un tipo conocido y puntos con números.
function cleanNotes(list: unknown): Note[] {
  const notes: Note[] = Array.isArray(list) ? list : [];
  return notes.filter(function (nt) {
    return nt && NOTES[nt.kind] && Array.isArray(nt.pts) && nt.pts.length >= (nt.kind === "text" ? 1 : 2) && nt.pts.every(function (q) { return q && isFinite(q.x) && isFinite(q.y); });
  });
}
function cleanLevels(list: RawLevel[] | undefined): Level[] {
  return (list || []).map(function (lv, i) {
    const level = { name: lv.name || P.LEVEL_NAMES[i] } as LevelData;
    P.LEVEL_FIELDS.forEach(function (f) { (level as unknown as RawLevel)[f] = lv[f] || []; });
    level.items = level.items.filter(function (it) { return D.items[it.type]; });
    level.notes = cleanNotes(level.notes);
    return level;
  });
}
// Arranca con el plano guardado o vacío. Con #ejemplo en la dirección carga la casa de muestra y con
// #importado el plano que se subió en la portada (el plano guardado, si había, queda a un "Deshacer" de distancia).
export function start(): Plan {
  const saved = load();
  let fresh: Plan | null = null;
  if (location.hash === "#ejemplo") fresh = P.sample();
  else if (location.hash === "#importado") {
    try { fresh = normalize(JSON.parse(localStorage.getItem(HANDOFF) as string)); localStorage.removeItem(HANDOFF); } catch (e) { /* sin almacenamiento */ }
  }
  if (!fresh) return saved || P.empty();
  if (saved && saved.walls.length) st.history.push(JSON.stringify(Object.assign({}, saved, { ref: undefined })));
  try { window.history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
  return fresh;
}
// La imagen de referencia pesa mucho: no entra en el historial y, si no cabe, tampoco en el guardado.
export const snapshot = () => JSON.stringify(Object.assign({}, st.plan, { ref: undefined }));
export function save() {
  try { localStorage.setItem(STORE, JSON.stringify(st.plan)); }
  catch (e) { try { localStorage.setItem(STORE, snapshot()); } catch (err) { /* sin almacenamiento */ } }
}
export function pushHistory() { st.history.push(snapshot()); if (st.history.length > 60) st.history.shift(); st.future.length = 0; }
/** Deshacer (from = historial, to = rehacer) o rehacer (al revés). La imagen de referencia se conserva. */
export function restore(from: string[], to: string[]) {
  if (!from.length) return;
  const ref = st.plan.ref;
  to.push(snapshot());
  st.plan = JSON.parse(from.pop() as string);
  st.plan.ref = ref;
  st.chain = null;
  commit(null);
  syncSettings();
}
