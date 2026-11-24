import { type Result, ok, err } from "./result.ts";

/** Look up an element by id and check its type, like a typed query that can fail. */
export function byId<T extends HTMLElement>(id: string, kind: new () => T): Result<T> {
  const el = document.getElementById(id);
  if (el === null) return err(`#${id} is missing from the page`);
  return el instanceof kind ? ok(el) : err(`#${id} is not a ${kind.name}`);
}

export function svgById(id: string): Result<SVGSVGElement> {
  const el = document.getElementById(id);
  return el instanceof SVGSVGElement ? ok(el) : err(`#${id} is missing or not an <svg>`);
}

export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Show a fatal error on the page instead of a blank screen. */
export function showFatal(message: string): void {
  const pre = document.createElement("pre");
  pre.textContent = message;
  pre.style.cssText = "position:fixed;inset:16px;margin:0;padding:16px;background:#1b0d0d;color:#ffb4a8;font:12px/1.5 monospace;white-space:pre-wrap;z-index:9999";
  document.body.appendChild(pre);
}
