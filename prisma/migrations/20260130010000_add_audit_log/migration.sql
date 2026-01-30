-- CreateTable: AuditLog
CREATE TABLE `AuditLog` (
    `id` VARCHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `entity` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(36) NULL,
    `userId` VARCHAR(36) NULL,
    `userName` VARCHAR(200) NULL,
    `userEmail` VARCHAR(200) NULL,
    `oldData` JSON NULL,
    `newData` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
