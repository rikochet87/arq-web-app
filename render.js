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
  function painter(seed) {
    let a = seed;
    return function () { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function canvas(draw) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    draw(c.getContext("2d"), painter(7));
    return c;
  }
  // Granos claros y oscuros sobre lo ya pintado.
  function grain(g, rnd, n, size, alpha) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = "rgba(" + (rnd() < 0.5 ? "0,0,0," : "255,255,255,") + (rnd() * alpha).toFixed(3) + ")";
      g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * size, 1 + rnd() * size);
    }
  }
  const shade = (rgb, k) => "rgb(" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",") + ")";

  // Cada una dice cuántos metros cubre la imagen antes de repetirse.
  const PAINT = {
    plaster: [1.5, function (g, rnd) { g.fillStyle = "#ebe6dc"; g.fillRect(0, 0, 512, 512); grain(g, rnd, 9000, 3, 0.07); }],
    concrete: [2, function (g, rnd) { g.fillStyle = "#a9a7a1"; g.fillRect(0, 0, 512, 512); grain(g, rnd, 12000, 4, 0.1); }],
    grass: [9, function (g, rnd) {
      g.fillStyle = "#4d6634"; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 30000; i++) {
        g.fillStyle = shade([80, 104, 54], 0.78 + rnd() * 0.44);
        g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 3);
      }
      for (let i = 0; i < 36; i++) { // manchones más secos o más oscuros; se repiten en los bordes para que la imagen empalme
        const x = rnd() * 512, y = rnd() * 512, r = 40 + rnd() * 90, tone = rnd() < 0.5 ? "30,40,16," : "150,150,90,";
        for (let dx = -512; dx <= 512; dx += 512) for (let dy = -512; dy <= 512; dy += 512) {
          const spot = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          spot.addColorStop(0, "rgba(" + tone + "0.05)"); spot.addColorStop(1, "rgba(" + tone + "0)");
          g.fillStyle = spot; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
        }
      }
    }],
    wood: [1.6, function (g, rnd) { // tablas de 20 cm, con las juntas trabadas
      for (let row = 0; row < 8; row++) {
        for (let x = -rnd() * 384; x < 512; x += 384) {
          g.fillStyle = shade([172, 124, 80], 0.82 + rnd() * 0.34);
          g.fillRect(x, row * 64, 384, 64);
          for (let i = 0; i < 26; i++) { g.fillStyle = "rgba(60,30,10," + (rnd() * 0.1).toFixed(3) + ")"; g.fillRect(x + rnd() * 300, row * 64 + rnd() * 64, 60 + rnd() * 160, 1); }
          g.fillStyle = "rgba(40,22,10,.55)"; g.fillRect(x, row * 64, 2, 64);
        }
        g.fillStyle = "rgba(40,22,10,.5)"; g.fillRect(0, row * 64, 512, 2);
      }
    }],
    tile: [1.2, function (g, rnd) { // cerámico de 60 × 60
      g.fillStyle = "#9c968a"; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 4; i++) { g.fillStyle = shade([218, 211, 198], 0.95 + rnd() * 0.08); g.fillRect((i % 2) * 256 + 2, (i >> 1) * 256 + 2, 252, 252); }
      grain(g, rnd, 5000, 3, 0.035);
    }],
    paving: [0.8, function (g, rnd) { // baldosa de 40 × 40
      g.fillStyle = "#6f6d69"; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 4; i++) { g.fillStyle = shade([162, 159, 152], 0.9 + rnd() * 0.16); g.fillRect((i % 2) * 256 + 3, (i >> 1) * 256 + 3, 250, 250); }
      grain(g, rnd, 9000, 3, 0.08);
    }],
    chapa: [1.216, function (g) { // 16 ondas de 7,6 cm
      for (let x = 0; x < 512; x++) { g.fillStyle = shade([176, 184, 189], 0.78 + 0.22 * Math.sin(x / 32 * 2 * Math.PI)); g.fillRect(x, 0, 1, 512); }
    }],
    tejas: [1.3, function (g, rnd) { // hiladas de teja francesa
      g.fillStyle = "#6e2f1f"; g.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 4; col++) {
          const y = row * 85.33, x = col * 128, tone = [182, 88, 58], k = 0.85 + rnd() * 0.3, fade = g.createLinearGradient(0, y, 0, y + 85);
          fade.addColorStop(0, shade(tone, k * 0.62)); fade.addColorStop(0.25, shade(tone, k)); fade.addColorStop(1, shade(tone, k * 1.08));
          g.fillStyle = fade; g.fillRect(x + 2, y + 2, 124, 82);
          g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 52, y + 2, 10, 82);
        }
      }
    }]
  };

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

  /* opts: roof (mostrar el techo), hour (hora del día, 7 a 19), onProgress(0–1: cuánto se afinó la imagen).
     Devuelve { set(opts), view("exterior" | "aerial"), shot(listo(blob)) }. */
  async function open(container, plan, opts) {
    close();
    opts = Object.assign({ roof: true, hour: 14.5 }, opts);
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
    const sharp = renderer.capabilities.getMaxAnisotropy(), images = {};
    function texture(name, color) {
      const def = PAINT[name], t = keep(new THREE.CanvasTexture(images[name] || (images[name] = canvas(def[1]))));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / def[0], 1 / def[0]);
      t.anisotropy = sharp;
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    function surface(name, o) {
      return keep(new THREE.MeshStandardMaterial(Object.assign({ map: texture(name, true), bumpMap: texture(name), bumpScale: 1.2, roughness: 0.9, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }, o)));
    }
    const plain = function (color, o) { return keep(new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.6 }, o))); };
    const material = {
      ext: surface("plaster", { color: 0xf3eee4 }), int: surface("plaster", { color: 0xffffff }),
      "roof-chapa": surface("chapa", { roughness: 0.45, metalness: 0.15, bumpScale: 6 }), "roof-tejas": surface("tejas", { roughness: 0.8, bumpScale: 5 }), "roof-losa": surface("concrete", { color: 0xd9d6cf }),
      flotante: surface("wood", { roughness: 0.6, bumpScale: 0.4 }), ceramico: surface("tile", { roughness: 0.5, bumpScale: 0.5 }), porcelanato: surface("tile", { roughness: 0.3, bumpScale: 0.3 }),
      alisado: surface("concrete", { roughness: 0.6 }), sin: surface("concrete", { color: 0xcfc6b8 }), paving: surface("paving"), grass: surface("grass", { roughness: 1 }),
      glass: plain(0x6f8fa3, { roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.42, side: THREE.DoubleSide, envMapIntensity: 3 }),
      trim: plain(0xdedbd5, { side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }),
      frame: plain(0xf2f1ee, { roughness: 0.45, metalness: 0.15 }), leaf: surface("wood", { color: 0x9a7b62, roughness: 0.5, bumpScale: 0.4, side: THREE.FrontSide }), item: plain(0xb9a78f, { roughness: 0.75 })
    };

    // Caja con la textura a escala: sus caras salen de a pares (±X, ±Y, ±Z) y cada una mide lo que mide.
    function box(w, h, d) {
      const g = keep(new THREE.BoxGeometry(w, h, d)), uv = g.attributes.uv, size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size[i >> 2][0], uv.getY(i) * size[i >> 2][1]);
      return g;
    }
    const scene = new THREE.Scene(), house = new THREE.Group(), roof = new THREE.Group();
    scene.add(house, roof);
    function put(parent, geometry, kind, casts) {
      const mesh = new THREE.Mesh(geometry, material[kind]);
      mesh.castShadow = casts !== false; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
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
      if (b.kind !== "glass") { put(s.group, box(s.len, s.tall, s.thick), b.kind); return; }
      put(s.group, box(s.len, s.tall, 0.012), "glass", false); // el vidrio deja pasar el sol
      const bar = 0.05, deep = 0.07, parts = [[s.len, bar, 0, s.tall / 2 - bar / 2], [s.len, bar, 0, bar / 2 - s.tall / 2], [bar, s.tall, s.len / 2 - bar / 2, 0], [bar, s.tall, bar / 2 - s.len / 2, 0]];
      if (s.len > 1) parts.push([bar * 0.8, s.tall, 0, 0]); // dos hojas
      parts.forEach(function (p) { put(s.group, box(p[0], p[1], deep), "frame").position.set(p[2], p[3], 0); });
    });
    data.doors.forEach(function (d) { const s = span(d, 4.5); put(s.group, box(s.len - 0.03, s.tall - 0.01, s.thick), "leaf"); });
    data.items.forEach(function (it) {
      const mesh = put(house, box(it.w * M, it.h * M, it.d * M), "item");
      mesh.position.set(it.x * M, (it.z + it.h / 2) * M, it.y * M);
      mesh.rotation.y = -it.r * Math.PI / 180;
    });
    data.rooms.forEach(function (room) { // la geometría del piso ya trae sus coordenadas en metros
      const shape = new THREE.Shape(room.points.map(function (p) { return new THREE.Vector2(p.x * M, p.y * M); }));
      const kind = room.surface ? (room.surface === "cesped" ? "grass" : room.surface === "cochera" ? "alisado" : "paving") : room.floor;
      const mesh = put(house, keep(new THREE.ShapeGeometry(shape)), material[kind] ? kind : "ceramico", false);
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
      for (let i = 1; i < pts.length - 1; i++) {
        [pts[0], pts[i], pts[i + 1]].forEach(function (p) {
          at.push(p.x * M, p.z * M, p.y * M);
          if (poly.kind === "ext") uv.push((p.x + p.y) * M, p.z * M); else uv.push((lengthwise ? p.x : p.y) * M, (lengthwise ? p.y : p.x) * M);
        });
      }
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(at, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      put(roof, g, poly.kind);
    });
    const bounds = new THREE.Box3().setFromObject(house).union(new THREE.Box3().setFromObject(roof));
    const center = bounds.getCenter(new THREE.Vector3()), size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 4), reach = size * 0.75 + 2;

    const lawn = put(scene, keep(new THREE.CircleGeometry(400, 48)), "grass", false);
    lawn.material = keep(material.grass.clone());
    ["map", "bumpMap"].forEach(function (k) { lawn.material[k] = keep(lawn.material[k].clone()); lawn.material[k].repeat.set(800 / PAINT.grass[0], 800 / PAINT.grass[0]); lawn.material[k].rotation = 0.5; }); // girado: la repetición no queda alineada con la casa
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
      '<label title="Hora del día: mueve el sol">Hora <input type="range" min="7" max="19" step="0.25" aria-label="Hora del día"><output></output></label>' +
      '<button type="button" data-r3d="save" title="Guardar la imagen como PNG">Descargar imagen</button>';
    note.className = "v3d-hint";
    container.appendChild(bar); container.appendChild(note);
    const slider = bar.querySelector("input"), clock = bar.querySelector("output"), roofBtn = bar.querySelector('[data-r3d="roof"]');
    function sync() {
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
