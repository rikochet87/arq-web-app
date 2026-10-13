/* CalcuObra — página "Presupuesto de obra": el cómputo (trabajos con su cantidad), los rubros con su análisis de
   precios, los materiales y la mano de obra. Las cuentas las hace lib/apu.js; acá se dibuja y se guarda.
   Todo queda en este navegador: el presupuesto en STORE y los precios en PRICES, que son los mismos de las
   calculadoras y del diseñador de planos. La página se redibuja entera en cada cambio y repone el foco. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const A = brand.apu, K = brand.costs, E = brand.engine;
  const STORE = "calcuobra.presupuesto.v1", PRICES = "calcuobra.precios.v1";
  const TABS = [["obra", "Presupuesto"], ["rubros", "Rubros y análisis de precios"], ["materiales", "Materiales"], ["mano", "Mano de obra"]];
  const DAY = 8; // horas de una jornada

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plain = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const num = (v, d) => E.fmt(v, d == null ? 2 : d);
  const few = (n, one, many) => n + " " + (n === 1 ? one : many);

  function init(root) {
    let store, prices, tab = "obra", q = "", cat = "", only = "all", picker = false, form = null, armed = "", note = "", b = null;
    const open = {};

    function load() {
      try { store = A.clean(JSON.parse(localStorage.getItem(STORE))); } catch (e) { store = A.empty(); }
      try { prices = K.clean(JSON.parse(localStorage.getItem(PRICES) || "{}")); } catch (e) { prices = {}; }
    }
    function save() { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { note = "Tu navegador no deja guardar: los cambios se pierden al cerrar la página. Usá «Guardar copia»."; } }
    function savePrices() {
      try { if (Object.keys(prices).length) localStorage.setItem(PRICES, JSON.stringify(prices)); else localStorage.removeItem(PRICES); } catch (e) { /* sin almacenamiento */ }
    }
    const money = (v) => K.money(v || 0);
    const hit = (words) => !q || plain(words).indexOf(plain(q)) >= 0;

    // ---------- Piezas ----------
    const priceBox = (id, f, label) => '<label class="pb-price"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" autocomplete="off" data-price="' + esc(id) + '" data-f="' + esc(f + id) +
      '" value="' + (prices[id] == null ? "" : num(prices[id])) + '" placeholder="Precio" aria-label="Precio de ' + esc(label) + '"></label>';
    const flag = (missing) => missing.length ? '<span class="pb-flag">' + (missing.length === 1 ? "Falta 1 precio" : "Faltan " + missing.length + " precios") + "</span>" : "";
    const twice = (act, key, label, attrs) => '<button type="button" class="btn btn-ghost btn-sm' + (armed === key ? " is-armed" : "") + '" data-act="' + act + '" data-arm="' + esc(key) + '"' + (attrs || "") + ">" +
      (armed === key ? "¿Seguro? Tocá de nuevo" : label) + "</button>";

    // Tabla del análisis de precios de un rubro. Con edit, las cantidades se cambian y las líneas se quitan.
    function analysis(rubro, a, f, edit) {
      if (rubro.direct) {
        return '<p class="pb-tip">Este rubro no tiene análisis: cargá de una vez cuánto salen los materiales y la mano de obra por ' + esc(rubro.unit) + ". Sirve para subcontratos y trabajos que te cotizan cerrados.</p>" +
          '<div class="pb-direct">' + a.lines.map((l) => "<label>" + (l.labor ? "Mano de obra" : "Materiales") + " " + priceBox(l.id, f, l.label) + "</label>").join("") + "</div>";
      }
      const rows = a.lines.map(function (l) {
        const kind = l.rubro ? '<small class="pb-kind">rubro ' + esc(l.rubro) + "</small>" : l.labor ? '<small class="pb-kind">mano de obra</small>' : "";
        return '<tr' + (l.price == null ? ' class="is-missing"' : "") + "><td>" + esc(l.label) + kind + "</td>" +
          '<td class="num">' + (edit ? '<input type="text" inputmode="decimal" data-comp="' + esc(rubro.code + "|" + l.index) + '" data-f="' + esc(f + "c" + l.index) + '" value="' + num(l.qty, 4) + '" aria-label="Cantidad de ' + esc(l.label) + '">' : num(l.qty, 4)) + "</td>" +
          "<td>" + esc(l.unit) + "</td>" +
          '<td class="num">' + (l.rubro ? money(l.price) : priceBox(l.id, f, l.label)) + "</td>" +
          '<td class="num">' + (l.subtotal == null ? '<span class="pb-none">sin precio</span>' : money(l.subtotal)) + "</td>" +
          (edit ? '<td class="num"><button type="button" class="pb-x" data-act="del-comp" data-code="' + esc(rubro.code) + '" data-i="' + l.index + '" title="Quitar del análisis" aria-label="Quitar ' + esc(l.label) + '">×</button></td>' : "") + "</tr>";
      }).join("");
      const span = edit ? 6 : 5;
      return '<div class="sp-scroll"><table class="sp-table pb-table"><thead><tr><th>Qué lleva 1 ' + esc(rubro.unit) + '</th><th class="num">Cantidad</th><th>Unidad</th><th class="num">Precio</th><th class="num">Subtotal</th>' + (edit ? "<th></th>" : "") + "</tr></thead>" +
        "<tbody>" + (rows || '<tr><td colspan="' + span + '">Todavía no tiene nada cargado. Agregá abajo los materiales y las horas que lleva.</td></tr>') + "</tbody>" +
        '<tfoot><tr><td colspan="' + span + '">Materiales ' + money(a.mat) + " · Mano de obra " + money(a.mo) + " · <strong>Precio por " + esc(rubro.unit) + ": " + money(a.total) + "</strong></td></tr></tfoot></table></div>";
    }

    // ---------- Presupuesto ----------
    function obra() {
      const stat = (label, value, cls) => '<div class="bg-stat' + (cls ? " " + cls : "") + '"><span>' + label + "</span><strong>" + esc(value) + "</strong></div>";
      const pct = (k, label) => "<label>" + label + ' <input type="text" inputmode="decimal" data-pase="' + k + '" data-f="pase' + k + '" value="' + num(b.pase[k], 1) + '"> %</label>';
      let html = '<div class="pb-head"><label class="pb-name">Obra <input type="text" data-set="name" data-f="name" maxlength="80" value="' + esc(store.name) + '" placeholder="Ej.: Casa familia Pérez"></label></div>';
      if (!b.lines.length) {
        return html + '<div class="pb-empty"><h2>Armá tu presupuesto en tres pasos</h2><ol class="steps">' +
          "<li><span><strong>Elegí los trabajos.</strong> Pared, revoque, contrapiso, techo, pintura… Cada uno ya sabe qué materiales y cuántas horas lleva.</span></li>" +
          "<li><span><strong>Poné la cantidad.</strong> Los metros cuadrados, cúbicos o las unidades de tu obra. Si no los tenés, las calculadoras y el diseñador de planos te los dan.</span></li>" +
          "<li><span><strong>Cargá tus precios.</strong> Una sola vez: quedan guardados y sirven para todos los trabajos y todas las obras.</span></li></ol>" +
          '<div class="hero-cta"><button type="button" class="btn btn-lg" data-act="picker">Agregar el primer trabajo</button></div></div>' + (picker ? pickerHTML() : "");
      }
      html += '<div class="bg-top">' + stat("Precio final", money(b.total), "is-main") + stat("Costo directo", money(b.direct)) + stat("Materiales", money(b.mat)) + stat("Mano de obra", money(b.mo)) + "</div>";
      if (b.missing.length) html += '<p class="cost-missing">' + (b.missing.length === 1 ? "Falta 1 precio" : "Faltan " + b.missing.length + " precios") + ": el total todavía no los incluye. Cargalos en «Lo que lleva toda la obra», más abajo, o en cada trabajo.</p>";

      html += '<div class="pb-lines">' + b.lines.map(function (l, i) {
        const key = "L" + l.id, isOpen = !!open[key];
        return '<div class="pb-line' + (l.missing.length ? " is-missing" : "") + '">' +
          '<span class="pb-n">' + (i + 1) + "</span>" +
          '<div class="pb-what"><strong>' + esc(l.name) + "</strong><small>" + esc(l.lost ? "Este rubro ya no existe: quitá la línea." : l.cat + " · " + l.code) + "</small></div>" +
          '<label class="pb-qty"><input type="text" inputmode="decimal" data-qty="' + l.id + '" data-f="q' + l.id + '" value="' + num(l.qty, 3) + '" aria-label="Cantidad de ' + esc(l.name) + '"><span>' + esc(l.unit) + "</span></label>" +
          '<div class="pb-money"><small>Precio por ' + esc(l.unit || "unidad") + "</small><b>" + money(l.unitPrice) + "</b></div>" +
          '<div class="pb-money"><small>Subtotal</small><b class="pb-sub">' + money(l.subtotal) + "</b></div>" +
          '<div class="pb-acts">' + (l.lost ? "" : '<button type="button" class="pb-more" data-act="toggle" data-key="' + key + '" aria-expanded="' + isOpen + '">' + (l.missing.length ? flag(l.missing) : "Ver análisis") + " " + (isOpen ? "▴" : "▾") + "</button>") +
          '<button type="button" class="pb-x" data-act="del-line" data-id="' + l.id + '" title="Quitar del presupuesto" aria-label="Quitar ' + esc(l.name) + '">×</button></div>' +
          (isOpen && !l.lost ? '<div class="pb-detail">' + analysis(l.rubro, l.a, key, false) +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="edit-rubro" data-code="' + esc(l.code) + '">Cambiar cantidades de este análisis</button></div>' : "") +
          "</div>";
      }).join("") + "</div>";
      html += '<div class="pb-add"><button type="button" class="btn" data-act="picker">+ Agregar trabajo</button></div>' + (picker ? pickerHTML() : "");

      // Todo lo que lleva la obra: la lista de compras y las horas, y el lugar más cómodo para cargar precios.
      const mats = b.needs.filter((n) => !n.labor && !n.direct), work = b.needs.filter((n) => n.labor && !n.direct), direct = b.needs.filter((n) => n.direct);
      const needRow = (n) => "<tr" + (n.price == null && !n.direct ? ' class="is-missing"' : "") + "><td>" + esc(n.label) + '</td><td class="num">' + num(n.qty, 2) + "</td><td>" + esc(n.unit) + '</td><td class="num">' + priceBox(n.id, "N", n.label) +
        '</td><td class="num">' + (n.subtotal == null ? '<span class="pb-none">sin precio</span>' : money(n.subtotal)) + "</td></tr>";
      const block = (title, list) => list.length ? '<tr class="pb-group"><td colspan="5">' + title + "</td></tr>" + list.map(needRow).join("") : "";
      html += '<details class="pb-needs" data-open="needs"' + (open.needs !== false ? " open" : "") + "><summary>Lo que lleva toda la obra <small>" + few(mats.length, "material", "materiales") + " · " +
        num(work.reduce((t, n) => t + n.qty, 0), 0) + " horas de trabajo</small></summary>" +
        '<p class="pb-tip">Es la lista de compras y las horas de todos los trabajos juntos. Cargá acá tus precios: valen también en las calculadoras y en el diseñador de planos.</p>' +
        '<div class="sp-scroll"><table class="sp-table pb-table"><thead><tr><th>Ítem</th><th class="num">Cantidad</th><th>Unidad</th><th class="num">Tu precio</th><th class="num">Subtotal</th></tr></thead><tbody>' +
        block("Mano de obra", work) + block("Materiales", mats) + block("Trabajos con precio directo", direct) + "</tbody></table></div></details>";

      html += '<div class="bg-pase pb-pase">' + pct("gg", "Gastos generales") + pct("ben", "Beneficio") + pct("iva", "IVA") + "</div>" +
        '<dl class="result-rows bg-final">' + [["Costo directo", b.direct], ["Gastos generales " + num(b.pase.gg, 1) + " %", b.gg], ["Beneficio " + num(b.pase.ben, 1) + " %", b.ben], ["Subtotal", b.net], ["IVA " + num(b.pase.iva, 1) + " %", b.iva], ["Precio final", b.total]]
          .map((x) => "<div><dt>" + esc(x[0]) + "</dt><dd>" + money(x[1]) + "</dd></div>").join("") + "</dl>" +
        '<p class="pb-tip pb-right">El costo directo es materiales más mano de obra. Los gastos generales cubren lo que no va a un trabajo en particular (fletes, herramientas, seguros); el beneficio es tu ganancia.</p>';
      return html;
    }

    function pickerHTML() {
      const used = {};
      store.lines.forEach((l) => { used[l.code] = (used[l.code] || 0) + 1; });
      let last = "", list = "";
      b.book.rubros.filter((r) => hit(r.name + " " + r.cat + " " + r.code)).forEach(function (r) {
        if (r.cat !== last) { list += "<h4>" + esc(r.cat) + "</h4>"; last = r.cat; }
        list += '<button type="button" class="pb-pick" data-act="add" data-code="' + esc(r.code) + '"><span>' + esc(r.name) + "<small>se mide en " + esc(r.unit) + (used[r.code] ? " · ya está en el presupuesto" : "") + "</small></span><b>+ Agregar</b></button>";
      });
      return '<div class="pb-picker"><div class="pb-bar"><input type="search" data-q data-f="q" value="' + esc(q) + '" placeholder="Buscá un trabajo: pared, revoque, pintura…" aria-label="Buscar un trabajo">' +
        '<button type="button" class="btn btn-sm" data-act="picker">Listo</button></div><div class="pb-picklist">' +
        (list || '<p class="pb-tip">No hay ningún trabajo con ese nombre.</p>') + "</div>" +
        '<p class="pb-tip">¿No está el que buscás? <button type="button" class="pb-link" data-act="new-rubro">Creá tu propio rubro</button>.</p></div>';
    }

    // ---------- Rubros y análisis de precios ----------
    function rubros() {
      const bk = b.book, cats = bk.rubros.map((r) => r.cat).filter((c, i, all) => all.indexOf(c) === i);
      let html = '<p class="pb-tip">Un <strong>rubro</strong> es un trabajo que se mide en una unidad: un metro cuadrado de pared, un metro cúbico de hormigón. Su <strong>análisis de precios</strong> dice qué materiales y cuántas horas lleva esa unidad. ' +
        "Con eso y con tus precios sale lo que cuesta. Los que vienen cargados son de referencia: abrí cualquiera y ajustalo a tu forma de trabajar.</p>" +
        '<div class="pb-bar"><input type="search" data-q data-f="q" value="' + esc(q) + '" placeholder="Buscar un rubro…" aria-label="Buscar un rubro">' +
        '<select data-cat aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>' + cats.map((c) => '<option' + (c === cat ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select>" +
        '<button type="button" class="btn btn-sm" data-act="new-rubro">+ Nuevo rubro</button></div>';
      if (form && form.kind === "rubro") {
        html += '<form class="pb-form" data-form="rubro"><h3>Nuevo rubro</h3>' +
          '<label>Nombre del trabajo <input type="text" name="name" data-f="nr-name" maxlength="120" required placeholder="Ej.: Pared de bloque de hormigón de 20"></label>' +
          '<label>Categoría <input type="text" name="cat" list="pb-cats" maxlength="60" placeholder="Ej.: Mamposterías"><datalist id="pb-cats">' + cats.map((c) => '<option value="' + esc(c) + '">').join("") + "</datalist></label>" +
          "<label>Se mide en <select name=\"unit\">" + A.UNITS.map((u) => "<option>" + u + "</option>").join("") + "</select></label>" +
          '<fieldset><legend>¿Cómo le ponés precio?</legend><label><input type="radio" name="kind" value="apu" checked> Con análisis: cargo los materiales y las horas que lleva</label>' +
          '<label><input type="radio" name="kind" value="direct"> Precio directo: me lo cotizan cerrado o es un subcontrato</label></fieldset>' +
          '<div class="hero-cta"><button type="submit" class="btn btn-sm">Crear rubro</button><button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Cancelar</button></div></form>';
      }
      const shown = bk.rubros.filter((r) => (!cat || r.cat === cat) && hit(r.name + " " + r.cat + " " + r.code));
      let last = "";
      shown.forEach(function (r) {
        if (r.cat !== last) { html += '<h3 class="pb-cat">' + esc(r.cat) + "</h3>"; last = r.cat; }
        const key = "R" + r.code, isOpen = !!open[key], a = A.analyse(r, bk, prices);
        html += '<details class="pb-rubro" data-open="' + esc(key) + '"' + (isOpen ? " open" : "") + '><summary><span class="sp-code">' + esc(r.code) + '</span><span class="pb-what"><strong>' + esc(r.name) + "</strong>" +
          (r.own ? "<small>" + (r.stock ? "modificado por vos" : r.src === "calc" ? "traído de una calculadora" : r.src === "plano" ? "traído del plano" : "creado por vos") + "</small>" : "") + "</span>" +
          '<span class="pb-money">' + flag(a.missing) + "<b>" + money(a.total) + "</b><small>por " + esc(r.unit) + "</small></span></summary>";
        if (isOpen) {
          const f = key, items = bk.items, ids = Object.keys(items);
          const opt = (id) => '<option value="' + esc(id) + '">' + esc(items[id].label + " — " + items[id].unit) + "</option>";
          html += '<div class="pb-body"><div class="pb-fields">' +
            '<label>Nombre <input type="text" data-rf="' + esc(r.code + "|name") + '" data-f="' + esc(f + "name") + '" maxlength="120" value="' + esc(r.name) + '"></label>' +
            '<label>Categoría <input type="text" data-rf="' + esc(r.code + "|cat") + '" data-f="' + esc(f + "cat") + '" maxlength="60" value="' + esc(r.cat) + '"></label>' +
            '<label>Se mide en <input type="text" data-rf="' + esc(r.code + "|unit") + '" data-f="' + esc(f + "unit") + '" maxlength="20" value="' + esc(r.unit) + '"></label></div>' +
            analysis(r, a, f, true) +
            (r.direct ? "" : '<div class="pb-newcomp"><label>Agregar al análisis <select data-newcomp><optgroup label="Mano de obra">' + A.LABOR.map(opt).join("") + '</optgroup><optgroup label="Materiales">' +
              ids.filter((id) => !items[id].labor).sort((p, s) => items[p].label.localeCompare(items[s].label)).map(opt).join("") + '</optgroup><optgroup label="Otros rubros">' +
              bk.rubros.filter((o) => o.code !== r.code).map((o) => '<option value="r:' + esc(o.code) + '">' + esc(o.code + " " + o.name + " — " + o.unit) + "</option>").join("") + "</optgroup></select></label>" +
              '<label>Cantidad por ' + esc(r.unit) + ' <input type="text" inputmode="decimal" data-newqty data-f="' + esc(f + "nq") + '" placeholder="0"></label>' +
              '<button type="button" class="btn btn-sm" data-act="add-comp" data-code="' + esc(r.code) + '">Agregar</button></div>' +
              '<p class="pb-tip">¿Falta un material? Crealo en la pestaña <button type="button" class="pb-link" data-act="tab" data-tab="materiales">Materiales</button> y después sumalo acá.</p>') +
            '<div class="hero-cta"><button type="button" class="btn btn-sm" data-act="add" data-code="' + esc(r.code) + '">+ Agregar al presupuesto</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="copy-rubro" data-code="' + esc(r.code) + '">Duplicar</button>' +
            (r.own && r.stock ? twice("reset-rubro", "reset" + r.code, "Volver al original", ' data-code="' + esc(r.code) + '"') : "") +
            twice("del-rubro", "del" + r.code, "Eliminar rubro", ' data-code="' + esc(r.code) + '"') + "</div></div>";
        }
        html += "</details>";
      });
      return html + (shown.length ? "" : '<p class="pb-tip">No hay rubros con ese nombre.</p>');
    }

    // ---------- Materiales ----------
    function materiales() {
      const bk = b.book, uses = {}, inBudget = {};
      bk.rubros.forEach((r) => r.comps.forEach((c) => { uses[c[0]] = (uses[c[0]] || 0) + 1; }));
      b.needs.forEach((n) => { inBudget[n.id] = true; });
      const chip = (id, label) => '<button type="button" data-act="only" data-only="' + id + '" aria-pressed="' + (only === id) + '">' + label + "</button>";
      const ids = Object.keys(bk.items).filter((id) => !bk.items[id].labor && hit(bk.items[id].label) && (only === "all" || (only === "mine" ? inBudget[id] : prices[id] == null)))
        .sort((p, s) => bk.items[p].label.localeCompare(bk.items[s].label));
      let html = '<p class="pb-tip">Cargá el precio de cada material por la unidad en que lo comprás. El sitio no trae precios, porque cambian según la fecha, la zona y el proveedor. Lo que cargues queda en este dispositivo y vale para todos los rubros, las calculadoras y el diseñador de planos.</p>' +
        '<div class="pb-bar"><input type="search" data-q data-f="q" value="' + esc(q) + '" placeholder="Buscar un material…" aria-label="Buscar un material">' +
        '<div class="pb-chips" role="group" aria-label="Qué materiales mostrar">' + chip("all", "Todos") + chip("mine", "Los de mi presupuesto") + chip("none", "Sin precio") + "</div>" +
        '<button type="button" class="btn btn-sm" data-act="new-mat">+ Nuevo material</button></div>';
      if (form && form.kind === "mat") {
        html += '<form class="pb-form" data-form="mat"><h3>Nuevo material</h3>' +
          '<label>Nombre <input type="text" name="label" data-f="nm-label" maxlength="80" required placeholder="Ej.: Bloque de hormigón 20 × 20 × 40"></label>' +
          '<label>Unidad en que lo comprás <input type="text" name="unit" list="pb-units" maxlength="24" placeholder="unidad, kg, m², bolsa de 25 kg…"><datalist id="pb-units">' +
          ["unidad", "kg", "litro", "metro", "m²", "m³", "bolsa de 25 kg", "bolsa de 30 kg", "rollo", "caja", "barra"].map((u) => '<option value="' + u + '">').join("") + "</datalist></label>" +
          '<div class="hero-cta"><button type="submit" class="btn btn-sm">Crear material</button><button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Cancelar</button></div></form>';
      }
      return html + '<div class="sp-scroll"><table class="sp-table pb-table"><thead><tr><th>Material</th><th>Se compra por</th><th class="num">Tu precio</th><th>Se usa en</th><th></th></tr></thead><tbody>' +
        (ids.map(function (id) {
          const it = bk.items[id], n = uses[id] || 0;
          return "<tr" + (prices[id] == null ? ' class="is-missing"' : "") + "><td>" + esc(it.label) + (it.own ? '<small class="pb-kind">creado por vos</small>' : "") + "</td><td>" + esc(it.unit) + '</td><td class="num">' + priceBox(id, "M", it.label) + "</td><td>" +
            (n ? few(n, "rubro", "rubros") : "—") + (inBudget[id] ? " · en tu presupuesto" : "") + '</td><td class="num">' +
            (it.own && !n ? '<button type="button" class="pb-x" data-act="del-mat" data-id="' + esc(id) + '" title="Borrar material" aria-label="Borrar ' + esc(it.label) + '">×</button>' : "") + "</td></tr>";
        }).join("") || '<tr><td colspan="5">' + (only === "mine" ? "Tu presupuesto todavía no lleva materiales." : only === "none" ? "No queda ningún material sin precio." : "No hay materiales con ese nombre.") + "</td></tr>") +
        "</tbody></table></div>";
    }

    // ---------- Mano de obra ----------
    function mano() {
      const items = b.book.items;
      return '<p class="pb-tip">Cargá lo que te cuesta la hora de cada categoría, con las cargas sociales si las pagás. Si acordás por día, completá la jornada y la hora se calcula sola (' + DAY + " horas). " +
        "Los análisis de precios multiplican estas horas por las que lleva cada trabajo.</p>" +
        '<div class="sp-scroll"><table class="sp-table pb-table"><thead><tr><th>Categoría</th><th class="num">Por hora</th><th class="num">Por jornada de ' + DAY + " h</th></tr></thead><tbody>" +
        A.LABOR.map(function (id) {
          return "<tr" + (prices[id] == null ? ' class="is-missing"' : "") + "><td>" + esc(items[id].label) + '</td><td class="num">' + priceBox(id, "H", items[id].label + " por hora") + '</td><td class="num">' +
            '<label class="pb-price"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" autocomplete="off" data-day="' + id + '" data-f="D' + id + '" value="' + (prices[id] == null ? "" : num(prices[id] * DAY)) +
            '" placeholder="Jornal" aria-label="Jornal de ' + esc(items[id].label) + '"></label></td></tr>';
        }).join("") + "</tbody></table></div>" +
        '<p class="pb-tip">Oficial: hace el trabajo. Ayudante: le alcanza los materiales y prepara las mezclas. El medio oficial y el oficial especializado no están en los análisis que vienen cargados: usalos en los tuyos.</p>';
    }

    // ---------- Dibujo ----------
    function paint() {
      const active = document.activeElement, f = active && root.contains(active) ? active.getAttribute("data-f") : null;
      const caret = f && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
      b = A.budget(store, prices);
      const body = { obra: obra, rubros: rubros, materiales: materiales, mano: mano }[tab]();
      root.innerHTML = '<div class="sp-tabs pb-tabs" role="tablist">' + TABS.map((t) => '<button type="button" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] +
        (t[0] === "obra" && store.lines.length ? " (" + store.lines.length + ")" : "") + "</button>").join("") + "</div>" +
        '<p class="cad-msg pb-note" role="status" aria-live="polite">' + esc(note) + "</p>" +
        '<div class="pb-view" role="tabpanel">' + body + "</div>" +
        '<div class="pb-tools"><button type="button" class="btn btn-ghost btn-sm" data-act="print">Imprimir o guardar PDF</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="csv">Descargar para Excel</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="export">Guardar copia</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="import">Abrir copia</button>' +
        (store.lines.length ? twice("clear", "clear", "Vaciar presupuesto") : "") +
        '<input type="file" data-file accept=".json,application/json" hidden></div>';
      note = "";
      if (f) {
        const el = root.querySelector('[data-f="' + f.replace(/["\\]/g, "\\$&") + '"]');
        if (el) { el.focus(); if (caret) { try { el.setSelectionRange(caret[0], caret[1]); } catch (e) { /* no es de texto */ } } }
      }
    }
    const later = () => setTimeout(paint, 0); // tras un "change" el foco todavía no pasó al campo siguiente

    function download(name, text, type) {
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type }));
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    const fileName = (ext) => (plain(store.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "presupuesto") + "." + ext;
    // Para cambiar un rubro del catálogo se guarda una copia propia con el mismo código.
    function mine(code) {
      if (!store.rubros[code]) { const r = b.book.by[code]; if (r) store.rubros[code] = A.cleanRubro(r, code); }
      return store.rubros[code];
    }
    const amount = (el) => { const raw = el.value.trim().replace(/^\$\s*/, ""); return raw === "" ? null : E.parseNum(raw); };
    const bad = (el) => { el.setAttribute("aria-invalid", "true"); };

    const acts = {
      tab: function (el) { tab = el.getAttribute("data-tab"); q = ""; picker = false; form = null; },
      picker: function () { picker = !picker; q = ""; },
      toggle: function (el) { const k = el.getAttribute("data-key"); open[k] = !open[k]; },
      add: function (el) {
        const code = el.getAttribute("data-code"), r = b.book.by[code];
        A.addLine(store, code, 1); save();
        note = "Agregado al presupuesto: " + (r ? r.name : code) + ". Poné la cantidad en la pestaña Presupuesto.";
      },
      "del-line": function (el) { const id = Number(el.getAttribute("data-id")); store.lines = store.lines.filter((l) => l.id !== id); save(); },
      "edit-rubro": function (el) { tab = "rubros"; q = ""; cat = ""; picker = false; open["R" + el.getAttribute("data-code")] = true; },
      "new-rubro": function () { tab = "rubros"; picker = false; form = { kind: "rubro" }; },
      "new-mat": function () { form = { kind: "mat" }; },
      cancel: function () { form = null; },
      only: function (el) { only = el.getAttribute("data-only"); },
      "add-comp": function (el) {
        const box = el.closest(".pb-newcomp"), id = box.querySelector("[data-newcomp]").value, input = box.querySelector("[data-newqty]"), v = amount(input);
        if (!(v > 0)) { bad(input); input.focus(); return false; }
        mine(el.getAttribute("data-code")).comps.push([id, v]); save();
      },
      "del-comp": function (el) { mine(el.getAttribute("data-code")).comps.splice(Number(el.getAttribute("data-i")), 1); save(); },
      "copy-rubro": function (el) {
        const src = b.book.by[el.getAttribute("data-code")], code = A.newCode(store, "U");
        store.rubros[code] = A.cleanRubro(Object.assign({}, src, { name: src.name + " (copia)", src: "" }), code); save();
        open["R" + code] = true; note = "Rubro duplicado: es el " + code + ".";
      },
      "reset-rubro": function (el) { delete store.rubros[el.getAttribute("data-code")]; save(); },
      "del-rubro": function (el) { A.removeRubro(store, el.getAttribute("data-code")); save(); },
      "del-mat": function (el) { const id = el.getAttribute("data-id"); delete store.mats[id]; delete prices[id]; save(); savePrices(); },
      clear: function () { store.lines = []; save(); },
      print: function () { tab = "obra"; picker = false; open.needs = true; paint(); window.print(); return false; },
      csv: function () { download(fileName("csv"), A.csv(b, store.name), "text/csv;charset=utf-8"); return false; },
      export: function () { download(fileName("json"), JSON.stringify({ app: "calcuobra-presupuesto", v: 1, store: store, prices: prices }), "application/json"); return false; },
      import: function () { root.querySelector("[data-file]").click(); return false; }
    };

    root.addEventListener("click", function (e) {
      const el = e.target.closest("[data-act]");
      if (!el || !acts[el.getAttribute("data-act")]) return;
      const arm = el.getAttribute("data-arm");
      if (arm && armed !== arm) { armed = arm; paint(); return; } // lo que borra pide un segundo toque
      armed = "";
      if (acts[el.getAttribute("data-act")](el) !== false) paint();
    });
    root.addEventListener("input", function (e) {
      if (e.target.hasAttribute("data-q")) { q = e.target.value; paint(); }
      else e.target.removeAttribute("aria-invalid");
    });
    root.addEventListener("change", function (e) {
      const el = e.target;
      if (el.hasAttribute("data-file")) { openCopy(el.files[0]); return; }
      if (el.hasAttribute("data-cat")) { cat = el.value; paint(); return; }
      if (el.hasAttribute("data-price") || el.hasAttribute("data-day")) {
        const id = el.getAttribute("data-price") || el.getAttribute("data-day"), v = amount(el);
        if (v !== null && !(v >= 0)) { bad(el); return; }
        if (v === null) delete prices[id]; else prices[id] = el.hasAttribute("data-day") ? v / DAY : v;
        savePrices();
      } else if (el.hasAttribute("data-qty")) {
        const v = amount(el), line = store.lines.filter((l) => l.id === Number(el.getAttribute("data-qty")))[0];
        if (v === null || !(v >= 0) || !line) { bad(el); return; }
        line.qty = v; save();
      } else if (el.hasAttribute("data-comp")) {
        const at = el.getAttribute("data-comp").split("|"), v = amount(el);
        if (v === null || !(v >= 0)) { bad(el); return; }
        mine(at[0]).comps[Number(at[1])][1] = v; save();
      } else if (el.hasAttribute("data-rf")) {
        const at = el.getAttribute("data-rf").split("|"), value = el.value.trim();
        if (!value) { bad(el); return; }
        const r = mine(at[0]);
        r[at[1]] = value; store.rubros[at[0]] = A.cleanRubro(r, at[0]); save();
      } else if (el.hasAttribute("data-pase")) {
        const v = amount(el);
        if (v === null || !(v >= 0 && v <= 100)) { bad(el); return; }
        store.pase = Object.assign({}, b.pase, { [el.getAttribute("data-pase")]: v }); save();
      } else if (el.hasAttribute("data-set")) { store.name = el.value.trim().slice(0, 80); save(); }
      else return;
      later();
    });
    root.addEventListener("submit", function (e) {
      const el = e.target.closest("[data-form]");
      if (!el) return;
      e.preventDefault();
      if (el.getAttribute("data-form") === "rubro") {
        const code = A.newCode(store, "U");
        store.rubros[code] = A.cleanRubro({ name: el.elements.name.value, cat: el.elements.cat.value, unit: el.elements.unit.value, direct: el.elements.kind.value === "direct", comps: [] }, code);
        open["R" + code] = true; cat = ""; q = "";
        note = "Rubro creado: es el " + code + ". Cargale abajo lo que lleva.";
      } else {
        A.addMat(store, el.elements.label.value, el.elements.unit.value);
        q = el.elements.label.value.trim(); only = "all";
        note = "Material creado. Cargale el precio.";
      }
      form = null; save(); paint();
    });
    root.addEventListener("toggle", function (e) { // los desplegables no avisan hacia arriba: se escucha en captura
      const k = e.target.getAttribute && e.target.getAttribute("data-open");
      if (!k || !!open[k] === e.target.open && k !== "needs") return;
      if (k === "needs") { open.needs = e.target.open; return; }
      open[k] = e.target.open;
      paint();
    }, true);

    function openCopy(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        let data = null;
        try { data = JSON.parse(reader.result); } catch (e) { /* no es una copia */ }
        if (!data || data.app !== "calcuobra-presupuesto" || !data.store) { note = "Ese archivo no es una copia de un presupuesto de " + (brand.name || "este sitio") + "."; paint(); return; }
        store = A.clean(data.store);
        Object.assign(prices, K.clean(data.prices || {})); // los precios de la copia pisan a los de este dispositivo
        save(); savePrices();
        tab = "obra"; note = "Copia abierta: " + few(store.lines.length, "trabajo", "trabajos") + ".";
        paint();
      };
      reader.readAsText(file);
    }

    load();
    const start = location.hash.slice(1);
    if (TABS.some((t) => t[0] === start)) tab = start;
    paint();
    window.addEventListener("pageshow", function (e) { if (e.persisted) { load(); paint(); } }); // al volver atrás desde una calculadora
  }

  function boot() {
    const root = document.querySelector("[data-budget-app]");
    if (!root) return;
    if (!A || !K || !E) { root.innerHTML = '<p class="result-error">No se pudo cargar el presupuesto. Recargá la página.</p>'; return; }
    try { init(root); } catch (e) { console.warn("[presupuesto]", e); root.innerHTML = '<p class="result-error">No se pudo abrir el presupuesto. Recargá la página.</p>'; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
