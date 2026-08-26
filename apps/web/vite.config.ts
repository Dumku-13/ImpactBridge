import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
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
