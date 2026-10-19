-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "keyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Device_keyHash_key" ON "Device"("keyHash");

