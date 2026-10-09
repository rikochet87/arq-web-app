/* CalcuObra — planillas del plano (como las "tablas de planificación" de Revit): se leen del modelo y
   se actualizan solas. Sin DOM.
   - Carpinterías: las aberturas iguales (mismo tipo, medida y fase) comparten un código: P1, P2… para
     puertas y V1, V2… para ventanas. Cambiar la medida de un código cambia todas sus aberturas.
   - Locales: cada ambiente con su superficie, perímetro, terminaciones y aberturas. Numerados L1, L2… en
     el mismo orden que la planilla de iluminación de las láminas.
   Las medidas salen de la vivienda terminada (sin lo demolido). */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const D = B.data, E = B.engine, P = B.plan;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const order = Object.keys(D.openings);

  // Ambientes a cada lado de una abertura: se prueba un punto a cada lado del muro, un poco más allá de su cara.
  function sidesOf(o, wall, v) {
    const p = P.at(wall, o.t), len = dist(wall.a, wall.b), off = (v.wallThick[wall.id] || 12) / 2 + 10;
    const nx = -(wall.b.y - wall.a.y) / len * off, ny = (wall.b.x - wall.a.x) / len * off;
    return [{ x: p.x + nx, y: p.y + ny }, { x: p.x - nx, y: p.y - ny }].map(function (q) { return v.rooms.find(function (r) { return P.inside(r.points, q); }) || null; });
  }

  // Recorre la vivienda una sola vez y arma las dos planillas.
  function build(plan) {
    const s = P.settingsOf(plan), bricks = P.bricksOf(s), levels = P.levelsOf(plan), multi = levels.length > 1;
    const roof = D.roofs[s.roof] ? s.roof : "none", top = levels.length - 1;
    const groups = {}, rooms = [];
    let n = 0;
    levels.forEach(function (lv, li) {
      const v = P.survey(lv, s, bricks), byWall = {};
      lv.walls.forEach(function (w) { byWall[w.id] = w; });
      const local = v.rooms.map(function (r) {
        const perim = r.points.reduce(function (q, p, i) { return q + dist(p, r.points[(i + 1) % r.points.length]); }, 0) / 100;
        const row = {
          code: "L" + (++n), level: li, levelName: lv.name, name: r.name, area: r.area, perimeter: perim, floor: r.floor,
          floorLabel: (D.floors[r.floor] || D.floors.ceramico).label, phase: r.phase, doors: 0, open: 0, codes: {},
          ceiling: li < top || roof === "losa" ? "Aplicado bajo losa" : roof === "chapa" || roof === "tejas" ? "Placa de yeso suspendida" : "—",
          cx: r.cx, cy: r.cy, points: r.points
        };
        rooms.push(row);
        return row;
      });
      lv.openings.forEach(function (o) {
        const wall = byWall[o.wall];
        if (!wall) return;
        const def = P.typeOf(o), phase = P.openingPhase(o, wall) === "nueva" ? "nueva" : "existente";
        const key = def.group + "|" + o.type + "|" + o.w + "|" + o.h + "|" + phase;
        const g = groups[key] = groups[key] || { group: def.group, type: o.type, label: def.label, w: o.w, h: o.h, sill: def.group === "window" ? def.sill || 0 : 0, phase: phase, ids: [], where: {} };
        g.ids.push(o.id);
        const sides = sidesOf(o, wall, v).map(function (r) { return r ? local[v.rooms.indexOf(r)] : null; });
        const names = sides.map(function (r) { return r ? (multi ? lv.name + " · " : "") + r.name : "exterior"; });
        if (sides[0] || sides[1]) {
          const place = names[0] === names[1] ? names[0] : names.slice().sort().join(" / ");
          g.where[place] = (g.where[place] || 0) + 1;
        }
        // Para cada local: superficie de vanos (se descuenta de las paredes) y ancho de puertas (sin zócalo).
        const area = o.w * Math.min(o.h, s.height) / 1e4;
        sides.forEach(function (r) {
          if (!r) return;
          r.open += area;
          if (def.group === "door") r.doors += o.w / 100;
          g.rooms = g.rooms || [];
          g.rooms.push(r);
        });
      });
    });

    // Códigos: puertas primero, en el orden de la biblioteca, después por medida; lo existente al final de cada tipo.
    const list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      return (a.group === b.group ? 0 : a.group === "door" ? -1 : 1) || order.indexOf(a.type) - order.indexOf(b.type) ||
        a.w - b.w || a.h - b.h || (a.phase === b.phase ? 0 : a.phase === "nueva" ? -1 : 1);
    });
    const count = { door: 0, window: 0 }, codeOf = {};
    list.forEach(function (g) {
      g.code = (g.group === "door" ? "P" : "V") + (++count[g.group]);
      g.count = g.ids.length;
      g.ids.forEach(function (id) { codeOf[id] = g.code; });
      (g.rooms || []).forEach(function (r) { r.codes[g.code] = true; });
      g.place = Object.keys(g.where).sort().map(function (k) { return k + (g.where[k] > 1 ? " (" + g.where[k] + ")" : ""); }).join(", ");
    });
    rooms.forEach(function (r) {
      r.walls = Math.max(0, r.perimeter * s.height / 100 - r.open);
      r.skirting = r.floor === "sin" ? 0 : Math.max(0, r.perimeter - r.doors);
      r.openings = Object.keys(r.codes).sort(function (a, b) { return a[0] === b[0] ? parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) : a < b ? -1 : 1; }).join(", ");
    });
    return { openings: list, rooms: rooms, codeOf: codeOf, multi: multi };
  }

  // Filas para mostrar o exportar, ya con formato.
  const fmt = (x, d) => E.fmt(x, d === undefined ? 2 : d);
  const PHASE = { nueva: "A construir", existente: "Existente" };
  function openingTable(t, phased) {
    const cols = ["Código", "Tipo", "Ancho (m)", "Alto (m)", "Antepecho (m)", "Cantidad", "Ubicación"].concat(phased ? ["Fase"] : []);
    const rows = t.openings.map(function (g) {
      return [g.code, g.label, fmt(g.w / 100), fmt(g.h / 100), g.group === "window" ? fmt(g.sill / 100) : "—", String(g.count), g.place || "—"].concat(phased ? [PHASE[g.phase]] : []);
    });
    return { cols: cols, rows: rows };
  }
  function roomTable(t, phased) {
    const cols = ["Local", "Ambiente", "Superficie (m²)", "Perímetro (m)", "Piso", "Zócalo (m)", "Paredes (m²)", "Cielorraso", "Aberturas"].concat(phased ? ["Fase"] : []);
    const rows = t.rooms.map(function (r) {
      return [r.code, (t.multi ? r.levelName + " · " : "") + r.name, fmt(r.area), fmt(r.perimeter), r.floorLabel, r.skirting ? fmt(r.skirting) : "—",
        fmt(r.walls), r.ceiling, r.openings || "—"].concat(phased ? [r.phase === "existente" ? "Existente" : "A construir"] : []);
    });
    return { cols: cols, rows: rows };
  }

  // CSV con punto y coma y BOM: Excel en castellano lo abre con las columnas separadas y los acentos bien.
  function csv(table) {
    const cell = (v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "﻿" + [table.cols].concat(table.rows).map(function (r) { return r.map(cell).join(";"); }).join("\r\n");
  }

  B.schedules = { build: build, openingTable: openingTable, roomTable: roomTable, csv: csv };
})();
