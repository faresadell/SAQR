# صقر (SAQR)

منصة تجارة محلية وتوصيل، عربية أولاً (RTL)، تعمل كتطبيق PWA على أندرويد.

## التشغيل المحلي

```bash
cp .env.example .env            # املأ SESSION_SECRET و DATA_ENCRYPTION_KEY (الأوامر مكتوبة داخل الملف)
docker compose up -d            # قاعدة PostgreSQL للتطوير فقط
npm install
npx prisma generate
npm run dev
```

### أول migration (مرة واحدة)

```bash
npx prisma migrate dev --name init --create-only
# افتح الملف الجديد prisma/migrations/<تاريخ>_init/migration.sql
# والصق في آخره كل محتوى prisma/manual/001_constraints_and_triggers.sql
npx prisma migrate dev
```

### بعد المرحلة 2 (إعدادات المنصة)

```bash
npx prisma generate
npx prisma migrate dev --name phase2 --create-only
# الصق في آخر ملف migration.sql الجديد محتوى prisma/manual/002_phase2_append_only.sql
# (ولو لم تطبّق 001 من قبل: الصقه قبله)
npx prisma migrate dev
npm run db:seed        # نسب العمولة 8% / 5% وطريقتا الدفع (معطّلتان حتى تفعّلهما) وأنواع النشاط (مطعم، متجر)
```

اختبارات قاعدة البيانات تحتاج قاعدة اختبار منفصلة (تُمسح جداولها):

```bash
DATABASE_URL=postgresql://saqr:saqr_dev_password@localhost:5432/saqr_test npx prisma db push
DB_TRIGGERS_APPLIED=1 DATABASE_URL=... npm run test:integration   # بعد تطبيق ملفي SQL على قاعدة الاختبار
```

### بعد المرحلة 3 (التجار والكتالوج)

```bash
npx prisma generate
npx prisma migrate dev --name phase3 --create-only
# الصق في آخر ملف migration.sql الجديد محتوى prisma/manual/003_phase3_catalog.sql
npx prisma migrate dev
npm run db:seed        # يضيف أنواع النشاط (مطعم، متجر) إن لم تكن موجودة
```
ثم ادخل كمشرف وأضف تصنيفات من `/admin/catalog`، وسجّل حساب تاجر جديد وأكمل بياناته من `/merchant`، واعتمده من `/admin/merchants`.

### إنشاء المشرف الرئيسي

```bash
ADMIN_PASSWORD='كلمة-سر-طويلة-12-حرف-على-الأقل' npm run admin:create -- --phone 01012345678 --name "اسمك"
```
سيطبع رابط مصادقة (otpauth) مرة واحدة: أضفه فوراً لتطبيق Google Authenticator. الدخول للمشرف يحتاج رقم الموبايل + كلمة المرور + رمز التطبيق.

أوامر الفحص: `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:integration` · `npm run db:validate` · `npm run audit`

## هيكل المشروع

- `src/app` الصفحات والتخطيط والـ manifest
- `src/components/ui` المكونات المشتركة (Button, Field, Badge, Card)
- `src/lib` المنطق المشترك: المبالغ (`money.ts`) والبيئة (`env.ts`) والإعدادات (`settings.ts`) والأمان (`security/`) ومكتبات الدخول النقية (`auth/`)
- `src/server` منطق السيرفر: الحسابات وOTP والجلسات والصلاحيات
- `scripts/create-admin.ts` إنشاء المشرف الرئيسي
- `docs/SECURITY.md` ملخص الحماية والقيود المعروفة
- `prisma/schema.prisma` قاعدة البيانات
- `public/sw.js` خدمة offline آمنة (لا تخزّن أي بيانات مستخدمين)

## قواعد لا تتغير

1. كل المبالغ أرقام صحيحة بالقروش. ممنوع Float.
2. كل صلاحية وكل قاعدة مالية تُفرض في السيرفر، مهما كان شكل الواجهة.
3. أي قيمة تجارية (عمولة، مهلة، رسوم) تأتي من قاعدة البيانات وتُعدَّل من لوحة الأدمن.
4. سجل النجوم وسجل المراجعة للإضافة فقط.
5. أسرار البيئة لا تُرفع على Git أبداً.

## الأمان المطبّق في المرحلة 0

- CSP صارمة بـ nonce لكل طلب (`src/middleware.ts`) بدون `unsafe-inline` للسكربتات في الإنتاج
- HSTS وX-Frame-Options وnosniff وReferrer-Policy وPermissions-Policy وCOOP
- التحقق من متغيرات البيئة عند التشغيل (`zod`) وفشل فوري عند الخطأ
- قواعد ESLint تمنع `eval` و`dangerouslySetInnerHTML` و`any`
- خدمة PWA لا تخزّن إلا صفحة offline
- CI يشغّل الفحوصات وفحص الثغرات في الحزم، وDependabot للتحديثات

## حالة المراحل

- [x] 0 الأساس والهوية
- [x] 1 الحسابات والصلاحيات (OTP، جلسات، RBAC، 2FA للأدمن، إيقاف الحسابات)
- [x] 2 إعدادات المنصة (انظر docs/PHASE2.md للقرارات غير المحسومة)
- [x] 3 التجار والكتالوج (انظر docs/PHASE3.md للقرارات غير المحسومة) · 4 تجربة العميل · 5 النجوم
- [ ] 6 الطلبات والدفع · 7 الاسترجاع · 8 التوصيل · 9 الإشعارات
