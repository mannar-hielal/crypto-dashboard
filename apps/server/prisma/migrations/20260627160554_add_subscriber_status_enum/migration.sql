-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('pending', 'verified', 'unsubscribed');

-- AlterTable
ALTER TABLE "Subscriber" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Subscriber" ALTER COLUMN "status" SET DATA TYPE "SubscriberStatus" USING ("status"::text::"SubscriberStatus");
ALTER TABLE "Subscriber" ALTER COLUMN "status" SET DEFAULT 'pending';
