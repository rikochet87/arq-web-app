/* CalcuObra — presupuesto de obra a partir del plano. Funciones puras, sin DOM ni almacenamiento.
   Cantidades: las del cómputo (plan.compute(plan).qty), solo de la obra nueva.
   Precios: los de referencia de data.costs.prices, con los que el usuario cambió (overrides, compartidos con
   las calculadoras) y los propios de este plano (plan.budget.prices: aberturas, artefactos y bocas, claves "p:…").
   Mano de obra: horas de oficial y ayudante por unidad (data.costs.hours) × el jornal por hora.
   Precio final = costo directo + gastos generales + beneficio, y sobre eso el IVA (plan.budget.pase, en %).

   Control: 13 m² de muro de hueco 12 → 13 × (0,45 h × 13.122,59 + 0,5 h × 11.161,67) = $ 149.318 de mano de obra,
   igual que la calculadora de ladrillos. */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const D = B.data, E = B.engine, P = B.plan, C = D.costs;
  const PASE = { gg: 15, ben: 10, iva: 21 };
  const BAG = { cemento: D.materials.cemento.bag, cal: D.materials.cal.bag };

  function pase(plan) {
    const p = Object.assign({}, PASE, (plan.budget && plan.budget.pase) || {});
    Object.keys(PASE).forEach(function (k) { const v = Number(p[k]); p[k] = isFinite(v) && v >= 0 && v <= 100 ? v : PASE[k]; });
    return p;
  }

  function build(plan, overrides) {
    const model = P.compute(plan), q = model.qty, H = C.hours, own = (plan.budget && plan.budget.prices) || {};
    const priceOf = function (key) {
      if (key.indexOf("p:") === 0) { const v = own[key]; return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }
      return B.costs.priceOf(key, overrides);
    };
    const rubros = [];
    const rubro = function (title, note) { const r = { title: title, note: note || "", lines: [], h: [0, 0] }; rubros.push(r); return r; };
    const line = function (r, key, qty, label, unit) {
      if (!(qty > 0)) return;
      const ref = C.prices[key] || {};
      r.lines.push({ key: key, label: label || ref.label || key, unit: unit || ref.unit || "unidad", qty: qty, price: priceOf(key) });
    };
    const work = function (r, qty, hours) { if (qty > 0 && hours) { r.h[0] += qty * hours[0]; r.h[1] += qty * hours[1]; } };
    // Mezclas: cemento y cal en bolsas (con decimales: el total de la obra se compra en bolsas enteras), áridos en m³.
    const mix = function (r, m) {
      if (!m) return;
      if (m.cemento) line(r, "cemento", m.cemento / BAG.cemento);
      if (m.cal) line(r, "cal", m.cal / BAG.cal);
      ["arena", "piedra", "cascote"].forEach(function (k) { if (m[k]) line(r, k, m[k]); });
    };

    if (q.demo.area || q.demo.openings) {
      const r = rubro("Demolición", "Cargá el precio por m² de quien hace la demolición y el del contenedor.");
      line(r, "demolicion", q.demo.area);
      line(r, "contenedor", q.demo.containers);
    }
    if (q.walls.length) {
      const r = rubro("Mampostería");
      q.walls.forEach(function (w) {
        const h = H.wall[w.brick];
        line(r, h ? h.price : "lad_propio", w.units, D.bricks[w.brick].label);
        work(r, w.area, h ? h.h : H.wall.hueco12.h);
      });
      mix(r, q.wallMat);
    }
    if (q.ties && q.ties.concrete) {
      const r = rubro("Encadenados", "Hormigón y hierro de los encadenados que pide el CIRSOC 501-E, para toda la vivienda. No incluye mano de obra ni encofrado.");
      mix(r, q.ties.mat);
      line(r, "hierro", q.ties.steel);
    }
    if (q.plaster.grueso || q.plaster.fino) {
      const r = rubro("Revoques");
      mix(r, q.plaster.mat);
      line(r, "fino_bolsa", q.plaster.finoBags);
      work(r, q.plaster.azotado, H.plasterExt);
      work(r, Math.max(0, q.plaster.grueso - q.plaster.azotado), H.plasterInt);
    }
    if (q.slab.area) {
      const r = rubro("Contrapiso y carpeta");
      mix(r, q.slab.mat);
      work(r, q.slab.area, H.slab);
      if (q.slab.screed) work(r, q.slab.area, H.screed);
    }
    const floorKeys = Object.keys(q.floors).filter(function (k) { return q.floors[k] && D.floors[k] && D.floors[k].waste; });
    if (floorKeys.length || q.skirting) {
      const r = rubro("Pisos y zócalos");
      floorKeys.forEach(function (k) {
        const area = q.floors[k], key = k === "porcelanato" ? "porcelanato" : k === "flotante" ? "flotante" : "ceramico";
        line(r, key, area * (1 + D.floors[k].waste / 100), D.floors[k].label);
        work(r, area, H.floor);
      });
      line(r, "adhesivo", q.adhesive / D.tile.adhesiveBag);
      line(r, "zocalo", q.skirting);
      work(r, q.skirting, H.skirting);
    }
    if (q.roof.area) {
      const r = rubro("Cubierta"), a = q.roof.area;
      if (q.roof.type === "chapa") { line(r, "chapa", a * 1.1); line(r, "correa", a * 1.05); line(r, "aislacion", a * 1.1); work(r, a, H.roofSheet); }
      if (q.roof.type === "tejas") { line(r, "teja", E.ceil(a * D.finishes.tilesPerM2 * 1.05)); line(r, "aislacion", a * 1.1); work(r, a, H.roofSheet); }
      if (q.roof.type === "losa") line(r, "membrana", E.ceil(a * 1.15 / D.finishes.membrane));
      if (q.roof.type === "losa") r.note = "La losa se presupuesta aparte, según el cálculo estructural. Acá va la membrana.";
    }
    if (q.ceiling.boards) {
      const r = rubro("Cielorraso");
      line(r, "placa_yeso", q.ceiling.boards);
      work(r, q.ceiling.area, H.board);
    }
    if (q.paint.liters) {
      const r = rubro("Pintura");
      line(r, "pintura", q.paint.liters);
      work(r, q.paint.area, H.paint.map(function (x) { return x * q.paint.coats / 2; }));
      work(r, q.paint.ceiling, H.ceiling);
    }
    // Aberturas: una línea por código de la planilla de carpinterías, con el precio que cargue el usuario.
    const fresh = B.schedules ? B.schedules.build(plan).openings.filter(function (g) { return g.phase === "nueva" && D.openings[g.type].symbol !== "open"; }) : []; // un vano sin puerta no se compra
    if (fresh.length) {
      const r = rubro("Aberturas", "Cargá el precio de cada abertura colocada en obra (carpintería y herrajes). La mano de obra es la de amurarla.");
      fresh.forEach(function (g) {
        line(r, "p:ab:" + g.type + ":" + g.w + "x" + g.h, g.count, g.code + " · " + g.label + " " + E.fmt(g.w / 100, 2) + " × " + E.fmt(g.h / 100, 2) + " m");
        work(r, g.count, g.group === "door" ? H.door : g.w * g.h <= 5000 ? H.smallWindow : H.window);
      });
    }
    ["Artefactos", "Instalación eléctrica"].forEach(function (name) {
      const list = q.bills[name] || {}, labels = Object.keys(list).sort();
      if (!labels.length && !(name === "Instalación eléctrica" && q.conduit)) return;
      const r = rubro(name, "Cargá el precio de cada uno. La instalación sanitaria y la mano de obra de instalaciones se presupuestan aparte.");
      labels.forEach(function (label) { line(r, (name === "Artefactos" ? "p:art:" : "p:el:") + label, list[label], label); });
      if (name === "Instalación eléctrica" && q.conduit) { line(r, "cano", q.conduit); line(r, "cable", q.conduit * 3); }
    });
    if (q.outdoor.slab || q.outdoor.tiles) {
      const r = rubro("Exteriores");
      mix(r, q.outdoor.mat);
      line(r, "ceramico", q.outdoor.tiles, "Piso exterior");
      work(r, q.outdoor.area, H.slab);
      work(r, q.outdoor.tiles / 1.1, H.floor);
    }

    // Mano de obra de cada rubro y totales.
    const missing = {};
    let mat = 0, mo = 0;
    rubros.forEach(function (r) {
      ["oficial", "ayudante"].forEach(function (k, i) { if (r.h[i] > 0) r.lines.push({ key: k, label: "Mano de obra: " + C.prices[k].label.toLowerCase(), unit: "hora", qty: r.h[i], price: priceOf(k), labor: true }); });
      r.mat = 0; r.mo = 0;
      r.lines.forEach(function (l) {
        l.subtotal = l.price == null ? null : l.qty * l.price;
        if (l.price == null) missing[l.label] = true;
        if (l.labor) r.mo += l.subtotal || 0; else r.mat += l.subtotal || 0;
      });
      r.total = r.mat + r.mo;
      mat += r.mat; mo += r.mo;
    });
    const p = pase(plan), direct = mat + mo, gg = direct * p.gg / 100, ben = (direct + gg) * p.ben / 100, net = direct + gg + ben, iva = net * p.iva / 100;
    return {
      rubros: rubros.filter(function (r) { return r.lines.length; }), mat: mat, mo: mo, direct: direct, gg: gg, ben: ben, net: net, iva: iva, total: net + iva,
      pase: p, missing: Object.keys(missing), area: q.slab.area, date: C.date, phased: model.phased
    };
  }

  function csv(b) {
    const cell = (v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const n = (x, d) => x == null ? "" : E.fmt(x, d === undefined ? 2 : d);
    const rows = [["Rubro", "Ítem", "Cantidad", "Unidad", "Precio unitario", "Subtotal"]];
    b.rubros.forEach(function (r) {
      r.lines.forEach(function (l) { rows.push([r.title, l.label, n(l.qty), l.unit, n(l.price), n(l.subtotal)]); });
      rows.push([r.title, "Total del rubro", "", "", "", n(r.total)]);
    });
    rows.push([], ["", "Costo directo", "", "", "", n(b.direct)], ["", "Gastos generales " + b.pase.gg + " %", "", "", "", n(b.gg)],
      ["", "Beneficio " + b.pase.ben + " %", "", "", "", n(b.ben)], ["", "IVA " + b.pase.iva + " %", "", "", "", n(b.iva)], ["", "Precio final", "", "", "", n(b.total)]);
    return "﻿" + rows.map(function (r) { return r.map(cell).join(";"); }).join("\r\n");
  }

  B.budget = { build: build, csv: csv, PASE: PASE };
})();
