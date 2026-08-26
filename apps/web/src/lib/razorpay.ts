/**
 * Razorpay Checkout.js loader.
 *
 * Razorpay collects card details inside an iframe it owns, so nothing sensitive
 * ever touches our DOM or our servers. The script is injected on demand rather
 * than in index.html — no reason to make every visitor download a payment SDK
 * just to browse nonprofits.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** The three fields Razorpay hands back on a successful payment. */
export interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutParams {
  keyId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  organizationName: string;
  donorName: string;
  donorEmail: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (payload: unknown) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  // Cache the promise so concurrent calls share one <script> tag.
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null; // allow a retry on the next attempt
      reject(new Error("Could not load Razorpay Checkout"));
    };
    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Open Razorpay Checkout and resolve with the signed result.
 *
 * Resolves `null` if the donor dismisses the modal — a cancellation, not an
 * error. The caller must still send the result to our server for verification;
 * nothing here is trusted on its own.
 */
export async function openRazorpayCheckout(
  params: RazorpayCheckoutParams,
): Promise<RazorpayResult | null> {
  await loadScript();

  if (!window.Razorpay) {
    throw new Error("Razorpay Checkout is unavailable");
  }

  return new Promise<RazorpayResult | null>((resolve, reject) => {
    /*
     * Razorpay's modal lets the donor RETRY after a declined payment, so a
     * failure is not the end of the session. Settling the promise on
     * `payment.failed` would be a serious bug: a promise settles once, so a
     * later successful retry could never resolve, and we would take the money
     * without ever recording the donation. We only remember the reason, and
     * report it if the donor then gives up and closes the modal.
     */
    let lastFailure: string | null = null;

    const rzp = new window.Razorpay!({
      key: params.keyId,
      order_id: params.orderId,
      amount: params.amountMinor,
      currency: params.currency.toUpperCase(),
      name: "ImpactBridge",
      description: `Donation to ${params.organizationName}`,
      prefill: { name: params.donorName, email: params.donorEmail },
      theme: { color: "#0f766e" },
      handler: (response: RazorpayResult) => resolve(response),
      modal: {
        // Closing the modal after a failed attempt should surface why it
        // failed; closing without ever attempting payment is just a cancel.
        ondismiss: () =>
          lastFailure ? reject(new Error(lastFailure)) : resolve(null),
      },
    });

    rzp.on("payment.failed", (payload: unknown) => {
      lastFailure =
        (payload as { error?: { description?: string } })?.error?.description ??
        "The payment could not be completed.";
    });

    rzp.open();
  });
}
