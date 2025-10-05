-- CreateTable
CREATE TABLE `Reservation` (
    `id` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `fullName` VARCHAR(200) NOT NULL,
    `cpf` VARCHAR(14) NULL,
    `people` INTEGER NOT NULL,
    `reservationDate` DATETIME(3) NOT NULL,
    `birthdayDate` DATETIME(3) NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `s_utmsource` VARCHAR(64) NULL,
    `s_utmmedium` VARCHAR(64) NULL,
    `s_utmcampaign` VARCHAR(128) NULL,
    `s_utmcontent` VARCHAR(128) NULL,
    `s_utmterm` VARCHAR(128) NULL,
    `s_url` VARCHAR(512) NULL,
    `s_ref` VARCHAR(256) NULL,
    `unit` VARCHAR(64) NULL,
    `source` VARCHAR(64) NULL,

    INDEX `Reservation_reservationDate_idx`(`reservationDate`),
    INDEX `Reservation_createdAt_idx`(`createdAt`),
    INDEX `Reservation_s_utmsource_s_utmcampaign_idx`(`s_utmsource`, `s_utmcampaign`),
    INDEX `Reservation_unit_createdAt_idx`(`unit`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
