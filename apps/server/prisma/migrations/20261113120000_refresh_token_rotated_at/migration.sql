-- AlterTable: a rotated refresh token is kept for the reuse window (a lost reply can be recovered)
ALTER TABLE "RefreshToken" ADD COLUMN     "rotatedAt" TIMESTAMP(3);
