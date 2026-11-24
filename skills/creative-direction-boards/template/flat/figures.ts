// ============================================================================
// 2D CENTRE FIGURES: the one file to edit for a new direction's flat draft.
//
// Each figure draws the process into the SVG with ctx.el(...) and returns, for
// every step number, its group <g> and the node the hover leader line points at.
// The page fits the SVG's viewBox to whatever you draw, so any coordinate range
// works. Colour stations with ctx.colour(step.phase) (CSS variables, so the
// board's theme applies). Use ctx.rng() for every random choice.
// The 3D version of the same figure lives in rooms/centre.ts under the same name.
// ============================================================================

import { type Board, type Phase, type Step, num } from "../src/boards.ts";
import { along, sample } from "../src/seeded.ts";

export type Attrs = Readonly<Record<string, string | number>>;
export type El = (name: string, attrs: Attrs, parent?: Element) => SVGElement;
export type StationEl = { readonly g: SVGElement; readonly node: SVGElement };

export type FigureContext = {
  readonly el: El;
  readonly board: Board;
  readonly steps: readonly Step[];
  readonly colour: (phase: Phase) => string;
  readonly rng: () => number;
  readonly motion: boolean;
};

export type Figure = (ctx: FigureContext) => ReadonlyMap<number, StationEl>;

function labelText(el: El, g: SVGElement, s: Step, x: number, y: number, anchor: "start" | "end" = "start"): void {
  const t = el("text", { x, y, class: "lab", "text-anchor": anchor }, g);
  const n = el("tspan", { class: "n" }, t);
  n.textContent = num(s.n);
  t.append(`  ${s.name}`);
}

/** Phase name → [first step index, last step index], in process order. */
function phaseSpans(steps: readonly Step[]): readonly (readonly [Phase, number, number])[] {
  const out: [Phase, number, number][] = [];
  steps.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last !== undefined && last[0] === s.phase) last[2] = i;
    else out.push([s.phase, i, i]);
  });
  return out;
}

function animate(motion: boolean, f: (ms: number) => void): void {
  if (!motion) return;
  let start: number | null = null;
  const tick = (ts: number): void => {
    start ??= ts;
    f(ts - start);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// C · Flow. Seed KQZ69CCD…: the 6 and the 9 became a figure-eight.
// ---------------------------------------------------------------------------
const eight: Figure = ({ el, board, steps, colour, motion }) => {
  const aL = 380, aR = 300;
  const lem = (t: number, a: number): readonly [number, number] => {
    const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s;
    return [(a * c) / d, (a * s * c) / d];
  };
  const point = (u: number, spread = 0): readonly [number, number] => {
    if (u < 0.4) {
      const [x, y] = lem(Math.PI / 2 + (u / 0.4) * Math.PI, aL);
      const k = 1 + (spread * Math.abs(x)) / aL;
      return [x * k, y * k * 1.15];
    }
    if (u < 0.6) return lem(-Math.PI / 2 + ((u - 0.4) / 0.2) * (Math.PI / 2), aR);
    const v = (u - 0.6) / 0.4, C = aR * 0.56, rx = aR - C, ry = aR * 0.36;
    const th = v * Math.PI * 2 * 2.25, k = 1 - 0.93 * Math.pow(v, 0.85);
    return [C + rx * k * Math.cos(th), ry * k * Math.sin(th)];
  };
  const pathD = (u0: number, u1: number, spread = 0, n = 400): string =>
    Array.from({ length: n + 1 }, (_, i) => {
      const [x, y] = point(u0 + ((u1 - u0) * i) / n, spread);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join("");

  const st = board.flat.style;
  for (const s of st.spreads) {
    el("path", {
      d: pathD(0, 0.4, s), class: st.flow ? "strand flow" : "strand", stroke: "var(--c1)",
      "stroke-width": 0.5, opacity: st.strandOpacity, "stroke-dasharray": st.strandDash || "none",
    });
  }
  el("path", { d: pathD(0, 0.4), class: "strand", stroke: "var(--c1)", "stroke-width": st.w });
  el("path", { d: pathD(0.4, 0.6), class: "strand", stroke: "var(--c2)", "stroke-width": st.w });
  el("path", { d: pathD(0.6, 1, 0, 700), class: "strand", stroke: "var(--c3)", "stroke-width": st.w });
  const [ex, ey] = point(1);
  el("circle", { cx: ex, cy: ey, r: 2.5, fill: "var(--c3)" });
  const full = el("path", { d: pathD(0, 1, 0, 1200), fill: "none", stroke: "none" });
  const runner = el("circle", { r: 2.2, class: "runner" });

  const minX = -aL * 1.27, maxX = aR + 10, topY = -aL * 0.48;
  const leftX = minX - 30, rightX = maxX + 46;
  const out = new Map<number, StationEl>();
  let defineRow = 0;
  const lastDeliver = steps.filter(s => s.phase === "deliver").length - 1;
  let deliverRow = 0;
  steps.forEach((s, i) => {
    const [x, y] = point(sample([0.07, 0.31, 0.45, 0.52, 0.59, 0.67, 0.8, 0.975], along(i, steps.length)));
    const g = el("g", { "data-n": s.n });
    let lx: number, ly: number, d: string, anchor: "start" | "end" = "start";
    switch (s.phase) {
      case "intent":
      case "discover":
        lx = leftX; ly = y; anchor = "end"; d = `M${x} ${y} L${lx + 8} ${ly}`;
        break;
      case "define":
        ly = topY + defineRow++ * 22; lx = x + 10; d = `M${x} ${y} V${ly - 4} H${lx - 4}`;
        break;
      case "deliver":
        // the last step sits at the top of the column, earlier ones stack below it
        lx = rightX; ly = (lastDeliver - deliverRow++) * 26 + 4; d = `M${x} ${y} H${rightX - 28} V${ly - 4} H${lx - 8}`;
        break;
    }
    el("path", { d, class: "lead" }, g);
    const node = el("circle", { cx: x, cy: y, r: 4.5, class: "node", stroke: colour(s.phase) }, g);
    labelText(el, g, s, lx, ly, anchor);
    out.set(s.n, { g, node });
  });
  const ticks: readonly (readonly [string, number, string, number])[] = [
    ["DISCOVER", -aL * 0.62, "var(--c1)", -aL * 0.46], ["DEFINE", 0, "var(--c2)", -10], ["DELIVER", aR * 0.56, "var(--c3)", -aR * 0.38]];
  for (const [txt, x, col, y2] of ticks) {
    el("text", { x, y: topY - 40, class: "phase", fill: col, "text-anchor": "middle" }).textContent = txt;
    el("line", { x1: x, y1: topY - 32, x2: x, y2, class: "tick", opacity: 0.5 });
  }
  if (full instanceof SVGPathElement) {
    const len = full.getTotalLength();
    animate(motion, ms => {
      const p = full.getPointAtLength(((ms / 16000) % 1) * len);
      runner.setAttribute("cx", String(p.x));
      runner.setAttribute("cy", String(p.y));
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// A · Engineering. Seed nkWh4Ez4X1…: "X1" a single axis, "4Ez4X" an exploded
// view. A wide rough base part, finer parts stacked up one axis, a small exact
// part on top, and the assembled object beside it.
// ---------------------------------------------------------------------------
const exploded: Figure = ({ el, steps, colour, rng, motion }) => {
  const K = 0.34; // isometric squash
  const n = steps.length;
  type Part = { readonly step: Step; readonly r: number; readonly h: number; readonly y: number; readonly i: number };
  let y = 300;
  const parts: readonly Part[] = steps.map((step, i) => {
    const u = along(i, n);
    if (i > 0) y -= sample([92, 86, 72, 66, 60, 52, 46], along(i - 1, n - 1));
    return { step, i, r: sample([230, 200, 160, 140, 120, 92, 70, 46], u), h: sample([14, 12, 11, 10, 10, 9, 8, 8], u), y };
  });
  const first = parts[0], last = parts[parts.length - 1];
  if (first === undefined || last === undefined) return new Map();
  el("line", { x1: 0, y1: first.y + 60, x2: 0, y2: last.y - 70, class: "tick", "stroke-dasharray": "18 4 2 4", opacity: 0.9 });

  const out = new Map<number, StationEl>();
  for (const p of parts) {
    const col = colour(p.step.phase);
    const g = el("g", { "data-n": p.step.n });
    const ry = p.r * K;
    el("path", { d: `M${-p.r} ${p.y} L${-p.r} ${p.y + p.h} A${p.r} ${ry} 0 0 0 ${p.r} ${p.y + p.h} L${p.r} ${p.y} Z`, fill: "var(--ink)", stroke: col, "stroke-width": 1 }, g);
    el("ellipse", { cx: 0, cy: p.y, rx: p.r, ry, fill: "var(--ink)", stroke: col, "stroke-width": 1.2 }, g);
    el("ellipse", { cx: 0, cy: p.y, rx: p.r * 0.72, ry: ry * 0.72, fill: "none", stroke: col, "stroke-width": 0.5, opacity: 0.6 }, g);
    el("ellipse", { cx: 0, cy: p.y, rx: 9, ry: 9 * K, fill: "none", stroke: col, "stroke-width": 0.9 }, g);
    const hole = (rho: number, th: number, s = 5): void => {
      el("ellipse", { cx: rho * Math.cos(th), cy: p.y + rho * Math.sin(th) * K, rx: s, ry: s * K * 1.2, fill: "none", stroke: col, "stroke-width": 0.7 }, g);
    };
    if (p.i === 0) {
      for (let k = 0; k < 26; k++) hole(30 + rng() * (p.r - 44), rng() * Math.PI * 2, 2.5 + rng() * 5);
    } else if (p.i === 1) {
      for (let k = 0; k < 9; k++) {
        const th = (k / 9) * Math.PI * 2 + rng() * 0.3, r0 = p.r * (0.3 + rng() * 0.15), r1 = p.r * (0.62 + rng() * 0.25);
        el("line", { x1: r0 * Math.cos(th), y1: p.y + r0 * Math.sin(th) * K, x2: r1 * Math.cos(th), y2: p.y + r1 * Math.sin(th) * K, stroke: col, "stroke-width": 2.2, opacity: 0.8 }, g);
      }
    } else {
      const holes = Math.round(sample([12, 8, 6, 4, 2, 0], along(p.i - 2, n - 2)));
      for (let k = 0; k < holes; k++) hole(p.r * 0.86, (k / holes) * Math.PI * 2 + Math.PI / 2, 4);
    }
    const lx = 330;
    el("path", { d: `M${p.r} ${p.y} L${lx - 10} ${p.y}`, class: "lead" }, g);
    const node = el("rect", { x: p.r - 3.5, y: p.y - 3.5, width: 7, height: 7, class: "node", stroke: col }, g);
    labelText(el, g, p.step, lx, p.y + 4);
    out.set(p.step.n, { g, node });
  }

  // phase brackets on the left
  for (const [phase, a, b] of phaseSpans(steps)) {
    const pa = parts[a], pb = parts[b];
    if (pa === undefined || pb === undefined) continue;
    const x = -280, y0 = pa.y + 10, y1 = pb.y - 6, col = colour(phase);
    el("path", { d: `M${x + 8} ${y0} H${x} V${y1} H${x + 8}`, fill: "none", stroke: col, "stroke-width": 0.8 });
    el("text", { x: x - 12, y: (y0 + y1) / 2 + 3, class: "phase", fill: col, "text-anchor": "end" }).textContent = phase.toUpperCase();
  }

  // the assembled object, beside the exploded view
  const ax = 560, ay = 250;
  let yy = ay;
  for (const p of parts) {
    const r = p.r * 0.22, ry = r * K, h = p.h * 0.55;
    el("path", { d: `M${ax - r} ${yy} L${ax - r} ${yy + h} A${r} ${ry} 0 0 0 ${ax + r} ${yy + h} L${ax + r} ${yy} Z`, fill: "var(--ink)", stroke: "var(--fg)", "stroke-width": 0.6 });
    el("ellipse", { cx: ax, cy: yy, rx: r, ry, fill: "var(--ink)", stroke: "var(--fg)", "stroke-width": 0.6 });
    yy -= h;
  }
  el("text", { x: ax, y: ay + 44, class: "phase", fill: "var(--muted)", "text-anchor": "middle" }).textContent = "ASSEMBLED";

  // a small marker rising up the axis
  const m = el("circle", { r: 2.4, class: "runner", cx: 0 });
  const y0 = first.y + 50, y1 = last.y - 60;
  animate(motion, ms => m.setAttribute("cy", String(y0 + (y1 - y0) * ((ms / 9000) % 1))));
  return out;
};

// ---------------------------------------------------------------------------
// B · Clarity. Seed 8RcWQQj4…: the 8s and the QQs read as openings, "F0" as
// focus at zero. Nested frames receding to one aperture: the outer ones drift
// and tilt, the inner ones settle onto the centre, ending in a single opening.
// ---------------------------------------------------------------------------
const aperture: Figure = ({ el, steps, colour, rng, motion }) => {
  const W0 = 640, H0 = 440, cx = -60, cy = 0;
  type Frame = { readonly step: Step; readonly w: number; readonly h: number; readonly x: number; readonly y: number; readonly rot: number };
  const frames: readonly Frame[] = steps.map((step, i) => {
    const e = along(i, steps.length) * 7;
    const s = Math.pow(0.77, e), settle = Math.max(0, 1 - e / 5);
    return { step, w: W0 * s, h: H0 * s, x: cx + (rng() - 0.5) * 70 * settle, y: cy + (rng() - 0.5) * 40 * settle, rot: (rng() - 0.5) * 9 * settle };
  });
  const corners = (f: Frame): readonly (readonly [number, number])[] => {
    const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
      const px = (u * f.w) / 2, py = (v * f.h) / 2;
      return [f.x + px * c - py * s, f.y + px * s + py * c] as const;
    });
  };
  // perspective rails joining matching corners
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    if (next === undefined) return;
    const a = corners(f), b = corners(next);
    a.forEach(([x1, y1], k) => {
      const q = b[k];
      if (q !== undefined) el("line", { x1, y1, x2: q[0], y2: q[1], class: "tick", opacity: 0.45 });
    });
  });
  const out = new Map<number, StationEl>();
  const labX = 360;
  frames.forEach((f, i) => {
    const col = colour(f.step.phase);
    const g = el("g", { "data-n": f.step.n });
    const pts = corners(f);
    el("polygon", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: col, "stroke-width": i < 2 ? 1.4 : 1.1 }, g);
    const [nx, ny] = pts[1] ?? [0, 0];
    const ly = -200 + i * 28;
    el("path", { d: `M${nx} ${ny} L${labX - 40} ${ly - 4} H${labX - 8}`, class: "lead" }, g);
    const node = el("circle", { cx: nx, cy: ny, r: 4, class: "node", stroke: col }, g);
    labelText(el, g, f.step, labX, ly);
    out.set(f.step.n, { g, node });
  });
  const lastFrame = frames[frames.length - 1];
  if (lastFrame !== undefined) {
    const op = el("circle", { cx: lastFrame.x, cy: lastFrame.y, r: Math.min(lastFrame.w, lastFrame.h) * 0.32, fill: "var(--c3)" });
    if (motion) el("animate", { attributeName: "opacity", values: "1;.55;1", dur: "6s", repeatCount: "indefinite" }, op);
  }
  (["discover", "define", "deliver"] as const).forEach((p, i) => {
    el("text", { x: labX + i * 92, y: -240, class: "phase", fill: colour(p) }).textContent = p.toUpperCase();
  });
  return out;
};

/** Stations on a plain line. Copy it to start a new figure. */
const plinth: Figure = ({ el, steps, colour }) => {
  const out = new Map<number, StationEl>();
  el("line", { x1: 0, y1: 0, x2: (steps.length - 1) * 80, y2: 0, class: "tick" });
  steps.forEach((s, i) => {
    const g = el("g", { "data-n": s.n });
    const node = el("circle", { cx: i * 80, cy: 0, r: 5, class: "node", stroke: colour(s.phase) }, g);
    const t = el("text", { x: i * 80, y: 24, class: "lab", "text-anchor": "middle" }, g);
    t.textContent = num(s.n);
    out.set(s.n, { g, node });
  });
  return out;
};

export const FIGURES: Readonly<Record<string, Figure>> = { exploded, aperture, eight, plinth };
