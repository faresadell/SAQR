-- Protections Prisma cannot express (also appended to migration 20261031120000_email_recovery_legal).
ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_email_check" CHECK ("email" = lower("email") AND length("email") BETWEEN 5 AND 254);

ALTER TABLE "LegalPage" ADD CONSTRAINT "LegalPage_slug_check" CHECK ("slug" IN ('terms','privacy','cancellation','refund','support'));
ALTER TABLE "LegalPage" ADD CONSTRAINT "LegalPage_body_check" CHECK (length("body") BETWEEN 1 AND 20000 AND length("title") BETWEEN 1 AND 120);

-- Recovery codes: a used code can never be revived; hash and owner never change; rows are never deleted by accident
-- (the owner's deletion cascades from "User", regenerating codes marks old ones used instead of deleting them).
CREATE OR REPLACE FUNCTION saqr_recovery_code_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."codeHash" <> OLD."codeHash" OR NEW."userId" <> OLD."userId" THEN
      RAISE EXCEPTION 'recovery code identity is immutable';
    END IF;
    IF OLD."usedAt" IS NOT NULL AND NEW."usedAt" IS DISTINCT FROM OLD."usedAt" THEN
      RAISE EXCEPTION 'a used recovery code cannot change';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER saqr_recovery_code_guard BEFORE UPDATE ON "AdminRecoveryCode" FOR EACH ROW EXECUTE FUNCTION saqr_recovery_code_guard();

-- DRAFT texts. Not legally reviewed; every page says so. No phone number or email is invented: contact details
-- are added by an administrator from the admin panel.
INSERT INTO "LegalPage" ("slug","title","body","updatedAt") VALUES
('terms','الشروط والأحكام (مسودة)','مسودة غير معتمدة قانونيًا — تحتاج مراجعة قبل النشر.

باستخدامك منصة صقر فإنك توافق على الشروط التالية:
1. المنصة وسيط بين العملاء والتجار؛ التاجر مسؤول عن منتجاته وأسعارها وجودتها.
2. يجب أن تكون بياناتك صحيحة، وأنت مسؤول عن سرية حسابك.
3. الدفع للتاجر يتم بالتحويل المتفق عليه مع إرفاق إثبات الدفع، ويخضع للمراجعة.
4. النجوم والاشتراكات تُشترى بعد مراجعة إثبات التحويل ولا تُضاف قبل اعتماده.
5. يحق للمنصة إيقاف الحسابات المخالفة.

[تُستكمل البنود النهائية بعد المراجعة القانونية]',now()),
('privacy','سياسة الخصوصية (مسودة)','مسودة غير معتمدة قانونيًا — تحتاج مراجعة قبل النشر.

نجمع الاسم ورقم الهاتف والبريد الإلكتروني (إن أضفته) والعناوين وبيانات الطلبات لتشغيل الخدمة فقط.
نحفظ صور إثبات الدفع في تخزين خاص لا يصل إليه إلا أصحاب الصلاحية.
لا نبيع بياناتك. يمكنك طلب تصحيح بياناتك عبر الدعم.

[تُستكمل البنود النهائية بعد المراجعة القانونية]',now()),
('cancellation','سياسة الإلغاء (مسودة)','مسودة غير معتمدة قانونيًا — تحتاج مراجعة قبل النشر.

- يمكن للعميل طلب إلغاء الطلب قبل قبول التاجر له دون رسوم.
- بعد قبول التاجر يُرسل طلب الإلغاء إلى التاجر ليقرره.
- تُرد النجوم المخصومة عند الإلغاء بعد القبول مرة واحدة.

[تُستكمل البنود النهائية بعد المراجعة القانونية]',now()),
('refund','سياسة الاسترداد (مسودة)','مسودة غير معتمدة قانونيًا — تحتاج مراجعة قبل النشر.

- يُرد فرق السعر خلال المهلة المحددة في المنصة، وينفذ التاجر الاسترداد ويتابعه الأدمن.
- يُطلب من التاجر رفع إثبات الاسترداد.

[تُستكمل البنود النهائية بعد المراجعة القانونية]',now()),
('support','الدعم (مسودة)','مسودة غير معتمدة — بيانات التواصل الرسمية لم تُضف بعد.

لتقديم شكوى عن طلب استخدم صفحة الشكاوى داخل حسابك.
[تضيف الإدارة هنا وسائل التواصل الرسمية بعد اعتمادها]',now())
ON CONFLICT ("slug") DO NOTHING;
