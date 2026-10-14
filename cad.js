/* CalcuObra — "De AutoCAD a render", en la portada: lee los DXF en el dispositivo (lib/dxfin.js), muestra
   qué entendió de cada dibujo y renderiza la planta (render.js). Los archivos no se suben a ningún lado.
   Se cargan en tres casilleros: la planta (o el plano completo), los cortes y las vistas. Un archivo con varios
   dibujos se separa en dibujos sueltos y cada uno recibe un papel: planta, corte, vista o no usar. Solo la planta
   arma el 3D; dentro de ella, los muros que no cierran ningún ambiente quedan como cerco, fuera de la casa. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const P = brand.plan, E = brand.engine;
  const HANDOFF = "calcuobra.importado"; // plano que se le pasa al diseñador: planner.js lo toma al abrir con #importado
  const MAX = 40 * 1024 * 1024;
  const UNIT_NAMES = { 100: "metros", 1: "centímetros", 0.1: "milímetros" };
  const KIND_NAMES = { planta: "planta", corte: "corte", vista: "vista", otro: "otro dibujo", "?": "sin identificar" };
  const ROLES = [["planta", "Planta → 3D"], ["corte", "Corte"], ["vista", "Vista"], ["otro", "No usar"]];
  const SLOT_NAMES = { planta: "Planta", corte: "Cortes", vista: "Vistas" };
  const ERRORS = {
    dwg: "Ese archivo es un DWG, que es un formato cerrado de AutoCAD. Abrilo en AutoCAD (o en un visor gratuito como DWG TrueView), elegí Guardar como → «DXF de AutoCAD 2000» o posterior, y subí ese DXF.",
    binary: "Ese DXF está guardado en formato binario. Guardalo de nuevo como DXF de texto (ASCII), que es la opción por defecto.",
    format: "Ese archivo no parece un DXF. Tiene que ser un dibujo guardado desde AutoCAD con Guardar como → DXF.",
    empty: "El DXF no tiene líneas en el espacio modelo. Si el dibujo está armado en una presentación (layout), copialo al modelo y guardalo de nuevo.",
    nowalls: "No encontré muros en las capas elegidas. Probá marcando otras capas o cambiando la unidad del dibujo.",
    noplan: "No encontré una planta entre los dibujos. Subí la planta en el primer casillero o, en la lista de dibujos, elegí cuál es la planta.",
    big: "El archivo pesa más de 40 MB. Guardá en un DXF aparte solo la planta que querés ver."
  };

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  const r2 = (v) => Math.round(v * 100) / 100;
  function fail(code) { const e = new Error(code); e.code = code; return e; }

  // Lee un archivo como texto. Los DXF anteriores a AutoCAD 2007 no vienen en UTF-8, sino en la página de códigos de Windows.
  function readText(file) {
    return new Promise(function (resolve, reject) {
      if (/\.dwg$/i.test(file.name)) { reject(fail("dwg")); return; }
      if (file.size > MAX) { reject(fail("big")); return; }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error("No se pudo leer el archivo.")); };
      reader.onload = function () {
        try { resolve(new TextDecoder("utf-8", { fatal: true }).decode(reader.result)); }
        catch (e) { resolve(new TextDecoder("windows-1252").decode(reader.result)); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function init(root) {
    const drop = $("[data-cad-drop]", root), input = $("[data-cad-file]", root), extra = $("[data-cad-extra]", root), msg = $("[data-cad-msg]", root), work = $("[data-cad-work]", root);
    const stage = $("[data-cad-stage]", root), found = $("[data-cad-found]", root), sheet = $("[data-cad-plan]", root), fromFile = $("[data-cad-dxf]", root);
    const unitSel = $('[data-cad-opt="unit"]', root), roofSel = $('[data-cad-opt="roof"]', root), layerBox = $("[data-cad-layers]", root);
    const drawingsBox = $("[data-cad-drawings]", root), fenceTip = $("[data-cad-fence-tip]", root), guide = $(".cad-guide", root);
    /* sources: archivos cargados {name, slot, drawing, sheets}; regions: dibujos de todos los archivos {src, index, role, …};
       current: el dibujo que es la planta; pick: lo que eligió el usuario para la planta (capas, unidad, cercos corregidos). */
    let sources = [], regions = [], current = -1, plan = null, last = null, fileName = "plano";
    let pick = { layers: null, unit: 0, fence: {} };

    function say(text, bad) { msg.textContent = text || ""; msg.classList.toggle("is-error", !!bad); }
    function reset() {
      if (brand.render) brand.render.close();
      work.hidden = true; drop.hidden = false; if (guide) guide.hidden = false; plan = last = null; input.value = ""; extra.value = "";
      sources = []; regions = []; current = -1; pick = { layers: null, unit: 0, fence: {} };
      slots();
      say("");
    }

    // Lo que hay cargado en cada casillero de la pantalla de inicio.
    function slots() {
      ["planta", "corte", "vista"].forEach(function (slot) {
        const out = $('[data-cad-slot="' + slot + '"]', root);
        if (!out) return;
        const names = sources.filter(function (s) { return s.slot === slot; }).map(function (s) { return s.name; });
        out.textContent = names.length ? names.join(", ") : slot === "planta" ? "" : "Opcional";
        out.closest("[data-cad-act]").classList.toggle("is-loaded", names.length > 0);
      });
    }

    // ---------- Archivos ----------
    // Casillero de un archivo soltado sin elegir: por el nombre y, si no dice, por lo que tiene adentro.
    function guessSlot(name, sheets) {
      if (/corte|secci/i.test(name)) return "corte";
      if (/vista|fachada|frente|elevaci/i.test(name)) return "vista";
      if (/planta/i.test(name) || sheets.planta >= 0) return "planta";
      const count = { corte: 0, vista: 0 };
      sheets.regions.forEach(function (r) { if (r.kind in count) count[r.kind]++; });
      return count.vista > count.corte ? "vista" : count.corte ? "corte" : "planta";
    }

    function addFiles(files, slot) {
      files = Array.from(files || []).filter(Boolean);
      if (!files.length) return;
      say("Leyendo " + files.map(function (f) { return f.name; }).join(", ") + "…");
      setTimeout(function () { // deja que se vea "Leyendo…" antes de ponerse a trabajar
        Promise.all(files.map(function (file) {
          return readText(file).then(function (text) {
            const drawing = brand.cad.read(text);
            return { name: file.name, drawing: drawing, sheets: brand.cad.sheets(drawing) };
          }).catch(function (e) { e.file = file.name; throw e; });
        })).then(function (loaded) {
          // En el casillero de la planta va un solo archivo: el primero que tenga una planta.
          let plantaTaken = false;
          loaded.forEach(function (src) {
            let s = slot || guessSlot(src.name, src.sheets);
            if (s === "planta" && plantaTaken) s = "otro";
            if (s === "planta") { plantaTaken = true; dropSlot("planta"); fileName = src.name.replace(/\.[^.]+$/, "") || "plano"; }
            src.slot = s;
            addSource(src);
          });
          slots();
          if (plantaTaken) { pick = { layers: null, unit: 0, fence: {} }; unitSel.value = "0"; }
          if (current < 0) pickPlanta();
          if (current < 0) {
            const has = sources.some(function (s) { return s.slot === "planta"; });
            if (has) { say(ERRORS.noplan, true); if (!work.hidden) drawings(); }
            else say("Listo: " + loaded.map(function (s) { return s.name; }).join(", ") + ". Ahora subí la planta.");
            return;
          }
          if (plantaTaken || work.hidden) convert(); else { drawings(); say(""); }
        }).catch(function (e) {
          if (!e.code) console.warn("[cad]", e);
          say((e.file ? e.file + ": " : "") + (ERRORS[e.code] || e.message || ERRORS.format), true);
        });
      }, 30);
    }

    function dropSlot(slot) {
      const gone = sources.filter(function (s) { return s.slot === slot; });
      if (!gone.length) return;
      sources = sources.filter(function (s) { return s.slot !== slot; });
      regions = regions.filter(function (r) { return gone.indexOf(r.source) < 0; });
      current = -1;
    }

    // Los dibujos de un archivo entran a la lista con un papel: el que dice su casillero o el que se adivinó.
    function addSource(src) {
      sources.push(src);
      src.sheets.regions.forEach(function (r, i) {
        let role = src.slot === "corte" || src.slot === "vista" ? src.slot : r.kind === "?" ? "otro" : r.kind;
        if (src.slot === "planta" && role === "planta" && i !== src.sheets.planta) role = "otro"; // una sola planta va al 3D
        if (src.slot === "planta" && i === src.sheets.planta) role = "planta";
        if (role === "planta" && src.slot !== "planta") role = "otro";
        regions.push(Object.assign({}, r, { source: src, index: i, role: role }));
      });
    }

    function pickPlanta() {
      current = regions.findIndex(function (r) { return r.role === "planta"; });
    }

    // ---------- Planta → plano ----------
    function convert() {
      if (current < 0) { say(ERRORS.noplan, true); return; }
      const reg = regions[current], src = reg.source;
      let result;
      try { result = brand.cad.toPlan(src.drawing, { box: reg.box, unit: pick.unit || src.sheets.unit, layers: pick.layers, fence: pick.fence }); }
      catch (e) { if (!e.code) console.warn("[cad]", e); say(ERRORS[e.code] || "No se pudo interpretar el dibujo.", true); drawings(); return; }
      plan = result.plan; last = result;
      if (!work.hidden) plan.settings.roof = roofSel.value; // el techo elegido se conserva al cambiar las opciones
      fromFile.hidden = false;
      unitSel.options[0].textContent = "Automática" + (pick.unit ? "" : " (" + (UNIT_NAMES[src.sheets.unit] || "?") + ")");
      layerBox.innerHTML = src.drawing.layers.map(function (l) {
        return '<label><input type="checkbox" value="' + escHTML(l.name) + '"' + (result.layers.indexOf(l.name) >= 0 ? " checked" : "") + "> " + escHTML(l.name) + " <small>" + l.count + "</small></label>";
      }).join("");
      show(result);
    }

    // Planta leída, con los cercos en otro color y una línea invisible y ancha sobre cada muro para tocarlo.
    function planSVG(result) {
      let svg = P.staticSVG(plan).svg;
      if (!result) return svg;
      const xs = [], ys = [];
      result.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
      const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), w = Math.max.apply(null, xs) - x0, h = Math.max.apply(null, ys) - y0, pad = Math.max(w, h) * 0.06;
      svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="' + [x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad].map(r2).join(" ") + '"');
      let extra = "";
      result.walls.forEach(function (wl) {
        if (wl.fence) extra += '<line class="cad-fence" x1="' + wl.a.x + '" y1="' + wl.a.y + '" x2="' + wl.b.x + '" y2="' + wl.b.y + '" stroke-width="' + r2(wl.thick) + '"/>';
      });
      result.walls.forEach(function (wl) {
        extra += '<line class="cad-hit" data-cad-wall="' + escHTML(wl.key) + '" data-fence="' + (wl.fence ? 1 : 0) + '" x1="' + wl.a.x + '" y1="' + wl.a.y + '" x2="' + wl.b.x + '" y2="' + wl.b.y +
          '" stroke-width="' + r2(Math.max(wl.thick * 2, Math.max(w, h) / 45)) + '"><title>' + (wl.fence ? "Cerco: tocá para pasarlo a la casa" : "Muro de la casa: tocá para pasarlo a cerco") + "</title></line>";
      });
      return svg.replace(/<\/svg>$/, extra + "</svg>");
    }

    // Muestra el plano que quedó: resumen, planta, dibujos del archivo y render.
    function show(result) {
      const s = P.settingsOf(plan), v = P.survey(plan, s, P.bricksOf(s)), xs = [], ys = [];
      plan.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
      const wide = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)); // cm
      const parts = [plural(plan.walls.length, "muro", "muros"), plural(v.count.door, "puerta", "puertas"), plural(v.count.window, "ventana", "ventanas"), plural(v.rooms.length, "ambiente", "ambientes")];
      let text = parts.slice(0, -1).join(", ") + " y " + parts[parts.length - 1] + " · " + E.fmt((Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 100, 2) + " × " + E.fmt((Math.max.apply(null, ys) - Math.min.apply(null, ys)) / 100, 2) + " m · " + E.fmt(v.floor, 1) + " m² cubiertos.";
      if (result) {
        text = "Encontré " + text + " Dibujo en " + (UNIT_NAMES[result.unit] || "otra unidad") + ".";
        if (result.single) text += " Parece dibujado con una sola línea por muro: tomé 15 cm de espesor.";
        if (result.stats.fences) text += " " + (result.stats.fences === 1 ? "Un tramo no cierra" : result.stats.fences + " tramos no cierran") + " ningún ambiente: los tomé como cerco y no van en el 3D.";
        if (!v.rooms.length) text += " Ningún ambiente quedó cerrado: revisá las capas de muros o la unidad.";
        if (wide > 15000 || wide < 200) text += " Esas medidas no parecen las de una casa: probá con otra unidad del dibujo.";
      } else text = "Casa de ejemplo: " + text;
      found.textContent = text;
      sheet.innerHTML = planSVG(result);
      fenceTip.hidden = !result;
      roofSel.value = s.roof;
      drawings();
      drop.hidden = true; work.hidden = false; if (guide) guide.hidden = true;
      say("");
      if (!brand.render) { say("No se pudo cargar el render. Recargá la página.", true); return; }
      brand.render.open(stage, plan, { roof: s.roof !== "none" }).catch(function (e) {
        say(/WebGL/.test(e.message) ? "Este navegador no tiene WebGL activado, así que no puede mostrar el render. La planta de la derecha es lo que se leyó del archivo." : "No se pudo abrir el render: " + e.message, true);
      });
    }

    // ---------- Dibujos de los archivos ----------
    // Vista general de un archivo: todas sus líneas y un recuadro por dibujo con su papel. Tocar un recuadro lo hace la planta.
    function overview(src) {
      const d = src.drawing, mine = regions.filter(function (r) { return r.source === src; });
      if (!mine.length) return "";
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
      mine.forEach(function (r) { X0 = Math.min(X0, r.box.x0); Y0 = Math.min(Y0, r.box.y0); X1 = Math.max(X1, r.box.x1); Y1 = Math.max(Y1, r.box.y1); });
      const W = X1 - X0, H = Y1 - Y0, pad = Math.max(W, H) * 0.03, k = Math.max(W, H) / 1000, q = function (v) { return Math.round(v / k) / 10; };
      const inView = function (x, y) { return x >= X0 && x <= X1 && y >= Y0 && y <= Y1; };
      let path = "", n = 0;
      for (let i = 0; i < d.segs.length && n < 60000; i++) {
        const s = d.segs[i];
        if (!inView(s.x1, s.y1) && !inView(s.x2, s.y2)) continue;
        path += "M" + q(s.x1 - X0) + " " + q(Y1 - s.y1) + "L" + q(s.x2 - X0) + " " + q(Y1 - s.y2);
        n++;
      }
      d.arcs.forEach(function (a) {
        if (!inView(a.c.x, a.c.y)) return;
        const r = q(a.r), sweep = ((Math.atan2(a.q.y - a.c.y, a.q.x - a.c.x) - Math.atan2(a.p.y - a.c.y, a.p.x - a.c.x)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        path += "M" + q(a.p.x - X0) + " " + q(Y1 - a.p.y) + "A" + r + " " + r + " 0 " + (sweep > Math.PI ? 1 : 0) + " 0 " + q(a.q.x - X0) + " " + q(Y1 - a.q.y);
      });
      const font = q(Math.max(W, H) * 0.035);
      let boxes = "";
      mine.forEach(function (r) {
        const at = regions.indexOf(r), x = q(r.box.x0 - X0), y = q(Y1 - r.box.y1), w = q(r.box.x1 - r.box.x0), h = q(r.box.y1 - r.box.y0);
        boxes += '<g class="cad-region is-' + r.role + (at === current ? " is-current" : "") + '" data-cad-region="' + at + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' +
          '<text x="' + r2(x + font * 0.4) + '" y="' + r2(y + font * 1.1) + '" font-size="' + font + '">' + escHTML(roleName(r.role)) + "</text><title>" + escHTML(regionName(r)) + "</title></g>";
      });
      const v = [-pad / k / 10, -pad / k / 10, W / k / 10 + 2 * pad / k / 10, H / k / 10 + 2 * pad / k / 10].map(r2).join(" ");
      return '<figure class="cad-sheet"><svg viewBox="' + v + '" role="img" aria-label="Dibujos de ' + escHTML(src.name) + '"><path class="cad-ink" d="' + path + '"/>' + boxes + "</svg>" +
        "<figcaption>" + escHTML(src.name) + " · " + SLOT_NAMES[src.slot === "otro" ? "planta" : src.slot] + "</figcaption></figure>";
    }
    function roleName(role) { return role === "otro" ? "No usar" : ROLES.find(function (x) { return x[0] === role; })[1].replace(" → 3D", ""); }
    function regionName(r) {
      const n = regions.indexOf(r) + 1;
      return "Dibujo " + n + " · " + (r.title || KIND_NAMES[r.kind].charAt(0).toUpperCase() + KIND_NAMES[r.kind].slice(1)) + " · " + E.fmt(r.w, 1) + " × " + E.fmt(r.h, 1) + " m";
    }

    function drawings() {
      if (!regions.length) { drawingsBox.hidden = true; return; }
      drawingsBox.hidden = false;
      let html = sources.map(overview).join("");
      html += '<div class="cad-roles">' + regions.map(function (r, i) {
        return '<label><span>' + escHTML(regionName(r)) + '</span><select data-cad-role="' + i + '">' + ROLES.map(function (o) {
          return '<option value="' + o[0] + '"' + (r.role === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
        }).join("") + "</select></label>";
      }).join("") + "</div>";
      const extras = regions.some(function (r) { return r.role === "corte" || r.role === "vista"; });
      if (extras) html += '<p class="badge">Por ahora el 3D se arma con la planta: los cortes y las vistas quedan acá para compararlos. Las alturas se ajustan en el diseñador.</p>';
      $("[data-cad-drawings-list]", drawingsBox).innerHTML = html;
      $("summary", drawingsBox).textContent = "Dibujos (" + regions.length + ")";
      if (regions.length > 1) drawingsBox.open = true;
    }

    function setRole(i, role) {
      const r = regions[i];
      if (!r) return;
      if (role === "planta") {
        regions.forEach(function (o, j) { if (j !== i && o.role === "planta") o.role = o.kind === "corte" || o.kind === "vista" ? o.kind : "otro"; });
        r.role = "planta";
        if (current !== i) { current = i; pick = { layers: null, unit: 0, fence: {} }; unitSel.value = "0"; fileName = r.source.name.replace(/\.[^.]+$/, "") || "plano"; convert(); }
        else drawings();
        return;
      }
      r.role = role;
      if (i === current) {
        // La planta pasó a ser otra cosa: va la siguiente que parezca planta, si hay.
        current = regions.findIndex(function (o) { return o.role !== "corte" && o.role !== "vista" && o !== r && (o.kind === "planta" || o.kind === "?"); });
        if (current >= 0) { regions[current].role = "planta"; pick = { layers: null, unit: 0, fence: {} }; convert(); return; }
        if (brand.render) brand.render.close();
        say(ERRORS.noplan, true);
      }
      drawings();
    }

    // ---------- Descarga y acciones ----------
    function download(name, text) {
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    let extraSlot = "corte";
    const actions = {
      pick: function () { input.click(); },
      "add-corte": function () { extraSlot = "corte"; extra.click(); },
      "add-vista": function () { extraSlot = "vista"; extra.click(); },
      sample: function () { sources = []; regions = []; current = -1; last = null; plan = P.sample(); fromFile.hidden = true; show(null); },
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
      if (b && actions[b.getAttribute("data-cad-act")]) { actions[b.getAttribute("data-cad-act")](); return; }
      const reg = e.target.closest("[data-cad-region]");
      if (reg) { setRole(Number(reg.getAttribute("data-cad-region")), "planta"); return; }
      const wall = e.target.closest("[data-cad-wall]");
      if (wall && last) {
        const key = wall.getAttribute("data-cad-wall"), was = wall.getAttribute("data-fence") === "1";
        pick.fence[key] = !was;
        const auto = last.walls.find(function (w) { return w.key === key; });
        if (auto && auto.auto === !was) delete pick.fence[key]; // volvió a lo que se detectó solo
        convert();
      }
    });
    input.addEventListener("change", function () { addFiles(input.files, input.files.length > 1 ? null : "planta"); input.value = ""; });
    extra.addEventListener("change", function () { addFiles(extra.files, extraSlot); extra.value = ""; });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    // Un archivo soltado va a la planta; varios, cada uno a su casillero según el nombre y lo que tiene.
    drop.addEventListener("drop", function (e) {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addFiles(files, files.length > 1 ? null : "planta");
    });

    drawingsBox.addEventListener("change", function (e) {
      const sel = e.target.closest("[data-cad-role]");
      if (sel) setRole(Number(sel.getAttribute("data-cad-role")), sel.value);
    });
    unitSel.addEventListener("change", function () {
      pick.unit = Number(unitSel.value); pick.fence = {};
      if (current < 0) return;
      // Con otra unidad cambia la distancia que separa los dibujos: se vuelve a partir el archivo de la planta.
      const src = regions[current].source, keep = regions.filter(function (r) { return r.source !== src; });
      src.sheets = brand.cad.sheets(src.drawing, { unit: pick.unit || 0 });
      regions = keep; current = -1;
      addSource(src); sources.pop(); // addSource la vuelve a sumar a la lista: ya estaba
      pickPlanta();
      if (current < 0) { // con esta unidad no se reconoce ninguna planta: va el primer dibujo del archivo, para que se vea qué pasó
        current = regions.findIndex(function (r) { return r.source === src; });
        if (current >= 0) regions[current].role = "planta";
      }
      convert();
    });
    layerBox.addEventListener("change", function () {
      pick.layers = Array.from(layerBox.querySelectorAll("input:checked")).map(function (el) { return el.value; });
      pick.fence = {};
      convert();
    });
    roofSel.addEventListener("change", function () {
      if (!plan) return;
      plan.settings.roof = roofSel.value;
      show(last);
    });
    slots();
  }

  function boot() { const root = $("[data-cad]"); if (root && P) { try { init(root); } catch (e) { console.warn("[cad]", e); } } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
