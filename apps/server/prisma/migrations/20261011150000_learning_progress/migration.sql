-- CreateTable
CREATE TABLE "LearningProgress" (
    "userId" TEXT NOT NULL,
    "itemId" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("userId","itemId")
);

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
