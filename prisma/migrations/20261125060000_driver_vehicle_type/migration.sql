-- Drivers declare what they deliver with (set by the administrator). Existing drivers default to a motorcycle.
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'TRICYCLE', 'TUKTUK', 'QUARTER_TRUCK', 'HALF_TRUCK');

ALTER TABLE "Driver" ADD COLUMN "vehicleType" "VehicleType" NOT NULL DEFAULT 'MOTORCYCLE';
