/* CalcuObra — presupuesto de obra por rubros con análisis de precios. Funciones puras, sin DOM ni almacenamiento.
   Rubro = un trabajo que se mide en una unidad (1 m² de pared). Su análisis de precios dice qué materiales y cuántas
   horas lleva esa unidad; con los precios que cargó el usuario sale el precio unitario. El presupuesto es una lista
   de rubros con su cantidad (el cómputo).

   Lo que guarda cada usuario ("store"; quien llama lo lee y lo escribe en el navegador):
     { name, lines: [{id, code, qty}] (el cómputo), rubros: {código: rubro propio o del catálogo modificado},
       gone: [códigos del catálogo que el usuario borró], mats: {id: {label, unit}} (materiales propios),
       pase: {gg, ben, iva} en %, seq (contador para ids) }
   Los precios van aparte, en un mapa { ítem: precio } que comparten las calculadoras y el diseñador de planos.
   Ítems: clave de data.costs.prices, "m:n" (material propio), "r:código" (otro rubro) y, en un rubro de precio
   directo, "d:código:mat" y "d:código:mo".

   Control: pared de ladrillo común de 15 (3.1), con oficial a $ 10.000 la hora y ayudante a $ 8.000 →
   0,85 × 10.000 + 0,55 × 8.000 = $ 12.900 de mano de obra por m². */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const C = B.data.costs;
  const LABOR = ["oficial_esp", "oficial", "medio_oficial", "ayudante"];
  const PASE = { gg: 15, ben: 10, iva: 21 };
  const UNITS = ["m²", "m³", "m", "unidad", "global", "kg", "hora", "día"];
  const DEPTH = 4; // un rubro puede llevar otros rubros, hasta esta profundidad

  const isNum = (v) => typeof v === "number" && isFinite(v) && v >= 0 && v < 1e12;
  const text = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

  function empty() { return { name: "", lines: [], rubros: {}, gone: [], mats: {}, pase: null, seq: 1 }; }

  function cleanRubro(r, code) {
    if (!r || typeof r !== "object") return null;
    const comps = (Array.isArray(r.comps) ? r.comps : []).filter(function (c) { return Array.isArray(c) && typeof c[0] === "string" && c[0].length < 80 && isNum(c[1]); })
      .slice(0, 60).map(function (c) { return [c[0], c[1]]; });
    return { code: code, cat: text(r.cat, 60) || "Mis rubros", name: text(r.name, 120) || "Rubro sin nombre", unit: text(r.unit, 20) || "unidad", comps: comps, direct: !!r.direct, src: text(r.src, 12) };
  }

  // Acepta lo que vino guardado o de un archivo: descarta lo que no tenga la forma esperada.
  function clean(raw) {
    const s = empty();
    if (!raw || typeof raw !== "object") return s;
    s.name = text(raw.name, 80);
    // Los códigos con forma "3.1" son de la numeración anterior del catálogo: lo guardado con ellos ya no apunta a nada y se descarta.
    const old = function (code) { return /^\d+\.\d+$/.test(code); };
    Object.keys(raw.rubros || {}).slice(0, 500).forEach(function (code) {
      const r = old(code) ? null : cleanRubro(raw.rubros[code], text(code, 20));
      if (r && r.code) { r.comps = r.comps.filter(function (c) { return !old(c[0].replace(/^r:/, "")); }); s.rubros[r.code] = r; }
    });
    Object.keys(raw.mats || {}).slice(0, 1000).forEach(function (id) {
      const m = raw.mats[id];
      if (/^m:\d+$/.test(id) && m && text(m.label, 80)) s.mats[id] = { label: text(m.label, 80), unit: text(m.unit, 24) || "unidad" };
    });
    s.gone = (Array.isArray(raw.gone) ? raw.gone : []).filter(function (c) { return typeof c === "string" && !old(c); }).slice(0, 500);
    s.lines = (Array.isArray(raw.lines) ? raw.lines : []).filter(function (l) { return l && typeof l.code === "string" && !old(l.code) && isNum(l.qty); })
      .slice(0, 500).map(function (l, i) { return { id: Number(l.id) || i + 1, code: l.code, qty: l.qty }; });
    if (raw.pase && typeof raw.pase === "object") { s.pase = {}; Object.keys(PASE).forEach(function (k) { const v = Number(raw.pase[k]); s.pase[k] = isFinite(v) && v >= 0 && v <= 100 ? v : PASE[k]; }); }
    s.seq = Math.max(1, Number(raw.seq) || 1, s.lines.reduce(function (m, l) { return Math.max(m, l.id + 1); }, 1));
    return s;
  }

  /* Todo lo disponible para ese usuario: el catálogo con sus cambios, más sus rubros y materiales propios.
     rubros: en orden de código · by: por código · items: {id: {label, unit, labor, own}} */
  function book(store) {
    const by = {}, items = {};
    (B.data.rubros || []).forEach(function (r) {
      if (store.gone.indexOf(r.code) < 0) by[r.code] = Object.assign({}, r, { stock: true });
    });
    Object.keys(store.rubros).forEach(function (code) {
      by[code] = Object.assign({}, store.rubros[code], { stock: !!(B.data.rubros || []).some(function (r) { return r.code === code; }), own: true });
    });
    Object.keys(C.prices).forEach(function (id) { items[id] = { label: C.prices[id].label, unit: C.prices[id].unit, labor: LABOR.indexOf(id) >= 0 }; });
    Object.keys(store.mats).forEach(function (id) { items[id] = { label: store.mats[id].label, unit: store.mats[id].unit, own: true }; });
    // Los del catálogo van en el orden de la obra, que es el del catálogo; después, los propios por código.
    const stock = {};
    (B.data.rubros || []).forEach(function (r, i) { stock[r.code] = ("00000" + i).slice(-6); });
    const order = function (code) { return stock[code] || "~" + code.split(/[.\-]/).map(function (p) { return /^\d+$/.test(p) ? ("00000" + p).slice(-6) : "~" + p; }).join("."); };
    const rubros = Object.keys(by).map(function (c) { return by[c]; }).sort(function (p, q) { return order(p.code) < order(q.code) ? -1 : 1; });
    return { rubros: rubros, by: by, items: items };
  }

  const priceOf = function (id, prices) { const v = prices ? prices[id] : null; return isNum(v) ? v : null; };

  /* Análisis de precios de un rubro: sus líneas con precio y subtotal por unidad, y cuánto es material y cuánto mano de obra.
     missing: nombres de los ítems sin precio (el total no los incluye). */
  function analyse(rubro, bk, prices, depth) {
    const lines = [], missing = {};
    let mat = 0, mo = 0;
    if (rubro.direct) {
      [["mat", "Materiales"], ["mo", "Mano de obra"]].forEach(function (pair) {
        const id = "d:" + rubro.code + ":" + pair[0], price = priceOf(id, prices);
        lines.push({ id: id, label: rubro.name + ": " + pair[1].toLowerCase(), unit: rubro.unit, qty: 1, price: price, subtotal: price, labor: pair[0] === "mo" });
        if (pair[0] === "mo") mo += price || 0; else mat += price || 0;
      });
      if (lines[0].price == null && lines[1].price == null) missing[rubro.name] = true;
      return { lines: lines, mat: mat, mo: mo, total: mat + mo, missing: Object.keys(missing) };
    }
    rubro.comps.forEach(function (c, index) {
      const id = c[0], qty = c[1];
      if (id.indexOf("r:") === 0) { // otro rubro adentro de este
        const sub = bk.by[id.slice(2)];
        if (!sub || sub.code === rubro.code || (depth || 0) >= DEPTH) return;
        const a = analyse(sub, bk, prices, (depth || 0) + 1);
        lines.push({ index: index, id: id, label: sub.name, unit: sub.unit, qty: qty, price: a.total, subtotal: qty * a.total, rubro: sub.code, parts: a });
        mat += qty * a.mat; mo += qty * a.mo;
        a.missing.forEach(function (m) { missing[m] = true; });
        return;
      }
      const it = bk.items[id];
      if (!it) return; // material que ya no existe
      const price = priceOf(id, prices), sub = price == null ? null : qty * price;
      lines.push({ index: index, id: id, label: it.label, unit: it.unit, qty: qty, price: price, subtotal: sub, labor: !!it.labor });
      if (price == null) missing[it.label] = true;
      else if (it.labor) mo += sub; else mat += sub;
    });
    return { lines: lines, mat: mat, mo: mo, total: mat + mo, missing: Object.keys(missing) };
  }

  function paseOf(store) { return Object.assign({}, PASE, store.pase || {}); }

  /* Presupuesto: cada línea del cómputo con su precio unitario y subtotal; los totales con gastos generales,
     beneficio e IVA; y "needs", todo lo que hay que comprar y las horas que lleva la obra entera. */
  function budget(store, prices) {
    const bk = book(store), missing = {}, needs = {};
    let mat = 0, mo = 0;
    function gather(a, times) { // suma materiales y horas, abriendo los rubros que van adentro de otros
      a.lines.forEach(function (l) {
        if (l.parts) { gather(l.parts, times * l.qty); return; }
        const n = needs[l.id] || (needs[l.id] = { id: l.id, label: l.label, unit: l.unit, labor: l.labor, qty: 0, price: l.price, direct: l.id.indexOf("d:") === 0 });
        n.qty += times * l.qty;
      });
    }
    const lines = store.lines.map(function (l) {
      const rubro = bk.by[l.code];
      if (!rubro) return { id: l.id, code: l.code, qty: l.qty, lost: true, name: "Rubro borrado (" + l.code + ")", unit: "", unitPrice: 0, mat: 0, mo: 0, subtotal: 0, missing: [] };
      const a = analyse(rubro, bk, prices);
      a.missing.forEach(function (m) { missing[m] = true; });
      gather(a, l.qty);
      mat += l.qty * a.mat; mo += l.qty * a.mo;
      return { id: l.id, code: l.code, qty: l.qty, rubro: rubro, name: rubro.name, cat: rubro.cat, unit: rubro.unit, a: a, unitPrice: a.total, mat: l.qty * a.mat, mo: l.qty * a.mo, subtotal: l.qty * a.total, missing: a.missing };
    });
    const list = Object.keys(needs).map(function (k) { const n = needs[k]; n.subtotal = n.price == null ? null : n.qty * n.price; return n; })
      .sort(function (p, q) { return (p.labor ? 0 : 1) - (q.labor ? 0 : 1) || p.label.localeCompare(q.label); });
    const p = paseOf(store), direct = mat + mo, gg = direct * p.gg / 100, ben = (direct + gg) * p.ben / 100, net = direct + gg + ben, iva = net * p.iva / 100;
    return { lines: lines, needs: list, mat: mat, mo: mo, direct: direct, gg: gg, ben: ben, net: net, iva: iva, total: net + iva, pase: p, missing: Object.keys(missing), book: bk };
  }

  function csv(b, name) {
    const n = function (v) { return v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","); };
    const cell = function (v) { v = String(v == null ? "" : v); return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = [[name || "Presupuesto de obra"], [], ["N.º", "Rubro", "Trabajo", "Unidad", "Cantidad", "Precio unitario", "Materiales", "Mano de obra", "Subtotal"]];
    b.lines.forEach(function (l, i) { rows.push([i + 1, l.cat || "", l.name, l.unit, n(l.qty), n(l.unitPrice), n(l.mat), n(l.mo), n(l.subtotal)]); });
    rows.push([], ["", "", "Costo directo", "", "", "", n(b.mat), n(b.mo), n(b.direct)], ["", "", "Gastos generales " + b.pase.gg + " %", "", "", "", "", "", n(b.gg)],
      ["", "", "Beneficio " + b.pase.ben + " %", "", "", "", "", "", n(b.ben)], ["", "", "IVA " + b.pase.iva + " %", "", "", "", "", "", n(b.iva)], ["", "", "Precio final", "", "", "", "", "", n(b.total)],
      [], ["Materiales y mano de obra de toda la obra"], ["", "", "Ítem", "Unidad", "Cantidad", "Precio", "", "", "Subtotal"]);
    b.needs.forEach(function (x) { rows.push(["", x.labor ? "Mano de obra" : "Material", x.label, x.unit, n(x.qty), n(x.price), "", "", n(x.subtotal)]); });
    return "\ufeff" + rows.map(function (r) { return r.map(cell).join(";"); }).join("\r\n");
  }

  // ---------- Cambios sobre lo guardado ----------
  function newCode(store, prefix) {
    const taken = book(store).by;
    let n = 1;
    while (taken[prefix + "-" + n]) n++;
    return prefix + "-" + n;
  }
  function addLine(store, code, qty) { store.lines.push({ id: store.seq++, code: code, qty: isNum(qty) ? qty : 1 }); }
  function addMat(store, label, unit) {
    let n = 1;
    while (store.mats["m:" + n]) n++;
    store.mats["m:" + n] = { label: text(label, 80), unit: text(unit, 24) || "unidad" };
    return "m:" + n;
  }
  function removeRubro(store, code) {
    delete store.rubros[code];
    if ((B.data.rubros || []).some(function (r) { return r.code === code; }) && store.gone.indexOf(code) < 0) store.gone.push(code);
    store.lines = store.lines.filter(function (l) { return l.code !== code; });
  }

  /* Lo que calculó una calculadora pasa a ser un rubro propio con su línea en el cómputo.
     measure: {label, qty, unit} (lo que se midió) · items: [{key, qty}] (compra total) · hours: [oficial, ayudante] en total. */
  function fromCalc(store, measure, items, hours) {
    const code = newCode(store, "C"), comps = [];
    [["oficial", hours[0]], ["ayudante", hours[1]]].forEach(function (h) { if (h[1] > 0) comps.push([h[0], h[1] / measure.qty]); });
    items.forEach(function (it) { if (it.qty > 0 && C.prices[it.key]) comps.push([it.key, it.qty / measure.qty]); });
    store.rubros[code] = cleanRubro({ cat: "Desde las calculadoras", name: measure.label, unit: measure.unit, comps: comps, src: "calc" }, code);
    addLine(store, code, Math.round(measure.qty * 100) / 100);
    return code;
  }

  /* El presupuesto del diseñador de planos (lib/budget.js) pasa entero: un rubro global por cada rubro del plano.
     Reemplaza lo que se hubiera traído antes de un plano. Devuelve los precios propios del plano (aberturas, artefactos)
     como materiales nuevos: { id: precio } para sumar al mapa de precios. */
  function fromPlan(store, planBudget) {
    Object.keys(store.rubros).forEach(function (code) { if (store.rubros[code].src === "plano") removeRubro(store, code); });
    const prices = {};
    planBudget.rubros.forEach(function (r) {
      const code = newCode(store, "P"), comps = [];
      r.lines.forEach(function (l) {
        if (!(l.qty > 0)) return;
        let id = l.key;
        if (!C.prices[id]) { // precio propio del plano: una abertura, un artefacto
          id = Object.keys(store.mats).filter(function (m) { return store.mats[m].label === l.label; })[0] || addMat(store, l.label, l.unit || "unidad");
          if (l.price != null) prices[id] = l.price;
        }
        comps.push([id, l.qty]);
      });
      if (!comps.length) return;
      store.rubros[code] = cleanRubro({ cat: "Desde el plano", name: r.title, unit: "global", comps: comps, src: "plano" }, code);
      addLine(store, code, 1);
    });
    return prices;
  }

  B.apu = {
    LABOR: LABOR, PASE: PASE, UNITS: UNITS, empty: empty, clean: clean, cleanRubro: cleanRubro, book: book, priceOf: priceOf, analyse: analyse, budget: budget, csv: csv,
    newCode: newCode, addLine: addLine, addMat: addMat, removeRubro: removeRubro, fromCalc: fromCalc, fromPlan: fromPlan
  };
})();
