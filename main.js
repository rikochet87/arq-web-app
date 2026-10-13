/* CalcuObra — interfaz: lee el formulario, llama al motor (lib/calc.js) y pinta el resultado. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const engine = brand.engine;

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------- Costo estimado ----------
     Los precios que cambia el usuario se guardan en este navegador y valen para todas las calculadoras. */
  const costs = brand.costs;
  const PRICE_KEY = "calcuobra.precios.v1";
  function loadPrices() {
    try { return costs.clean(JSON.parse(localStorage.getItem(PRICE_KEY) || "{}")); } catch (e) { return {}; }
  }
  function savePrices(p) {
    try {
      if (Object.keys(p).length) localStorage.setItem(PRICE_KEY, JSON.stringify(p));
      else localStorage.removeItem(PRICE_KEY);
    } catch (e) { /* sin almacenamiento: los cambios valen hasta recargar */ }
  }
  let prices = costs ? loadPrices() : {};

  const num = (x, d) => x.toLocaleString("es-AR", { maximumFractionDigits: d, useGrouping: "always" });
  const PLURALS = { unidad: "unidades", litro: "litros", hora: "horas" };
  const unitsOf = (unit, n) => n === 1 ? unit : (PLURALS[unit] || unit.replace(/^bolsa /, "bolsas "));
  const subText = (l) => l.subtotal == null ? "Sin precio" : costs.money(l.subtotal);

  function costLineHTML(l) {
    const qty = num(l.qty, l.key === "oficial" || l.key === "ayudante" ? 1 : 2);
    return '<div class="cost-line">' +
      '<span class="cost-name">' + escHTML(l.label) + '</span>' +
      '<span class="cost-sub' + (l.subtotal == null ? " is-empty" : "") + '" data-sub="' + escHTML(l.key) + '">' + escHTML(subText(l)) + "</span>" +
      '<span class="cost-qty">' + escHTML(qty + " " + unitsOf(l.unit, l.qty)) + " ×</span>" +
      '<label class="cost-price"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"' +
      ' data-price="' + escHTML(l.key) + '" value="' + escHTML(l.price == null ? "" : num(l.price, 2)) + '" placeholder="Cargá el precio"' +
      ' aria-label="Precio de ' + escHTML(l.label.toLowerCase()) + " por " + escHTML(l.unit) + '"><span class="cost-per">por ' + escHTML(l.unit.replace(/ de .*$/, "")) + "</span></label>" +
      "</div>";
  }

  function costHTML(est, open) {
    const t = est.totals;
    const work = est.work.map(function (w) { return w.label + ": " + num(w.qty, 1) + " " + w.unit; }).join(" · ");
    const notes = est.notes.concat(["Es precio de costo: no incluye flete, gastos generales, beneficio ni IVA."]);
    return '<details class="cost" data-cost' + (open ? " open" : "") + ">" +
      '<summary><span class="cost-head"><span class="cost-title">Costo estimado</span>' +
      '<span class="cost-flag" data-t="flag"' + (est.missing.length ? "" : " hidden") + ">" + escHTML(flagText(est)) + "</span></span>" +
      '<span class="cost-total" data-t="summary">' + escHTML(costs.money(est.totals.total)) + "</span></summary>" +
      '<div class="cost-body">' +
      '<p class="cost-meta">Precios de referencia de ' + escHTML(costs.date) + ". Cambiá los que quieras: tus precios quedan guardados en este dispositivo.</p>" +
      '<h3 class="result-section">Materiales</h3>' + est.materials.map(costLineHTML).join("") +
      (est.labor.length ? '<h3 class="result-section">Mano de obra</h3>' + est.labor.map(costLineHTML).join("") +
        '<p class="cost-work">' + escHTML(work) + "</p>" : "") +
      '<dl class="result-rows cost-totals">' +
      "<div><dt>Materiales</dt><dd data-t=\"materials\">" + costs.money(t.materials) + "</dd></div>" +
      (est.labor.length ? "<div><dt>Mano de obra</dt><dd data-t=\"labor\">" + costs.money(t.labor) + "</dd></div>" : "") +
      '<div class="cost-grand"><dt>Total</dt><dd data-t="total">' + costs.money(t.total) + "</dd></div></dl>" +
      '<p class="cost-missing" data-t="missing"' + (est.missing.length ? "" : " hidden") + ">" + escHTML(missingText(est)) + "</p>" +
      '<ul class="result-notes">' + notes.map(function (n) { return "<li>" + escHTML(n) + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-cost-reset' + (Object.keys(prices).length ? "" : " hidden") + ">Volver a los precios de referencia</button>" +
      "</div></details>";
  }

  const flagText = (est) => est.missing.length === 1 ? "Falta 1 precio" : "Faltan " + est.missing.length + " precios";
  const missingText = (est) => est.missing.length ? "Falta el precio de: " + est.missing.join(", ") + ". El total no lo incluye." : "";

  function costTextLine(est) {
    const t = est.totals;
    return "• Costo estimado: " + costs.money(t.total) + " (materiales " + costs.money(t.materials) +
      (est.labor.length ? ", mano de obra " + costs.money(t.labor) : "") + "; precios de " + costs.date + ", sin IVA" +
      (est.missing.length ? "; falta el precio de " + est.missing.join(", ") : "") + ")";
  }

  // Actualiza números del panel sin rehacer los campos (así no se pierde el foco al tipear un precio).
  function paintCost(panel, est) {
    est.materials.concat(est.labor).forEach(function (l) {
      const cell = $('[data-sub="' + l.key + '"]', panel);
      if (!cell) return;
      cell.textContent = subText(l);
      cell.classList.toggle("is-empty", l.subtotal == null);
    });
    const set = function (k, text) { const el = $('[data-t="' + k + '"]', panel); if (el) el.textContent = text; };
    set("summary", costs.money(est.totals.total));
    set("flag", flagText(est));
    $('[data-t="flag"]', panel).hidden = !est.missing.length;
    set("materials", costs.money(est.totals.materials));
    set("labor", costs.money(est.totals.labor));
    set("total", costs.money(est.totals.total));
    const miss = $('[data-t="missing"]', panel);
    miss.textContent = missingText(est);
    miss.hidden = !est.missing.length;
    $("[data-cost-reset]", panel).hidden = !Object.keys(prices).length;
  }

  const fieldValue = (el) => el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value;

  // data-show-if="campo=valor|otroValor": el campo solo se ve (y solo cuenta) si coincide.
  function applyShowIf(form) {
    $$("[data-show-if]", form).forEach(function (box) {
      const parts = box.getAttribute("data-show-if").split("=");
      const source = form.elements[parts[0]];
      box.hidden = !source || parts[1].split("|").indexOf(fieldValue(source)) === -1;
    });
  }

  function readForm(form) {
    const values = {};
    $$("input, select", form).forEach(function (el) {
      if (!el.name || el.closest("[hidden]")) return;
      values[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return values;
  }

  function stairSVG(s) {
    const width = (s.n - 1) * s.h, height = s.n * s.c;
    let d = "M0 " + height;
    for (let i = 0; i < s.n; i++) {
      d += " v" + (-s.c);
      if (i < s.n - 1) d += " h" + s.h;
    }
    const pad = Math.max(width, height) * 0.04;
    return '<svg class="stair" viewBox="' + [-pad, -pad, width + 2 * pad, height + 2 * pad].join(" ") +
      '" role="img" aria-label="Perfil de la escalera"><path d="' + d + " V" + height +
      ' Z" vector-effect="non-scaling-stroke"/></svg>';
  }

  function resultHTML(result, est, costOpen) {
    const main = result.main.map(function (m) {
      return '<div class="stat"><span class="stat-label">' + escHTML(m.label) + '</span><span class="stat-value">' +
        escHTML(m.value) + '</span><span class="stat-unit">' + escHTML(m.unit) + "</span></div>";
    }).join("");
    const rows = result.rows.map(function (row) {
      return "<div><dt>" + escHTML(row.label) + "</dt><dd>" + escHTML(row.value) + "</dd></div>";
    }).join("");
    const notes = result.notes.map(function (n) { return "<li>" + escHTML(n) + "</li>"; }).join("");
    return '<div class="result-main">' + main + "</div>" +
      (result.stair ? stairSVG(result.stair) : "") +
      '<dl class="result-rows">' + rows + "</dl>" +
      '<ul class="result-notes">' + notes + "</ul>" +
      (est ? costHTML(est, costOpen) : "") +
      '<div class="result-actions"><button type="button" class="btn" data-copy>Copiar resultado</button>' +
      '<a class="btn btn-ghost" data-whatsapp target="_blank" rel="noopener">Enviar por WhatsApp</a></div>';
  }

  function resultText(title, result, est) {
    const lines = [title];
    result.main.forEach(function (m) { lines.push("• " + m.label + ": " + m.value + " " + m.unit); });
    result.rows.forEach(function (row) { lines.push("• " + row.label + ": " + row.value); });
    if (est) lines.push(costTextLine(est));
    lines.push("Calculado con " + (brand.name || "") + " — " + location.href);
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve(); else reject(new Error("copy"));
    });
  }

  function initCalculator(card) {
    const form = $("form[data-calc]", card);
    const out = $("[data-result]", card);
    const calculate = engine && engine.calculators[form.getAttribute("data-calc")];
    if (!calculate) {
      card.setAttribute("data-state", "error");
      out.innerHTML = '<p class="result-error">No se pudo cargar la calculadora. Recargá la página.</p>';
      return;
    }
    const title = ($("h1") || {}).textContent || document.title;
    let text = "", result = null, costOpen = false;

    const estimate = () => costs && result && result.cost ? costs.estimate(result.cost, prices) : null;
    function setText(est) {
      text = resultText(title, result, est);
      $("[data-whatsapp]", out).href = "https://wa.me/?text=" + encodeURIComponent(text);
    }

    function run() {
      applyShowIf(form);
      try {
        result = calculate(readForm(form));
        const est = estimate();
        out.innerHTML = resultHTML(result, est, costOpen);
        setText(est);
        card.setAttribute("data-state", "done");
      } catch (e) {
        if (!(e instanceof engine.CalcError)) console.warn("[calc]", e);
        out.innerHTML = '<p class="result-error">' +
          escHTML(e instanceof engine.CalcError ? e.message : "No se pudo calcular. Revisá los datos.") + "</p>";
        card.setAttribute("data-state", "error");
      }
    }

    // Al cambiar el tipo de ladrillo se propone su junta habitual.
    const tipo = form.elements.tipo, junta = form.elements.junta;
    if (tipo && junta && brand.data.bricks) {
      tipo.addEventListener("change", function () {
        const brick = brand.data.bricks[tipo.value];
        if (brick) junta.value = String(brick.j).replace(".", ",");
      });
    }

    form.addEventListener("input", run);
    form.addEventListener("change", run);
    form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
    // Precio tipeado: se recalcula al instante. Vacío = sin precio. Igual al de referencia = deja de ser propio.
    out.addEventListener("input", function (e) {
      const input = e.target.closest("[data-price]");
      if (!input || !result) return;
      const key = input.getAttribute("data-price");
      const raw = input.value.trim().replace(/^\$\s*/, "");
      const value = raw === "" ? null : engine.parseNum(raw);
      if (value !== null && !(value >= 0)) { input.setAttribute("aria-invalid", "true"); return; }
      input.removeAttribute("aria-invalid");
      if (value === costs.priceOf(key, {})) delete prices[key]; else prices[key] = value;
      savePrices(prices);
      const est = estimate();
      paintCost($("[data-cost]", out), est);
      setText(est);
    });
    out.addEventListener("change", function (e) {
      const input = e.target.closest("[data-price]");
      if (!input || input.getAttribute("aria-invalid")) return;
      const p = costs.priceOf(input.getAttribute("data-price"), prices);
      input.value = p == null ? "" : num(p, 2);
    });
    out.addEventListener("toggle", function (e) {
      if (e.target.matches && e.target.matches("[data-cost]")) costOpen = e.target.open;
    }, true);

    out.addEventListener("click", function (e) {
      if (e.target.closest("[data-cost-reset]")) {
        prices = {};
        savePrices(prices);
        run();
        return;
      }
      const button = e.target.closest("[data-copy]");
      if (!button) return;
      copyText(text).then(function () {
        button.textContent = "✓ Copiado";
        setTimeout(function () { button.textContent = "Copiar resultado"; }, 1800);
      }, function () { button.textContent = "No se pudo copiar"; });
    });
    run();
  }

  function boot() {
    $$(".tool-card").forEach(function (card) {
      safe(function () { initCalculator(card); }, "initCalculator");
    });
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
