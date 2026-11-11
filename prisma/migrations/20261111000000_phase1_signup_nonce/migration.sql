-- Phase 1: bind phone verification to the browser that submitted the sign-up form
-- (prevents hijacking of a still-unverified account by someone who only knows the phone number).
-- Safe, additive, nullable: existing rows are untouched.
-- Rollback (if ever needed): ALTER TABLE "User" DROP COLUMN "signupNonceHash";
ALTER TABLE "User" ADD COLUMN "signupNonceHash" TEXT;
