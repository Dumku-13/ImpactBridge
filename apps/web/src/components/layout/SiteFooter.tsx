import { Link } from "react-router-dom";

/**
 * The shared footer, used by both shells: the marketing home page and the
 * signed-in app layout.
 *
 * It exists in one file rather than two because the "demonstration platform"
 * disclosure below is the kind of thing that must never drift between pages —
 * a visitor who reads it on the landing page and not on the donate flow has
 * been told something inconsistent about whether their money is real.
 */

/**
 * The build timestamp, formatted once at module scope.
 *
 * `__BUILD_DATE__` is substituted as a string literal by Vite (see the `define`
 * block in vite.config.ts, which explains why a build-time constant is the only
 * honest answer here). Parsing it at module scope rather than per render means
 * the `Intl` formatter is constructed once for the whole session.
 */
const BUILD_DATE = new Date(__BUILD_DATE__);

const BUILD_DATE_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(BUILD_DATE);

function FooterLink({ to, children }: { to: string; children: string }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}

export function SiteFooter() {
  return (
    /*
     * `.no-print` rather than a print-media rule keyed on <footer>: the printed
     * documents on this site (donation receipts, application details) sign
     * themselves off with their OWN <footer>, and a blanket element rule would
     * delete those too. See the print block in index.css.
     */
    <footer className="no-print mt-24 border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display text-lg font-semibold tracking-tight text-foreground">
              Impact<span className="text-primary">Bridge</span>
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Nonprofits, donors and funding organisations in one place — with
              the grant lifecycle modelled end to end, not just a donate button.
            </p>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
              Discover
            </h2>
            <ul className="mt-4 space-y-2.5">
              <FooterLink to="/browse">Browse nonprofits</FooterLink>
              <FooterLink to="/grants">Open grants</FooterLink>
            </ul>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
              Account
            </h2>
            <ul className="mt-4 space-y-2.5">
              <FooterLink to="/login">Sign in</FooterLink>
              <FooterLink to="/signup">Get started</FooterLink>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          {/*
            The disclosure that moved here from HomePage's inline footer. It is
            deliberately the most prominent thing in this row: someone about to
            enter card details is entitled to know before, not after.
          */}
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            ImpactBridge is a demonstration platform. Payments run in test mode;
            no real money is processed.
          </p>

          {/*
            `dateTime` carries the machine-readable ISO value while the text
            stays human — the whole reason <time> exists rather than a <span>.
          */}
          <p className="shrink-0 text-sm text-muted-foreground">
            Last updated{" "}
            <time dateTime={BUILD_DATE.toISOString()}>{BUILD_DATE_LABEL}</time>
          </p>
        </div>
      </div>
    </footer>
  );
}
