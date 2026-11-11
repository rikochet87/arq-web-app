/* Presupuesto de obra del plano: cantidades del cómputo × precios. Los precios de materiales y jornales se comparten
   con las calculadoras (quedan en este navegador); los de aberturas y artefactos son propios de cada plano. */
import { engine as E } from "../../lib/calc";
import { plan as P } from "../../lib/plan";
import { ops } from "./context";
import { st } from "./state";
import { download, fileName } from "./files";

export function openBudget() {
  const brand = window.__BRAND__, hint = ops.hint, title = ops.title;
  const BG = brand.budget, U = brand.panel, K = brand.costs;
  if (!BG || !U || !K) return;
  if (!P.levelsOf(st.plan).some((lv) => lv.walls.length)) { hint.textContent = "Dibujá al menos un ambiente para presupuestar."; return; }
  const esc = U.esc, PRICE_KEY = "arqium.precios.v1", money = K.money;
  const loadPrices = () => { try { return K.clean(JSON.parse(localStorage.getItem(PRICE_KEY) || "{}")); } catch (e) { return {}; } };
  const savePrices = (p: Record<string, number>) => { try { if (Object.keys(p).length) localStorage.setItem(PRICE_KEY, JSON.stringify(p)); else localStorage.removeItem(PRICE_KEY); } catch (e) { /* sin almacenamiento */ } };
  let prices: Record<string, number> = loadPrices();
  const qty = (l: { qty: number; unit: string }) => E.fmt(l.qty, l.unit === "unidad" || l.unit === "placa" || /^rollo/.test(l.unit) ? 0 : 2);
  function render(): string {
    const bud = BG!.build(st.plan, prices);
    const stat = (label: string, value: string, cls?: string) => '<div class="bg-stat' + (cls ? " " + cls : "") + '"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong></div>";
    const pct = (k: "gg" | "ben" | "iva", label: string) => '<label>' + label + ' <input type="text" inputmode="decimal" data-key="pase-' + k + '" data-pase="' + k + '" value="' + E.fmt(bud.pase[k], 1) + '"> %</label>';
    let html = '<div class="bg-top">' + stat("Precio final", money(bud.total), "is-main") + stat("Costo directo", money(bud.direct)) + stat("Materiales", money(bud.mat)) + stat("Mano de obra", money(bud.mo)) +
      (bud.area ? stat("Por m² nuevo", money(bud.total / bud.area)) : "") + "</div>" +
      '<div class="bg-pase">' + pct("gg", "Gastos generales") + pct("ben", "Beneficio") + pct("iva", "IVA") + "</div>" +
      '<p class="sp-sum">' + "El sitio no trae precios, porque cambian según la fecha, la zona y el proveedor. Cargá cada uno en su casillero: los de materiales y mano de obra quedan guardados en este dispositivo y valen también en las calculadoras; los de aberturas y artefactos, en este plano." +
      (bud.phased ? " Obra con partes existentes: se presupuesta solo lo nuevo y la demolición." : "") + "</p>" +
      (bud.missing.length ? '<p class="cost-missing">Falta el precio de ' + bud.missing.length + (bud.missing.length === 1 ? " ítem" : " ítems") + ": el total no los incluye. Están marcados en amarillo.</p>" : "");
    bud.rubros.forEach(function (r, ri) {
      html += '<section class="bg-rubro"><h3><span>' + esc(r.title) + "</span><b>" + money(r.total) + "</b></h3>" + (r.note ? '<p class="ws-tip">' + esc(r.note) + "</p>" : "") +
        '<div class="sp-scroll"><table class="sp-table bg-table"><thead><tr><th>Ítem</th><th class="num">Cantidad</th><th class="bg-unit">Unidad</th><th class="num">Precio unitario</th><th class="num">Subtotal</th></tr></thead><tbody>' +
        r.lines.map(function (l, li) {
          return '<tr' + (l.price == null ? ' class="is-missing"' : "") + "><td>" + esc(l.label) + '</td><td class="num">' + qty(l) + '<small class="bg-u"> ' + esc(l.unit) + '</small></td><td class="bg-unit">' + esc(l.unit) + '</td><td class="num">$ <input type="text" inputmode="decimal" autocomplete="off" data-key="p-' + ri + "-" + li +
            '" data-price="' + esc(l.key) + '" value="' + (l.price == null ? "" : E.fmt(l.price, 2)) + '" placeholder="Cargá el precio" aria-label="Precio de ' + esc(l.label) + " por " + esc(l.unit) + '"></td><td class="num">' +
            (l.subtotal == null ? "—" : money(l.subtotal)) + "</td></tr>";
        }).join("") + '</tbody><tfoot><tr><td colspan="4" class="bg-foot">Materiales ' + money(r.mat) + " · Mano de obra " + money(r.mo) + '</td><td class="num">' + money(r.total) + "</td></tr></tfoot></table></div></section>";
    });
    html += '<dl class="result-rows bg-final">' + ([["Costo directo", bud.direct], ["Gastos generales " + E.fmt(bud.pase.gg, 1) + " %", bud.gg], ["Beneficio " + E.fmt(bud.pase.ben, 1) + " %", bud.ben],
      ["Subtotal", bud.net], ["IVA " + E.fmt(bud.pase.iva, 1) + " %", bud.iva], ["Precio final", bud.total]] as [string, number][]).map((x) => "<div><dt>" + esc(x[0]) + "</dt><dd>" + money(x[1]) + "</dd></div>").join("") + "</dl>" +
      '<ul class="result-notes"><li>Cantidades del cómputo del plano, con su desperdicio. Cemento y cal van en bolsas con decimales: al comprar, se redondea el total de la obra.</li>' +
      "<li>No incluye estructura de hormigón armado, instalación sanitaria ni de gas, tirantería del techo, flete ni honorarios profesionales.</li>" +
      "<li>Estimación para presupuestar: no reemplaza el presupuesto de un profesional.</li></ul>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-bg-reset' + (Object.keys(prices).length ? "" : " hidden") + ">Borrar mis precios de materiales y mano de obra</button>";
    return html;
  }
  function change(e: Event) {
    const el = e.target as HTMLInputElement, plan = st.plan;
    if (el.hasAttribute("data-pase")) {
      const v = E.parseNum(el.value);
      if (!(v >= 0 && v <= 100)) { el.setAttribute("aria-invalid", "true"); return; }
      ops.pushHistory();
      plan.budget = Object.assign({}, plan.budget, { pase: Object.assign({}, BG!.PASE, (plan.budget || {}).pase, { [el.getAttribute("data-pase") as string]: v }) });
      ops.save();
    } else if (el.hasAttribute("data-price")) {
      const key = el.getAttribute("data-price") as string, raw = el.value.trim().replace(/^\$\s*/, ""), v = raw === "" ? null : E.parseNum(raw);
      if (v !== null && !(v >= 0)) { el.setAttribute("aria-invalid", "true"); return; }
      if (key.indexOf("p:") === 0) {
        ops.pushHistory();
        const own: Record<string, number> = Object.assign({}, (plan.budget || {}).prices);
        if (v === null) delete own[key]; else own[key] = v;
        plan.budget = Object.assign({}, plan.budget, { prices: own });
        ops.save();
      } else {
        if (v === K!.priceOf(key, {})) delete prices[key]; else prices[key] = v as number;
        savePrices(prices);
      }
    } else return;
    (panel as NonNullable<typeof panel>).refresh();
  }
  const panel = U.open({
    title: "Presupuesto de obra",
    actions: [{ id: "csv", label: "Descargar para Excel" }, { id: "print", label: "Imprimir", ghost: true }].concat(brand.apu ? [{ id: "send", label: "Pasar al presupuesto por rubros", ghost: true }] : []),
    render: render, change: change,
    click: function (e) { if ((e.target as Element).closest("[data-bg-reset]")) { prices = {}; savePrices(prices); (panel as NonNullable<typeof panel>).refresh(); } },
    action: function (id) {
      if (id === "print") { window.print(); return; }
      if (id === "send") { // el presupuesto del plano pasa a la página de presupuesto, donde se le suman otros rubros
        const KEY = "arqium.presupuesto.v1", apu = brand.apu!;
        try {
          let store;
          try { store = apu.clean(JSON.parse(localStorage.getItem(KEY) as string)); } catch (e) { store = apu.empty(); }
          Object.assign(prices, apu.fromPlan(store, BG.build(st.plan, prices)));
          if (!store.name && !/^plano sin t/i.test(title.value.trim())) store.name = title.value.trim();
          localStorage.setItem(KEY, JSON.stringify(store));
          savePrices(prices);
          location.href = "presupuesto.html";
        } catch (e) { hint.textContent = "Tu navegador no deja guardar el presupuesto (¿ventana privada?)."; }
        return;
      }
      download(fileName(st.plan.name, "csv").replace(/\.csv$/, "-presupuesto.csv"), new Blob([BG.csv(BG.build(st.plan, prices))], { type: "text/csv;charset=utf-8" }));
    }
  });
}
