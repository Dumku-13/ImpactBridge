import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Uppercase micro-type with open tracking: at 11px this reads as a considered
  // label rather than shrunken body text, and it gives the dense card headers a
  // second typographic voice without adding another font.
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold uppercase tracking-[0.06em] ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-muted-foreground ring-border",
        primary: "bg-primary/10 text-primary ring-primary/20",
        outline: "text-muted-foreground ring-border",
        success: "bg-primary/10 text-primary ring-primary/20",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-1 text-[11px]",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

export function Badge({
  children,
  className,
  variant,
  size,
}: VariantProps<typeof badgeVariants> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {children}
    </span>
  );
}
