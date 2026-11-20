-- Drivers sign up themselves and say whether they are taking work; shops see who is available.
ALTER TABLE "Driver" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;
