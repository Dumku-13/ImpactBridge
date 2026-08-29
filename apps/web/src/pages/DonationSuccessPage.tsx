import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Download, Loader2, XCircle } from "lucide-react";
import {
  formatMoney,
  formatMoneyCompact,
  fundingProgress,
} from "@impactbridge/shared";
import {
  useDonationByOrder,
  useDonorStats,
  useVerifyPayment,
} from "@/api/donations";
import { useOrganization } from "@/api/organizations";
import { openReceipt } from "@/lib/receipt";
import { Alert } from "@/components/ui/Alert";
import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Where the gateway sends the donor after payment.
 *
 * Two jobs, in this order of importance:
 *
 *  1. Tell the truth about whether the money actually arrived. This page does
 *     NOT assume success just because we were redirected here — the redirect
 *     only means the donor's browser left the gateway, carries no proof, and
 *     the URL can be visited directly. Confirmation comes only from the server,
 *     which re-checks with the gateway itself, so we poll until it reports a
 *     terminal status.
 *
 *  2. Once it IS confirmed, be the moment rather than a receipt. A donation is
 *     the emotional peak of the whole product and it used to resolve into a
 *     small tick and a summary table. What follows is built entirely from
 *     figures that already exist — the organisation's real totals, the donor's
 *     own real history, and the organisation's own published reporting, clearly
 *     labelled as theirs. Nothing here is modelled or estimated; see
 *     HANDOFF §3.7 for why that rule is absolute on this platform.
 */
export function DonationSuccessPage() {
  useDocumentTitle("Donation confirmed");
  const [params] = useSearchParams();
  const orderId = params.get("order_id");
  const paymentId = params.get("payment_id");
  const signature = params.get("signature");

  const verifyPayment = useVerifyPayment();
  const verifyAttempted = useRef(false);

  /*
   * The redirect-style gateway (our mock) returns the signed result in the URL
   * rather than through a JS callback, so submit it for verification once on
   * mount. The webhook may well have confirmed the donation already — the
   * server handles both arriving in either order, so a duplicate here is
   * harmless.
   */
  useEffect(() => {
    if (verifyAttempted.current) return;
    if (!orderId || !paymentId || !signature) return;

    verifyAttempted.current = true;
    verifyPayment.mutate({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      signature,
    });
  }, [orderId, paymentId, signature, verifyPayment]);

  const { data: donation, isPending, isError } = useDonationByOrder(orderId);

  /*
   * The organisation's public totals, and the donor's own history. Both are
   * fetched unconditionally here (the org query self-disables until there is a
   * slug) because hooks cannot be called after the early returns below.
   *
   * Both are invalidated by `useVerifyPayment`, so by the time a confirmed
   * donation renders, these already include it — that is precisely what makes
   * the figures worth showing at this moment rather than a day later.
   */
  const { data: org } = useOrganization(donation?.organization.slug ?? "");
  const { data: donorStats } = useDonorStats();

  if (!orderId) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">
          This page is missing its payment reference.
        </Alert>
        <Link
          to="/browse"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Back to browse
        </Link>
      </div>
    );
  }

  // Waiting on the webhook. Usually under a second, but we show honest status.
  if (isPending || donation?.status === "PENDING") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <h1 className="mt-6 text-xl font-semibold text-foreground">
          Confirming your donation…
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We're verifying the payment with the gateway. This usually takes a
          couple of seconds — please don't close this page.
        </p>

        {/*
          * If the browser-side verification itself failed, say so instead of
          * spinning indefinitely. The donation is NOT lost — the webhook and
          * the server's reconciliation sweep both still confirm it — but a
          * donor staring at a spinner has no way to know that.
          */}
        {verifyPayment.isError && (
          <Alert variant="error" className="mt-6 text-left">
            We couldn't confirm this from your browser. If money left your
            account the donation will still be recorded — it will appear in
            your donation history shortly.
          </Alert>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">
          We couldn't find this donation. If you were charged, it will still
          appear in your donation history shortly.
        </Alert>
        <Link
          to="/donor"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  if (donation && donation.status !== "SUCCEEDED") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <XCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-6 text-xl font-semibold text-foreground">
          Your payment didn't go through
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The donation was {donation.status.toLowerCase()}. You have not been
          charged — feel free to try again.
        </p>
        <Link
          to={`/ngo/${donation.organization.slug}`}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </Link>
      </div>
    );
  }

  if (!donation) return null;

  const confirmedAt = new Date(donation.completedAt ?? donation.createdAt);
  const progress = org ? fundingProgress(org.totalRaisedMinor, org.fundingGoalMinor) : null;

  return (
    <div className="pb-16">
      {/* ── The moment ──────────────────────────────────────────────────── */}
      {/*
        Full-bleed breakout from AppLayout's padded container. `w-screen` is
        100vw and therefore includes the scrollbar, which is why
        `html, body { overflow-x: clip }` is set globally — HANDOFF §3.4.

        Ground is `--ink`/`--paper`, the theme-INDEPENDENT pair. Building this
        on `--foreground` would invert the entire panel in dark mode into pale
        card with dark type, which is a bug this project has already shipped
        once (§3.3).
      */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
        {donation.organization.coverUrl && (
          <>
            <img
              src={donation.organization.coverUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
            />
            {/* Weighted to the lower left, where the type sits, so the
                photograph stays alive in the opposite corner instead of being
                flattened everywhere by an even scrim. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(120%_110%_at_0%_100%,hsl(var(--ink)/0.97)_10%,hsl(var(--ink)/0.8)_48%,hsl(var(--ink)/0.35)_100%)]"
            />
          </>
        )}

        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--paper)/0.55)]">
            Contribution confirmed ·{" "}
            <time dateTime={confirmedAt.toISOString()}>
              {confirmedAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </p>

          {/* Marigold, because this token is money and emphasis — never chrome. */}
          <h1
            className="tnum mt-8 font-grotesk text-[18vw] font-extrabold leading-[0.82] tracking-[-0.045em] text-accent sm:text-[11vw]"
            style={{ fontStretch: "80%" }}
          >
            <CountUp
              value={donation.amountMinor}
              format={(n) => formatMoney(n, donation.currency)}
            >
              {formatMoney(donation.amountMinor, donation.currency)}
            </CountUp>
          </h1>

          <p
            className="mt-6 max-w-2xl font-display text-2xl font-semibold leading-snug sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            is now with{" "}
            <Link
              to={`/ngo/${donation.organization.slug}`}
              className="text-primary underline-offset-[6px] hover:underline"
            >
              {donation.organization.name}
            </Link>
            .
          </p>

          {/* The donor's own words back to them. Only rendered when they wrote
              something — an empty quotation mark block reads as a bug. */}
          {donation.message && (
            <blockquote className="mt-10 max-w-xl border-l-2 border-primary pl-5">
              <p className="font-display text-lg leading-relaxed text-[hsl(var(--paper)/0.8)]">
                &ldquo;{donation.message}&rdquo;
              </p>
              <footer className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.5)]">
                Your note{donation.anonymous ? " · sent anonymously" : ""}
              </footer>
            </blockquote>
          )}
        </div>

        {/* ── What it joins ─────────────────────────────────────────────── */}
        {/*
          Every figure below is a row count or a SUM of completed donations,
          read straight from the organisation's public profile after this
          donation was recorded. Nothing is projected.
        */}
        {org && (
          <div className="relative border-t border-[hsl(var(--paper)/0.15)]">
            <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
                  Raised in total
                </p>
                <p
                  className="tnum mt-2 font-grotesk text-4xl font-extrabold leading-none sm:text-5xl"
                  style={{ fontStretch: "84%" }}
                >
                  {formatMoneyCompact(org.totalRaisedMinor, org.currency)}
                </p>
                {progress !== null && (
                  <p className="mt-2 text-xs text-[hsl(var(--paper)/0.55)]">
                    {progress}% of their{" "}
                    {formatMoneyCompact(org.fundingGoalMinor, org.currency)} goal
                  </p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
                  People giving
                </p>
                <p
                  className="tnum mt-2 font-grotesk text-4xl font-extrabold leading-none sm:text-5xl"
                  style={{ fontStretch: "84%" }}
                >
                  {org.donorCount.toLocaleString("en-IN")}
                </p>
                <p className="mt-2 text-xs text-[hsl(var(--paper)/0.55)]">
                  donors, you included
                </p>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--paper)/0.55)]">
                  Verified
                </p>
                <p
                  className="mt-2 font-grotesk text-4xl font-extrabold leading-none sm:text-5xl"
                  style={{ fontStretch: "84%" }}
                >
                  {org.verified ? "Yes" : "Pending"}
                </p>
                <p className="mt-2 text-xs text-[hsl(var(--paper)/0.55)]">
                  {org.verified && org.verifiedAt
                    ? `Checked by a person on ${new Date(
                        org.verifiedAt,
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Registration and documents under review"}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Your giving so far ───────────────────────────────────────────── */}
      {donorStats && donorStats.donationCount > 0 && (
        <Reveal className="mt-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your giving on ImpactBridge
          </p>
          <dl className="mt-5 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
            {[
              {
                label: "Given in total",
                value: formatMoney(
                  donorStats.totalDonatedMinor,
                  donorStats.currency,
                ),
              },
              {
                label: "Donations",
                value: donorStats.donationCount.toLocaleString("en-IN"),
              },
              {
                label: "Organisations supported",
                value: donorStats.organizationsSupported.toLocaleString("en-IN"),
              },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {stat.label}
                </dt>
                <dd
                  className="tnum mt-2 font-grotesk text-3xl font-extrabold leading-none tracking-[-0.02em] text-foreground sm:text-4xl"
                  style={{ fontStretch: "88%" }}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      )}

      {/* ── The organisation's own reporting ─────────────────────────────── */}
      {/*
        `ImpactMetric.value` is a free-form STRING written by the nonprofit
        ("146,000", "2 in 3", "98%"). It is theirs, it is not summable, and it
        is not something the platform has verified — so it is attributed to them
        in plain words rather than presented as a platform figure.
      */}
      {org && org.impactMetrics.length > 0 && (
        <Reveal className="mt-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What {org.name} reports
          </p>
          <div className="mt-5 grid gap-px overflow-hidden border-t border-border bg-border sm:grid-cols-3">
            {org.impactMetrics.map((metric) => (
              <div key={metric.id} className="bg-background pt-6 sm:px-5">
                <p
                  className="font-grotesk text-3xl font-extrabold leading-none tracking-[-0.02em] text-foreground"
                  style={{ fontStretch: "88%" }}
                >
                  {metric.value}
                </p>
                <p className="mt-2 pb-6 text-sm leading-relaxed text-muted-foreground">
                  {metric.label}
                  {metric.unit ? ` (${metric.unit})` : ""}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Published by the organisation. ImpactBridge verifies who they are,
            not what they report.
          </p>
        </Reveal>
      )}

      {/* ── The paperwork ────────────────────────────────────────────────── */}
      <Reveal className="mt-14 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your receipt
        </p>

        <dl className="mt-5 border-t border-border">
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Reference
            </dt>
            <dd className="tnum text-sm font-semibold text-foreground">
              {donation.receiptNumber}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Amount
            </dt>
            <dd className="tnum text-sm font-semibold text-foreground">
              {formatMoney(donation.amountMinor, donation.currency, {
                showDecimals: true,
              })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Confirmed
            </dt>
            <dd className="tnum text-sm font-semibold text-foreground">
              {confirmedAt.toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </dt>
            <dd className="text-sm font-semibold text-primary">Paid</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void openReceipt(donation.id)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            Download receipt
          </button>
          <Link
            to={`/ngo/${donation.organization.slug}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Visit {donation.organization.name.split(" ")[0]}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/donor"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            My donations
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Payments run in test mode — no real money was transferred.
        </p>
      </Reveal>
    </div>
  );
}
