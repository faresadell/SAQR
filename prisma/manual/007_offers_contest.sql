-- ───────── Protections that Prisma cannot express (also kept in prisma/manual/007_offers_contest.sql) ─────────
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_dates_ordered" CHECK ("endsAt" > "startsAt");
ALTER TABLE "OfferExtension" ADD CONSTRAINT "OfferExtension_positive" CHECK ("hours" > 0 AND "starsCharged" >= 0);
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_rank_range" CHECK ("rank" BETWEEN 1 AND 3 AND "prizeCents" >= 0);
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_month_format" CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- One live award per rank and one rank per person each month (a rejected award frees both).
CREATE UNIQUE INDEX "ContestAward_month_rank_live" ON "ContestAward" ("monthKey", "rank") WHERE "status" <> 'REJECTED';
CREATE UNIQUE INDEX "ContestAward_month_userId_live" ON "ContestAward" ("monthKey", "userId") WHERE "status" <> 'REJECTED';

-- Extensions are an append-only record of paid time.
CREATE FUNCTION saqr_offer_extension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OfferExtension is append-only';
END $$;
CREATE TRIGGER offer_extension_append_only BEFORE UPDATE OR DELETE ON "OfferExtension"
  FOR EACH ROW EXECUTE FUNCTION saqr_offer_extension_guard();

-- Awards are never deleted; the facts of an award never change; PAID and REJECTED are final.
CREATE FUNCTION saqr_contest_award_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ContestAward cannot be deleted';
  END IF;
  IF OLD."status" IN ('PAID', 'REJECTED') THEN
    RAISE EXCEPTION 'ContestAward is final once % ', OLD."status";
  END IF;
  IF NEW."monthKey" <> OLD."monthKey" OR NEW."rank" <> OLD."rank" OR NEW."userId" <> OLD."userId"
     OR NEW."prizeCents" <> OLD."prizeCents" OR NEW."basisNote" <> OLD."basisNote" OR NEW."proposedById" <> OLD."proposedById" THEN
    RAISE EXCEPTION 'The facts of a ContestAward cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contest_award_guard BEFORE UPDATE OR DELETE ON "ContestAward"
  FOR EACH ROW EXECUTE FUNCTION saqr_contest_award_guard();
