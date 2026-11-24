// Rust-style error handling. Fallible functions return a Result instead of throwing;
// `expect` is the one place a Result turns into a panic, with a message saying why.

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function andThen<T, U, E>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

/** Collect a list of Results into a Result of a list, stopping at the first error. */
export function all<T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], E> {
  const out: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

/** Unwrap or panic. Use at the edges (startup, CLI main), never deep inside logic. */
export function expect<T, E>(r: Result<T, E>, why: string): T {
  if (r.ok) return r.value;
  throw new Error(`${why}: ${String(r.error)}`);
}

/** Option<T> is `T | undefined`. This unwraps it or panics. */
export function some<T>(v: T | undefined | null, why: string): T {
  if (v === undefined || v === null) throw new Error(why);
  return v;
}

/** Exhaustiveness check for `switch` over a union, like a Rust `match`. */
export function unreachable(x: never): never {
  throw new Error(`unreachable: ${JSON.stringify(x)}`);
}
