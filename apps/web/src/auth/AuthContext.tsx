import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, LoginInput, PublicUser } from "@impactbridge/shared";
import {
  apiPost,
  bootstrapSession,
  setAccessToken,
  setSessionEndedHandler,
} from "@/lib/api";

interface AuthContextValue {
  user: PublicUser | null;
  /** True only while the initial "am I logged in?" check is running. */
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const queryClient = useQueryClient();

  /**
   * On app start, exchange the httpOnly refresh cookie for a fresh access
   * token. This is what keeps the user signed in across page reloads even
   * though the access token itself only lives in memory.
   *
   * A 401 here is the normal "not signed in" case, not an error.
   *
   * Two safeguards against firing this twice — which matters because refresh
   * tokens ROTATE, so a duplicate call races itself:
   *   1. `hasBootstrapped` — React 18 StrictMode deliberately runs effects
   *      twice in development; this ref makes the call happen exactly once.
   *   2. `bootstrapSession()` is single-flight internally, so any other
   *      concurrent caller awaits the same promise rather than sending a
   *      second request.
   */
  /*
   * End the session locally when the refresh cookie stops working.
   *
   * The API client can detect that (a 401 on refresh, or an admin suspending
   * the account mid-session) but has no way to clear React state, so it calls
   * back here. Without this the user keeps their name in the header and a
   * rendered dashboard while every panel underneath fails — the exact broken
   * screen ProtectedRoute exists to prevent.
   */
  useEffect(() => {
    setSessionEndedHandler(() => {
      setUser(null);
      // Drop cached data belonging to the signed-out user so the next account
      // to sign in on this tab never sees it.
      queryClient.clear();
    });

    return () => setSessionEndedHandler(null);
  }, [queryClient]);

  const hasBootstrapped = useRef(false);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    /*
     * Deliberately NO cleanup/cancelled flag here.
     *
     * StrictMode's mount → unmount → remount cycle would set `cancelled` during
     * the fake unmount, and because the ref guard stops the second run from
     * starting a new request, the resolving promise would then skip
     * setIsBootstrapping(false) and leave the app stuck on the spinner forever.
     *
     * The ref already guarantees exactly one request, and this provider lives
     * for the whole session, so there is nothing meaningful to cancel.
     */
    bootstrapSession()
      .then((session) => {
        if (session) setUser(session.user);
      })
      .finally(() => {
        setIsBootstrapping(false);
      });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const data = await apiPost<AuthResponse>("/auth/login", input);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } finally {
      // Clear local state even if the network call failed — the user asked to
      // sign out, so the UI must reflect that regardless.
      setAccessToken(null);
      setUser(null);
      // Drop every cached query so the next account can't see stale data.
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isBootstrapping, login, logout }),
    [user, isBootstrapping, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
