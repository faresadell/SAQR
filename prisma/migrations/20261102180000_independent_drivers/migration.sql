-- Independent drivers: a driver may have no shop (takes orders from the open board).
ALTER TABLE "Driver" ALTER COLUMN "merchantId" DROP NOT NULL;
