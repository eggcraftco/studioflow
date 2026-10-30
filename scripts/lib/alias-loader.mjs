// Test-only ESM resolve hook: "@/x/y" → <web root>/x/y(.ts|.tsx), and extension-less relative TS imports.
// Lets `node --experimental-strip-types` run a check against the real lib/ modules (no tsx download).
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function withExt(base) {
  for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
    if (existsSync(base + ext) && !(ext === "" && !/\.[cm]?[jt]sx?$/.test(base))) return base + ext;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = withExt(join(ROOT, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const hit = withExt(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit && /\.tsx?$/.test(hit)) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
