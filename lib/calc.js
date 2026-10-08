/* CalcuObra — motor de cálculo. Funciones puras, sin DOM: reciben los valores
   del formulario tal como se escribieron y devuelven
   { main: [{label, value, unit}], rows: [{label, value}], notes: [texto] }. */
(function () {
  "use strict";

  const B = window.__BRAND__ || (window.__BRAND__ = {});
  const D = B.data;

  function CalcError(message) { this.message = message; }

  function fmt(x, decimals) {
    return x.toLocaleString("es-AR", { maximumFractionDigits: decimals, useGrouping: "always" });
  }

  // Acepta "2,6", "2.6" y "1.234,5".
  function parseNum(raw) {
    let s = String(raw).trim().replace(/\s/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
  }

  // Sin opciones el número tiene que ser mayor que 0; con min, mayor o igual a min.
  function reader(v) {
    return {
      num(name, label, o) {
        o = o || {};
        const raw = v[name];
        if (raw == null || String(raw).trim() === "") {
          if (o.def !== undefined) return o.def;
          throw new CalcError("Completá «" + label + "».");
        }
        const x = parseNum(raw);
        if (!isFinite(x)) throw new CalcError("«" + label + "» tiene que ser un número.");
        if (o.min === undefined ? x <= 0 : x < o.min) {
          throw new CalcError("«" + label + "» tiene que ser " +
            (o.min === undefined ? "mayor que 0" : "como mínimo " + fmt(o.min, 2)) + ".");
        }
        if (o.max !== undefined && x > o.max) {
          throw new CalcError("«" + label + "» no puede superar " + fmt(o.max, 2) + ".");
        }
        return x;
      },
      str(name) { return String(v[name] == null ? "" : v[name]); },
      bool(name) { return !!v[name]; }
    };
  }

  const ceil = (x) => Math.ceil(x - 1e-9) || 0; // || 0 evita el -0
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  /* Método de los coeficientes de aporte: materiales por m³ de mezcla.
     Caso de control hecho a mano, hormigón 1:3:3 con 9 % de agua:
       volumen aparente = 1 + 3 + 3 = 7 · agua = 0,63
       volumen real = 1×0,47 + 3×0,63 + 3×0,51 + 0,63 = 4,52
       cemento = 1/4,52 × 1400 = 310 kg · arena = 3/4,52 = 0,66 m³ · piedra = 0,66 m³ */
  function mixPerM3(key) {
    const mix = D.mixes[key];
    if (!mix) throw new CalcError("Elegí una mezcla.");
    let apparent = 0, real = 0;
    for (const m in mix.parts) {
      apparent += mix.parts[m];
      real += mix.parts[m] * D.materials[m].aporte;
    }
    real += apparent * mix.water;
    const out = {};
    for (const m in mix.parts) {
      const volume = mix.parts[m] / real;
      const density = D.materials[m].density;
      out[m] = density ? volume * density : volume; // kg los ligantes, m³ los áridos
    }
    return out;
  }

  function addMaterials(total, key, volume) {
    const per = mixPerM3(key);
    for (const m in per) total[m] = (total[m] || 0) + per[m] * volume;
    return total;
  }

  function bags(kg, size) {
    return plural(ceil(kg / size), "bolsa", "bolsas") + " de " + size + " kg (" + fmt(kg, 0) + " kg)";
  }

  function materialRows(total) {
    const rows = [];
    if (total.cemento) rows.push({ label: "Cemento", value: bags(total.cemento, D.materials.cemento.bag) });
    if (total.cal) rows.push({ label: D.materials.cal.label, value: bags(total.cal, D.materials.cal.bag) });
    ["arena", "piedra", "cascote"].forEach(function (m) {
      if (total[m]) rows.push({ label: D.materials[m].label, value: fmt(total[m], 2) + " m³" });
    });
    return rows;
  }

  function wasteNote(pct) {
    return pct > 0 ? "Incluye " + fmt(pct, 1) + " % de desperdicio." : "No incluye desperdicio.";
  }

  /* Control: 10 m² de ladrillo común, pared de 15, junta 1,5 cm, 5 % de desperdicio.
     Por m² = 1 / (0,255 × 0,065) = 60,3 → 10 × 60,3 × 1,05 = 634 ladrillos.
     Mortero por m² = 0,115 × (1 − 60,3 × 0,24 × 0,05) = 0,0317 m³ → 0,33 m³. */
  // area en m², b = ladrillo {l, h, e} en cm, junta en cm, k = 1 + desperdicio.
  function brickwork(area, b, junta, k) {
    const perM2 = 1 / (((b.l + junta) / 100) * ((b.h + junta) / 100));
    const mortarM2 = (b.e / 100) * (1 - perM2 * (b.l / 100) * (b.h / 100));
    return { perM2: perM2, units: ceil(area * perM2 * k), mortar: area * mortarM2 * k };
  }

  function ladrillos(v) {
    const r = reader(v);
    const largo = r.num("largo", "Largo de la pared", { max: 1000 });
    const alto = r.num("alto", "Alto de la pared", { max: 100 });
    const aberturas = r.num("aberturas", "Aberturas a descontar", { min: 0, def: 0 });
    const b = D.bricks[r.str("tipo")] || {
      l: r.num("ladLargo", "Largo del ladrillo", { max: 100 }),
      h: r.num("ladAlto", "Alto del ladrillo", { max: 100 }),
      e: r.num("ladEspesor", "Espesor de la pared", { max: 100 })
    };
    const junta = r.num("junta", "Junta", { min: 0, max: 5 });
    const desp = r.num("desperdicio", "Desperdicio", { min: 0, max: 50, def: 0 });

    const area = largo * alto - aberturas;
    if (area <= 0) throw new CalcError("Las aberturas no pueden ocupar toda la pared.");

    const q = brickwork(area, b, junta, 1 + desp / 100);
    const rows = [
      { label: "Superficie de pared", value: fmt(area, 2) + " m²" },
      { label: "Ladrillos por m²", value: fmt(q.perM2, 1) }
    ];
    if (q.mortar > 0) rows.push.apply(rows, materialRows(addMaterials({}, r.str("mezcla"), q.mortar)));

    return {
      main: [
        { label: "Ladrillos", value: fmt(q.units, 0), unit: "unidades" },
        { label: "Mortero", value: fmt(q.mortar, 2), unit: "m³" }
      ],
      rows: rows,
      notes: [wasteNote(desp), "El mortero supone juntas llenas; en ladrillo hueco y bloque suele gastarse algo menos."]
    };
  }

  /* Control: losa de 4 × 3 m y 12 cm = 1,44 m³; con 5 % = 1,51 m³.
     Mezcla 1:3:3 → 1,512 × 310 = 468 kg de cemento = 19 bolsas de 25 kg. */
  function hormigon(v) {
    const r = reader(v);
    const forma = r.str("forma");
    let unit;
    if (forma === "rect") {
      unit = (r.num("ladoA", "Lado A", { max: 1000 }) / 100) * (r.num("ladoB", "Lado B", { max: 1000 }) / 100) *
        r.num("altoRect", "Largo o alto", { max: 1000 });
    } else if (forma === "circ") {
      const radio = r.num("diametro", "Diámetro", { max: 1000 }) / 200;
      unit = Math.PI * radio * radio * r.num("altoCirc", "Alto", { max: 1000 });
    } else {
      unit = r.num("largo", "Largo", { max: 1000 }) * r.num("ancho", "Ancho", { max: 1000 }) *
        (r.num("espesor", "Espesor", { max: 500 }) / 100);
    }
    const cantidad = forma === "rect" || forma === "circ" ? r.num("cantidad", "Cantidad", { min: 1, max: 10000, def: 1 }) : 1;
    const desp = r.num("desperdicio", "Desperdicio", { min: 0, max: 50, def: 0 });
    const bag = D.materials.cemento.bag;

    const volume = unit * cantidad * (1 + desp / 100);
    const total = addMaterials({}, r.str("mezcla"), volume);

    return {
      main: [
        { label: "Hormigón", value: fmt(volume, 2), unit: "m³" },
        { label: "Cemento", value: fmt(ceil(total.cemento / bag), 0), unit: "bolsas de " + bag + " kg" }
      ],
      rows: materialRows(total),
      notes: [wasteNote(desp), "Cantidades orientativas. En elementos estructurales la dosificación la define el profesional a cargo."]
    };
  }

  // Combina envases de 20, 10, 4 y 1 litro sin armar compras absurdas (ej. 4 latas de 1 L).
  function paintCans(liters) {
    const count = {};
    let rem = liters;
    const add = function (size) { count[size] = (count[size] || 0) + 1; rem -= size; };
    while (rem > 1e-9) {
      if (rem > 14) add(20);
      else if (rem > 8) add(10);
      else if (rem > 2) add(4);
      else add(1);
    }
    return [20, 10, 4, 1].filter(function (s) { return count[s]; }).map(function (s) {
      return plural(count[s], "envase", "envases") + " de " + s + " L";
    }).join(" + ");
  }

  /* Control: ambiente de 4 × 3 × 2,6 m, 1 puerta y 1 ventana, sin cielorraso.
     Paredes = 2 × (4 + 3) × 2,6 = 36,4 − 1,6 − 1,5 = 33,3 m².
     2 manos a 10 m²/L → 33,3 × 2 / 10 = 6,7 litros. */
  function pintura(v) {
    const r = reader(v);
    let area;
    const rows = [];
    if (r.str("modo") === "directo") {
      area = r.num("superficie", "Superficie", { max: 100000 });
    } else {
      const largo = r.num("largo", "Largo", { max: 1000 });
      const ancho = r.num("ancho", "Ancho", { max: 1000 });
      const alto = r.num("alto", "Alto", { max: 100 });
      const puertas = r.num("puertas", "Puertas", { min: 0, max: 100, def: 0 });
      const ventanas = r.num("ventanas", "Ventanas", { min: 0, max: 100, def: 0 });
      const paredes = Math.max(0, 2 * (largo + ancho) * alto - puertas * D.paint.door - ventanas * D.paint.window);
      const techo = r.bool("techo") ? largo * ancho : 0;
      area = paredes + techo;
      rows.push({ label: "Paredes", value: fmt(paredes, 1) + " m²" });
      if (techo) rows.push({ label: "Cielorraso", value: fmt(techo, 1) + " m²" });
    }
    if (area <= 0) throw new CalcError("Las aberturas no pueden ocupar todas las paredes.");
    const manos = r.num("manos", "Manos", { min: 1, max: 10 });
    const rend = r.num("rendimiento", "Rendimiento", { max: 100 });
    const liters = area * manos / rend;
    rows.push({ label: "Qué comprar", value: paintCans(liters) });

    return {
      main: [
        { label: "Pintura", value: fmt(liters, 1), unit: "litros" },
        { label: "Superficie", value: fmt(area, 1), unit: "m²" }
      ],
      rows: rows,
      notes: ["Calculado para " + plural(manos, "mano", "manos") + " con un rendimiento de " + fmt(rend, 1) + " m² por litro."]
    };
  }

  /* Control: ambiente de 4 × 3 m = 12 m², piezas de 60 × 60, 10 % de desperdicio.
     12 × 1,10 = 13,2 m² → 13,2 / 1,44 = 9,2 → 10 cajas. Adhesivo llana 10 = 60 kg.
     Pastina = 12 × (1200 / 360000) × 3 × 8 × 1,8 = 1,7 kg. */
  function ceramicos(v) {
    const r = reader(v);
    const area = r.num("largo", "Largo", { max: 1000 }) * r.num("ancho", "Ancho", { max: 1000 });
    const pl = r.num("piezaLargo", "Largo de la pieza", { max: 400 });
    const pa = r.num("piezaAncho", "Ancho de la pieza", { max: 400 });
    const m2caja = r.num("m2caja", "m² por caja", { max: 100 });
    const desp = r.num("desperdicio", "Desperdicio", { min: 0, max: 50, def: 0 });
    const junta = r.num("junta", "Junta", { min: 0, max: 20, def: 0 });
    const espesor = r.num("espesorPieza", "Espesor de la pieza", { min: 0, max: 50, def: 0 });
    const kgM2 = D.tile.adhesive[r.str("llana")] || D.tile.adhesive[10];

    const total = area * (1 + desp / 100);
    const adhesive = area * kgM2;
    const grout = area * ((pl * 10 + pa * 10) / (pl * 10 * pa * 10)) * junta * espesor * D.tile.groutDensity;
    const rows = [
      { label: "Superficie del ambiente", value: fmt(area, 2) + " m²" },
      { label: "A comprar con desperdicio", value: fmt(total, 2) + " m²" },
      { label: "Piezas", value: fmt(ceil(total / (pl / 100 * pa / 100)), 0) },
      { label: "Adhesivo", value: bags(adhesive, D.tile.adhesiveBag) }
    ];
    if (grout > 0) rows.push({ label: "Pastina", value: fmt(Math.max(1, ceil(grout)), 0) + " kg" });

    return {
      main: [
        { label: "Cajas", value: fmt(ceil(total / m2caja), 0), unit: "de " + fmt(m2caja, 2) + " m²" },
        { label: "Superficie", value: fmt(total, 1), unit: "m² a comprar" }
      ],
      rows: rows,
      notes: [wasteNote(desp), "El adhesivo y la pastina son estimaciones: dependen de la base y de la marca."]
    };
  }

  /* Control: 270 cm de altura con contrahuella máxima de 18 cm.
     270 / 18 = 15 escalones de 18 cm · huella = 63 − 2 × 18 = 27 cm.
     14 huellas × 27 = 378 cm de desarrollo · pendiente = atan(18/27) = 33,7°. */
  function escaleras(v) {
    const r = reader(v);
    const S = D.stairs;
    const altura = r.num("altura", "Altura a salvar", { max: 2000 });
    const maxc = r.num("maxc", "Contrahuella máxima", { min: 10, max: 25 });
    const largo = r.num("largoDisp", "Largo disponible", { def: 0, max: 5000 });

    const n = Math.max(2, ceil(altura / maxc));
    const c = altura / n;
    const h = largo ? largo / (n - 1) : S.blondel - 2 * c;
    const run = (n - 1) * h;
    const blondel = 2 * c + h;

    const issues = [];
    if (c > S.maxRiser + 1e-9) issues.push("la contrahuella supera los " + S.maxRiser + " cm");
    if (h < S.minTread - 1e-9) issues.push("la huella queda por debajo de " + S.minTread + " cm");
    if (blondel < S.blondelMin - 1e-9 || blondel > S.blondelMax + 1e-9) {
      issues.push("2 contrahuellas + 1 huella da " + fmt(blondel, 1) + " cm (lo cómodo es entre " + S.blondelMin + " y " + S.blondelMax + ")");
    }

    return {
      main: [
        { label: "Escalones", value: fmt(n, 0), unit: "contrahuellas" },
        { label: "Contrahuella", value: fmt(c, 1), unit: "cm" },
        { label: "Huella", value: fmt(h, 1), unit: "cm" }
      ],
      rows: [
        { label: "Cantidad de huellas", value: fmt(n - 1, 0) },
        { label: "Desarrollo horizontal", value: fmt(run, 0) + " cm" },
        { label: "Pendiente", value: fmt(Math.atan(c / h) * 180 / Math.PI, 1) + "°" },
        { label: "Largo de la zanca", value: fmt(Math.hypot(altura, run), 0) + " cm" }
      ],
      notes: [issues.length ? "Atención: " + issues.join("; ") + "." : "Escalera cómoda: cumple la regla de Blondel."],
      stair: { n: n, c: c, h: h }
    };
  }

  /* Control: 4 × 3 m = 12 m², contrapiso de 10 cm y carpeta de 2 cm, 5 % de desperdicio.
     Contrapiso = 12 × 0,10 × 1,05 = 1,26 m³ · carpeta = 12 × 0,02 × 1,05 = 0,25 m³.
     Carpeta 1:3 → 0,252 × 473 = 119 kg de cemento. */
  function contrapiso(v) {
    const r = reader(v);
    const area = r.num("largo", "Largo", { max: 1000 }) * r.num("ancho", "Ancho", { max: 1000 });
    const espesor = r.num("espesor", "Espesor del contrapiso", { max: 100 });
    const conCarpeta = r.bool("carpeta");
    const espCarpeta = conCarpeta ? r.num("espCarpeta", "Espesor de la carpeta", { max: 20 }) : 0;
    const desp = r.num("desperdicio", "Desperdicio", { min: 0, max: 50, def: 0 });
    const k = 1 + desp / 100;

    const base = area * espesor / 100 * k;
    const screed = area * espCarpeta / 100 * k;
    const total = addMaterials({}, r.str("mezcla"), base);
    if (screed) addMaterials(total, "m13", screed);

    const main = [{ label: "Contrapiso", value: fmt(base, 2), unit: "m³" }];
    if (screed) main.push({ label: "Carpeta", value: fmt(screed, 2), unit: "m³" });

    return {
      main: main,
      rows: [{ label: "Superficie", value: fmt(area, 2) + " m²" }].concat(materialRows(total)),
      notes: [wasteNote(desp), screed ? "Los materiales suman contrapiso y carpeta (carpeta con mezcla 1:3)." : "Solo contrapiso, sin carpeta."]
    };
  }

  B.engine = {
    CalcError: CalcError,
    fmt: fmt,
    parseNum: parseNum,
    mixPerM3: mixPerM3,
    brickwork: brickwork,
    addMaterials: addMaterials,
    materialRows: materialRows,
    bags: bags,
    paintCans: paintCans,
    ceil: ceil,
    calculators: {
      ladrillos: ladrillos,
      hormigon: hormigon,
      pintura: pintura,
      ceramicos: ceramicos,
      escaleras: escaleras,
      contrapiso: contrapiso
    }
  };
})();
