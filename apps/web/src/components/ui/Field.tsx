import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control + error message, wired for accessibility.
 *
 * The error is rendered in an `aria-live` region so screen readers announce a
 * validation failure the moment it appears, rather than the user discovering
 * it only if they happen to navigate back to the field.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      {children}

      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}

      <p
        id={`${htmlFor}-error`}
        aria-live="polite"
        className={cn(
          "text-xs text-destructive transition-opacity",
          error ? "opacity-100" : "sr-only opacity-0",
        )}
      >
        {error}
      </p>
    </div>
  );
}
