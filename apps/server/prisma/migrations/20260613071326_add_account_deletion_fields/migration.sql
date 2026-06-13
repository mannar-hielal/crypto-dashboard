-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionWarningSentAt" TIMESTAMP(3);
