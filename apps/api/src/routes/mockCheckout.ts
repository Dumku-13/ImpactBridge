import { Router } from "express";
import { formatMoney } from "@impactbridge/shared";
import { env, paymentProvider } from "../config/env.js";
import {
  buildMockWebhook,
  getMockOrder,
  settleMockOrder,
} from "../payments/mock.js";
import { HttpError } from "../middleware/errorHandler.js";

export const mockCheckoutRouter: Router = Router();

/**
 * The mock gateway's "bank page".
 *
 * Stands in for Razorpay's hosted checkout when no gateway credentials are
 * configured, so the donation flow is fully demoable with no account and no
 * internet. Mounted only when the mock provider is active — with Razorpay
 * configured these routes do not exist at all.
 */

/** Refuse to serve these if a real gateway is in use. */
mockCheckoutRouter.use((_req, _res, next) => {
  if (paymentProvider !== "mock") {
    return next(new HttpError(404, "Not found"));
  }
  next();
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** GET /api/mock-checkout/:orderId — render the pay/fail page. */
mockCheckoutRouter.get("/:orderId", (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const order = getMockOrder(orderId);

    if (!order) {
      throw new HttpError(404, "Unknown or expired mock order");
    }

    res.type("html").send(renderPage(orderId, order.amountMinor, order.currency));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mock-checkout/:orderId/settle — the donor pressed Pay or Fail.
 *
 * Mirrors what a real gateway does on settlement: it signs the outcome, fires a
 * webhook server-to-server, and sends the browser back with the signed result
 * for the callback path. Both confirmation paths therefore get exercised
 * exactly as they would with Razorpay.
 */
mockCheckoutRouter.post("/:orderId/settle", async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const outcome = req.body?.outcome === "failure" ? "failure" : "success";

    const { paymentId, signature } = settleMockOrder(orderId, outcome);

    // Deliver the webhook to ourselves, exactly as a gateway would.
    const hook = buildMockWebhook(orderId);

    if (hook) {
      try {
        await fetch(`http://127.0.0.1:${env.PORT}/api/webhooks/payments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-signature": hook.signature,
          },
          body: hook.body,
        });
      } catch (err) {
        // A failed webhook must not break the flow — the browser callback is
        // the other independent path, and that is the whole point of having two.
        console.error("[mock] webhook delivery failed:", err);
      }
    }

    res.json({ orderId, paymentId, signature });
  } catch (err) {
    next(err);
  }
});

function renderPage(
  orderId: string,
  amountMinor: number,
  currency: string,
): string {
  const amount = formatMoney(amountMinor, currency, { showDecimals: true });
  const returnUrl = `${env.WEB_APP_URL.replace(/\/$/, "")}/donate/complete`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock payment · ImpactBridge</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f1f5f9; color: #0f172a; padding: 24px;
  }
  .card {
    width: 100%; max-width: 400px; background: #fff; border-radius: 16px;
    border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 8px 30px rgba(15,23,42,.06);
  }
  .tag {
    display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .06em;
    text-transform: uppercase; color: #b45309; background: #fef3c7;
    padding: 4px 8px; border-radius: 6px;
  }
  h1 { font-size: 20px; margin: 16px 0 4px; letter-spacing: -0.02em; }
  .muted { color: #64748b; font-size: 14px; margin: 0; }
  .amount { font-size: 34px; font-weight: 650; letter-spacing: -0.03em; margin: 24px 0 4px; }
  button {
    width: 100%; height: 46px; border: 0; border-radius: 10px; font-size: 15px;
    font-weight: 600; cursor: pointer; margin-top: 12px;
  }
  .pay { background: #0f766e; color: #fff; }
  .fail { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
  button:disabled { opacity: .6; cursor: progress; }
  .note { font-size: 12px; color: #94a3b8; margin-top: 20px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <span class="tag">Mock gateway</span>
    <h1>Confirm your donation</h1>
    <p class="muted">No real payment method is involved.</p>
    <div class="amount">${escapeHtml(amount)}</div>
    <p class="muted">Order ${escapeHtml(orderId)}</p>

    <button class="pay" id="pay">Pay ${escapeHtml(amount)}</button>
    <button class="fail" id="fail">Simulate a failed payment</button>

    <p class="note">
      This page stands in for a bank's payment screen. Choosing an outcome signs
      the result and delivers a webhook, so the app confirms the donation
      through exactly the same code path a live gateway would use.
    </p>
  </div>

<script>
  const orderId = ${JSON.stringify(orderId)};
  const returnUrl = ${JSON.stringify(returnUrl)};

  async function settle(outcome) {
    document.getElementById('pay').disabled = true;
    document.getElementById('fail').disabled = true;

    const res = await fetch(location.pathname + '/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    });

    const data = await res.json();

    // Hand the signed result to the app, exactly as Razorpay Checkout would.
    const params = new URLSearchParams({
      order_id: data.orderId,
      payment_id: data.paymentId,
      signature: data.signature,
    });
    location.href = returnUrl + '?' + params.toString();
  }

  document.getElementById('pay').addEventListener('click', () => settle('success'));
  document.getElementById('fail').addEventListener('click', () => settle('failure'));
</script>
</body>
</html>`;
}
