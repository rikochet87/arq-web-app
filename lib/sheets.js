/* CalcuObra — documentación de obra: arma las láminas para presentar (plantas acotadas, planta de techos,
   cortes, fachadas, instalación eléctrica, silueta y balance de superficies, planilla de iluminación y
   ventilación) con su carátula. Sin DOM: devuelve cadenas SVG. El papel se mide en mm y el dibujo en cm;
   k = cm reales por mm de papel (a escala 1:100, k = 10).
   plan.doc guarda los datos de la carátula y las opciones de la lámina (ver DEFAULTS). */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const D = B.data, E = B.engine, P = B.plan;

  const FORMATS = { A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] }; // apaisados, en mm
  const MARGIN = { left: 25, other: 10 }; // IRAM 4504: 25 mm del lado del archivo
  const STAMP = { w: 175, h: 277 };       // carátula: con los márgenes ocupa un A4 al plegar la lámina
  const GAP = 8, CAPTION = 9;             // separación entre dibujos y alto del título de cada uno
  const OBRAS = ["Obra nueva", "Ampliación", "Refacción", "Relevamiento", "Conforme a obra", "Demolición"];
  const DEFAULTS = {
    format: "A2", scale: 100, facades: "frente", color: true, furniture: true, electric: true,
    obra: "Obra nueva", destino: "Vivienda unifamiliar", propietario: "", calle: "", localidad: "", fecha: "",
    circ: "", seccion: "", manzana: "", parcela: "", partida: "", zona: "",
    lotW: 0, lotD: 0, front: "abajo", setFront: 0, setSide: 0, north: 0, // terreno en m; north en grados desde arriba
    proyectista: "", matProyectista: "", director: "", matDirector: "", constructor: "", matConstructor: "",
    coef: 8 // iluminación necesaria = superficie del local / coef
  };
  // Lado del plano desde el que se mira cada fachada: u = hacia la derecha del observador, d = hacia el observador.
  const SIDES = { abajo: { u: [1, 0], d: [0, 1] }, arriba: { u: [-1, 0], d: [0, -1] }, izquierda: { u: [0, 1], d: [-1, 0] }, derecha: { u: [0, -1], d: [1, 0] } };
  // Locales que los códigos no obligan a iluminar por vano (ventilan por vano o por conducto).
  const SERVICE = /ba[ñn]o|toilette|pasillo|paso|hall|lavadero|garage|cochera|dep[óo]sito|despensa|vestidor|baulera/i;
  const VENT = { window: 0.5, sliding: 0.5, fixed: 0 }; // parte del vano que abre, según cómo se dibuja la abertura

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const r2 = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fix = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); // siempre con dos decimales, como en un plano
  const met = (cm) => fix(cm / 100);
  const m2 = (v) => fix(v) + " m²";
  const level = (cm) => (cm > 0 ? "+" : cm < 0 ? "−" : "±") + fix(Math.abs(cm) / 100);

  // ---------- Primitivas (sirven en mm y en cm: los grosores se pasan ya convertidos) ----------
  function text(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + r2(size) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") +
      (o.bold ? ' font-weight="700"' : "") + (o.rot ? ' transform="rotate(' + o.rot + " " + r2(x) + " " + r2(y) + ')"' : "") + ">" + esc(s) + "</text>";
  }
  function line(x1, y1, x2, y2, w, extra) {
    return '<line class="ink" x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke-width="' + r2(w) + '"' + (extra || "") + "/>";
  }
  function rect(x, y, w, h, sw, fill, extra) {
    return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" fill="' + (fill || "none") + '"' +
      (sw ? ' stroke="#111" stroke-width="' + r2(sw) + '"' : "") + (extra || "") + "/>";
  }
  const dash = (k, pattern) => ' stroke-dasharray="' + pattern.map(function (v) { return r2(v * k); }).join(" ") + '"';
  const uniq = function (vals, tol) {
    return vals.slice().sort(function (a, b) { return a - b; }).filter(function (v, i, list) { return !i || v - list[i - 1] > tol; });
  };

  // Cadena de cotas sobre una recta horizontal (o vertical) en pos, con una marca en cada valor.
  function dimChain(vals, pos, horiz, k) {
    if (vals.length < 2) return "";
    const first = vals[0], last = vals[vals.length - 1], t = 0.9 * k;
    let out = horiz ? line(first, pos, last, pos, 0.13 * k) : line(pos, first, pos, last, 0.13 * k);
    vals.forEach(function (v, i) {
      out += horiz ? line(v - t, pos + t, v + t, pos - t, 0.3 * k) : line(pos - t, v + t, pos + t, v - t, 0.3 * k);
      const seg = i ? v - vals[i - 1] : 0, mid = v - seg / 2;
      if (seg / k < 5) return; // no entra el número
      out += horiz ? text(mid, pos - 1.1 * k, met(seg), 2 * k, { anchor: "middle" }) : text(pos - 1.1 * k, mid, met(seg), 2 * k, { anchor: "middle", rot: -90 });
    });
    return out;
  }

  function arrow(x1, y1, x2, y2, k) {
    const len = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / len, dy = (y2 - y1) / len, h = 2.4 * k, w = 0.8 * k;
    return line(x1, y1, x2, y2, 0.25 * k) + '<path fill="#111" d="M' + r2(x2) + " " + r2(y2) + "L" + r2(x2 - dx * h - dy * w) + " " + r2(y2 - dy * h + dx * w) +
      "L" + r2(x2 - dx * h + dy * w) + " " + r2(y2 - dy * h - dx * w) + 'Z"/>';
  }

  function north(x, y, r, deg) {
    return '<g transform="translate(' + r2(x) + " " + r2(y) + ") rotate(" + (Number(deg) || 0) + ')">' +
      '<circle class="ink" r="' + r + '" stroke-width="0.25"/><path fill="#111" d="M0 ' + -r + "L" + r2(r * 0.42) + " " + r2(r * 0.72) + "L0 " + r2(r * 0.3) + "L" + r2(-r * 0.42) + " " + r2(r * 0.72) + 'Z"/>' +
      text(0, -r - 1, "N", r * 0.62, { anchor: "middle", bold: true }) + "</g>";
  }

  /* Un dibujo a escala listo para ubicar en la lámina. inner está en cm y ext es el rectángulo (en cm)
     que ocupa; pad (mm) deja lugar alrededor; over se dibuja encima, ya en mm. */
  function block(title, c, inner, ext, pad, over, scale) {
    const k = scale ? scale / 10 : c.k, w = pad[3] + (ext.x1 - ext.x0) / k + pad[1], h = pad[0] + (ext.y1 - ext.y0) / k + pad[2];
    return {
      title: title, scale: "Esc. 1:" + (scale || c.doc.scale), w: w, h: h,
      svg: '<g transform="translate(' + r2(pad[3] - ext.x0 / k) + " " + r2(pad[0] - ext.y0 / k) + ") scale(" + (1 / k) + ')">' + inner + "</g>" + (over ? over(w, h) : "")
    };
  }

  // ---------- Datos comunes a todas las láminas ----------
  function lotRect(doc, box) {
    const W = doc.lotW * 100, deep = doc.lotD * 100, f = doc.setFront * 100, side = doc.setSide * 100;
    if (!(W > 0 && deep > 0)) return null;
    if (doc.front === "arriba") return { x0: box.x0 - side, y0: box.y0 - f, x1: box.x0 - side + W, y1: box.y0 - f + deep };
    if (doc.front === "izquierda") return { x0: box.x0 - f, y0: box.y0 - side, x1: box.x0 - f + deep, y1: box.y0 - side + W };
    if (doc.front === "derecha") return { x0: box.x1 + f - deep, y0: box.y0 - side, x1: box.x1 + f, y1: box.y0 - side + W };
    return { x0: box.x0 - side, y0: box.y1 + f - deep, x1: box.x0 - side + W, y1: box.y1 + f };
  }

  // Línea de corte automática: paralela a un eje, por donde no corra un muro a lo largo.
  function autoCut(c, vertical) {
    const b = c.box, span = vertical ? b.x1 - b.x0 : b.y1 - b.y0, from = vertical ? b.x0 : b.y0, far = 17 * c.k, near = 6 * c.k;
    const busy = function (v) {
      return c.levels.some(function (lv) {
        return lv.walls.some(function (w) {
          return vertical ? Math.abs(w.a.x - w.b.x) < 1 && Math.abs(w.a.x - v) < 30 : Math.abs(w.a.y - w.b.y) < 1 && Math.abs(w.a.y - v) < 30;
        });
      });
    };
    const at = [0.5, 0.38, 0.62, 0.3, 0.7, 0.22, 0.78].map(function (f) { return Math.round(from + span * f); });
    const v = at.find(function (q) { return !busy(q); }) || at[0];
    return vertical ? { a: { x: v, y: b.y0 - far }, b: { x: v, y: b.y1 + near } } : { a: { x: b.x0 - far, y: v }, b: { x: b.x1 + near, y: v } };
  }

  function context(plan, doc) {
    const s = P.settingsOf(plan), bricks = P.bricksOf(s), levels = P.levelsOf(plan);
    const c = { plan: plan, doc: doc, s: s, levels: levels, k: doc.scale / 10 };
    c.sv = levels.map(function (lv) { return P.survey(lv, s, bricks); });
    const xs = [], ys = [];
    levels.forEach(function (lv) { lv.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); }); });
    if (!xs.length) return null;
    c.box = { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
    c.lot = lotRect(doc, c.box);
    c.wall = !doc.color ? "#111" : doc.obra === "Relevamiento" ? "#111" : doc.obra === "Demolición" ? "#e0b400" : "#d0021b";
    let n = 0;
    c.sv.forEach(function (v) { v.rooms.forEach(function (r) { r.n = ++n; }); });
    // Corte A–A: el que trazó el usuario, si corta algún muro; si no, uno transversal. B–B va perpendicular.
    const own = plan.section && P.sectionData(plan, plan.section) ? plan.section : null;
    const ownVertical = own && Math.abs(own.b.y - own.a.y) > Math.abs(own.b.x - own.a.x);
    c.cuts = [{ name: "A", a: (own || autoCut(c, true)).a, b: (own || autoCut(c, true)).b }];
    const second = autoCut(c, own ? !ownVertical : false);
    c.cuts.push({ name: "B", a: second.a, b: second.b });
    return c;
  }

  // Superficies para el balance, en m². La cubierta se mide hasta la cara exterior de los muros.
  function areas(c) {
    const cov = c.sv.map(function (v) {
      return v.footprint + v.edges.reduce(function (sum, e) { return sum + (e.cls === "ext" ? dist(e.a, e.b) * e.thick / 2 : 0); }, 0) / 1e4;
    });
    const semi = c.levels.reduce(function (sum, lv) {
      return sum + lv.surfaces.reduce(function (q, sf) { return q + (sf.type === "galeria" ? sf.w * sf.h / 1e4 : 0); }, 0);
    }, 0);
    const lot = c.lot ? c.doc.lotW * c.doc.lotD : 0, total = cov.reduce(function (a, b) { return a + b; }, 0), ground = Math.max.apply(null, cov);
    return { cov: cov, semi: semi, lot: lot, total: total, free: lot ? lot - ground - semi : 0, fos: lot ? ground / lot : 0, fot: lot ? total / lot : 0 };
  }
  function balanceRows(c) {
    const a = areas(c), rows = [["Superficie del terreno", a.lot ? m2(a.lot) : "—"]];
    a.cov.forEach(function (v, i) { rows.push(["Sup. cubierta " + c.levels[i].name.toLowerCase(), m2(v)]); });
    if (a.semi) rows.push(["Sup. semicubierta", m2(a.semi)]);
    rows.push(["Sup. cubierta total", m2(a.total)], ["Superficie libre", a.lot ? m2(a.free) : "—"],
      ["FOS (ocupación del suelo)", a.lot ? fix(a.fos) : "—"], ["FOT (ocupación total)", a.lot ? fix(a.fot) : "—"]);
    return rows;
  }

  // ---------- Plantas ----------
  function planView(c, i, mode) {
    const lv = c.levels[i], v = c.sv[i], k = c.k, kk = k * 0.17, elec = mode === "elec", b = c.box;
    const ext = { x0: b.x0 - 12, y0: b.y0 - 12, x1: b.x1 + 12, y1: b.y1 + 12 };
    const grow = function (x0, y0, x1, y1) { ext.x0 = Math.min(ext.x0, x0); ext.y0 = Math.min(ext.y0, y0); ext.x1 = Math.max(ext.x1, x1); ext.y1 = Math.max(ext.y1, y1); };
    let g = "";

    lv.surfaces.forEach(function (sf) {
      grow(sf.x, sf.y, sf.x + sf.w, sf.y + sf.h);
      g += rect(sf.x, sf.y, sf.w, sf.h, 0.13 * k, "none", dash(k, [1.5, 1])) +
        text(sf.x + sf.w / 2, sf.y + sf.h / 2, ((D.surfaces[sf.type] || D.surfaces.patio).label).toUpperCase(), 1.8 * k, { anchor: "middle" });
    });
    if (i === 0 && c.lot && !elec) { // terreno: línea municipal sobre la calle y ejes medianeros en los otros lados
      const L = c.lot, f = c.doc.front, horiz = f === "abajo" || f === "arriba";
      grow(L.x0, L.y0, L.x1, L.y1);
      g += rect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0, 0.3 * k, "none", dash(k, [6, 1.2, 0.6, 1.2]));
      const lm = f === "abajo" ? [(L.x0 + L.x1) / 2, L.y1 - 1.4 * k] : f === "arriba" ? [(L.x0 + L.x1) / 2, L.y0 + 3 * k] : f === "izquierda" ? [L.x0 + 3 * k, (L.y0 + L.y1) / 2] : [L.x1 - 1.4 * k, (L.y0 + L.y1) / 2];
      g += text(lm[0], lm[1], "L.M. — " + (c.doc.calle || "calle") + " — frente " + met(horiz ? L.x1 - L.x0 : L.y1 - L.y0), 2 * k, { anchor: "middle", rot: horiz ? 0 : -90 });
      grow(L.x0 - 5 * k, L.y0 - 5 * k, L.x1 + 5 * k, L.y1 + 5 * k);
      const em = f === "abajo" ? [(L.x0 + L.x1) / 2, L.y0 + 3 * k] : f === "arriba" ? [(L.x0 + L.x1) / 2, L.y1 - 1.4 * k] : f === "izquierda" ? [L.x1 - 1.4 * k, (L.y0 + L.y1) / 2] : [L.x0 + 3 * k, (L.y0 + L.y1) / 2];
      g += text(em[0], em[1], "E.M. — fondo " + met(horiz ? L.y1 - L.y0 : L.x1 - L.x0), 1.8 * k, { anchor: "middle", rot: horiz ? 0 : -90 });
    }

    v.edges.forEach(function (e) { g += P.lineSVG(e.a, e.b, "wall" + (elec ? " mute" : ""), e.thick); });
    lv.openings.forEach(function (o) {
      const wall = lv.walls.find(function (w) { return w.id === o.wall; });
      if (wall) g += P.openingSVG(wall, o, v.wallThick[wall.id] || 12, kk, "");
    });
    lv.items.forEach(function (it) {
      const def = D.items[it.type];
      if (!def) return;
      const el = def.group === "electricidad";
      if (elec ? el : !el && (c.doc.furniture || def.bill || def.shape === "stair")) g += P.itemSVG(it, kk, "");
    });
    if (elec) {
      lv.wires.forEach(function (w) {
        const p = lv.items.find(function (it) { return it.id === w.a; }), q = lv.items.find(function (it) { return it.id === w.b; });
        if (!p || !q) return;
        g += '<path class="wire" stroke-width="' + r2(0.18 * k) + '" d="M' + r2(p.x) + " " + r2(p.y) + "Q" + r2((p.x + q.x) / 2 - (q.y - p.y) * 0.16) + " " + r2((p.y + q.y) / 2 + (q.x - p.x) * 0.16) + " " + r2(q.x) + " " + r2(q.y) + '"/>';
      });
    }
    v.rooms.forEach(function (r) {
      g += text(r.cx, r.cy - (elec ? 0 : 1.1 * k), r.name.toUpperCase(), 2.2 * k, { anchor: "middle", bold: true });
      if (!elec) g += text(r.cx, r.cy + 2 * k, "L" + r.n + " · " + m2(r.area), 1.9 * k, { anchor: "middle" });
    });
    if (elec) return block(lv.name.toUpperCase() + " — INSTALACIÓN ELÉCTRICA", c, g, ext, [4, 4, 4, 4]);

    // Cotas a ejes de muro: parciales y total, arriba y a la izquierda.
    const xs = [], ys = [];
    v.edges.forEach(function (e) { xs.push(e.a.x, e.b.x); ys.push(e.a.y, e.b.y); });
    if (xs.length) {
      const X = uniq(xs, 2), Y = uniq(ys, 2), top = ext.y0 - 5 * k, left = ext.x0 - 5 * k;
      X.forEach(function (x) { g += line(x, b.y0 - 14, x, top - k, 0.09 * k); });
      Y.forEach(function (y) { g += line(b.x0 - 14, y, left - k, y, 0.09 * k); });
      g += dimChain(X, top, true, k) + dimChain([X[0], X[X.length - 1]], top - 6 * k, true, k) +
        dimChain(Y, left, false, k) + dimChain([Y[0], Y[Y.length - 1]], left - 6 * k, false, k);
      grow(left - 9 * k, top - 9 * k, ext.x1, ext.y1);
    }
    c.cuts.forEach(function (cut) {
      const len = dist(cut.a, cut.b), dx = (cut.b.x - cut.a.x) / len, dy = (cut.b.y - cut.a.y) / len;
      g += line(cut.a.x, cut.a.y, cut.b.x, cut.b.y, 0.35 * k, dash(k, [7, 1.3, 0.7, 1.3]));
      [[cut.a, -1], [cut.b, 1]].forEach(function (end) {
        const x = end[0].x + dx * end[1] * 2.6 * k, y = end[0].y + dy * end[1] * 2.6 * k;
        g += text(x, y + 1.2 * k, cut.name, 3.4 * k, { anchor: "middle", bold: true });
        grow(x - 3 * k, y - 3 * k, x + 3 * k, y + 3 * k);
      });
    });
    const base = i * (c.s.height + D.finishes.storeyGap);
    return block(lv.name.toUpperCase() + " — N.P.T. " + level(base), c, g, ext, [3, i === 0 ? 16 : 4, 3, 3], i === 0 ? function (w) { return north(w - 7, 9, 4.5, c.doc.north); } : null);
  }

  function roofView(c) {
    const r = P.roofShape(c.plan);
    if (!r) return null;
    const k = c.k, def = D.roofs[r.type], xm = (r.x0 + r.x1) / 2, ym = (r.y0 + r.y1) / 2, top = r.y0 - 5 * k, left = r.x0 - 5 * k;
    let g = rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 0.35 * k, "#f4f4f4");
    c.sv[c.levels.length - 1].edges.forEach(function (e) { if (e.cls === "ext") g += line(e.a.x, e.a.y, e.b.x, e.b.y, 0.13 * k, dash(k, [1.6, 1])); });
    const run = (r.alongX ? r.y1 - r.y0 : r.x1 - r.x0) * 0.22; // largo de la flecha que marca la caída
    if (r.type === "tejas") {
      g += r.alongX ? line(r.x0, ym, r.x1, ym, 0.35 * k) + arrow(xm, ym - run * 0.3, xm, ym - run * 1.6, k) + arrow(xm, ym + run * 0.3, xm, ym + run * 1.6, k)
        : line(xm, r.y0, xm, r.y1, 0.35 * k) + arrow(xm - run * 0.3, ym, xm - run * 1.6, ym, k) + arrow(xm + run * 0.3, ym, xm + run * 1.6, ym, k);
    } else if (r.type === "chapa") {
      g += r.alongX ? arrow(xm, ym - run, xm, ym + run, k) : arrow(xm - run, ym, xm + run, ym, k);
    }
    g += text(xm, r.y1 - 3 * k, def.label.toUpperCase() + " — PEND. " + def.slope + " %", 2.1 * k, { anchor: "middle", bold: true }) +
      dimChain([r.x0, r.x1], top, true, k) + dimChain([r.y0, r.y1], left, false, k);
    return block("PLANTA DE TECHOS", c, g, { x0: left - 3 * k, y0: top - 3 * k, x1: r.x1, y1: r.y1 }, [3, 4, 3, 3]);
  }

  // ---------- Cortes y fachadas ----------
  function sectionView(c, cut) {
    const g = P.sectionData(c.plan, cut);
    if (!g) return null;
    const k = c.k, top = g.topZ, Y = function (z) { return top - z; };
    let out = line(g.lo - 24 * k, Y(-12), g.hi + 12 * k, Y(-12), 0.5 * k);
    g.rects.forEach(function (r) {
      out += rect(r.x, Y(r.z1), r.w, r.z1 - r.z0, r.cls === "cut" ? 0 : 0.13 * k, r.cls === "cut" ? c.wall : r.cls === "slab" ? "#c8c8c8" : "#fff");
    });
    if (g.profile.length > 1) {
      out += '<polyline class="ink" stroke-width="' + r2(0.5 * k) + '" points="' + g.profile.map(function (p) { return r2(p.d) + "," + r2(Y(p.z)); }).join(" ") + '"/>';
    }
    const marks = g.marks.concat([{ z: g.marks[g.marks.length - 1].z + g.H, name: "" }]);
    marks.forEach(function (m) {
      out += line(g.lo - 24 * k, Y(m.z), g.lo - 3 * k, Y(m.z), 0.13 * k) + text(g.lo - 24 * k, Y(m.z) - 0.9 * k, level(m.z) + (m.name ? " " + m.name : ""), 1.9 * k);
    });
    const zs = [];
    g.marks.forEach(function (m) { zs.push(Y(m.z + g.H), Y(m.z)); });
    out += dimChain(uniq(zs, 0.5), g.hi + 7 * k, false, k) +
      dimChain(uniq(g.rects.filter(function (r) { return r.cls === "cut"; }).map(function (r) { return r.x + r.w / 2; }), 2), Y(-12) + 7 * k, true, k);
    return block("CORTE " + cut.name + "–" + cut.name, c, out, { x0: g.lo - 25 * k, y0: -3 * k, x1: g.hi + 12 * k, y1: top + 12 + 9 * k }, [2, 2, 2, 2]);
  }

  function openingFace(o, Y, k) {
    const x = o.u, y = Y(o.z1), w = o.w, h = o.z1 - o.z0, sym = o.def.symbol, thin = 0.15 * k;
    const glass = o.def.group === "window" || o.glazed;
    let out = rect(x, y, w, h, 0.25 * k, sym === "open" ? "#bdbdbd" : glass ? "#dde8f0" : "#fff");
    if (sym === "window" || sym === "sliding" || sym === "double") out += line(x + w / 2, y, x + w / 2, y + h, thin);
    else if (sym === "swing") out += rect(x + w * 0.14, y + h * 0.07, w * 0.72, h * 0.86, thin);
    else if (sym === "garage") for (let i = 1; i < 5; i++) out += line(x, y + h * i / 5, x + w, y + h * i / 5, thin);
    return out;
  }

  /* Fachada vista desde un lado del plano. Los muros se pintan de atrás hacia adelante y cada plano tapa
     lo que tiene detrás; los de un mismo plano se funden en un solo contorno. */
  function facadeView(c, side, title) {
    const S = SIDES[side], k = c.k, H = c.s.height, gap = D.finishes.storeyGap, els = [];
    const U = function (p) { return p.x * S.u[0] + p.y * S.u[1]; }, depthOf = function (p) { return p.x * S.d[0] + p.y * S.d[1]; };
    let lo = Infinity, hi = -Infinity, top = 0;
    c.levels.forEach(function (lv, i) {
      const base = i * (H + gap);
      c.sv[i].edges.forEach(function (e) {
        const len = dist(e.a, e.b), dx = (e.b.x - e.a.x) / len, dy = (e.b.y - e.a.y) / len, h = e.thick / 2;
        const pts = [[-h, -h], [len + h, -h], [len + h, h], [-h, h]].map(function (q) { return { x: e.a.x + dx * q[0] - dy * q[1], y: e.a.y + dy * q[0] + dx * q[1] }; });
        const us = pts.map(U), el = { depth: Math.max.apply(null, pts.map(depthOf)), u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), z0: base - (i ? gap : 0), z1: base + H, ops: [] };
        const facing = Math.abs(dx * S.u[0] + dy * S.u[1]), wall = lv.walls.find(function (w) { return w.id === e.wall; });
        if (facing > 0.5 && wall) {
          lv.openings.forEach(function (o) {
            if (o.wall !== e.wall) return;
            const p = P.at(wall, o.t), pos = (p.x - e.a.x) * dx + (p.y - e.a.y) * dy;
            if (pos < 0 || pos > len) return;
            const def = P.typeOf(o), sill = Math.min(def.sill || 0, Math.max(0, H - o.h)), w = o.w * facing;
            el.ops.push({ u: U(p) - w / 2, w: w, z0: base + sill, z1: base + Math.min(H, sill + o.h), def: def, glazed: o.type === "pbalcon" });
          });
        }
        els.push(el);
        lo = Math.min(lo, el.u0); hi = Math.max(hi, el.u1); top = Math.max(top, el.z1);
      });
    });
    if (!els.length) return null;
    P.roofPolys(c.plan).forEach(function (poly) {
      const pts = poly.points.map(function (p) { return [U(p), p.z]; });
      els.push({ depth: Math.max.apply(null, poly.points.map(depthOf)) + (poly.kind === "ext" ? 0 : 0.5), poly: pts, roof: poly.kind !== "ext" });
      pts.forEach(function (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); top = Math.max(top, p[1]); });
    });
    els.sort(function (p, q) { return p.depth - q.depth; });

    const Y = function (z) { return top - z; };
    let out = "", group = [];
    const flush = function () {
      group.forEach(function (el) { out += rect(el.u0, Y(el.z1), el.u1 - el.u0, el.z1 - el.z0, 0.5 * k, "#fff"); });
      group.forEach(function (el) { out += rect(el.u0, Y(el.z1), el.u1 - el.u0, el.z1 - el.z0, 0, "#fff"); });
      group.forEach(function (el) { el.ops.forEach(function (o) { out += openingFace(o, Y, k); }); });
      group = [];
    };
    els.forEach(function (el) {
      if (el.poly) {
        flush();
        out += '<polygon fill="' + (el.roof ? "#e3e3e3" : "#fff") + '" stroke="#111" stroke-width="' + r2(0.25 * k) + '" stroke-linejoin="round" points="' +
          el.poly.map(function (p) { return r2(p[0]) + "," + r2(Y(p[1])); }).join(" ") + '"/>';
        return;
      }
      if (group.length && el.depth - group[0].depth > 1) flush();
      group.push(el);
    });
    flush();
    out += line(lo - 8 * k, Y(0), hi + 20 * k, Y(0), 0.5 * k);
    const marks = [0];
    c.levels.forEach(function (lv, i) { marks.push(i * (H + gap) + H); });
    if (top - marks[marks.length - 1] > 5) marks.push(top);
    marks.forEach(function (z) { out += line(hi + 4 * k, Y(z), hi + 20 * k, Y(z), 0.13 * k) + text(hi + 6 * k, Y(z) - 0.9 * k, level(z), 1.9 * k); });
    return block(title, c, out, { x0: lo - 8 * k, y0: -3 * k, x1: hi + 20 * k, y1: top + 2 * k }, [2, 2, 2, 2]);
  }

  // ---------- Planillas ----------
  // cols: [{ t: título (con \n para dos renglones), w: ancho en mm, a: alineación }]. Devuelve el dibujo en mm.
  function table(cols, rows, note) {
    const head = 9, rh = 5.4, W = cols.reduce(function (sum, col) { return sum + col.w; }, 0), H = head + rows.length * rh;
    let out = rect(0, 0, W, head, 0, "#ececec"), x = 0;
    const cell = function (col, x0, y, s, bold) {
      const a = col.a || "start";
      return text(a === "end" ? x0 + col.w - 1.5 : a === "middle" ? x0 + col.w / 2 : x0 + 1.5, y, s, 2.2, { anchor: a, bold: bold });
    };
    cols.forEach(function (col) {
      const lines = col.t.split("\n");
      lines.forEach(function (s, i) { out += cell(Object.assign({}, col, { a: "middle" }), x, head / 2 + 0.8 + (i - (lines.length - 1) / 2) * 2.9, s, true); });
      rows.forEach(function (row, j) { out += cell(col, x, head + rh * j + 3.6, row[cols.indexOf(col)]); });
      if (x) out += line(x, 0, x, H, 0.13);
      x += col.w;
    });
    for (let j = 0; j <= rows.length; j++) out += line(0, head + rh * j, W, head + rh * j, 0.13);
    out += rect(0, 0, W, H, 0.35);
    (note || []).forEach(function (s, i) { out += text(0, H + 4 + i * 3.2, s, 2); });
    return { svg: out, w: W, h: H + (note ? 2 + note.length * 3.2 : 0) };
  }

  // Vanos de cada local que dan al exterior: los que tienen un ambiente de un solo lado.
  function lightingRows(c) {
    const rows = [], coef = Number(c.doc.coef) > 0 ? Number(c.doc.coef) : DEFAULTS.coef;
    c.levels.forEach(function (lv, i) {
      const v = c.sv[i], lit = {}, vent = {};
      lv.openings.forEach(function (o) {
        const def = P.typeOf(o), wall = lv.walls.find(function (w) { return w.id === o.wall; });
        if (!wall || !(def.group === "window" || o.type === "pbalcon")) return;
        const p = P.at(wall, o.t), len = dist(wall.a, wall.b), off = (v.wallThick[wall.id] || 12) / 2 + 10;
        const nx = -(wall.b.y - wall.a.y) / len * off, ny = (wall.b.x - wall.a.x) / len * off;
        const sides = [{ x: p.x + nx, y: p.y + ny }, { x: p.x - nx, y: p.y - ny }].map(function (q) { return v.rooms.find(function (r) { return P.inside(r.points, q); }); });
        const room = sides[0] && sides[1] ? null : sides[0] || sides[1];
        if (!room) return;
        const area = o.w * Math.min(o.h, c.s.height) / 1e4, opens = VENT[def.symbol];
        lit[room.n] = (lit[room.n] || 0) + area;
        vent[room.n] = (vent[room.n] || 0) + area * (opens === undefined ? 1 : opens);
      });
      v.rooms.forEach(function (r) {
        const need = r.area / coef, have = lit[r.n] || 0, air = vent[r.n] || 0, exempt = SERVICE.test(r.name);
        rows.push(["L" + r.n, (c.levels.length > 1 ? lv.name + " · " : "") + r.name, fix(r.area), exempt ? "—" : "1/" + E.fmt(coef, 0),
          exempt ? "—" : fix(need), fix(have), exempt ? "—" : fix(need / 3), fix(air),
          exempt ? "Según código" : have >= need - 0.005 && air >= need / 3 - 0.005 ? "Cumple" : "No cumple"]);
      });
    });
    return rows;
  }
  function lightingBlock(c) {
    const t = table([{ t: "Local", w: 11 }, { t: "Designación", w: 50 }, { t: "Sup.\n(m²)", w: 16, a: "end" }, { t: "Coef.", w: 12, a: "middle" },
      { t: "Ilum. nec.\n(m²)", w: 18, a: "end" }, { t: "Ilum. proy.\n(m²)", w: 18, a: "end" }, { t: "Vent. nec.\n(m²)", w: 18, a: "end" }, { t: "Vent. proy.\n(m²)", w: 18, a: "end" },
      { t: "Control", w: 24 }], lightingRows(c),
    ["Iluminación necesaria = superficie del local / coeficiente. Ventilación necesaria = 1/3 de la iluminación necesaria.",
      "Ventana corrediza: ventila la mitad del vano. Paño fijo: no ventila. Verificar los coeficientes con el código de edificación local."]);
    return { title: "PLANILLA DE ILUMINACIÓN Y VENTILACIÓN", scale: "", w: t.w, h: t.h, svg: t.svg };
  }
  function balanceBlock(c) {
    const t = table([{ t: "Balance de superficies", w: 62 }, { t: "Valor", w: 30, a: "end" }], balanceRows(c),
      c.lot ? null : ["Cargá las medidas del terreno para calcular superficie libre, FOS y FOT."]);
    return { title: "BALANCE DE SUPERFICIES", scale: "", w: t.w, h: t.h, svg: t.svg };
  }

  // Silueta: el contorno cubierto de cada planta con su superficie, a mitad de escala.
  function outlineBlock(c) {
    const scale = c.doc.scale * 2, k = scale / 10, b = c.box, a = areas(c), step = b.x1 - b.x0 + 14 * k;
    let g = "";
    c.sv.forEach(function (v, i) {
      const dx = step * i;
      v.rooms.forEach(function (r) { g += '<polygon fill="#d6d6d6" points="' + r.points.map(function (p) { return r2(p.x + dx) + "," + r2(p.y); }).join(" ") + '"/>'; });
      v.edges.forEach(function (e) { if (e.cls === "ext") g += line(e.a.x + dx, e.a.y, e.b.x + dx, e.b.y, 0.3 * k); });
      g += text((b.x0 + b.x1) / 2 + dx, b.y1 + 5 * k, c.levels[i].name + ": " + m2(a.cov[i]), 2.2 * k, { anchor: "middle", bold: true });
    });
    return block("SILUETA DE SUPERFICIES", c, g, { x0: b.x0 - 4 * k, y0: b.y0 - 4 * k, x1: b.x0 + step * c.sv.length - 10 * k, y1: b.y1 + 7 * k }, [2, 2, 2, 2], null, scale);
  }

  // Referencias de la instalación eléctrica: cada símbolo usado, con su nombre y cantidad.
  function legendBlock(c) {
    const count = {};
    c.levels.forEach(function (lv) { lv.items.forEach(function (it) { if (D.items[it.type] && D.items[it.type].group === "electricidad") count[it.type] = (count[it.type] || 0) + 1; }); });
    const keys = Object.keys(count);
    if (!keys.length) return null;
    let out = "";
    keys.forEach(function (key, i) {
      const def = D.items[key], f = 3.4 / Math.max(def.w, def.d);
      out += '<g transform="translate(' + r2(3 - def.w * f / 2) + " " + r2(i * 6 + 3 - def.d * f / 2) + ") scale(" + r2(f) + ')">' + P.itemSVG({ type: key, x: def.w / 2, y: def.d / 2, r: 0, w: def.w, d: def.d }, 0.2 / f / 1.5, "") + "</g>" +
        text(8, i * 6 + 3.8, def.label + " (" + count[key] + ")", 2.2);
    });
    out += '<path class="wire" stroke-width="0.18" d="M0.5 ' + (keys.length * 6 + 4) + "q2.5 -3 5 0" + '"/>' + text(8, keys.length * 6 + 3.8, "Cañería embutida", 2.2);
    return { title: "REFERENCIAS", scale: "", w: 60, h: keys.length * 6 + 7, svg: out };
  }

  // ---------- Carátula ----------
  function stamp(c, n, total, scales) {
    const d = c.doc, W = STAMP.w, H = STAMP.h, a = c.plan.name;
    let out = rect(0, 0, W, H, 0.7, "#fff");
    const cell = function (x, y, w, h, label, value, size) {
      return rect(x, y, w, h, 0.25) + text(x + 1.8, y + 3.6, label.toUpperCase(), 1.9) + (value ? text(x + 1.8, y + h - (h - 4) / 2 + (size || 3.4) * 0.35 + 0.4, value, size || 3.4, { bold: true }) : "");
    };
    out += cell(0, 0, 130, 24, "Plano de", String(d.obra || "").toUpperCase(), 7) + cell(130, 0, 45, 24, "Lámina", n + " / " + total, 7) +
      cell(0, 24, 115, 16, "Destino", d.destino) + cell(115, 24, 60, 16, "Escalas", scales) +
      cell(0, 40, W, 16, "Propietario", d.propietario) +
      cell(0, 56, 110, 16, "Ubicación", d.calle) + cell(110, 56, 65, 16, "Localidad", d.localidad);
    [["Circ.", d.circ], ["Sección", d.seccion], ["Manzana", d.manzana], ["Parcela", d.parcela], ["Partida", d.partida]].forEach(function (f, i) {
      out += cell(i * 35, 72, 35, 15, f[0], f[1], 3);
    });
    out += cell(0, 87, 70, 14, "Zonificación", d.zona, 3) + cell(70, 87, 60, 14, "Obra", a || "", 2.6) + cell(130, 87, 45, 14, "Fecha", d.fecha, 3);

    // Croquis de ubicación (sin escala) y balance de superficies.
    out += rect(0, 101, 85, 78, 0.25) + text(1.8, 104.6, "CROQUIS DE UBICACIÓN (SIN ESCALA)", 1.9);
    if (c.lot) {
      const L = c.lot, f = Math.min(60 / (L.x1 - L.x0), 50 / (L.y1 - L.y0)), ox = 42.5 - (L.x0 + L.x1) / 2 * f, oy = 142 - (L.y0 + L.y1) / 2 * f, k = 1 / f;
      let g = rect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0, 0.35 * k);
      c.sv[0].rooms.forEach(function (r) { g += '<polygon fill="#bdbdbd" points="' + r.points.map(function (p) { return r2(p.x) + "," + r2(p.y); }).join(" ") + '"/>'; });
      out += '<g transform="translate(' + r2(ox) + " " + r2(oy) + ") scale(" + f + ')">' + g + "</g>";
      const street = (d.calle || "Calle").replace(/\s+\d+.*$/, ""), cx = 42.5, cy = 142, hw = (L.x1 - L.x0) * f / 2, hh = (L.y1 - L.y0) * f / 2;
      out += d.front === "arriba" ? text(cx, cy - hh - 2, street, 2.4, { anchor: "middle", bold: true }) : d.front === "izquierda" ? text(cx - hw - 2, cy, street, 2.4, { anchor: "middle", bold: true, rot: -90 })
        : d.front === "derecha" ? text(cx + hw + 4, cy, street, 2.4, { anchor: "middle", bold: true, rot: -90 }) : text(cx, cy + hh + 4, street, 2.4, { anchor: "middle", bold: true });
      out += text(1.8, 177, fix(d.lotW) + " × " + fix(d.lotD) + " m", 2.2);
    } else out += text(42.5, 142, "Cargá las medidas del terreno", 2.4, { anchor: "middle" });
    out += north(77, 112, 4, d.north);
    const rows = balanceRows(c), rh = Math.min(8, 72 / rows.length);
    out += rect(85, 101, 90, 78, 0.25) + text(86.8, 104.6, "BALANCE DE SUPERFICIES", 1.9);
    rows.forEach(function (r, i) {
      out += text(86.8, 110.5 + i * rh, r[0], 2.3) + text(173, 110.5 + i * rh, r[1], 2.5, { anchor: "end", bold: true }) + line(85, 112.3 + i * rh, 175, 112.3 + i * rh, 0.09);
    });

    [["Propietario", d.propietario, ""], ["Proyectista", d.proyectista, d.matProyectista], ["Director de obra", d.director, d.matDirector], ["Constructor", d.constructor, d.matConstructor]].forEach(function (s, i) {
      const x = (i % 2) * 87.5, y = 179 + Math.floor(i / 2) * 27;
      out += rect(x, y, 87.5, 27, 0.25) + text(x + 1.8, y + 3.6, s[0].toUpperCase(), 1.9) + line(x + 8, y + 19, x + 79.5, y + 19, 0.13) +
        text(x + 43.75, y + 22.6, s[1] || "Firma y aclaración", 2.3, { anchor: "middle", bold: !!s[1] }) + (s[2] ? text(x + 43.75, y + 25.6, "Mat. " + s[2], 2, { anchor: "middle" }) : "");
    });
    out += rect(0, 233, W, H - 233, 0.25) + text(1.8, 236.6, "OBSERVACIONES Y SELLOS MUNICIPALES", 1.9);
    return out;
  }

  // ---------- Armado de las láminas ----------
  // Ubica los dibujos en filas, de izquierda a derecha, sin pisar la carátula (abajo a la derecha).
  function paginate(blocks, iw, ih, warnings) {
    const pages = [[]], avail = function (bottom) { return bottom > ih - STAMP.h - GAP ? iw - STAMP.w - GAP : iw; };
    let x = 0, y = 0, rowH = 0;
    blocks.forEach(function (b) {
      const bh = b.h + CAPTION, fits = function () { const bottom = y + Math.max(rowH, bh); return bottom <= ih && x + b.w <= avail(bottom); };
      if (!fits()) {
        if (x > 0) { y += rowH + GAP; x = 0; rowH = 0; }
        if (!fits()) {
          if (pages[pages.length - 1].length) pages.push([]);
          x = 0; y = 0; rowH = 0;
          if (!fits()) warnings.push("«" + b.title + "» no entra en la lámina: elegí un formato más grande o una escala más chica.");
        }
      }
      pages[pages.length - 1].push({ b: b, x: x, y: y });
      x += b.w + GAP; rowH = Math.max(rowH, bh);
    });
    return pages;
  }

  function css(c) {
    const p = ".sheet-svg ";
    return p + "{font-family:Arial,Helvetica,sans-serif}" + p + "text{fill:#111;stroke:none}" + p + ".ink{stroke:#111;fill:none}" +
      p + ".wall{stroke:" + c.wall + ";stroke-linecap:square}" + p + ".wall.mute{stroke:#a6a6a6}" + p + ".gap{stroke:#fff}" + p + ".door{fill:none;stroke:#111}" + p + ".window{stroke:#111}" +
      p + ".item{fill:#fff;stroke:#444}" + p + ".item.electric{fill:#fff;stroke:#0a4ea3}" + p + ".wire{fill:none;stroke:#0a4ea3}";
  }

  function build(plan) {
    const doc = Object.assign({}, DEFAULTS, plan.doc || {});
    ["lotW", "lotD", "setFront", "setSide", "north", "coef"].forEach(function (key) { doc[key] = Number(doc[key]) || 0; });
    doc.scale = [50, 100, 200].indexOf(Number(doc.scale)) >= 0 ? Number(doc.scale) : DEFAULTS.scale;
    if (!FORMATS[doc.format]) doc.format = DEFAULTS.format;
    if (!SIDES[doc.front]) doc.front = DEFAULTS.front;
    const c = context(plan, doc), warnings = [];
    if (!c) return { sheets: [], warnings: ["Dibujá al menos un ambiente para armar la documentación."], doc: doc };

    const blocks = [], add = function (b) { if (b) blocks.push(b); };
    c.levels.forEach(function (lv, i) { if (lv.walls.length) add(planView(c, i, "arq")); });
    add(roofView(c));
    c.cuts.forEach(function (cut) { add(sectionView(c, cut)); });
    const f = doc.front, back = { abajo: "arriba", arriba: "abajo", izquierda: "derecha", derecha: "izquierda" }[f];
    add(facadeView(c, f, "FACHADA FRENTE"));
    if (doc.facades !== "frente") add(facadeView(c, back, "CONTRAFRENTE"));
    if (doc.facades === "cuatro") {
      const lateral = Object.keys(SIDES).filter(function (key) { return key !== f && key !== back; });
      const leftFirst = SIDES[lateral[0]].d[0] === -SIDES[f].u[0] && SIDES[lateral[0]].d[1] === -SIDES[f].u[1]; // el que queda a la izquierda mirando el frente
      add(facadeView(c, lateral[leftFirst ? 0 : 1], "FACHADA LATERAL IZQUIERDA"));
      add(facadeView(c, lateral[leftFirst ? 1 : 0], "FACHADA LATERAL DERECHA"));
    }
    const legend = doc.electric ? legendBlock(c) : null;
    if (legend) {
      c.levels.forEach(function (lv, i) { if (lv.walls.length) add(planView(c, i, "elec")); });
      add(legend);
    }
    add(outlineBlock(c));
    add(balanceBlock(c));
    add(lightingBlock(c));

    if (!c.lot) warnings.push("Faltan las medidas del terreno: sin ellas no se calculan la superficie libre, el FOS ni el FOT, y el croquis de ubicación queda vacío.");
    if (!plan.section) warnings.push("Los cortes A–A y B–B se ubicaron solos. Con la herramienta «Línea de corte» elegís por dónde pasa el A–A.");
    const size = FORMATS[doc.format], W = size[0], H = size[1], iw = W - MARGIN.left - MARGIN.other, ih = H - 2 * MARGIN.other;
    const pages = paginate(blocks, iw - 8, ih - 8, warnings), scales = "1:" + doc.scale + " · 1:" + doc.scale * 2, style = css(c);
    const sheets = pages.map(function (page, n) {
      let out = '<svg class="sheet-svg" xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Lámina ' + (n + 1) + " de " + pages.length + '">' +
        "<style>" + style + "</style>" + rect(0, 0, W, H, 0, "#fff") + rect(MARGIN.left, MARGIN.other, iw, ih, 0.7);
      page.forEach(function (it) {
        const x = MARGIN.left + 4 + it.x, y = MARGIN.other + 4 + it.y, b = it.b;
        out += '<g transform="translate(' + r2(x) + " " + r2(y) + ')">' + b.svg + text(0, b.h + 5.2, b.title, 3.4, { bold: true }) +
          (b.scale ? text(0, b.h + 8.6, b.scale, 2.3) : "") + line(0, b.h + 6.2, Math.min(b.w, b.title.length * 2.2 + 6), b.h + 6.2, 0.35) + "</g>";
      });
      out += '<g transform="translate(' + (W - MARGIN.other - STAMP.w) + " " + (H - MARGIN.other - STAMP.h) + ')">' + stamp(c, n + 1, pages.length, scales) + "</g></svg>";
      return { svg: out, w: W, h: H, n: n + 1 };
    });
    return { sheets: sheets, warnings: warnings, doc: doc };
  }

  B.sheets = { DEFAULTS: DEFAULTS, FORMATS: FORMATS, OBRAS: OBRAS, build: build };
})();
