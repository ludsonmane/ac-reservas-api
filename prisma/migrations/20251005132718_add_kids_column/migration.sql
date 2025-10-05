-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `checkedInBy` VARCHAR(64) NULL,
    ADD COLUMN `kids` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Reservation_status_reservationDate_idx` ON `Reservation`(`status`, `reservationDate`);
