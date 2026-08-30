/// <reference types="vite/client" />

/**
 * Compile-time constants injected by `define` in vite.config.ts.
 *
 * These do not exist as runtime globals — Vite substitutes them into the source
 * as literals before TypeScript ever sees the output — so they have to be
 * declared here or every use is an "cannot find name" error. Declaring them as
 * `const` rather than `var` is deliberate: it stops anyone assigning to one and
 * expecting the change to survive, which it cannot.
 */

/** ISO 8601 timestamp of the moment this bundle was built. See SiteFooter. */
declare const __BUILD_DATE__: string;
