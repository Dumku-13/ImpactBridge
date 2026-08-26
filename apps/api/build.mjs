/**
 * Production build for the API.
 *
 * ── Why a bundler and not just `tsc` ─────────────────────────────────────────
 *
 * `packages/shared` deliberately ships raw TypeScript (`main: ./src/index.ts`)
 * so that editing a schema is instantly visible to both apps in development
 * with no build step. `tsx` handles that fine — it resolves the `./x.js`
 * specifiers inside that package back to the `.ts` files on disk.
 *
 * Plain `node` does not. A `tsc`-only build therefore produced output that
 * compiled cleanly and then crashed on boot with
 * `ERR_MODULE_NOT_FOUND: packages/shared/src/schemas/auth.js` — the emitted
 * imports pointed at `.js` files that never existed.
 *
 * Bundling resolves the workspace package at build time, so `dist/index.js` is
 * self-contained and runs under plain node. Real dependencies stay EXTERNAL:
 * they're installed in the image anyway, and bundling Prisma in particular
 * breaks its engine resolution.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

/*
 * Everything from node_modules stays external; only WORKSPACE packages are
 * inlined. Derived from package.json rather than hardcoded, so adding a
 * dependency can't silently start bundling it.
 *
 * The `workspace:` filter is the load-bearing part: `@impactbridge/shared` is a
 * normal entry in `dependencies`, so without excluding it here it stays
 * external and the bundle still crashes on boot — which is exactly what
 * happened on the first attempt.
 */
const external = Object.entries({
  ...pkg.dependencies,
  ...pkg.devDependencies,
})
  .filter(([, version]) => !String(version).startsWith("workspace:"))
  .map(([name]) => name);

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  /*
   * ESM output in a CommonJS-less bundle loses `__dirname` and friends; a few
   * transitive packages still reference them. This shim keeps them defined.
   */
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
