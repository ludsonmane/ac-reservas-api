/*
  Warnings:

  - A unique constraint covering the columns `[reservationCode]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `reservationCode` VARCHAR(6) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Reservation_reservationCode_key` ON `Reservation`(`reservationCode`);

-- CreateIndex
CREATE INDEX `Reservation_status_createdAt_idx` ON `Reservation`(`status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Reservation_reservationCode_idx` ON `Reservation`(`reservationCode`);
