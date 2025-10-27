/*
  Warnings:

  - You are about to drop the column `capacity` on the `Area` table. All the data in the column will be lost.
  - You are about to alter the column `photoUrl` on the `Area` table. The data in that column could be lost. The data in that column will be cast from `VarChar(512)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `Area` DROP COLUMN `capacity`,
    MODIFY `name` VARCHAR(191) NOT NULL,
    MODIFY `capacityAfternoon` INTEGER NULL,
    MODIFY `capacityNight` INTEGER NULL,
    MODIFY `photoUrl` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `area_unit_name_idx` ON `Area`(`unitId`, `name`);

-- RenameIndex
ALTER TABLE `Area` RENAME INDEX `Area_unitId_name_key` TO `area_unit_name_unique`;
