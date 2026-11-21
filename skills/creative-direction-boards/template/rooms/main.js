import * as THREE from "three";
import { PointerLockControls } from "./vendor/PointerLockControls.js";
import { BOARDS } from "./boards.js";
import { createHud } from "./hud.js";

// ---------------------------------------------------------------- setup
const app = document.getElementById("app");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#d9d3c6");
scene.fog = new THREE.Fog("#d9d3c6", 30, 70);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);
const EYE = 1.62;
camera.position.set(0, EYE, 2.5);

scene.add(new THREE.HemisphereLight("#fffaf0", "#8a8170", 1.1));
const sun = new THREE.DirectionalLight("#fff6e6", 0.8);
sun.position.set(6, 20, 4);
scene.add(sun);

const texLoader = new THREE.TextureLoader();
const clickable = [];
const floors = [], walls = [];   // teleport targets

// ---------------------------------------------------------------- plan
// Rotunda at the origin; three passages; three 2:1 ovals laid out radially.
const R = 7, H_ROT = 6.5, DOOR = 1.5, PASS = 4;
const A_AX = 13, B_AX = 6.5, H_OVAL = 6.2;         // oval semi-axes, 2:1 like the Orangerie
const ROOMS = [
  { key: "a", angle: THREE.MathUtils.degToRad(-150) },
  { key: "b", angle: THREE.MathUtils.degToRad(-30) },
  { key: "c", angle: THREE.MathUtils.degToRad(90) },
];
ROOMS.forEach(r => {
  r.u = new THREE.Vector3(Math.cos(r.angle), 0, Math.sin(r.angle));   // out from the rotunda
  r.v = new THREE.Vector3(-r.u.z, 0, r.u.x);
  r.centre = r.u.clone().multiplyScalar(R + PASS + A_AX);
  r.board = BOARDS[r.key];
});

// ---------------------------------------------------------------- helpers
function wallStrip(points, h, material, y0 = 0) {
  // vertical ribbon through a polyline of [x, z]
  const pos = [], idx = [], uv = [];
  let run = 0;
  points.forEach(([x, z], i) => {
    if (i) run += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    pos.push(x, y0, z, x, y0 + h, z);
    uv.push(run / h, 0, run / h, 1);
    if (i) { const a = 2 * (i - 1); idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
function textTexture(lines, { w = 1024, h = 256, bg = null, fg = "#16171b", font = "300 72px 'IBM Plex Sans Condensed'", align = "left", lineH = 1.2, pad = 24 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textAlign = align; g.textBaseline = "top";
  let y = pad;
  lines.forEach(l => {
    const L = typeof l === "string" ? { t: l } : l;
    g.font = L.font || font; g.fillStyle = L.fg || fg;
    const size = parseFloat(g.font.match(/(\d+)px/)[1]);
    if (L.track) g.letterSpacing = L.track;
    g.fillText(L.t, align === "center" ? w / 2 : pad, y);
    g.letterSpacing = "0px";
    y += size * (L.lineH || lineH);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function label(text, color, { size = 0.16, mono = true } = {}) {
  const font = mono ? "500 44px 'IBM Plex Mono'" : "300 60px 'IBM Plex Sans Condensed'";
  const c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 24;
  c.width = w; c.height = 64;
  g.font = font; g.fillStyle = color; g.textBaseline = "middle";
  g.fillText(text, 12, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(size * w / 64, size, 1);
  s.center.set(0, 0.5);
  return s;
}
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const STATIONS = [
  ["Seed randomness", "discover"], ["Ambitious prompts", "discover"], ["Outside critic", "define"],
  ["Generate images", "define"], ["Add motion", "define"], ["Cut the excess", "deliver"],
  ["Remove AI tells", "deliver"], ["Rewrite by hand", "deliver"],
].map(([name, phase], i) => ({ n: i + 1, name, phase }));
const numLabel = n => String(n).padStart(2, "0");

await Promise.all([
  document.fonts.load("500 40px 'IBM Plex Mono'"), document.fonts.load("400 40px 'IBM Plex Mono'"),
  document.fonts.load("300 40px 'IBM Plex Sans Condensed'"),
]).catch(() => {});

// ---------------------------------------------------------------- rotunda
const stone = new THREE.MeshStandardMaterial({ color: "#ece7dc", roughness: 0.95, side: THREE.DoubleSide });
const floorMat = new THREE.MeshStandardMaterial({ color: "#cfc7b6", roughness: 0.9 });
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor); floors.push(floor);
  // wall with three gaps
  const gap = Math.asin(DOOR / R);
  ROOMS.forEach((r, i) => {
    const a0 = r.angle + gap, a1 = ROOMS[(i + 1) % 3].angle - gap + (i === 2 ? Math.PI * 2 : 0);
    const pts = [];
    for (let k = 0; k <= 60; k++) { const a = a0 + (a1 - a0) * k / 60; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
    const w = wallStrip(pts, H_ROT, stone); scene.add(w); walls.push(w);
  });
  // lintels over the doorways, with each room's name
  ROOMS.forEach(r => {
    const lint = new THREE.Mesh(new THREE.PlaneGeometry(DOOR * 2, H_ROT - 3.4), stone);
    lint.position.copy(r.u).multiplyScalar(R * Math.cos(gap) - 0.01).setY(3.4 + (H_ROT - 3.4) / 2);
    lint.lookAt(0, lint.position.y, 0);
    scene.add(lint);
    const b = r.board;
    const t = textTexture([
      { t: `${b.key} · ${b.title.split(", ")[1].toUpperCase()}`, font: "500 46px 'IBM Plex Mono'", track: "8px", fg: "#16171b" },
      { t: b.headline, font: "300 64px 'IBM Plex Sans Condensed'", fg: "#16171b" },
    ], { w: 1100, h: 200, align: "center", pad: 30 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    sign.position.copy(r.u).multiplyScalar(R * 0.93).setY(4.25);
    sign.lookAt(0, 4.25, 0);
    scene.add(sign);
  });
  // ceiling: a shallow dome with an open oculus
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 16, 0, Math.PI * 2, 0.18, Math.PI / 2 - 0.18),
    new THREE.MeshStandardMaterial({ color: "#f3efe6", side: THREE.BackSide, roughness: 1 }));
  dome.scale.y = 0.35; dome.position.y = H_ROT;
  scene.add(dome);
  // floor inscription
  const ins = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), new THREE.MeshBasicMaterial({
    map: textTexture([
      { t: "THE CREATIVE PROCESS", font: "500 52px 'IBM Plex Mono'", track: "14px", fg: "#4a463f" },
      { t: "discover · define · deliver", font: "300 60px 'IBM Plex Sans Condensed'", fg: "#4a463f" },
    ], { w: 1024, h: 1024, align: "center", pad: 410 }), transparent: true,
  }));
  ins.rotation.x = -Math.PI / 2; ins.position.y = 0.005;
  scene.add(ins);
}

// ---------------------------------------------------------------- rooms
const roomGroups = {};
function buildRooms() { ROOMS.forEach(r => {
  const B = r.board, th = B.theme;
  const dark = r.key !== "b";
  const wallCol = dark ? (r.key === "a" ? "#1a1813" : "#121419") : "#ece8df";
  const floorCol = dark ? (r.key === "a" ? "#24211b" : "#191b21") : "#d8d1c2";
  const g = new THREE.Group();
  g.position.copy(r.centre);
  g.rotation.y = -r.angle;            // local +x points away from the rotunda
  scene.add(g);
  roomGroups[r.key] = g;

  const wallMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.95, side: THREE.DoubleSide });
  const fl = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshStandardMaterial({ color: floorCol, roughness: 0.9 }));
  fl.scale.set(A_AX, B_AX, 1); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.004;
  g.add(fl); floors.push(fl);

  // oval wall with the door at t = pi
  const gapT = Math.asin(DOOR / B_AX);
  const pts = [];
  for (let k = 0; k <= 200; k++) {
    const t = -Math.PI + gapT + (2 * Math.PI - 2 * gapT) * k / 200;
    pts.push([A_AX * Math.cos(t), B_AX * Math.sin(t)]);
  }
  { const w = wallStrip(pts, H_OVAL, wallMat); g.add(w); walls.push(w); }
  // lintel over the door on the inside
  const xDoor = -A_AX * Math.cos(gapT);
  const lin = new THREE.Mesh(new THREE.PlaneGeometry(DOOR * 2, H_OVAL - 3.4), wallMat);
  lin.position.set(xDoor + 0.01, 3.4 + (H_OVAL - 3.4) / 2, 0); lin.rotation.y = Math.PI / 2;
  g.add(lin);

  // ceiling: diffuse skylight, like the Orangerie's
  const sky = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshBasicMaterial({ color: dark ? "#2b2a27" : "#fbf8f1", side: THREE.DoubleSide }));
  sky.scale.set(A_AX, B_AX, 1); sky.rotation.x = Math.PI / 2; sky.position.y = H_OVAL;
  g.add(sky);

  // the board round the wall, at eye level
  const imgs = B.images;
  const linkOf = {};
  B.stations.forEach(s => linkOf[s.img] = s.n);
  const span = 2 * Math.PI - 2 * (gapT + 0.32);
  imgs.forEach((im, i) => {
    const t = -Math.PI + gapT + 0.32 + span * (i + 0.5) / imgs.length;
    const x = A_AX * 0.985 * Math.cos(t), z = B_AX * 0.985 * Math.sin(t);
    const nx = Math.cos(t) / A_AX, nz = Math.sin(t) / B_AX, nl = Math.hypot(nx, nz);
    texLoader.load(`../img/${im.f}`, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const asp = tex.image.width / tex.image.height;
      let w = 2.3, h = w / asp;
      if (h > 2.2) { h = 2.2; w = h * asp; }
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      pic.position.set(x, 1.75, z);
      pic.rotation.y = Math.atan2(-nx / nl, -nz / nl);
      pic.userData = { src: `../img/${im.f}`, title: im.t, room: B.key, n: linkOf[im.id] };
      g.add(pic);
      clickable.push(pic);
      if (linkOf[im.id]) {
        const lb = label(numLabel(linkOf[im.id]), dark ? th.fg : "#16171b", { size: 0.2 });
        lb.position.set(x - (nx / nl) * 0.05, 1.75 + h / 2 + 0.2, z - (nz / nl) * 0.05);
        lb.center.set(0.5, 0.5);
        g.add(lb);
      }
    });
  });

  // wall text by the door
  const intro = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({
    transparent: true, map: textTexture([
      { t: `${B.key} · ${B.title.split(", ")[1].toUpperCase()}`, font: "500 34px 'IBM Plex Mono'", track: "6px", fg: dark ? th.fg : "#16171b" },
      { t: B.headline, font: "300 64px 'IBM Plex Sans Condensed'", fg: dark ? th.fg : "#16171b", lineH: 1.4 },
      ...wrap(B.caption, 52).map(l => ({ t: l, font: "300 30px 'IBM Plex Sans Condensed'", fg: dark ? th.muted : "#6b665c", lineH: 1.45 })),
      { t: `seed ${B.seed}`, font: "400 22px 'IBM Plex Mono'", fg: dark ? th.muted : "#8a857b", lineH: 2.4 },
    ], { w: 1024, h: 512, pad: 20 }),
  }));
  intro.position.set(-A_AX * 0.62, 2.0, -B_AX * 0.62 + 0.3);
  intro.rotation.y = Math.PI / 4.5;
  g.add(intro);

  // lights
  const key = new THREE.PointLight(dark ? (r.key === "a" ? "#ffd9a0" : "#bcd7ff") : "#ffffff", dark ? 30 : 12, 18, 1.6);
  key.position.set(0, 5.2, 0);
  g.add(key);

  // the centre piece
  CENTRE[B.figure](g, B, dark);
}); }

function wrap(s, n) {
  const out = []; let line = "";
  s.split(" ").forEach(w => { if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w; });
  if (line.trim()) out.push(line.trim());
  return out;
}

// ---------------------------------------------------------------- centre pieces
const animators = [];
const CENTRE = {
  // A · exploded assembly on one vertical axis
  exploded(g, B) {
    const th = B.theme, rnd = seeded(B.seed);
    const col = { discover: th.c1, define: th.c2, deliver: th.c3 };
    const stack = new THREE.Group();
    stack.scale.setScalar(1.25);
    g.add(stack);
    const radii = [1.7, 1.48, 1.18, 1.03, 0.88, 0.68, 0.52, 0.34];
    const ys = [0.35, 0.95, 1.55, 2.05, 2.5, 2.9, 3.25, 3.55];
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 12), new THREE.MeshStandardMaterial({ color: th.muted }));
    axis.position.y = 2.1; stack.add(axis);
    STATIONS.forEach((s, i) => {
      const r = radii[i], t = 0.09 - i * 0.006, c = col[s.phase];
      const geo = new THREE.CylinderGeometry(r, r, t, 96, 1, false);
      const disc = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#14120e", metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.88 }));
      disc.position.y = ys[i];
      stack.add(disc);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: c }));
      edges.position.y = ys[i];
      stack.add(edges);
      // holes on the top face: random for Discover, regular after
      const ring = (rad, x, z) => {
        const pts = [];
        for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; pts.push(new THREE.Vector3(x + rad * Math.cos(a), ys[i] + t / 2 + 0.003, z + rad * Math.sin(a))); }
        stack.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c })));
      };
      if (i === 0) for (let k = 0; k < 26; k++) { const a = rnd() * 6.283, d = 0.25 + rnd() * (r - 0.35); ring(0.02 + rnd() * 0.05, d * Math.cos(a), d * Math.sin(a)); }
      else if (i === 1) for (let k = 0; k < 9; k++) {
        const a = k / 9 * 6.283 + rnd() * 0.3, d0 = r * (0.3 + rnd() * 0.15), d1 = r * (0.62 + rnd() * 0.25);
        stack.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(d0 * Math.cos(a), ys[i] + t / 2 + 0.003, d0 * Math.sin(a)),
          new THREE.Vector3(d1 * Math.cos(a), ys[i] + t / 2 + 0.003, d1 * Math.sin(a))]), new THREE.LineBasicMaterial({ color: c })));
      } else { const n = [12, 8, 6, 4, 2, 0][i - 2]; for (let k = 0; k < n; k++) { const a = k / n * 6.283; ring(0.04, r * 0.84 * Math.cos(a), r * 0.84 * Math.sin(a)); } }
      ring(0.06, 0, 0);
      const lb = label(`${numLabel(s.n)}  ${s.name}`, c, { size: 0.2 });
      lb.position.set(0, (ys[i] + 0.05) * 1.25, (r + 0.18) * 1.25);
      g.add(lb);
    });
    // the assembled object, on a plinth beside it
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: "#2d2921" }));
    pl.position.set(3.4, 0.45, 2.2); g.add(pl);
    let yy = 0.9;
    radii.forEach((r, i) => {
      const h = 0.05;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.17, h, 48), new THREE.MeshStandardMaterial({ color: "#b48d45", metalness: 0.8, roughness: 0.35 }));
      m.position.set(3.4, yy + h / 2, 2.2); g.add(m); yy += h;
    });
    const al = label("ASSEMBLED", th.muted, { size: 0.12 }); al.center.set(0.5, 0.5); al.position.set(3.4, 0.2 + 0.9 + 0.55, 2.2); g.add(al);
    animators.push(dt => {
      stack.rotation.y += dt * 0.12;
    });
  },

  // B · nested frames you walk through, receding to one opening
  aperture(g, B) {
    const th = B.theme, rnd = seeded(B.seed);
    const col = { discover: th.c1, define: th.c2, deliver: th.c3 };
    const xs = [-6.0, -4.3, -2.7, -1.2, 0.2, 1.5, 2.7, 3.8];
    STATIONS.forEach((s, i) => {
      const k = Math.pow(0.84, i), settle = Math.max(0, 1 - i / 5);
      const w = 7.4 * k, h = 4.6 * k;
      const f = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: col[s.phase], roughness: 0.6 });
      const bar = 0.07;
      [[0, h, w + bar, bar], [0, 0, w + bar, bar], [-w / 2, h / 2, bar, h], [w / 2, h / 2, bar, h]].forEach(([z, y, ww, hh]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bar, hh, ww), mat);
        m.position.set(0, y, z); f.add(m);
      });
      f.position.set(xs[i], (rnd() - 0.5) * 0.4 * settle, (rnd() - 0.5) * 1.2 * settle);
      f.rotation.x = (rnd() - 0.5) * 0.16 * settle;
      f.rotation.z = (rnd() - 0.5) * 0.06 * settle;
      g.add(f);
      const lb = label(`${numLabel(s.n)}  ${s.name}`, "#16171b", { size: 0.14 });
      lb.position.set(xs[i] - 0.05, h + 0.22, -w / 2);
      f.add(lb); lb.position.set(0, h + 0.2, -w / 2);
    });
    // the opening: a glowing disc set into the far wall
    const op = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), new THREE.MeshBasicMaterial({ color: th.c3, toneMapped: false }));
    op.position.set(A_AX * 0.69 + 0.02, 1.75, 0); op.rotation.y = -Math.PI / 2;
    g.add(op);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshStandardMaterial({ color: "#f4f1ea" }));
    back.position.set(A_AX * 0.69 + 0.04, 1.75, 0); back.rotation.y = -Math.PI / 2;
    g.add(back);
    animators.push((dt, t) => { op.material.color.set(th.c3).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.1)); });
  },

  // C · the figure-eight as a tube floating at chest height
  eight(g, B) {
    const th = B.theme;
    const S = 0.0105, aL = 380, aR = 300;
    const lem = (t, a) => { const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s; return [a * c / d, a * s * c / d]; };
    function p(u, spread = 0) {
      let x, y;
      if (u < 0.40) { const t = Math.PI / 2 + (u / 0.40) * Math.PI; [x, y] = lem(t, aL); const k = 1 + spread * Math.abs(x) / aL; x *= k; y *= k * 1.15; }
      else if (u < 0.60) [x, y] = lem(-Math.PI / 2 + ((u - 0.40) / 0.20) * (Math.PI / 2), aR);
      else { const v = (u - 0.60) / 0.40, C = aR * 0.56, rx = aR - C, ry = aR * 0.36, a = v * Math.PI * 2 * 2.25, k = 1 - 0.93 * Math.pow(v, 0.85); x = C + rx * k * Math.cos(a); y = ry * k * Math.sin(a); }
      return new THREE.Vector3(0.7 * Math.sin(u * Math.PI * 2) * (1 + spread), 2.5 - y * S, x * S + 0.9);
    }
    const seg = (u0, u1, n, spread = 0) => { const a = []; for (let i = 0; i <= n; i++) a.push(p(u0 + (u1 - u0) * i / n, spread)); return a; };
    const tube = (pts, c, r = 0.035) => {
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 10), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      g.add(m);
    };
    [-0.36, -0.27, -0.18, -0.09, 0.09, 0.18, 0.27, 0.36].forEach(sp => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg(0, 0.4, 160, sp)), new THREE.LineDashedMaterial({ color: th.c1, dashSize: 0.18, gapSize: 0.08, transparent: true, opacity: 0.6 }));
      l.computeLineDistances(); g.add(l);
      animators.push((dt, t) => { l.material.dashOffset = -t * 0.4; });
    });
    tube(seg(0, 0.4, 160), th.c1);
    tube(seg(0.4, 0.6, 80), th.c2);
    tube(seg(0.6, 1, 300), th.c3, 0.03);
    const T = [0.07, 0.31, 0.45, 0.52, 0.59, 0.67, 0.80, 0.975];
    const col = { discover: th.c1, define: th.c2, deliver: th.c3 };
    STATIONS.forEach((s, i) => {
      const q = p(T[i]);
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: col[s.phase], toneMapped: false }));
      n.position.copy(q); g.add(n);
      const lb = label(`${numLabel(s.n)}  ${s.name}`, th.fg, { size: 0.15 });
      lb.position.copy(q).add(new THREE.Vector3(-0.1, 0.24, 0.1)); g.add(lb);
    });
    const full = new THREE.CatmullRomCurve3(seg(0, 1, 600));
    const runner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    g.add(runner);
    animators.push((dt, t) => runner.position.copy(full.getPointAt((t / 18) % 1)));
  },
};

buildRooms();
const hud = createHud({ scene, camera, boards: BOARDS, texLoader, makeLabel: label });
window.__hudSnap = () => hud.snap();

// ---------------------------------------------------------------- walking
const controls = new PointerLockControls(camera, renderer.domElement);
const overlay = document.getElementById("overlay");
const detail = document.getElementById("detail");
const where = document.getElementById("where");
const params = new URLSearchParams(location.search);
const shot = params.get("shot");
const embed = params.get("embed");
if (embed) ["crosshair", "where"].forEach(id => document.getElementById(id).classList.add("hidden"));
if (!shot && !embed) overlay.classList.remove("hidden");
overlay.addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => overlay.classList.add("hidden"));
controls.addEventListener("unlock", () => { if (detail.classList.contains("hidden")) overlay.classList.remove("hidden"); });

const keys = {};
addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "KeyH") hud.toggle(clock.elapsedTime);
  if (e.code === "Digit0") goto("rotunda");
  if (e.code === "Digit1") goto("a");
  if (e.code === "Digit2") goto("b");
  if (e.code === "Digit3") goto("c");
  if (e.code === "Escape" && !detail.classList.contains("hidden")) { detail.classList.add("hidden"); controls.lock(); }
});
addEventListener("keyup", e => keys[e.code] = false);

function goto(k) {
  setTimeout(() => window.__hudSnap && window.__hudSnap(), 0);
  if (k === "rotunda") { camera.position.set(0, EYE, 2.5); camera.lookAt(ROOMS[1].u.x * 5, EYE, ROOMS[1].u.z * 5); return; }
  const r = ROOMS.find(r => r.key === k);
  const p = r.u.clone().multiplyScalar(R + PASS + 1.5);
  camera.position.set(p.x, EYE + (k === "a" ? 0.4 : 0), p.z);
  camera.lookAt(r.centre.x, k === "a" ? 2.2 : 1.6, r.centre.z);
}

function walkable(x, z) {
  if (Math.hypot(x, z) < R - 0.4) return true;
  for (const r of ROOMS) {
    const s = x * r.u.x + z * r.u.z, d = x * r.v.x + z * r.v.z;
    if (s > R - 1.5 && s < R + PASS + 1 && Math.abs(d) < DOOR - 0.35) return true;
    const lx = s - (R + PASS + A_AX);
    if ((lx / (A_AX - 0.55)) ** 2 + (d / (B_AX - 0.55)) ** 2 < 1) return true;
  }
  return false;
}
function roomKeyAt(x, z) {
  if (Math.hypot(x, z) < R + 1.5) return null;
  let best = null, bd = 1e9;
  ROOMS.forEach(r => { const d = Math.hypot(x - r.centre.x, z - r.centre.z); if (d < bd) { bd = d; best = r; } });
  return bd < A_AX + 1 ? best.key : null;
}
function roomAt(x, z) {
  if (Math.hypot(x, z) < R + 0.5) return "ROTUNDA";
  let best = null, bd = 1e9;
  ROOMS.forEach(r => { const d = Math.hypot(x - r.centre.x, z - r.centre.z); if (d < bd) { bd = d; best = r; } });
  return `${best.board.key} · ${best.board.title.split(", ")[1].toUpperCase()}`;
}

const ray = new THREE.Raycaster();
renderer.domElement.addEventListener("click", () => {
  if (!controls.isLocked) return;
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = ray.intersectObjects(clickable)[0];
  if (hit && hit.distance < 14) {
    const d = hit.object.userData;
    document.getElementById("detail-img").src = d.src;
    document.getElementById("detail-cap").textContent = `${d.room}${d.n ? " · " + numLabel(d.n) : ""} · ${d.title}`;
    detail.classList.remove("hidden");
    controls.unlock();
  }
});
detail.addEventListener("click", () => { detail.classList.add("hidden"); controls.lock(); });


// ---------------------------------------------------------------- teleport
// Space jumps to where you're pointing: the floor spot, or about 1.2 m back from a wall.
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);
const flash = document.getElementById("flash");
function teleportTarget() {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = 40;
  const hit = ray.intersectObjects([...floors, ...walls, ...clickable], false)[0];
  if (!hit) return null;
  let p;
  if (floors.includes(hit.object)) p = hit.point.clone();
  else {
    const back = ray.ray.direction.clone().setY(0).normalize().multiplyScalar(-1.2);
    p = hit.point.clone().add(back);
  }
  p.y = 0;
  for (let k = 0; k < 12 && !walkable(p.x, p.z); k++) p.lerp(camera.position.clone().setY(0), 0.25);
  return walkable(p.x, p.z) ? p : null;
}
function teleport() {
  const p = teleportTarget();
  if (!p) return;
  camera.position.set(p.x, EYE, p.z);
  if (flash) { flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); }
  window.__hudSnap && window.__hudSnap();
}
addEventListener("keydown", e => { if (e.code === "Space" && controls.isLocked) { e.preventDefault(); teleport(); } });

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), side = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (controls.isLocked) {
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 6 : 2.6) * dt;
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    side.crossVectors(fwd, camera.up);
    let dx = 0, dz = 0;
    if (keys.KeyW || keys.ArrowUp) { dx += fwd.x; dz += fwd.z; }
    if (keys.KeyS || keys.ArrowDown) { dx -= fwd.x; dz -= fwd.z; }
    if (keys.KeyD || keys.ArrowRight) { dx += side.x; dz += side.z; }
    if (keys.KeyA || keys.ArrowLeft) { dx -= side.x; dz -= side.z; }
    const L = Math.hypot(dx, dz);
    if (L) {
      dx *= sp / L; dz *= sp / L;
      const p = camera.position;
      if (walkable(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
      else if (walkable(p.x + dx, p.z)) p.x += dx;
      else if (walkable(p.x, p.z + dz)) p.z += dz;
      p.y = EYE;
    }
  }
  if (embed) embedCamera(embed, t);
  if (controls.isLocked) {
    const tp = teleportTarget();
    marker.visible = !!tp;
    if (tp) { marker.position.set(tp.x, 0.02, tp.z); marker.scale.setScalar(1 + 0.08 * Math.sin(t * 5)); }
  } else marker.visible = false;
  animators.forEach(f => f(dt, t));
  const hudOff = embed || params.get("hud") === "0";
  hud.setRoom(hudOff ? null : roomKeyAt(camera.position.x, camera.position.z), t);
  hud.update(dt, t, controls.isLocked && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD));
  where.textContent = roomAt(camera.position.x, camera.position.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  hud.rebuild();
});
// Embedded in a board: a slow, framed camera move per room
const _p = new THREE.Vector3(), _l = new THREE.Vector3();
function embedCamera(k, t) {
  const g = roomGroups[k];
  if (k === "a") { const a = t * 0.08 - Math.PI; _p.set(7.6 * Math.cos(a), 3.4, 4.3 * Math.sin(a)); _l.set(0, 2.9, 0); }
  else if (k === "b") { const x = -9.2 + 3.2 * (0.5 - 0.5 * Math.cos(t * 0.12)); _p.set(x, 1.75, 0.15 * Math.sin(t * 0.2)); _l.set(x + 6, 1.65, 0); }
  else { _p.set(-6.3, 2.5, 0.9 + 1.6 * Math.sin(t * 0.1)); _l.set(0, 2.4, 0.9); }
  camera.position.copy(g.localToWorld(_p.clone()));
  camera.lookAt(g.localToWorld(_l.clone()));
}
goto(shot || "rotunda");
window.__rooms = { camera, scene, renderer, goto, teleport, teleportTarget, render: () => renderer.render(scene, camera) };
frame();
