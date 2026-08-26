import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { editorial } from "@/content/media";

/**
 * Shared shell for every auth screen (login, signup, reset, verify).
 *
 * Split layout: the form on the left, a quiet brand panel on the right that
 * only appears on large screens. Keeping this in one component means all five
 * auth pages stay visually identical for free.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Form side */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="mb-12 inline-block font-grotesk text-lg font-extrabold uppercase tracking-[0.02em] text-foreground transition-opacity hover:opacity-80"
            style={{ fontStretch: "88%" }}
          >
            Impact<span className="text-primary">Bridge</span>
          </Link>

          <h1
            className="font-display text-3xl font-semibold tracking-[-0.025em] text-foreground sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          )}
        </div>
      </div>

      {/*
        Brand side — decorative, so hidden from screen readers.

        A photograph rather than a tinted panel: this is often the first screen
        a returning user sees, and the whole argument of the product is that
        there are people at the end of the money. The scrim is heavy enough that
        the type never has to compete with the image.
      */}
      <div
        aria-hidden="true"
        className="relative hidden w-1/2 overflow-hidden bg-[hsl(200_36%_7%)] lg:block"
      >
        <img
          src={editorial.ngoCommunity.src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(200_36%_7%)] via-[hsl(200_36%_7%/0.55)] to-[hsl(200_36%_7%/0.25)]" />

        <div className="relative flex h-full flex-col justify-end px-16 pb-16">
          <blockquote className="max-w-md">
            <p
              className="font-display text-3xl font-semibold leading-snug tracking-[-0.02em] text-[hsl(40_24%_96%)]"
              style={{ fontVariationSettings: '"SOFT" 12' }}
            >
              Funding reaches further when nonprofits, donors, and funders can
              actually find each other.
            </p>
            <footer className="mt-6 text-sm leading-relaxed text-[hsl(40_24%_96%/0.75)]">
              Every organisation on ImpactBridge is verified before it can
              receive funds.
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
