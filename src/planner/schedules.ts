/* Planillas de carpinterías y locales: se leen del plano y lo que se edita en la tabla vuelve al plano. */
import { engine as E } from "../../lib/calc";
import { data as D } from "../../lib/manifest";
import { plan as P } from "../../lib/plan";
import type { RoomLabel } from "../types/plan";
import type { Schedules } from "../types/modules";
import type { EditorContext } from "./context";
import { download, fileName } from "./files";

export function openSchedules(ed: EditorContext) {
  const brand = window.__BRAND__, hint = ed.hint;
  const S = brand.schedules, U = brand.panel;
  if (!S || !U) return;
  if (!P.levelsOf(ed.plan).some((lv) => lv.walls.length)) { hint.textContent = "Dibujá al menos un ambiente para armar las planillas."; return; }
  const esc = U.esc, levelData = (li: number) => (li === (ed.plan.level || 0) ? ed.plan : (ed.plan.levels || [])[li]);
  let t: Schedules | null = null;
  const input = (key: string, value: string, attrs: string) => '<input type="text" inputmode="decimal" autocomplete="off" data-key="' + key + '" value="' + esc(value) + '"' + attrs + ">";
  function table(cols: string[], body: string) {
    return '<div class="sp-scroll"><table class="sp-table"><thead><tr>' + cols.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }
  function render(tab: string): string {
    const plan = ed.plan, sched = S!.build(plan);
    t = sched;
    const phased = P.hasPhases(plan);
    if (tab === "rooms") {
      const head = S!.roomTable(sched, phased).cols;
      const body = sched.rooms.map((r, i) => {
        const cells = S!.roomTable(sched, phased).rows[i];
        cells[1] = '<input type="text" autocomplete="off" maxlength="40" data-key="r-name-' + i + '" data-room="' + i + '" data-field="name" value="' + esc(r.name) + '" aria-label="Nombre de ' + esc(r.code) + '">';
        cells[4] = '<select data-key="r-floor-' + i + '" data-room="' + i + '" data-field="floor" aria-label="Piso de ' + esc(r.code) + '">' + Object.keys(D.floors).map((k) => '<option value="' + k + '"' + (k === r.floor ? " selected" : "") + ">" + esc(D.floors[k].label) + "</option>").join("") + "</select>";
        return "<tr>" + cells.map((c, j) => "<td" + (j === 2 || j === 3 || j === 5 || j === 6 ? ' class="num"' : "") + ">" + (j === 1 || j === 4 ? c : esc(c)) + "</td>").join("") + "</tr>";
      }).join("");
      const total = sched.rooms.reduce((a, r) => a + r.area, 0);
      return '<p class="sp-sum">' + sched.rooms.length + " locales · " + E.fmt(total, 2) + " m² de superficie útil. El nombre y el piso se cambian acá mismo y pasan al plano.</p>" + table(head, body);
    }
    const head = S!.openingTable(sched, phased).cols;
    const body = sched.openings.map((g, i) => {
      const cells = S!.openingTable(sched, phased).rows[i];
      cells[2] = input("o-w-" + g.code, E.fmt(g.w / 100, 2), ' data-open="' + i + '" data-field="w" aria-label="Ancho de ' + g.code + ' en metros"');
      cells[3] = input("o-h-" + g.code, E.fmt(g.h / 100, 2), ' data-open="' + i + '" data-field="h" aria-label="Alto de ' + g.code + ' en metros"');
      return "<tr>" + cells.map((c, j) => "<td" + (j >= 2 && j <= 5 ? ' class="num"' : "") + ">" + (j === 0 ? '<span class="sp-code">' + esc(c) + "</span>" : j === 2 || j === 3 ? c : esc(c)) + "</td>").join("") + "</tr>";
    }).join("");
    const n = sched.openings.reduce((a, g) => a + g.count, 0);
    return '<p class="sp-sum">' + sched.openings.length + " códigos · " + n + " aberturas. Las aberturas iguales comparten código: si cambiás el ancho o el alto de un código, cambian todas.</p>" +
      (sched.openings.length ? table(head, body) : '<p class="ws-tip">Todavía no hay puertas ni ventanas en el plano.</p>');
  }
  function change(e: Event) {
    const el = e.target as HTMLInputElement, field = el.getAttribute("data-field");
    if (!field || !t) return;
    if (el.hasAttribute("data-open")) {
      const g = t.openings[+(el.getAttribute("data-open") as string)], v = E.parseNum(el.value);
      if (!(v >= 0.3 && v <= (field === "w" ? 6 : 3.5))) { el.setAttribute("aria-invalid", "true"); return; }
      ed.pushHistory();
      P.levelsOf(ed.plan, "todo").forEach(function (_lv, li) {
        (levelData(li).openings || []).forEach(function (o) { if (g.ids.indexOf(o.id) >= 0) o[field as "w" | "h"] = Math.round(v * 100); });
      });
    } else if (el.hasAttribute("data-room")) {
      const r = t.rooms[+(el.getAttribute("data-room") as string)], data = levelData(r.level);
      if (field === "name" && !el.value.trim()) return;
      ed.pushHistory();
      data.labels = data.labels || [];
      let tag: RoomLabel | undefined = data.labels.find((l) => P.inside(r.points, l));
      if (!tag) { tag = { x: Math.round(r.cx), y: Math.round(r.cy), name: r.name, floor: r.floor }; data.labels.push(tag); }
      tag[field as "name" | "floor"] = field === "name" ? el.value.trim().slice(0, 40) : el.value;
    } else return;
    ed.commit(ed.sel);
    (panel as NonNullable<typeof panel>).refresh();
  }
  const panel = U.open({
    title: "Planillas", tabs: [{ id: "openings", label: "Carpinterías" }, { id: "rooms", label: "Locales" }],
    actions: [{ id: "csv", label: "Descargar para Excel" }, { id: "print", label: "Imprimir", ghost: true }],
    render: render, change: change,
    action: function (id, tab) {
      if (id === "print") { window.print(); return; }
      const plan = ed.plan, phased = P.hasPhases(plan), data = tab === "rooms" ? S.roomTable(S.build(plan), phased) : S.openingTable(S.build(plan), phased);
      download(fileName(plan.name, "csv").replace(/\.csv$/, tab === "rooms" ? "-locales.csv" : "-carpinterias.csv"), new Blob([S.csv(data)], { type: "text/csv;charset=utf-8" }));
    }
  });
}

