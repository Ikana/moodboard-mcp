// Centre figures. Each draws into the SVG and returns { n: { g, node } } for the eight stations.
window.FIGURES = {};

// Small seeded PRNG so a seed string always gives the same drawing.
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
function reducedMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }

/* ------------------------------------------------------------------ *
 * C · Flow — seed KQZ69CCD…: the 6 and the 9 became a figure-eight.   *
 * ------------------------------------------------------------------ */
FIGURES.eight = function ({ el, B, STATIONS, COLOR }) {
  const aL = 380, aR = 300;
  const lem = (t, a) => { const s = Math.sin(t), c = Math.cos(t), d = 1 + s * s; return [a * c / d, a * s * c / d]; };
  function point(u, spread = 0) {
    if (u < 0.40) {
      const t = Math.PI / 2 + (u / 0.40) * Math.PI;
      const [x, y] = lem(t, aL);
      const k = 1 + spread * Math.abs(x) / aL;
      return [x * k, y * k * 1.15];
    } else if (u < 0.60) {
      return lem(-Math.PI / 2 + ((u - 0.40) / 0.20) * (Math.PI / 2), aR);
    } else {
      const v = (u - 0.60) / 0.40;
      const C = aR * 0.56, rx = aR - C, ry = aR * 0.36;
      const th = v * Math.PI * 2 * 2.25;
      const k = 1 - 0.93 * Math.pow(v, 0.85);
      return [C + rx * k * Math.cos(th), ry * k * Math.sin(th)];
    }
  }
  const pathD = (u0, u1, spread = 0, steps = 400) => {
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const [x, y] = point(u0 + (u1 - u0) * i / steps, spread);
      d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    return d;
  };
  const st = B.style;
  st.spreads.forEach(s => el("path", {
    d: pathD(0, 0.40, s), class: "strand" + (st.flow ? " flow" : ""),
    stroke: "var(--c1)", "stroke-width": .5, opacity: st.strandOpacity,
    "stroke-dasharray": st.strandDash || "none",
  }));
  el("path", { d: pathD(0, 0.40), class: "strand", stroke: "var(--c1)", "stroke-width": st.w });
  el("path", { d: pathD(0.40, 0.60), class: "strand", stroke: "var(--c2)", "stroke-width": st.w });
  el("path", { d: pathD(0.60, 1.0, 0, 700), class: "strand", stroke: "var(--c3)", "stroke-width": st.w });
  const [ex, ey] = point(1);
  el("circle", { cx: ex, cy: ey, r: 2.5, fill: "var(--c3)" });

  const full = el("path", { d: pathD(0, 1, 0, 1200), fill: "none", stroke: "none" });
  const runner = el("circle", { r: 2.2, class: "runner" });

  const T = { 1: .07, 2: .31, 3: .45, 4: .52, 5: .59, 6: .67, 7: .80, 8: .975 };
  const minX = -aL * 1.27, maxX = aR + 10, topY = -aL * 0.48;
  const leftX = minX - 30, rightX = maxX + 46;
  const out = {};
  let defineRow = 0;
  STATIONS.forEach(s => {
    const [x, y] = point(T[s.n]);
    const g = el("g", { "data-n": s.n });
    let lx, ly, anchor = "start", d;
    if (s.phase === "discover") { lx = leftX; ly = y; anchor = "end"; d = `M${x} ${y} L${lx + 8} ${ly}`; }
    else if (s.phase === "define") { ly = topY + defineRow++ * 22; lx = x + 10; d = `M${x} ${y} V${ly - 4} H${lx - 4}`; }
    else { const ys = { 7: 52, 6: 74, 8: 0 }; lx = rightX; ly = ys[s.n] + 4; d = `M${x} ${y} H${rightX - 28} V${ly - 4} H${lx - 8}`; }
    el("path", { d, class: "lead" }, g);
    const node = el("circle", { cx: x, cy: y, r: 4.5, class: "node", stroke: COLOR[s.phase] }, g);
    const t = el("text", { x: lx, y: ly, class: "lab", "text-anchor": anchor }, g);
    t.innerHTML = `<tspan class="n">${String(s.n).padStart(2, "0")}</tspan>  ${s.name}`;
    out[s.n] = { g, node };
  });
  [["DISCOVER", -aL * 0.62, "var(--c1)", -aL * 0.46], ["DEFINE", 0, "var(--c2)", -10], ["DELIVER", aR * 0.56, "var(--c3)", -aR * 0.38]]
    .forEach(([txt, x, col, y2]) => {
      el("text", { x, y: topY - 40, class: "phase", fill: col, "text-anchor": "middle" }).textContent = txt;
      el("line", { x1: x, y1: topY - 32, x2: x, y2, class: "tick", opacity: .5 });
    });

  if (!reducedMotion()) {
    const len = full.getTotalLength(); let start = null;
    const tick = ts => {
      if (!start) start = ts;
      const p = full.getPointAtLength(((ts - start) / 16000 % 1) * len);
      runner.setAttribute("cx", p.x); runner.setAttribute("cy", p.y);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * A · Engineering — seed nkWh4Ez4X1…: "X1" is a single axis,         *
 * "4Ez4X" an exploded view. The process as an assembly: a wide       *
 * rough base part, finer parts stacked up one axis, a small exact    *
 * part on top, and the assembled object shown beside it.             *
 * ------------------------------------------------------------------ */
FIGURES.exploded = function ({ el, B, STATIONS, COLOR }) {
  const rnd = seeded(B.seed);
  const K = 0.34;                       // isometric squash
  // radius, gap below, hole pattern, thickness
  const parts = [
    { n: 1, r: 230, h: 14, holes: "random" },
    { n: 2, r: 200, h: 12, holes: "slots" },
    { n: 3, r: 160, h: 11, holes: 12 },
    { n: 4, r: 140, h: 10, holes: 8 },
    { n: 5, r: 120, h: 10, holes: 6 },
    { n: 6, r: 92,  h: 9,  holes: 4 },
    { n: 7, r: 70,  h: 8,  holes: 2 },
    { n: 8, r: 46,  h: 8,  holes: 0 },
  ];
  const gaps = [0, 92, 86, 72, 66, 60, 52, 46];
  let y = 300;
  parts.forEach((p, i) => { y -= gaps[i]; p.y = y; });   // y = top surface centre

  // axis
  el("line", { x1: 0, y1: parts[0].y + 60, x2: 0, y2: parts[7].y - 70, class: "tick", "stroke-dasharray": "18 4 2 4", opacity: .9 });

  const phaseOf = n => STATIONS.find(s => s.n === n).phase;
  const out = {};
  // bottom (largest) first so upper parts sit in front
  parts.forEach(p => {
    const col = COLOR[phaseOf(p.n)];
    const g = el("g", { "data-n": p.n });
    const ry = p.r * K;
    // body: side walls + bottom arc
    el("path", {
      d: `M${-p.r} ${p.y} L${-p.r} ${p.y + p.h} A${p.r} ${ry} 0 0 0 ${p.r} ${p.y + p.h} L${p.r} ${p.y} Z`,
      fill: "var(--ink)", stroke: col, "stroke-width": 1,
    }, g);
    // top face
    el("ellipse", { cx: 0, cy: p.y, rx: p.r, ry, fill: "var(--ink)", stroke: col, "stroke-width": 1.2 }, g);
    // inner turned ring
    el("ellipse", { cx: 0, cy: p.y, rx: p.r * 0.72, ry: ry * 0.72, fill: "none", stroke: col, "stroke-width": .5, opacity: .6 }, g);
    // bore
    el("ellipse", { cx: 0, cy: p.y, rx: 9, ry: 9 * K, fill: "none", stroke: col, "stroke-width": .9 }, g);

    const hole = (rho, th, s = 5) => el("ellipse", {
      cx: rho * Math.cos(th), cy: p.y + rho * Math.sin(th) * K, rx: s, ry: s * K * 1.2,
      fill: "none", stroke: col, "stroke-width": .7,
    }, g);
    if (p.holes === "random") {
      for (let k = 0; k < 26; k++) hole(30 + rnd() * (p.r - 44), rnd() * Math.PI * 2, 2.5 + rnd() * 5);
    } else if (p.holes === "slots") {
      for (let k = 0; k < 9; k++) {
        const th = k / 9 * Math.PI * 2 + rnd() * 0.3, r0 = p.r * (0.3 + rnd() * 0.15), r1 = p.r * (0.62 + rnd() * 0.25);
        el("line", { x1: r0 * Math.cos(th), y1: p.y + r0 * Math.sin(th) * K, x2: r1 * Math.cos(th), y2: p.y + r1 * Math.sin(th) * K, stroke: col, "stroke-width": 2.2, opacity: .8 }, g);
      }
    } else {
      for (let k = 0; k < p.holes; k++) hole(p.r * 0.86, k / p.holes * Math.PI * 2 + Math.PI / 2, 4);
    }

    // callout: from the right rim out to a column
    const lx = 330, ly = p.y + 4;
    el("path", { d: `M${p.r} ${p.y} L${lx - 10} ${p.y}`, class: "lead" }, g);
    const node = el("rect", { x: p.r - 3.5, y: p.y - 3.5, width: 7, height: 7, class: "node", stroke: col }, g);
    const s = STATIONS.find(s => s.n === p.n);
    const t = el("text", { x: lx, y: ly, class: "lab" }, g);
    t.innerHTML = `<tspan class="n">${String(p.n).padStart(2, "0")}</tspan>  ${s.name}`;
    out[p.n] = { g, node };
  });

  // phase brackets on the left
  [["DISCOVER", 1, 2, "var(--c1)"], ["DEFINE", 3, 5, "var(--c2)"], ["DELIVER", 6, 8, "var(--c3)"]].forEach(([txt, a, b, col]) => {
    const pa = parts[a - 1], pb = parts[b - 1];
    const x = -280, y0 = pa.y + 10, y1 = pb.y - 6;
    el("path", { d: `M${x + 8} ${y0} H${x} V${y1} H${x + 8}`, fill: "none", stroke: col, "stroke-width": .8 });
    el("text", { x: x - 12, y: (y0 + y1) / 2 + 3, class: "phase", fill: col, "text-anchor": "end" }).textContent = txt;
  });

  // the assembled object, beside the exploded view
  const ax = 560, ay = 250;
  let yy = ay;
  [...parts].forEach(p => {
    const r = p.r * 0.22, ry = r * K, h = p.h * 0.55;
    el("path", { d: `M${ax - r} ${yy} L${ax - r} ${yy + h} A${r} ${ry} 0 0 0 ${ax + r} ${yy + h} L${ax + r} ${yy} Z`, fill: "var(--ink)", stroke: "var(--fg)", "stroke-width": .6 });
    el("ellipse", { cx: ax, cy: yy, rx: r, ry, fill: "var(--ink)", stroke: "var(--fg)", "stroke-width": .6 });
    yy -= h;
  });
  el("text", { x: ax, y: ay + 44, class: "phase", fill: "var(--muted)", "text-anchor": "middle" }).textContent = "ASSEMBLED";

  // a small marker rising up the axis
  if (!reducedMotion()) {
    const m = el("circle", { r: 2.4, class: "runner" });
    const y0 = parts[0].y + 50, y1 = parts[7].y - 60; let start = null;
    const tick = ts => {
      if (!start) start = ts;
      const v = ((ts - start) / 9000) % 1;
      m.setAttribute("cx", 0); m.setAttribute("cy", y0 + (y1 - y0) * v);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * B · Clarity — seed 8RcWQQj4…: the 8s and QQs read as openings,     *
 * "F0" as focus at zero. The process as nested frames receding to    *
 * one aperture: outer frames drift and tilt (exploring), inner ones  *
 * settle onto the centre (clarity), ending in a single opening.      *
 * ------------------------------------------------------------------ */
FIGURES.aperture = function ({ el, B, STATIONS, COLOR }) {
  const rnd = seeded(B.seed);
  const W0 = 640, H0 = 440, cx = -60, cy = 0;
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const s = Math.pow(0.77, i);
    const settle = Math.max(0, 1 - i / 5);             // drift fades out by frame 6
    frames.push({
      n: i + 1,
      w: W0 * s, h: H0 * s,
      x: cx + (rnd() - 0.5) * 70 * settle,
      y: cy + (rnd() - 0.5) * 40 * settle,
      rot: (rnd() - 0.5) * 9 * settle,
    });
  }
  const corners = f => {
    const a = f.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const px = u * f.w / 2, py = v * f.h / 2;
      return [f.x + px * c - py * s, f.y + px * s + py * c];
    });
  };
  // perspective rails joining matching corners
  for (let i = 0; i < 7; i++) {
    const a = corners(frames[i]), b = corners(frames[i + 1]);
    for (let k = 0; k < 4; k++) el("line", { x1: a[k][0], y1: a[k][1], x2: b[k][0], y2: b[k][1], class: "tick", opacity: .45 });
  }
  const phaseOf = n => STATIONS.find(s => s.n === n).phase;
  const out = {};
  const labX = 360;
  frames.forEach((f, i) => {
    const col = COLOR[phaseOf(f.n)];
    const g = el("g", { "data-n": f.n });
    const pts = corners(f);
    el("polygon", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: col, "stroke-width": i < 2 ? 1.4 : 1.1 }, g);
    // node at top-right corner, callout out to the right
    const [nx, ny] = pts[1];
    const ly = -200 + i * 28;
    el("path", { d: `M${nx} ${ny} L${labX - 40} ${ly - 4} H${labX - 8}`, class: "lead" }, g);
    const node = el("circle", { cx: nx, cy: ny, r: 4, class: "node", stroke: col }, g);
    const s = STATIONS.find(s => s.n === f.n);
    const t = el("text", { x: labX, y: ly, class: "lab" }, g);
    t.innerHTML = `<tspan class="n">${String(f.n).padStart(2, "0")}</tspan>  ${s.name}`;
    out[f.n] = { g, node };
  });
  // the opening
  const last = frames[7];
  const op = el("circle", { cx: last.x, cy: last.y, r: Math.min(last.w, last.h) * 0.32, fill: "var(--c3)" });
  if (!reducedMotion()) op.innerHTML = `<animate attributeName="opacity" values="1;.55;1" dur="6s" repeatCount="indefinite"/>`;

  // phase key under the label column
  [["DISCOVER", "var(--c1)"], ["DEFINE", "var(--c2)"], ["DELIVER", "var(--c3)"]].forEach(([txt, col], i) => {
    el("text", { x: labX + i * 92, y: -240, class: "phase", fill: col }).textContent = txt;
  });
  return out;
};
