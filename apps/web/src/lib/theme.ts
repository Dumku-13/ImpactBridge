import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

/** Shared with the pre-paint script in index.html — keep the two in step. */
export const THEME_STORAGE_KEY = "impactbridge-theme";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** What "system" actually resolves to right now. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return media().matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(theme) === "dark",
  );
}

/**
 * Theme state, persisted and OS-aware.
 *
 * Three states rather than a boolean: "system" is a real choice, and it's the
 * default. A user who has their laptop set to dark at night expects the app to
 * follow without ever being asked — but once they override it explicitly, that
 * decision has to stick, which a boolean can't express.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    // "system" is the absence of a preference, so it's stored as one.
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  // Follow the OS while — and only while — the user is on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = media();
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, resolved: resolveTheme(theme), setTheme };
}
