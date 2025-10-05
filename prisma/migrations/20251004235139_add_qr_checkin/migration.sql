/*
  Warnings:

  - A unique constraint covering the columns `[qrToken]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `qrToken` to the `Reservation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `checkedInAt` DATETIME(3) NULL,
    ADD COLUMN `qrExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `qrToken` VARCHAR(64) NOT NULL,
    ADD COLUMN `status` ENUM('AWAITING_CHECKIN', 'CHECKED_IN') NOT NULL DEFAULT 'AWAITING_CHECKIN';

-- CreateIndex
CREATE UNIQUE INDEX `Reservation_qrToken_key` ON `Reservation`(`qrToken`);
