/* CalcuObra — costo estimado. Funciones puras, sin DOM ni almacenamiento.
   Recibe el `cost` que devuelve una calculadora ({ items: [{key, qty}], work: [{label, qty, unit, h}] })
   y los precios que el usuario cambió ({ clave: precio | null }), y arma las líneas y los totales.
   Precio null o vacío = sin precio: la línea se muestra pero no suma, y el total queda marcado como parcial.

   Control: 13 m² de hueco 12 (5 × 2,6 m) → mano de obra = 13 × 0,45 = 5,85 h de oficial y 13 × 0,5 = 6,5 h
   de ayudante → 5,85 × 13.122,59 + 6,5 × 11.161,67 = 76.767 + 72.551 = $ 149.318. */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const C = B.data.costs;

  // Precio vigente de una clave: el del usuario si lo cargó, si no el de referencia.
  function priceOf(key, overrides) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      const p = overrides[key];
      return p == null || !isFinite(p) || p < 0 ? null : p;
    }
    return C.prices[key] ? C.prices[key].price : null;
  }

  const sub = (qty, price) => price == null ? null : qty * price;

  function estimate(cost, overrides) {
    const materials = cost.items.filter(function (it) { return it.qty > 0; }).map(function (it) {
      const ref = C.prices[it.key] || { label: it.key, unit: "" };
      const price = priceOf(it.key, overrides);
      return { key: it.key, label: ref.label, unit: ref.unit, qty: it.qty, price: price, subtotal: sub(it.qty, price) };
    });

    // Las horas de todos los trabajos se juntan en dos líneas: oficial y ayudante.
    const hours = [0, 0];
    cost.work.forEach(function (w) { hours[0] += w.qty * w.h[0]; hours[1] += w.qty * w.h[1]; });
    const labor = ["oficial", "ayudante"].map(function (key, i) {
      const price = priceOf(key, overrides);
      return { key: key, label: C.prices[key].label, unit: C.prices[key].unit, qty: hours[i], price: price, subtotal: sub(hours[i], price) };
    }).filter(function (l) { return l.qty > 0; });

    const sum = (lines) => lines.reduce(function (s, l) { return s + (l.subtotal || 0); }, 0);
    const missing = materials.concat(labor).filter(function (l) { return l.price == null; }).map(function (l) { return l.label; });
    const totals = { materials: sum(materials), labor: sum(labor) };
    totals.total = totals.materials + totals.labor;
    return { materials: materials, labor: labor, work: cost.work, totals: totals, missing: missing, notes: cost.notes || [] };
  }

  // Descarta claves desconocidas y valores raros de lo que vino guardado.
  function clean(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (k) {
      if (!C.prices[k]) return;
      const v = raw[k];
      if (v === null || (typeof v === "number" && isFinite(v) && v >= 0 && v < 1e12)) out[k] = v;
    });
    return out;
  }

  function money(x) {
    return "$ " + Math.round(x).toLocaleString("es-AR", { useGrouping: "always" });
  }

  B.costs = { date: C.date, estimate: estimate, priceOf: priceOf, clean: clean, money: money };
})();
