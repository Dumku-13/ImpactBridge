import type { ElementType, ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Invert the palette for one section, independent of the page theme.
 *
 * The editorial reference flips the whole page from ivory to near-black between
 * sections — it isn't one background with dark cards on it, the ground itself
 * changes. Because our design tokens are class-scoped, a section can opt into
 * the opposite palette by scoping `.dark` or `.light` to itself. No second
 * palette and no per-component overrides: children keep using the same
 * `bg-background` / `text-foreground` utilities they always did.
 *
 * `tone="invert"` means "the opposite of the page", not "dark". In dark mode an
 * inverted section becomes the light one, so the alternating rhythm survives
 * the theme toggle instead of collapsing into two dark sections in a row.
 *
 * This reads the resolved theme in JS rather than doing it in CSS because the
 * flip depends on the *ancestor's* state, and a Tailwind variant cannot apply a
 * bare palette class conditionally.
 */
export function SectionTheme({
  children,
  tone = "invert",
  as: Tag = "section",
  className,
}: {
  children: ReactNode;
  /** `invert` flips against the page; `match` follows it (an explicit no-op). */
  tone?: "invert" | "match";
  as?: ElementType;
  className?: string;
}) {
  const { resolved } = useTheme();

  if (tone === "match") {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    // Painting an explicit background is required: without it the section would
    // inherit the page's ground and the token flip would show up only on text.
    <Tag
      className={cn(
        resolved === "dark" ? "light" : "dark",
        "bg-background text-foreground",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
