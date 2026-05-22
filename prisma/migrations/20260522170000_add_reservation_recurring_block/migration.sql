-- CreateTable
CREATE TABLE `ReservationRecurringBlock` (
    `id` VARCHAR(36) NOT NULL,
    `unitId` VARCHAR(36) NOT NULL,
    `areaId` VARCHAR(36) NULL,
    `dow` TINYINT NOT NULL,
    `fromTime` VARCHAR(5) NOT NULL,
    `toTime` VARCHAR(5) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `createdBy` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `recblock_unit_dow_idx`(`unitId`, `dow`),
    INDEX `recblock_unit_area_dow_idx`(`unitId`, `areaId`, `dow`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReservationRecurringBlock` ADD CONSTRAINT `ReservationRecurringBlock_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservationRecurringBlock` ADD CONSTRAINT `ReservationRecurringBlock_areaId_fkey` FOREIGN KEY (`areaId`) REFERENCES `Area`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
