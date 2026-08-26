import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { initRealtime } from "./lib/realtime.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`\n🌉 ImpactBridge API`);
  console.log(`   ready at http://localhost:${env.PORT}`);
  console.log(`   health   http://localhost:${env.PORT}/api/health`);
  console.log(`   env      ${env.NODE_ENV}`);
});

// Socket.io shares the HTTP server, so both live on one port.
initRealtime(server);

/** Close the DB pool and HTTP server cleanly on Ctrl+C / container stop. */
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
