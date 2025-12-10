-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `areaId` VARCHAR(36) NULL,
    ADD COLUMN `areaName` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `Area` (
    `id` VARCHAR(36) NOT NULL,
    `unitId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Area_unitId_idx`(`unitId`),
    INDEX `Area_isActive_idx`(`isActive`),
    UNIQUE INDEX `Area_unitId_name_key`(`unitId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Reservation_areaId_createdAt_idx` ON `Reservation`(`areaId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Area` ADD CONSTRAINT `Area_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
