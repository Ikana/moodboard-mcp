// Copy moodboard boards into a working copy of the template and write its boards.json.
//
//   node scripts/export-boards.ts --out ~/work/my-directions \
//     --board "Column A – Engineering=a" --board "Column B – Clarity=b" --board "Column C – Flow=c"
//
// Creates <out> from the template on first run, copies each board's images into <out>/img
// and writes <out>/boards.json. On re-runs it refreshes the images and keeps everything
// you have already edited (process, headline, caption, seed, reading, figure, theme,
// keywords, stations, flat). Reads the moodboard MCP's library.db with node:sqlite.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { type Result, ok, err, all, expect } from "../template/src/result.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, "../template");

/** The default process: the nine steps of the spiral worksheet. Replace with the person's own. */
const DEFAULT_PROCESS = [
  { name: "Intent: my idea", phase: "intent" },
  { name: "Seed & explore wide", phase: "discover" },
  { name: "Ambitious brief", phase: "discover" },
  { name: "Outside critic", phase: "define" },
  { name: "Generate images", phase: "define" },
  { name: "Add motion", phase: "define" },
  { name: "Cut the excess", phase: "deliver" },
  { name: "Remove AI tells", phase: "deliver" },
  { name: "Rewrite by hand", phase: "deliver" },
] as const;

type Spec = { readonly name: string; readonly slug: string };
type Row = { readonly id: string; readonly file: string; readonly caption: string | null; readonly width: number | null; readonly height: number | null };
type Json = Record<string, unknown>;

const expand = (p: string): string => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function spec(s: string): Result<Spec> {
  const i = s.lastIndexOf("=");
  if (i <= 0) return err(`--board "${s}": expected "Board name=slug"`);
  const slug = s.slice(i + 1).trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? ok({ name: s.slice(0, i), slug }) : err(`--board "${s}": the slug must be letters, digits or -`);
}

function readJson(path: string): Result<Json> {
  if (!existsSync(path)) return ok({});
  try {
    const v: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isObj(v) ? ok(v) : err(`${path}: not a JSON object`);
  } catch (e: unknown) {
    return err(`${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function rows(db: DatabaseSync, board: string): Result<readonly Row[]> {
  const raw = db.prepare(
    "select i.id as id, i.file as file, i.caption as caption, i.width as width, i.height as height " +
    "from board_items b join images i on i.id = b.image_id where b.board = ? order by b.section, b.position").all(board);
  const out: Row[] = [];
  for (const r of raw) {
    const id = r["id"], file = r["file"], caption = r["caption"], width = r["width"], height = r["height"];
    if (typeof id !== "string" || typeof file !== "string") return err(`board "${board}": a row has no id or file`);
    out.push({
      id, file,
      caption: typeof caption === "string" ? caption : null,
      width: typeof width === "number" ? width : null,
      height: typeof height === "number" ? height : null,
    });
  }
  return out.length > 0 ? ok(out) : err(`no images on board "${board}"`);
}

function copyImage(home: string, out: string, r: Row): Result<string> {
  const candidates = [isAbsolute(r.file) ? r.file : join(home, r.file), join(home, "images", basename(r.file))];
  const src = candidates.find(p => existsSync(p));
  if (src === undefined) return err(`image ${r.id}: file not found (${r.file})`);
  copyFileSync(src, join(out, "img", basename(src)));
  return ok(basename(src));
}

function main(): Result<string> {
  const { values } = parseArgs({
    options: {
      home: { type: "string", default: process.env["MOODBOARD_HOME"] ?? "~/.moodboard" },
      out: { type: "string" },
      board: { type: "string", multiple: true },
    },
  });
  if (values.out === undefined) return err("--out is required");
  const specs = all((values.board ?? []).map(spec));
  if (!specs.ok) return specs;
  if (specs.value.length === 0) return err('at least one --board "Board name=slug" is required');
  const home = expand(values.home), out = expand(values.out);

  if (!existsSync(out)) {
    cpSync(TEMPLATE, out, {
      recursive: true,
      filter: src => !/[\\/](node_modules|img[\\/].+|boards\.json)$/.test(src.slice(TEMPLATE.length)),
    });
  }
  mkdirSync(join(out, "img"), { recursive: true });

  const existing = readJson(join(out, "boards.json"));
  if (!existing.ok) return existing;
  const oldBoards = Array.isArray(existing.value["boards"]) ? existing.value["boards"].filter(isObj) : [];
  const db = new DatabaseSync(join(home, "library.db"), { readOnly: true });

  const boards: Json[] = [];
  for (const s of specs.value) {
    const rs = rows(db, s.name);
    if (!rs.ok) return rs;
    const images: Json[] = [];
    for (const r of rs.value) {
      const f = copyImage(home, out, r);
      if (!f.ok) return f;
      images.push({ id: r.id, f: f.value, t: r.caption ?? r.id, inv: false, ar: Math.round(((r.width ?? 1) / (r.height ?? 1)) * 1000) / 1000 });
    }
    const old = oldBoards.find(b => b["slug"] === s.slug) ?? {};
    const column = s.name.split(/\s+[–-]\s+/).pop() ?? s.name;
    boards.push({
      slug: s.slug,
      column: old["column"] ?? column,
      headline: old["headline"] ?? column,
      caption: old["caption"] ?? "",
      seed: old["seed"] ?? "",
      reading: old["reading"] ?? "",
      figure: old["figure"] ?? "plinth",
      theme: old["theme"] ?? { mode: "dark" },
      keywords: old["keywords"] ?? [],
      images,
      stations: old["stations"] ?? images.slice(0, DEFAULT_PROCESS.length).map((im, i) => ({ n: i + 1, img: im["id"] })),
      ...(old["flat"] !== undefined ? { flat: old["flat"] } : {}),
    });
    console.log(`${s.slug}: ${images.length} images from "${s.name}"`);
  }
  db.close();

  const content = {
    title: existing.value["title"] ?? "The creative process",
    process: existing.value["process"] ?? DEFAULT_PROCESS,
    boards,
  };
  writeFileSync(join(out, "boards.json"), `${JSON.stringify(content, null, 1)}\n`);
  return ok(`wrote ${out}/boards.json. Run: node ${out}/serve.ts`);
}

console.log(expect(main(), "export-boards"));
