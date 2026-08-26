-- CreateEnum
CREATE TYPE "RevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'THEFT_DETECTED', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "revokeReason" "RevokeReason";
