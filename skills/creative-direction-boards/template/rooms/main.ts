// The process rotunda: a round room with one doorway per board, each opening onto an
// oval room where the board hangs round the wall and its centre piece stands in the
// middle. All content comes from ../boards.json; the centre pieces from ./centre.ts.
// Nothing in this file needs editing for a new direction.

import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { type Board, type Content, PHASES, label as boardLabel, loadContent, num, phaseColour, stationMaps } from "../src/boards.ts";
import { byId, showFatal } from "../src/dom.ts";
import { expect, some } from "../src/result.ts";
import { seeded } from "../src/seeded.ts";
import { type Animate, type Centre, type LabelOptions, CENTRES } from "./centre.ts";
import { createHud } from "./hud.ts";

// ---------------------------------------------------------------- plan
const EYE = 1.62;
const R = 7, H_ROT = 6.5, DOOR = 1.5, PASS = 4;
const A_AX = 13, B_AX = 6.5, H_OVAL = 6.2; // oval semi-axes, 2:1 like the Orangerie

type Room = {
  readonly board: Board;
  readonly centre: Centre;
  readonly angle: number;
  /** Unit vector out from the rotunda, and its perpendicular. */
  readonly u: THREE.Vector3;
  readonly v: THREE.Vector3;
  readonly origin: THREE.Vector3;
  readonly group: THREE.Group;
};

type PictureInfo = { readonly src: string; readonly title: string; readonly room: string; readonly step: number | undefined };

type Params = { readonly shot: string | null; readonly embed: string | null; readonly hudOff: boolean };

function params(): Params {
  const p = new URLSearchParams(location.search);
  const embed = p.get("embed");
  return { shot: p.get("shot"), embed, hudOff: embed !== null || p.get("hud") === "0" };
}

// ---------------------------------------------------------------- drawing helpers
function wallStrip(points: readonly (readonly [number, number])[], h: number, material: THREE.Material): THREE.Mesh {
  // a vertical ribbon through a polyline of [x, z]
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  let run = 0;
  points.forEach(([x, z], i) => {
    const prev = points[i - 1];
    if (prev) run += Math.hypot(x - prev[0], z - prev[1]);
    pos.push(x, 0, z, x, h, z);
    uv.push(run / h, 0, run / h, 1);
    if (i > 0) {
      const a = 2 * (i - 1);
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

type Line = { readonly t: string; readonly font: string; readonly fg: string; readonly track?: string; readonly lineH?: number };

function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return some(c.getContext("2d"), "this browser has no 2D canvas");
}

function textTexture(lines: readonly Line[], o: { readonly w: number; readonly h: number; readonly align: "left" | "center"; readonly pad: number }): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = o.w;
  c.height = o.h;
  const g = context2d(c);
  g.textAlign = o.align;
  g.textBaseline = "top";
  let y = o.pad;
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = l.fg;
    const size = Number(/(\d+)px/.exec(l.font)?.[1] ?? "40");
    g.letterSpacing = l.track ?? "0px";
    g.fillText(l.t, o.align === "center" ? o.w / 2 : o.pad, y);
    y += size * (l.lineH ?? 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function label(text: string, colour: string, opts: LabelOptions = {}): THREE.Sprite {
  const size = opts.size ?? 0.16;
  const font = (opts.mono ?? true) ? "500 44px 'IBM Plex Mono'" : "300 60px 'IBM Plex Sans Condensed'";
  const c = document.createElement("canvas");
  const g = context2d(c);
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 24;
  c.width = w;
  c.height = 64;
  g.font = font;
  g.fillStyle = colour;
  g.textBaseline = "middle";
  g.fillText(text, 12, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set((size * w) / 64, size, 1);
  s.center.set(0, 0.5);
  return s;
}

function wrap(s: string, n: number): readonly string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    if (`${line} ${w}`.trim().length > n) {
      out.push(line.trim());
      line = w;
    } else line += ` ${w}`;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// ---------------------------------------------------------------- world
type World = {
  readonly rooms: readonly Room[];
  readonly floors: THREE.Object3D[];
  readonly walls: THREE.Object3D[];
  readonly pictures: THREE.Mesh[];
  readonly animators: Animate[];
};

function buildRotunda(scene: THREE.Scene, content: Content, rooms: readonly Room[], world: World): void {
  const stone = new THREE.MeshStandardMaterial({ color: "#ece7dc", roughness: 0.95, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ color: "#cfc7b6", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  world.floors.push(floor);

  // the wall, with a gap for each doorway
  const gap = Math.asin(DOOR / R);
  rooms.forEach((r, i) => {
    const next = some(rooms[(i + 1) % rooms.length], "room list is empty");
    const a0 = r.angle + gap;
    const a1 = next.angle - gap + (i === rooms.length - 1 ? Math.PI * 2 : 0);
    const pts = Array.from({ length: 61 }, (_, k): readonly [number, number] => {
      const a = a0 + ((a1 - a0) * k) / 60;
      return [R * Math.cos(a), R * Math.sin(a)];
    });
    const w = wallStrip(pts, H_ROT, stone);
    scene.add(w);
    world.walls.push(w);
  });

  // lintels over the doorways, each with its room's name
  for (const r of rooms) {
    const lint = new THREE.Mesh(new THREE.PlaneGeometry(DOOR * 2, H_ROT - 3.4), stone);
    lint.position.copy(r.u).multiplyScalar(R * Math.cos(gap) - 0.01).setY(3.4 + (H_ROT - 3.4) / 2);
    lint.lookAt(0, lint.position.y, 0);
    scene.add(lint);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), new THREE.MeshBasicMaterial({
      transparent: true,
      map: textTexture([
        { t: boardLabel(r.board).toUpperCase(), font: "500 46px 'IBM Plex Mono'", track: "8px", fg: "#16171b" },
        { t: r.board.headline, font: "300 64px 'IBM Plex Sans Condensed'", fg: "#16171b" },
      ], { w: 1100, h: 200, align: "center", pad: 30 }),
    }));
    sign.position.copy(r.u).multiplyScalar(R * 0.93).setY(4.25);
    sign.lookAt(0, 4.25, 0);
    scene.add(sign);
  }

  // a shallow dome with an open oculus
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 16, 0, Math.PI * 2, 0.18, Math.PI / 2 - 0.18),
    new THREE.MeshStandardMaterial({ color: "#f3efe6", side: THREE.BackSide, roughness: 1 }));
  dome.scale.y = 0.35;
  dome.position.y = H_ROT;
  scene.add(dome);

  // floor inscription: the title and the phases the process uses
  const phases = PHASES.filter(p => p !== "intent" && content.process.some(s => s.phase === p)).join(" · ");
  const ins = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), new THREE.MeshBasicMaterial({
    transparent: true,
    map: textTexture([
      { t: content.title.toUpperCase(), font: "500 52px 'IBM Plex Mono'", track: "14px", fg: "#4a463f" },
      { t: phases, font: "300 60px 'IBM Plex Sans Condensed'", fg: "#4a463f" },
    ], { w: 1024, h: 1024, align: "center", pad: 410 }),
  }));
  ins.rotation.x = -Math.PI / 2;
  ins.position.y = 0.005;
  scene.add(ins);
}

function buildRoom(r: Room, content: Content, texLoader: THREE.TextureLoader, world: World): void {
  const B = r.board, th = B.theme, g = r.group;
  const dark = th.mode === "dark";
  const wallMat = new THREE.MeshStandardMaterial({ color: th.wall, roughness: 0.95, side: THREE.DoubleSide });
  const fl = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshStandardMaterial({ color: th.floor, roughness: 0.9 }));
  fl.scale.set(A_AX, B_AX, 1);
  fl.rotation.x = -Math.PI / 2;
  fl.position.y = 0.004;
  g.add(fl);
  world.floors.push(fl);

  // the oval wall, with the door at t = π
  const gapT = Math.asin(DOOR / B_AX);
  const pts = Array.from({ length: 201 }, (_, k): readonly [number, number] => {
    const t = -Math.PI + gapT + ((2 * Math.PI - 2 * gapT) * k) / 200;
    return [A_AX * Math.cos(t), B_AX * Math.sin(t)];
  });
  const wall = wallStrip(pts, H_OVAL, wallMat);
  g.add(wall);
  world.walls.push(wall);
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(DOOR * 2, H_OVAL - 3.4), wallMat);
  lintel.position.set(-A_AX * Math.cos(gapT) + 0.01, 3.4 + (H_OVAL - 3.4) / 2, 0);
  lintel.rotation.y = Math.PI / 2;
  g.add(lintel);

  // a diffuse skylight, like the Orangerie's
  const sky = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshBasicMaterial({ color: th.sky, side: THREE.DoubleSide }));
  sky.scale.set(A_AX, B_AX, 1);
  sky.rotation.x = Math.PI / 2;
  sky.position.y = H_OVAL;
  g.add(sky);

  // the board round the wall, at eye level
  const { stepOf } = stationMaps(B);
  const span = 2 * Math.PI - 2 * (gapT + 0.32);
  B.images.forEach((im, i) => {
    const t = -Math.PI + gapT + 0.32 + (span * (i + 0.5)) / B.images.length;
    const x = A_AX * 0.985 * Math.cos(t), z = B_AX * 0.985 * Math.sin(t);
    const nx = Math.cos(t) / A_AX, nz = Math.sin(t) / B_AX, nl = Math.hypot(nx, nz);
    const src = `../img/${im.f}`;
    texLoader.load(src, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const img: unknown = tex.image;
      const asp = img instanceof HTMLImageElement && img.height > 0 ? img.width / img.height : im.ar;
      let w = 2.3, h = w / asp;
      if (h > 2.2) {
        h = 2.2;
        w = h * asp;
      }
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      pic.position.set(x, 1.75, z);
      pic.rotation.y = Math.atan2(-nx / nl, -nz / nl);
      const step = stepOf.get(im.id);
      const info: PictureInfo = { src, title: im.t, room: B.slug.toUpperCase(), step };
      pic.userData = info;
      g.add(pic);
      world.pictures.push(pic);
      if (step !== undefined) {
        const lb = label(num(step), dark ? th.fg : "#16171b", { size: 0.2 });
        lb.position.set(x - (nx / nl) * 0.05, 1.75 + h / 2 + 0.2, z - (nz / nl) * 0.05);
        lb.center.set(0.5, 0.5);
        g.add(lb);
      }
    });
  });

  // wall text by the door
  const intro = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({
    transparent: true,
    map: textTexture([
      { t: boardLabel(B).toUpperCase(), font: "500 34px 'IBM Plex Mono'", track: "6px", fg: th.fg },
      { t: B.headline, font: "300 64px 'IBM Plex Sans Condensed'", fg: th.fg, lineH: 1.4 },
      ...wrap(B.caption, 52).map((l): Line => ({ t: l, font: "300 30px 'IBM Plex Sans Condensed'", fg: th.muted, lineH: 1.45 })),
      { t: B.seed ? `seed ${B.seed}` : "", font: "400 22px 'IBM Plex Mono'", fg: th.muted, lineH: 2.4 },
    ], { w: 1024, h: 512, align: "left", pad: 20 }),
  }));
  intro.position.set(-A_AX * 0.62, 2.0, -B_AX * 0.62 + 0.3);
  intro.rotation.y = Math.PI / 4.5;
  g.add(intro);

  const lamp = new THREE.PointLight(th.lamp, th.lampPower, 18, 1.6);
  lamp.position.set(0, 5.2, 0);
  g.add(lamp);

  // the centre piece
  world.animators.push(r.centre.build({
    group: g,
    board: B,
    steps: content.process,
    room: { a: A_AX, b: B_AX, height: H_OVAL },
    colourOf: p => phaseColour(th, p),
    label,
    rng: seeded(B.seed),
  }));
}

// ---------------------------------------------------------------- navigation
function walkable(rooms: readonly Room[], x: number, z: number): boolean {
  if (Math.hypot(x, z) < R - 0.4) return true;
  return rooms.some(r => {
    const s = x * r.u.x + z * r.u.z, d = x * r.v.x + z * r.v.z;
    if (s > R - 1.5 && s < R + PASS + 1 && Math.abs(d) < DOOR - 0.35) return true;
    const lx = s - (R + PASS + A_AX);
    return (lx / (A_AX - 0.55)) ** 2 + (d / (B_AX - 0.55)) ** 2 < 1;
  });
}

function nearestRoom(rooms: readonly Room[], x: number, z: number): { readonly room: Room; readonly dist: number } {
  return rooms
    .map(room => ({ room, dist: Math.hypot(x - room.origin.x, z - room.origin.z) }))
    .reduce((a, b) => (b.dist < a.dist ? b : a));
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  const content = expect(await loadContent("../boards.json", Object.keys(CENTRES)), "Could not load boards.json");
  if (content.boards.length === 0) throw new Error("boards.json has no boards");
  const opts = params();

  const app = expect(byId("app", HTMLDivElement), "page");
  const overlay = expect(byId("overlay", HTMLDivElement), "page");
  const detail = expect(byId("detail", HTMLDivElement), "page");
  const detailImg = expect(byId("detail-img", HTMLImageElement), "page");
  const detailCap = expect(byId("detail-cap", HTMLElement), "page");
  const where = expect(byId("where", HTMLDivElement), "page");
  const flash = expect(byId("flash", HTMLDivElement), "page");
  const roomList = expect(byId("room-list", HTMLElement), "page");
  roomList.textContent = content.boards.map(b => boardLabel(b)).join(", ");
  expect(byId("jump-keys", HTMLElement), "page").textContent = content.boards.map((_, i) => String(i + 1)).join(" ");

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
  camera.position.set(0, EYE, 2.5);
  scene.add(new THREE.HemisphereLight("#fffaf0", "#8a8170", 1.1));
  const sun = new THREE.DirectionalLight("#fff6e6", 0.8);
  sun.position.set(6, 20, 4);
  scene.add(sun);

  await Promise.all([
    document.fonts.load("500 40px 'IBM Plex Mono'"),
    document.fonts.load("400 40px 'IBM Plex Mono'"),
    document.fonts.load("300 40px 'IBM Plex Sans Condensed'"),
  ]).catch(() => []);

  // rooms spread evenly round the rotunda; three of them sit at -150°, -30° and 90°
  const rooms: readonly Room[] = content.boards.map((board, i) => {
    const angle = THREE.MathUtils.degToRad(-150 + (i * 360) / content.boards.length);
    const u = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const group = new THREE.Group();
    const origin = u.clone().multiplyScalar(R + PASS + A_AX);
    group.position.copy(origin);
    group.rotation.y = -angle; // local +x points away from the rotunda
    scene.add(group);
    return { board, centre: some(CENTRES[board.figure], `no centre piece "${board.figure}"`), angle, u, v: new THREE.Vector3(-u.z, 0, u.x), origin, group };
  });
  const world: World = { rooms, floors: [], walls: [], pictures: [], animators: [] };
  const texLoader = new THREE.TextureLoader();
  buildRotunda(scene, content, rooms, world);
  for (const r of rooms) buildRoom(r, content, texLoader, world);
  const hud = createHud({ scene, camera, boards: content.boards, texLoader, makeLabel: label });

  // ------------------------------------------------ walking
  const controls = new PointerLockControls(camera, renderer.domElement);
  if (opts.embed !== null) for (const id of ["crosshair", "where"]) document.getElementById(id)?.classList.add("hidden");
  if (opts.shot === null && opts.embed === null) overlay.classList.remove("hidden");
  overlay.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => overlay.classList.add("hidden"));
  controls.addEventListener("unlock", () => { if (detail.classList.contains("hidden")) overlay.classList.remove("hidden"); });

  const keys = new Set<string>();
  const timer = new THREE.Timer();
  timer.connect(document);

  function goto(slug: string): void {
    setTimeout(() => hud.snap(), 0);
    const r = rooms.find(x => x.board.slug === slug);
    if (r === undefined) {
      const first = some(rooms[1] ?? rooms[0], "no rooms");
      camera.position.set(0, EYE, 2.5);
      camera.lookAt(first.u.x * 5, EYE, first.u.z * 5);
      return;
    }
    const p = r.u.clone().multiplyScalar(R + PASS + 1.5);
    camera.position.set(p.x, EYE + r.centre.entry.eyeLift, p.z);
    camera.lookAt(r.origin.x, r.centre.entry.lookY, r.origin.z);
  }

  addEventListener("keydown", e => {
    keys.add(e.code);
    if (e.code === "KeyH") hud.toggle(timer.getElapsed());
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    if (digit !== undefined) goto(digit === "0" ? "rotunda" : rooms[Number(digit) - 1]?.board.slug ?? "rotunda");
    if (e.code === "Escape" && !detail.classList.contains("hidden")) {
      detail.classList.add("hidden");
      controls.lock();
    }
    if (e.code === "Space" && controls.isLocked) {
      e.preventDefault();
      teleport();
    }
  });
  addEventListener("keyup", e => keys.delete(e.code));

  // ------------------------------------------------ looking closer
  const ray = new THREE.Raycaster();
  const centreOfView = new THREE.Vector2(0, 0);
  renderer.domElement.addEventListener("click", () => {
    if (!controls.isLocked) return;
    ray.setFromCamera(centreOfView, camera);
    ray.far = 14;
    const hit = ray.intersectObjects(world.pictures)[0];
    if (hit === undefined) return;
    const d = hit.object.userData as PictureInfo;
    detailImg.src = d.src;
    detailCap.textContent = `${d.room}${d.step !== undefined ? ` · ${num(d.step)}` : ""} · ${d.title}`;
    detail.classList.remove("hidden");
    controls.unlock();
  });
  detail.addEventListener("click", () => {
    detail.classList.add("hidden");
    controls.lock();
  });

  // ------------------------------------------------ teleport
  // Space jumps to where you're pointing: the floor spot, or about 1.2 m back from a wall.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 48),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  function teleportTarget(): THREE.Vector3 | null {
    ray.setFromCamera(centreOfView, camera);
    ray.far = 40;
    const hit = ray.intersectObjects([...world.floors, ...world.walls, ...world.pictures], false)[0];
    if (hit === undefined) return null;
    const p = world.floors.includes(hit.object)
      ? hit.point.clone()
      : hit.point.clone().add(ray.ray.direction.clone().setY(0).normalize().multiplyScalar(-1.2));
    p.y = 0;
    const home = camera.position.clone().setY(0);
    for (let k = 0; k < 12 && !walkable(rooms, p.x, p.z); k++) p.lerp(home, 0.25);
    return walkable(rooms, p.x, p.z) ? p : null;
  }

  function teleport(): void {
    const p = teleportTarget();
    if (p === null) return;
    camera.position.set(p.x, EYE, p.z);
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    hud.snap();
  }

  // ------------------------------------------------ loop
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  const embedRoom = opts.embed === null ? undefined : rooms.find(r => r.board.slug === opts.embed);
  const moving = (): boolean => ["KeyW", "KeyS", "KeyA", "KeyD"].some(k => keys.has(k));

  function frame(): void {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    if (controls.isLocked) {
      const sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 6 : 2.6) * dt;
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      side.crossVectors(fwd, camera.up);
      let dx = 0, dz = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) { dx += fwd.x; dz += fwd.z; }
      if (keys.has("KeyS") || keys.has("ArrowDown")) { dx -= fwd.x; dz -= fwd.z; }
      if (keys.has("KeyD") || keys.has("ArrowRight")) { dx += side.x; dz += side.z; }
      if (keys.has("KeyA") || keys.has("ArrowLeft")) { dx -= side.x; dz -= side.z; }
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        dx *= sp / len;
        dz *= sp / len;
        const p = camera.position;
        if (walkable(rooms, p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
        else if (walkable(rooms, p.x + dx, p.z)) p.x += dx;
        else if (walkable(rooms, p.x, p.z + dz)) p.z += dz;
        p.y = EYE;
      }
      const tp = teleportTarget();
      marker.visible = tp !== null;
      if (tp !== null) {
        marker.position.set(tp.x, 0.02, tp.z);
        marker.scale.setScalar(1 + 0.08 * Math.sin(t * 5));
      }
    } else marker.visible = false;

    if (embedRoom !== undefined) {
      const s = embedRoom.centre.shot(t);
      camera.position.copy(embedRoom.group.localToWorld(s.pos.clone()));
      camera.lookAt(embedRoom.group.localToWorld(s.look.clone()));
    }
    for (const f of world.animators) f(dt, t);

    const { x, z } = camera.position;
    const near = nearestRoom(rooms, x, z);
    const inRoom = Math.hypot(x, z) >= R + 1.5 && near.dist < A_AX + 1 ? near.room.board.slug : null;
    hud.setRoom(opts.hudOff ? null : inRoom, t);
    hud.update(dt, t, controls.isLocked && moving());
    where.textContent = Math.hypot(x, z) < R + 0.5 ? "ROTUNDA" : boardLabel(near.room.board).toUpperCase();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    hud.rebuild();
  });

  goto(opts.shot ?? "rotunda");
  // hooks for screenshots and debugging
  Object.assign(window, { __rooms: { camera, scene, renderer, goto, teleport, render: () => renderer.render(scene, camera) } });
  requestAnimationFrame(frame);
}

main().catch((e: unknown) => showFatal(e instanceof Error ? e.message : String(e)));
