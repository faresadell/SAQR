import type { FeatureKey } from "./loaded";

/**
 * What each screen needs from the backend before it can show real data. Rendered (development only)
 * under the "unavailable" state and mirrored in FRONTEND_HANDOFF.md. Frontend-authored: proposals, not contracts.
 */
export const BACKEND_GAPS: Record<FeatureKey, { title: string; needs: string }> = {
  "customer.stars": { title: "رصيد النجوم وسجل الحركات", needs: "قراءة StarAccount.balance وStarLedgerEntry للعميل الحالي (التاريخ، السبب، المقدار، الرصيد بعد الحركة، المرجع)." },
  "customer.packages": { title: "باقات العميل وشراؤها", needs: "قائمة الباقات النشطة (سعر/أساسية/إضافية)، حالة اشتراك العميل، وإرسال طلب شراء مع إيصال تحويل ليراجعه الأدمن." },
  "customer.orders": { title: "الطلبات الرئيسية والفرعية", needs: "خدمة قراءة طلبات العميل: طلب رئيسي + طلبات فرعية لكل نشاط (عناصر، حالات الدفع والتجهيز والتوصيل، أحداث)." },
  "customer.rewards": { title: "المكافآت الشهرية", needs: "عدد الطلبات المكتملة هذا الشهر والمكافآت الممنوحة فعلاً من النظام." },
  "customer.addresses": { title: "عناوين العميل", needs: "إنشاء/تعديل/حذف Address وربطه بـ DeliveryZone (النموذج موجود، الخدمات غير موجودة)." },
  "customer.notifications": { title: "الإشعارات", needs: "جدول وخدمة إشعارات (المرحلة 9)." },
  "customer.checkout": { title: "تأكيد الطلب", needs: "خدمة إنشاء الطلب من سلة متعددة الأنشطة: تتحقق من التوفر والأسعار، تحسب رسوم التوصيل من المنطقة (resolveZoneFee)، وتُرجع الطلب الرئيسي والفرعي." },
  "public.offers": { title: "العروض النشطة", needs: "نموذج وخدمة قراءة العروض النشطة (غير الموجودة في المخطط الحالي)." },
  "merchant.orders": { title: "طلبات التاجر", needs: "قراءة الطلبات الفرعية الخاصة بالتاجر وإجراءات القبول/الرفض/تحديث التجهيز/تأكيد الدفع." },
  "merchant.offers": { title: "العروض والتمديدات وحصتها", needs: "إنشاء العروض وتمديدها وخصم النجوم بشكل idempotent وحصة الباقة ومواعيد التصفير." },
  "merchant.packages": { title: "باقات التاجر والنجوم", needs: "رصيد التاجر، الباقات، حالة الاشتراك، وطلب الشراء مع الإيصال." },
  "merchant.reports": { title: "المبيعات والعمولات والتسويات", needs: "تجميعات المبيعات والعمولات المخزّنة في الطلبات (commissionBp/commissionCents) والتسويات." },
  "merchant.notifications": { title: "إشعارات التاجر", needs: "جدول وخدمة إشعارات (المرحلة 9)." },
  "merchant.images": { title: "صور المنتجات", needs: "تخزين كائنات (S3/R2/MinIO) وخدمة رفع وربط Product.imageKey (قرار مفتوح في docs/PHASE3.md)." },
  "driver.home": { title: "ملخص السائق", needs: "قراءة DeliveryRecord للسائق وحالة الباقة/النجوم." },
  "driver.tasks": { title: "المهام المتاحة", needs: "قائمة المهام/الرحلات المتاحة وقبولها (غير موجودة؛ Driver مرتبط بتاجر في المخطط الحالي)." },
  "driver.trip": { title: "الرحلة النشطة", needs: "رحلة بنقاط استلام وتسليم، وإجراءات بدء/تأكيد استلام/تأكيد تسليم/إنهاء." },
  "driver.history": { title: "سجل الرحلات", needs: "قراءة الرحلات المنتهية للسائق." },
  "driver.package": { title: "باقة السائق والنجوم", needs: "الباقات المعتمدة (٣٠ و٥٠ و١٠٠ نجمة، نجمة = جنيه)، رصيد السائق، وطلب الشراء." },
  "driver.notifications": { title: "إشعارات السائق", needs: "جدول وخدمة إشعارات (المرحلة 9)." },
  "admin.orders": { title: "الطلبات الرئيسية والفرعية للإدارة", needs: "قراءة الطلبات مع تصفية وصفحات (صلاحية orders.view)." },
  "admin.payments": { title: "مراجعة التحويلات والإيصالات", needs: "قائمة المدفوعات/الإيصالات، تنزيل الإيصال عبر canViewReceipt، واعتماد/رفض مع سبب (صلاحية payments.review)." },
  "admin.packages": { title: "الباقات والأسعار والبونص", needs: "إدارة StarPackage (سعر/أساسية/بونص/حصة عروض/فئة) بنسخ مؤرخة وسجل مراجعة." },
  "admin.offers": { title: "إدارة العروض", needs: "قراءة العروض وإيقافها وإعدادات المدة وتكلفة النجوم." },
  "admin.complaints": { title: "الشكاوى والاستردادات", needs: "قراءة Refund وتحقق الإدارة (refunds.verify) ونموذج شكاوى." },
  "admin.notifications": { title: "الإشعارات", needs: "إرسال/إدارة قوالب الإشعارات (المرحلة 9)." },
  "admin.audit": { title: "سجل العمليات", needs: "خدمة قراءة AuditLog مع تصفية وصفحات (صلاحية audit.view)." },
  "admin.businesses": { title: "إدارة الأنشطة والمنتجات", needs: "قراءة كل المنتجات والأنشطة للإدارة مع إجراءات إخفاء/إيقاف." },
  support: { title: "الدعم", needs: "قناة دعم وبيانات تواصل أو نموذج شكاوى تحدده الإدارة." },
};
