# TypeScript style: as close to Rust as the language allows

All code in this skill is TypeScript. No Python, no plain JavaScript (the vendored three.js files are the only exception). It runs directly on Node 22.18+ and in the browser through `serve.ts`, so there is no build step, and `tsconfig.json` turns on every strict check.

## Rules

- **Strict compiler.** Never loosen `tsconfig.json`. It sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature` and `erasableSyntaxOnly`. `npx tsc -p .` must pass before you show anything.
- **No `any`, no `!`.** Use `unknown` and narrow it. An index lookup returns `T | undefined`, so handle the `undefined`.
- **Errors are values.** A function that can fail returns `Result<T>` from `src/result.ts` (`ok`, `err`, `andThen`, `all`). Don't throw for expected failures. `expect(result, why)` and `some(value, why)` are the panics, used only at the edges: startup, a CLI's `main`, a page's entry point.
- **Parse, don't validate.** Outside data (JSON, the database, URL parameters) goes through a parser that returns a typed `Result`, like serde. See `parseContent` in `src/boards.ts`. Nothing reads raw JSON fields after that.
- **Data plus functions.** Plain `type` records and free functions. No classes, no inheritance, no `this`.
- **Immutable by default.** `const` everywhere, `readonly` on every field, `readonly T[]` for lists, and `as const` for literal tables. Use `let` only for a local accumulator.
- **Enums are unions.** Use string-literal unions (`"dark" | "light"`), never `enum` or `namespace`. Branch with `switch` and cover every case, so the compiler catches a missing one. `unreachable(x)` is the `match` fallback when you need one.
- **Explicit types at boundaries.** Exported functions declare their parameter and return types.
- **Imports end in `.ts`.** `import { x } from "./src/boards.ts"`, and `import type` for types only.
- **No dependencies at runtime.** Use Node's built-ins (`node:sqlite`, `node:http`, `node:util` `parseArgs`) and the vendored three.js. Dev dependencies are only for type-checking.
