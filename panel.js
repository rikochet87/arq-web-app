/* CalcuObra — panel a pantalla completa con pestañas, para las planillas y el presupuesto.
   No sabe nada del plano: quien lo abre le da el contenido de cada pestaña y atiende lo que se edita.
   Uso: brand.panel.open({ title, tabs: [{ id, label }], actions: [{ id, label, ghost }],
          render(tab) → HTML, change(e, tab), input(e, tab), action(id, tab), click(e, tab) }) → { refresh, close } */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function open(api) {
    const old = document.querySelector(".doc");
    if (old) return null;
    const root = document.createElement("div"), opener = document.activeElement;
    let tab = api.tab || (api.tabs && api.tabs[0] ? api.tabs[0].id : "");
    root.className = "doc sheetpanel";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", api.title);
    root.innerHTML = '<div class="doc-bar"><strong>' + escHTML(api.title) + "</strong>" +
      (api.tabs && api.tabs.length > 1 ? '<div class="sp-tabs" role="tablist">' + api.tabs.map((t) => '<button type="button" role="tab" data-sp-tab="' + t.id + '">' + escHTML(t.label) + "</button>").join("") + "</div>" : "") +
      '<span class="sp-gap"></span>' +
      (api.actions || []).map((a) => '<button type="button" class="btn btn-sm' + (a.ghost ? " btn-ghost" : "") + '" data-sp-action="' + a.id + '">' + escHTML(a.label) + "</button>").join("") +
      '<button type="button" class="btn btn-ghost btn-sm" data-sp-action="close">Volver al plano</button></div>' +
      '<div class="sp-body" data-sp-body></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add("doc-open");
    const body = root.querySelector("[data-sp-body]");

    function refresh() {
      // Se conserva el foco y el desplazamiento: el contenido se rehace entero después de cada cambio.
      const active = document.activeElement, key = active && active.getAttribute && active.getAttribute("data-key");
      const scroll = body.scrollTop, left = (body.querySelector(".sp-scroll") || {}).scrollLeft || 0;
      root.querySelectorAll("[data-sp-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-sp-tab") === tab)));
      body.innerHTML = api.render(tab);
      body.scrollTop = scroll;
      const sc = body.querySelector(".sp-scroll");
      if (sc) sc.scrollLeft = left;
      if (key) { const again = body.querySelector('[data-key="' + key + '"]'); if (again) again.focus(); }
    }
    function close() {
      document.removeEventListener("keydown", onKey, true);
      root.remove();
      document.documentElement.classList.remove("doc-open");
      if (api.closed) api.closed();
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      e.stopPropagation(); // los atajos del editor no corren mientras el panel está abierto
    }
    document.addEventListener("keydown", onKey, true);
    root.addEventListener("click", function (e) {
      const t = e.target.closest("[data-sp-tab]"), a = e.target.closest("[data-sp-action]");
      if (t) { tab = t.getAttribute("data-sp-tab"); refresh(); return; }
      if (a) { const id = a.getAttribute("data-sp-action"); if (id === "close") close(); else if (api.action) api.action(id, tab); return; }
      if (api.click) api.click(e, tab);
    });
    body.addEventListener("change", function (e) { if (api.change) api.change(e, tab); });
    body.addEventListener("input", function (e) { if (api.input) api.input(e, tab); });
    refresh();
    root.querySelector('[data-sp-action="close"]').focus();
    return { refresh: refresh, close: close, tab: () => tab };
  }

  brand.panel = { open: open, esc: escHTML };
})();
