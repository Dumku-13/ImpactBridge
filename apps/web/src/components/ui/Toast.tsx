import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "info" | "success" | "error";

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

const VARIANTS: Record<ToastVariant, { icon: typeof Info; className: string }> =
  {
    info: { icon: Info, className: "border-border" },
    success: { icon: CheckCircle2, className: "border-primary/40" },
    error: { icon: AlertCircle, className: "border-destructive/40" },
  };

const ICON_TONE: Record<ToastVariant, string> = {
  info: "text-muted-foreground",
  success: "text-primary",
  error: "text-destructive",
};

const ToastContext = createContext<{
  toast: (message: string, variant?: ToastVariant) => void;
} | null>(null);

/**
 * Transient confirmations.
 *
 * The app surfaces every outcome as an inline `<Alert>` next to the form that
 * caused it. That is right for validation errors — they belong beside the field
 * — but wrong for "Saved", "Bookmark added", "Marked all read", which have no
 * natural anchor and shouldn't push layout around when they appear.
 *
 * Deliberately not a dependency: `sonner` and friends are a few hundred lines
 * of behaviour we don't need, and this has to theme off our own tokens anyway.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextId.current++;
      setToasts((current) => {
        const next = [...current, { id, variant, message }];
        // Cap the stack. Beyond three, older toasts are dropped rather than
        // queued — a backlog of stale confirmations helps nobody.
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });

      // Errors linger; confirmations get out of the way.
      const ttl = variant === "error" ? 7000 : 4000;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttl),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          // `polite` rather than `assertive`: these are confirmations, and
          // interrupting whatever a screen reader is mid-sentence on is rude.
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map(({ id, variant, message }) => {
            const { icon: Icon, className } = VARIANTS[variant];
            return (
              <div
                key={id}
                className={cn(
                  "pointer-events-auto flex animate-slide-down items-start gap-3 rounded-lg border bg-card p-3.5 text-sm text-foreground shadow-lifted",
                  className,
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONE[variant])} />
                <p className="flex-1 leading-relaxed">{message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(id)}
                  aria-label="Dismiss"
                  className="-m-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return context;
}
