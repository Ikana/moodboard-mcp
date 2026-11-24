// All directions side by side, each as one mockup: the 3D centre piece in the middle
// (rooms/?embed=<slug>) and the board's images packed round the edges.
// ?k=<slug> shows one mockup full screen. Driven entirely by boards.json.

import { type Board, type Content, label, loadContent, num, stationMaps } from "./src/boards.ts";
import { byId, showFatal } from "./src/dom.ts";
import { expect, some } from "./src/result.ts";

type Side = "top" | "left" | "right" | "bottom";
const SIDES: readonly Side[] = ["top", "left", "right", "bottom"];
const ROW_CAP = 6.4, COL_CAP = 2.3;
const isRow = (s: Side): boolean => s === "top" || s === "bottom";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function mockup(b: Board, single: boolean): HTMLElement {
  const { stepOf } = stationMaps(b);
  const board: HTMLElement = single ? el("div", "board") : Object.assign(el("a", "board"), { href: `collage.html?k=${b.slug}` });
  const strips = new Map<Side, { readonly el: HTMLDivElement; load: number }>();
  for (const s of SIDES) {
    const div = el("div", `strip ${s}`);
    board.appendChild(div);
    strips.set(s, { el: div, load: 0 });
  }
  const strip = (s: Side): { readonly el: HTMLDivElement; load: number } => some(strips.get(s), `missing strip ${s}`);

  // the text tile goes first in the left column: column name and its keywords
  const tx = el("div", "tile text");
  tx.style.flex = "0.55 1 0";
  tx.appendChild(el("strong", "", label(b)));
  const kws = el("span", "");
  [...b.keywords].sort((x, y) => x.n - y.n).forEach((k, i) => {
    if (i > 0) kws.appendChild(document.createElement("br"));
    kws.append(el("span", "k", String(k.n)), ` ${k.word}`);
  });
  tx.appendChild(kws);
  strip("left").el.appendChild(tx);
  strip("left").load = 0.55 / COL_CAP;

  // wide pictures go to the rows, tall ones to the columns, balancing each strip
  for (const im of [...b.images].sort((x, y) => y.ar - x.ar)) {
    const order: readonly Side[] = im.ar >= 1.1 ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"];
    const byLoad = (xs: readonly Side[]): Side[] => [...xs].sort((x, y) => strip(x).load - strip(y).load || order.indexOf(x) - order.indexOf(y));
    const pref = byLoad(order.slice(0, 2))[0] ?? "top";
    const side = strip(pref).load < 1 ? pref : (byLoad(order).find(s => strip(s).load < 1) ?? pref);
    const tile = el("div", "tile");
    tile.title = im.t;
    tile.style.flex = isRow(side) ? `${im.ar} 1 0` : `${1 / im.ar} 1 0`;
    const img = el("img", "");
    img.src = `img/${im.f}`;
    img.alt = im.t;
    img.loading = "lazy";
    tile.appendChild(img);
    const n = stepOf.get(im.id);
    if (n !== undefined) tile.appendChild(el("span", "n", num(n)));
    strip(side).el.appendChild(tile);
    strip(side).load += isRow(side) ? im.ar / ROW_CAP : 1 / im.ar / COL_CAP;
  }

  const stage = el("div", b.theme.mode === "light" ? "stage light" : "stage");
  const frame = el("iframe", "");
  frame.src = `rooms/index.html?embed=${b.slug}`;
  frame.title = `${label(b)} centre piece`;
  frame.loading = "lazy";
  const title = el("div", "title");
  title.append(el("div", "kicker", `FIG. ${b.slug.toUpperCase()} — THE CREATIVE PROCESS`), el("h2", "", b.headline), el("p", "", b.caption));
  stage.append(frame, title);
  board.appendChild(stage);
  return board;
}

function render(content: Content): void {
  const row = expect(byId("row", HTMLDivElement), "page");
  const hdr = expect(byId("hdr", HTMLElement), "page");
  const only = new URLSearchParams(location.search).get("k");
  const shown = only === null ? content.boards : content.boards.filter(b => b.slug === only);
  if (only !== null && shown.length === 1 && shown[0] !== undefined) {
    document.body.classList.add("single");
    hdr.replaceChildren(label(shown[0]), " ");
    const all = el("a", "", `all ${content.boards.length}`);
    all.href = "collage.html";
    all.style.cssText = "color:#9a958b;margin-left:12px;font-size:14px";
    hdr.appendChild(all);
  } else {
    hdr.replaceChildren(`Directions for ${content.title.toLowerCase()}. `, el("b", "", "Pick the one to head in together."));
  }
  for (const b of shown) row.appendChild(mockup(b, only !== null));
}

loadContent("boards.json", null)
  .then(r => render(expect(r, "Could not load boards.json")))
  .catch((e: unknown) => showFatal(e instanceof Error ? e.message : String(e)));
