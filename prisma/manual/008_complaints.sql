-- ───────── Protections that Prisma cannot express (also kept in prisma/manual/008_complaints.sql) ─────────
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_text_lengths" CHECK (char_length("subject") BETWEEN 3 AND 100 AND char_length("details") BETWEEN 10 AND 1000);

-- A complaint is never deleted; its text and owner never change; closed ones are final.
CREATE FUNCTION saqr_complaint_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Complaint cannot be deleted';
  END IF;
  IF OLD."status" IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION 'Complaint is final once %', OLD."status";
  END IF;
  IF NEW."orderId" <> OLD."orderId" OR NEW."customerId" <> OLD."customerId" OR NEW."merchantId" <> OLD."merchantId"
     OR NEW."subject" <> OLD."subject" OR NEW."details" <> OLD."details" THEN
    RAISE EXCEPTION 'The text of a Complaint cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER complaint_guard BEFORE UPDATE OR DELETE ON "Complaint"
  FOR EACH ROW EXECUTE FUNCTION saqr_complaint_guard();
