// Holographic visor: each room's collage floats round the edge of your view, like a
// helmet HUD. It trails the camera with a little lag, sways within a clamped angle,
// bobs as you walk, and keeps the centre clear so the model reads through it.
// Driven entirely by boards.json: nothing here needs editing for a new direction.

import * as THREE from "three";
import { type Board, label as boardLabel, num, stationMaps } from "../src/boards.ts";
import type { LabelOptions } from "./centre.ts";

const D = 1.0;          // distance of the visor plane in front of the eye
const MAX_LAG = 0.1;    // radians the visor may trail the view
const MAX_SLIDE = 0.06; // metres it may trail when you walk

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
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

type MakeLabel = (text: string, colour: string, opts?: LabelOptions) => THREE.Sprite;

export type Hud = {
  readonly setRoom: (slug: string | null, t: number) => void;
  readonly toggle: (t: number) => void;
  readonly update: (dt: number, t: number, walking: boolean) => void;
  readonly snap: () => void;
  readonly rebuild: () => void;
};

type StripKind = "row" | "col";
type Strip = {
  readonly kind: StripKind;
  readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number;
  readonly items: Board["images"][number][];
  load: number;
};

/** A visor piece: fades in after `delay` seconds and has one material to fade. */
type Piece = {
  readonly obj: THREE.Object3D;
  readonly material: THREE.Material;
  readonly maxOpacity: number;
  readonly delay: number;
  readonly baseScale: THREE.Vector3;
  readonly overlay: THREE.ShaderMaterial | null;
};

export function createHud(args: {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly boards: readonly Board[];
  readonly texLoader: THREE.TextureLoader;
  readonly makeLabel: MakeLabel;
}): Hud {
  const { scene, camera, boards, texLoader, makeLabel } = args;
  const rig = new THREE.Group();
  rig.renderOrder = 1000;
  scene.add(rig);
  let current: string | null = null;
  let enabled = true;
  let t0 = 0;
  let pieces: Piece[] = [];
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  let bob = 0;

  function clear(): void {
    for (const p of pieces) {
      rig.remove(p.obj);
      p.obj.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
          o.geometry.dispose();
          const m: unknown = o.material;
          if (m instanceof THREE.Material) m.dispose();
        }
      });
    }
    pieces = [];
  }

  function add(obj: THREE.Object3D, material: THREE.Material, maxOpacity: number, delay: number, overlay: THREE.ShaderMaterial | null = null): void {
    rig.add(obj);
    pieces.push({ obj, material, maxOpacity, delay, baseScale: obj.scale.clone(), overlay });
  }

  // Lay the board's pictures round the edge of the view, like the 2D collage.
  function build(slug: string | null): void {
    clear();
    if (slug === null) return;
    const b = boards.find(x => x.slug === slug);
    if (b === undefined) return;
    const light = b.theme.mode === "light";
    const tint = new THREE.Color(b.theme.holo);
    const ink = light ? "#16171b" : "#ffffff";
    const { stepOf } = stationMaps(b);
    const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D;
    const hw = hh * camera.aspect;
    const gap = 0.012;
    const strip = (kind: StripKind, x0: number, x1: number, y0: number, y1: number): Strip => ({ kind, x0, x1, y0, y1, items: [], load: 0 });
    const top = strip("row", -hw * 0.96, hw * 0.96, hh * 0.66, hh * 0.95);
    const bottom = strip("row", -hw * 0.96, hw * 0.96, -hh * 0.95, -hh * 0.66);
    const left = strip("col", -hw * 0.96, -hw * 0.74, -hh * 0.6, hh * 0.6);
    const right = strip("col", hw * 0.74, hw * 0.96, -hh * 0.6, hh * 0.6);
    const strips: readonly Strip[] = [top, bottom, left, right];
    const cap = (s: Strip): number => (s.kind === "row" ? (s.x1 - s.x0) / (s.y1 - s.y0) : (s.y1 - s.y0) / (s.x1 - s.x0));
    const leastLoaded = (arr: readonly Strip[]): Strip => arr.reduce((a, s) => (s.load < a.load ? s : a));

    for (const im of [...b.images].sort((x, y) => y.ar - x.ar)) {
      const pref = im.ar >= 1.1 ? [top, bottom] : [left, right];
      const s = pref.some(p => p.load < 1) ? leastLoaded(pref) : leastLoaded(strips);
      s.items.push(im);
      s.load += (s.kind === "row" ? im.ar : 1 / im.ar) / cap(s);
    }

    let i = 0;
    const place = (im: Board["images"][number], x: number, y: number, w: number, h: number): void => {
      const base = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
        color: new THREE.Color("#ffffff").lerp(tint, light ? 0.15 : 0.35),
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), base);
      texLoader.load(`../img/${im.f}`, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        base.map = tex;
        base.needsUpdate = true;
      });
      const overlay = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
        blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { tint: { value: tint.clone() }, opacity: { value: 0 }, time: { value: 0 }, seed: { value: i * 1.7 } },
      });
      const ov = new THREE.Mesh(new THREE.PlaneGeometry(w, h), overlay);
      ov.renderOrder = 1001;
      m.add(ov);
      // curve the visor: panels further out turn toward the eye
      m.position.set(x, y, -D);
      m.rotation.set(Math.atan(y / D) * 0.45, -Math.atan(x / D) * 0.45, 0, "YXZ");
      m.renderOrder = 1000;
      const delay = i * 0.045;
      add(m, base, 0.78, delay, overlay);
      const n = stepOf.get(im.id);
      if (n !== undefined) {
        const lb = makeLabel(num(n), ink, { size: 0.022 });
        lb.material.depthTest = false;
        lb.renderOrder = 1001;
        lb.center.set(0, 1);
        lb.position.set(x - w / 2 + 0.006, y + h / 2 - 0.006, -D + 0.001);
        add(lb, lb.material, 0.9, delay);
      }
      i++;
    };

    for (const s of strips) {
      const count = s.items.length;
      if (count === 0) continue;
      if (s.kind === "row") {
        let h = s.y1 - s.y0;
        let total = s.items.reduce((a, im) => a + im.ar * h, 0) + gap * (count - 1);
        if (total > s.x1 - s.x0) {
          h *= (s.x1 - s.x0 - gap * (count - 1)) / (total - gap * (count - 1));
          total = s.x1 - s.x0;
        }
        let x = -total / 2;
        const yc = (s.y0 + s.y1) / 2 + (s.y0 > 0 ? (s.y1 - s.y0 - h) / 2 : -(s.y1 - s.y0 - h) / 2);
        for (const im of s.items) {
          const w = im.ar * h;
          place(im, x + w / 2, yc, w, h);
          x += w + gap;
        }
      } else {
        let w = s.x1 - s.x0;
        let total = s.items.reduce((a, im) => a + w / im.ar, 0) + gap * (count - 1);
        if (total > s.y1 - s.y0) {
          w *= (s.y1 - s.y0 - gap * (count - 1)) / (total - gap * (count - 1));
          total = s.y1 - s.y0;
        }
        let y = total / 2;
        const xc = s.x0 < 0 ? s.x0 + w / 2 : s.x1 - w / 2;
        for (const im of s.items) {
          const h = w / im.ar;
          place(im, xc, y - h / 2, w, h);
          y -= h + gap;
        }
      }
    }

    // corner brackets and a header, drawn as hairlines
    const L = 0.06, X = hw * 0.7, Y = hh * 0.62, Z = -D;
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(sx * X, sy * (Y - L), Z), new THREE.Vector3(sx * X, sy * Y, Z), new THREE.Vector3(sx * (X - L), sy * Y, Z)]);
      const mat = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0, depthTest: false });
      const line = new THREE.Line(g, mat);
      line.renderOrder = 1001;
      add(line, mat, 0.9, 0.1);
    }
    const head = makeLabel(`${boardLabel(b).toUpperCase()}  ·  ${b.headline}`, ink, { size: 0.026 });
    head.material.depthTest = false;
    head.renderOrder = 1001;
    head.center.set(0, 0);
    head.position.set(-X, Y + 0.012, Z);
    add(head, head.material, 0.9, 0.05);
  }

  function setRoom(slug: string | null, t: number): void {
    if (slug === current) return;
    current = slug;
    t0 = t;
    build(enabled ? slug : null);
  }

  function toggle(t: number): void {
    enabled = !enabled;
    const s = current;
    current = null;
    setRoom(s, t);
  }

  function update(dt: number, t: number, walking: boolean): void {
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

    // boot-up: panels appear in a quick stagger, then hold
    const since = t - t0;
    for (const p of pieces) {
      const k = THREE.MathUtils.clamp((since - p.delay) / 0.35, 0, 1);
      const a = k * k * (3 - 2 * k);
      p.material.opacity = a * p.maxOpacity;
      if (p.overlay !== null) {
        const u = p.overlay.uniforms;
        if (u["opacity"]) u["opacity"].value = a;
        if (u["time"]) u["time"].value = t;
      }
      p.obj.scale.copy(p.baseScale).multiplyScalar(0.96 + 0.04 * a);
    }
  }

  function snap(): void {
    q.copy(camera.quaternion);
    pos.copy(camera.position);
  }

  return { setRoom, toggle, update, snap, rebuild: () => build(current) };
}
