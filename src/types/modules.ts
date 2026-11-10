/* Lo que los módulos en TypeScript usan de los scripts que siguen en JavaScript (panel.js, lib/schedules.js,
   lib/budget.js, lib/costs.js y lib/apu.js). Describe solo esa parte: cuando cada script pase a TypeScript,
   estos tipos se reemplazan por los suyos. */
import type { Id, Plan, Point } from "./plan";

/* ---------- panel.js: panel a pantalla completa con pestañas ---------- */
export interface PanelApi {
  title: string;
  tabs?: { id: string; label: string }[];
  actions?: { id: string; label: string; ghost?: boolean }[];
  render(tab: string): string;
  change?(e: Event, tab: string): void;
  click?(e: Event, tab: string): void;
  action?(id: string, tab: string): void;
}
export interface PanelHandle {
  refresh(): void;
  close(): void;
  tab(): string;
}
export interface PanelModule {
  /** null si ya hay un panel abierto. */
  open(api: PanelApi): PanelHandle | null;
  esc(s: unknown): string;
}

/* ---------- lib/schedules.js: planillas de carpinterías y locales ---------- */
export interface ScheduleOpening {
  code: string;
  w: number;
  h: number;
  count: number;
  ids: Id[];
}
export interface ScheduleRoom {
  code: string;
  name: string;
  floor: string;
  area: number;
  points: Point[];
  cx: number;
  cy: number;
  level: number;
}
export interface Schedules {
  openings: ScheduleOpening[];
  rooms: ScheduleRoom[];
}
export interface ScheduleTable {
  cols: string[];
  rows: string[][];
}
export interface SchedulesModule {
  build(plan: Plan): Schedules;
  openingTable(t: Schedules, phased: boolean): ScheduleTable;
  roomTable(t: Schedules, phased: boolean): ScheduleTable;
  csv(table: ScheduleTable): string;
}

/* ---------- lib/budget.js: presupuesto del plano ---------- */
export interface BudgetLine {
  key: string;
  label: string;
  unit: string;
  qty: number;
  price: number | null;
  subtotal: number | null;
}
export interface BudgetRubro {
  title: string;
  note: string;
  lines: BudgetLine[];
  mat: number;
  mo: number;
  total: number;
}
/** Gastos generales, beneficio e IVA, en %. */
export interface Pase {
  gg: number;
  ben: number;
  iva: number;
}
export interface BudgetResult {
  rubros: BudgetRubro[];
  pase: Pase;
  missing: unknown[];
  phased: boolean;
  area: number;
  mat: number;
  mo: number;
  direct: number;
  gg: number;
  ben: number;
  net: number;
  iva: number;
  total: number;
}
export interface BudgetModule {
  build(plan: Plan, prices: Record<string, number>): BudgetResult;
  csv(b: BudgetResult): string;
  PASE: Pase;
}

/* ---------- lib/costs.js: precios y formato de dinero ---------- */
export interface CostsModule {
  money(x: number): string;
  clean(raw: unknown): Record<string, number>;
  priceOf(key: string, overrides: Record<string, number>): number | null;
}

/* ---------- lib/apu.js: presupuesto por rubros (página Presupuesto) ---------- */
export interface ApuStore {
  name: string;
  [key: string]: unknown;
}
export interface ApuModule {
  empty(): ApuStore;
  clean(raw: unknown): ApuStore;
  /** Pasa el presupuesto del plano a la página de presupuesto; devuelve los precios que suma. */
  fromPlan(store: ApuStore, planBudget: BudgetResult): Record<string, number>;
}

/* ---------- lib/sketch.js: boceto a mano → paredes y aberturas ---------- */
export interface SketchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
/** Abertura detectada en el boceto, en píxeles de la imagen. Las puertas traen bisagra (hx, hy) y punta de la hoja (tx, ty). */
export interface SketchOpening {
  kind: "door" | "window" | "open";
  x: number;
  y: number;
  w: number;
  horizontal: boolean;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
}
export interface SketchBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface SketchModule {
  vectorize(gray: Uint8Array, w: number, h: number, detail: number): { segments: SketchSegment[]; openings: SketchOpening[]; angle: number; box?: SketchBox };
}

/* ---------- lib/dxfin.js: lectura de DXF de AutoCAD ---------- */
export interface CadRegion {
  kind: string;
  box: unknown;
}
export interface CadModule {
  read(text: string): unknown;
  sheets?(drawing: unknown): { planta: number; regions: CadRegion[]; unit?: unknown };
  levelsIn(drawing: unknown, box: unknown): { v: number }[];
  toPlan(drawing: unknown, opts: unknown): { plan: unknown; stats: { walls: number; doors: number; windows: number; opens: number } };
}

/* ---------- lib/dxf.js: exportación a DXF ---------- */
export interface DxfModule {
  build(plan: Plan): string;
  layers: string[];
}
