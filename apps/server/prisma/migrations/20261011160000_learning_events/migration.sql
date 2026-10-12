-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "itemId" VARCHAR(40) NOT NULL,
    "stepId" VARCHAR(40),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningEvent_userId_idx" ON "LearningEvent"("userId");

-- CreateIndex
CREATE INDEX "LearningEvent_at_idx" ON "LearningEvent"("at");

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
