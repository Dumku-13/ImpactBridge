import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  /*
   * The footer's "Last updated" date, frozen at build time.
   *
   * The obvious implementation is `new Date()` in the footer component, and it
   * is a lie: it renders today's date on every load forever, so a site nobody
   * has touched in a year still claims it was updated this morning. A visitor
   * checking whether the data is stale gets an answer that is always "no".
   *
   * `define` does a literal text substitution at build time, so the shipped
   * bundle contains the moment the bundle was made — which is the only date the
   * page can honestly claim. In dev it is the moment the server started, which
   * is close enough to be useful and clearly not a stale-content claim.
   *
   * `JSON.stringify` is not decoration: `define` splices the value in as raw
   * source text, so an unquoted date string would be substituted as a bare
   * identifier and fail to parse.
   */
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  /*
   * Pre-bundle these on startup instead of discovering them mid-navigation.
   * When Vite finds a new dependency lazily it re-optimises and forces a full
   * page reload — which, now that routes are code-split, would otherwise happen
   * the first time you opened a dashboard.
   */
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "lucide-react",
      "zod",
      "socket.io-client",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the framework in its own long-lived chunk so app changes don't
        // force users to re-download React on every deploy.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Transform the shell up front rather than on first request.
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/components/layout/AppLayout.tsx",
      ],
    },
    // Proxy /api to the Express server so the browser sees one origin in dev.
    // This sidesteps CORS entirely and mirrors how it behaves in production.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Socket.io needs `ws: true` or the upgrade handshake is proxied as a
      // plain HTTP request and the connection silently falls back to polling.
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
