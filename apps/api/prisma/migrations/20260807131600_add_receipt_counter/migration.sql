-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("year")
);

-- Seed each year's counter from the receipt numbers already issued.
--
-- Without this the counter starts at 0 and the next donation is handed
-- "IB-2026-000001" — a number an existing row already holds, so the insert
-- dies on Donation.receiptNumber's unique index. Starting from the highest
-- number actually in use makes the new scheme continue the old one instead of
-- colliding with it.
--
-- The old numbers came from a global COUNT(*), so within a year they may be
-- sparse or out of order; MAX is what matters — it is the only value that
-- guarantees the next number is unused.
INSERT INTO "ReceiptCounter" ("year", "lastValue", "updatedAt")
SELECT
    CAST(split_part("receiptNumber", '-', 2) AS INTEGER),
    MAX(CAST(split_part("receiptNumber", '-', 3) AS INTEGER)),
    CURRENT_TIMESTAMP
FROM "Donation"
WHERE "receiptNumber" ~ '^IB-[0-9]{4}-[0-9]+$'
GROUP BY CAST(split_part("receiptNumber", '-', 2) AS INTEGER);
