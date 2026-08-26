import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { corsOrigins } from "../config/env.js";
import { verifyAccessToken } from "./auth/tokens.js";

/**
 * Real-time delivery over Socket.io.
 *
 * ── Two things make this safe ────────────────────────────────────────────────
 *
 * 1. THE HANDSHAKE IS AUTHENTICATED. A socket connection is a long-lived,
 *    server-push channel; if anyone could open one and name a room, they could
 *    subscribe to another user's notifications. The JWT is verified before the
 *    connection is accepted, and the user id comes from that token — never from
 *    anything the client sends.
 *
 * 2. ROOMS ARE SERVER-ASSIGNED. Each socket joins exactly `user:<id>` derived
 *    from its verified token. There is deliberately no "subscribe" event: a
 *    client cannot ask to join a room, so it cannot ask for someone else's.
 */

let io: SocketServer | null = null;

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: corsOrigins, credentials: true },
    // Keep the connection alive through brief network blips.
    pingTimeout: 20_000,
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      // Fallback for clients that can only set query params.
      (socket.handshake.query?.token as string | undefined);

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    // Stash the VERIFIED identity on the socket for the connection handler.
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;

    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;

    // The only room this socket will ever be in.
    void socket.join(`user:${userId}`);

    socket.on("disconnect", () => {
      // Socket.io leaves rooms automatically; nothing to clean up.
    });
  });

  console.log("   realtime  Socket.io ready");

  return io;
}

/**
 * Push an event to one user, across every tab they have open.
 *
 * Never throws. Notifications are already persisted by the time this is called,
 * so a transport failure should degrade to "they'll see it on next load" rather
 * than failing the donation or grant decision that triggered it.
 */
export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  try {
    io?.to(`user:${userId}`).emit(event, payload);
  } catch (err) {
    console.error(`[realtime] failed to emit ${event} to ${userId}:`, err);
  }
}

export function getIo(): SocketServer | null {
  return io;
}
