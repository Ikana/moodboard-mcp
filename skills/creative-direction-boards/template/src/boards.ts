// The content model: the person's process steps and one board per keyword column.
// Everything the pages show comes from boards.json, parsed here into these types.
// Parsing returns a Result, like serde: a bad file gives one clear error, not a crash later.

import { type Result, ok, err, all, andThen } from "./result.ts";

export const PHASES = ["intent", "discover", "define", "deliver"] as const;
export type Phase = (typeof PHASES)[number];

export type Step = { readonly n: number; readonly name: string; readonly phase: Phase };

export type Mode = "dark" | "light";

export type Theme = {
  readonly mode: Mode;
  /** Page colours. */
  readonly ink: string;
  readonly ink2: string;
  readonly fg: string;
  readonly muted: string;
  readonly hair: string;
  /** Phase colours: c1 discover, c2 define, c3 deliver. Intent uses fg. */
  readonly c1: string;
  readonly c2: string;
  readonly c3: string;
  /** CSS filters for the 2D plates. */
  readonly imgFilter: string;
  readonly invFilter: string;
  /** The 3D room. */
  readonly wall: string;
  readonly floor: string;
  readonly sky: string;
  readonly lamp: string;
  readonly lampPower: number;
  /** Tint of the holographic visor. */
  readonly holo: string;
};

export type Image = {
  readonly id: string;
  /** File name inside img/. */
  readonly f: string;
  /** Caption. */
  readonly t: string;
  /** Invert in the 2D plate filter. */
  readonly inv: boolean;
  /** Aspect ratio, width / height. */
  readonly ar: number;
};

/** Step number → the board image that inspired it. */
export type Station = { readonly n: number; readonly img: string };

export type Keyword = { readonly n: number; readonly word: string };

export type FlatStyle = {
  readonly spreads: readonly number[];
  readonly strandOpacity: number;
  readonly strandDash: string;
  readonly w: number;
  readonly flow: boolean;
};

/** Extra fields for the 2D draft page. */
export type Flat = {
  readonly figno: string;
  readonly textOffset: number;
  /** Small HTML snippets for the text plates round the edge. */
  readonly textPlates: readonly string[];
  readonly style: FlatStyle;
  /** CSS font sizes for step labels and phase names. */
  readonly labSize: string;
  readonly phaseSize: string;
};

export type Board = {
  /** "a", "b", "c": used in URLs (?k=a). */
  readonly slug: string;
  /** The keyword column's name, e.g. "Engineering". */
  readonly column: string;
  readonly headline: string;
  readonly caption: string;
  readonly seed: string;
  /** One sentence: what the seed was read as. */
  readonly reading: string;
  /** Name of the centre piece in rooms/centre.ts and flat/figures.ts. */
  readonly figure: string;
  readonly theme: Theme;
  readonly keywords: readonly Keyword[];
  readonly images: readonly Image[];
  readonly stations: readonly Station[];
  readonly flat: Flat;
};

export type Content = {
  readonly title: string;
  readonly process: readonly Step[];
  readonly boards: readonly Board[];
};

export const label = (b: Board): string => `${b.slug.toUpperCase()} · ${b.column}`;
export const num = (n: number): string => String(n).padStart(2, "0");

export function phaseColour(theme: Theme, phase: Phase): string {
  switch (phase) {
    case "intent": return theme.fg;
    case "discover": return theme.c1;
    case "define": return theme.c2;
    case "deliver": return theme.c3;
  }
}

/** Step number → image id, and image id → step number. */
export function stationMaps(b: Board): { readonly imgOf: ReadonlyMap<number, string>; readonly stepOf: ReadonlyMap<string, number> } {
  return {
    imgOf: new Map(b.stations.map(s => [s.n, s.img])),
    stepOf: new Map(b.stations.map(s => [s.img, s.n])),
  };
}

export function board(c: Content, slug: string): Result<Board> {
  const b = c.boards.find(x => x.slug === slug);
  return b ? ok(b) : err(`no board "${slug}" (have ${c.boards.map(x => x.slug).join(", ")})`);
}

// ---------------------------------------------------------------- parsing

type Obj = Readonly<Record<string, unknown>>;
type P<T> = Result<T>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function obj(v: unknown, at: string): P<Obj> {
  return isObj(v) ? ok(v) : err(`${at}: expected an object`);
}
function str(o: Obj, k: string, at: string): P<string> {
  const v = o[k];
  return typeof v === "string" ? ok(v) : err(`${at}.${k}: expected a string`);
}
function strOr(o: Obj, k: string, at: string, fallback: string): P<string> {
  return o[k] === undefined ? ok(fallback) : str(o, k, at);
}
function numb(o: Obj, k: string, at: string): P<number> {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? ok(v) : err(`${at}.${k}: expected a number`);
}
function numOr(o: Obj, k: string, at: string, fallback: number): P<number> {
  return o[k] === undefined ? ok(fallback) : numb(o, k, at);
}
function boolOr(o: Obj, k: string, at: string, fallback: boolean): P<boolean> {
  const v = o[k];
  if (v === undefined) return ok(fallback);
  return typeof v === "boolean" ? ok(v) : err(`${at}.${k}: expected true or false`);
}
function list<T>(o: Obj, k: string, at: string, item: (v: unknown, at: string) => P<T>): P<readonly T[]> {
  const v = o[k];
  if (!Array.isArray(v)) return err(`${at}.${k}: expected a list`);
  return all(v.map((x: unknown, i) => item(x, `${at}.${k}[${i}]`)));
}
function listOr<T>(o: Obj, k: string, at: string, item: (v: unknown, at: string) => P<T>): P<readonly T[]> {
  return o[k] === undefined ? ok([]) : list(o, k, at, item);
}

/** Combine named Results into one object Result, like `?` on each field. */
function fields<T extends Record<string, unknown>>(parts: { readonly [K in keyof T]: P<T[K]> }): P<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(parts) as (keyof T)[]) {
    const r = parts[k];
    if (!r.ok) return r;
    out[k] = r.value;
  }
  return ok(out as T);
}

function phase(o: Obj, at: string): P<Phase> {
  return andThen(str(o, "phase", at), p =>
    (PHASES as readonly string[]).includes(p) ? ok(p as Phase) : err(`${at}.phase: one of ${PHASES.join(", ")}`));
}

function step(v: unknown, at: string, i: number): P<Step> {
  return andThen(obj(v, at), o => fields<Step>({ n: ok(i + 1), name: str(o, "name", at), phase: phase(o, at) }));
}

export const DARK: Theme = {
  mode: "dark", ink: "#0b0c0f", ink2: "#111317", fg: "#e9e4d8", muted: "#6f6c66", hair: "#24262b",
  c1: "#5aa7d8", c2: "#e9e4d8", c3: "#e0562a",
  imgFilter: "grayscale(1) contrast(1.1) brightness(.4)",
  invFilter: "invert(1) grayscale(1) contrast(1.1) brightness(.4)",
  wall: "#121419", floor: "#191b21", sky: "#2b2a27", lamp: "#bcd7ff", lampPower: 30, holo: "#6cc3ff",
};
export const LIGHT: Theme = {
  mode: "light", ink: "#ece8df", ink2: "#e2ddd2", fg: "#16171b", muted: "#8a857b", hair: "#d2ccc0",
  c1: "#2340a0", c2: "#16171b", c3: "#e2531f",
  imgFilter: "saturate(.55) contrast(.95) brightness(1.02)", invFilter: "saturate(.55)",
  wall: "#ece8df", floor: "#d8d1c2", sky: "#fbf8f1", lamp: "#ffffff", lampPower: 12, holo: "#1f3c9e",
};

function theme(v: unknown, at: string): P<Theme> {
  return andThen(obj(v, at), o => {
    const modeR: P<Mode> = andThen(strOr(o, "mode", at, "dark"), m =>
      m === "dark" || m === "light" ? ok(m) : err(`${at}.mode: "dark" or "light"`));
    return andThen(modeR, mode => {
      const d = mode === "dark" ? DARK : LIGHT;
      const s = (k: Exclude<keyof Theme, "mode" | "lampPower">): P<string> => strOr(o, k, at, d[k]);
      return fields<Theme>({
        mode: ok(mode), ink: s("ink"), ink2: s("ink2"), fg: s("fg"), muted: s("muted"), hair: s("hair"),
        c1: s("c1"), c2: s("c2"), c3: s("c3"), imgFilter: s("imgFilter"), invFilter: s("invFilter"),
        wall: s("wall"), floor: s("floor"), sky: s("sky"), lamp: s("lamp"),
        lampPower: numOr(o, "lampPower", at, d.lampPower), holo: s("holo"),
      });
    });
  });
}

function image(v: unknown, at: string): P<Image> {
  return andThen(obj(v, at), o => fields<Image>({
    id: str(o, "id", at), f: str(o, "f", at), t: strOr(o, "t", at, ""),
    inv: boolOr(o, "inv", at, false), ar: numOr(o, "ar", at, 1),
  }));
}

function station(v: unknown, at: string): P<Station> {
  return andThen(obj(v, at), o => fields<Station>({ n: numb(o, "n", at), img: str(o, "img", at) }));
}

function keyword(v: unknown, at: string): P<Keyword> {
  return andThen(obj(v, at), o => fields<Keyword>({ n: numb(o, "n", at), word: str(o, "word", at) }));
}

const FLAT_STYLE: FlatStyle = { spreads: [-0.36, -0.27, -0.18, -0.09, 0.09, 0.18, 0.27, 0.36], strandOpacity: 0.6, strandDash: "", w: 1.4, flow: true };

function flat(v: unknown, at: string, b: { readonly slug: string; readonly column: string }): P<Flat> {
  const o: Obj = isObj(v) ? v : {};
  const st: Obj = isObj(o["style"]) ? o["style"] : {};
  const sat = `${at}.style`;
  return fields<Flat>({
    figno: strOr(o, "figno", at, `FIG. ${b.slug.toUpperCase()} — THE CREATIVE PROCESS`),
    textOffset: numOr(o, "textOffset", at, 1),
    labSize: strOr(o, "labSize", at, "11px"),
    phaseSize: strOr(o, "phaseSize", at, "10px"),
    textPlates: listOr(o, "textPlates", at, (x, a) => typeof x === "string" ? ok(x) : err(`${a}: expected a string`)),
    style: fields<FlatStyle>({
      spreads: st["spreads"] === undefined ? ok(FLAT_STYLE.spreads)
        : list(st, "spreads", sat, (x, a) => typeof x === "number" ? ok(x) : err(`${a}: expected a number`)),
      strandOpacity: numOr(st, "strandOpacity", sat, FLAT_STYLE.strandOpacity),
      strandDash: strOr(st, "strandDash", sat, FLAT_STYLE.strandDash),
      w: numOr(st, "w", sat, FLAT_STYLE.w),
      flow: boolOr(st, "flow", sat, FLAT_STYLE.flow),
    }),
  });
}

function boardOf(v: unknown, at: string, figures: readonly string[] | null, steps: number): P<Board> {
  return andThen(obj(v, at), o => andThen(
    fields<{ slug: string; column: string; figure: string }>({
      slug: str(o, "slug", at), column: str(o, "column", at),
      figure: andThen(str(o, "figure", at), f =>
        figures === null || figures.includes(f) ? ok(f) : err(`${at}.figure: "${f}" is not one of ${(figures ?? []).join(", ")}`)),
    }),
    head => andThen(fields<Board>({
      slug: ok(head.slug), column: ok(head.column), figure: ok(head.figure),
      headline: strOr(o, "headline", at, head.column),
      caption: strOr(o, "caption", at, ""),
      seed: strOr(o, "seed", at, ""),
      reading: strOr(o, "reading", at, ""),
      theme: theme(o["theme"] ?? {}, `${at}.theme`),
      keywords: listOr(o, "keywords", at, keyword),
      images: list(o, "images", at, image),
      stations: listOr(o, "stations", at, station),
      flat: flat(o["flat"], `${at}.flat`, head),
    }), b => {
      const ids = new Set(b.images.map(i => i.id));
      const bad = b.stations.find(s => !ids.has(s.img) || s.n < 1 || s.n > steps);
      return bad ? err(`${at}.stations: step ${bad.n} → "${bad.img}" is not a step number or not an image on this board`) : ok(b);
    })));
}

/** Parse boards.json. `figures` are the centre-piece names the page can draw, or null to skip that check. */
export function parseContent(v: unknown, figures: readonly string[] | null): P<Content> {
  return andThen(obj(v, "boards.json"), o =>
    andThen(list(o, "process", "boards.json", (x, at) => andThen(obj(x, at), () => ok(x))), rawSteps =>
      andThen(all(rawSteps.map((x, i) => step(x, `boards.json.process[${i}]`, i))), process =>
        fields<Content>({
          title: strOr(o, "title", "boards.json", "The creative process"),
          process: ok(process),
          boards: list(o, "boards", "boards.json", (x, at) => boardOf(x, at, figures, process.length)),
        }))));
}

/** Fetch and parse boards.json in the browser. */
export async function loadContent(url: string, figures: readonly string[] | null): Promise<P<Content>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return err(`${url}: HTTP ${res.status}`);
    const json: unknown = await res.json();
    return parseContent(json, figures);
  } catch (e: unknown) {
    return err(`${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
