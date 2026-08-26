import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * `cva` defines the variants once, so every button in the app is consistent and
 * a restyle later means editing THIS file rather than hunting class strings
 * across dozens of components.
 */
const buttonVariants = cva(
  /*
   * `active:scale-[0.97]` is the whole trick to a button feeling physical: the
   * press is acknowledged instantly, before any network request resolves. The
   * transition covers transform and shadow as well as colour, so hover lifts
   * and release settles rather than snapping.
   */
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-subtle hover:bg-primary/90 hover:shadow-raised",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline:
          "border border-border bg-card text-foreground shadow-subtle hover:border-primary/30 hover:bg-secondary/60 hover:shadow-raised",
        ghost: "text-foreground hover:bg-secondary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-subtle hover:bg-destructive/90 hover:shadow-raised",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-base",
      },
      fullWidth: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, isLoading, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      // A loading button must also be disabled, or users can double-submit.
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
