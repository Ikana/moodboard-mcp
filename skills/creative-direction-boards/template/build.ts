// Write a static copy of the working folder to dist/, with every .ts file compiled to .js,
// so it can be opened from any static host (or published) without serve.ts.
//
//   node build.ts            then serve dist/ with any static server

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "dist");
const SKIP = new Set(["dist", "node_modules", "package.json", "package-lock.json", "tsconfig.json", "serve.ts", "build.ts"]);

/** Point relative .ts module specifiers at the compiled .js files. */
const retarget = (code: string): string =>
  code.replace(/((?:from|import)\s*\(?\s*|src=)(["'])(\.{1,2}\/[^"']+)\.ts\2/g, "$1$2$3.js$2");

function walk(dir: string): readonly string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (dir === ROOT && SKIP.has(name)) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const src of walk(ROOT)) {
  const rel = relative(ROOT, src);
  const ext = extname(src);
  const dst = join(OUT, ext === ".ts" ? `${rel.slice(0, -3)}.js` : rel);
  mkdirSync(dirname(dst), { recursive: true });
  if (ext === ".ts") writeFileSync(dst, retarget(stripTypeScriptTypes(readFileSync(src, "utf8"), { mode: "strip" })));
  else if (ext === ".html") writeFileSync(dst, retarget(readFileSync(src, "utf8")));
  else cpSync(src, dst);
  count++;
}
console.log(`dist/: ${count} files. Open dist/collage.html or dist/rooms/ from any static server.`);
