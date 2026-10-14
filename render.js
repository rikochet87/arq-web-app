/* CalcuObra — render del plano: los mismos volúmenes de la vista 3D (lib/plan.js, solids), con cielo, sol,
   sombras y materiales. Usa el motor que carga view3d.js.
   Mientras se mueve la cámara se ve una imagen rápida. Al soltarla, la imagen se afina sola: se promedian
   SAMPLES cuadros, cada uno con el sol corrido dentro de su disco (sombra con penumbra), con una luz de cielo
   que llega desde un punto distinto de la bóveda (rincones más oscuros, sombra suave bajo los aleros) y con la
   cámara corrida una fracción de píxel (bordes lisos). Las texturas se pintan en el momento: no se descarga nada. */
(function () {
  "use strict";

  const B = window.__BRAND__ || (window.__BRAND__ = {});
  const M = 0.01;                 // cm → m
  const SAMPLES = 120, PRIOR = 4; // cuadros que se promedian; peso de la imagen rápida dentro del promedio
  const SUN = 4.6, SKY = 1.5;     // intensidad del sol a pleno y de la luz de cielo
  const RAD = Math.PI / 180;
  let live = null;

  const QUAD = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const SKY_VS = "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  const SKY_FS = "uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;\n" +
    "void main() { vec3 d = normalize(vDir); float s = max(dot(d, sunDir), 0.0);\n" +
    "  vec3 c = mix(horizon, zenith, pow(max(d.y, 0.0), 0.45)) + sunColor * (pow(s, 700.0) * 5.0 + pow(s, 10.0) * 0.16);\n" +
    "  gl_FragColor = vec4(c, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}";

  // Sucesión de Halton: reparte las muestras parejo, sin los amontonamientos del azar puro.
  function halton(i, base) {
    let f = 1, r = 0;
    for (; i > 0; i = Math.floor(i / base)) { f /= base; r += f * (i % base); }
    return r;
  }

  // ---------- Texturas pintadas ----------
  // Cada material se pinta dos veces: su color y su altura. De la altura sale el relieve (mapa de normales),
  // así las juntas, las ondas de la chapa y las tejas reciben la luz del sol como un volumen y no como un dibujo.
  const PX = 1024, TAU = 2 * Math.PI;
  const painted = {}; // se pintan una sola vez por página, y solo las que el plano usa
  function painter(seed) {
    let a = seed;
    return function () { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function sheet() {
    const c = document.createElement("canvas");
    c.width = c.height = PX;
    return c;
  }
  const shade = (rgb, k) => "rgb(" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",") + ")";
  const gray = (v) => shade([255, 255, 255], v);
  const fill = (g, color) => { g.fillStyle = color; g.fillRect(0, 0, PX, PX); };
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Una pieza (ladrillo, tabla, baldosa): su color en una imagen y su altura en la otra.
  // Lo que se sale por un borde entra por el opuesto, para que la imagen empalme al repetirse.
  function piece(g, h, x, y, w, t, color, height) {
    for (let dx = x + w > PX ? -PX : 0; dx <= 0; dx += PX) for (let dy = y + t > PX ? -PX : 0; dy <= 0; dy += PX) {
      g.fillStyle = color; g.fillRect(x + dx, y + dy, w, t);
      h.fillStyle = gray(height); h.fillRect(x + dx, y + dy, w, t);
    }
  }
  // Piezas cuadradas, `n` por lado, con su junta rehundida.
  function tiles(n, joint, rgb, vary, grout) {
    return function (g, h, rnd) {
      fill(g, grout); fill(h, gray(0.3));
      const s = PX / n;
      for (let i = 0; i < n * n; i++) piece(g, h, (i % n) * s + joint / 2, Math.floor(i / n) * s + joint / 2, s - joint, s - joint, shade(rgb, 1 - vary / 2 + rnd() * vary), 0.8);
    };
  }
  // Ruido suave que empalma en los bordes, entre −0,5 y 0,5: `cx` × `cy` celdas en toda la imagen, sumado en varias escalas.
  function noise(cx, cy, octaves, seed) {
    const out = new Float32Array(PX * PX);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++, cx *= 2, cy *= 2, amp /= 2) {
      const rnd = painter(seed + o * 101), grid = new Float32Array(cx * cy);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      const c0 = new Int32Array(PX), c1 = new Int32Array(PX), sx = new Float32Array(PX); // la cuenta por columna es la misma en todas las filas
      for (let x = 0; x < PX; x++) { const fx = x / PX * cx, x0 = Math.floor(fx), tx = fx - x0; c0[x] = x0 % cx; c1[x] = (x0 + 1) % cx; sx[x] = tx * tx * (3 - 2 * tx); }
      for (let y = 0; y < PX; y++) {
        const fy = y / PX * cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % cy) * cx, r1 = ((y0 + 1) % cy) * cx;
        for (let x = 0, at = y * PX; x < PX; x++, at++) {
          const a = grid[r0 + c0[x]], b = grid[r1 + c0[x]], top = a + (grid[r0 + c1[x]] - a) * sx[x], bottom = b + (grid[r1 + c1[x]] - b) * sx[x];
          out[at] += (top + (bottom - top) * sy) * amp;
        }
      }
      total += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] = out[i] / total - 0.5;
    return out;
  }
  // Redondea los cantos de la altura: promedia cada punto con sus vecinos.
  function soften(H) {
    const T = new Float32Array(H.length);
    for (let y = 0; y < PX; y++) for (let x = 0, r = y * PX; x < PX; x++) T[r + x] = (H[r + (x + PX - 1) % PX] + H[r + x] + H[r + (x + 1) % PX]) / 3;
    for (let y = 0; y < PX; y++) for (let x = 0, r = y * PX, u = ((y + PX - 1) % PX) * PX, d = ((y + 1) % PX) * PX; x < PX; x++) H[r + x] = (T[u + x] + T[r + x] + T[d + x]) / 3;
  }

  /* size: metros que cubre la imagen antes de repetirse (ancho, alto). depth: metros entre lo más hundido y lo más
     salido. draw pinta el color (g) y la altura (h, de negro a blanco). finish retoca punto por punto: px es el color
     y H la altura. soft: cuánto se redondean los cantos. tooth y mottle suman ruido [celdas x, celdas y, escalas,
     cuánto] a la altura y al color. La imagen se ve con el borde de arriba hacia arriba (o cuesta arriba, en el techo). */
  const PAINT = {
    plaster: { size: [3, 3], depth: 0.003, tooth: [[256, 256, 2, 1], [20, 20, 3, 0.5]], mottle: [[3, 3, 4, 0.05], [90, 3, 2, 0.03], [300, 300, 1, 0.03]],
      draw: function (g) { fill(g, "#f6f4f0"); } },
    concrete: { size: [3, 3], depth: 0.002, tooth: [[300, 300, 1, 0.7], [10, 10, 3, 0.5]], mottle: [[4, 4, 5, 0.16], [400, 400, 1, 0.07]],
      draw: function (g) { fill(g, "#aaa8a2"); } },
    brick: { size: [2.04, 1.92], depth: 0.008, soft: 1, tooth: [[256, 256, 2, 0.3]], mottle: [[6, 6, 4, 0.14], [340, 320, 1, 0.12]],
      draw: function (g, h, rnd) { // ladrillo común de 24 × 6,5 cm con junta de 1,5 cm: 8 por hilada, 24 hiladas trabadas
        fill(g, "#b3aa9b"); fill(h, gray(0.2));
        const w = PX / 8, t = PX / 24;
        for (let i = 0; i < 192; i++) {
          const row = Math.floor(i / 8), burnt = rnd() < 0.12 ? 0.68 : 1; // alguno más cocido que el resto
          piece(g, h, (i % 8) * w + (row % 2) * w / 2, row * t, w - 7.5, t - 8, shade([162, 86, 60], burnt * (0.84 + rnd() * 0.3)), 0.7 + rnd() * 0.2);
        }
      } },
    stone: { size: [2.4, 2.4], depth: 0.02, tooth: [[110, 110, 3, 0.4]], mottle: [[9, 9, 4, 0.2], [300, 300, 1, 0.08]],
      draw: function () {},
      finish: function (px, H, rnd) { // piedras irregulares: a cada punto le toca la piedra cuyo centro tiene más cerca
        const cx = 6, cy = 11, sx = PX / cx, sy = PX / cy, seeds = [];
        for (let i = 0; i < cx * cy; i++) seeds.push([0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.74 + rnd() * 0.4, rnd() - 0.5]);
        for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
          const fx = x / sx, fy = y / sy, gx = Math.floor(fx), gy = Math.floor(fy);
          let near = 1e9, next = 1e9, own = null;
          for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
            const s = seeds[((j + cy) % cy) * cx + (i + cx) % cx], d = Math.hypot((i + s[0] - fx) * sx, (j + s[1] - fy) * sy);
            if (d < near) { next = near; near = d; own = s; } else if (d < next) next = d;
          }
          const edge = next - near, body = smooth(3, 8, edge), at = (y * PX + x) * 4;
          px[at] = 112 + (160 * own[2] * (1 + 0.1 * own[3]) - 112) * body;
          px[at + 1] = 106 + (149 * own[2] - 106) * body;
          px[at + 2] = 96 + (132 * own[2] * (1 - 0.14 * own[3]) - 96) * body;
          px[at + 3] = 255;
          H[y * PX + x] = 0.15 + 0.75 * smooth(2, 24, edge);
        }
      } },
    grass: { size: [8, 8], depth: 0.02, tooth: [[512, 512, 1, 1], [60, 60, 3, 0.6]], mottle: [[4, 4, 4, 0.2], [512, 512, 1, 0.22]],
      draw: function (g, h, rnd) {
        fill(g, "#4f6833");
        for (let i = 0; i < 90000; i++) { g.fillStyle = shade([84, 110, 54], 0.72 + rnd() * 0.5); g.fillRect(rnd() * PX, rnd() * PX, 1 + rnd() * 2, 2 + rnd() * 5); }
      },
      finish: function (px) { // manchones más secos
        const dry = noise(5, 5, 3, 97);
        for (let i = 0; i < PX * PX; i++) {
          const k = Math.max(0, dry[i]) * 0.9, at = i * 4;
          px[at] += (150 - px[at]) * k; px[at + 1] += (142 - px[at + 1]) * k; px[at + 2] += (78 - px[at + 2]) * k;
        }
      } },
    wood: { size: [2.4, 1.52], depth: 0.0012, soft: 1, tooth: [[4, 300, 2, 0.5]], mottle: [[6, 180, 3, 0.22], [3, 3, 3, 0.06]], // el ruido estirado es la veta
      draw: function (g, h, rnd) { // tablas de 120 × 19 cm, con las juntas trabadas
        fill(g, "#3b2414"); fill(h, gray(0.3));
        const w = PX / 2, t = PX / 8;
        for (let row = 0; row < 8; row++) {
          const shift = Math.floor(rnd() * w);
          for (let col = 0; col < 2; col++) piece(g, h, (col * w + shift) % PX, row * t + 1, w - 2, t - 2, shade([176, 128, 84], 0.8 + rnd() * 0.36), 0.8);
        }
      } },
    tile: { size: [2.4, 2.4], depth: 0.0015, soft: 1, tooth: [[200, 200, 2, 0.2]], mottle: [[12, 12, 4, 0.07], [400, 400, 1, 0.03]], draw: tiles(4, 4, [216, 206, 190], 0.07, "#8f887c") }, // cerámico de 60 × 60
    porcelain: { size: [2.4, 2.4], depth: 0.001, soft: 1, mottle: [[3, 3, 5, 0.12], [2, 9, 4, 0.06]], draw: tiles(3, 2.5, [208, 207, 203], 0.03, "#8d8c88") },                             // porcelanato de 80 × 80
    paving: { size: [1.6, 1.6], depth: 0.003, soft: 1, tooth: [[300, 300, 2, 0.6]], mottle: [[8, 8, 4, 0.16], [400, 400, 1, 0.1]], draw: tiles(4, 8, [158, 154, 146], 0.16, "#66635e") }, // baldosa de 40 × 40
    veneer: { size: [1.6, 1.6], depth: 0.0006, tooth: [[4, 300, 2, 0.4]], mottle: [[4, 160, 3, 0.24], [2, 2, 3, 0.08]], // madera de mueble: la veta, sin juntas
      draw: function (g) { fill(g, "#b68c5e"); } },
    fabric: { size: [0.8, 0.8], depth: 0.0012, mottle: [[6, 6, 3, 0.08], [256, 256, 1, 0.1]], // tela tejida: los hilos pasan uno por arriba y otro por abajo
      draw: function () {},
      finish: function (px, H) {
        for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
          const over = ((x >> 2) + (y >> 2)) & 1, thread = Math.abs(Math.sin((over ? x : y) * Math.PI / 4)), k = 0.84 + 0.16 * thread, at = (y * PX + x) * 4;
          px[at] = px[at + 1] = px[at + 2] = 240 * k; px[at + 3] = 255;
          H[y * PX + x] = thread;
        }
      } },
    granite: { size: [1.2, 1.2], depth: 0.0002, mottle: [[8, 8, 4, 0.16]],
      draw: function (g, h, rnd) { // granito gris: fondo oscuro con granos claros, negros y algunos rosados
        fill(g, "#5f5d5b");
        const grains = ["190,188,184", "30,30,32", "150,146,142", "168,140,132"];
        for (let i = 0; i < 70000; i++) { g.fillStyle = "rgba(" + grains[Math.floor(rnd() * 3.25)] + "," + (0.35 + rnd() * 0.5).toFixed(2) + ")"; g.fillRect(rnd() * PX, rnd() * PX, 1 + rnd() * 4, 1 + rnd() * 4); }
      } },
    chapa: { size: [1.216, 1.216], depth: 0.018, mottle: [[64, 2, 2, 0.05], [5, 5, 3, 0.05]], // 16 ondas de 7,6 cm; las vetas corren con la pendiente
      draw: function () {},
      finish: function (px, H) { // el fondo de cada onda va algo más oscuro: de lejos el relieve se pierde y queda el rayado
        for (let i = 0; i < PX * PX; i++) {
          const wave = 0.5 + 0.5 * Math.sin((i % PX) / 64 * TAU), k = 0.74 + 0.26 * wave, at = i * 4;
          px[at] = 160 * k; px[at + 1] = 169 * k; px[at + 2] = 175 * k; px[at + 3] = 255;
          H[i] = wave;
        }
      } },
    tejas: { size: [1.28, 1.28], depth: 0.04, tooth: [[200, 200, 2, 0.05]], mottle: [[10, 10, 4, 0.16], [300, 300, 1, 0.08]],
      draw: function () {},
      finish: function (px, H, rnd) { // teja colonial: 8 lomos de 16 cm por hilada, hiladas de 32 cm que montan sobre la de abajo
        const tone = [];
        for (let i = 0; i < 32; i++) tone.push(0.9 + rnd() * 0.2);
        for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
          const down = (y & 255) / 256, round = 0.5 + 0.5 * Math.cos(x / 128 * TAU), at = (y * PX + x) * 4;
          const k = tone[(y >> 8) * 8 + (Math.round(x / 128) & 7)] * (0.68 + 0.32 * Math.min(1, down * 5)) * (0.82 + 0.18 * round);
          px[at] = 188 * k; px[at + 1] = 94 * k; px[at + 2] = 62 * k; px[at + 3] = 255;
          H[y * PX + x] = 0.62 * round + 0.38 * down;
        }
      } }
  };

  // Pinta un material: devuelve la imagen de color y la de relieve.
  function paint(def) {
    const color = sheet(), normal = sheet(), g = color.getContext("2d", { willReadFrequently: true }), h = normal.getContext("2d", { willReadFrequently: true }), rnd = painter(7), n = PX * PX;
    fill(g, "#808080"); fill(h, gray(0.5));
    def.draw(g, h, rnd);
    const img = g.getImageData(0, 0, PX, PX), px = img.data, raw = h.getImageData(0, 0, PX, PX).data, H = new Float32Array(n);
    for (let i = 0; i < n; i++) H[i] = raw[i * 4] / 255;
    if (def.finish) def.finish(px, H, rnd);
    for (let pass = 0; pass < (def.soft || 0); pass++) soften(H);
    (def.tooth || []).forEach(function (t, k) { const f = noise(t[0], t[1], t[2], 31 + k * 17); for (let i = 0; i < n; i++) H[i] += f[i] * t[3]; });
    (def.mottle || []).forEach(function (m, k) {
      const f = noise(m[0], m[1], m[2], 53 + k * 29);
      for (let i = 0; i < n; i++) { const s = 1 + f[i] * m[3], at = i * 4; px[at] *= s; px[at + 1] *= s; px[at + 2] *= s; }
    });
    g.putImageData(img, 0, 0);
    // La pendiente de la altura, en metros por metro, es lo que inclina la superficie hacia la luz.
    const out = h.createImageData(PX, PX), np = out.data, kx = def.depth * PX / (2 * def.size[0]), ky = def.depth * PX / (2 * def.size[1]);
    for (let y = 0; y < PX; y++) for (let x = 0, r = y * PX, u = ((y + PX - 1) % PX) * PX, d = ((y + 1) % PX) * PX; x < PX; x++) {
      const nx = (H[r + (x + PX - 1) % PX] - H[r + (x + 1) % PX]) * kx, ny = (H[d + x] - H[u + x]) * ky, len = Math.sqrt(nx * nx + ny * ny + 1), at = (r + x) * 4;
      np[at] = (nx / len * 0.5 + 0.5) * 255; np[at + 1] = (ny / len * 0.5 + 0.5) * 255; np[at + 2] = (0.5 / len + 0.5) * 255; np[at + 3] = 255;
    }
    h.putImageData(out, 0, 0);
    return { color: color, normal: normal };
  }

  // Terminación de los muros por fuera: nombre, textura y ajustes del material.
  const WALLS = {
    blanco: ["Revoque blanco", "plaster", { color: 0xf3eee4 }],
    arena: ["Revoque arena", "plaster", { color: 0xd8c29c }],
    gris: ["Revoque gris", "plaster", { color: 0xb4b1a9 }],
    ladrillo: ["Ladrillo visto", "brick", {}],
    piedra: ["Piedra", "stone", {}]
  };
  // De qué está hecho cada mueble o artefacto de la biblioteca (lib/manifest.js). Lo que no figura va de madera.
  const MADE = {
    sofa3: "sofa", sofa2: "sofa", sillon: "sofa", cama2: "bed", camaQueen: "bed", cama1: "bed",
    mesada: "granite", cocina: "enamel", lavarropas: "enamel", termotanque: "enamel", heladera: "steel",
    inodoro: "loza", bidet: "loza", lavatorio: "loza", banera: "loza", ducha: "loza", piletaLavar: "loza",
    escalera: "step", parrilla: "grill", auto: "car", arbol: "leaves", pileta: "water"
  };
  const prefs = { hour: 14.5, walls: "blanco" }; // lo último que se eligió: se conserva al volver a abrir el render

  // ---------- Vista ----------
  function close() {
    if (!live) return;
    cancelAnimationFrame(live.frame);
    live.observer.disconnect();
    live.controls.dispose();
    live.trash.forEach(function (t) { t.dispose(); });
    live.renderer.dispose();
    live.renderer.domElement.remove();
    live.ui.forEach(function (el) { el.remove(); });
    live = null;
  }

  /* opts: roof (mostrar el techo), hour (hora del día, 7 a 19), walls (terminación de los muros por fuera: una de WALLS), onProgress(0–1: cuánto se afinó la imagen).
     Devuelve { set(opts), view("exterior" | "aerial"), shot(listo(blob)) }. */
  async function open(container, plan, opts) {
    close();
    opts = Object.assign({ roof: true }, prefs, opts);
    if (!WALLS[opts.walls]) opts.walls = "blanco";
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("WebGL no disponible");
    const THREE = await B.view3d.load();
    const data = B.plan.solids(plan, { roof: true }), ridge = B.plan.roofShape(plan), trash = [];
    const keep = function (thing) { trash.push(thing); return thing; };

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    // Para promediar hace falta dibujar sobre una imagen de más rango que la pantalla; sin eso queda la imagen rápida.
    const hdr = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));

    // Materiales. Las texturas van en metros: cada pieza trae sus coordenadas en esa unidad.
    const sharp = renderer.capabilities.getMaxAnisotropy(), maps = {}, made = {};
    function textures(name) {
      if (maps[name]) return maps[name];
      const def = PAINT[name], image = painted[name] || (painted[name] = paint(def));
      const wrap = function (canvas, color) {
        const t = keep(new THREE.CanvasTexture(canvas));
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / def.size[0], 1 / def.size[1]);
        t.anisotropy = sharp;
        if (color) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      return maps[name] = { map: wrap(image.color, true), normalMap: wrap(image.normal) };
    }
    const surface = function (name, o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }, textures(name), o)); };
    const plain = function (color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.6 }, o)); };
    const over = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }; // la cubierta gana donde apoya justo sobre el borde de un muro
    const RECIPE = {
      int: ["plaster", { color: 0xffffff }],
      "roof-chapa": ["chapa", Object.assign({ roughness: 0.42, metalness: 0.25 }, over)], "roof-tejas": ["tejas", Object.assign({ roughness: 0.85 }, over)], "roof-losa": ["concrete", Object.assign({ color: 0xd9d6cf }, over)],
      flotante: ["wood", { roughness: 0.55 }], ceramico: ["tile", { roughness: 0.5 }], porcelanato: ["porcelain", { roughness: 0.22 }],
      alisado: ["concrete", { roughness: 0.6 }], sin: ["concrete", { color: 0xcfc6b8 }], paving: ["paving"], grass: ["grass", { roughness: 1 }],
      glass: [0x6f8fa3, { roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.42, side: THREE.DoubleSide, envMapIntensity: 3 }],
      trim: [0xdedbd5, { side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }],
      frame: [0xf2f1ee, { roughness: 0.45, metalness: 0.15 }], leaf: ["wood", { color: 0x9a7b62, roughness: 0.5, side: THREE.FrontSide }],
      // Muebles y artefactos
      "it-wood": ["veneer", { roughness: 0.55 }], "it-sofa": ["fabric", { color: 0x8d9197, roughness: 1 }], "it-bed": ["fabric", { color: 0xece7dc, roughness: 1 }],
      "it-granite": ["granite", { roughness: 0.22 }], "it-enamel": [0xf3f3f1, { roughness: 0.3 }], "it-steel": [0xb7bbc0, { roughness: 0.35, metalness: 0.6 }], "it-loza": [0xfafaf6, { roughness: 0.12 }],
      "it-step": ["concrete"], "it-grill": ["brick"], "it-car": [0x56606c, { roughness: 0.3, metalness: 0.5 }], "it-leaves": ["grass", { color: 0x86a070, roughness: 1 }], "it-water": [0x3f8fb4, { roughness: 0.05, metalness: 0.1 }]
    };
    Object.keys(WALLS).forEach(function (k) { RECIPE["wall-" + k] = WALLS[k].slice(1); });
    // Cada material se arma la primera vez que hace falta: pintar una textura lleva su tiempo.
    function material(kind) {
      const r = RECIPE[kind];
      return made[kind] || (made[kind] = keep(typeof r[0] === "string" ? surface(r[0], r[1]) : plain(r[0], r[1])));
    }

    /* Caja con la textura a escala: sus caras salen de a pares (±X, ±Y, ±Z) y cada una mide lo que mide.
       along y up dicen dónde está la caja a lo largo del muro y sobre el piso: con eso las hiladas de ladrillo
       siguen de un tramo al otro, también por arriba y por abajo de una ventana. */
    function box(w, h, d, along, up) {
      const g = keep(new THREE.BoxGeometry(w, h, d)), uv = g.attributes.uv, size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i++) {
        const face = i >> 2;
        uv.setXY(i, uv.getX(i) * size[face][0] + (face === 4 ? along || 0 : face === 5 ? -(along || 0) - w : 0), uv.getY(i) * size[face][1] + (face === 2 || face === 3 ? 0 : up || 0));
      }
      return g;
    }
    const scene = new THREE.Scene(), house = new THREE.Group(), roof = new THREE.Group();
    scene.add(house, roof);
    function put(parent, geometry, kind, casts) {
      const mesh = new THREE.Mesh(geometry, kind && material(kind));
      mesh.castShadow = casts !== false; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    // Muros que dan afuera: llevan la terminación elegida en las caras exteriores y revoque en las que dan a un ambiente.
    const fronts = [], indoor = data.rooms.filter(function (r) { return !r.surface; });
    function faces(b) { // por cada cara larga del tramo (+Z y −Z de su caja): ¿da afuera?
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, len = Math.hypot(dx, dy) || 1, off = b.thick / 2 + 8;
      return [1, -1].map(function (way) {
        const p = { x: (b.a.x + b.b.x) / 2 - dy / len * off * way, y: (b.a.y + b.b.y) / 2 + dx / len * off * way };
        return !indoor.some(function (r) { return r.level === b.level && B.plan.inside(r.points, p); });
      });
    }
    function dress() {
      const front = material("wall-" + opts.walls), back = material("int");
      fronts.forEach(function (f) { f.mesh.material = f.out ? [front, front, back, back, f.out[0] ? front : back, f.out[1] ? front : back] : front; });
    }
    // Un tramo a → b del plano, parado entre z0 y z1: el plano (x, y) es el piso (x, z) de la escena.
    function span(b, thick) {
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, group = new THREE.Group();
      group.position.set((b.a.x + b.b.x) / 2 * M, (b.z0 + b.z1) / 2 * M, (b.a.y + b.b.y) / 2 * M);
      group.rotation.y = -Math.atan2(dy, dx);
      house.add(group);
      return { group: group, len: Math.hypot(dx, dy) * M, tall: (b.z1 - b.z0) * M, thick: thick * M };
    }
    data.boxes.forEach(function (b) {
      const s = span(b, b.thick);
      if (b.kind === "ext") {
        const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y;
        fronts.push({ mesh: put(s.group, box(s.len, s.tall, s.thick, (b.a.x * dx + b.a.y * dy) / (Math.hypot(dx, dy) || 1) * M, b.z0 * M)), out: faces(b) });
        return;
      }
      if (b.kind !== "glass") { put(s.group, box(s.len, s.tall, s.thick), b.kind); return; }
      put(s.group, box(s.len, s.tall, 0.012), "glass", false); // el vidrio deja pasar el sol
      const bar = 0.05, deep = 0.07, parts = [[s.len, bar, 0, s.tall / 2 - bar / 2], [s.len, bar, 0, bar / 2 - s.tall / 2], [bar, s.tall, s.len / 2 - bar / 2, 0], [bar, s.tall, bar / 2 - s.len / 2, 0]];
      if (s.len > 1) parts.push([bar * 0.8, s.tall, 0, 0]); // dos hojas
      parts.forEach(function (p) { put(s.group, box(p[0], p[1], deep), "frame").position.set(p[2], p[3], 0); });
    });
    data.doors.forEach(function (d) { const s = span(d, 4.5); put(s.group, box(s.len - 0.03, s.tall - 0.01, s.thick), "leaf"); });
    data.items.forEach(function (it) {
      const mesh = put(house, box(it.w * M, it.h * M, it.d * M), "it-" + (MADE[it.type] || "wood"));
      mesh.position.set(it.x * M, (it.z + it.h / 2) * M, it.y * M);
      mesh.rotation.y = -it.r * Math.PI / 180;
    });
    data.rooms.forEach(function (room) { // la geometría del piso ya trae sus coordenadas en metros
      const shape = new THREE.Shape(room.points.map(function (p) { return new THREE.Vector2(p.x * M, p.y * M); }));
      const kind = room.surface ? (room.surface === "cesped" ? "grass" : room.surface === "cochera" ? "alisado" : "paving") : room.floor;
      const mesh = put(house, keep(new THREE.ShapeGeometry(shape)), RECIPE[kind] ? kind : "ceramico", false);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = room.z * M + (room.surface ? 0.03 : 0.04);
    });
    // Techo: caras trianguladas en abanico. La textura corre a lo largo de la pendiente.
    // La cubierta lleva además un canto de 12 cm en todo su borde, para que no parezca una hoja de papel.
    const EDGE = 0.12;
    data.roof.forEach(function (poly) {
      const at = [], uv = [], lengthwise = !ridge || ridge.alongX;
      if (poly.kind !== "ext") {
        const rim = [], n = poly.points.length;
        poly.points.forEach(function (p, i) {
          const q = poly.points[(i + 1) % n];
          rim.push(p.x * M, p.z * M, p.y * M, q.x * M, q.z * M, q.y * M, q.x * M, q.z * M - EDGE, q.y * M, p.x * M, p.z * M, p.y * M, q.x * M, q.z * M - EDGE, q.y * M, p.x * M, p.z * M - EDGE, p.y * M);
        });
        const skirt = keep(new THREE.BufferGeometry());
        skirt.setAttribute("position", new THREE.Float32BufferAttribute(rim, 3));
        skirt.computeVertexNormals();
        put(roof, skirt, "trim");
      }
      // El frente de cada cara mira hacia afuera (la cubierta hacia arriba, el cerramiento hacia el alero):
      // si quedara al revés, la corrección de sombras la empujaría hacia adentro y la cara se taparía a sí misma.
      const pts = poly.points.slice(), a = pts[0], b = pts[1], c = pts[2], mid = pts.reduce(function (t, p) { return { x: t.x + p.x / pts.length, y: t.y + p.y / pts.length }; }, { x: 0, y: 0 });
      const out = poly.kind !== "ext" ? (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y)
        : ((b.z - a.z) * (c.y - a.y) - (b.y - a.y) * (c.z - a.z)) * (mid.x - (ridge.x0 + ridge.x1) / 2) + ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) * (mid.y - (ridge.y0 + ridge.y1) / 2);
      if (out < 0) pts.reverse();
      // La textura de la cubierta se pinta cuesta arriba: en cada agua se la da vuelta si hace falta, para que las tejas monten hacia abajo.
      const run = function (p) { return lengthwise ? p.y : p.x; }, high = pts.reduce(function (t, p) { return p.z > t.z ? p : t; }), low = pts.reduce(function (t, p) { return p.z < t.z ? p : t; }), climb = run(high) < run(low) ? -1 : 1;
      for (let i = 1; i < pts.length - 1; i++) {
        [pts[0], pts[i], pts[i + 1]].forEach(function (p) {
          at.push(p.x * M, p.z * M, p.y * M);
          if (poly.kind === "ext") uv.push((p.x + p.y) * M, p.z * M); else uv.push((lengthwise ? p.x : p.y) * M, run(p) * climb * M);
        });
      }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(at, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      if (poly.kind === "ext") fronts.push({ mesh: put(roof, g) }); else put(roof, g, poly.kind);
    });
    const bounds = new THREE.Box3().setFromObject(house).union(new THREE.Box3().setFromObject(roof));
    const center = bounds.getCenter(new THREE.Vector3()), size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 4), reach = size * 0.75 + 2;

    const lawn = put(scene, keep(new THREE.CircleGeometry(400, 48)), "grass", false);
    lawn.material = keep(material("grass").clone());
    ["map", "normalMap"].forEach(function (k) { lawn.material[k] = keep(lawn.material[k].clone()); lawn.material[k].repeat.set(800 / PAINT.grass.size[0], 800 / PAINT.grass.size[1]); lawn.material[k].rotation = 0.5; }); // girado: la repetición no queda alineada con la casa
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(center.x, 0, center.z);

    // Cielo: una bóveda pintada que sigue a la cámara, y la misma bóveda como luz de ambiente y reflejo de los vidrios.
    const sky = { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() } };
    const skyMaterial = keep(new THREE.ShaderMaterial({ uniforms: sky, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(900, 32, 16)), skyMaterial), around = new THREE.Scene(), pmrem = keep(new THREE.PMREMGenerator(renderer));
    around.add(new THREE.Mesh(dome.geometry, skyMaterial));
    scene.add(dome);
    scene.environmentIntensity = 0.22;
    scene.fog = new THREE.Fog(0xffffff, 60, 380);

    const sun = new THREE.DirectionalLight(), skylight = new THREE.DirectionalLight(), dim = new THREE.HemisphereLight(0xffffff, 0x000000, SKY / 2), bounce = new THREE.HemisphereLight(0x000000, 0x8c7a5e, 0.35);
    [[sun, 2048], [skylight, 1024]].forEach(function (pair) {
      const light = pair[0], cam = light.shadow.camera;
      light.castShadow = true;
      light.shadow.mapSize.set(pair[1], pair[1]);
      light.shadow.bias = -0.0004; light.shadow.normalBias = 0.03;
      cam.left = cam.bottom = -reach; cam.right = cam.top = reach; cam.near = 0.5; cam.far = reach * 4;
      cam.updateProjectionMatrix();
      light.target.position.copy(center);
      scene.add(light, light.target);
    });
    scene.add(dim, bounce);
    const aim = function (light, dir) { light.position.copy(center).addScaledVector(dir, reach * 2); };

    // El sol sale por el este (derecha del plano), pasa por el norte (arriba) y se pone por el oeste.
    // Sube hasta unos 46°, como en otoño o primavera: más bajo que en verano, para que ilumine las fachadas.
    const noon = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3();
    const white = new THREE.Color(1, 1, 1);
    let envMap = null, sunPower = SUN;
    function daylight() {
      const t = Math.max(0.03, Math.min(0.97, (opts.hour - 6.5) / 12.5)), el = (4 + 42 * Math.sin(Math.PI * t)) * RAD, az = Math.PI * t;
      const k = Math.max(0, Math.min(1, (el / RAD - 6) / 24)), warm = k * k * (3 - 2 * k), mix = function (a, b) { return a.map(function (v, i) { return v + (b[i] - v) * warm; }); };
      noon.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
      side.crossVectors(noon, new THREE.Vector3(0, 1, 0)).normalize(); up.crossVectors(side, noon);
      sky.sunDir.value.copy(noon);
      sky.sunColor.value.setRGB.apply(sky.sunColor.value, mix([1, 0.55, 0.28], [1, 0.95, 0.88]));
      sky.zenith.value.setRGB.apply(sky.zenith.value, mix([0.2, 0.27, 0.5], [0.1, 0.3, 0.78]));
      sky.horizon.value.setRGB.apply(sky.horizon.value, mix([0.95, 0.62, 0.4], [0.58, 0.75, 0.95]));
      scene.fog.color.copy(sky.horizon.value);
      sun.color.copy(sky.sunColor.value);
      skylight.color.copy(sky.horizon.value).lerp(white, 0.5);
      dim.color.copy(skylight.color);
      sunPower = SUN * (0.4 + 0.6 * warm);
      if (envMap) envMap.dispose();
      envMap = pmrem.fromScene(around, 0, 1, 2000);
      scene.environment = envMap.texture;
    }

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2500), controls = new THREE.OrbitControls(camera, dom);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 1.5; controls.maxDistance = size * 5;
    let sample = 0; // 0 = hay que dibujar de nuevo
    // La cámara se aleja lo justo para que la casa entre entera, también en una pantalla angosta.
    function view(name) {
      const half = camera.fov * RAD / 2, narrow = Math.min(half, Math.atan(Math.tan(half) * camera.aspect)), away = size * 0.34 / Math.sin(narrow);
      controls.target.set(center.x, bounds.max.y * 0.42, center.z);
      dir.set(name === "aerial" ? 0.25 : 0.72, name === "aerial" ? 0.85 : 0.17, name === "aerial" ? -0.46 : -0.64).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, away);
      camera.position.y = Math.max(camera.position.y, 1.7);
      controls.update();
      sample = 0;
    }
    controls.addEventListener("change", function () { sample = 0; });

    // Imágenes intermedias: "shot" es el cuadro recién dibujado y "sum" el promedio de los cuadros.
    const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), board = new THREE.Scene(), sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)));
    sheet.frustumCulled = false;
    board.add(sheet);
    const target = function (o) { return keep(new THREE.WebGLRenderTarget(4, 4, Object.assign({ type: THREE.HalfFloatType }, o))); };
    const shot = hdr && target({ samples: 4 }), sum = hdr && target({ depthBuffer: false });
    const blend = keep(new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, weight: { value: 1 } }, vertexShader: QUAD, transparent: true, depthTest: false, depthWrite: false,
      fragmentShader: "uniform sampler2D map; uniform float weight; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, weight); }"
    }));
    const show = keep(new THREE.ShaderMaterial({
      uniforms: { map: { value: null } }, vertexShader: QUAD, depthTest: false, depthWrite: false,
      fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}"
    }));

    let width = 0, height = 0;
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return; // pestaña en segundo plano o panel oculto
      renderer.setSize(w, h, false);
      const real = renderer.getDrawingBufferSize(new THREE.Vector2());
      width = real.x; height = real.y;
      if (hdr) { shot.setSize(width, height); sum.setSize(width, height); }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      sample = 0;
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ---------- Controles ----------
    const bar = document.createElement("div"), note = document.createElement("div");
    bar.className = "v3d-bar";
    bar.innerHTML = '<button type="button" data-r3d="exterior" title="Vista desde afuera">Exterior</button>' +
      '<button type="button" data-r3d="aerial" title="Vista desde arriba">Aérea</button>' +
      '<button type="button" data-r3d="roof" aria-pressed="true" title="Mostrar u ocultar el techo">Techo</button>' +
      '<label title="Terminación de los muros por fuera">Muros <select aria-label="Terminación de los muros por fuera">' + Object.keys(WALLS).map(function (k) { return '<option value="' + k + '">' + WALLS[k][0] + "</option>"; }).join("") + "</select></label>" +
      '<label title="Hora del día: mueve el sol">Hora <input type="range" min="7" max="19" step="0.25" aria-label="Hora del día"><output></output></label>' +
      '<button type="button" data-r3d="save" title="Guardar la imagen como PNG">Descargar imagen</button>';
    note.className = "v3d-hint";
    container.appendChild(bar); container.appendChild(note);
    const slider = bar.querySelector("input"), clock = bar.querySelector("output"), roofBtn = bar.querySelector('[data-r3d="roof"]'), finish = bar.querySelector("select");
    function sync() {
      prefs.hour = opts.hour; prefs.walls = opts.walls;
      finish.value = opts.walls;
      dress();
      roof.visible = !!opts.roof;
      roofBtn.hidden = !data.roof.length;
      roofBtn.setAttribute("aria-pressed", String(!!opts.roof));
      slider.value = opts.hour;
      clock.textContent = Math.floor(opts.hour) + ":" + ("0" + Math.round(opts.hour % 1 * 60)).slice(-2);
      daylight();
      sample = 0;
    }
    function save(done) { dom.toBlob(done, "image/png"); }
    bar.addEventListener("click", function (e) {
      const b = e.target.closest("button[data-r3d]"), name = b && b.getAttribute("data-r3d");
      if (name === "roof") { opts.roof = !opts.roof; sync(); }
      else if (name === "save") save(function (blob) {
        const a = document.createElement("a"), url = URL.createObjectURL(blob);
        a.href = url; a.download = "render.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
      else if (name) view(name);
    });
    slider.addEventListener("input", function () { opts.hour = Number(slider.value); sync(); });
    finish.addEventListener("change", function () { opts.walls = finish.value; sync(); });

    function draw() {
      const still = sample > 0 && hdr, i = sample;
      // Cuadro quieto: sol dentro de su disco, luz de cielo desde un punto de la bóveda y cámara corrida menos de un píxel.
      if (still) {
        const r = 0.011 * Math.sqrt(halton(i, 11)), a = 2 * Math.PI * halton(i, 13), y = 0.1 + 0.9 * halton(i, 2), flat2 = Math.sqrt(1 - y * y), turn = 2 * Math.PI * halton(i, 3);
        dir.copy(noon).addScaledVector(side, r * Math.cos(a)).addScaledVector(up, r * Math.sin(a)).normalize();
        aim(sun, dir);
        aim(skylight, dir.set(flat2 * Math.cos(turn), y, flat2 * Math.sin(turn)));
        camera.setViewOffset(width, height, halton(i, 5) - 0.5, halton(i, 7) - 0.5, width, height);
      } else { aim(sun, noon); camera.clearViewOffset(); }
      sun.intensity = sunPower;
      skylight.visible = still; skylight.intensity = SKY;
      dim.visible = !still;
      dome.position.copy(camera.position);
      if (!hdr) { renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera); sample = SAMPLES + 1; return; }
      renderer.setRenderTarget(shot); renderer.clear(); renderer.render(scene, camera);
      sheet.material = blend; blend.uniforms.map.value = shot.texture; blend.uniforms.weight.value = still ? 1 / (i + PRIOR) : 1;
      renderer.setRenderTarget(sum); renderer.render(board, flat);
      sheet.material = show; show.uniforms.map.value = sum.texture;
      renderer.setRenderTarget(null); renderer.render(board, flat);
      sample++;
    }

    const state = { renderer: renderer, controls: controls, observer: observer, frame: 0, ui: [bar, note], trash: trash };
    live = state;
    resize(); sync(); view("exterior");
    (function tick() {
      if (live !== state) return;
      state.frame = requestAnimationFrame(tick);
      if (document.hidden || !width) return;
      controls.update();
      if (sample > SAMPLES) return; // imagen terminada: no se gasta más
      draw();
      const done = hdr ? Math.min(1, (sample - 1) / SAMPLES) : 1;
      note.hidden = done >= 1;
      note.textContent = "Afinando la imagen… " + Math.round(done * 100) + " %";
      if (opts.onProgress) opts.onProgress(done);
    })();
    trash.push({ dispose: function () { if (envMap) envMap.dispose(); } });

    return {
      set: function (next) { Object.assign(opts, next); sync(); },
      view: view, shot: save,
      get progress() { return hdr ? Math.min(1, (sample - 1) / SAMPLES) : 1; }
    };
  }

  B.render = { open: open, close: close };
})();
