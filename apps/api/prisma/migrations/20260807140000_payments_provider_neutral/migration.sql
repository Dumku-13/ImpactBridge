-- Make the payment columns gateway-neutral.
--
-- The platform originally integrated Stripe, which proved unavailable in India
-- (invite-only, requires a registered business). Payments now go through a
-- provider port with Razorpay and mock implementations, so the schema should
-- not name any one gateway.
--
-- RENAME rather than DROP/ADD so existing donation rows keep their identifiers.

-- DropIndex
DROP INDEX "Donation_stripeCheckoutSessionId_key";

-- DropIndex
DROP INDEX "Donation_stripePaymentIntentId_key";

-- AlterTable: rename the gateway identifier columns
ALTER TABLE "Donation" RENAME COLUMN "stripeCheckoutSessionId" TO "providerOrderId";
ALTER TABLE "Donation" RENAME COLUMN "stripePaymentIntentId" TO "providerPaymentId";

-- AlterTable: record which gateway handled each donation, so historical rows
-- stay accurate after the platform switches provider.
ALTER TABLE "Donation" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock';

-- CreateIndex
CREATE UNIQUE INDEX "Donation_providerOrderId_key" ON "Donation"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_providerPaymentId_key" ON "Donation"("providerPaymentId");
