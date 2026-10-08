/* CalcuObra — diseñador de planos: editor SVG. La geometría, el cómputo y los símbolos están en lib/plan.js. */
(function () {
  "use strict";

  const brand = window.__BRAND__ || {};
  const E = brand.engine, P = brand.plan, D = brand.data;

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const STORE = "calcuobra.plano.v1";
  const GRID = 10; // cm
  const UNTITLED = "Plano sin título";
  const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; // cm, para reglas y escala gráfica
  const LAYERS = { names: true, areas: true, dims: true, grid: true, items: true, electric: true, below: true, roof: false, notes: true };
  const NOTES = P.NOTE_KINDS; // herramientas de anotación: trazo, línea, flecha, formas, nube y nota de texto
  const OPTIONS = "ABCDEF";   // variantes del plano: "Opción A", "Opción B"…
  const COLOR_NAMES = { "": "Sin color", "#e5484d": "Rojo", "#f08c00": "Naranja", "#2fa84f": "Verde", "#12a5a5": "Turquesa", "#3b82f6": "Azul", "#9b59d0": "Violeta", "#a0785a": "Madera" };
  const HINTS = {
    select: "Tocá un muro para cambiarle el ladrillo o el largo. Arrastrá un recuadro para elegir varios; con Shift sumás a la selección y Ctrl+A los toma todos. Para desplazarte usá la Mano (H) o mantené apretada la barra espaciadora.",
    multi: "Tocá cada muro que quieras sumar o quitar, o arrastrá un recuadro para sumar varios. Para desplazarte usá la Mano. Tocá otra vez «Elegir varios» para terminar.",
    pan: "Arrastrá para desplazarte por el plano. Con la rueda del mouse acercás y alejás. Desde cualquier herramienta, la barra espaciadora hace lo mismo.",
    wall: "Elegí abajo el ladrillo de los muros nuevos. Tocá donde empieza la pared y donde termina, o escribí el largo en metros y apretá Enter. Esc corta la cadena.",
    room: "Tocá una esquina del ambiente y después la esquina opuesta.",
    opening: "Tocá una pared para colocar la abertura elegida. Esc para dejar de colocar.",
    item: "Tocá el plano para colocar el objeto elegido. Después lo podés mover, girar y cambiar de medida.",
    measure: "Tocá dos puntos para medir la distancia entre ellos.",
    arc: "Pared curva: tocá el inicio, después el final y por último un punto por donde pasa la curva.",
    surface: "Tocá una esquina de la superficie exterior y después la esquina opuesta. Después elegís si es patio, vereda, galería o balcón.",
    wire: "Tocá una boca eléctrica y después otra para unirlas con un cable. Seguí tocando para encadenar.",
    section: "Tocá dos puntos para trazar la línea de corte. El corte aparece en el panel de la derecha.",
    pen: "Dibujá a mano alzada arrastrando sobre el plano. Elegí color y grosor en la barra de arriba. Las anotaciones no entran en el cómputo.",
    line: "Arrastrá para trazar una línea. Con Shift queda horizontal, vertical o a 45°.",
    arrow: "Arrastrá desde donde nace la flecha hasta lo que querés señalar. Con Shift queda horizontal, vertical o a 45°.",
    rect: "Arrastrá de una esquina a la opuesta. Con Shift sale un cuadrado.",
    ellipse: "Arrastrá de una esquina a la opuesta del recuadro que encierra la elipse. Con Shift sale un círculo.",
    cloud: "Arrastrá un recuadro alrededor de lo que hay que revisar: queda marcado con una nube de revisión.",
    text: "Tocá donde va la nota y escribí el texto en la barra de arriba."
  };
  const KEYS = { v: ["select"], h: ["pan"], w: ["wall"], r: ["room"], d: ["opening", "p80"], n: ["opening", "v120"], p: ["opening", "vano"], m: ["measure"], a: ["arc"], f: ["surface"], k: ["wire"], s: ["section"], b: ["pen"], l: ["line"], t: ["text"] };

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const copy = (p) => ({ x: p.x, y: p.y });
  const round = (v) => Math.round(v / GRID) * GRID;
  const n1 = (v) => Math.round(v * 10) / 10;
  const n2 = (v) => Math.round(v * 100) / 100;
  const size = (o) => E.fmt(o.w / 100, 2) + " × " + E.fmt(o.h / 100, 2);

  function libraryHTML() {
    return Object.keys(D.openingGroups).map(function (group) {
      const items = Object.keys(D.openings).filter((key) => D.openings[key].group === group).map(function (key) {
        const def = D.openings[key];
        return '<button type="button" class="lib-item" data-pick="' + key + '" aria-pressed="false">' +
          '<svg class="plan-svg" viewBox="0 0 100 62" aria-hidden="true">' + P.lineSVG({ x: 4, y: 48 }, { x: 96, y: 48 }, "wall ext", 9) +
          P.symbolSVG(def, { x: 24, y: 48 }, { x: 76, y: 48 }, 9, 1, { side: true }, "") + "</svg>" +
          "<span>" + escHTML(def.label) + "</span><small>" + size(def) + "</small></button>";
      }).join("");
      return '<h3 class="lib-title">' + escHTML(D.openingGroups[group]) + '</h3><div class="lib-grid">' + items + "</div>";
    }).join("");
  }

  function itemLibraryHTML() {
    return Object.keys(D.itemGroups).map(function (group) {
      const items = Object.keys(D.items).filter((key) => D.items[key].group === group).map(function (key) {
        const def = D.items[key], side = Math.max(def.w, def.d) * 1.15;
        return '<button type="button" class="lib-item" data-pick-item="' + key + '" aria-pressed="false">' +
          '<svg class="plan-svg" viewBox="' + [-side / 2, -side / 2, side, side].map(n1).join(" ") + '" aria-hidden="true">' +
          P.itemSVG({ type: key, x: 0, y: 0, r: 0, w: def.w, d: def.d }, side / 60, "") + "</svg>" +
          "<span>" + escHTML(def.label) + "</span><small>" + size({ w: def.w, h: def.d }) + "</small></button>";
      }).join("");
      return '<details class="lib-group"><summary>' + escHTML(D.itemGroups[group]) + '</summary><div class="lib-grid">' + items + "</div></details>";
    }).join("");
  }

  function init(root) {
    const svg = $("[data-canvas]", root), hint = $("[data-hint]", root), inspector = $("[data-inspector]", root);
    const settings = $("[data-settings]", root), out = $("[data-result]", root), title = $("[data-title]", root);
    const emptyNote = $("[data-empty-note]", root);
    const sketchBar = $("[data-sketch-bar]", root), checksOut = $("[data-checks]", root), checksCount = $("[data-checks-count]", root);
    const sectionBox = $("[data-section-box]", root), sectionOut = $("[data-section]", root);
    const compareBox = $("[data-compare-box]", root), compareOut = $("[data-compare]", root);
    const refBox = $("[data-ref-box]", root), stage3d = $("[data-view3d]", root), note3d = $("[data-view3d-msg]", root);
    const zoomOut = $("[data-zoom]", root), coords = $("[data-coords]", root), scaleBar = $("[data-scale]", root), emptyBox = $("[data-empty]", root);
    const view = { x: 0, y: 0, w: 1000, h: 1000 };
    const history = [], future = [];
    let plan = start();
    let tool = "select", pick = null, sel = null, chain = null, hover = null, ghost = null, typed = "", drag = null, model = null, text = "", measure = null, arcEnd = null, wireFrom = null, sketch = null;
    let spaceDown = false; // barra espaciadora apretada: arrastrar desplaza el plano, con cualquier herramienta
    let nextType = ""; // ladrillo de los muros que se dibujen a continuación; vacío = el tipo por defecto
    let multi = false; // "Elegir varios": cada toque suma o quita muros, como Shift; para pantallas táctiles
    let nextNote = { color: "", w: "m" }; // color y grosor de las anotaciones que se dibujen a continuación
    let presenting = false; // modo presentación: solo el plano, para mostrarlo y marcarlo frente al cliente

    // ---------- Estado ----------
    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE));
        return normalize(saved);
      } catch (e) { return null; }
    }
    // Acepta planos guardados por versiones anteriores y archivos abiertos desde el disco.
    function normalize(saved) {
      if (!saved || !Array.isArray(saved.walls) || !Array.isArray(saved.openings)) return null;
      saved.labels = saved.labels || [];
      saved.wires = saved.wires || [];
      saved.surfaces = saved.surfaces || [];
      saved.items = (saved.items || []).filter(function (it) { return D.items[it.type]; });
      saved.openings.forEach(function (o) { if (!D.openings[o.type]) o.type = o.kind === "window" ? "v120" : "p80"; });
      saved.notes = cleanNotes(saved.notes);
      saved.levels = cleanLevels(saved.levels);
      saved.level = Math.min(saved.level || 0, Math.max(0, saved.levels.length - 1));
      saved.variants = (Array.isArray(saved.variants) ? saved.variants : []).filter(function (v) { return v && Array.isArray(v.levels) && v.levels.length; }).slice(0, OPTIONS.length)
        .map(function (v) { const levels = cleanLevels(v.levels); return { levels: levels, level: Math.min(v.level || 0, levels.length - 1), section: v.section || null }; });
      saved.variant = Math.min(saved.variant || 0, Math.max(0, saved.variants.length - 1));
      return saved;
    }
    // Anotaciones bien formadas: un tipo conocido y puntos con números.
    function cleanNotes(list) {
      return (Array.isArray(list) ? list : []).filter(function (nt) {
        return nt && NOTES[nt.kind] && Array.isArray(nt.pts) && nt.pts.length >= (nt.kind === "text" ? 1 : 2) && nt.pts.every(function (q) { return q && isFinite(q.x) && isFinite(q.y); });
      });
    }
    function cleanLevels(list) {
      return (list || []).map(function (lv, i) {
        const level = { name: lv.name || P.LEVEL_NAMES[i] };
        P.LEVEL_FIELDS.forEach(function (f) { level[f] = lv[f] || []; });
        level.items = level.items.filter(function (it) { return D.items[it.type]; });
        level.notes = cleanNotes(level.notes);
        return level;
      });
    }
    // Arranca con el plano guardado o vacío. Con #ejemplo en la dirección carga la casa de muestra
    // (el plano guardado, si había, queda a un "Deshacer" de distancia).
    function start() {
      const saved = load();
      if (location.hash !== "#ejemplo") return saved || P.empty();
      if (saved && saved.walls.length) history.push(JSON.stringify(Object.assign({}, saved, { ref: undefined })));
      try { window.history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
      return P.sample();
    }
    // La imagen de referencia pesa mucho: no entra en el historial y, si no cabe, tampoco en el guardado.
    const snapshot = () => JSON.stringify(Object.assign({}, plan, { ref: undefined }));
    function save() {
      try { localStorage.setItem(STORE, JSON.stringify(plan)); }
      catch (e) { try { localStorage.setItem(STORE, snapshot()); } catch (err) { /* sin almacenamiento */ } }
    }
    function pushHistory() { history.push(snapshot()); if (history.length > 60) history.shift(); future.length = 0; }
    function restore(from, to) {
      if (!from.length) return;
      const ref = plan.ref;
      to.push(snapshot());
      plan = JSON.parse(from.pop());
      plan.ref = ref;
      chain = null;
      commit(null);
      syncSettings();
    }
    function nextId() { plan.nextId = (plan.nextId || 1) + 1; return plan.nextId; }
    const layers = () => Object.assign({}, LAYERS, plan.layers);
    const wallById = (id) => plan.walls.find((w) => w.id === id);
    const openingById = (id) => plan.openings.find((o) => o.id === id);
    const itemById = (id) => plan.items.find((it) => it.id === id);

    const surfaceById = (id) => plan.surfaces.find((sf) => sf.id === id);
    const noteById = (id) => plan.notes.find((nt) => nt.id === id);
    const pt1 = (p) => ({ x: n1(p.x), y: n1(p.y) });

    // Plantas: los campos de P.LEVEL_FIELDS son siempre los de la planta activa; las demás esperan en plan.levels.
    function stashLevel() {
      if (!plan.levels || !plan.levels.length) plan.levels = [{ name: P.LEVEL_NAMES[0] }];
      plan.level = Math.min(plan.level || 0, plan.levels.length - 1);
      const level = { name: plan.levels[plan.level].name };
      P.LEVEL_FIELDS.forEach(function (f) { level[f] = plan[f] || []; });
      plan.levels[plan.level] = level;
    }
    function loadLevel(index) {
      const level = plan.levels[index];
      plan.level = index;
      P.LEVEL_FIELDS.forEach(function (f) { plan[f] = level[f] || []; });
    }
    function showLevel(index) {
      loadLevel(index);
      chain = null;
      fit();
      commit(null);
      syncSettings();
      setTool("select");
    }
    /* Opciones de diseño (variantes): igual que las plantas, la opción activa vive en los campos de trabajo del plano
       y las demás esperan en plan.variants. Comparten los ajustes de obra, las capas y los datos de carátula. */
    const variantCount = () => Math.max(1, (plan.variants || []).length);
    function stashVariant() {
      stashLevel();
      if (!plan.variants || !plan.variants.length) plan.variants = [{}];
      plan.variant = Math.min(plan.variant || 0, plan.variants.length - 1);
      plan.variants[plan.variant] = { levels: JSON.parse(JSON.stringify(plan.levels)), level: plan.level, section: plan.section || null };
    }
    function showVariant(index) {
      const v = plan.variants[index];
      plan.variant = index;
      plan.levels = JSON.parse(JSON.stringify(v.levels));
      plan.section = v.section || null;
      showLevel(Math.min(v.level || 0, plan.levels.length - 1));
    }
    const roomAt = (p) => model.rooms.find((r) => P.inside(r.points, p));
    const pickedWalls = () => !sel ? [] : sel.type === "wall" ? [sel.id] : sel.type === "walls" ? sel.ids : [];
    const wallsSel = (ids) => ids.length > 1 ? { type: "walls", ids: ids } : ids.length ? { type: "wall", id: ids[0] } : null;
    function selected() {
      if (!sel) return null;
      if (sel.type === "walls") { // varios muros: quedan los que sigan existiendo
        sel = wallsSel(sel.ids.filter((id) => wallById(id)));
        if (!sel || sel.type === "wall") return sel ? wallById(sel.id) : null;
        return sel.ids.map(wallById);
      }
      return sel.type === "wall" ? wallById(sel.id) : sel.type === "opening" ? openingById(sel.id) : sel.type === "item" ? itemById(sel.id) : sel.type === "surface" ? surfaceById(sel.id) :
        sel.type === "note" ? noteById(sel.id) : roomAt(sel);
    }

    // Guarda, cambia la selección y redibuja todo.
    function commit(selection) {
      plan.walls = plan.walls.filter((w) => dist(w.a, w.b) >= GRID);
      plan.openings = plan.openings.filter((o) => wallById(o.wall));
      plan.items = plan.items || [];
      plan.surfaces = plan.surfaces || [];
      plan.notes = plan.notes || [];
      plan.wires = (plan.wires || []).filter((w) => itemById(w.a) && itemById(w.b)); // un cable sin una de sus bocas no existe
      sel = selection;
      save();
      render();
      if (!selected()) sel = null;
      renderInspector();
      renderVariants();
    }

    // ---------- Geometría de pantalla ----------
    const px = () => view.w / (svg.getBoundingClientRect().width || 1000); // cm por píxel
    function toWorld(e) {
      const r = svg.getBoundingClientRect();
      return { x: view.x + (e.clientX - r.left) / r.width * view.w, y: view.y + (e.clientY - r.top) / r.height * view.h };
    }
    function fit() {
      // Encuadra los muros y también las superficies exteriores.
      const pts = plan.walls.reduce((all, w) => all.concat([w.a, w.b]), [])
        .concat((plan.surfaces || []).reduce((all, sf) => all.concat([{ x: sf.x, y: sf.y }, { x: sf.x + sf.w, y: sf.y + sf.h }]), []))
        .concat((plan.notes || []).reduce(function (all, nt) { const b = P.noteBox(nt); return b.x0 <= b.x1 ? all.concat([{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]) : all; }, []));
      const r = svg.getBoundingClientRect(), ratio = r.width && r.height ? r.height / r.width : 0.75;
      if (!pts.length) { view.w = Math.max(900, (r.width || 900) * 1.4); view.x = -view.w * 0.25; view.y = -view.w * ratio * 0.25; return; }
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      view.w = Math.max(maxX - minX, (maxY - minY) / ratio, 300) * 1.3;
      view.x = (minX + maxX) / 2 - view.w / 2;
      view.y = (minY + maxY) / 2 - view.w * ratio / 2;
    }
    function zoomAt(p, factor) {
      const w = Math.max(150, Math.min(20000, view.w * factor)), s = w / view.w;
      view.x = p.x - (p.x - view.x) * s;
      view.y = p.y - (p.y - view.y) * s;
      view.w = w;
      render();
    }

    // Imán: primero a los extremos de otras paredes, después a la grilla. Con "from" endereza a 90°.
    function snap(p, o) {
      o = o || {};
      if (plan.snap === false) return { x: Math.round(p.x), y: Math.round(p.y) };
      let x = round(p.x), y = round(p.y);
      if (o.from) {
        const dx = p.x - o.from.x, dy = p.y - o.from.y;
        if (Math.abs(dx) < Math.abs(dy) * 0.15) x = o.from.x;
        else if (Math.abs(dy) < Math.abs(dx) * 0.15) y = o.from.y;
      }
      let best = { x: x, y: y }, bestD = 12 * px();
      // También atrae a las esquinas de la planta de abajo, para apoyar muro sobre muro.
      plan.walls.concat(model && layers().below ? model.under : []).forEach(function (w) {
        [w.a, w.b].forEach(function (q) {
          if (o.skip && same(q, o.skip)) return;
          const d = dist(q, p);
          if (d < bestD) { bestD = d; best = copy(q); }
        });
      });
      return best;
    }

    function project(w, p) {
      const rx = w.b.x - w.a.x, ry = w.b.y - w.a.y, len2 = rx * rx + ry * ry;
      const raw = ((p.x - w.a.x) * rx + (p.y - w.a.y) * ry) / len2, t = Math.max(0, Math.min(1, raw));
      return { t: t, raw: raw, d: dist(p, { x: w.a.x + rx * t, y: w.a.y + ry * t }) };
    }
    const along = (w, t) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
    function hitWall(p) {
      let best = null;
      plan.walls.forEach(function (w) {
        const h = project(w, p);
        if (h.d <= Math.max((model.wallThick[w.id] || 12) / 2, 9 * px()) && (!best || h.d < best.d)) best = { wall: w, t: h.t, d: h.d };
      });
      return best;
    }
    function hitOpening(p) {
      return plan.openings.find((o) => dist(along(wallById(o.wall), o.t), p) <= Math.max(o.w / 2, 10 * px()) &&
        project(wallById(o.wall), p).d <= Math.max(15, 10 * px()));
    }
    // Los objetos se acomodan cada 5 cm.
    function itemPoint(p) {
      const step = plan.snap === false ? 1 : 5;
      return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
    }
    const itemLayer = (it) => D.items[it.type].group === "electricidad" ? "electric" : "items";
    function hitItem(p) {
      const show = layers();
      for (let i = plan.items.length - 1; i >= 0; i--) {
        if (show[itemLayer(plan.items[i])] && P.itemHit(plan.items[i], p, 6 * px())) return plan.items[i];
      }
      return null;
    }
    function hitNote(p) {
      if (!layers().notes) return null;
      for (let i = plan.notes.length - 1; i >= 0; i--) if (P.noteHit(plan.notes[i], p, 7 * px())) return plan.notes[i];
      return null;
    }
    // Con Shift: líneas y flechas a 0°, 45° o 90°; rectángulos, elipses y nubes de lados iguales.
    function straight(from, to, kind) {
      const dx = to.x - from.x, dy = to.y - from.y;
      if (kind === "line" || kind === "arrow") {
        const len = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
        return pt1({ x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len });
      }
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return pt1({ x: from.x + (dx < 0 ? -side : side), y: from.y + (dy < 0 ? -side : side) });
    }
    // Aligera un trazo a mano: quita los puntos que se apartan menos que tol de la recta entre sus vecinos (Ramer–Douglas–Peucker).
    function simplify(pts, tol) {
      if (pts.length < 3) return pts;
      const a = pts[0], b = pts[pts.length - 1], len = dist(a, b);
      let far = 0, at = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const d = len ? Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len : dist(a, pts[i]);
        if (d > far) { far = d; at = i; }
      }
      return far <= tol ? [a, b] : simplify(pts.slice(0, at + 1), tol).slice(0, -1).concat(simplify(pts.slice(at), tol));
    }
    const hitSurface = (p) => plan.surfaces.find((sf) => p.x >= sf.x && p.x <= sf.x + sf.w && p.y >= sf.y && p.y <= sf.y + sf.h);
    const hasWires = (id) => plan.wires.some((w) => w.a === id || w.b === id);
    function clampT(o, t) {
      const half = o.w / 2 / dist(wallById(o.wall).a, wallById(o.wall).b);
      return half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, t));
    }

    /* Mueve a la vez todos los extremos que coinciden con cada punto "from": las esquinas siguen unidas.
       Las paredes apoyadas en T sobre una pared que se mueve conservan su posición a lo largo de ella. */
    function movePoints(pairs) {
      const moving = (p) => pairs.some((m) => same(p, m.from));
      const moved = plan.walls.filter((w) => moving(w.a) || moving(w.b));
      const attached = [];
      moved.forEach(function (w) {
        plan.walls.forEach(function (other) {
          if (other === w) return;
          ["a", "b"].forEach(function (end) {
            if (moving(other[end])) return;
            const h = project(w, other[end]);
            if (h.raw > 0 && h.raw < 1 && h.d < 0.5) attached.push({ wall: other, end: end, on: w, t: h.raw });
          });
        });
      });
      plan.walls.forEach(function (w) {
        ["a", "b"].forEach(function (end) {
          const pair = pairs.find((m) => same(w[end], m.from));
          if (pair) w[end] = copy(pair.to);
        });
      });
      attached.forEach(function (link) {
        const p = along(link.on, link.t);
        link.wall[link.end] = { x: n2(p.x), y: n2(p.y) };
      });
    }

    // ---------- Dibujo ----------
    const openingSVG = (o, k, cls) => P.openingSVG(wallById(o.wall), o, model.wallThick[o.wall] || 12, k, cls);

    function rulersSVG(k) {
      const band = 18 * k, step = STEPS.find((s) => s / k >= 56) || STEPS[STEPS.length - 1], font = ' font-size="' + n1(9 * k) + '"';
      let html = '<rect class="ruler" x="' + n1(view.x) + '" y="' + n1(view.y) + '" width="' + n1(view.w) + '" height="' + n1(band) + '"/>' +
        '<rect class="ruler" x="' + n1(view.x) + '" y="' + n1(view.y) + '" width="' + n1(band) + '" height="' + n1(view.h) + '"/>';
      for (let x = Math.ceil((view.x + band) / step) * step; x < view.x + view.w; x += step) {
        html += P.lineSVG({ x: x, y: view.y + band * 0.5 }, { x: x, y: view.y + band }, "ruler-tick", k) +
          '<text class="ruler-text"' + font + ' x="' + n1(x + 3 * k) + '" y="' + n1(view.y + band * 0.42) + '">' + E.fmt((x || 0) / 100, 1) + "</text>";
      }
      for (let y = Math.ceil((view.y + band) / step) * step; y < view.y + view.h; y += step) {
        const tx = n1(view.x + band * 0.42), ty = n1(y - 3 * k);
        html += P.lineSVG({ x: view.x + band * 0.5, y: y }, { x: view.x + band, y: y }, "ruler-tick", k) +
          '<text class="ruler-text"' + font + ' x="' + tx + '" y="' + ty + '" transform="rotate(-90 ' + tx + " " + ty + ')">' + E.fmt((y || 0) / 100, 1) + "</text>";
      }
      return html + '<rect class="ruler" x="' + n1(view.x) + '" y="' + n1(view.y) + '" width="' + n1(band) + '" height="' + n1(band) + '"/>';
    }

    // Giro de una imagen alrededor de su centro (la foto de un boceto torcido se muestra ya enderezada).
    const turn = (deg, cx, cy) => deg ? ' transform="rotate(' + deg + " " + n1(cx) + " " + n1(cy) + ')"' : "";

    function render() {
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) view.h = view.w * r.height / r.width;
      svg.setAttribute("viewBox", [view.x, view.y, view.w, view.h].map(n1).join(" "));
      model = P.compute(plan);
      const k = px(), font = 12 * k, show = layers();
      const label = (x, y, cls, s) => '<text class="' + cls + '" x="' + n1(x) + '" y="' + n1(y) + '" font-size="' + n1(font) + '">' + escHTML(s) + "</text>";
      const dash = ' stroke-dasharray="' + n1(8 * k) + " " + n1(6 * k) + '"';
      const active = sel && sel.type === "room" ? roomAt(sel) : null, picked = pickedWalls();

      let html = "";
      if (plan.ref && plan.ref.src) {
        html += '<image href="' + plan.ref.src + '" x="' + n1(plan.ref.x) + '" y="' + n1(plan.ref.y) + '" width="' + n1(plan.ref.w) + '" height="' + n1(plan.ref.w * plan.ref.ratio) +
          '" opacity="' + plan.ref.opacity + '" preserveAspectRatio="none"' + turn(plan.ref.rot, plan.ref.x + plan.ref.w / 2, plan.ref.y + plan.ref.w * plan.ref.ratio / 2) + "/>";
      }
      if (sketch) {
        const k2 = sketchScale(), corner = sketchPoint(0, 0);
        html += '<image href="' + sketch.src + '" x="' + n1(corner.x) + '" y="' + n1(corner.y) + '" width="' + n1(sketch.w * k2) + '" height="' + n1(sketch.h * k2) + '" opacity="0.5" preserveAspectRatio="none"' + turn(sketch.angle, corner.x + sketch.w * k2 / 2, corner.y + sketch.h * k2 / 2) + "/>";
      }
      if (show.grid) {
        html += '<defs><pattern id="plan-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path class="grid-line" d="M100 0H0V100" stroke-width="' +
          n1(k) + '"/></pattern></defs><rect x="' + n1(view.x) + '" y="' + n1(view.y) + '" width="' + n1(view.w) + '" height="' + n1(view.h) + '" fill="url(#plan-grid)"/>';
      }
      plan.surfaces.forEach(function (sf) {
        html += '<rect class="surface' + (sel && sel.type === "surface" && sel.id === sf.id ? " sel" : "") + '" x="' + sf.x + '" y="' + sf.y + '" width="' + sf.w + '" height="' + sf.h + '" stroke-width="' + n1(k) + '"/>';
        if (show.names) html += label(sf.x + sf.w / 2, sf.y + sf.h / 2 - font * 0.65, "room-label", (D.surfaces[sf.type] || D.surfaces.patio).label);
        if (show.areas) html += label(sf.x + sf.w / 2, sf.y + sf.h / 2 + font * 0.7, "room-area", E.fmt(sf.w * sf.h / 1e4, 1) + " m²");
      });
      model.rooms.forEach(function (room) {
        html += '<polygon class="room' + (room === active ? " sel" : "") + '"' + P.roomFill(room, room === active) + ' points="' + room.points.map((p) => n1(p.x) + "," + n1(p.y)).join(" ") + '"/>';
      });
      // La guía de la planta de abajo va sobre el relleno de los ambientes y debajo de los muros propios.
      if (show.below) model.under.forEach(function (e) { html += P.lineSVG(e.a, e.b, "wall under", e.thick); });
      model.edges.forEach(function (e) {
        html += P.lineSVG(e.a, e.b, "wall " + e.cls + (picked.indexOf(e.wall) >= 0 ? " sel" : ""), e.thick);
      });
      plan.openings.forEach(function (o) {
        html += openingSVG(o, k, sel && sel.type === "opening" && sel.id === o.id ? " sel" : "");
      });
      plan.items.forEach(function (it) {
        if (show[itemLayer(it)]) html += P.itemSVG(it, k, sel && sel.type === "item" && sel.id === it.id ? " sel" : "");
      });
      if (show.electric) {
        plan.wires.forEach(function (w) { // cable: arco suave entre las dos bocas
          const a = itemById(w.a), b = itemById(w.b), bend = 0.18;
          html += '<path class="wire" stroke-width="' + n1(1.5 * k) + '" d="M' + n1(a.x) + " " + n1(a.y) + "Q" + n1((a.x + b.x) / 2 - (b.y - a.y) * bend) + " " +
            n1((a.y + b.y) / 2 + (b.x - a.x) * bend) + " " + n1(b.x) + " " + n1(b.y) + '"/>';
        });
      }
      if (ghost) html += '<g class="ghost">' + (ghost.wall ? openingSVG(ghost, k, " sel") : P.itemSVG(ghost, k, " sel")) + "</g>";

      model.rooms.forEach(function (room) {
        const both = show.names && show.areas;
        if (show.names) html += label(room.cx, room.cy - (both ? font * 0.65 : 0), "room-label", room.name);
        if (show.areas) html += label(room.cx, room.cy + (both ? font * 0.7 : 0), "room-area", E.fmt(room.area, 1) + " m²");
      });
      if (show.dims) {
        plan.walls.forEach(function (w) {
          const len = dist(w.a, w.b);
          if (len / k < 46) return;
          const offset = (model.wallThick[w.id] || 12) / 2 + 11 * k;
          html += label((w.a.x + w.b.x) / 2 + (w.b.y - w.a.y) / len * offset, (w.a.y + w.b.y) / 2 - (w.b.x - w.a.x) / len * offset, "dim", E.fmt(len / 100, 2));
        });
      }

      if (show.notes) {
        const chosen = sel && sel.type === "note" && noteById(sel.id);
        plan.notes.forEach(function (nt) { html += (nt === chosen ? P.noteSVG(nt, k, true) : "") + P.noteSVG(nt, k, false); });
        if (chosen && chosen.kind !== "pen" && chosen.kind !== "text") { // los dos puntos que la definen se pueden arrastrar
          chosen.pts.forEach(function (p) { html += '<circle class="handle" cx="' + n1(p.x) + '" cy="' + n1(p.y) + '" r="' + n1(6 * k) + '" stroke-width="' + n1(2 * k) + '"/>'; });
        }
      }
      if (drag && drag.type === "draw") html += P.noteSVG(drag.note, k, false);
      if (sel && sel.type === "wall" && wallById(sel.id)) {
        [wallById(sel.id).a, wallById(sel.id).b].forEach(function (p) {
          html += '<circle class="handle" cx="' + n1(p.x) + '" cy="' + n1(p.y) + '" r="' + n1(6 * k) + '" stroke-width="' + n1(2 * k) + '"/>';
        });
      }
      if ((tool === "wall" || tool === "room") && hover) {
        if (chain && tool === "wall") {
          html += P.lineSVG(chain, hover, "preview", 3 * k, dash);
          html += label(hover.x + 10 * k, hover.y - 10 * k, "dim preview-label", (typed || E.fmt(dist(chain, hover) / 100, 2)) + " m");
        }
        if (chain && tool === "room") {
          html += '<rect class="preview" fill="none" stroke-width="' + n1(3 * k) + '"' + dash + ' x="' + Math.min(chain.x, hover.x) + '" y="' + Math.min(chain.y, hover.y) +
            '" width="' + Math.abs(hover.x - chain.x) + '" height="' + Math.abs(hover.y - chain.y) + '"/>';
          html += label(hover.x + 10 * k, hover.y - 10 * k, "dim preview-label",
            E.fmt(Math.abs(hover.x - chain.x) / 100, 2) + " × " + E.fmt(Math.abs(hover.y - chain.y) / 100, 2) + " m");
        }
        html += '<circle class="cursor" cx="' + n1(hover.x) + '" cy="' + n1(hover.y) + '" r="' + n1(4 * k) + '"/>';
      }
      if (sketch) {
        sketch.segments.forEach(function (s) { html += P.lineSVG(sketchPoint(s.x1, s.y1), sketchPoint(s.x2, s.y2), "sketch-wall", 5 * k); });
        sketch.openings.forEach(function (o) { // vista previa de lo detectado: hueco, y además hoja y arco en las puertas
          const half = o.w / 2, a = o.horizontal ? sketchPoint(o.x - half, o.y) : sketchPoint(o.x, o.y - half), b = o.horizontal ? sketchPoint(o.x + half, o.y) : sketchPoint(o.x, o.y + half);
          html += P.lineSVG(a, b, o.kind === "window" ? "sketch-window" : "gap", 7 * k);
          if (o.kind !== "door") return;
          const hinge = sketchPoint(o.hx, o.hy), tip = sketchPoint(o.tx, o.ty), far = dist(a, hinge) < dist(b, hinge) ? b : a, r = dist(hinge, tip);
          const cross = (tip.x - hinge.x) * (far.y - hinge.y) - (tip.y - hinge.y) * (far.x - hinge.x);
          html += '<path class="sketch-door" stroke-width="' + n1(2 * k) + '" d="M' + n1(hinge.x) + " " + n1(hinge.y) + "L" + n1(tip.x) + " " + n1(tip.y) + "A" + n1(r) + " " + n1(r) +
            " 0 0 " + (cross > 0 ? 1 : 0) + " " + n1(far.x) + " " + n1(far.y) + '"/>';
        });
      }
      const roofShape = show.roof && P.roofShape(plan);
      if (roofShape) { // contorno del alero y cumbrera
        html += '<rect class="roof-outline" x="' + roofShape.x0 + '" y="' + roofShape.y0 + '" width="' + (roofShape.x1 - roofShape.x0) + '" height="' + (roofShape.y1 - roofShape.y0) + '" stroke-width="' + n1(1.5 * k) + '"' + dash + "/>";
        if (roofShape.type === "tejas") {
          const xm = (roofShape.x0 + roofShape.x1) / 2, ym = (roofShape.y0 + roofShape.y1) / 2;
          html += roofShape.alongX ? P.lineSVG({ x: roofShape.x0, y: ym }, { x: roofShape.x1, y: ym }, "roof-outline", 1.5 * k) : P.lineSVG({ x: xm, y: roofShape.y0 }, { x: xm, y: roofShape.y1 }, "roof-outline", 1.5 * k);
        }
      }
      if (plan.section) {
        html += P.lineSVG(plan.section.a, plan.section.b, "section-line", 2 * k, ' stroke-dasharray="' + n1(14 * k) + " " + n1(5 * k) + " " + n1(3 * k) + " " + n1(5 * k) + '"') +
          label(plan.section.a.x, plan.section.a.y - 14 * k, "section-tag", "A") + label(plan.section.b.x, plan.section.b.y - 14 * k, "section-tag", "A");
      }
      if (hover && chain && tool === "surface") {
        html += '<rect class="preview" stroke-width="' + n1(3 * k) + '"' + dash + ' x="' + Math.min(chain.x, hover.x) + '" y="' + Math.min(chain.y, hover.y) +
          '" width="' + Math.abs(hover.x - chain.x) + '" height="' + Math.abs(hover.y - chain.y) + '"/>';
      }
      if (hover && chain && tool === "section") html += P.lineSVG(chain, hover, "preview", 2 * k, dash);
      if (hover && chain && tool === "arc") {
        const pts = arcEnd ? P.arcPoints(chain, arcEnd, hover) || [chain, arcEnd] : [chain, hover];
        html += '<polyline class="preview" stroke-width="' + n1(3 * k) + '"' + dash + ' points="' + pts.map((q) => n1(q.x) + "," + n1(q.y)).join(" ") + '"/>';
      }
      if (hover && wireFrom && tool === "wire" && itemById(wireFrom)) html += P.lineSVG(itemById(wireFrom), hover, "preview", 2 * k, dash);
      if (drag && drag.type === "box") { // recuadro de selección
        html += '<rect class="select-box" stroke-width="' + n1(k) + '" x="' + n1(Math.min(drag.start.x, drag.cur.x)) + '" y="' + n1(Math.min(drag.start.y, drag.cur.y)) +
          '" width="' + n1(Math.abs(drag.cur.x - drag.start.x)) + '" height="' + n1(Math.abs(drag.cur.y - drag.start.y)) + '"/>';
      }
      if (measure) {
        const end = measure.b || hover;
        html += '<circle class="cursor" cx="' + n1(measure.a.x) + '" cy="' + n1(measure.a.y) + '" r="' + n1(4 * k) + '"/>';
        if (end) {
          html += P.lineSVG(measure.a, end, "preview", 2 * k, dash) + '<circle class="cursor" cx="' + n1(end.x) + '" cy="' + n1(end.y) + '" r="' + n1(4 * k) + '"/>' +
            label((measure.a.x + end.x) / 2, (measure.a.y + end.y) / 2 - 12 * k, "dim measure-label", E.fmt(dist(measure.a, end) / 100, 2) + " m");
        }
      }
      svg.innerHTML = html + (presenting ? "" : rulersSVG(k));

      const bar = STEPS.find((s) => s / k >= 70) || STEPS[STEPS.length - 1];
      scaleBar.style.width = Math.round(bar / k) + "px";
      scaleBar.textContent = E.fmt(bar / 100, 1) + " m";
      zoomOut.textContent = Math.round(100 / k) + "%";
      emptyBox.hidden = plan.walls.length > 0 || !!chain || !!sketch;
      // Planta vacía pero con otra dibujada: se avisa, porque el cómputo sigue sumando la otra.
      const drawn = P.levelsOf(plan).filter((level, i) => i !== model.level && level.walls.length).map((level) => level.name.toLowerCase());
      emptyNote.hidden = !drawn.length;
      emptyNote.textContent = drawn.length ? "Esta planta está vacía, pero el plano tiene dibujada la " + drawn.join(" y la ") + ". Cambiá de planta con el selector de arriba; el cómputo suma todas." : "";
      const cutSVG = P.sectionSVG(plan);
      sectionBox.hidden = !plan.section;
      sectionOut.innerHTML = cutSVG || '<p class="ws-tip">La línea de corte no atraviesa ningún muro de la vivienda.</p>';
      renderResult();
    }

    function renderResult() {
      const stat = (m) => '<div class="stat"><span class="stat-label">' + escHTML(m.label) + '</span><span class="stat-value">' +
        escHTML(m.value) + '</span><span class="stat-unit">' + escHTML(m.unit) + "</span></div>";
      const row = (r) => "<div><dt>" + escHTML(r.label) + "</dt><dd>" + escHTML(r.value) + "</dd></div>";
      const lines = [(plan.name || UNTITLED) + " — cómputo de materiales"];
      model.main.forEach(function (m) { lines.push("• " + m.label + ": " + m.value + " " + m.unit); });
      model.sections.forEach(function (s) {
        lines.push("", s.title.toUpperCase());
        s.rows.forEach(function (r) { lines.push("• " + r.label + ": " + r.value); });
      });
      if (model.checks.length) {
        lines.push("", "VERIFICACIÓN CIRSOC");
        model.checks.forEach(function (c) { lines.push((c.state === "ok" ? "✓ " : c.state === "fail" ? "✗ " : "· ") + c.text + " [" + c.ref + "]"); });
      }
      lines.push("", "Calculado con " + (brand.name || "") + " — " + location.href);
      text = lines.join("\n");

      const failed = model.checks.filter((c) => c.state === "fail").length;
      checksCount.textContent = !model.checks.length ? "" : failed ? failed + (failed === 1 ? " observación" : " observaciones") : "sin observaciones";
      checksCount.className = failed ? "is-fail" : "is-ok";
      checksOut.innerHTML = model.checks.length ? '<ul class="checks">' + model.checks.map(function (c) {
        return '<li class="check is-' + c.state + '"><span class="check-mark" aria-hidden="true">' + (c.state === "ok" ? "✓" : c.state === "fail" ? "✗" : "i") + '</span><span><span class="check-state">' +
          (c.state === "ok" ? "Cumple: " : c.state === "fail" ? "No cumple: " : "Nota: ") + "</span>" + escHTML(c.text) + ' <small class="check-ref">' + escHTML(c.ref) + "</small></span></li>";
      }).join("") + '</ul><p class="ws-tip">Verificación automática de apoyo sobre el texto de los reglamentos publicados por el INTI. No reemplaza el proyecto ni la firma de un profesional matriculado.</p>'
        : '<p class="ws-tip">Dibujá los muros para verificarlos contra los reglamentos CIRSOC.</p>';

      out.innerHTML = '<div class="result-main">' + model.main.map(stat).join("") + "</div>" +
        model.sections.map(function (s) {
          return '<h3 class="result-section">' + escHTML(s.title) + '</h3><dl class="result-rows">' + s.rows.map(row).join("") + "</dl>";
        }).join("") +
        '<ul class="result-notes">' + model.notes.map((n) => "<li>" + escHTML(n) + "</li>").join("") + "</ul>" +
        '<div class="result-actions"><button type="button" class="btn" data-copy>Copiar cómputo</button>' +
        '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '">Enviar por WhatsApp</a></div>';
    }

    function renderInspector() {
      const item = selected();
      const field = (name, labelText, value) => "<label>" + labelText + ' <input name="' + name + '" type="text" inputmode="decimal" autocomplete="off" value="' +
        E.fmt(value, 2) + '"> m</label>';
      const button = (action, labelText) => '<button type="button" class="btn btn-ghost" data-action="' + action + '">' + labelText + "</button>";
      const brickOptions = (current) => Object.keys(D.bricks).map((key) => '<option value="' + key + '"' + (key === current ? " selected" : "") + ">" +
        escHTML(D.bricks[key].label) + "</option>").join("");
      const swatches = (current, first) => '<span class="swatches" role="group" aria-label="Color">' + [""].concat(P.PALETTE).map((c) => '<button type="button" class="swatch" data-swatch="' + c +
        '" aria-pressed="' + ((current || "") === c) + '" title="' + (c ? COLOR_NAMES[c] : first) + '" aria-label="' + (c ? COLOR_NAMES[c] : first) + '"' + (c ? ' style="--sw:' + c + '"' : "") + "></button>").join("") + "</span>";
      const weight = (name, current, isText) => "<label>" + (isText ? "Tamaño" : "Grosor") + ' <select name="' + name + '">' + [["s", isText ? "Chico" : "Fino"], ["m", "Medio"], ["l", isText ? "Grande" : "Grueso"]]
        .map((o) => '<option value="' + o[0] + '"' + ((current || "m") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
      const drawing = tool === "wall" || tool === "room" || tool === "arc", annotating = !!NOTES[tool];
      inspector.hidden = !item && !drawing && !annotating;
      if (!item && annotating) { // anotando: color y grosor de lo que se dibuje a continuación
        inspector.innerHTML = "<strong>" + escHTML(NOTES[tool]) + "</strong>" + swatches(nextNote.color, "Tinta") + weight("nextW", nextNote.w, tool === "text");
        return;
      }
      if (!item) { // dibujando: se elige el ladrillo de los muros que vienen
        if (drawing) {
          inspector.innerHTML = '<strong>Muros nuevos</strong><label>Ladrillo <select name="nextType"><option value="">Por defecto, según quede exterior o interior</option>' + brickOptions(nextType) +
            "</select></label><span>" + (nextType ? E.fmt(D.bricks[nextType].e, 1) + " cm de espesor" : "se define en Ajustes de obra") + "</span>";
        }
        return;
      }
      if (sel.type === "note") {
        inspector.innerHTML = "<strong>" + escHTML(NOTES[item.kind]) + "</strong>" +
          (item.kind === "text" ? '<label>Texto <input name="text" type="text" autocomplete="off" maxlength="120" value="' + escHTML(item.text) + '"></label>' : "") +
          swatches(item.color, "Tinta") + weight("w", item.w, item.kind === "text") + button("duplicate", "Duplicar") + button("delete", "Borrar");
        return;
      }
      if (sel.type === "walls") {
        const types = Object.keys(item.reduce((set, w) => { set[w.type || ""] = true; return set; }, {})), mixed = types.length > 1;
        inspector.innerHTML = "<strong>" + item.length + " muros</strong>" + '<label>Ladrillo <select name="type">' + (mixed ? '<option value="mixed" selected disabled>Varios</option>' : "") +
          '<option value=""' + (!mixed && types[0] === "" ? " selected" : "") + ">Por defecto</option>" + brickOptions(mixed ? null : types[0]) + "</select></label><span>" +
          E.fmt(item.reduce((sum, w) => sum + dist(w.a, w.b), 0) / 100, 2) + " m en total</span>" + button("delete", "Borrar");
        return;
      }
      if (sel.type === "wall") {
        // Clase (exterior o interior) detectada sola, y ladrillo que le tocaría por defecto.
        const edge = model.edges.find((e) => e.wall === item.id) || { cls: "ext" }, outside = edge.cls !== "int";
        const usual = D.bricks[(plan.settings || {})[edge.cls]] || D.bricks[P.DEFAULTS[edge.cls]], brick = D.bricks[item.type] || usual;
        inspector.innerHTML = "<strong>" + (outside ? "Muro exterior" : "Muro interior") + "</strong>" + field("length", "Largo", dist(item.a, item.b) / 100) +
          '<label>Ladrillo <select name="type"><option value="">Por defecto: ' + escHTML(usual.label) + "</option>" + Object.keys(D.bricks).map((key) => '<option value="' + key + '"' +
            (key === item.type ? " selected" : "") + ">" + escHTML(D.bricks[key].label) + "</option>").join("") + "</select></label><span>" + E.fmt(brick.e, 1) + " cm de espesor</span>" +
          button("split", "Dividir en dos") + button("delete", "Borrar");
      } else if (sel.type === "opening") {
        const def = P.typeOf(item);
        inspector.innerHTML = "<strong>" + escHTML(def.label) + "</strong>" + field("w", "Ancho", item.w / 100) + field("h", "Alto", item.h / 100) +
          (/swing|double|garage/.test(def.symbol) ? button("flip-side", "Cambiar lado") : "") +
          (def.symbol === "swing" ? button("flip-hinge", "Cambiar bisagra") : "") + button("duplicate", "Duplicar") + button("delete", "Borrar");
      } else if (sel.type === "surface") {
        inspector.innerHTML = '<strong>Exterior</strong><label>Tipo <select name="type">' + Object.keys(D.surfaces).map((key) => '<option value="' + key + '"' + (key === item.type ? " selected" : "") + ">" +
          escHTML(D.surfaces[key].label) + "</option>").join("") + "</select></label>" + field("w", "Ancho", item.w / 100) + field("h", "Largo", item.h / 100) + button("delete", "Borrar");
      } else if (sel.type === "item") {
        inspector.innerHTML = "<strong>" + escHTML(D.items[item.type].label) + "</strong>" + field("w", "Ancho", item.w / 100) + field("d", "Fondo", item.d / 100) +
          '<label>Giro <input name="r" type="text" inputmode="numeric" autocomplete="off" value="' + (item.r || 0) + '"> °</label>' +
          button("rotate", "Girar 90°") + button("duplicate", "Duplicar") + (hasWires(item.id) ? button("unwire", "Quitar cables") : "") + button("delete", "Borrar");
      } else {
        inspector.innerHTML = "<strong>Ambiente</strong><label>Nombre " + '<input name="name" type="text" list="room-types" autocomplete="off" value="' +
          escHTML(item.name) + '"></label><datalist id="room-types">' + D.roomTypes.map((n) => '<option value="' + escHTML(n) + '">').join("") +
          '</datalist><label>Piso <select name="floor">' + Object.keys(D.floors).map((key) => '<option value="' + key + '"' + (key === item.floor ? " selected" : "") + ">" +
            escHTML(D.floors[key].label) + "</option>").join("") + "</select></label>" + swatches(item.color, "Sin color") + "<span>" + E.fmt(item.area, 1) + " m²</span>";
      }
    }

    function setTool(name, type) {
      tool = name; pick = type || null; chain = null; hover = null; ghost = null; typed = ""; measure = null; arcEnd = null; wireFrom = null;
      if (name !== "select" && name !== "pan") { sel = null; multi = false; } // al empezar a dibujar se suelta la selección
      $$("[data-tool]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === name)));
      $('[data-action="multi"]', root).setAttribute("aria-pressed", String(multi));
      $$("[data-pick]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-pick") === pick)));
      $$("[data-pick-item]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-pick-item") === pick)));
      hint.textContent = HINTS[name === "select" && multi ? "multi" : name];
      svg.setAttribute("data-tool", NOTES[name] ? "note" : name);
      if (NOTES[name] && !layers().notes) { plan.layers = Object.assign(layers(), { notes: true }); save(); syncSettings(); } // no se anota sobre una capa oculta
      render();
      renderInspector();
    }

    // ---------- Acciones ----------
    function removeSelection() {
      if (!sel || sel.type === "room") return;
      pushHistory();
      if (sel.type === "wall" || sel.type === "walls") { const gone = pickedWalls(); plan.walls = plan.walls.filter((w) => gone.indexOf(w.id) < 0); }
      else if (sel.type === "item") plan.items = plan.items.filter((it) => it.id !== sel.id);
      else if (sel.type === "surface") plan.surfaces = plan.surfaces.filter((sf) => sf.id !== sel.id);
      else if (sel.type === "note") plan.notes = plan.notes.filter((nt) => nt.id !== sel.id);
      else plan.openings = plan.openings.filter((o) => o.id !== sel.id);
      commit(null);
    }
    // No agrega una pared que ya está dibujada encima de otra (pasa al dibujar ambientes pegados).
    function addWalls(list) {
      const onWall = (w, p) => { const h = project(w, p); return h.d < 0.5 && h.raw > -1e-6 && h.raw < 1 + 1e-6; };
      const fresh = list.filter((s) => dist(s[0], s[1]) >= GRID && !plan.walls.some((w) => onWall(w, s[0]) && onWall(w, s[1])));
      if (!fresh.length) return;
      pushHistory();
      fresh.forEach(function (s) { plan.walls.push(Object.assign({ id: nextId(), a: copy(s[0]), b: copy(s[1]) }, nextType ? { type: nextType } : {})); });
    }
    function addWallPoint(p) {
      typed = "";
      if (!chain) { chain = p; render(); return; }
      if (dist(chain, p) < GRID) return;
      const closes = plan.walls.some((w) => same(w.a, p) || same(w.b, p));
      addWalls([[chain, p]]);
      chain = closes ? null : p; // al llegar a otra pared la cadena se corta sola
      commit(null);
    }
    function addRoomPoint(p) {
      if (!chain) { chain = p; render(); return; }
      if (Math.abs(p.x - chain.x) < GRID || Math.abs(p.y - chain.y) < GRID) return;
      const a = chain, b = { x: p.x, y: a.y }, c = p, d = { x: a.x, y: p.y };
      addWalls([[a, b], [b, c], [c, d], [d, a]]);
      chain = null;
      commit(null);
    }
    function addOpening(hit, type) {
      pushHistory();
      const o = P.opening(nextId(), hit.wall.id, hit.t, type);
      o.t = clampT(o, o.t);
      plan.openings.push(o);
      ghost = null;
      commit({ type: "opening", id: o.id });
    }
    function changeOpening(change) {
      const o = openingById(sel.id);
      pushHistory();
      change(o);
      commit(sel);
    }
    const center = () => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 });
    // Nombre, piso o color de un ambiente: se guardan en una etiqueta ubicada dentro de él.
    function tagRoom(field, value) {
      const room = roomAt(sel), old = (plan.labels || []).find((l) => P.inside(room.points, l)) || {};
      const tag = { x: sel.x, y: sel.y, name: old.name || "", floor: old.floor, color: old.color };
      tag[field] = value;
      pushHistory();
      plan.labels = (plan.labels || []).filter((l) => !P.inside(room.points, l));
      plan.labels.push(tag);
      commit(sel);
    }
    // Un toque en la paleta: pinta la anotación o el ambiente elegido, o fija el color de las anotaciones que vienen.
    function setColor(color) {
      if (sel && sel.type === "note") { pushHistory(); noteById(sel.id).color = color; commit(sel); }
      else if (sel && sel.type === "room") tagRoom("color", color);
      else { nextNote.color = color; renderInspector(); }
    }

    // ---------- Opciones de diseño: selector y tabla que las compara ----------
    function renderVariants() {
      const list = plan.variants || [], many = list.length > 1, current = Math.min(plan.variant || 0, Math.max(0, list.length - 1));
      $$("[data-variant]", root).forEach(function (el) {
        el.hidden = !many;
        el.innerHTML = list.map((v, i) => '<option value="' + i + '"' + (i === current ? " selected" : "") + ">Opción " + OPTIONS[i] + "</option>").join("");
      });
      compareBox.hidden = !many;
      if (!many) return;
      const cols = list.map(function (v, i) {
        if (i === current) return model.main;
        const lv = v.levels[Math.min(v.level || 0, v.levels.length - 1)], other = Object.assign({}, plan, { levels: v.levels, level: v.level || 0, section: v.section });
        P.LEVEL_FIELDS.forEach(function (f) { other[f] = lv[f] || []; });
        return P.compute(other).main;
      });
      compareOut.innerHTML = '<table class="compare"><thead><tr><th></th>' + list.map((v, i) => "<th" + (i === current ? ' class="is-on"' : "") + ">" + OPTIONS[i] + "</th>").join("") + "</tr></thead><tbody>" +
        cols[0].map(function (m, r) {
          return "<tr><th>" + escHTML(m.label) + " <small>" + escHTML(m.unit) + "</small></th>" + cols.map((c, i) => "<td" + (i === current ? ' class="is-on"' : "") + ">" + escHTML(c[r].value) + "</td>").join("") + "</tr>";
        }).join("") + "</tbody></table>";
    }

    // ---------- Modo presentación ----------
    function present(on) {
      presenting = on;
      root.classList.toggle("is-presenting", on);
      document.documentElement.classList.toggle("is-presenting", on);
      try {
        if (on && root.requestFullscreen) root.requestFullscreen().catch(function () { /* sin pantalla completa: igual ocupa toda la ventana */ });
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      } catch (e) { /* navegador sin pantalla completa */ }
      setTool(on ? "pan" : "select");
      setTimeout(function () { fit(); render(); }, 120); // el lienzo ya tomó su tamaño nuevo
    }
    document.addEventListener("fullscreenchange", function () { if (presenting && !document.fullscreenElement) present(false); });

    // ---------- Archivos: exportar, abrir e imagen de referencia ----------
    function download(name, blob) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 4000);
    }
    const fileName = (ext) => ((plan.name || "plano").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, "-").replace(/^-|-$/g, "") || "plano") + "." + ext;
    function exportDrawing(asImage) {
      if (!plan.walls.length) { hint.textContent = "Todavía no hay nada dibujado para exportar."; return; }
      const drawing = P.staticSVG(plan, true);
      if (!asImage) { download(fileName("svg"), new Blob([drawing.svg], { type: "image/svg+xml" })); return; }
      const image = new Image();
      image.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = drawing.width; canvas.height = drawing.height;
        canvas.getContext("2d").drawImage(image, 0, 0, drawing.width, drawing.height);
        canvas.toBlob(function (blob) { download(fileName("png"), blob); }, "image/png");
      };
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(drawing.svg);
    }
    function openPlanFile(file) {
      const reader = new FileReader();
      reader.onload = function () {
        let opened = null;
        try { opened = normalize(JSON.parse(reader.result)); } catch (e) { /* no es JSON */ }
        if (!opened) { hint.textContent = "Ese archivo no es un plano de " + (brand.name || "este sitio") + "."; return; }
        pushHistory();
        plan = opened; chain = null;
        fit(); commit(null); syncSettings(); setTool("select");
      };
      reader.readAsText(file);
    }
    function openRefImage(file) {
      const reader = new FileReader();
      reader.onload = function () {
        const image = new Image();
        image.onload = function () {
          const w = Math.round(view.w * 0.7);
          plan.ref = { src: reader.result, ratio: image.naturalHeight / image.naturalWidth, w: w, x: Math.round(view.x + view.w * 0.15), y: Math.round(view.y + view.h * 0.12), opacity: 0.5 };
          save(); syncSettings(); render();
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
    const actions = {
      undo: function () { restore(history, future); },
      redo: function () { restore(future, history); },
      delete: removeSelection,
      "flip-side": function () { changeOpening(function (o) { o.side = !o.side; }); },
      "flip-hinge": function () { changeOpening(function (o) { o.hinge = !o.hinge; }); },
      rotate: function () {
        pushHistory();
        const it = itemById(sel.id);
        it.r = ((it.r || 0) + 90) % 360;
        commit(sel);
      },
      snap: function () { plan.snap = plan.snap === false; save(); syncSettings(); },
      multi: function () { multi = !multi; setTool("select"); },
      // Parte el muro por la mitad, para poder darle a cada tramo un ladrillo distinto. Las aberturas quedan en su lugar.
      split: function () {
        const w = wallById(sel.id), len = dist(w.a, w.b), mid = { x: Math.round((w.a.x + w.b.x) / 2), y: Math.round((w.a.y + w.b.y) / 2) };
        if (len < 4 * GRID) return;
        pushHistory();
        const rest = Object.assign({}, w, { id: nextId(), a: copy(mid), b: copy(w.b) });
        const first = dist(w.a, mid);
        plan.openings.forEach(function (o) {
          if (o.wall !== w.id) return;
          const pos = o.t * len;
          if (pos > first) { o.wall = rest.id; o.t = (pos - first) / (len - first); } else o.t = pos / first;
        });
        w.b = copy(mid);
        plan.walls.push(rest);
        plan.openings.forEach(function (o) { if (o.wall === w.id || o.wall === rest.id) o.t = clampT(o, o.t); });
        commit({ type: "walls", ids: [w.id, rest.id] });
      },
      unwire: function () { pushHistory(); plan.wires = plan.wires.filter((w) => w.a !== sel.id && w.b !== sel.id); commit(sel); },
      "section-clear": function () { pushHistory(); plan.section = null; commit(sel); },
      "level-add": function () {
        const count = (plan.levels || []).length || 1;
        if (count >= P.LEVEL_NAMES.length) { hint.textContent = "Se pueden cargar hasta " + P.LEVEL_NAMES.length + " plantas."; return; }
        pushHistory();
        stashLevel();
        // La planta nueva arranca con los muros exteriores de la última: lo habitual es apoyar muro sobre muro.
        const top = plan.levels[count - 1];
        const edges = P.compute(Object.assign({}, plan, { level: count - 1, walls: top.walls, openings: top.openings, items: top.items, labels: top.labels })).edges;
        const inner = {}, outer = {};
        edges.forEach(function (e) { (e.cls === "ext" ? outer : inner)[e.wall] = true; });
        plan.levels.push({
          name: P.LEVEL_NAMES[count], openings: [], items: [], labels: [],
          walls: top.walls.filter((w) => outer[w.id] && !inner[w.id]).map((w) => Object.assign({ id: nextId(), a: copy(w.a), b: copy(w.b) }, w.type ? { type: w.type } : {}))
        });
        showLevel(count);
      },
      "level-remove": function () {
        if (!plan.levels || plan.levels.length < 2) { hint.textContent = "El plano tiene una sola planta."; return; }
        pushHistory();
        stashLevel();
        plan.levels.splice(plan.level, 1);
        plan.levels.forEach(function (level, i) { level.name = P.LEVEL_NAMES[i]; });
        showLevel(Math.min(plan.level, plan.levels.length - 1));
      },
      "export-svg": function () { exportDrawing(false); },
      "export-png": function () { exportDrawing(true); },
      "export-dxf": function () {
        if (!P.levelsOf(plan).some((lv) => lv.walls.length)) { hint.textContent = "Todavía no hay nada dibujado para exportar."; return; }
        download(fileName("dxf"), new Blob([brand.dxf.build(plan)], { type: "application/dxf" }));
        hint.textContent = "DXF descargado: está en metros, con una capa por rubro (" + brand.dxf.layers.join(", ").toLowerCase() + ").";
      },
      "export-json": function () { download(fileName("json"), new Blob([JSON.stringify(Object.assign({ app: "calcuobra", version: 1 }, JSON.parse(snapshot())), null, 1)], { type: "application/json" })); },
      "open-file": function () { $('[data-file="plan"]', root).click(); },
      "ref-load": function () { $('[data-file="ref"]', root).click(); },
      "sketch-load": function () { $('[data-file="sketch"]', root).click(); },
      "sketch-cancel": function () { sketch = null; syncSketch(); fit(); render(); },
      "sketch-apply": function () {
        const k2 = sketchScale(), corner = sketchPoint(0, 0), before = plan.walls.length, steps = history.length;
        // Los dos extremos se redondean a la grilla; como las esquinas comparten coordenada, siguen cerradas.
        addWalls(sketch.segments.map(function (s) {
          const a = sketchPoint(s.x1, s.y1), b = sketchPoint(s.x2, s.y2);
          return [{ x: round(a.x), y: round(a.y) }, { x: round(b.x), y: round(b.y) }];
        }));
        if (history.length === steps) pushHistory(); // las paredes ya estaban: igual se suman las aberturas
        // Cada abertura va a la pared de su misma dirección que pasa por su centro, con la medida comercial más cercana.
        let placed = 0;
        sketch.openings.forEach(function (o) {
          const c = sketchPoint(o.x, o.y);
          const host = plan.walls.filter((wl) => (Math.abs(wl.a.y - wl.b.y) < 1) === o.horizontal).map((wl) => ({ wall: wl, hit: project(wl, c) }))
            .filter((q) => q.hit.d <= 20 && q.hit.raw > 0 && q.hit.raw < 1).sort((p, q) => p.hit.d - q.hit.d)[0];
          if (!host) return;
          const width = Math.max(40, Math.round(o.w * k2 / 5) * 5);
          const type = o.kind === "open" ? "vano" : o.kind === "door" ? (width <= 75 ? "p70" : width <= 85 ? "p80" : width <= 125 ? "p90" : "pdoble")
            : ["v100", "v120", "v150", "v180"].reduce((best, key) => Math.abs(D.openings[key].w - width) < Math.abs(D.openings[best].w - width) ? key : best);
          const added = P.opening(nextId(), host.wall.id, host.hit.t, type);
          added.w = width;
          if (o.kind === "door") { // mismo lado y misma bisagra que en el dibujo
            const hinge = sketchPoint(o.hx, o.hy), tip = sketchPoint(o.tx, o.ty), len = dist(host.wall.a, host.wall.b);
            const dx = (host.wall.b.x - host.wall.a.x) / len, dy = (host.wall.b.y - host.wall.a.y) / len;
            added.side = (tip.x - hinge.x) * -dy + (tip.y - hinge.y) * dx < 0;
            added.hinge = (hinge.x - c.x) * dx + (hinge.y - c.y) * dy > 0;
          }
          added.t = clampT(Object.assign({}, added), added.t);
          plan.openings.push(added);
          placed++;
        });
        plan.ref = { src: sketch.src, ratio: sketch.h / sketch.w, w: Math.round(sketch.w * k2), x: Math.round(corner.x), y: Math.round(corner.y), opacity: 0.35, rot: sketch.angle };
        const added = plan.walls.length - before;
        sketch = null;
        syncSketch();
        fit();
        commit(null);
        syncSettings();
        hint.textContent = "Se agregaron " + added + " paredes y " + placed + " aberturas. Revisá las medidas: el boceto queda de fondo para comparar y lo quitás desde «Imagen para calcar».";
      },
      "ref-clear": function () { plan.ref = null; save(); syncSettings(); render(); },
      "variant-add": function () {
        if (variantCount() >= OPTIONS.length) { hint.textContent = "Se pueden cargar hasta " + OPTIONS.length + " opciones."; return; }
        pushHistory();
        stashVariant();
        const from = plan.variant;
        plan.variants.push(JSON.parse(JSON.stringify(plan.variants[from])));
        showVariant(plan.variants.length - 1);
        hint.textContent = "Opción " + OPTIONS[plan.variant] + " creada como copia de la " + OPTIONS[from] + ". Lo que cambies acá no toca las otras; cambiá de opción con el selector de arriba.";
      },
      "variant-remove": function () {
        if (variantCount() < 2) { hint.textContent = "El plano tiene una sola opción."; return; }
        pushHistory();
        const gone = OPTIONS[plan.variant];
        plan.variants.splice(plan.variant, 1);
        showVariant(Math.min(plan.variant, plan.variants.length - 1));
        if (plan.variants.length === 1) { plan.variants = []; plan.variant = 0; commit(null); }
        hint.textContent = "Se eliminó la opción " + gone + ". Con Deshacer la recuperás.";
      },
      present: function () { present(true); },
      "present-exit": function () { present(false); },
      duplicate: function () {
        if (sel.type === "note") {
          const twin = JSON.parse(JSON.stringify(noteById(sel.id)));
          twin.id = nextId();
          twin.pts.forEach(function (q) { q.x += 20; q.y += 20; });
          pushHistory();
          plan.notes.push(twin);
          commit({ type: "note", id: twin.id });
          return;
        }
        if (sel.type === "item") {
          const it = itemById(sel.id), copyOf = Object.assign({}, it, { id: nextId(), x: it.x + 20, y: it.y + 20 });
          pushHistory();
          plan.items.push(copyOf);
          commit({ type: "item", id: copyOf.id });
          return;
        }
        const o = openingById(sel.id), twin = Object.assign({}, o, { id: nextId() });
        pushHistory();
        twin.t = clampT(twin, o.t + (o.w + 20) / dist(wallById(o.wall).a, wallById(o.wall).b));
        plan.openings.push(twin);
        commit({ type: "opening", id: twin.id });
      },
      fit: function () { fit(); render(); },
      "zoom-in": function () { zoomAt(center(), 1 / 1.25); },
      "zoom-out": function () { zoomAt(center(), 1.25); },
      print: function () { window.print(); },
      docs: function () {
        if (!brand.docs) return;
        brand.docs.open({ plan: function () { return plan; }, save: function (doc) { plan.doc = doc; save(); }, download: download, fileName: fileName });
      },
      clear: function () { // vacía el plano entero: todas las plantas y el corte, no solo la planta a la vista
        pushHistory();
        P.LEVEL_FIELDS.forEach(function (f) { plan[f] = []; });
        plan.levels = []; plan.level = 0; plan.section = null;
        chain = null;
        fit();
        commit(null);
        syncSettings();
      },
      sample: function () {
        pushHistory();
        const s = P.sample();
        s.settings = plan.settings; s.layers = plan.layers; s.snap = plan.snap; s.ref = plan.ref; s.name = plan.name; s.doc = plan.doc;
        s.variants = plan.variants; s.variant = plan.variant; // el ejemplo reemplaza solo la opción a la vista
        plan = s; chain = null;
        fit(); commit(null); syncSettings(); setTool("select");
      }
    };

    // ---------- Boceto a plano ----------
    // El boceto se analiza y se muestra como vista previa; recién al aceptar se convierte en paredes.
    const sketchScale = () => sketch.width * 100 / Math.max(1, sketch.box.x1 - sketch.box.x0); // cm por píxel
    const sketchPoint = (x, y) => ({ x: sketch.origin.x + (x - sketch.box.x0) * sketchScale(), y: sketch.origin.y + (y - sketch.box.y0) * sketchScale() });
    function syncSketch() {
      sketchBar.hidden = !sketch;
      if (!sketch) return;
      const n = sketch.segments.length, count = (kind) => sketch.openings.filter((o) => o.kind === kind).length;
      const parts = [[n, "pared", "paredes"], [count("door"), "puerta", "puertas"], [count("window"), "ventana", "ventanas"], [count("open"), "vano", "vanos"]]
        .filter((p) => p[0]).map((p) => p[0] + " " + (p[0] === 1 ? p[1] : p[2]));
      $("[data-sketch-count]", root).textContent = n ? "Detecté " + parts.slice(0, -1).join(", ") + (parts.length > 1 ? " y " : "") + parts[parts.length - 1] + "."
        : "No encontré trazos rectos. Probá con más detalle o con una foto más nítida y de frente.";
      $('[data-sketch="width"]', root).value = E.fmt(sketch.width, 2);
      $('[data-sketch="detail"]', root).value = String(sketch.detail);
      $('[data-action="sketch-apply"]', root).disabled = !n;
    }
    function detectSketch() {
      const found = brand.sketch.vectorize(sketch.gray, sketch.w, sketch.h, sketch.detail);
      sketch.segments = found.segments;
      sketch.openings = found.openings;
      sketch.angle = found.angle;
      sketch.box = found.box || { x0: 0, y0: 0, x1: sketch.w, y1: sketch.h };
      const k = sketchScale(), corner = sketchPoint(0, 0), r = svg.getBoundingClientRect(), ratio = r.width && r.height ? r.height / r.width : 0.75;
      view.w = Math.max(sketch.w * k, sketch.h * k / ratio) * 1.15; // encuadra el boceto
      view.x = corner.x + sketch.w * k / 2 - view.w / 2;
      view.y = corner.y + sketch.h * k / 2 - view.w * ratio / 2;
      syncSketch();
      render();
    }
    function readSketch(file) {
      const fail = function () { hint.textContent = "No se pudo leer esa imagen."; };
      const reader = new FileReader();
      reader.onerror = fail;
      reader.onload = function () {
        const image = new Image();
        image.onerror = fail;
        image.onload = function () {
          const shrink = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)); // 900 px alcanzan y lo mantienen rápido
          const w = Math.max(1, Math.round(image.naturalWidth * shrink)), h = Math.max(1, Math.round(image.naturalHeight * shrink));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(image, 0, 0, w, h);
          const rgba = ctx.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) gray[i] = Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114);
          // Se ubica a la derecha de lo que ya esté dibujado, para no pisarlo.
          const right = plan.walls.reduce((m, wall) => Math.max(m, wall.a.x, wall.b.x), -Infinity);
          setTool("select"); // antes de crear el boceto: setTool redibuja y la vista previa todavía no tiene trazos
          sketch = { src: canvas.toDataURL("image/jpeg", 0.8), gray: gray, w: w, h: h, width: 10, detail: 0.05, origin: { x: isFinite(right) ? round(right + 300) : 0, y: 0 } };
          detectSketch();
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    // ---------- Vista 3D ----------
    function showView(mode) {
      const on = mode === "3d";
      $$("[data-view]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === mode)));
      stage3d.hidden = !on;
      if (brand.view3d) brand.view3d.close();
      if (!on) { render(); return; }
      note3d.hidden = false;
      if (!plan.walls.length) { note3d.textContent = "Dibujá al menos una pared para verla en 3D."; return; }
      if (!brand.view3d) { note3d.textContent = "No se pudo cargar la vista 3D. Recargá la página."; return; }
      note3d.textContent = "Preparando la vista 3D…";
      brand.view3d.open(stage3d, plan, { roof: layers().roof }).then(function (info) {
        note3d.hidden = true;
        stage3d.setAttribute("data-meshes", info.meshes);
      }, function (e) {
        console.warn("[3d]", e);
        // Sin WebGL no hay nada que hacer; cualquier otra falla suele ser que no se pudo descargar el motor 3D.
        note3d.textContent = /WebGL/.test(e && e.message)
          ? "Este navegador no puede mostrar la vista 3D. El plano y el cómputo siguen funcionando."
          : "No se pudo cargar la vista 3D. Revisá la conexión, recargá la página y probá de nuevo. El plano y el cómputo siguen funcionando.";
      });
    }

    // ---------- Eventos ----------
    function touch() { if (!drag.dirty) { pushHistory(); drag.dirty = true; } }
    function startPan(e, p) { drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, p: p }; }

    svg.addEventListener("pointerdown", function (e) {
      if (e.button === 2) return;
      const p = toWorld(e);
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
      if (e.button === 1 || tool === "pan" || spaceDown) { e.preventDefault(); startPan(e); return; }
      if (NOTES[tool]) {
        const fresh = { id: 0, kind: tool, color: nextNote.color, w: nextNote.w };
        if (tool !== "text") { drag = { type: "draw", sx: e.clientX, sy: e.clientY, note: Object.assign(fresh, { pts: tool === "pen" ? [pt1(p)] : [pt1(p), pt1(p)] }) }; return; }
        e.preventDefault(); // el foco tiene que quedar en el campo de texto, no volver al lienzo
        Object.assign(fresh, { id: nextId(), pts: [pt1(p)], text: "Nota" });
        pushHistory();
        plan.notes.push(fresh);
        setTool(presenting ? "pan" : "select");
        commit({ type: "note", id: fresh.id });
        const input = $('input[name="text"]', inspector);
        if (input) { input.focus(); input.select(); }
        return;
      }
      if (tool === "wall") { addWallPoint(snap(p, { from: chain })); return; }
      if (tool === "room") { addRoomPoint(snap(p)); return; }
      if (tool === "opening") { const hit = hitWall(p); if (hit) addOpening(hit, pick); return; }
      if (tool === "item") {
        const q = itemPoint(p), it = P.item(nextId(), pick, q.x, q.y, 0);
        pushHistory();
        plan.items.push(it);
        ghost = null;
        commit({ type: "item", id: it.id });
        return;
      }
      if (tool === "measure") {
        const q = snap(p);
        measure = !measure || measure.b ? { a: q } : { a: measure.a, b: q };
        hover = null;
        render();
        return;
      }

      if (tool === "arc") { // inicio, final y un punto de paso
        const q = snap(p);
        if (!chain) chain = q;
        else if (!arcEnd) { if (dist(chain, q) >= GRID) arcEnd = q; }
        else {
          const pts = P.arcPoints(chain, arcEnd, q) || [chain, arcEnd];
          addWalls(pts.slice(1).map((point, i) => [pts[i], point]));
          chain = null; arcEnd = null;
          commit(null);
          return;
        }
        render();
        return;
      }
      if (tool === "surface") {
        const q = snap(p);
        if (!chain) { chain = q; render(); return; }
        if (Math.abs(q.x - chain.x) < GRID || Math.abs(q.y - chain.y) < GRID) return;
        const sf = { id: nextId(), x: Math.min(chain.x, q.x), y: Math.min(chain.y, q.y), w: Math.abs(q.x - chain.x), h: Math.abs(q.y - chain.y), type: "patio" };
        pushHistory();
        plan.surfaces.push(sf);
        chain = null;
        commit({ type: "surface", id: sf.id });
        return;
      }
      if (tool === "section") {
        const q = snap(p);
        if (!chain) { chain = q; render(); return; }
        if (dist(chain, q) < GRID) return;
        pushHistory();
        plan.section = { a: chain, b: q };
        commit(null);
        setTool("select");
        return;
      }
      if (tool === "wire") {
        const it = hitItem(p);
        if (!it || D.items[it.type].group !== "electricidad") return;
        const linked = wireFrom && plan.wires.some((w) => (w.a === wireFrom && w.b === it.id) || (w.a === it.id && w.b === wireFrom));
        if (wireFrom && wireFrom !== it.id && !linked) { pushHistory(); plan.wires.push({ id: nextId(), a: wireFrom, b: it.id }); }
        wireFrom = it.id;
        commit(null);
        return;
      }

      const adding = e.shiftKey || multi; // "Elegir varios" hace lo mismo que Shift, también con el dedo
      const wall = !adding && sel && sel.type === "wall" && wallById(sel.id);
      const end = wall && [wall.a, wall.b].find((q) => dist(q, p) < 11 * px());
      if (end) { drag = { type: "node", cur: copy(end) }; return; }
      if (adding) { // sumar o quitar muros de la selección, o empezar un recuadro
        const more = hitWall(p);
        if (!more) { drag = { type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY, add: true }; return; }
        const ids = pickedWalls().slice(), at = ids.indexOf(more.wall.id);
        if (at >= 0) ids.splice(at, 1); else ids.push(more.wall.id);
        commit(wallsSel(ids));
        return;
      }
      // Las anotaciones van dibujadas encima de todo: son lo primero que se elige.
      const marked = !adding && sel && sel.type === "note" && noteById(sel.id);
      const corner = marked && marked.kind !== "pen" && marked.kind !== "text" ? marked.pts.findIndex((q) => dist(q, p) < 11 * px()) : -1;
      if (corner >= 0) { drag = { type: "notept", id: marked.id, i: corner }; return; }
      const note = !adding && hitNote(p);
      if (note) { commit({ type: "note", id: note.id }); drag = { type: "note", id: note.id, start: p, from: note.pts.map(copy) }; return; }
      const opening = hitOpening(p);
      if (opening) { commit({ type: "opening", id: opening.id }); drag = { type: "opening", id: opening.id }; return; }
      // Un clic sobre el cuerpo del muro elige el muro, aunque haya un mueble arrimado; el margen extra del mueble vale solo fuera del muro.
      const hit = hitWall(p), onWall = hit && hit.d <= (model.wallThick[hit.wall.id] || 12) / 2;
      const thing = !onWall && hitItem(p);
      if (thing) { commit({ type: "item", id: thing.id }); drag = { type: "item", id: thing.id, dx: p.x - thing.x, dy: p.y - thing.y }; return; }
      if (hit) {
        commit({ type: "wall", id: hit.wall.id });
        drag = { type: "wall", start: p, a: copy(hit.wall.a), b: copy(hit.wall.b), curA: copy(hit.wall.a), curB: copy(hit.wall.b) };
        return;
      }
      // Sobre el fondo: con mouse o lápiz, arrastrar abre un recuadro de selección; con el dedo, desplaza el plano.
      // En los dos casos, un toque sin arrastre elige el ambiente o la superficie que haya debajo.
      if (e.pointerType === "touch") startPan(e, p);
      else drag = { type: "box", start: p, cur: p, sx: e.clientX, sy: e.clientY };
    });

    svg.addEventListener("pointermove", function (e) {
      const p = toWorld(e);
      coords.textContent = "X " + E.fmt(p.x / 100, 2) + " · Y " + E.fmt(p.y / 100, 2);
      if (!drag) {
        if (tool === "wall") { hover = snap(p, { from: chain }); render(); }
        else if (tool === "room") { hover = snap(p); render(); }
        else if (tool === "opening") {
          const hit = hitWall(p);
          ghost = hit ? P.opening(0, hit.wall.id, hit.t, pick) : null;
          if (ghost) ghost.t = clampT(ghost, ghost.t);
          render();
        } else if (tool === "item") {
          const q = itemPoint(p);
          ghost = P.item(0, pick, q.x, q.y, 0);
          render();
        } else if (tool === "measure" && measure && !measure.b) { hover = snap(p); render(); }
        else if (tool === "arc" || tool === "surface" || tool === "section") { hover = snap(p); render(); }
        else if (tool === "wire" && wireFrom) { hover = p; render(); }
        return;
      }
      if (drag.type === "pan") {
        const k = px();
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
        view.x = drag.vx - (e.clientX - drag.sx) * k;
        view.y = drag.vy - (e.clientY - drag.sy) * k;
        render();
      } else if (drag.type === "box") {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
        drag.cur = p;
        render();
      } else if (drag.type === "draw") {
        const nt = drag.note, q = pt1(p);
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
        if (nt.kind !== "pen") nt.pts[1] = e.shiftKey ? straight(nt.pts[0], q, nt.kind) : q;
        else if (dist(nt.pts[nt.pts.length - 1], q) >= 2 * px()) nt.pts.push(q);
        render();
      } else if (drag.type === "note") {
        const nt = noteById(drag.id), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (Math.abs(dx) + Math.abs(dy) < 2 * px() && !drag.dirty) return;
        touch();
        nt.pts = drag.from.map((q) => pt1({ x: q.x + dx, y: q.y + dy }));
        render();
      } else if (drag.type === "notept") {
        const nt = noteById(drag.id);
        touch();
        nt.pts[drag.i] = e.shiftKey ? straight(nt.pts[1 - drag.i], pt1(p), nt.kind) : pt1(p);
        render();
      } else if (drag.type === "node") {
        const to = snap(p, { skip: drag.cur });
        if (same(to, drag.cur)) return;
        touch();
        movePoints([{ from: drag.cur, to: to }]);
        drag.cur = to;
        render();
      } else if (drag.type === "wall") {
        const dx = round(p.x - drag.start.x), dy = round(p.y - drag.start.y);
        const a = { x: drag.a.x + dx, y: drag.a.y + dy }, b = { x: drag.b.x + dx, y: drag.b.y + dy };
        if (same(a, drag.curA)) return;
        touch();
        movePoints([{ from: drag.curA, to: a }, { from: drag.curB, to: b }]);
        drag.curA = a; drag.curB = b;
        render();
      } else if (drag.type === "item") {
        const it = itemById(drag.id), q = itemPoint({ x: p.x - drag.dx, y: p.y - drag.dy });
        if (q.x === it.x && q.y === it.y) return;
        touch();
        it.x = q.x; it.y = q.y;
        render();
      } else if (drag.type === "opening") {
        const o = openingById(drag.id);
        const t = clampT(o, project(wallById(o.wall), p).t);
        if (t === o.t) return;
        touch();
        o.t = t;
        render();
      }
    });

    function endDrag() {
      if (!drag) return;
      const done = drag;
      drag = null;
      // Lo que haya bajo un toque sin arrastre: un ambiente o una superficie exterior.
      const under = function (q) {
        const outside = !roomAt(q) && hitSurface(q);
        return roomAt(q) ? { type: "room", x: n1(q.x), y: n1(q.y) } : outside ? { type: "surface", id: outside.id } : null;
      };
      if (done.type === "draw") {
        const nt = done.note;
        if (nt.kind === "pen") nt.pts = simplify(nt.pts, 1.2 * px());
        if (!done.moved || nt.pts.length < 2 || dist(nt.pts[0], nt.pts[1]) < 1 && nt.pts.length === 2) { hint.textContent = "Mantené apretado y arrastrá para dibujar."; render(); return; }
        pushHistory();
        nt.id = nextId();
        plan.notes.push(nt);
        commit(null); // la herramienta sigue activa para seguir anotando
        return;
      }
      if (done.type === "box") {
        if (!done.moved) { // fue un clic, no un recuadro
          if (!done.add) commit(under(done.start));
          else render();
          return;
        }
        // Quedan elegidos los muros que tocan el recuadro; con Shift se suman a los que ya estaban.
        const x0 = Math.min(done.start.x, done.cur.x), x1 = Math.max(done.start.x, done.cur.x), y0 = Math.min(done.start.y, done.cur.y), y1 = Math.max(done.start.y, done.cur.y);
        const inside = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
        const ids = done.add ? pickedWalls().slice() : [];
        plan.walls.forEach(function (w) {
          if (ids.indexOf(w.id) < 0 && (inside(w.a) || inside(w.b) || inside({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }))) ids.push(w.id);
        });
        commit(wallsSel(ids));
        return;
      }
      if (done.type === "pan") {
        if (!done.moved && done.p && tool === "select") commit(under(done.p));
      } else if (done.dirty) commit(sel);
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    svg.addEventListener("pointerleave", function () { if (!drag && (hover || ghost)) { hover = null; ghost = null; render(); } });
    svg.addEventListener("dblclick", function () { if (chain) { chain = null; render(); } });
    svg.addEventListener("contextmenu", function (e) { if (chain) { e.preventDefault(); chain = null; render(); } });
    svg.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(toWorld(e), e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

    root.addEventListener("click", function (e) {
      const t = e.target.closest("[data-tool]"), a = e.target.closest("[data-action]"), item = e.target.closest("[data-pick]"), thing = e.target.closest("[data-pick-item]");
      const swatch = e.target.closest("[data-swatch]");
      if (swatch) { setColor(swatch.getAttribute("data-swatch")); return; }
      if (e.target.closest("[data-view]")) { showView(e.target.closest("[data-view]").getAttribute("data-view")); return; }
      if (t) setTool(t.getAttribute("data-tool"));
      else if (item) setTool("opening", item.getAttribute("data-pick"));
      else if (thing) setTool("item", thing.getAttribute("data-pick-item"));
      else if (a && actions[a.getAttribute("data-action")]) {
        actions[a.getAttribute("data-action")]();
        if (a.closest(".ws-menu")) a.closest(".ws-menu").removeAttribute("open");
      }
      else if (e.target.closest("[data-copy]")) {
        const button = e.target.closest("[data-copy]");
        (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject()).then(
          function () { button.textContent = "✓ Copiado"; }, function () { button.textContent = "No se pudo copiar"; });
      }
    });

    document.addEventListener("keydown", function (e) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === "Space") { // mientras esté apretada, arrastrar desplaza el plano
        e.preventDefault();
        spaceDown = true;
        svg.setAttribute("data-pan", "");
        return;
      }
      const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (tool === "wall" && chain && !ctrl) { // largo escrito a mano
        if (/^[0-9.,]$/.test(e.key)) { typed += e.key; if (!hover) hover = { x: chain.x + 100, y: chain.y }; render(); return; }
        if (e.key === "Backspace" && typed) { e.preventDefault(); typed = typed.slice(0, -1); render(); return; }
        if (e.key === "Enter" && typed) {
          const len = E.parseNum(typed) * 100, d = hover && dist(chain, hover);
          if (len >= GRID && d) addWallPoint({ x: Math.round(chain.x + (hover.x - chain.x) / d * len), y: Math.round(chain.y + (hover.y - chain.y) / d * len) });
          return;
        }
      }
      if (e.key === "Escape") {
        if (chain || wireFrom) { chain = null; arcEnd = null; wireFrom = null; typed = ""; render(); }
        else if (sel && (tool === "select" || tool === "pan")) commit(null);
        else if (presenting && tool === "pan") present(false);
        else setTool(presenting ? "pan" : "select");
      }
      else if (ctrl && key === "a" && tool === "select") { e.preventDefault(); commit(wallsSel(plan.walls.map((w) => w.id))); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (sel) { e.preventDefault(); removeSelection(); } }
      else if (ctrl && key === "z") { e.preventDefault(); actions[e.shiftKey ? "redo" : "undo"](); }
      else if (ctrl && key === "y") { e.preventDefault(); actions.redo(); }
      else if (!ctrl && !e.altKey && KEYS[key]) setTool(KEYS[key][0], KEYS[key][1]);
    });

    const releaseSpace = function () { spaceDown = false; svg.removeAttribute("data-pan"); };
    document.addEventListener("keyup", function (e) { if (e.code === "Space") releaseSpace(); });
    window.addEventListener("blur", releaseSpace);

    inspector.addEventListener("change", function (e) {
      // Sin nada seleccionado, el único campo posible es el ladrillo de los muros nuevos.
      if (e.target.name === "nextType") { nextType = e.target.value; renderInspector(); return; }
      if (e.target.name === "nextW") { nextNote.w = e.target.value; return; }
      if (!sel) return;
      if (sel.type === "room") { tagRoom(e.target.name, e.target.value.trim()); return; }
      if (sel.type === "note") {
        pushHistory();
        noteById(sel.id)[e.target.name] = e.target.name === "text" ? e.target.value.trim() || "Nota" : e.target.value;
        commit(sel);
        return;
      }
      if (sel.type === "surface") {
        const sf = surfaceById(sel.id), v = Math.round(E.parseNum(e.target.value) * 100);
        if (e.target.name !== "type" && !(v >= GRID)) { renderInspector(); return; }
        pushHistory();
        sf[e.target.name] = e.target.name === "type" ? e.target.value : v;
        commit(sel);
        return;
      }
      if (sel.type === "item") {
        const it = itemById(sel.id), v = E.parseNum(e.target.value);
        if (e.target.name === "r" ? !isFinite(v) : !(v * 100 >= 5)) { renderInspector(); return; }
        pushHistory();
        if (e.target.name === "r") it.r = ((Math.round(v) % 360) + 360) % 360;
        else it[e.target.name] = Math.round(v * 100);
        commit(sel);
        return;
      }
      if (e.target.name === "type" && (sel.type === "wall" || sel.type === "walls")) { // ladrillo propio de cada muro elegido; vacío = el tipo por defecto
        pushHistory();
        pickedWalls().map(wallById).forEach(function (w) { if (e.target.value) w.type = e.target.value; else delete w.type; });
        commit(sel);
        return;
      }
      const value = E.parseNum(e.target.value) * 100;
      if (!(value >= GRID)) { renderInspector(); return; }
      pushHistory();
      if (sel.type === "wall") {
        const w = wallById(sel.id), len = dist(w.a, w.b);
        movePoints([{ from: w.b, to: { x: Math.round(w.a.x + (w.b.x - w.a.x) / len * value), y: Math.round(w.a.y + (w.b.y - w.a.y) / len * value) } }]);
      } else {
        const o = openingById(sel.id);
        o[e.target.name] = Math.round(value);
        o.t = clampT(o, o.t);
      }
      commit(sel);
    });

    // Cada ajuste numérico: [factor a cm, mínimo, máximo] en la unidad del formulario.
    const LIMITS = { height: [100, 2, 6], slab: [1, 0, 50], screed: [1, 0, 10], coats: [1, 1, 5] };
    function syncSettings() {
      const s = Object.assign({}, P.DEFAULTS, plan.settings), show = layers();
      $$("input, select", settings).forEach(function (el) {
        if (el.type === "checkbox") el.checked = !!s[el.name];
        else if (LIMITS[el.name]) el.value = E.fmt(s[el.name] / LIMITS[el.name][0], 2);
        else el.value = s[el.name];
      });
      $$("[data-layer]", root).forEach(function (el) { el.checked = show[el.getAttribute("data-layer")]; });
      title.value = plan.name || UNTITLED;
      $("[data-level]", root).innerHTML = P.levelsOf(plan).map((level, i) => '<option value="' + i + '"' + (i === (plan.level || 0) ? " selected" : "") + ">" +
        escHTML(level.name) + "</option>").join("");
      $('[data-action="snap"]', root).setAttribute("aria-pressed", String(plan.snap !== false));
      if (model) renderVariants();
      refBox.hidden = !(plan.ref && plan.ref.src);
      if (plan.ref) {
        $('[data-ref="w"]', root).value = E.fmt(plan.ref.w / 100, 2);
        $('[data-ref="opacity"]', root).value = plan.ref.opacity;
      }
    }
    function readSettings() {
      const s = Object.assign({}, P.DEFAULTS, plan.settings);
      $$("input, select", settings).forEach(function (el) {
        if (el.type === "checkbox") { s[el.name] = el.checked; return; }
        if (!LIMITS[el.name]) { s[el.name] = el.value; return; }
        const v = E.parseNum(el.value), lim = LIMITS[el.name], ok = v >= lim[1] && v <= lim[2];
        el.setAttribute("aria-invalid", String(!ok));
        if (ok) s[el.name] = v * lim[0];
      });
      plan.settings = s;
      save();
      render();
      renderVariants();
    }
    settings.addEventListener("input", readSettings);
    settings.addEventListener("change", readSettings);
    settings.addEventListener("submit", function (e) { e.preventDefault(); });
    root.addEventListener("change", function (e) {
      const sketchField = e.target.getAttribute && e.target.getAttribute("data-sketch");
      if (sketchField && sketch) {
        const v = E.parseNum(e.target.value);
        if (sketchField === "width" && v >= 1 && v <= 200) sketch.width = v;
        if (sketchField === "detail") sketch.detail = v;
        detectSketch();
        return;
      }
      if (e.target.hasAttribute && e.target.hasAttribute("data-level")) { stashLevel(); showLevel(Number(e.target.value)); return; }
      if (e.target.hasAttribute && e.target.hasAttribute("data-variant")) { stashVariant(); showVariant(Number(e.target.value)); if (presenting) setTool("pan"); return; }
      const layer = e.target.getAttribute && e.target.getAttribute("data-layer");
      if (!layer) return;
      plan.layers = Object.assign(layers(), { [layer]: e.target.checked });
      save();
      render();
      if (!stage3d.hidden) showView("3d"); // el techo se muestra u oculta también en 3D
    });
    title.addEventListener("change", function () {
      plan.name = title.value.trim();
      title.value = plan.name || UNTITLED;
      save();
      render();
    });
    title.addEventListener("focus", function () { title.select(); });
    root.addEventListener("input", function (e) {
      const key = e.target.getAttribute && e.target.getAttribute("data-ref");
      if (!key || !plan.ref) return;
      const v = E.parseNum(e.target.value);
      if (key === "w" ? !(v >= 0.5) : !(v >= 0)) return;
      plan.ref[key] = key === "w" ? Math.round(v * 100) : v;
      save();
      render();
    });
    $$("[data-file]", root).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.files[0]) (({ plan: openPlanFile, sketch: readSketch })[input.getAttribute("data-file")] || openRefImage)(input.files[0]);
        input.value = "";
      });
    });
    // El lienzo cambia de tamaño al aparecer el inspector o plegar paneles: hay que redibujar a escala.
    if (window.ResizeObserver) new ResizeObserver(render).observe(svg);
    else window.addEventListener("resize", render);

    // En pantallas chicas las secciones largas arrancan plegadas para que el lienzo quede a la vista.
    if (matchMedia("(max-width: 959px)").matches) $$("[data-collapse-mobile]", root).forEach((d) => d.removeAttribute("open"));
    $("[data-library]", root).innerHTML = libraryHTML();
    $("[data-items]", root).innerHTML = itemLibraryHTML();
    syncSettings();
    fit();
    setTool("select");
    renderInspector();
    renderVariants();
  }

  function boot() {
    const root = $("[data-planner]");
    if (!root) return;
    try {
      if (!E || !P) throw new Error("motor no disponible");
      init(root);
    } catch (e) {
      console.warn("[planner]", e);
      $("[data-result]", root).innerHTML = '<p class="result-error">No se pudo cargar el diseñador. Recargá la página.</p>';
    }
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
