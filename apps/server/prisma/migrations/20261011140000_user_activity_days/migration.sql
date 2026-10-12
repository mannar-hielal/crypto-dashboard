-- CreateTable
CREATE TABLE "UserActivity" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "UserActivity_day_idx" ON "UserActivity"("day");

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
