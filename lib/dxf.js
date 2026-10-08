/* CalcuObra — exportación a DXF para seguir el plano en AutoCAD y programas compatibles. Sin DOM.
   Formato R12 (AC1009), ASCII: es el que abre cualquier programa de CAD. Unidad de dibujo = 1 metro.
   El plano se dibuja en cm con la Y hacia abajo; el DXF va en metros con la Y hacia arriba.
   Las plantas se ponen una al lado de la otra, sin cambiar su posición relativa en Y.
   Las cotas son líneas y textos sueltos, no cotas asociativas (R12 las exige con bloques propios). */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const D = B.data, E = B.engine, P = B.plan;

  // [nombre, color ACI, tipo de línea]
  const LAYERS = [["MUROS", 7], ["PUERTAS", 2], ["VENTANAS", 4], ["MUEBLES", 8], ["ELECTRICA", 1], ["CABLEADO", 1, "DASHED"],
    ["EXTERIORES", 3], ["TECHO", 5, "DASHED"], ["TEXTOS", 7], ["COTAS", 6], ["ANOTACIONES", 30]];
  const GAP = 300;          // cm entre una planta y la siguiente
  const DIM = 80, TICK = 8; // cm: separación de la cota general y medio largo de su marca
  const EPS = 0.05;         // cm: tolerancia al recortar los encuentros de muros

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  // Fuera del ASCII, los caracteres van como \U+XXXX, que es lo que entiende un DXF R12.
  const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, function (c) { return "\\U+" + ("000" + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); });

  /* Contorno de los muros: cada tramo macizo es un rectángulo; de sus cuatro lados se quita lo que cae
     dentro de otro tramo, para que las esquinas y los encuentros en T queden limpios. Un lado que
     coincide con el borde de otro tramo se conserva una sola vez (lo dibuja el de menor índice). */
  function outline(rects) {
    const lines = [];
    rects.forEach(function (r, i) {
      const L = dist(r.a, r.b), ux = (r.b.x - r.a.x) / L, uy = (r.b.y - r.a.y) / L;
      r.L = L; r.ux = ux; r.uy = uy;
      const c = function (along, across) { return { x: r.a.x + ux * along - uy * across, y: r.a.y + uy * along + ux * across }; };
      [[c(0, r.h), c(L, r.h)], [c(L, r.h), c(L, -r.h)], [c(L, -r.h), c(0, -r.h)], [c(0, -r.h), c(0, r.h)]].forEach(function (s) { lines.push({ a: s[0], b: s[1], own: i }); });
    });
    const out = [];
    lines.forEach(function (ln) {
      let keep = [[0, 1]];
      rects.forEach(function (r, j) {
        if (j === ln.own || !keep.length) return;
        const grow = j < ln.own ? EPS : -EPS; // borde incluido solo contra los tramos anteriores
        const local = function (p) { return { x: (p.x - r.a.x) * r.ux + (p.y - r.a.y) * r.uy, y: (p.y - r.a.y) * r.ux - (p.x - r.a.x) * r.uy }; };
        const p = local(ln.a), q = local(ln.b), dx = q.x - p.x, dy = q.y - p.y;
        let t0 = 0, t1 = 1;
        const clip = function (den, num) { // Liang–Barsky
          if (Math.abs(den) < 1e-9) return num >= 0;
          const t = num / den;
          if (den < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
          return true;
        };
        if (!(clip(-dx, p.x + grow) && clip(dx, r.L + grow - p.x) && clip(-dy, p.y + r.h + grow) && clip(dy, r.h + grow - p.y)) || t1 <= t0) return;
        const next = [];
        keep.forEach(function (k) {
          if (t0 > k[0]) next.push([k[0], Math.min(k[1], t0)]);
          if (t1 < k[1]) next.push([Math.max(k[0], t1), k[1]]);
        });
        keep = next.filter(function (k) { return k[1] > k[0]; });
      });
      const len = dist(ln.a, ln.b);
      keep.forEach(function (k) {
        if ((k[1] - k[0]) * len > 0.2) out.push([P.at(ln, k[0]), P.at(ln, k[1])]);
      });
    });
    return out;
  }

  function build(plan) {
    const s = P.settingsOf(plan), bricks = P.bricksOf(s), levels = P.levelsOf(plan);
    const ent = [], ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let ox = 0; // corrimiento en X de la planta que se está dibujando
    const n = function (v) { return String(Math.round(v * 1e4) / 1e4); };
    const T = function (p) {
      const x = (p.x + ox) / 100, y = -p.y / 100;
      ext.x0 = Math.min(ext.x0, x); ext.x1 = Math.max(ext.x1, x); ext.y0 = Math.min(ext.y0, y); ext.y1 = Math.max(ext.y1, y);
      return { x: x, y: y };
    };
    const put = function () { for (let i = 0; i < arguments.length; i += 2) ent.push(arguments[i], arguments[i + 1]); };
    const line = function (layer, a, b, dashed) {
      const p = T(a), q = T(b);
      put(0, "LINE", 8, layer);
      if (dashed) put(6, "DASHED");
      put(10, n(p.x), 20, n(p.y), 11, n(q.x), 21, n(q.y));
    };
    const poly = function (layer, points, closed, dashed) {
      put(0, "POLYLINE", 8, layer);
      if (dashed) put(6, "DASHED");
      put(66, 1, 70, closed ? 1 : 0);
      points.forEach(function (pt) { const p = T(pt); put(0, "VERTEX", 8, layer, 10, n(p.x), 20, n(p.y)); });
      put(0, "SEQEND", 8, layer);
    };
    const circle = function (layer, c, r) { const p = T(c); put(0, "CIRCLE", 8, layer, 10, n(p.x), 20, n(p.y), 40, n(r / 100)); };
    // Arco de 90° o menos con centro en c, entre los puntos p y q (los arcos del DXF giran en sentido antihorario).
    const arc = function (layer, c, p, q) {
      const o = T(c), a = T(p), b = T(q), deg = function (v) { return Math.atan2(v.y - o.y, v.x - o.x) * 180 / Math.PI; };
      let a0 = deg(a), a1 = deg(b);
      if ((((a1 - a0) % 360) + 360) % 360 > 180) { const swap = a0; a0 = a1; a1 = swap; }
      put(0, "ARC", 8, layer, 10, n(o.x), 20, n(o.y), 40, n(dist(c, p) / 100), 50, n((a0 + 360) % 360), 51, n((a1 + 360) % 360));
    };
    const text = function (layer, at, height, str, turn) {
      const p = T(at);
      put(0, "TEXT", 8, layer, 10, n(p.x), 20, n(p.y), 40, n(height / 100), 1, ascii(str));
      if (turn) put(50, turn);
      put(72, 1, 11, n(p.x), 21, n(p.y)); // centrado en el punto
    };

    // Todas las plantas comparten el mismo paso en X, así quedan alineadas entre sí.
    const xs = [];
    levels.forEach(function (lv) {
      lv.walls.forEach(function (w) { xs.push(w.a.x, w.b.x); });
      lv.surfaces.forEach(function (sf) { xs.push(sf.x, sf.x + sf.w); });
    });
    const pitch = xs.length ? Math.max.apply(null, xs) - Math.min.apply(null, xs) + GAP + 2 * DIM + 2 * D.finishes.eave : 0;
    const roof = P.roofShape(plan);

    levels.forEach(function (level, index) {
      ox = index * pitch;
      const v = P.survey(level, s, bricks), rects = [], box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

      // Muros: cada arista se parte en tramos macizos entre sus aberturas.
      v.edges.forEach(function (e) {
        const len = dist(e.a, e.b), wall = level.walls.find(function (w) { return w.id === e.wall; }), cuts = [];
        if (len < 0.5) return;
        level.openings.forEach(function (o) {
          if (o.wall !== e.wall) return;
          const c = P.at(wall, o.t), pos = ((c.x - e.a.x) * (e.b.x - e.a.x) + (c.y - e.a.y) * (e.b.y - e.a.y)) / len;
          if (pos < 0 || pos > len) return;
          cuts.push({ from: Math.max(0, pos - o.w / 2), to: Math.min(len, pos + o.w / 2) });
        });
        cuts.sort(function (p, q) { return p.from - q.from; });
        // Los tramos que llegan a un extremo se alargan medio espesor para cerrar las esquinas.
        const piece = function (from, to) {
          if (to - from < 0.5) return;
          const f = from === 0 ? -e.thick / 2 : from, t = to === len ? len + e.thick / 2 : to;
          rects.push({ a: P.at(e, f / len), b: P.at(e, t / len), h: e.thick / 2 });
        };
        let pos = 0;
        cuts.forEach(function (c) { piece(pos, c.from); pos = Math.max(pos, c.to); });
        piece(pos, len);
      });
      outline(rects).forEach(function (seg) {
        line("MUROS", seg[0], seg[1]);
        seg.forEach(function (p) { box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y); });
      });

      // Aberturas: mismo símbolo que en la planta del editor.
      level.openings.forEach(function (o) {
        const wall = level.walls.find(function (w) { return w.id === o.wall; });
        if (!wall) return;
        const def = P.typeOf(o), wlen = dist(wall.a, wall.b), half = Math.min(o.w, wlen) / 2 / wlen, thick = v.wallThick[wall.id] || 12;
        const p0 = P.at(wall, o.t - half), p1 = P.at(wall, o.t + half), W = dist(p0, p1);
        if (W < 0.5) return;
        const dx = (p1.x - p0.x) / W, dy = (p1.y - p0.y) / W, side = o.side ? -1 : 1, nx = -dy * side, ny = dx * side;
        const off = function (along, across) { return { x: p0.x + dx * along + nx * across, y: p0.y + dy * along + ny * across }; };
        const layer = def.group === "window" ? "VENTANAS" : "PUERTAS", q = thick / 5;
        const leaf = function (hinge, other, len) { // hoja abierta a 90° y el arco que barre
          const tip = { x: hinge.x + nx * len, y: hinge.y + ny * len };
          line(layer, hinge, tip);
          arc(layer, hinge, tip, other);
        };
        const faces = function () { line(layer, off(0, thick / 2), off(W, thick / 2)); line(layer, off(0, -thick / 2), off(W, -thick / 2)); };
        switch (def.symbol) {
          case "swing": if (o.hinge) leaf(p1, p0, W); else leaf(p0, p1, W); break;
          case "double": leaf(p0, off(W / 2, 0), W / 2); leaf(p1, off(W / 2, 0), W / 2); break;
          case "sliding": line(layer, off(0, q), off(W * 0.56, q)); line(layer, off(W * 0.44, -q), off(W, -q)); break;
          case "garage": poly(layer, [p0, off(0, W * 0.4), off(W, W * 0.4), p1], false, true); break;
          case "open": line(layer, p0, p1, true); break;
          case "fixed": faces(); line(layer, off(0, q), off(W, q)); line(layer, off(0, -q), off(W, -q)); break;
          default: faces(); line(layer, p0, p1);
        }
      });

      // Muebles, artefactos y bocas: las primitivas de la biblioteca, giradas alrededor del centro del objeto.
      level.items.forEach(function (it) {
        const def = D.items[it.type];
        if (!def) return;
        const layer = def.group === "electricidad" ? "ELECTRICA" : "MUEBLES", w = it.w, d = it.d;
        const a = (it.r || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        const G = function (lx, ly) { const x = lx - w / 2, y = ly - d / 2; return { x: it.x + x * cos - y * sin, y: it.y + x * sin + y * cos }; };
        const rect = function (x, y, rw, rh) { poly(layer, [G(x, y), G(x + rw, y), G(x + rw, y + rh), G(x, y + rh)], true); };
        if (def.shape === "stair") { // peldaños cada ~27 cm y flecha de subida
          const steps = Math.max(2, Math.round(d / 27));
          rect(0, 0, w, d);
          for (let i = 1; i < steps; i++) line(layer, G(0, d * i / steps), G(w, d * i / steps));
          line(layer, G(w / 2, d * 0.92), G(w / 2, d * 0.08));
          poly(layer, [G(w * 0.35, d * 0.08 + w * 0.15), G(w / 2, d * 0.08), G(w * 0.65, d * 0.08 + w * 0.15)], false);
          return;
        }
        if (def.custom && it.name) text(layer, it, P.itemNameSize(it) * 0.7, it.name);
        P.itemDraw(it, def).forEach(function (p) {
          if (p[0] === "r") rect(p[1] * w, p[2] * d, p[3] * w, p[4] * d);
          else if (p[0] === "l") line(layer, G(p[1] * w, p[2] * d), G(p[3] * w, p[4] * d));
          else if (Math.abs(p[3] * w - p[4] * d) < 0.5) circle(layer, G(p[1] * w, p[2] * d), p[3] * w);
          else { // R12 no tiene elipses: polígono de 24 lados
            const ring = [];
            for (let i = 0; i < 24; i++) ring.push(G(p[1] * w + p[3] * w * Math.cos(i * Math.PI / 12), p[2] * d + p[4] * d * Math.sin(i * Math.PI / 12)));
            poly(layer, ring, true);
          }
        });
      });
      level.wires.forEach(function (wire) {
        const ends = [wire.a, wire.b].map(function (id) { return level.items.find(function (it) { return it.id === id; }); });
        if (ends[0] && ends[1]) line("CABLEADO", ends[0], ends[1]);
      });

      level.surfaces.forEach(function (sf) {
        poly("EXTERIORES", [{ x: sf.x, y: sf.y }, { x: sf.x + sf.w, y: sf.y }, { x: sf.x + sf.w, y: sf.y + sf.h }, { x: sf.x, y: sf.y + sf.h }], true);
        text("EXTERIORES", { x: sf.x + sf.w / 2, y: sf.y + sf.h / 2 }, 15, (D.surfaces[sf.type] || D.surfaces.patio).label);
      });
      if (roof && index === levels.length - 1) {
        poly("TECHO", [{ x: roof.x0, y: roof.y0 }, { x: roof.x1, y: roof.y0 }, { x: roof.x1, y: roof.y1 }, { x: roof.x0, y: roof.y1 }], true);
      }
      v.rooms.forEach(function (r) {
        text("TEXTOS", { x: r.cx, y: r.cy - 6 }, 18, r.name);
        text("TEXTOS", { x: r.cx, y: r.cy + 20 }, 13, E.fmt(r.area, 1) + " m²");
      });

      // Anotaciones: los mismos trazos que en pantalla, como polilíneas, y las notas como texto.
      level.notes.forEach(function (note) {
        P.notePolys(note).forEach(function (points) { if (points.length > 1) poly("ANOTACIONES", points, false); });
        if (note.kind === "text") text("ANOTACIONES", note.pts[0], P.noteSize(note) * 0.7, note.text || "");
      });

      // Cotas generales, a filo exterior de los muros, y el nombre de la planta.
      if (box.x0 === Infinity) return;
      // La línea de cota se aleja lo necesario para no pisar veredas, patios ni el alero del techo.
      let left = box.x0, bottom = box.y1;
      level.surfaces.forEach(function (sf) { left = Math.min(left, sf.x); bottom = Math.max(bottom, sf.y + sf.h); });
      if (roof && index === levels.length - 1) { left = Math.min(left, roof.x0); bottom = Math.max(bottom, roof.y1); }
      const dimension = function (a, b, away, gap, turn) { // away: hacia dónde se aleja la línea de cota; gap: cuánto
        const p = { x: a.x + away.x * gap, y: a.y + away.y * gap }, q = { x: b.x + away.x * gap, y: b.y + away.y * gap };
        line("COTAS", p, q);
        [[a, p], [b, q]].forEach(function (pair) {
          line("COTAS", { x: pair[0].x + away.x * 15, y: pair[0].y + away.y * 15 }, { x: pair[1].x + away.x * 15, y: pair[1].y + away.y * 15 });
          line("COTAS", { x: pair[1].x - TICK, y: pair[1].y + TICK }, { x: pair[1].x + TICK, y: pair[1].y - TICK });
        });
        text("COTAS", { x: (p.x + q.x) / 2 + away.x * 8 * (turn ? 1 : 0), y: (p.y + q.y) / 2 - (turn ? 0 : 8) }, 15, E.fmt(dist(a, b) / 100, 2), turn);
      };
      dimension({ x: box.x0, y: box.y1 }, { x: box.x1, y: box.y1 }, { x: 0, y: 1 }, bottom - box.y1 + DIM);
      dimension({ x: box.x0, y: box.y0 }, { x: box.x0, y: box.y1 }, { x: -1, y: 0 }, box.x0 - left + DIM, 90);
      text("TEXTOS", { x: (box.x0 + box.x1) / 2, y: bottom + DIM + 70 }, 25, level.name.toUpperCase());
    });

    const head = [0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSBASE", 10, 0, 20, 0, 30, 0];
    if (ext.x0 !== Infinity) head.push(9, "$EXTMIN", 10, n(ext.x0), 20, n(ext.y0), 9, "$EXTMAX", 10, n(ext.x1), 20, n(ext.y1));
    head.push(0, "ENDSEC", 0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LTYPE", 70, 2,
      0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0,
      0, "LTYPE", 2, "DASHED", 70, 0, 3, "__ __ __ __", 72, 65, 73, 2, 40, 0.3, 49, 0.2, 49, -0.1,
      0, "ENDTAB", 0, "TABLE", 2, "LAYER", 70, LAYERS.length);
    LAYERS.forEach(function (l) { head.push(0, "LAYER", 2, l[0], 70, 0, 62, l[1], 6, l[2] || "CONTINUOUS"); });
    head.push(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
    return [999, "CalcuObra - unidad de dibujo: 1 metro"].concat(head, ent, [0, "ENDSEC", 0, "EOF"]).join("\r\n") + "\r\n";
  }

  B.dxf = { build: build, layers: LAYERS.map(function (l) { return l[0]; }) };
})();
