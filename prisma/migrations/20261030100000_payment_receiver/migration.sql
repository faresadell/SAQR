-- Admin-configurable receiving number per payment method (NULL = method cannot take payment requests).
ALTER TABLE "PaymentMethodConfig" ADD COLUMN "receiverNumber" TEXT;
ALTER TABLE "PaymentMethodConfig" ADD CONSTRAINT "PaymentMethodConfig_receiver_format" CHECK ("receiverNumber" IS NULL OR "receiverNumber" ~ '^[0-9+]{8,20}$');
