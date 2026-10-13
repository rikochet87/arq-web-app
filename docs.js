/* CalcuObra — documentación de obra: panel para cargar los datos de la carátula, ver las láminas e imprimirlas.
   Las láminas las arma lib/sheets.js; acá solo está el formulario y la vista previa.
   Uso: brand.docs.open({ plan: () => plano, save: (doc) => …, download: (nombre, blob) => …, fileName: (ext) => … }). */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const S = brand.sheets, E = brand.engine;
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // [clave, rótulo, tipo, opciones]. Tipos: text, num (número con coma), select, check.
  const GROUPS = [
    ["Lámina", [
      ["template", "Plantilla", "select", [["", "Personalizada"]].concat(Object.keys(S.TEMPLATES).map((k) => [k, S.TEMPLATES[k].label])), true],
      ["format", "Formato", "select", [["A3", "A3 · 420 × 297 mm"], ["A2", "A2 · 594 × 420 mm"], ["A1", "A1 · 841 × 594 mm"], ["A0", "A0 · 1189 × 841 mm"]]],
      ["scale", "Escala", "select", [["50", "1:50"], ["100", "1:100"], ["200", "1:200"]]],
      ["facades", "Fachadas", "select", [["frente", "Solo el frente"], ["dos", "Frente y contrafrente"], ["cuatro", "Las cuatro"]], true],
      ["color", "Muros en color reglamentario (rojo: a construir; negro: existente; amarillo: a demoler)", "check"],
      ["furniture", "Dibujar los muebles", "check"],
      ["electric", "Incluir la instalación eléctrica", "check"],
      ["balance", "Incluir el balance de superficies", "check"],
      ["lighting", "Incluir la planilla de iluminación y ventilación", "check"],
      ["schedules", "Incluir las planillas de carpinterías y de locales", "check"]
    ]],
    ["Obra", [
      ["obra", "Tipo de obra", "select", null, true],
      ["destino", "Destino", "text", null, true],
      ["propietario", "Propietario", "text", null, true],
      ["calle", "Calle y número", "text", null, true],
      ["localidad", "Localidad", "text"],
      ["fecha", "Fecha", "text"]
    ]],
    ["Nomenclatura catastral", [
      ["circ", "Circunscripción", "text"], ["seccion", "Sección", "text"], ["manzana", "Manzana", "text"], ["parcela", "Parcela", "text"],
      ["partida", "Partida", "text"], ["zona", "Zonificación", "text"]
    ]],
    ["Terreno", [
      ["lotW", "Frente (m)", "num"], ["lotD", "Fondo (m)", "num"],
      ["front", "La calle queda", "select", [["abajo", "Abajo del plano"], ["arriba", "Arriba del plano"], ["izquierda", "A la izquierda"], ["derecha", "A la derecha"]], true],
      ["setFront", "Retiro de frente (m)", "num"], ["setSide", "Retiro lateral (m)", "num"],
      ["north", "Norte (grados desde arriba)", "num", null, true]
    ]],
    ["Profesionales", [
      ["proyectista", "Proyectista", "text"], ["matProyectista", "Matrícula", "text"],
      ["director", "Director de obra", "text"], ["matDirector", "Matrícula", "text"],
      ["constructor", "Constructor", "text"], ["matConstructor", "Matrícula", "text"]
    ]],
    ["Iluminación y ventilación", [
      ["coef", "Coeficiente de iluminación (superficie / …)", "num", null, true]
    ]]
  ];

  function fieldHTML(f, doc) {
    const key = f[0], value = doc[key], wide = f[4] || f[2] === "check" ? " wide" : "";
    if (f[2] === "check") return '<div class="field field-check"><label><input type="checkbox" name="' + key + '"' + (value ? " checked" : "") + "> " + f[1] + "</label></div>";
    const options = key === "obra" ? S.OBRAS.map((o) => [o, o]) : f[3];
    const control = f[2] === "select"
      ? '<select id="doc-' + key + '" name="' + key + '">' + options.map((o) => '<option value="' + o[0] + '"' + (String(value) === o[0] ? " selected" : "") + ">" + escHTML(o[1]) + "</option>").join("") + "</select>"
      : '<input id="doc-' + key + '" name="' + key + '" type="text" autocomplete="off"' + (f[2] === "num" ? ' inputmode="decimal" data-num' : "") + ' value="' + escHTML(f[2] === "num" ? (value ? E.fmt(value, 2) : "") : value) + '">';
    return '<div class="field' + wide + '"><label for="doc-' + key + '">' + f[1] + "</label>" + control + "</div>";
  }

  function open(api) {
    if (document.querySelector(".doc")) return;
    const doc = Object.assign({}, S.DEFAULTS, api.plan().doc || {});
    if (!doc.fecha) doc.fecha = new Date().toLocaleDateString("es-AR");
    const root = document.createElement("div"), page = document.createElement("style"), opener = document.activeElement;
    root.className = "doc";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Documentación de obra");
    root.innerHTML = '<div class="doc-bar"><strong>Documentación de obra</strong><span data-doc-info></span>' +
      '<button type="button" class="btn btn-sm" data-doc="print">Imprimir o guardar PDF</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-doc="svg">Descargar SVG</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-doc="close">Volver al plano</button></div>' +
      '<form class="doc-form" novalidate>' + GROUPS.map((g, i) => '<details class="ws-sec"' + (i < 2 || g[0] === "Terreno" ? " open" : "") + "><summary>" + g[0] + '</summary><div class="tool-form">' +
        g[1].map((f) => fieldHTML(f, doc)).join("") + "</div></details>").join("") +
      '<p class="ws-tip">Cada municipio tiene su propio modelo de carátula y sus exigencias: revisá el reglamento local. Los planos deben llevar la firma de un profesional matriculado.</p></form>' +
      '<div class="doc-view"><ul class="doc-notes" data-doc-notes></ul><div data-doc-sheets></div></div>';
    document.body.appendChild(root);
    document.head.appendChild(page);
    document.documentElement.classList.add("doc-open");

    const form = root.querySelector("form"), out = root.querySelector("[data-doc-sheets]"), notes = root.querySelector("[data-doc-notes]"), info = root.querySelector("[data-doc-info]");
    let built = { sheets: [] }, timer = 0;

    function render() {
      built = S.build(Object.assign({}, api.plan(), { doc: doc }));
      const size = S.FORMATS[built.doc.format];
      page.textContent = "@page { size: " + size[0] + "mm " + size[1] + "mm; margin: 0; }";
      info.textContent = built.sheets.length ? built.sheets.length + (built.sheets.length === 1 ? " lámina " : " láminas ") + built.doc.format + " · escala 1:" + built.doc.scale : "";
      notes.innerHTML = built.warnings.map((w) => "<li>" + escHTML(w) + "</li>").join("");
      out.innerHTML = built.sheets.map((s) => '<div class="doc-sheet">' + s.svg + "</div>").join("");
      root.querySelectorAll('[data-doc="print"], [data-doc="svg"]').forEach((b) => { b.disabled = !built.sheets.length; });
    }
    // Pone en el formulario los valores de doc (después de aplicar una plantilla).
    function fill() {
      form.querySelectorAll("[name]").forEach(function (el) {
        const v = doc[el.name];
        if (el.type === "checkbox") el.checked = !!v;
        else if (el.tagName === "SELECT") el.value = String(v);
      });
    }
    const CONTROLLED = Object.keys(S.TEMPLATES).reduce((set, k) => { Object.keys(S.TEMPLATES[k]).forEach((f) => { if (f !== "label") set[f] = true; }); return set; }, {});
    function read(e) {
      const el = e.target, key = el.name;
      if (!key) return;
      if (key === "template") {
        Object.assign(doc, S.applyTemplate(doc, el.value));
        fill();
        api.save(Object.assign({}, doc));
        clearTimeout(timer);
        timer = setTimeout(render, 150);
        return;
      }
      if (CONTROLLED[key] && doc.template) { doc.template = ""; form.elements.template.value = ""; } // tocó a mano algo de la plantilla
      if (el.type === "checkbox") doc[key] = el.checked;
      else if (el.hasAttribute("data-num")) {
        const v = el.value.trim() ? E.parseNum(el.value) : 0, ok = isFinite(v) && (key === "north" || v >= 0);
        el.setAttribute("aria-invalid", String(!ok));
        if (!ok) return;
        doc[key] = v;
      } else doc[key] = el.value.trim();
      api.save(Object.assign({}, doc));
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    }
    function close() {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      root.remove();
      page.remove();
      document.documentElement.classList.remove("doc-open");
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      e.stopPropagation(); // los atajos del editor no corren mientras el panel está abierto
    }

    form.addEventListener("input", read);
    form.addEventListener("change", read);
    form.addEventListener("submit", (e) => e.preventDefault());
    document.addEventListener("keydown", onKey, true);
    root.addEventListener("click", function (e) {
      const b = e.target.closest("[data-doc]");
      if (!b) return;
      const what = b.getAttribute("data-doc");
      if (what === "close") close();
      else if (what === "print") window.print();
      else built.sheets.forEach(function (s, i) { // una descarga por lámina, espaciadas para que el navegador no las bloquee
        setTimeout(function () { api.download(api.fileName("svg").replace(/\.svg$/, "-lamina-" + s.n + ".svg"), new Blob([s.svg], { type: "image/svg+xml" })); }, i * 350);
      });
    });
    render();
    root.querySelector('[data-doc="close"]').focus();
  }

  brand.docs = { open: open };
})();
