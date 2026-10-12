-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fillEmailOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fillEmailOptInAt" TIMESTAMP(3);
