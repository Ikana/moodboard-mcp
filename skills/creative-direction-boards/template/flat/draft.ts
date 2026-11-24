// The 2D draft of one direction: the figure in the middle and the board's images as
// plates round the edge, with hover lines linking each step to the image behind it.
// Open flat/?k=a. Driven by ../boards.json; the figures live in ./figures.ts.

import { type Board, type Content, type Phase, board as findBoard, label, loadContent, num, stationMaps } from "../src/boards.ts";
import { byId, reducedMotion, showFatal, svgById } from "../src/dom.ts";
import { andThen, expect, some } from "../src/result.ts";
import { seeded } from "../src/seeded.ts";
import { type Attrs, type El, type StationEl, FIGURES } from "./figures.ts";

const NS = "http://www.w3.org/2000/svg";
const COLS = 6, ROWS = 5;

/** Phase colours as CSS variables, so the board's theme applies. */
function cssColour(p: Phase): string {
  switch (p) {
    case "intent": return "var(--fg)";
    case "discover": return "var(--c1)";
    case "define": return "var(--c2)";
    case "deliver": return "var(--c3)";
  }
}

function applyTheme(b: Board): void {
  const t = b.theme, root = document.documentElement.style;
  const vars: Readonly<Record<string, string>> = {
    ink: t.ink, "ink-2": t.ink2, fg: t.fg, muted: t.muted, hair: t.hair, c1: t.c1, c2: t.c2, c3: t.c3,
    "img-filter": t.imgFilter, "inv-filter": t.invFilter, "lab-size": b.flat.labSize, "phase-size": b.flat.phaseSize,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(`--${k}`, v);
}

/** The cells round the edge of the grid, clockwise from the top left. */
function ring(): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let c = 1; c <= COLS; c++) out.push([1, c]);
  for (let r = 2; r < ROWS; r++) out.push([r, COLS]);
  for (let c = COLS; c >= 1; c--) out.push([ROWS, c]);
  for (let r = ROWS - 1; r > 1; r--) out.push([r, 1]);
  return out;
}

function render(content: Content, b: Board): void {
  applyTheme(b);
  document.title = `${label(b)} · ${b.headline}`;
  const sheet = expect(byId("sheet", HTMLElement), "page");
  const fig = expect(svgById("fig"), "page");
  const leaders = expect(svgById("leaders"), "page");
  const { stepOf } = stationMaps(b);

  // plates round the edge; text plates fill the spare cells, spread round the ring
  const cells = ring();
  const plates = b.flat.textPlates.slice(0, Math.max(0, cells.length - b.images.length));
  const slots = new Set(plates.map((_, i) => Math.round((i * cells.length) / plates.length) + b.flat.textOffset));
  let ti = 0, ii = 0;
  cells.forEach(([r, c], idx) => {
    const f = document.createElement("figure");
    f.style.gridRow = String(r);
    f.style.gridColumn = String(c);
    const plate = slots.has(idx) ? plates[ti] : undefined;
    if (plate !== undefined) {
      ti++;
      f.className = "plate text";
      f.innerHTML = plate; // trusted: written by the person or the agent in boards.json
    } else {
      const im = b.images[ii++];
      if (im === undefined) return;
      f.className = im.inv ? "plate inv" : "plate";
      f.title = im.t;
      const n = stepOf.get(im.id);
      if (n !== undefined) f.dataset["station"] = String(n);
      const img = document.createElement("img");
      img.src = `../img/${im.f}`;
      img.alt = im.t;
      f.appendChild(img);
    }
    sheet.appendChild(f);
  });

  expect(byId("figno", HTMLElement), "page").textContent = b.flat.figno;
  expect(byId("h1", HTMLElement), "page").textContent = b.headline;
  expect(byId("cap", HTMLElement), "page").textContent = b.caption;

  // a switcher between the directions
  const nav = document.createElement("nav");
  nav.className = "switch";
  for (const other of content.boards) {
    const a = document.createElement("a");
    a.href = `?k=${other.slug}`;
    a.textContent = other.slug.toUpperCase();
    if (other.slug === b.slug) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  }
  expect(byId("center", HTMLElement), "page").appendChild(nav);

  // the figure
  const el: El = (name: string, attrs: Attrs, parent: Element = fig): SVGElement => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.appendChild(e);
    return e;
  };
  const figure = some(FIGURES[b.figure], `no 2D figure "${b.figure}" in flat/figures.ts`);
  const stations: ReadonlyMap<number, StationEl> = figure({
    el, board: b, steps: content.process, rng: seeded(b.seed), motion: !reducedMotion(),
    colour: cssColour,
  });
  const bb = fig.getBBox(), pad = 12;
  fig.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);

  // hover: a leader line from each step to its plate
  const drawLeaders = (): void => {
    leaders.replaceChildren();
    const sb = sheet.getBoundingClientRect();
    leaders.setAttribute("viewBox", `0 0 ${sb.width} ${sb.height}`);
    for (const plate of sheet.querySelectorAll<HTMLElement>(".plate[data-station]")) {
      const n = Number(plate.dataset["station"]);
      const st = stations.get(n);
      if (st === undefined) continue;
      const c = st.node.getBoundingClientRect(), p = plate.getBoundingClientRect();
      const sx = c.left + c.width / 2 - sb.left, sy = c.top + c.height / 2 - sb.top;
      const tx = Math.max(p.left, Math.min(sx + sb.left, p.right)) - sb.left;
      const ty = Math.max(p.top, Math.min(sy + sb.top, p.bottom)) - sb.top;
      el("path", { d: `M${sx} ${sy} L${tx} ${ty}`, "data-n": n }, leaders);
      if (plate.querySelector(".badge") === null) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = num(n);
        plate.appendChild(badge);
      }
    }
  };
  const light = (n: string, on: boolean): void => {
    for (const p of document.querySelectorAll(`#leaders path[data-n="${n}"], .plate[data-station="${n}"]`)) p.classList.toggle("lit", on);
  };
  for (const [n, { g }] of stations) {
    g.addEventListener("mouseenter", () => light(String(n), true));
    g.addEventListener("mouseleave", () => light(String(n), false));
  }
  for (const p of sheet.querySelectorAll<HTMLElement>(".plate[data-station]")) {
    const n = p.dataset["station"] ?? "";
    p.addEventListener("mouseenter", () => light(n, true));
    p.addEventListener("mouseleave", () => light(n, false));
  }
  addEventListener("resize", drawLeaders);
  if (document.readyState === "complete") drawLeaders();
  else addEventListener("load", drawLeaders);
}

const slug = new URLSearchParams(location.search).get("k") ?? "a";
loadContent("../boards.json", Object.keys(FIGURES))
  .then(r => {
    const content = expect(r, "Could not load boards.json");
    render(content, expect(andThen(r, c => findBoard(c, slug)), "Unknown board"));
  })
  .catch((e: unknown) => showFatal(e instanceof Error ? e.message : String(e)));
