import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * 404.
 *
 * The router used to answer every unknown path with `<Navigate to="/" />`. A
 * silent redirect is the worst possible answer: a mistyped or dead link dumps
 * you on the homepage with no indication that anything went wrong, so it reads
 * as the app having eaten the click rather than as a wrong address. It also
 * hides broken links from whoever has to fix them, because nothing is ever
 * reported.
 *
 * This says what happened, prints the path so it can be reported or corrected,
 * and offers the two routes most likely to be what was wanted. Set on ink,
 * because a 404 is one of the few places a bit of composure is worth more than
 * an apology graphic.
 */
export function NotFoundPage() {
  useDocumentTitle("Page not found");
  const { pathname } = useLocation();

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
      <div className="mx-auto flex min-h-[70svh] max-w-4xl flex-col justify-center px-6 py-20">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.5)]">
          Error 404
        </p>

        <h1
          className="mt-7 font-grotesk uppercase leading-[0.86] tracking-[-0.04em]"
          style={{
            fontStretch: "70%",
            fontWeight: 900,
            fontSize: "clamp(2.5rem, 9vw, 6rem)",
          }}
        >
          There&rsquo;s nothing
          <br />
          at this address.
        </h1>

        <p className="mt-8 max-w-xl text-base leading-relaxed text-[hsl(var(--paper)/0.7)]">
          The page you asked for doesn&rsquo;t exist — it may have moved, or the
          link that brought you here may be wrong.
        </p>

        {/* The path itself, so a broken link can actually be reported. */}
        <p className="tnum mt-4 break-all font-mono text-xs text-[hsl(var(--paper)/0.45)]">
          {pathname}
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            to="/browse"
            className="group inline-flex h-12 items-center gap-2 rounded-lg bg-[hsl(var(--paper))] px-6 text-sm font-semibold text-[hsl(var(--ink))] transition-all duration-200 ease-out-soft active:scale-[0.97]"
          >
            Browse organisations
            <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--paper)/0.8)] underline-offset-8 transition-colors hover:text-[hsl(var(--paper))] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
