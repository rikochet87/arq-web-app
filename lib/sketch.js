/* CalcuObra — de boceto a plano. Sin DOM: recibe la imagen en grises y devuelve tramos rectos.
   Reconoce paredes horizontales y verticales dibujadas a mano, las endereza, une los tramos
   cortados y cierra las esquinas. No reconoce paredes en diagonal y descarta el texto y las cotas sueltas. También ubica puertas, ventanas y vanos. */
(function () {
  "use strict";

  const B = window.__BRAND__ || (window.__BRAND__ = {});

  // Tinta: un píxel es trazo si es bastante más oscuro que el promedio de su entorno.
  // Comparar contra el entorno (y no contra un valor fijo) aguanta fotos con sombras o papel gris.
  function inkMask(gray, w, h) {
    const W = w + 1, sum = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 24)), mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const mean = (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
        const g = gray[y * w + x];
        if (g < mean * 0.82 && g < 205) mask[y * w + x] = 1;
      }
    }
    return mask;
  }

  /* Inclinación de la foto, en grados: el giro que mejor concentra la tinta en filas y columnas.
     Con el dibujo derecho, las paredes caen todas sobre pocas filas y columnas y el puntaje es máximo.
     Los giros siguen la convención de SVG: x' = x·cos − y·sen, y' = x·sen + y·cos. */
  function skew(mask, w, h) {
    const step = Math.max(1, Math.round(Math.sqrt(w * h / 50000))), pts = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (mask[y * w + x]) pts.push(x - w / 2, y - h / 2);
    if (pts.length < 80) return 0;
    const bins = Math.ceil(Math.hypot(w, h) / 2) + 4, half = bins / 2;
    const score = function (deg) {
      const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), rows = new Float64Array(bins), cols = new Float64Array(bins);
      for (let i = 0; i < pts.length; i += 2) {
        cols[Math.round((pts[i] * c - pts[i + 1] * s) / 2 + half)]++;
        rows[Math.round((pts[i] * s + pts[i + 1] * c) / 2 + half)]++;
      }
      let total = 0;
      for (let i = 0; i < bins; i++) total += rows[i] * rows[i] + cols[i] * cols[i];
      return total;
    };
    let best = 0, top = score(0);
    for (let d = -10; d <= 10; d++) { const v = score(d); if (v > top) { top = v; best = d; } }
    const coarse = best;
    for (let d = coarse - 0.8; d <= coarse + 0.81; d += 0.2) { const v = score(d); if (v > top) { top = v; best = d; } }
    return Math.abs(best) < 0.3 ? 0 : Math.round(best * 10) / 10;
  }

  // Gira la máscara alrededor de su centro.
  function rotate(mask, w, h, deg) {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) { // de dónde viene cada píxel del resultado: el giro inverso
        const dx = x - w / 2, dy = y - h / 2, sx = Math.round(dx * c + dy * s + w / 2), sy = Math.round(-dx * s + dy * c + h / 2);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h && mask[sy * w + sx]) out[y * w + x] = 1;
      }
    }
    return out;
  }

  /* Tramos largos a lo ancho de la máscara. Cada trazo se engrosa "fat" píxeles en perpendicular para
     absorber el pulso de la mano, se buscan corridas largas fila por fila y las corridas de filas vecinas
     que se pisan se unen en un solo tramo. Devuelve {a, b, c}: va de a hasta b sobre la fila c. */
  function longRuns(mask, w, h, minLen, fat) {
    const thick = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (let d = Math.max(0, y - fat); d <= Math.min(h - 1, y + fat); d++) thick[d * w + x] = 1;
      }
    }
    const runs = [], rows = [];
    for (let y = 0; y < h; y++) {
      rows.push(runs.length);
      let start = -1, gap = 0;
      for (let x = 0; x <= w; x++) {
        if (x < w && thick[y * w + x]) { if (start < 0) start = x; gap = 0; continue; }
        if (start < 0) continue;
        if (x < w && ++gap <= 2) continue; // tolera cortes de hasta 2 píxeles
        const end = x - gap;
        if (end - start >= minLen) runs.push({ y: y, a: start, b: end });
        start = -1; gap = 0;
      }
    }
    rows.push(runs.length);

    const parent = runs.map(function (_, i) { return i; });
    const find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let y = 1; y < h; y++) {
      for (let i = rows[y]; i < rows[y + 1]; i++) {
        for (let j = rows[y - 1]; j < rows[y]; j++) {
          if (runs[i].a <= runs[j].b && runs[j].a <= runs[i].b) parent[find(i)] = find(j);
        }
      }
    }
    const groups = {};
    runs.forEach(function (run, i) {
      const g = groups[find(i)] || (groups[find(i)] = { a: run.a, b: run.b, y0: run.y, y1: run.y, weight: 0, moment: 0 });
      const len = run.b - run.a;
      g.a = Math.min(g.a, run.a); g.b = Math.max(g.b, run.b); g.y0 = Math.min(g.y0, run.y); g.y1 = Math.max(g.y1, run.y);
      g.weight += len; g.moment += len * run.y;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.b - g.a >= minLen && g.b - g.a >= 3 * (g.y1 - g.y0 + 1); }) // largo y finito: una línea, no una mancha
      .map(function (g) { return { a: g.a, b: g.b, c: g.moment / g.weight }; });
  }

  // Lleva a un mismo eje los tramos casi alineados (incluye las paredes dibujadas con doble línea) y une los que se continúan.
  function align(list, tol) {
    list.sort(function (p, q) { return p.c - q.c; });
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i, weight = 0, moment = 0;
      while (j < list.length && list[j].c - list[i].c <= tol) { weight += list[j].b - list[j].a; moment += (list[j].b - list[j].a) * list[j].c; j++; }
      const c = moment / weight, group = list.slice(i, j).sort(function (p, q) { return p.a - q.a; });
      let cur = { a: group[0].a, b: group[0].b, c: c };
      for (let k = 1; k < group.length; k++) {
        if (group[k].a <= cur.b + tol * 1.5) cur.b = Math.max(cur.b, group[k].b);
        else { out.push(cur); cur = { a: group[k].a, b: group[k].b, c: c }; }
      }
      out.push(cur);
      i = j;
    }
    return out;
  }

  // Cierra esquinas y encuentros en T: cada extremo se lleva al eje del tramo perpendicular más cercano.
  function join(list, others, tol) {
    list.forEach(function (seg) {
      ["a", "b"].forEach(function (end) {
        let best = null;
        others.forEach(function (o) {
          const d = Math.abs(o.c - seg[end]);
          if (d <= tol * 1.5 && seg.c >= o.a - tol * 1.5 && seg.c <= o.b + tol * 1.5 && (!best || d < best.d)) best = { d: d, c: o.c, other: o };
        });
        if (best) { seg[end] = best.c; seg.linked = best.other.linked = true; } // linked: toca a otra pared
      });
    });
  }

  // Cantidad de píxeles de tinta dentro de un rectángulo (los límites pueden venir en cualquier orden).
  function inkIn(m, mw, mh, xa, xb, ya, yb) {
    const x0 = Math.max(0, Math.round(Math.min(xa, xb))), x1 = Math.min(mw - 1, Math.round(Math.max(xa, xb)));
    const y0 = Math.max(0, Math.round(Math.min(ya, yb))), y1 = Math.min(mh - 1, Math.round(Math.max(ya, yb)));
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += m[y * mw + x];
    return n;
  }

  /* Puertas, ventanas y vanos sobre las paredes de una dirección. walls corren a lo ancho de la máscara m;
     cross son los tramos perpendiculares. Une las paredes cortadas por una abertura y marca con leaf los
     tramos de cross que resultan ser hojas de puerta. Todo en coordenadas de m: "pos" a lo largo, "c" a través. */
  function features(walls, cross, m, mw, mh, size, tol) {
    const doors = [], windows = [], opens = [];
    const minOpen = size * 0.03, maxDoor = size * 0.16, maxGap = size * 0.22;
    const wallAt = function (pos, c) { return walls.find(function (wl) { return Math.abs(wl.c - c) <= tol && pos >= wl.a - tol && pos <= wl.b + tol; }); };
    // El arco de la puerta deja tinta de un solo lado: "best" tiene que ser claro frente a "other".
    const clear = function (best, other, len) { return best >= len * 0.5 && best >= other * 1.5; };

    // 1. Hoja de puerta: un trazo corto que toca la pared con un solo extremo y tiene el arco a un costado.
    cross.forEach(function (seg) {
      const len = seg.b - seg.a;
      if (len < minOpen || len > maxDoor) return;
      const atA = wallAt(seg.c, seg.a), atB = wallAt(seg.c, seg.b);
      if (!atA === !atB) return;
      const wl = atA || atB, side = atA ? 1 : -1, near = wl.c + side * 4, far = wl.c + side * len;
      const after = inkIn(m, mw, mh, seg.c + 4, seg.c + len, near, far), before = inkIn(m, mw, mh, seg.c - len, seg.c - 4, near, far);
      if (!clear(Math.max(after, before), Math.min(after, before), len)) return;
      const dir = after >= before ? 1 : -1;
      seg.leaf = true;
      doors.push({ wall: wl, from: Math.min(seg.c, seg.c + dir * len), to: Math.max(seg.c, seg.c + dir * len), hinge: seg.c, side: side });
    });

    // 2. Corte en la pared: se une la pared y el corte pasa a ser una puerta (si hay arco al lado) o un vano.
    walls.sort(function (p, q) { return p.c - q.c || p.a - q.a; });
    for (let i = 0; i < walls.length - 1;) {
      const cur = walls[i], next = walls[i + 1], gap = next.a - cur.b;
      if (Math.abs(next.c - cur.c) > 0.01 || gap < minOpen || gap > maxGap) { i++; continue; }
      const from = cur.b, to = next.a;
      doors.forEach(function (d) { if (d.wall === next) d.wall = cur; });
      cur.b = next.b; cur.linked = cur.linked || next.linked;
      walls.splice(i + 1, 1);
      if (doors.some(function (d) { return d.wall === cur && d.from <= to + tol && d.to >= from - tol; })) continue; // ya la explicó una hoja
      const below = inkIn(m, mw, mh, from, to, cur.c + 4, cur.c + gap), above = inkIn(m, mw, mh, from, to, cur.c - gap, cur.c - 4);
      if (!clear(Math.max(below, above), Math.min(below, above), gap)) { opens.push({ wall: cur, from: from, to: to }); continue; }
      const side = below >= above ? 1 : -1, strip = Math.max(4, gap * 0.15); // la hoja está del lado de la bisagra
      const atStart = inkIn(m, mw, mh, from - strip, from + strip, cur.c + side * 4, cur.c + side * gap);
      const atEnd = inkIn(m, mw, mh, to - strip, to + strip, cur.c + side * 4, cur.c + side * gap);
      doors.push({ wall: cur, from: from, to: to, hinge: atEnd > atStart ? to : from, side: side });
    }

    // 3. Ventana: un tramo de la pared con dos o más trazos paralelos (doble línea o un rectángulo encima).
    const reach = Math.round(tol);
    walls.forEach(function (wl) {
      const c = Math.round(wl.c), y0 = Math.max(0, c - reach), y1 = Math.min(mh - 1, c + reach);
      let start = -1, last = -1;
      const close = function () {
        const len = last - start;
        if (start >= 0 && len >= minOpen * 1.2 && len <= size * 0.3 && len <= (wl.b - wl.a) * 0.7 &&
            !doors.some(function (d) { return d.wall === wl && d.from <= last && d.to >= start; })) windows.push({ wall: wl, from: start, to: last });
        start = -1;
      };
      for (let x = Math.max(0, Math.round(wl.a)); x <= Math.min(mw - 1, Math.round(wl.b)); x++) {
        let bands = 0, run = 0, blank = 99, crossing = false;
        for (let y = y0; y <= y1 + 1; y++) {
          if (y <= y1 && m[y * mw + x]) { run++; continue; }
          if (run > reach) crossing = true; // una pared que cruza, no una ventana
          if (run && blank >= 3) bands++;   // dos trazos distintos están separados por papel; un poro en la tinta no cuenta
          if (run) blank = 0;
          blank++;
          run = 0;
        }
        if (bands >= 2 && !crossing) { if (start < 0) start = x; last = x; }
        else if (start >= 0 && x - last > 5) close();
      }
      close();
    });
    return { doors: doors, windows: windows, opens: opens };
  }

  /* gray: Uint8Array de w × h (0 = negro). detail: fracción del lado mayor que debe medir un trazo para contar
     como pared (más chico = más detalle y más ruido). Devuelve, en píxeles de la foto ya enderezada:
       segments: paredes {x1, y1, x2, y2}
       openings: {kind: "door" | "window" | "open", horizontal, x, y (centro), w (ancho)} y, en las puertas,
                 hx, hy (bisagra) y tx, ty (punta de la hoja abierta)
       box: rectángulo que envuelve las paredes · angle: grados para girar la foto y que coincida. */
  function vectorize(gray, w, h, detail) {
    const size = Math.max(w, h), minLen = size * (detail || 0.05), fat = Math.max(2, Math.round(size / 300)), tol = size * 0.022;
    const raw = inkMask(gray, w, h), angle = skew(raw, w, h), mask = angle ? rotate(raw, w, h, angle) : raw, turned = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) turned[x * h + y] = mask[y * w + x];
    // Se buscan también trazos más cortos que una pared: pueden ser hojas de puerta.
    const fine = Math.min(minLen, size * 0.03);
    const long = function (s) { return s.b - s.a >= minLen; }, short = function (s) { return s.b - s.a < minLen; };
    const allH = align(longRuns(mask, w, h, fine, fat), tol), allV = align(longRuns(turned, h, w, fine, fat), tol);
    let H = allH.filter(long), V = allV.filter(long);
    join(H, V, tol); // las esquinas se cierran solo entre paredes: un trazo corto no debe mover una pared
    join(V, H, tol);
    const onH = features(H, V.concat(allV.filter(short)), mask, w, h, size, tol);
    V = V.filter(function (s) { return !s.leaf; });
    const onV = features(V, H.concat(allH.filter(short)), turned, h, w, size, tol);
    H = H.filter(function (s) { return !s.leaf; });

    // Un trazo corto que no toca ninguna pared suele ser texto, una cota o un subrayado: se descarta.
    const wall = function (s) { return s.b - s.a >= minLen * 0.6 && (s.linked || s.b - s.a >= minLen * 3); };
    const segments = H.filter(wall).map(function (s) { return { x1: s.a, y1: s.c, x2: s.b, y2: s.c }; })
      .concat(V.filter(wall).map(function (s) { return { x1: s.c, y1: s.a, x2: s.c, y2: s.b }; }));

    const openings = [];
    [[onH, true], [onV, false]].forEach(function (pair) {
      const found = pair[0], horizontal = pair[1];
      const point = function (pos, c) { return horizontal ? { x: pos, y: c } : { x: c, y: pos }; };
      const add = function (kind, o) {
        if (o.wall.leaf || !wall(o.wall)) return null; // una hoja de puerta no es una pared
        const mid = point((o.from + o.to) / 2, o.wall.c), opening = { kind: kind, horizontal: horizontal, x: mid.x, y: mid.y, w: o.to - o.from };
        openings.push(opening);
        return opening;
      };
      found.windows.forEach(function (o) { add("window", o); });
      found.opens.forEach(function (o) { add("open", o); });
      // El arco de una puerta también deja trazos cortos junto a la pared: de las que se pisan queda la más ancha.
      const kept = [];
      found.doors.sort(function (p, q) { return (q.to - q.from) - (p.to - p.from); }).forEach(function (o) {
        if (kept.some(function (d) { return d.wall === o.wall && d.from <= o.to && d.to >= o.from; })) return;
        kept.push(o);
        const door = add("door", o);
        if (!door) return;
        const hinge = point(o.hinge, o.wall.c), tip = point(o.hinge, o.wall.c + o.side * (o.to - o.from));
        door.hx = hinge.x; door.hy = hinge.y; door.tx = tip.x; door.ty = tip.y;
      });
    });

    const xs = [], ys = [];
    segments.forEach(function (s) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); });
    return {
      segments: segments,
      openings: openings,
      angle: angle,
      box: segments.length ? { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) } : null
    };
  }

  B.sketch = { vectorize: vectorize };
})();
