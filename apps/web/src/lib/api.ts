/**
 * Typed fetch wrapper + access-token lifecycle.
 *
 * ── Why the token lives in a module variable and NOT in localStorage ─────────
 * Anything in localStorage is readable by any JavaScript on the page, so a
 * single XSS bug leaks a long-lived credential. Keeping the access token in a
 * closure means it dies with the tab, and the only persistent credential is the
 * httpOnly refresh cookie — which scripts cannot read at all.
 *
 * The cost is that a page refresh loses the token; we solve that by calling
 * /auth/refresh once on app start (see AuthProvider) to mint a new one.
 */

let accessToken: string | null = null;

/**
 * Whether a session was ever actually established in this tab.
 *
 * The bootstrap `/auth/refresh` on app start legitimately 401s for a signed-out
 * visitor — that is "not signed in", not "your session ended". Without this
 * distinction the session-ended handler fires on every anonymous page load and
 * clears the query cache, which silently emptied the public grant and browse
 * pages for logged-out users.
 */
let hadSession = false;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) hadSession = true;
}

export function getAccessToken() {
  return accessToken;
}

/**
 * Called when the refresh cookie stops working mid-session — expired, revoked,
 * or the account suspended by an admin.
 *
 * Without this the app strands the user in a "zombie" session: the token is
 * gone, so every query 401s, but AuthContext still holds a `user` object, so
 * ProtectedRoute keeps rendering the page. The header shows their name while
 * every panel underneath reads "couldn't load". AuthContext registers a handler
 * here so it can clear the user and send them to the sign-in page instead.
 */
type SessionEndedHandler = () => void;

let onSessionEnded: SessionEndedHandler | null = null;

export function setSessionEndedHandler(handler: SessionEndedHandler | null) {
  onSessionEnded = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Endpoints that must never trigger the refresh-and-retry loop. */
const NO_RETRY_PATHS = ["/auth/login", "/auth/refresh", "/auth/register"];

/**
 * De-duplicate concurrent refreshes.
 *
 * If five queries fire at once and all get a 401, we must NOT send five refresh
 * requests — with token rotation, the first would invalidate the rest and log
 * the user out. Instead every caller awaits the SAME in-flight promise.
 */
interface RefreshResult {
  user: unknown;
  accessToken: string;
}

let refreshPromise: Promise<RefreshResult | null> | null = null;

async function refreshAccessToken(): Promise<RefreshResult | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const wasSignedIn = hadSession;
        setAccessToken(null);
        hadSession = false;
        // Only a LOST session is worth reporting; a failed bootstrap is not.
        if (wasSignedIn) onSessionEnded?.();
        return null;
      }
      const data = (await res.json()) as RefreshResult;
      setAccessToken(data.accessToken);
      return data;
    } catch {
      /*
       * A network blip and a revoked cookie are indistinguishable here, so we
       * end the session either way. Treating a transient failure as "still
       * signed in" is the worse mistake: it leaves the user stuck on a broken
       * page rather than at a sign-in form they can act on.
       */
      const wasSignedIn = hadSession;
      setAccessToken(null);
      hadSession = false;
      if (wasSignedIn) onSessionEnded?.();
      return null;
    } finally {
      // Clear on the next tick so callers awaiting this promise still resolve.
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

/**
 * Refresh the access token on demand.
 *
 * The socket needs this. Its handshake is rejected by a server middleware
 * rather than by a 401 flowing through `apiFetch`, so it can't reach the
 * refresh-and-retry path any other way — and rolling its own refresh would
 * rotate the cookie out from under an in-flight request. Sharing the
 * single-flight promise keeps exactly one refresh in the air.
 */
export function refreshSession(): Promise<RefreshResult | null> {
  return refreshAccessToken();
}

/**
 * Called once on app start to restore a session from the refresh cookie.
 * Shares the same single-flight promise as the 401-retry path, so a bootstrap
 * and an in-flight request can never rotate the token twice.
 */
export function bootstrapSession() {
  return refreshAccessToken() as Promise<{
    user: import("@impactbridge/shared").PublicUser;
    accessToken: string;
  } | null>;
}

async function request<T>(
  path: string,
  options: RequestInit,
  allowRetry: boolean,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Access token expired → refresh once, then replay the original request.
  // This is what makes 15-minute tokens invisible to the user.
  if (
    res.status === 401 &&
    allowRetry &&
    !NO_RETRY_PATHS.some((p) => path.startsWith(p))
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, options, false);
    }

  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.message ?? `Request failed (${res.status})`,
      body?.error?.details,
    );
  }

  return body as T;
}

export function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return request<T>(path, options, true);
}

/**
 * Fetch a non-JSON endpoint (the HTML receipt) with the same auth + refresh
 * behaviour as apiFetch.
 *
 * A plain <a href> cannot be used for these: the access token is held in a JS
 * variable rather than a cookie, so a browser navigation sends no Authorization
 * header and the API answers 401. Fetching here, then opening the result as a
 * blob, keeps the token out of both the URL and localStorage.
 */
export async function apiFetchText(
  path: string,
  allowRetry = true,
): Promise<string> {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`/api${path}`, { headers, credentials: "include" });

  if (res.status === 401 && allowRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetchText(path, false);
  }

  if (!res.ok) {
    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");
    const body = isJson ? await res.json() : null;
    throw new ApiError(
      res.status,
      body?.error?.message ?? `Request failed (${res.status})`,
    );
  }

  return res.text();
}

/**
 * POST multipart form data (file uploads).
 *
 * Deliberately does NOT set Content-Type: the browser must generate it itself
 * so it can append the multipart boundary. Setting it manually produces a
 * header with no boundary and the server fails to parse any field.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  allowRetry = true,
): Promise<T> {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body,
    credentials: "include",
  });

  if (res.status === 401 && allowRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiUpload<T>(path, body, false);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.error?.message ?? `Upload failed (${res.status})`,
      payload?.error?.details,
    );
  }

  return payload as T;
}

/** Convenience helper for JSON POSTs. */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export { refreshAccessToken };
