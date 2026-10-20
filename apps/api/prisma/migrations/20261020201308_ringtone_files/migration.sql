-- AlterTable: the file now lives in the row (the table is empty everywhere).
ALTER TABLE "Ringtone" DROP COLUMN "fileUrl",
ADD COLUMN     "data" BYTEA NOT NULL;

-- AddForeignKey: deleting a ringtone puts its alarms back on the default sound.
ALTER TABLE "RingSchedule" ADD CONSTRAINT "RingSchedule_ringtoneId_fkey" FOREIGN KEY ("ringtoneId") REFERENCES "Ringtone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
