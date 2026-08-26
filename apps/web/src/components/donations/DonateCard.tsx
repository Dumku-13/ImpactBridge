import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  DONATION_PRESETS_MAJOR,
  MIN_DONATION_MINOR,
  formatMoney,
  toMinor,
  type OrganizationDetail,
} from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { useCreateCheckout, useVerifyPayment } from "@/api/donations";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

/**
 * Donation form.
 *
 * On submit we ask our API for a CheckoutInstruction, which is either params
 * for Razorpay's in-page modal or a redirect URL for the mock gateway. Card
 * details are entered inside the gateway's own iframe or page, never on our
 * domain, so the app stays entirely out of PCI scope.
 */
export function DonateCard({
  organization,
}: {
  organization: OrganizationDetail;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createCheckout = useCreateCheckout();
  const verifyPayment = useVerifyPayment();

  const [selectedPreset, setSelectedPreset] = useState<number | null>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMajor = selectedPreset ?? Number(customAmount || 0);
  const amountMinor = toMinor(amountMajor);
  const isValidAmount = amountMinor >= MIN_DONATION_MINOR;

  // Only donors can give. Everyone else sees the right call to action.
  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-subtle">
        <h2 className="text-lg font-semibold text-foreground">
          Support {organization.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in as a donor to contribute to this organisation.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign in to donate
        </Link>
      </div>
    );
  }

  if (user.role !== "DONOR") {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-subtle">
        <h2 className="text-lg font-semibold text-foreground">
          Support {organization.name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in as a{" "}
          {user.role === "FUNDER" ? "funding organisation" : "nonprofit"}.
          Donations are made from a donor account.
        </p>
      </div>
    );
  }

  async function handleDonate() {
    setError(null);

    try {
      const { checkout } = await createCheckout.mutateAsync({
        organizationId: organization.id,
        amountMinor,
        message: message.trim() || undefined,
        anonymous,
      });

      if (checkout.kind === "redirect") {
        // Mock gateway — full navigation, we're leaving the SPA.
        window.location.href = checkout.url;
        return;
      }

      // Razorpay opens in-page. `result` is null when the donor closes the
      // modal without paying, which is a cancellation rather than a failure.
      const result = await openRazorpayCheckout(checkout);

      if (!result) return;

      /*
       * Nothing is confirmed yet. The server re-checks the signature and asks
       * Razorpay directly whether the payment was captured, so a tampered or
       * replayed response cannot credit a donation.
       */
      await verifyPayment.mutateAsync({
        providerOrderId: result.razorpay_order_id,
        providerPaymentId: result.razorpay_payment_id,
        signature: result.razorpay_signature,
      });

      navigate(`/donate/complete?order_id=${result.razorpay_order_id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't start the donation. Please try again.",
      );
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-subtle">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Your contribution
      </p>

      {/*
        The amount, large. This is the number the donor is actually deciding on,
        and showing it at display size — rather than only inside the button —
        makes the choice feel deliberate instead of like filling in a form.
      */}
      <p
        className={cn(
          "tnum mt-3 font-grotesk text-4xl font-extrabold leading-none tracking-[-0.02em] transition-colors duration-200",
          isValidAmount ? "text-foreground" : "text-muted-foreground/40",
        )}
        style={{ fontStretch: "88%" }}
      >
        {formatMoney(amountMinor, organization.currency)}
      </p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {/* Preset amounts */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {DONATION_PRESETS_MAJOR.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setSelectedPreset(preset);
              setCustomAmount("");
            }}
            aria-pressed={selectedPreset === preset}
            className={cn(
              "tnum h-11 rounded-lg border text-sm font-semibold transition-all duration-200 ease-out-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedPreset === preset
                ? "border-primary bg-primary text-primary-foreground shadow-subtle"
                : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-secondary",
            )}
          >
            {formatMoney(toMinor(preset), organization.currency)}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mt-3">
        <label htmlFor="custom-amount" className="sr-only">
          Custom amount in rupees
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₹
          </span>
          <Input
            id="custom-amount"
            type="number"
            inputMode="numeric"
            min={50}
            placeholder="Other amount"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              // Typing a custom value clears the preset selection.
              setSelectedPreset(null);
            }}
            className="pl-7"
          />
        </div>
        {customAmount && !isValidAmount && (
          <p className="mt-1 text-xs text-destructive">
            Minimum donation is {formatMoney(MIN_DONATION_MINOR)}
          </p>
        )}
      </div>

      {/* Optional message */}
      <div className="mt-3">
        <label
          htmlFor="donation-message"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Message <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="donation-message"
          rows={2}
          maxLength={280}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something to the team…"
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        Donate anonymously
      </label>

      <Button
        fullWidth
        size="lg"
        className="mt-4"
        /*
         * Stays busy through verification, not just order creation. Once the
         * gateway modal closes, `createCheckout.isPending` is already false
         * while `verifyPayment` is still in flight — the button would re-enable
         * mid-payment and a second click would open a second checkout for the
         * same intended gift, i.e. charge the donor twice.
         */
        disabled={!isValidAmount || verifyPayment.isPending}
        isLoading={createCheckout.isPending || verifyPayment.isPending}
        onClick={handleDonate}
      >
        {isValidAmount
          ? `Give ${formatMoney(amountMinor, organization.currency)}`
          : "Choose an amount"}
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        {/* Provider-neutral on purpose: the gateway is swappable at runtime
            (Razorpay or the local mock), so naming one here would eventually
            be a lie shown to donors. */}
        Secure checkout · test mode, no real charge
      </p>
    </div>
  );
}
