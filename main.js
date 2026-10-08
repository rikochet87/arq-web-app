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

  function resultHTML(result) {
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
      '<div class="result-actions"><button type="button" class="btn" data-copy>Copiar resultado</button>' +
      '<a class="btn btn-ghost" data-whatsapp target="_blank" rel="noopener">Enviar por WhatsApp</a></div>';
  }

  function resultText(title, result) {
    const lines = [title];
    result.main.forEach(function (m) { lines.push("• " + m.label + ": " + m.value + " " + m.unit); });
    result.rows.forEach(function (row) { lines.push("• " + row.label + ": " + row.value); });
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
    let text = "";

    function run() {
      applyShowIf(form);
      try {
        const result = calculate(readForm(form));
        text = resultText(title, result);
        out.innerHTML = resultHTML(result);
        $("[data-whatsapp]", out).href = "https://wa.me/?text=" + encodeURIComponent(text);
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
    out.addEventListener("click", function (e) {
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
