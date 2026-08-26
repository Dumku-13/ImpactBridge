import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "error";

const VARIANTS: Record<
  AlertVariant,
  { icon: typeof Info; className: string }
> = {
  info: {
    icon: Info,
    className: "border-border bg-secondary text-secondary-foreground",
  },
  success: {
    icon: CheckCircle2,
    className: "border-primary/30 bg-primary/10 text-foreground",
  },
  error: {
    icon: AlertCircle,
    className: "border-destructive/30 bg-destructive/10 text-foreground",
  },
};

export function Alert({
  variant = "info",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: variantClass } = VARIANTS[variant];

  return (
    <div
      // `role="alert"` makes assistive tech announce this immediately — the
      // right choice for form submission failures.
      role="alert"
      className={cn(
        // Animated in: an alert that simply appears is easy to miss, especially
        // a form error below the fold of the user's attention.
        "flex animate-scale-in items-start gap-3 rounded-lg border p-3.5 text-sm shadow-subtle",
        variantClass,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
