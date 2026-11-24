// ============================================================================
// CENTRE PIECES: the one file to edit for a new direction.
//
// Everything else in the rooms (rotunda, oval rooms, pictures on the walls,
// holographic visor, walking, teleport, embed camera) is driven by boards.json.
// A new seed reading needs only a new entry in CENTRES below:
//
//   build(ctx)  draws the figure into ctx.group and returns a per-frame animation.
//   shot(t)     the slow camera move used when the room is embedded in a mockup.
//   entry       where the camera looks when you jump into the room with 1/2/3.
//
// Room-local space: the origin is the centre of the oval floor, y is up, +x points
// away from the doorway (the door is at x = -room.a), and the oval has semi-axes
// room.a (along x) and room.b (along z). Pictures hang on the wall at y ≈ 1.75.
// Keep the figure inside about 60% of the oval so people can walk round it.
//
// Draw one station per step in ctx.steps (any count, numbered from 1), coloured
// by ctx.colourOf(step.phase), labelled with ctx.label(`${num(s.n)}  ${s.name}`).
// Use ctx.rng() for every random choice, so the seed always gives the same piece.
// ============================================================================

import * as THREE from "three";
import { type Board, type Phase, type Step, num } from "../src/boards.ts";
import { sample, along } from "../src/seeded.ts";

export type LabelOptions = { readonly size?: number; readonly mono?: boolean };

export type CentreContext = {
  readonly group: THREE.Group;
  readonly board: Board;
  readonly steps: readonly Step[];
  readonly room: { readonly a: number; readonly b: number; readonly height: number };
  readonly colourOf: (phase: Phase) => string;
  readonly label: (text: string, colour: string, opts?: LabelOptions) => THREE.Sprite;
  readonly rng: () => number;
};

/** Called every frame with the frame time and the elapsed time, in seconds. */
export type Animate = (dt: number, t: number) => void;

/** A camera position and look-at point, in room-local space. */
export type Shot = { readonly pos: THREE.Vector3; readonly look: THREE.Vector3 };

export type Centre = {
  readonly build: (ctx: CentreContext) => Animate;
  readonly shot: (t: number) => Shot;
  readonly entry: { readonly eyeLift: number; readonly lookY: number };
};

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const still: Animate = () => {};

// ---------------------------------------------------------------------------
// A · Engineering. Seed nkWh4Ez4X1…: "X1" a single axis, "4Ez4X" an exploded
// view. An assembly on one vertical axis: a wide rough base part, finer parts
// stacked up it, a small exact part on top, the assembled object beside it.
// ---------------------------------------------------------------------------
const exploded: Centre = {
  build(ctx) {
    const { group, board, steps, rng, colourOf, label } = ctx;
    const th = board.theme;
    const n = steps.length;
    const stack = new THREE.Group();
    stack.scale.setScalar(1.25);
    group.add(stack);
    const radiusAt = (i: number): number => sample([1.7, 1.48, 1.18, 1.03, 0.88, 0.68, 0.52, 0.34], along(i, n));
    const yAt = (i: number): number => sample([0.35, 0.95, 1.55, 2.05, 2.5, 2.9, 3.25, 3.55], along(i, n));
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 12), new THREE.MeshStandardMaterial({ color: th.muted }));
    axis.position.y = 2.1;
    stack.add(axis);

    steps.forEach((s, i) => {
      const r = radiusAt(i), y = yAt(i), t = 0.09 - along(i, n) * 0.042, c = colourOf(s.phase);
      const geo = new THREE.CylinderGeometry(r, r, t, 96, 1, false);
      const disc = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#14120e", metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.88 }));
      disc.position.y = y;
      stack.add(disc);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: c }));
      edges.position.y = y;
      stack.add(edges);
      const top = y + t / 2 + 0.003;
      const line = (pts: readonly THREE.Vector3[]): void => {
        stack.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([...pts]), new THREE.LineBasicMaterial({ color: c })));
      };
      const ring = (rad: number, x: number, z: number): void => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          pts.push(v3(x + rad * Math.cos(a), top, z + rad * Math.sin(a)));
        }
        line(pts);
      };
      // holes on the top face: scattered at the start, slots next, then fewer and more regular
      if (i === 0) {
        for (let k = 0; k < 26; k++) {
          const a = rng() * Math.PI * 2, d = 0.25 + rng() * (r - 0.35);
          ring(0.02 + rng() * 0.05, d * Math.cos(a), d * Math.sin(a));
        }
      } else if (i === 1) {
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + rng() * 0.3, d0 = r * (0.3 + rng() * 0.15), d1 = r * (0.62 + rng() * 0.25);
          line([v3(d0 * Math.cos(a), top, d0 * Math.sin(a)), v3(d1 * Math.cos(a), top, d1 * Math.sin(a))]);
        }
      } else {
        const holes = Math.round(sample([12, 8, 6, 4, 2, 0], along(i - 2, n - 2)));
        for (let k = 0; k < holes; k++) {
          const a = (k / holes) * Math.PI * 2;
          ring(0.04, r * 0.84 * Math.cos(a), r * 0.84 * Math.sin(a));
        }
      }
      ring(0.06, 0, 0);
      const lb = label(`${num(s.n)}  ${s.name}`, c, { size: 0.2 });
      lb.position.set(0, (y + 0.05) * 1.25, (r + 0.18) * 1.25);
      group.add(lb);
    });

    // the assembled object, on a plinth beside it
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: "#2d2921" }));
    plinth.position.set(3.4, 0.45, 2.2);
    group.add(plinth);
    let yy = 0.9;
    steps.forEach((_, i) => {
      const h = 0.05, r = radiusAt(i) * 0.17;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), new THREE.MeshStandardMaterial({ color: "#b48d45", metalness: 0.8, roughness: 0.35 }));
      m.position.set(3.4, yy + h / 2, 2.2);
      group.add(m);
      yy += h;
    });
    const al = label("ASSEMBLED", th.muted, { size: 0.12 });
    al.center.set(0.5, 0.5);
    al.position.set(3.4, 1.65, 2.2);
    group.add(al);
    return dt => { stack.rotation.y += dt * 0.12; };
  },
  shot(t) {
    const a = t * 0.08 - Math.PI;
    return { pos: v3(7.6 * Math.cos(a), 3.4, 4.3 * Math.sin(a)), look: v3(0, 2.9, 0) };
  },
  entry: { eyeLift: 0.4, lookY: 2.2 },
};

// ---------------------------------------------------------------------------
// B · Clarity. Seed 8RcWQQj4…: the 8s and the QQs read as openings, "F0" as
// focus at zero. Nested frames you walk through: the outer ones drift and
// tilt, the inner ones settle onto one centre, ending in a single opening.
// ---------------------------------------------------------------------------
const aperture: Centre = {
  build(ctx) {
    const { group, board, steps, rng, colourOf, label, room } = ctx;
    const th = board.theme;
    const n = steps.length;
    steps.forEach((s, i) => {
      const u = along(i, n);
      const k = Math.pow(0.84, u * 7), settle = Math.max(0, 1 - (u * 7) / 5);
      const w = 7.4 * k, h = 4.6 * k, bar = 0.07;
      const frame = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: colourOf(s.phase), roughness: 0.6 });
      const bars: readonly (readonly [number, number, number, number])[] = [[0, h, w + bar, bar], [0, 0, w + bar, bar], [-w / 2, h / 2, bar, h], [w / 2, h / 2, bar, h]];
      for (const [z, y, ww, hh] of bars) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bar, hh, ww), mat);
        m.position.set(0, y, z);
        frame.add(m);
      }
      frame.position.set(sample([-6.0, -4.3, -2.7, -1.2, 0.2, 1.5, 2.7, 3.8], u), (rng() - 0.5) * 0.4 * settle, (rng() - 0.5) * 1.2 * settle);
      frame.rotation.x = (rng() - 0.5) * 0.16 * settle;
      frame.rotation.z = (rng() - 0.5) * 0.06 * settle;
      group.add(frame);
      const lb = label(`${num(s.n)}  ${s.name}`, th.fg, { size: 0.14 });
      lb.position.set(0, h + 0.2, -w / 2);
      frame.add(lb);
    });
    // the opening: a glowing disc set into the far wall
    const glow = new THREE.MeshBasicMaterial({ color: th.c3, toneMapped: false });
    const opening = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), glow);
    opening.position.set(room.a * 0.69 + 0.02, 1.75, 0);
    opening.rotation.y = -Math.PI / 2;
    group.add(opening);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshStandardMaterial({ color: "#f4f1ea" }));
    back.position.set(room.a * 0.69 + 0.04, 1.75, 0);
    back.rotation.y = -Math.PI / 2;
    group.add(back);
    const base = new THREE.Color(th.c3);
    return (_dt, t) => { glow.color.copy(base).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.1)); };
  },
  shot(t) {
    const x = -9.2 + 3.2 * (0.5 - 0.5 * Math.cos(t * 0.12));
    return { pos: v3(x, 1.75, 0.15 * Math.sin(t * 0.2)), look: v3(x + 6, 1.65, 0) };
  },
  entry: { eyeLift: 0, lookY: 1.6 },
};

// ---------------------------------------------------------------------------
// C · Flow. Seed KQZ69CCD…: the 6 and the 9 became a figure-eight. Discover
// goes far on many strands, Define is where they cross, Deliver tightens into
// a spiral until only what matters is left.
// ---------------------------------------------------------------------------
const eight: Centre = {
  build(ctx) {
    const { group, board, steps, colourOf, label } = ctx;
    const th = board.theme;
    const S = 0.0105, aL = 380, aR = 300;
    const lem = (t: number, a: number): readonly [number, number] => {
      const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s;
      return [(a * c) / d, (a * s * c) / d];
    };
    const point = (u: number, spread = 0): THREE.Vector3 => {
      let x: number, y: number;
      if (u < 0.4) {
        [x, y] = lem(Math.PI / 2 + (u / 0.4) * Math.PI, aL);
        const k = 1 + (spread * Math.abs(x)) / aL;
        x *= k;
        y *= k * 1.15;
      } else if (u < 0.6) {
        [x, y] = lem(-Math.PI / 2 + ((u - 0.4) / 0.2) * (Math.PI / 2), aR);
      } else {
        const v = (u - 0.6) / 0.4, C = aR * 0.56, rx = aR - C, ry = aR * 0.36, a = v * Math.PI * 2 * 2.25, k = 1 - 0.93 * Math.pow(v, 0.85);
        x = C + rx * k * Math.cos(a);
        y = ry * k * Math.sin(a);
      }
      return v3(0.7 * Math.sin(u * Math.PI * 2) * (1 + spread), 2.5 - y * S, x * S + 0.9);
    };
    const seg = (u0: number, u1: number, count: number, spread = 0): THREE.Vector3[] =>
      Array.from({ length: count + 1 }, (_, i) => point(u0 + ((u1 - u0) * i) / count, spread));
    const tube = (pts: THREE.Vector3[], colour: string, r = 0.035): void => {
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 10), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false })));
    };
    for (const sp of [-0.36, -0.27, -0.18, -0.09, 0.09, 0.18, 0.27, 0.36]) {
      const mat = new THREE.LineDashedMaterial({ color: th.c1, dashSize: 0.18, gapSize: 0.08, transparent: true, opacity: 0.6 });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg(0, 0.4, 160, sp)), mat);
      l.computeLineDistances();
      group.add(l);
    }
    tube(seg(0, 0.4, 160), th.c1);
    tube(seg(0.4, 0.6, 80), th.c2);
    tube(seg(0.6, 1, 300), th.c3, 0.03);
    // stations sit along the curve: the first phase on the wide loop, the last on the spiral
    steps.forEach((s, i) => {
      const q = point(sample([0.07, 0.31, 0.45, 0.52, 0.59, 0.67, 0.8, 0.975], along(i, steps.length)));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: colourOf(s.phase), toneMapped: false }));
      dot.position.copy(q);
      group.add(dot);
      const lb = label(`${num(s.n)}  ${s.name}`, th.fg, { size: 0.15 });
      lb.position.copy(q).add(v3(-0.1, 0.24, 0.1));
      group.add(lb);
    });
    const full = new THREE.CatmullRomCurve3(seg(0, 1, 600));
    const runner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    group.add(runner);
    return (_dt, t) => {
      runner.position.copy(full.getPointAt(Math.max(0, t / 18) % 1));
    };
  },
  shot(t) {
    return { pos: v3(-6.3, 2.5, 0.9 + 1.6 * Math.sin(t * 0.1)), look: v3(0, 2.4, 0.9) };
  },
  entry: { eyeLift: 0, lookY: 1.6 },
};

/** A plain plinth, used when a board names no figure yet. Copy it to start a new one. */
const plinth: Centre = {
  build({ group, steps, colourOf, label }) {
    steps.forEach((s, i) => {
      const a = (i / steps.length) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6 + i * 0.25, 0.3), new THREE.MeshStandardMaterial({ color: colourOf(s.phase) }));
      m.position.set(2 * Math.cos(a), (0.6 + i * 0.25) / 2, 2 * Math.sin(a));
      group.add(m);
      const lb = label(`${num(s.n)}  ${s.name}`, colourOf(s.phase), { size: 0.14 });
      lb.position.set(m.position.x, 0.9 + i * 0.25, m.position.z);
      group.add(lb);
    });
    return still;
  },
  shot: t => ({ pos: v3(-7 * Math.cos(t * 0.05), 2.4, 4 * Math.sin(t * 0.05)), look: v3(0, 1.2, 0) }),
  entry: { eyeLift: 0, lookY: 1.4 },
};

export const CENTRES: Readonly<Record<string, Centre>> = { exploded, aperture, eight, plinth };
