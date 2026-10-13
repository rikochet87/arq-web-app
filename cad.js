/* CalcuObra — "De AutoCAD a render", en la portada: lee el DXF en el dispositivo (lib/dxfin.js), muestra
   qué entendió del dibujo y lo renderiza (render.js). El archivo no se sube a ningún lado. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const P = brand.plan, E = brand.engine;
  const HANDOFF = "calcuobra.importado"; // plano que se le pasa al diseñador: planner.js lo toma al abrir con #importado
  const MAX = 40 * 1024 * 1024;
  const UNIT_NAMES = { 100: "metros", 1: "centímetros", 0.1: "milímetros" };
  const ERRORS = {
    dwg: "Ese archivo es un DWG, que es un formato cerrado de AutoCAD. Abrilo en AutoCAD (o en un visor gratuito como DWG TrueView), elegí Guardar como → «DXF de AutoCAD 2000» o posterior, y subí ese DXF.",
    binary: "Ese DXF está guardado en formato binario. Guardalo de nuevo como DXF de texto (ASCII), que es la opción por defecto.",
    format: "Ese archivo no parece un DXF. Tiene que ser un dibujo guardado desde AutoCAD con Guardar como → DXF.",
    empty: "El DXF no tiene líneas en el espacio modelo. Si el dibujo está armado en una presentación (layout), copialo al modelo y guardalo de nuevo.",
    nowalls: "No encontré muros en las capas elegidas. Probá marcando otras capas o cambiando la unidad del dibujo.",
    big: "El archivo pesa más de 40 MB. Guardá en un DXF aparte solo la planta que querés ver."
  };

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  function init(root) {
    const drop = $("[data-cad-drop]", root), input = $("[data-cad-file]", root), msg = $("[data-cad-msg]", root), work = $("[data-cad-work]", root);
    const stage = $("[data-cad-stage]", root), found = $("[data-cad-found]", root), sheet = $("[data-cad-plan]", root), fromFile = $("[data-cad-dxf]", root);
    const groupSel = $('[data-cad-opt="group"]', root), unitSel = $('[data-cad-opt="unit"]', root), roofSel = $('[data-cad-opt="roof"]', root), layerBox = $("[data-cad-layers]", root);
    let drawing = null, plan = null, last = null, pick = { layers: null, unit: 0, group: 0 }, fileName = "plano";

    function say(text, bad) { msg.textContent = text || ""; msg.classList.toggle("is-error", !!bad); }
    function reset() {
      if (brand.render) brand.render.close();
      work.hidden = true; drop.hidden = false; plan = drawing = null; input.value = "";
      say("");
    }

    // Muestra el plano que quedó: resumen, planta y render.
    function show(result) {
      const s = P.settingsOf(plan), v = P.survey(plan, s, P.bricksOf(s)), xs = [], ys = [];
      plan.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
      const wide = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)); // cm
      const parts = [plural(plan.walls.length, "muro", "muros"), plural(v.count.door, "puerta", "puertas"), plural(v.count.window, "ventana", "ventanas"), plural(v.rooms.length, "ambiente", "ambientes")];
      let text = parts.slice(0, -1).join(", ") + " y " + parts[parts.length - 1] + " · " + E.fmt((Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 100, 2) + " × " + E.fmt((Math.max.apply(null, ys) - Math.min.apply(null, ys)) / 100, 2) + " m · " + E.fmt(v.floor, 1) + " m² cubiertos.";
      if (result) {
        text = "Encontré " + text + " Dibujo en " + (UNIT_NAMES[result.unit] || "otra unidad") + ".";
        if (result.single) text += " Parece dibujado con una sola línea por muro: tomé 15 cm de espesor.";
        if (!v.rooms.length) text += " Ningún ambiente quedó cerrado: revisá las capas de muros o la unidad.";
        if (wide > 15000 || wide < 200) text += " Esas medidas no parecen las de una casa: probá con otra unidad del dibujo.";
      } else text = "Casa de ejemplo: " + text;
      found.textContent = text;
      sheet.innerHTML = P.staticSVG(plan).svg;
      roofSel.value = s.roof;
      drop.hidden = true; work.hidden = false;
      say("");
      if (!brand.render) { say("No se pudo cargar el render. Recargá la página.", true); return; }
      brand.render.open(stage, plan, { roof: s.roof !== "none" }).catch(function (e) {
        say(/WebGL/.test(e.message) ? "Este navegador no tiene WebGL activado, así que no puede mostrar el render. La planta de la derecha es lo que se leyó del archivo." : "No se pudo abrir el render: " + e.message, true);
      });
    }

    function convert() {
      let result;
      try { result = brand.cad.toPlan(drawing, pick); }
      catch (e) { if (!e.code) console.warn("[cad]", e); say(ERRORS[e.code] || "No se pudo interpretar el dibujo.", true); return; }
      plan = result.plan; last = result;
      if (!work.hidden) plan.settings.roof = roofSel.value; // el techo elegido se conserva al cambiar las opciones
      fromFile.hidden = false;
      groupSel.innerHTML = result.groups.map(function (g, i) { return '<option value="' + i + '">Dibujo ' + (i + 1) + " — " + E.fmt(g.w, 1) + " × " + E.fmt(g.h, 1) + " m, " + plural(g.walls, "muro", "muros") + "</option>"; }).join("");
      groupSel.value = result.group;
      groupSel.closest("label").hidden = result.groups.length < 2;
      unitSel.options[0].textContent = "Automática" + (pick.unit ? "" : " (" + (UNIT_NAMES[result.unit] || "?") + ")");
      layerBox.innerHTML = drawing.layers.map(function (l) {
        return '<label><input type="checkbox" value="' + escHTML(l.name) + '"' + (result.layers.indexOf(l.name) >= 0 ? " checked" : "") + "> " + escHTML(l.name) + " <small>" + l.count + "</small></label>";
      }).join("");
      show(result);
    }

    function openFile(file) {
      if (!file) return;
      if (/\.dwg$/i.test(file.name)) { say(ERRORS.dwg, true); return; }
      if (file.size > MAX) { say(ERRORS.big, true); return; }
      say("Leyendo " + file.name + "…");
      const reader = new FileReader();
      reader.onerror = function () { say("No se pudo leer el archivo.", true); };
      reader.onload = function () {
        // Los DXF anteriores a AutoCAD 2007 no vienen en UTF-8, sino en la página de códigos de Windows.
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(reader.result); }
        catch (e) { text = new TextDecoder("windows-1252").decode(reader.result); }
        setTimeout(function () { // deja que se vea "Leyendo…" antes de ponerse a trabajar
          try { drawing = brand.cad.read(text); }
          catch (e) { if (!e.code) console.warn("[cad]", e); say(ERRORS[e.code] || ERRORS.format, true); return; }
          fileName = file.name.replace(/\.[^.]+$/, "") || "plano";
          pick = { layers: null, unit: 0, group: 0 };
          unitSel.value = "0";
          if (brand.render) brand.render.close();
          work.hidden = true;
          convert();
        }, 30);
      };
      reader.readAsArrayBuffer(file);
    }

    function download(name, text) {
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    const actions = {
      pick: function () { input.click(); },
      sample: function () { drawing = last = null; plan = P.sample(); fromFile.hidden = true; show(null); },
      again: reset,
      edit: function () {
        if (!plan) return;
        const json = JSON.stringify(plan);
        try { localStorage.setItem(HANDOFF, json); }
        catch (e) { // sin almacenamiento (ventana privada): se lleva como archivo
          download(fileName + ".json", json);
          say("Tu navegador no deja pasarle el plano al diseñador. Lo descargué como archivo: abrilo desde el diseñador con «Abrir».");
          return;
        }
        location.href = root.getAttribute("data-cad-planner") + "#importado";
      }
    };
    root.addEventListener("click", function (e) {
      const b = e.target.closest("[data-cad-act]");
      if (b && actions[b.getAttribute("data-cad-act")]) actions[b.getAttribute("data-cad-act")]();
    });
    input.addEventListener("change", function () { openFile(input.files[0]); });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) { openFile(e.dataTransfer && e.dataTransfer.files[0]); });

    groupSel.addEventListener("change", function () { pick.group = Number(groupSel.value); convert(); });
    unitSel.addEventListener("change", function () { pick.unit = Number(unitSel.value); pick.group = 0; convert(); });
    layerBox.addEventListener("change", function () {
      pick.layers = Array.from(layerBox.querySelectorAll("input:checked")).map(function (el) { return el.value; });
      pick.group = 0;
      convert();
    });
    roofSel.addEventListener("change", function () {
      if (!plan) return;
      plan.settings.roof = roofSel.value;
      show(last);
    });
  }

  function boot() { const root = $("[data-cad]"); if (root && P) { try { init(root); } catch (e) { console.warn("[cad]", e); } } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
