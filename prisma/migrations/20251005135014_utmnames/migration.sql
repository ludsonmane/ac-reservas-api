/*
  Warnings:

  - You are about to drop the column `s_ref` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_url` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_utmcampaign` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_utmcontent` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_utmmedium` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_utmsource` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `s_utmterm` on the `Reservation` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `Reservation_s_utmsource_s_utmcampaign_idx` ON `Reservation`;

-- AlterTable
ALTER TABLE `Reservation` DROP COLUMN `s_ref`,
    DROP COLUMN `s_url`,
    DROP COLUMN `s_utmcampaign`,
    DROP COLUMN `s_utmcontent`,
    DROP COLUMN `s_utmmedium`,
    DROP COLUMN `s_utmsource`,
    DROP COLUMN `s_utmterm`,
    ADD COLUMN `ref` VARCHAR(256) NULL,
    ADD COLUMN `url` VARCHAR(512) NULL,
    ADD COLUMN `utm_campaign` VARCHAR(128) NULL,
    ADD COLUMN `utm_content` VARCHAR(128) NULL,
    ADD COLUMN `utm_medium` VARCHAR(64) NULL,
    ADD COLUMN `utm_source` VARCHAR(64) NULL,
    ADD COLUMN `utm_term` VARCHAR(128) NULL;

-- CreateIndex
CREATE INDEX `Reservation_utm_source_utm_campaign_idx` ON `Reservation`(`utm_source`, `utm_campaign`);
