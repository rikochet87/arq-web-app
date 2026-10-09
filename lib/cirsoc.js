/* CalcuObra — verificación contra los reglamentos CIRSOC. Sin DOM.
   Aplica al plano las reglas prescriptivas del CIRSOC 501-E (mampostería de bajo compromiso estructural),
   arma el análisis de cargas con los valores del CIRSOC 101-2005 y computa los encadenados mínimos.
   Cada resultado cita el artículo del que sale. Los valores reglamentarios están en data.cirsoc (lib/manifest.js).
   Es una verificación automática de apoyo: no reemplaza el proyecto ni la firma de un profesional. */
(function () {
  "use strict";

  const B = window.__BRAND__;
  const D = B.data, E = B.engine, R = D.cirsoc;

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const fmt = (x, d) => E.fmt(x, d === undefined ? 2 : d);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  // ¿El ladrillo sirve para muro portante? Tiene que ser de un tipo portante y cumplir el espesor mínimo (5.1.1, 7.2.2).
  const bearing = (brick) => R.minThick[brick.kind] !== undefined && brick.e * 10 >= R.minThick[brick.kind];
  const row71 = (mm) => R.table71.find((r) => mm <= r.max) || R.table71[R.table71.length - 1];

  /* Une los tramos portantes alineados que el plano corta donde llega un tabique. Un tabique no es un soporte
     vertical (501-E 6.6.1): el muro sigue siendo uno solo entre esquina y esquina, o hasta otro muro portante. */
  function mergeRuns(walls) {
    const key = (p) => Math.round(p.x) + "," + Math.round(p.y);
    const flip = (w) => Object.assign({}, w, { a: w.b, b: w.a, openings: w.openings.map((o) => ({ from: w.len - o.to, to: w.len - o.from, w: o.w })).reverse() });
    for (let merged = true; merged;) {
      merged = false;
      const at = {};
      walls.forEach((w, i) => [w.a, w.b].forEach((p, end) => { (at[key(p)] = at[key(p)] || []).push({ i: i, end: end }); }));
      for (const k in at) {
        const g = at[k];
        if (g.length !== 2 || g[0].i === g[1].i) continue;
        const u = g[0].end === 1 ? walls[g[0].i] : flip(walls[g[0].i]), v = g[1].end === 0 ? walls[g[1].i] : flip(walls[g[1].i]);
        const cross = (u.b.x - u.a.x) * (v.b.y - v.a.y) - (u.b.y - u.a.y) * (v.b.x - v.a.x);
        if (u.thick !== v.thick || Math.abs(cross) > 0.02 * u.len * v.len) continue; // una esquina sí es un soporte
        const run = Object.assign({}, u, { b: v.b, len: u.len + v.len, solid: u.solid + v.solid,
          openings: u.openings.concat(v.openings.map((o) => ({ from: o.from + u.len, to: o.to + u.len, w: o.w }))) });
        walls = walls.filter((_, i) => i !== g[0].i && i !== g[1].i).concat([run]);
        merged = true;
        break;
      }
    }
    return walls;
  }

  // Muros portantes de una planta, con sus aberturas ubicadas a lo largo de cada muro. Longitudes en cm.
  function bearingWalls(level, survey) {
    return mergeRuns(survey.edges.filter((e) => bearing(D.bricks[e.brick])).map(function (e) {
      const len = dist(e.a, e.b), dx = Math.abs(e.b.x - e.a.x), dy = Math.abs(e.b.y - e.a.y);
      const wall = level.walls.find((w) => w.id === e.wall), openings = [];
      level.openings.forEach(function (o) {
        if (o.wall !== e.wall) return;
        const c = { x: wall.a.x + (wall.b.x - wall.a.x) * o.t, y: wall.a.y + (wall.b.y - wall.a.y) * o.t };
        const pos = ((c.x - e.a.x) * (e.b.x - e.a.x) + (c.y - e.a.y) * (e.b.y - e.a.y)) / len;
        if (pos >= 0 && pos <= len) openings.push({ from: Math.max(0, pos - o.w / 2), to: Math.min(len, pos + o.w / 2), w: o.w });
      });
      openings.sort((p, q) => p.from - q.from);
      return {
        a: e.a, b: e.b, len: len, thick: e.core || e.thick, cls: e.cls, openings: openings, // espesor del ladrillo, sin revoques
        dir: dx >= dy * 4 ? "x" : dy >= dx * 4 ? "y" : null, // los muros en diagonal no cuentan para ninguna dirección
        solid: len - openings.reduce((sum, o) => sum + (o.to - o.from), 0)
      };
    }));
  }

  // Sobrecarga de cubierta inaccesible, en kN/m² (CIRSOC 101-2005, 4.9.1). area en m², slope en %.
  function roofLive(area, slope) {
    const r1 = area <= 19 ? 1 : area >= 56 ? 0.6 : 1.2 - 0.01076 * area, f = 0.12 * slope, r2 = f <= 4 ? 1 : f >= 12 ? 0.6 : 1.2 - 0.05 * f;
    return Math.min(0.96, Math.max(0.58, 0.96 * r1 * r2));
  }

  /* ctx: { levels, surveys, s (ajustes), bricks {ext, int}, roof (clave), roofPlan (m² en planta) }.
     Devuelve { checks: [{state: "ok" | "fail" | "info", ref, text}], sections, materials }. */
  function review(plan, ctx) {
    const s = ctx.s, zone = Number(s.zone) || 0, n = ctx.levels.length, H = s.height / 100;
    const height = n * H + (n - 1) * D.finishes.storeyGap / 100, checks = [], sections = [], materials = {};
    const add = (state, ref, text) => checks.push({ state: state, ref: ref, text: text });
    const levelName = (i) => (n > 1 ? ctx.levels[i].name + ": " : "");
    const weights = R.weights, mortar = R.mortars[s.mortar] || R.mortars.mI;

    // ---------- Análisis de cargas (CIRSOC 101-2005) ----------
    const wallLoad = ctx.surveys.map(function (v) { // kN por planta: superficie neta × espesor con revoque × peso unitario
      return Object.keys(v.byBrick).reduce((sum, key) => sum + v.byBrick[key] * (D.bricks[key].e / 100 + R.plaster) * weights.masonry[D.bricks[key].kind || "cerramiento"], 0);
    });
    const floorDead = R.slab + weights.screedBase * D.finishes.upperSlab / 100 + weights.mortar * s.screed / 100 + weights.tile + weights.plaster * R.ceiling;
    const roofDef = R.roofs[ctx.roof], slope = (D.roofs[ctx.roof] || {}).slope || 0;
    const roofDead = roofDef ? roofDef.dead : 0, roofLr = roofDef ? roofLive(ctx.roofPlan, slope) : 0;
    const loadAt = function (i) { // carga gravitatoria total que llega a los muros de la planta i, en kN
      let total = (roofDead + roofLr) * ctx.roofPlan;
      for (let j = i; j < n; j++) total += wallLoad[j] + (j > i ? (floorDead + R.live) * ctx.surveys[j].footprint : 0);
      return total;
    };
    const loadRows = [
      { label: "Peso de los muros (con revoque)", value: fmt(wallLoad.reduce((a, b) => a + b, 0), 0) + " kN" },
      { label: "Sobrecarga de uso en vivienda", value: fmt(R.live, 2) + " kN/m²" }
    ];
    if (n > 1) loadRows.push({ label: "Peso propio del entrepiso", value: fmt(floorDead, 2) + " kN/m²" });
    if (roofDef) loadRows.push({ label: "Cubierta: peso propio + sobrecarga", value: fmt(roofDead, 2) + " + " + fmt(roofLr, 2) + " kN/m²" });
    loadRows.push({ label: "Carga total sobre la fundación", value: fmt(loadAt(0), 0) + " kN (" + fmt(loadAt(0) / 9.81, 1) + " t)" });
    sections.push({ title: "Cargas (CIRSOC 101)", rows: loadRows });

    if (s.system !== "portante") {
      add("info", "CIRSOC 201", "Estructura independiente de hormigón armado: columnas, vigas, losas y fundaciones se dimensionan según CIRSOC 201. La mampostería es de cerramiento y no se verifica como portante.");
      if (zone > 0) add("info", "INPRES-CIRSOC 103", "Zona sísmica " + zone + ": la estructura debe verificarse además según INPRES-CIRSOC 103, Partes I y II.");
      return { checks: checks, sections: sections, materials: materials };
    }

    // ---------- Muros portantes ----------
    const levels = ctx.levels.map((lv, i) => bearingWalls(lv, ctx.surveys[i]));
    // Muros exteriores e interiores de todo el plano, con el ladrillo que le toca a cada uno.
    const edges = ctx.surveys.reduce((list, v) => list.concat(v.edges), []), outer = edges.filter((e) => e.cls === "ext"), inner = edges.filter((e) => e.cls === "int");
    // Un muro dibujado puede quedar partido en varios tramos donde lo tocan otros: en los mensajes se cuentan muros, no tramos.
    const wallCount = (list) => Object.keys(list.reduce((set, e) => { set[e.wall] = true; return set; }, {})).length;
    const labels = (list) => Object.keys(list.reduce((set, e) => { set[D.bricks[e.brick].label] = true; return set; }, {})).join(", ");
    const weak = outer.filter((e) => !bearing(D.bricks[e.brick])), partitions = inner.filter((e) => !bearing(D.bricks[e.brick]));
    const hasWalls = ctx.surveys.some((v) => v.edges.length);
    if (!hasWalls) return { checks: checks, sections: sections, materials: materials };

    add(n <= R.maxStoreys && height <= R.maxHeight ? "ok" : "fail", "501-E 1.2.4",
      "Altura total " + fmt(height) + " m en " + plural(n, "planta", "plantas") + " (límite: " + R.maxHeight + " m o " + R.maxStoreys + " pisos).");

    if (zone > 0) { // fuera del alcance del 501-E: solo se controla el espesor mínimo del 103 Parte III
      const reduced = zone <= 2 ? n <= 2 && height <= 6 : false, need = reduced ? R.seismic.thin : R.seismic.thick;
      add("info", "501-E 1.2.2", "Zona sísmica " + zone + ": el CIRSOC 501-E no es aplicable. Rige INPRES-CIRSOC 103 Parte III, que exige mampostería encadenada o reforzada y verificación sísmica a cargo de un profesional.");
      const thin = outer.filter((e) => !bearing(D.bricks[e.brick]) || (e.core || e.thick) * 10 < need);
      add(thin.length ? "fail" : "ok", "103-III 3.4.2", thin.length
        ? plural(wallCount(thin), "muro exterior no llega", "muros exteriores no llegan") + " al mínimo para muros resistentes en esta zona: " + need + " mm con mampuesto portante (" + labels(thin) + ")."
        : "Todos los muros exteriores tienen " + need + " mm o más con mampuesto portante (" + labels(outer) + ").");
      sections.push({ title: "Encadenados", rows: [{ label: "Secciones y armaduras", value: "según INPRES-CIRSOC 103 Parte III" }] });
      return { checks: checks, sections: sections, materials: materials };
    }
    add("ok", "501-E 1.2.2", "Zona sísmica 0: es aplicable el CIRSOC 501-E.");

    add(weak.length ? "fail" : "ok", "501-E 5.1.1", weak.length
      ? (weak.length === outer.length ? "Ningún muro exterior es portante" : plural(wallCount(weak), "muro exterior no es portante", "muros exteriores no son portantes")) + " (" + labels(weak) +
        "). Hace falta ladrillo macizo de " + R.minThick.macizo + " mm o más, o bloque portante de " + R.minThick.hueco + " mm o más."
      : "Todos los muros exteriores son portantes: " + labels(outer) + ".");
    if (partitions.length) add("info", "501-E 5.1.1", plural(wallCount(partitions), "muro interior es tabique", "muros interiores son tabiques") + " (" + labels(partitions) + "): no se cuentan como muros resistentes.");
    add("ok", "501-E 5.2.1", "Mortero de asiento tipo " + mortar.type + " (" + mortar.ratio + " cemento : cal : arena), admitido para muros portantes.");

    const all = levels.reduce((list, walls) => list.concat(walls), []);
    if (!all.length) return { checks: checks, sections: sections, materials: materials };

    // Tabla 7.1: altura de planta, cantidad de plantas y distancia entre soportes verticales según el espesor.
    const thinnest = Math.min.apply(null, all.map((w) => w.thick * 10)), row = row71(thinnest);
    add(H <= row.storey ? "ok" : "fail", "501-E Tabla 7.1", "Altura de planta " + fmt(H) + " m para muros de " + fmt(thinnest, 0) + " mm (máximo " + fmt(row.storey, 1) + " m).");
    if (n > 1) {
      add(row.multi ? "ok" : "fail", "501-E Tabla 7.1", row.multi ? "Espesor de " + fmt(thinnest, 0) + " mm apto para edificios de hasta " + R.maxHeight + " m."
        : "Los muros de " + fmt(thinnest, 0) + " mm solo se admiten en construcciones de una planta o en el piso superior. En las plantas inferiores hacen falta 170 mm o más.");
    }
    let extraTies = 0, longest = 0, tooLong = 0;
    all.forEach(function (w) {
      const limit = row71(w.thick * 10).support * 100;
      if (w.len > limit + 1) { tooLong++; longest = Math.max(longest, w.len); extraTies += Math.ceil(w.len / limit) - 1; }
    });
    // Un encadenado vertical es un soporte válido (6.6.1): los muros largos se resuelven sumando encadenados intermedios.
    add(tooLong ? "info" : "ok", "501-E Tabla 7.1", tooLong
      ? plural(tooLong, "muro supera", "muros superan") + " la distancia máxima entre soportes verticales (el más largo mide " + fmt(longest / 100) + " m; máximo " + fmt(row.support, 1) + " m). Para cumplir se suman al cómputo " + plural(extraTies, "encadenado vertical intermedio", "encadenados verticales intermedios") + ": hay que ubicarlos en el proyecto."
      : "Todos los muros portantes tienen un soporte vertical cada " + fmt(row.support, 1) + " m o menos.");

    levels.forEach(function (walls, i) {
      if (!walls.length) return;
      const xs = [], ys = [];
      walls.forEach((w) => { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); });
      const L = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
      // 6.2: dos planos de muros resistentes perimetrales y paralelos en cada dirección.
      const planes = (dir) => Object.keys(walls.filter((w) => w.dir === dir && w.cls === "ext")
        .reduce((set, w) => { set[Math.round((dir === "x" ? w.a.y : w.a.x) / 50)] = true; return set; }, {})).length;
      add(planes("x") >= 2 && planes("y") >= 2 ? "ok" : "fail", "501-E 6.2", levelName(i) + "muros perimetrales resistentes en dos planos paralelos por dirección (" + planes("x") + " y " + planes("y") + "; mínimo 2 y 2).");
      // 6.3: longitud acumulada de muros resistentes, sin aberturas, ≥ 0,6 L en cada dirección.
      ["x", "y"].forEach(function (dir) {
        const sum = walls.filter((w) => w.dir === dir).reduce((t, w) => t + w.solid, 0);
        add(sum >= R.minLength * L - 1 ? "ok" : "fail", "501-E 6.3", levelName(i) + "muros resistentes en dirección " + (dir === "x" ? "horizontal" : "vertical") + " del plano: " +
          fmt(sum / 100) + " m sin contar aberturas (mínimo 0,6 × " + fmt(L / 100) + " = " + fmt(R.minLength * L / 100) + " m).");
      });
    });

    // 8.4: aberturas en muros portantes.
    let wide = 0, close = 0, count = 0;
    all.forEach(function (w) {
      w.openings.forEach(function (o, k) {
        count++;
        if (o.w > R.maxOpening) wide++;
        const before = k ? o.from - w.openings[k - 1].to : o.from, after = k === w.openings.length - 1 ? w.len - o.to : Infinity;
        if (before < R.minPier - 0.5 || after < R.minPier - 0.5) close++;
      });
    });
    if (count) {
      add(wide ? "fail" : "ok", "501-E 8.4.2", wide ? plural(wide, "abertura supera", "aberturas superan") + " la luz máxima de " + fmt(R.maxOpening / 100) + " m en muro portante."
        : "Ninguna abertura en muro portante supera " + fmt(R.maxOpening / 100) + " m de luz.");
      add(close ? "fail" : "ok", "501-E 8.4.1", close ? plural(close, "abertura queda", "aberturas quedan") + " a menos de " + fmt(R.minPier, 0) + " cm de un soporte vertical o de otra abertura."
        : "Todas las aberturas dejan " + fmt(R.minPier, 0) + " cm o más hasta el soporte vertical o la abertura vecina.");
    }

    // 6.4: los muros resistentes de arriba coinciden con los de abajo.
    for (let i = 1; i < n; i++) {
      const loose = levels[i].filter(function (w) {
        const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        return !levels[i - 1].some(function (u) {
          const t = Math.max(0, Math.min(1, ((mid.x - u.a.x) * (u.b.x - u.a.x) + (mid.y - u.a.y) * (u.b.y - u.a.y)) / (u.len * u.len)));
          return dist(mid, { x: u.a.x + (u.b.x - u.a.x) * t, y: u.a.y + (u.b.y - u.a.y) * t }) <= 10;
        });
      }).length;
      add(loose ? "fail" : "ok", "501-E 6.4", ctx.levels[i].name + ": " + (loose ? plural(loose, "muro portante no apoya", "muros portantes no apoyan") + " sobre un muro portante de la planta de abajo."
        : "todos los muros portantes apoyan sobre muros portantes de la planta de abajo."));
    }

    // 6.8: tensión media de compresión. Carga total de cada planta sobre la sección bruta de sus muros portantes.
    levels.forEach(function (walls, i) {
      const area = walls.filter((w) => w.len >= R.minWall).reduce((t, w) => t + w.solid * w.thick, 0) / 1e4; // m²; no cuentan los tramos de menos de 50 cm (6.8.2)
      if (!area) return;
      const stress = loadAt(i) / area / 1000; // MPa
      add(stress <= mortar.stress ? "ok" : "fail", "501-E 6.8.3", levelName(i) + "tensión media de compresión " + fmt(stress, 3) + " MPa (admisible " + fmt(mortar.stress, 2) + " MPa con mortero tipo " + mortar.type +
        "). Es un promedio de toda la planta: no reemplaza la bajada de cargas muro por muro.");
    });

    // ---------- Encadenados mínimos (501-E 8.1) ----------
    const T = R.ties;
    let horizontal = 0, vertical = 0, concrete = 0, bars = 0, stirrups = 0, stirrupLen = 0, lintels = 0, lintelLen = 0;
    levels.forEach(function (walls, i) {
      const nodes = {};
      walls.forEach(function (w) {
        const count = w.thick * 10 <= T.thinMax ? T.barsThin : T.barsThick, hoop = (2 * (w.thick - 4 + T.height - 4) + 12) / 100; // m, con ganchos
        horizontal += w.len / 100;
        concrete += w.len / 100 * w.thick / 100 * T.height / 100;
        bars += w.len / 100 * count;
        stirrups += Math.ceil(w.len / T.stirrupGap); stirrupLen += Math.ceil(w.len / T.stirrupGap) * hoop;
        [w.a, w.b].forEach(function (p) { // un encadenado vertical en cada esquina o encuentro: manda el muro más grueso que llega
          const k = Math.round(p.x) + "," + Math.round(p.y);
          nodes[k] = Math.max(nodes[k] || 0, w.thick);
        });
        w.openings.forEach(function (o) { lintels++; lintelLen += (o.w + 2 * R.lintelSeat) / 100; });
      });
      const thick = Object.keys(nodes).map((k) => nodes[k]);
      for (let k = 0; k < extraTies && i === 0 && thick.length; k++) thick.push(thick[0]); // intermedios, repartidos en planta baja
      thick.forEach(function (t) {
        const count = t * 10 <= T.thinMax ? T.barsThin : T.barsThick, hoop = (2 * (t - 4 + T.width - 4) + 12) / 100, tall = H + T.splice / 100;
        vertical++;
        concrete += t / 100 * T.width / 100 * H;
        bars += tall * count;
        stirrups += Math.ceil(H * 100 / T.stirrupGap); stirrupLen += Math.ceil(H * 100 / T.stirrupGap) * hoop;
      });
    });
    bars *= 1.1; // empalmes y despuntes
    E.addMaterials(materials, T.mix, concrete * 1.05);
    sections.push({ title: "Encadenados (CIRSOC 501-E)", rows: [
      { label: "Horizontales, " + T.height + " cm de alto", value: fmt(horizontal, 1) + " m" },
      { label: "Verticales, en esquinas y encuentros", value: vertical + " u" },
      { label: "Hormigón", value: fmt(concrete * 1.05, 2) + " m³" },
      { label: "Barras Ø 6 mm ADN-420", value: E.ceil(bars / 12) + " barras de 12 m (" + fmt(bars * T.kg6, 0) + " kg)" },
      { label: "Estribos Ø 4,2 mm cada " + T.stirrupGap + " cm", value: fmt(stirrups, 0) + " u (" + fmt(stirrupLen * T.kg42, 0) + " kg)" }
    ].concat(lintels ? [{ label: "Dinteles, con 20 cm de apoyo por lado", value: lintels + " u · " + fmt(lintelLen, 1) + " m" }] : [])
      .concat(E.materialRows(E.addMaterials({}, T.mix, concrete * 1.05))) });
    add("info", "501-E 8.1", "Encadenado horizontal en todos los muros portantes y vertical en cada esquina y encuentro, con la armadura mínima (" + T.barsThin + " Ø 6 hasta " + T.thinMax + " mm de espesor, " + T.barsThick +
      " Ø 6 por encima) y hormigón de 13 MPa con 250 kg de cemento por m³ como mínimo. Los dinteles se dimensionan como vigas.");

    return { checks: checks, sections: sections, materials: materials };
  }

  B.cirsoc = { review: review, roofLive: roofLive };
})();
