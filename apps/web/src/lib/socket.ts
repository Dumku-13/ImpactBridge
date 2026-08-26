import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshSession } from "./api";

/**
 * One shared Socket.io connection for the whole app.
 *
 * A module-level singleton rather than a per-component connection: React
 * StrictMode mounts effects twice in development, and every component that
 * wanted live data would otherwise open its own socket. One connection, many
 * listeners.
 */
let socket: Socket | null = null;

/**
 * Bound the auth-retry loop. If refreshing the token doesn't satisfy the
 * server's handshake, retrying forever would just be a reconnect storm against
 * an endpoint that has already made up its mind.
 */
const MAX_AUTH_RETRIES = 3;
let authRetries = 0;

export function connectSocket(): Socket | null {
  const token = getAccessToken();

  // No token means nobody is signed in — the server would reject the handshake.
  if (!token) return null;

  if (socket?.connected) return socket;

  socket?.disconnect();

  authRetries = 0;

  const instance = io({
    // Same origin; Vite proxies /socket.io through to the API in dev.
    path: "/socket.io",
    /*
     * A callback, not a static object. Access tokens are short-lived and
     * rotate; socket.io reconnects automatically after any network blip and
     * replays the ORIGINAL handshake payload. Baking the token in at connect
     * time means the first reconnect after a rotation fails auth and live
     * notifications quietly stop for the rest of the session. The callback is
     * re-invoked per attempt, so each one sends the current token.
     */
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket", "polling"],
  });

  instance.on("connect", () => {
    // A clean handshake means the token was accepted — start the budget over.
    authRetries = 0;
  });

  /*
   * Recover from an auth-rejected handshake.
   *
   * The `auth` callback above sends a fresh token per attempt, but it can only
   * send what it has: if a reconnect lands while the access token is expired
   * and nothing has refreshed it yet, the server's middleware rejects the
   * handshake. socket.io v4 retries transient/network failures on its own, but
   * it does NOT retry a middleware rejection — `socket.active` is false and the
   * client gives up permanently. Live notifications would then be silently dead
   * for the rest of the session, falling back to the 60s poll with no visible
   * sign anything was wrong.
   *
   * So: refresh the token, then reconnect by hand.
   */
  instance.on("connect_error", () => {
    // socket.io is still retrying this one itself — leave it alone.
    if (instance.active) return;

    // A newer socket has replaced this one; let the dead instance rest.
    if (socket !== instance) return;

    if (authRetries >= MAX_AUTH_RETRIES) return;
    authRetries += 1;

    void refreshSession().then((session) => {
      // No session means genuinely signed out — reconnecting can't help, and
      // the refresh path has already notified the app.
      if (!session) return;
      if (socket !== instance) return;

      instance.connect();
    });
  });

  socket = instance;

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
