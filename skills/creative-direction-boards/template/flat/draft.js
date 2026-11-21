// Shared renderer. Each page sets window.BOARD before loading this file.
(function () {
const B = window.BOARD;
const NS = "http://www.w3.org/2000/svg";
const root = document.documentElement;
for (const k in B.theme) root.style.setProperty("--" + k, B.theme[k]);
document.title = B.title;

// ---------- layout: plates around the edge of a 6 x 5 grid ----------
const sheet = document.getElementById("sheet");
const COLS = 6, ROWS = 5;
const ring = [];
for (let c = 1; c <= COLS; c++) ring.push([1, c]);            // top
for (let r = 2; r < ROWS; r++) ring.push([r, COLS]);          // right
for (let c = COLS; c >= 1; c--) ring.push([ROWS, c]);         // bottom
for (let r = ROWS - 1; r > 1; r--) ring.push([r, 1]);         // left

const linkOf = {};
B.stations.forEach(s => linkOf[s.img] = s.n);
const items = [...B.images];
// text plates fill the spare cells, spread around the ring
const spare = ring.length - items.length;
const textPlates = B.textPlates.slice(0, spare);
const slots = textPlates.map((_, i) => Math.round(i * ring.length / textPlates.length) + B.textOffset);
let ti = 0, ii = 0;
ring.forEach(([r, c], idx) => {
  const fig = document.createElement("figure");
  fig.style.gridRow = r; fig.style.gridColumn = c;
  if (slots.includes(idx) && ti < textPlates.length) {
    fig.className = "plate text";
    fig.innerHTML = textPlates[ti++];
  } else {
    const im = items[ii++];
    if (!im) return;
    fig.className = "plate" + (im.inv ? " inv" : "");
    fig.title = im.t;
    if (linkOf[im.id]) fig.dataset.station = linkOf[im.id];
    fig.innerHTML = `<img src="../img/${im.f}" alt="${im.t}">`;
  }
  sheet.appendChild(fig);
});

document.getElementById("figno").textContent = B.figno;
document.getElementById("h1").textContent = B.headline;
document.getElementById("cap").textContent = B.caption;

// switcher
const sw = document.createElement("nav");
sw.className = "switch";
[["A", "draft-a.html"], ["B", "draft-b.html"], ["C", "draft-c.html"]].forEach(([l, h]) => {
  const a = document.createElement("a");
  a.href = h; a.textContent = l;
  if (l === B.key) a.setAttribute("aria-current", "page");
  sw.appendChild(a);
});
document.getElementById("center").appendChild(sw);

// ---------- figure ----------
const fig = document.getElementById("fig");
function el(name, attrs, parent = fig) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
}
const COLOR = { discover: "var(--c1)", define: "var(--c2)", deliver: "var(--c3)" };
const STATIONS = [
  { n: 1, name: "Seed randomness",   phase: "discover" },
  { n: 2, name: "Ambitious prompts", phase: "discover" },
  { n: 3, name: "Outside critic",    phase: "define" },
  { n: 4, name: "Generate images",   phase: "define" },
  { n: 5, name: "Add motion",        phase: "define" },
  { n: 6, name: "Cut the excess",    phase: "deliver" },
  { n: 7, name: "Remove AI tells",   phase: "deliver" },
  { n: 8, name: "Rewrite by hand",   phase: "deliver" },
];
const stationEls = window.FIGURES[B.figure || "eight"]({ el, B, STATIONS, COLOR });
const bb = fig.getBBox(), pad = 12;
fig.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);

// ---------- hover links ----------
const leaders = document.getElementById("leaders");
function drawLeaders() {
  leaders.innerHTML = "";
  const sb = sheet.getBoundingClientRect();
  leaders.setAttribute("viewBox", `0 0 ${sb.width} ${sb.height}`);
  document.querySelectorAll(".plate[data-station]").forEach(plate => {
    const n = plate.dataset.station;
    const c = stationEls[n].node.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    const sx = c.left + c.width / 2 - sb.left, sy = c.top + c.height / 2 - sb.top;
    const tx = Math.max(p.left, Math.min(sx + sb.left, p.right)) - sb.left;
    const ty = Math.max(p.top, Math.min(sy + sb.top, p.bottom)) - sb.top;
    el("path", { d: `M${sx} ${sy} L${tx} ${ty}`, "data-n": n }, leaders);
    if (!plate.querySelector(".badge")) {
      const b = document.createElement("span");
      b.className = "badge"; b.textContent = String(n).padStart(2, "0");
      plate.appendChild(b);
    }
  });
}
function light(n, on) {
  document.querySelectorAll(`#leaders path[data-n="${n}"]`).forEach(p => p.classList.toggle("lit", on));
  document.querySelectorAll(`.plate[data-station="${n}"]`).forEach(p => p.classList.toggle("lit", on));
}
Object.entries(stationEls).forEach(([n, { g }]) => {
  g.addEventListener("mouseenter", () => light(n, true));
  g.addEventListener("mouseleave", () => light(n, false));
});
document.querySelectorAll(".plate[data-station]").forEach(p => {
  p.addEventListener("mouseenter", () => light(p.dataset.station, true));
  p.addEventListener("mouseleave", () => light(p.dataset.station, false));
});
addEventListener("resize", drawLeaders);
addEventListener("load", drawLeaders);
})();
