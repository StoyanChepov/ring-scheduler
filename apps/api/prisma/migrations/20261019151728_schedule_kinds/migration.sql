-- AlterTable
ALTER TABLE "RingSchedule" DROP COLUMN "recurrenceRule",
ADD COLUMN     "daysOfWeek" INTEGER[],
ADD COLUMN     "kind" TEXT NOT NULL,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "timeOfDay" TEXT,
ALTER COLUMN "startAt" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "RingSchedule_deviceId_idx" ON "RingSchedule"("deviceId");

