import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-lg border bg-card px-3.5 py-2 text-sm text-foreground shadow-subtle transition-all duration-200 ease-out-soft",
        "placeholder:text-muted-foreground/70",
        // Hovering a field hints it's editable before the click; on focus the
        // border adopts the brand colour so the ring isn't doing all the work.
        "hover:border-muted-foreground/30",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        hasError
          ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"
          : "border-input",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
