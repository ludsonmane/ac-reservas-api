-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `unitId` VARCHAR(36) NULL;

-- CreateTable
CREATE TABLE `Unit` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Unit_slug_key`(`slug`),
    INDEX `Unit_name_idx`(`name`),
    INDEX `Unit_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Reservation_unitId_createdAt_idx` ON `Reservation`(`unitId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
