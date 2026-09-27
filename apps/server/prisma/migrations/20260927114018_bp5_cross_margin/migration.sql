-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "marginMode" TEXT NOT NULL DEFAULT 'REGULAR_MARGIN',
ADD COLUMN     "marginModeNotice" BOOLEAN NOT NULL DEFAULT false;

-- O2: accounts that exist before cross margin keep trading isolated (no silent change to open
-- positions) and get a one-time notice. New accounts take the column default: cross.
UPDATE "Account" SET "marginMode" = 'ISOLATED_MARGIN', "marginModeNotice" = true;
