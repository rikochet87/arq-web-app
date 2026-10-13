/* CalcuObra — lectura de planos de AutoCAD (DXF de texto) y conversión a un plano del diseñador. Sin DOM.
   read(texto) aplana el dibujo: líneas, arcos y textos del espacio modelo, con los bloques ya insertados.
   toPlan(dibujo, opciones) busca los muros entre las líneas de las capas elegidas:
     1. dos líneas paralelas a 6,5–45 cm son las dos caras de un muro; su eje va por el medio;
     2. un corte en el eje es el encuentro con otro muro (corto) o una abertura (60 cm o más);
     3. la abertura es puerta si tiene al lado el arco de la hoja, ventana si la cruzan dos o más líneas, y vano si no;
     4. los extremos se llevan al eje del muro con el que se encuentran, para cerrar esquinas y encuentros en T.
   Si casi nada forma pares, el dibujo es de una sola línea por muro y se toman las líneas como ejes.
   No se leen DWG (formato cerrado) ni DXF binarios. Los muros curvos se ignoran. */
(function () {
  "use strict";

  const B = window.__BRAND__ || (window.__BRAND__ = {});
  const D = B.data, P = B.plan;

  const TMIN = 6.5, TMAX = 45;         // cm: espesores que se aceptan entre las dos caras de un muro
  const BRIDGE = 50;                   // cm: un corte más corto es el encuentro con otro muro, no una abertura
  const GAP_MAX = 420, BARE_MAX = 130; // cm: abertura más ancha, y la más ancha que se acepta sin ningún símbolo dibujado
  const SINGLE = 15;                   // cm: espesor que se supone en un dibujo de una sola línea
  const UNITS = { 4: 0.1, 5: 1, 6: 100 }; // $INSUNITS → cm por unidad de dibujo
  const WALL = /mur|pared|wall|mamp|tabiq|ladr/i;
  const OTHER = /cot|dim|te?xt|eje|axis|mueb|mobil|furn|equip|sanit|elec|hatch|ray|carp|puert|door|vent|wind|abert|veg|arbol|nivel|titul|rotul|defpoints|viewport|plot|pisos?|solad/i;
  const GLAZED = /vent|wind|carp|abert|vidri|glass|glaz/i;
  const ROOM = /living|estar|comedor|cocina|dorm|ba[ñn]o|toilet|lavadero|pasillo|paso|hall|garage|cochera|galer|estudio|escritorio|vestidor|quincho|dep[oó]sito/i;
  // Ladrillo según el espesor dibujado, que incluye unos 2,5 cm de revoque.
  const BRICKS = ["hueco8", "portante12", "portante18", "comun30"];
  const RAD = Math.PI / 180;

  function fail(code) { const e = new Error(code); e.code = code; return e; }
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  // ---------- Lectura ----------
  function cleanText(t) {
    return String(t || "").replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\P/g, "\n").replace(/\\[A-Za-z][^;\\]*;/g, "").replace(/\\[LlOoKk]/g, "").replace(/[{}]/g, "").replace(/%%[a-z]/gi, "").replace(/[ \t]+/g, " ").trim(); // \P separa renglones
  }

  function read(text) {
    if (/^AC1\d{3}/.test(text)) throw fail("dwg");
    if (text.slice(0, 18) === "AutoCAD Binary DXF") throw fail("binary");
    // El archivo es una lista de pares (código, valor), uno por línea; cada código 0 empieza un registro.
    const lines = text.split(/\r\n|\r|\n/), recs = [];
    let cur = null;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i], 10), value = lines[i + 1].trim();
      if (code === 0) { cur = { type: value.toUpperCase(), g: {}, v: [] }; recs.push(cur); }
      else if (cur) { cur.v.push([code, value]); if (!(code in cur.g)) cur.g[code] = value; }
    }
    if (!recs.some(function (r) { return r.type === "SECTION"; })) throw fail("format");

    // Con el eje Z de la entidad hacia abajo (230 = -1) sus coordenadas vienen espejadas en X.
    function entity(r) {
      const g = r.g, flip = num(g[230]) < 0 ? -1 : 1, e = { layer: g[8] || "0" };
      switch (r.type) {
        case "LINE": e.t = "P"; e.pts = [{ x: num(g[10]), y: num(g[20]) }, { x: num(g[11]), y: num(g[21]) }]; return e;
        case "LWPOLYLINE":
          e.t = "P"; e.pts = []; e.closed = (num(g[70]) & 1) === 1;
          r.v.forEach(function (p) {
            const last = e.pts[e.pts.length - 1];
            if (p[0] === 10) e.pts.push({ x: num(p[1]) * flip, y: 0, bulge: 0 });
            else if (last && p[0] === 20) last.y = num(p[1]);
            else if (last && p[0] === 42) last.bulge = num(p[1]) * flip;
          });
          return e;
        case "POLYLINE": // sus vértices llegan en los registros VERTEX que siguen
          if (num(g[70]) & 80) return null; // mallas 3D
          e.t = "P"; e.pts = []; e.closed = (num(g[70]) & 1) === 1; e.flip = flip; return e;
        case "ARC": {
          const r0 = num(g[40]), at = function (deg) { return { x: flip * (num(g[10]) + r0 * Math.cos(deg * RAD)), y: num(g[20]) + r0 * Math.sin(deg * RAD) }; };
          e.t = "A"; e.c = { x: flip * num(g[10]), y: num(g[20]) }; e.r = r0; e.p = at(num(g[50])); e.q = at(num(g[51])); return e;
        }
        case "INSERT":
          e.t = "I"; e.name = g[2]; e.x = flip * num(g[10]); e.y = num(g[20]); e.rot = num(g[50]) * flip;
          e.sx = (g[41] === undefined ? 1 : num(g[41])) * flip; e.sy = g[42] === undefined ? 1 : num(g[42]); return e;
        case "TEXT": case "MTEXT":
          e.t = "T"; e.x = num(g[10]); e.y = num(g[20]);
          e.text = cleanText(r.v.filter(function (p) { return p[0] === 3; }).map(function (p) { return p[1]; }).join("") + (g[1] || ""));
          return e.text ? e : null;
      }
      return null;
    }

    const blocks = {}, top = [], off = {};
    let section = "", block = null, poly = null, units = 0;
    recs.forEach(function (r) {
      if (r.type === "SECTION") {
        section = String(r.g[2] || "").toUpperCase();
        if (section === "HEADER") r.v.forEach(function (p, i) { if (p[0] === 9 && p[1].toUpperCase() === "$INSUNITS" && r.v[i + 1]) units = UNITS[parseInt(r.v[i + 1][1], 10)] || 0; });
        return;
      }
      if (r.type === "ENDSEC") { section = ""; return; }
      if (section === "TABLES") { // capa apagada (color negativo) o congelada
        if (r.type === "LAYER" && r.g[2] && (num(r.g[62]) < 0 || (num(r.g[70]) & 1))) off[r.g[2]] = true;
        return;
      }
      if (section === "BLOCKS") {
        if (r.type === "BLOCK") { block = { x: num(r.g[10]), y: num(r.g[20]), ents: [] }; blocks[r.g[2]] = block; return; }
        if (r.type === "ENDBLK") { block = null; return; }
      } else if (section !== "ENTITIES") return;
      const into = section === "BLOCKS" ? block && block.ents : top;
      if (!into) return;
      if (r.type === "VERTEX") { if (poly) poly.pts.push({ x: num(r.g[10]) * poly.flip, y: num(r.g[20]), bulge: num(r.g[42]) * poly.flip }); return; }
      poly = null;
      if (r.type === "SEQEND" || r.g[67] === "1") return; // 67 = 1: espacio papel
      const e = entity(r);
      if (!e) return;
      into.push(e);
      if (r.type === "POLYLINE") poly = e;
    });

    // Aplanado: cada bloque insertado se dibuja con su posición, giro y escala. m = [a, b, c, d, e, f]: x' = a·x + c·y + e.
    const segs = [], arcs = [], texts = [], count = {};
    function emit(ents, m, inherit, depth) {
      const T = function (p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; };
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      ents.forEach(function (e) {
        const layer = e.layer === "0" && inherit ? inherit : e.layer; // la capa 0 de un bloque toma la de su inserción
        if (e.t === "P") {
          const n = e.pts.length;
          for (let i = 0; i < n - (e.closed ? 0 : 1); i++) {
            const a = e.pts[i], b = e.pts[(i + 1) % n], p = T(a), q = T(b), len = Math.hypot(b.x - a.x, b.y - a.y);
            if (a.bulge && len > 0) { // tramo en arco: bulge = tangente de un cuarto del ángulo
              const d = len / 2 * (1 - a.bulge * a.bulge) / (2 * a.bulge);
              arcs.push({ c: T({ x: (a.x + b.x) / 2 - (b.y - a.y) / len * d, y: (a.y + b.y) / 2 + (b.x - a.x) / len * d }), r: len * (1 + a.bulge * a.bulge) / (4 * Math.abs(a.bulge)) * scale, p: p, q: q, layer: layer });
            } else segs.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, layer: layer });
            count[layer] = (count[layer] || 0) + 1;
          }
        } else if (e.t === "A") arcs.push({ c: T(e.c), r: e.r * scale, p: T(e.p), q: T(e.q), layer: layer });
        else if (e.t === "T") { const p = T(e); texts.push({ x: p.x, y: p.y, text: e.text, layer: layer }); }
        else if (e.t === "I") {
          const blk = blocks[e.name];
          if (!blk || depth > 8) return;
          const cos = Math.cos(e.rot * RAD), sin = Math.sin(e.rot * RAD);
          const a = cos * e.sx, b = sin * e.sx, c = -sin * e.sy, d = cos * e.sy, x = e.x - (a * blk.x + c * blk.y), y = e.y - (b * blk.x + d * blk.y);
          emit(blk.ents, [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]], layer, depth + 1);
        }
      });
    }
    emit(top, [1, 0, 0, 1, 0, 0], "", 0);
    if (!segs.length) throw fail("empty");
    const layers = Object.keys(count).sort(function (p, q) { return p.localeCompare(q); }).map(function (name) { return { name: name, count: count[name], off: !!off[name] }; });
    return { units: units, layers: layers, segs: segs, arcs: arcs, texts: texts };
  }

  // Capas que parecen de muros: por nombre; si ninguna se llama así, todas menos las que se sabe que son otra cosa.
  function wallLayers(drawing) {
    const on = drawing.layers.filter(function (l) { return !l.off; });
    const named = on.filter(function (l) { return WALL.test(l.name) && !OTHER.test(l.name); });
    return (named.length ? named : on.filter(function (l) { return !OTHER.test(l.name); })).map(function (l) { return l.name; });
  }

  // ---------- Caras de muro ----------
  const overlap = function (p, q) { // tramos comunes a dos listas de intervalos
    const out = [];
    p.forEach(function (a) { q.forEach(function (b) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi > lo) out.push([lo, hi]); }); });
    return out;
  };
  const without = function (list, cut) {
    const out = [];
    list.forEach(function (a) {
      if (cut[0] > a[0]) out.push([a[0], Math.min(a[1], cut[0])]);
      if (cut[1] < a[1]) out.push([Math.max(a[0], cut[1]), a[1]]);
    });
    return out.filter(function (a) { return a[1] > a[0]; });
  };

  /* f = cm por unidad de dibujo. Pasa a cm con la Y hacia abajo, agrupa las líneas por dirección y, en cada una,
     arma pares de caras. Cada línea se mide por "c" (distancia de su recta al origen) y va de "a" hasta "b" a lo largo.
     Cada tramo de una línea es cara de un solo muro: los pares se toman del más largo al más corto. */
  function pairFaces(segs, f) {
    const list = [], dirs = [];
    let total = 0, paired = 0;
    segs.forEach(function (s) {
      const x1 = s.x1 * f, y1 = -s.y1 * f, x2 = s.x2 * f, y2 = -s.y2 * f, len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 2) return;
      let ang = Math.atan2(y2 - y1, x2 - x1);
      if (ang < 0) ang += Math.PI;
      if (ang > Math.PI - 0.01) ang -= Math.PI;
      list.push({ x1: x1, y1: y1, x2: x2, y2: y2, len: len, ang: ang });
    });
    list.sort(function (p, q) { return p.ang - q.ang; });
    for (let i = 0; i < list.length;) {
      let j = i, sum = 0, weight = 0;
      while (j < list.length && list[j].ang - list[i].ang <= 0.014) { sum += list[j].ang * list[j].len; weight += list[j].len; j++; }
      let ang = sum / weight;
      if (Math.abs(ang) < 0.012) ang = 0; // casi horizontal o casi vertical: derecha
      const upright = Math.abs(ang - Math.PI / 2) < 0.012, ux = upright ? 0 : Math.cos(ang), uy = upright ? 1 : Math.sin(ang);

      // Líneas de la dirección, con las que caen sobre una misma recta y se continúan unidas en una sola.
      const raw = list.slice(i, j).map(function (s) {
        const a = s.x1 * ux + s.y1 * uy, b = s.x2 * ux + s.y2 * uy;
        return { c: ((s.y1 + s.y2) * ux - (s.x1 + s.x2) * uy) / 2, a: Math.min(a, b), b: Math.max(a, b) };
      }).sort(function (p, q) { return p.c - q.c; });
      const lines = [];
      for (let k = 0; k < raw.length;) {
        let m = k;
        while (m < raw.length && raw[m].c - raw[k].c <= 0.6) m++;
        const group = raw.slice(k, m).sort(function (p, q) { return p.a - q.a; });
        const c = group.reduce(function (t, g) { return t + g.c; }, 0) / group.length;
        let line = { c: c, a: group[0].a, b: group[0].b };
        for (let g = 1; g < group.length; g++) {
          if (group[g].a <= line.b + 0.6) line.b = Math.max(line.b, group[g].b);
          else { lines.push(line); line = { c: c, a: group[g].a, b: group[g].b }; }
        }
        lines.push(line);
        k = m;
      }
      lines.sort(function (p, q) { return p.c - q.c; });
      lines.forEach(function (l) { l.free = [[l.a, l.b]]; total += l.b - l.a; });

      const cands = [], dir = { ux: ux, uy: uy, pieces: [], singles: lines.filter(function (l) { return l.b - l.a >= 30; }).map(function (l) { return { c: l.c, a: l.a, b: l.b, thick: 0 }; }) };
      for (let p = 0; p < lines.length; p++) {
        for (let q = p + 1; q < lines.length && lines[q].c - lines[p].c <= TMAX; q++) {
          const d = lines[q].c - lines[p].c, ov = Math.min(lines[p].b, lines[q].b) - Math.max(lines[p].a, lines[q].a);
          if (d >= TMIN && ov >= 4) cands.push([p, q, d, ov]);
        }
      }
      cands.sort(function (p, q) { return q[3] - p[3] || p[2] - q[2]; });
      cands.forEach(function (k) {
        const one = lines[k[0]], two = lines[k[1]];
        overlap(one.free, two.free).forEach(function (iv) {
          if (iv[1] - iv[0] < 4) return;
          dir.pieces.push({ c: (one.c + two.c) / 2, a: iv[0], b: iv[1], thick: k[2] });
          paired += iv[1] - iv[0];
          one.free = without(one.free, iv); two.free = without(two.free, iv);
        });
      });
      dirs.push(dir);
      i = j;
    }
    return { f: f, dirs: dirs, total: total, paired: paired };
  }

  /* Unidad del dibujo: la que hace aparecer muros. Probando de la más grande a la más chica se evita
     tomar por muros de 30 cm los ambientes de 3 m de un dibujo en centímetros leído como milímetros. */
  function fitUnit(drawing, segs) {
    const runs = [100, 1, 0.1].map(function (f) { return pairFaces(segs, f); });
    const best = Math.max.apply(null, runs.map(function (r) { return r.paired / r.f; }));
    if (best > 0) return runs.find(function (r) { return r.paired / r.f >= best * 0.6; });
    if (drawing.units) return runs.find(function (r) { return r.f === drawing.units; }) || pairFaces(segs, drawing.units);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; // sin pares ni unidad declarada: por el tamaño del dibujo
    segs.forEach(function (s) { x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2); });
    const size = Math.hypot(x1 - x0, y1 - y0);
    return runs[size < 150 ? 0 : size < 6000 ? 1 : 2];
  }

  // ---------- Del dibujo al plano ----------
  /* opts: layers (nombres de las capas de muros), unit (cm por unidad; 0 = automática), group (cuál de los dibujos del archivo).
     Devuelve { plan, groups: [{w, h (m), walls}], group, unit, single, layers, stats: {walls, doors, windows, opens} }. */
  function toPlan(drawing, opts) {
    opts = opts || {};
    const names = opts.layers || wallLayers(drawing), wallSegs = drawing.segs.filter(function (s) { return names.indexOf(s.layer) >= 0; });
    if (!wallSegs.length) throw fail("nowalls");
    const run = opts.unit ? pairFaces(wallSegs, opts.unit) : fitUnit(drawing, wallSegs);
    const f = run.f, single = run.paired * 2 < run.total * 0.3;
    const cm = function (p) { return { x: p.x * f, y: -p.y * f }; };
    const marks = drawing.segs.map(function (s) { return { x1: s.x1 * f, y1: -s.y1 * f, x2: s.x2 * f, y2: -s.y2 * f, layer: s.layer }; });
    const swings = drawing.arcs.map(function (a) { return { c: cm(a.c), r: a.r * f, p: cm(a.p), q: cm(a.q) }; });

    const walls = [];
    run.dirs.forEach(function (dir) {
      const ux = dir.ux, uy = dir.uy, pieces = (single ? dir.singles : dir.pieces).sort(function (p, q) { return p.c - q.c; });
      const along = function (p) { return p.x * ux + p.y * uy; }, across = function (p) { return p.y * ux - p.x * uy; };
      const world = function (s, c) { return { x: ux * s - uy * c, y: uy * s + ux * c }; };

      // ¿Qué hay dibujado en el corte que va de "from" a "to" sobre el eje c?
      function opening(c, thick, from, to) {
        const gap = to - from, half = (thick || SINGLE) / 2;
        let leaves = 0, door = null;
        swings.forEach(function (arc) {
          const s = along(arc.c), nearFrom = Math.abs(s - from) <= 15, nearTo = Math.abs(s - to) <= 15;
          if (Math.abs(across(arc.c) - c) > half + 12 || !(nearFrom || nearTo)) return;
          if (arc.r >= gap * 0.4 && arc.r <= gap * 0.6) leaves++;
          if (arc.r < gap * 0.75 || arc.r > gap * 1.25) return;
          const tip = Math.abs(across(arc.p) - c) > Math.abs(across(arc.q) - c) ? arc.p : arc.q; // punta de la hoja abierta
          door = { kind: "door", hingeTo: !nearFrom || (nearTo && Math.abs(s - to) < Math.abs(s - from)), sign: across(tip) - c };
        });
        if (door) return door;
        if (leaves >= 2) return { kind: "double" };
        let crossing = 0, glazed = false;
        marks.forEach(function (m) {
          const c1 = m.y1 * ux - m.x1 * uy - c, c2 = m.y2 * ux - m.x2 * uy - c;
          if (Math.abs(c1) > half + 3 || Math.abs(c2) > half + 3 || Math.abs(c1 - c2) > 2) return;
          const a = m.x1 * ux + m.y1 * uy, b = m.x2 * ux + m.y2 * uy;
          if (Math.min(Math.max(a, b), to) - Math.max(Math.min(a, b), from) < gap * 0.5) return;
          crossing++;
          if (GLAZED.test(m.layer)) glazed = true;
        });
        if (crossing >= 2 || glazed) return { kind: "window" };
        return crossing || gap <= BARE_MAX ? { kind: "open" } : null; // una sola línea es el umbral de un vano
      }

      for (let i = 0; i < pieces.length;) {
        let j = i, weight = 0, moment = 0;
        const byThick = {};
        while (j < pieces.length && pieces[j].c - pieces[i].c <= 4) {
          const len = pieces[j].b - pieces[j].a, t = Math.round(pieces[j].thick);
          weight += len; moment += len * pieces[j].c; byThick[t] = (byThick[t] || 0) + len; j++;
        }
        const c = moment / weight, thick = Number(Object.keys(byThick).sort(function (p, q) { return byThick[q] - byThick[p]; })[0]);
        const group = pieces.slice(i, j).sort(function (p, q) { return p.a - q.a; });
        let cur = { a: group[0].a, b: group[0].b, openings: [] };
        const close = function () {
          walls.push({ a: world(cur.a, c), b: world(cur.b, c), ux: ux, uy: uy, thick: thick, openings: cur.openings.map(function (o) {
            const at = world((o.from + o.to) / 2, c);
            return { kind: o.kind, x: at.x, y: at.y, w: o.to - o.from, hingeTo: o.hingeTo, sign: o.sign };
          }) });
        };
        for (let k = 1; k < group.length; k++) {
          const gap = group[k].a - cur.b, found = gap >= BRIDGE && gap <= GAP_MAX ? opening(c, thick, cur.b, group[k].a) : null;
          if (found) cur.openings.push(Object.assign(found, { from: cur.b, to: group[k].a }));
          else if (gap >= BRIDGE) { close(); cur = { a: group[k].a, b: group[k].b, openings: [] }; continue; }
          cur.b = Math.max(cur.b, group[k].b);
        }
        close();
        i = j;
      }
    });

    // Esquinas y encuentros en T: cada extremo va hasta el eje del muro no paralelo más cercano que lo recibe.
    const moves = [];
    walls.forEach(function (w, i) {
      ["a", "b"].forEach(function (end) {
        const E = w[end];
        let best = null;
        walls.forEach(function (o, j) {
          const den = w.ux * o.uy - w.uy * o.ux;
          if (j === i || Math.abs(den) < 0.2) return;
          const t = ((o.a.x - E.x) * o.uy - (o.a.y - E.y) * o.ux) / den, X = { x: E.x + w.ux * t, y: E.y + w.uy * t };
          const s = (X.x - o.a.x) * o.ux + (X.y - o.a.y) * o.uy, reach = ((w.thick || SINGLE) + (o.thick || SINGLE)) / 2 + 6;
          if (Math.abs(t) <= reach && s >= -reach && s <= Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) + reach && (!best || Math.abs(t) < best.d)) best = { d: Math.abs(t), X: X };
        });
        if (best) moves.push([w, end, best.X]);
      });
    });
    moves.forEach(function (m) { m[0][m[1]] = m[2]; });
    const list = walls.filter(function (w) {
      w.a = { x: Math.round(w.a.x), y: Math.round(w.a.y) }; w.b = { x: Math.round(w.b.x), y: Math.round(w.b.y) };
      w.len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      return w.len >= 10;
    });

    // Un archivo suele traer varios dibujos (plantas, cortes, fachadas): se separan por cercanía.
    const parent = list.map(function (_, i) { return i; });
    const find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const box = list.map(function (w) { return { x0: Math.min(w.a.x, w.b.x) - 75, x1: Math.max(w.a.x, w.b.x) + 75, y0: Math.min(w.a.y, w.b.y) - 75, y1: Math.max(w.a.y, w.b.y) + 75 }; });
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (box[i].x0 <= box[j].x1 && box[j].x0 <= box[i].x1 && box[i].y0 <= box[j].y1 && box[j].y0 <= box[i].y1) parent[find(i)] = find(j);
      }
    }
    const byRoot = {};
    list.forEach(function (w, i) {
      const g = byRoot[find(i)] || (byRoot[find(i)] = { walls: [], len: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      g.walls.push(w); g.len += w.len;
      g.x0 = Math.min(g.x0, w.a.x, w.b.x); g.x1 = Math.max(g.x1, w.a.x, w.b.x); g.y0 = Math.min(g.y0, w.a.y, w.b.y); g.y1 = Math.max(g.y1, w.a.y, w.b.y);
    });
    let groups = Object.keys(byRoot).map(function (k) { return byRoot[k]; }).sort(function (p, q) { return q.len - p.len; });
    if (!groups.length) throw fail("nowalls");
    const real = groups.filter(function (g) { return g.len >= 500 && g.walls.length >= 3; });
    groups = (real.length ? real : groups.slice(0, 1)).slice(0, 12);
    const index = Math.min(opts.group || 0, groups.length - 1), chosen = groups[index];

    const plan = P.empty(), stats = { walls: 0, doors: 0, windows: 0, opens: 0 };
    const id = function () { return plan.nextId++; };
    const brick = function (thick) { return BRICKS.reduce(function (best, k) { return Math.abs(D.bricks[k].e + 2.5 - thick) < Math.abs(D.bricks[best].e + 2.5 - thick) ? k : best; }); };
    chosen.walls.forEach(function (w) {
      const wall = { id: id(), a: { x: w.a.x - chosen.x0, y: w.a.y - chosen.y0 }, b: { x: w.b.x - chosen.x0, y: w.b.y - chosen.y0 } };
      if (w.thick) wall.type = brick(w.thick);
      plan.walls.push(wall);
      stats.walls++;
      const dx = (w.b.x - w.a.x) / w.len, dy = (w.b.y - w.a.y) / w.len;
      w.openings.forEach(function (o) {
        const width = Math.min(Math.max(40, Math.round(o.w / 5) * 5), Math.floor(w.len) - 10), t = ((o.x - w.a.x) * dx + (o.y - w.a.y) * dy) / w.len;
        if (width < 40 || t <= 0 || t >= 1) return;
        const type = o.kind === "open" ? "vano" : o.kind === "double" ? "pdoble" : o.kind === "door" ? (width <= 75 ? "p70" : width <= 85 ? "p80" : "p90")
          : width <= 70 ? "vlux" : width > 200 ? "pbalcon" : ["v100", "v120", "v150", "v180"].reduce(function (best, k) { return Math.abs(D.openings[k].w - width) < Math.abs(D.openings[best].w - width) ? k : best; });
        const added = P.opening(id(), wall.id, t, type);
        added.w = width;
        if (o.kind === "door") { added.side = o.sign < 0; added.hinge = o.hingeTo; } // mismo lado y misma bisagra que en el dibujo
        plan.openings.push(added);
        stats[o.kind === "open" ? "opens" : o.kind === "window" ? "windows" : "doors"]++;
      });
    });

    // Nombres de ambientes: el primer renglón del texto que cae dentro de cada uno, con preferencia por los que nombran un local.
    const s = P.settingsOf(plan), texts = drawing.texts.map(function (t) { const p = cm(t); return { x: p.x - chosen.x0, y: p.y - chosen.y0, text: t.text.split("\n")[0].trim() }; })
      .filter(function (t) { return t.text.length <= 28 && /[a-záéíóúñ]{3}/i.test(t.text) && !/^[\d\s.,x×]+/.test(t.text); });
    if (texts.length) {
      P.survey(plan, s, P.bricksOf(s)).rooms.forEach(function (room) {
        const here = texts.filter(function (t) { return P.inside(room.points, t); }), tag = here.filter(function (t) { return ROOM.test(t.text); })[0] || here[0];
        if (!tag) return;
        const name = tag.text.charAt(0).toUpperCase() + tag.text.slice(1).toLowerCase();
        plan.labels.push({ x: Math.round(room.cx), y: Math.round(room.cy), name: name, floor: /dorm|living|estar|comedor|estudio|escritorio|vestidor/i.test(name) ? "flotante" : /garage|cochera|dep[oó]sito/i.test(name) ? "alisado" : "ceramico" });
      });
    }

    return {
      plan: plan, group: index, unit: f, single: single, layers: names, stats: stats,
      groups: groups.map(function (g) { return { w: (g.x1 - g.x0) / 100, h: (g.y1 - g.y0) / 100, walls: g.walls.length }; })
    };
  }

  B.cad = { read: read, wallLayers: wallLayers, toPlan: toPlan };
})();
