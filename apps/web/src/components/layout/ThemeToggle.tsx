import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/*
 * Cycles light → dark → system. A segmented control would be clearer but costs
 * three slots in a crowded header; cycling keeps it to one, and the icon always
 * shows the state you're currently in rather than the one you'd move to.
 */
const ORDER: Theme[] = ["light", "dark", "system"];

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      // The label names the DESTINATION, because that's what a screen reader
      // user is deciding about; the visible icon shows the current state.
      aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next]}.`}
      title={`Theme: ${LABELS[theme]}`}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 ease-out-soft before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:bg-secondary hover:text-foreground active:scale-90",
        className,
      )}
    >
      {/* `key` remounts on change so the incoming icon replays its scale-in. */}
      <Icon key={theme} className="h-4 w-4 animate-scale-in" />
    </button>
  );
}
