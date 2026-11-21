// Holographic visor: each room's collage floats round the edge of your view, like a
// helmet HUD (Metroid Prime's visor, Mass Effect's holo panels). It trails the camera
// with a little lag, sways within a clamped angle, bobs as you walk, and keeps the
// centre clear so the model reads through it.
import * as THREE from "three";

const D = 1.0;                 // distance of the visor plane in front of the eye
const MAX_LAG = 0.10;          // radians the visor may trail the view
const MAX_SLIDE = 0.06;        // metres it may trail when you walk

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
  uniform vec3 tint; uniform float opacity, time, seed;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float scan = 0.5 + 0.5 * sin(uv.y * 520.0 - time * 7.0);
    float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = 1.0 - smoothstep(0.0, 0.022, e);
    float sweep = smoothstep(0.0, 0.08, 0.08 - abs(fract(time * 0.12 + seed * 0.13) - uv.y));
    float flick = 0.9 + 0.1 * sin(time * 31.0 + seed * 7.0);
    float a = opacity * flick * (rim * 0.95 + scan * 0.10 + sweep * 0.18);
    gl_FragColor = vec4(tint, a);
  }`;

export function createHud({ scene, camera, boards, texLoader, makeLabel }) {
  const rig = new THREE.Group();
  rig.renderOrder = 1000;
  scene.add(rig);
  const state = { key: null, opacity: 0, target: 0, enabled: true, t0: 0, panels: [], extras: [] };
  const q = new THREE.Quaternion(), pos = new THREE.Vector3();
  let lastCam = camera.position.clone(), bob = 0;

  const TINT = { a: "#e8b866", b: "#1f3c9e", c: "#6cc3ff" };

  function clear() {
    [...state.panels, ...state.extras].forEach(m => { rig.remove(m); m.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); });
    state.panels = []; state.extras = [];
  }

  // Lay the board's pictures round the edge of the view, like the 2D collage.
  function build(key) {
    clear();
    if (!key) return;
    const B = boards[key];
    const light = key === "b";
    const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D;
    const hw = hh * camera.aspect;
    const gap = 0.012;
    const strips = {
      top:    { kind: "row", x0: -hw * 0.96, x1: hw * 0.96, y0: hh * 0.66, y1: hh * 0.95, items: [], load: 0 },
      bottom: { kind: "row", x0: -hw * 0.96, x1: hw * 0.96, y0: -hh * 0.95, y1: -hh * 0.66, items: [], load: 0 },
      left:   { kind: "col", x0: -hw * 0.96, x1: -hw * 0.74, y0: -hh * 0.6, y1: hh * 0.6, items: [], load: 0 },
      right:  { kind: "col", x0: hw * 0.74, x1: hw * 0.96, y0: -hh * 0.6, y1: hh * 0.6, items: [], load: 0 },
    };
    const cap = s => s.kind === "row" ? (s.x1 - s.x0) / (s.y1 - s.y0) : (s.y1 - s.y0) / (s.x1 - s.x0);
    const linkOf = {};
    B.stations.forEach(s => linkOf[s.img] = s.n);
    const imgs = B.images.map(im => ({ ...im, ar: window.ASPECT?.[im.f] || 1 })).sort((a, b) => b.ar - a.ar);
    imgs.forEach(im => {
      const pref = (im.ar >= 1.1 ? ["top", "bottom"] : ["left", "right"]).map(k => strips[k]);
      const all = Object.values(strips);
      const byLoad = arr => arr.slice().sort((a, b) => a.load - b.load)[0];
      const s = pref.some(p => p.load < 1) ? byLoad(pref) : byLoad(all);
      s.items.push(im);
      s.load += (s.kind === "row" ? im.ar : 1 / im.ar) / cap(s);
    });

    const place = (im, x, y, w, h, i) => {
      const base = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
        color: new THREE.Color("#ffffff").lerp(new THREE.Color(TINT[key]), light ? 0.15 : 0.35),
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), base);
      new THREE.TextureLoader().load(`../img/${im.f}`, t => {
        t.colorSpace = THREE.SRGBColorSpace;
        base.map = t; base.needsUpdate = true;
      });
      const ov = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
        blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { tint: { value: new THREE.Color(TINT[key]) }, opacity: { value: 0 }, time: { value: 0 }, seed: { value: i * 1.7 } },
      }));
      ov.renderOrder = 1001;
      ov.userData.overlay = true;
      m.add(ov);
      // curve the visor: panels further out sit a little closer and turn toward the eye
      const z = -D;
      m.position.set(x, y, z);
      m.rotation.set(Math.atan(y / D) * 0.45, -Math.atan(x / D) * 0.45, 0, 'YXZ');
      m.renderOrder = 1000;
      m.userData.delay = i * 0.045;
      rig.add(m);
      state.panels.push(m);
      if (linkOf[im.id]) {
        const lb = makeLabel(String(linkOf[im.id]).padStart(2, "0"), light ? "#16171b" : "#ffffff", { size: 0.022 });
        lb.material.depthTest = false; lb.renderOrder = 1001; lb.center.set(0, 1);
        lb.position.set(x - w / 2 + 0.006, y + h / 2 - 0.006, z + 0.001);
        lb.userData.delay = m.userData.delay;
        rig.add(lb); state.extras.push(lb);
      }
    };

    let i = 0;
    Object.values(strips).forEach(s => {
      if (!s.items.length) return;
      if (s.kind === "row") {
        let h = s.y1 - s.y0;
        let total = s.items.reduce((a, im) => a + im.ar * h, 0) + gap * (s.items.length - 1);
        if (total > s.x1 - s.x0) { const k = (s.x1 - s.x0 - gap * (s.items.length - 1)) / (total - gap * (s.items.length - 1)); h *= k; total = s.x1 - s.x0; }
        let x = -total / 2;
        const yc = (s.y0 + s.y1) / 2 + (s.y0 > 0 ? (s.y1 - s.y0 - h) / 2 : -(s.y1 - s.y0 - h) / 2);
        s.items.forEach(im => { const w = im.ar * h; place(im, x + w / 2, yc, w, h, i++); x += w + gap; });
      } else {
        let w = s.x1 - s.x0;
        let total = s.items.reduce((a, im) => a + w / im.ar, 0) + gap * (s.items.length - 1);
        if (total > s.y1 - s.y0) { const k = (s.y1 - s.y0 - gap * (s.items.length - 1)) / (total - gap * (s.items.length - 1)); w *= k; total = s.y1 - s.y0; }
        let y = total / 2;
        const xc = s.x0 < 0 ? s.x0 + w / 2 : s.x1 - w / 2;
        s.items.forEach(im => { const h = w / im.ar; place(im, xc, y - h / 2, w, h, i++); y -= h + gap; });
      }
    });

    // corner brackets and a header, drawn as hairlines
    const col = new THREE.Color(TINT[key]);
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthTest: false });
    const L = 0.06, X = hw * 0.7, Y = hh * 0.62, Z = -D;
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sx * X, sy * (Y - L), Z), new THREE.Vector3(sx * X, sy * Y, Z), new THREE.Vector3(sx * (X - L), sy * Y, Z)]);
      const line = new THREE.Line(g, lm.clone());
      line.renderOrder = 1001; line.userData.delay = 0.1;
      rig.add(line); state.extras.push(line);
    });
    const head = makeLabel(`${B.key} · ${B.title.split(", ")[1].toUpperCase()}  ·  ${B.headline}`, light ? "#16171b" : "#ffffff", { size: 0.026 });
    head.material.depthTest = false; head.renderOrder = 1001; head.center.set(0, 0);
    head.position.set(-X, Y + 0.012, Z); head.userData.delay = 0.05;
    rig.add(head); state.extras.push(head);
  }

  function setRoom(key, t) {
    if (key === state.key) return;
    state.key = key;
    state.opacity = 0;
    state.t0 = t;
    build(state.enabled ? key : null);
  }

  function toggle(t) {
    state.enabled = !state.enabled;
    const k = state.key; state.key = null; setRoom(k, t);
  }

  function update(dt, t, walking) {
    // trail the camera's turn, but never by more than MAX_LAG
    const camQ = camera.quaternion;
    q.slerp(camQ, 1 - Math.exp(-dt * 7));
    const ang = q.angleTo(camQ);
    if (ang > MAX_LAG) q.rotateTowards(camQ, ang - MAX_LAG);
    rig.quaternion.copy(q);
    // trail a step behind when walking, with a soft bob
    pos.lerp(camera.position, 1 - Math.exp(-dt * 9));
    const off = pos.clone().sub(camera.position);
    if (off.length() > MAX_SLIDE) off.setLength(MAX_SLIDE);
    if (walking) bob += dt * 8;
    rig.position.copy(camera.position).add(off);
    rig.position.y += Math.sin(bob) * 0.006;
    lastCam.copy(camera.position);

    // boot-up: panels appear in a quick stagger, then hold
    const since = t - state.t0;
    rig.children.forEach(m => {
      const k = THREE.MathUtils.clamp((since - (m.userData.delay || 0)) / 0.35, 0, 1);
      const a = k * k * (3 - 2 * k);
      m.material.opacity = a * (m.isMesh ? 0.78 : 0.9);
      m.children.forEach(c => { if (c.userData.overlay) { c.material.uniforms.opacity.value = a; c.material.uniforms.time.value = t; } });
      if (!m.userData.base) m.userData.base = m.scale.clone();
      m.scale.copy(m.userData.base).multiplyScalar(0.96 + 0.04 * a);
    });
  }

  function snap() { q.copy(camera.quaternion); pos.copy(camera.position); }

  window.__hudRig = rig;
  return { setRoom, toggle, update, snap, rebuild: () => build(state.key) };
}
