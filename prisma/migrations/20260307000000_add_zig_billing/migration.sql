-- Adiciona campos de faturamento ZIG na reserva
ALTER TABLE `Reservation`
  ADD COLUMN `zigBillingCents` INT NULL,
  ADD COLUMN `zigBilledAt`     DATETIME(3) NULL;
