/* CalcuObra — vista 3D del plano. El motor (three.js, ~750 KB) se descarga recién cuando se pide la vista.
   Se carga como script común y no como módulo, para que también funcione al abrir el HTML con doble clic
   (desde file:// el navegador no deja importar módulos). three.classic.min.js es three.module.min.js más
   OrbitControls, empaquetados con: esbuild --bundle --format=iife --global-name=__THREE__ --minify.
   Los volúmenes los arma lib/plan.js (solids); acá se convierten en mallas y se muestran, con cuatro
   modos de presentación: recorrido a pie, plantas separadas, rayos X y corte por altura. */
(function () {
  "use strict";

  const B = window.__BRAND__ || (window.__BRAND__ = {});
  const COLORS = { "roof-chapa": 0x9aa5ab, "roof-tejas": 0xb5563a, "roof-losa": 0xcdc8bd, ext: 0xe9e2d5, int: 0xf6f2ea, glass: 0x8ec5ea, floor: 0xd8c4a8, item: 0xc4ad92, ground: 0x1c1c1c, sky: 0x121212 };
  const SEE_THROUGH = ["ext", "int", "roof-chapa", "roof-tejas", "roof-losa"]; // lo que se aclara con rayos X
  const M = 0.01; // cm → m
  const EYE = 1.6, BODY = 0.25, PACE = 2.2, TURN = 1.8; // recorrido: altura de ojos y radio del cuerpo (m), paso (m/s), giro (rad/s)
  const KEYS = { w: "fwd", arrowup: "fwd", s: "back", arrowdown: "back", a: "sl", d: "sr", arrowleft: "left", arrowright: "right" };
  const mode = { explode: false, xray: false, cut: 1 }; // se conserva al reabrir la vista
  const ENGINE = "lib/vendor/three/three.classic.min.js";
  let live = null, engine = null;

  function load() {
    if (window.__THREE__) return Promise.resolve(window.__THREE__);
    return engine || (engine = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = ENGINE;
      script.onload = function () { resolve(window.__THREE__); };
      script.onerror = function () { engine = null; script.remove(); reject(new Error("No se pudo descargar el motor 3D")); };
      document.head.appendChild(script);
    }));
  }

  function close() {
    if (!live) return;
    cancelAnimationFrame(live.frame);
    live.observer.disconnect();
    live.controls.dispose();
    live.renderer.dispose();
    live.renderer.domElement.remove();
    live.ui.forEach(function (el) { el.remove(); });
    window.removeEventListener("keydown", live.keydown, true);
    window.removeEventListener("keyup", live.keyup, true);
    window.removeEventListener("blur", live.release);
    live = null;
  }

  function build(container) {
    const bar = document.createElement("div"), pad = document.createElement("div"), hint = document.createElement("div");
    bar.className = "v3d-bar";
    bar.innerHTML = '<button type="button" data-v3d="walk" aria-pressed="false" title="Caminar por adentro de la casa">Recorrer</button>' +
      '<button type="button" data-v3d="floor" hidden title="Cambiar de planta"></button>' +
      '<button type="button" data-v3d="explode" aria-pressed="false" title="Separar las plantas y levantar el techo">Separar</button>' +
      '<button type="button" data-v3d="xray" aria-pressed="false" title="Paredes y techo traslúcidos">Rayos X</button>' +
      '<label data-v3d="cut" title="Cortar la casa a una altura">Corte <input type="range" min="5" max="100" value="100" aria-label="Altura del corte"></label>';
    pad.className = "v3d-pad";
    pad.hidden = true;
    pad.innerHTML = '<span></span><button type="button" data-go="fwd" aria-label="Avanzar">▲</button><span></span>' +
      '<button type="button" data-go="left" aria-label="Girar a la izquierda">◀</button><button type="button" data-go="back" aria-label="Retroceder">▼</button><button type="button" data-go="right" aria-label="Girar a la derecha">▶</button>';
    hint.className = "v3d-hint";
    hint.hidden = true;
    hint.textContent = "W A S D o flechas para caminar · arrastrá para mirar · Esc para salir";
    [bar, pad, hint].forEach(function (el) { container.appendChild(el); });
    return { bar: bar, pad: pad, hint: hint };
  }

  async function open(container, plan, opts) {
    close();
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("WebGL no disponible");
    const THREE = await load(), OrbitControls = THREE.OrbitControls;
    const data = B.plan.solids(plan, opts), top = data.levels; // el techo va en un grupo propio, arriba de la última planta

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.sky);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9c, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 4);
    scene.add(sun);

    const material = {};
    Object.keys(COLORS).forEach(function (key) {
      material[key] = new THREE.MeshStandardMaterial({ color: COLORS[key], roughness: 0.9, side: THREE.DoubleSide, transparent: key === "glass", opacity: key === "glass" ? 0.45 : 1 });
    });
    const groups = [];
    for (let i = 0; i <= top; i++) { groups.push(new THREE.Group()); scene.add(groups[i]); }
    const bounds = new THREE.Box3();
    let meshes = 0;
    function add(geometry, kind, level, x, y, z, turn) {
      const mesh = new THREE.Mesh(geometry, material[kind]);
      mesh.position.set(x * M, y * M, z * M);
      if (turn) mesh.rotation.y = turn;
      groups[level].add(mesh);
      bounds.expandByObject(mesh);
      meshes++;
    }
    // El plano (x, y) pasa al piso (x, z) de la escena; la altura es el eje Y.
    data.boxes.forEach(function (b) {
      const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y;
      add(new THREE.BoxGeometry(Math.hypot(dx, dy) * M, (b.z1 - b.z0) * M, b.thick * M), b.kind, b.level,
        (b.a.x + b.b.x) / 2, (b.z0 + b.z1) / 2, (b.a.y + b.b.y) / 2, -Math.atan2(dy, dx));
    });
    data.items.forEach(function (it) {
      add(new THREE.BoxGeometry(it.w * M, it.h * M, it.d * M), "item", it.level, it.x, it.z + it.h / 2, it.y, -it.r * Math.PI / 180);
    });
    data.rooms.forEach(function (room) {
      const shape = new THREE.Shape(room.points.map(function (p) { return new THREE.Vector2(p.x * M, p.y * M); }));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material.floor);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = room.z * M + 0.01;
      groups[room.level].add(mesh);
      meshes++;
    });
    // Caras del techo: polígonos convexos triangulados en abanico.
    data.roof.forEach(function (poly) {
      const vertices = [];
      for (let i = 1; i < poly.points.length - 1; i++) {
        [poly.points[0], poly.points[i], poly.points[i + 1]].forEach(function (p) { vertices.push(p.x * M, p.z * M, p.y * M); });
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      add(geometry, poly.kind, top, 0, 0, 0);
    });
    const center = bounds.getCenter(new THREE.Vector3()), span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 4);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), material.ground);
    ground.rotation.x = Math.PI / 2;
    ground.position.set(center.x, -0.01, center.z);
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(center.x + span * 0.55, span * 0.75, center.z + span * 0.75);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(center.x, center.y * 0.8, center.z);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.maxDistance = span * 4;

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return; // pestaña en segundo plano o panel oculto
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // ---------- Modos de presentación ----------
    const ui = build(container), lift = data.storey * M * 0.8;
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), clipped = [plane], whole = [];
    const walk = { on: false, level: 0, yaw: 0, pitch: 0, pos: { x: 0, z: 0 }, keys: {}, blockers: [], back: null };
    const btn = function (name) { return ui.bar.querySelector('[data-v3d="' + name + '"]'); };
    const slider = btn("cut").querySelector("input");
    slider.value = Math.round(mode.cut * 100);
    btn("explode").hidden = top < 2 && !data.roof.length;

    function sync() {
      btn("walk").setAttribute("aria-pressed", String(walk.on));
      btn("explode").setAttribute("aria-pressed", String(mode.explode));
      btn("xray").setAttribute("aria-pressed", String(mode.xray));
      btn("floor").hidden = !walk.on || top < 2;
      btn("floor").textContent = "Planta " + (walk.level + 1) + "/" + top;
      btn("explode").disabled = btn("cut").hidden = walk.on;
      ui.pad.hidden = ui.hint.hidden = !walk.on;
      canvas.style.cursor = walk.on ? "crosshair" : "";
      SEE_THROUGH.forEach(function (key) {
        const m = material[key];
        m.transparent = mode.xray;
        m.opacity = mode.xray ? 0.22 : 1;
        m.depthWrite = !mode.xray;
        m.needsUpdate = true;
      });
    }

    // Se arranca parado en el ambiente más grande de la planta; chocan los muros y antepechos, no los vanos.
    function enterLevel(level) {
      const base = level * data.storey;
      let best = null, bestArea = 0;
      data.rooms.forEach(function (room) {
        if (room.level !== level) return;
        let area = 0, x = 0, z = 0;
        room.points.forEach(function (p, i) {
          const q = room.points[(i + 1) % room.points.length];
          area += p.x * q.y - q.x * p.y; x += p.x; z += p.y;
        });
        area = Math.abs(area);
        if (area > bestArea) { bestArea = area; best = { x: x / room.points.length * M, z: z / room.points.length * M }; }
      });
      walk.level = level;
      walk.pos = best || { x: center.x, z: center.z };
      walk.blockers = data.boxes.filter(function (b) {
        return b.level === level && b.kind !== "glass" && b.z0 - base < 150 && b.z1 - base > 50;
      }).map(function (b) {
        return { ax: b.a.x * M, az: b.a.y * M, bx: b.b.x * M, bz: b.b.y * M, r: b.thick * M / 2 + BODY };
      });
    }
    function free(x, z) {
      return walk.blockers.every(function (s) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, len2 = dx * dx + dz * dz;
        const t = len2 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0;
        return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) >= s.r;
      });
    }
    function setWalk(on) {
      if (on === walk.on) return;
      walk.on = on;
      walk.keys = {};
      controls.enabled = !on;
      if (on) {
        walk.back = { pos: camera.position.clone(), target: controls.target.clone() };
        walk.yaw = walk.pitch = 0;
        enterLevel(0);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } else {
        camera.position.copy(walk.back.pos);
        controls.target.copy(walk.back.target);
      }
      camera.fov = on ? 70 : 50;
      camera.near = on ? 0.05 : 0.1;
      camera.updateProjectionMatrix();
      sync();
    }
    function step(dt) {
      const k = walk.keys, p = walk.pos, fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0), side = (k.sr ? 1 : 0) - (k.sl ? 1 : 0);
      walk.yaw += ((k.left ? 1 : 0) - (k.right ? 1 : 0)) * TURN * dt;
      if (fwd || side) {
        const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw), v = PACE * dt / Math.hypot(fwd, side);
        const dx = (c * side - s * fwd) * v, dz = (-s * side - c * fwd) * v;
        if (!free(p.x, p.z) || free(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
        else if (free(p.x + dx, p.z)) p.x += dx; // contra un muro, se desliza
        else if (free(p.x, p.z + dz)) p.z += dz;
      }
      camera.position.set(p.x, walk.level * data.storey * M + EYE, p.z);
      camera.rotation.set(walk.pitch, walk.yaw, 0, "YXZ");
    }

    ui.bar.addEventListener("click", function (e) {
      const b = e.target.closest("button[data-v3d]"), name = b && b.getAttribute("data-v3d");
      if (name === "walk") setWalk(!walk.on);
      else if (name === "floor") enterLevel((walk.level + 1) % top);
      else if (name === "explode") mode.explode = !mode.explode;
      else if (name === "xray") mode.xray = !mode.xray;
      sync();
    });
    slider.addEventListener("input", function () { mode.cut = slider.value / 100; });
    ui.pad.addEventListener("pointerdown", function (e) {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      walk.keys[b.getAttribute("data-go")] = true;
    });
    const release = function () { walk.keys = {}; };
    ui.pad.addEventListener("pointerup", release);
    ui.pad.addEventListener("pointercancel", release);
    // Mirar: se arrastra la escena, igual que con el dedo.
    let look = null;
    canvas.addEventListener("pointerdown", function (e) {
      if (!walk.on) return;
      canvas.setPointerCapture(e.pointerId);
      look = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!walk.on || !look) return;
      walk.yaw += (e.clientX - look.x) * 0.004;
      walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch + (e.clientY - look.y) * 0.004));
      look = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", function () { look = null; });
    canvas.addEventListener("pointercancel", function () { look = null; });
    // En captura: mientras se recorre, las teclas no llegan a los atajos del plano (W dibuja paredes).
    function key(e, down) {
      if (!walk.on || e.ctrlKey || e.metaKey || e.altKey) return;
      const name = e.key.toLowerCase(), go = KEYS[name];
      if (!go && name !== "escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (go) walk.keys[go] = down;
      else if (down) setWalk(false);
    }
    const keydown = function (e) { key(e, true); }, keyup = function (e) { key(e, false); };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", release);
    sync();

    let last = performance.now();
    live = { renderer: renderer, controls: controls, observer: observer, frame: 0, ui: [ui.bar, ui.pad, ui.hint], keydown: keydown, keyup: keyup, release: release };
    (function tick() {
      if (!live || live.renderer !== renderer) return;
      live.frame = requestAnimationFrame(tick);
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (document.hidden || !container.clientWidth) return;
      const gap = mode.explode && !walk.on ? lift : 0;
      groups.forEach(function (g, i) { g.position.y += (i * gap - g.position.y) * Math.min(1, dt * 8); });
      plane.constant = mode.cut * (bounds.max.y + groups[top].position.y);
      renderer.clippingPlanes = mode.cut < 1 && !walk.on ? clipped : whole;
      if (walk.on) step(dt); else controls.update();
      renderer.render(scene, camera);
    })();
    return { meshes: meshes };
  }

  B.view3d = { open: open, close: close };
})();
