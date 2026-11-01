// Arabic messages for service error codes. Pure data: safe to import from server actions and client components.
export const GENERIC_ERROR = "حدث خطأ غير متوقع. حاول مرة أخرى.";
export const DENIED_ERROR = "ليست لديك صلاحية لهذا الإجراء.";
export const NOT_FOUND_ERROR = "العنصر غير موجود.";

export const LIFECYCLE_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "البيانات المرسلة غير صحيحة. راجعها وحاول مرة أخرى.",
  WRONG_STATE: "لا يمكن تنفيذ هذا الإجراء في حالة الطلب الحالية.",
  PAYMENT_METHOD_DISABLED: "وسيلة الدفع هذه غير مفعّلة حالياً.",
  PAYMENT_RECEIVER_NOT_SET: "لم تحدّد الإدارة بعد رقم استلام هذه الوسيلة.",
  DUPLICATE_TRANSFER: "رقم عملية التحويل هذا مؤكَّد على طلب آخر.",
  PAYMENT_NOT_CONFIRMED: "يجب تأكيد الدفع أولاً.",
  INSUFFICIENT_STARS: "رصيد النجوم لا يكفي لإتمام هذا الإجراء.",
  DRIVER_NOT_AVAILABLE: "هذا السائق غير متاح.",
  CONFLICT: "تغيّرت حالة الطلب للتو. حدّث الصفحة وحاول مرة أخرى.",
};

export const UPLOAD_MESSAGES: Record<string, string> = {
  INVALID_FILE: "الملف ليس صورة صالحة (JPG أو PNG أو WebP).",
  FILE_TOO_LARGE: "حجم الصورة كبير. الحد الأقصى 5 ميجابايت.",
  WRONG_STATE: "لا يمكن رفع إيصال لهذا الطلب في حالته الحالية.",
  TOO_MANY_UPLOADS: "رفعت صوراً كثيرة دون استخدامها. استخدم إحداها أو حاول لاحقاً.",
};

export const PLACE_ORDER_MESSAGES: Record<string, string> = {
  EMPTY_CART: "السلة فارغة.",
  TOO_MANY_LINES: "عدد المنتجات في السلة أكبر من المسموح.",
  INVALID_QUANTITY: "كمية غير صحيحة في السلة.",
  PRODUCT_NOT_FOUND: "أحد المنتجات لم يعد موجوداً.",
  PRODUCT_UNAVAILABLE: "أحد المنتجات غير متاح الآن.",
  PRICE_CHANGED: "تغيّر سعر منتج أو بدأ عرض عليه. حدّثنا الأسعار في سلتك، راجعها ثم أكّد الطلب مرة أخرى.",
  INVALID_FEE: "تعذر حساب رسوم التوصيل. حاول لاحقاً.",
  INVALID_REQUEST: "بيانات الطلب غير صحيحة.",
  ACCOUNT_NOT_ACTIVE: "حسابك غير مفعّل لإرسال طلبات.",
  ADDRESS_NOT_FOUND: "اختر عنوان توصيل صحيحاً.",
  ZONE_UNAVAILABLE: "منطقة هذا العنوان غير متاحة للتوصيل حالياً.",
  TRADING_NOT_CONFIGURED: "استقبال الطلبات لم يبدأ بعد (الإدارة لم تحدد مهلة رد التاجر).",
  CUSTOMER_STARS_TOO_LOW: "رصيد نجومك أقل من الحد الأدنى لإرسال طلب. اشحن رصيدك من صفحة الباقات.",
  MERCHANT_UNAVAILABLE: "أحد الأنشطة في سلتك لا يستقبل طلبات الآن (مغلق أو رصيده غير كافٍ).",
};

export const ADDRESS_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "اكتب عنواناً واضحاً (٥ أحرف على الأقل) واختر المنطقة.",
  ZONE_UNAVAILABLE: "هذه المنطقة غير متاحة حالياً.",
  TOO_MANY_ADDRESSES: "وصلت للحد الأقصى من العناوين المحفوظة. احذف عنواناً قديماً أولاً.",
};

export const PLAN_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "اكتب رقم عملية صحيح وارفع صورة الإيصال.",
  PAYMENT_METHOD_DISABLED: "وسيلة الدفع هذه غير مفعّلة حالياً.",
  PAYMENT_RECEIVER_NOT_SET: "لم تحدّد الإدارة بعد رقم استلام هذه الوسيلة.",
  PLAN_NOT_AVAILABLE: "هذه الباقة غير متاحة لحسابك.",
  PURCHASE_PENDING: "لديك طلب شراء قيد المراجعة بالفعل.",
  CONFLICT: "تم استخدام هذا الإيصال من قبل. ارفع صورة جديدة.",
};

export const OFFER_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "راجع بيانات العرض: العنوان من 3 أحرف، ولا يُقبل خصم بدون منتجات.",
  SHOP_NOT_APPROVED: "لا يمكن نشر عروض قبل اعتماد النشاط.",
  OFFER_NOT_ACTIVE: "هذا العرض لم يعد ساري المدة.",
  INSUFFICIENT_STARS: "رصيد النجوم لا يكفي للتمديد.",
  WRONG_STATE: "تغيّرت حالة العرض. حدّث الصفحة.",
  CONFLICT: "تغيّر العرض للتو. حدّث الصفحة وحاول مرة أخرى.",
  DISCOUNTS_DISABLED: "الخصومات غير مفعّلة حالياً من الإدارة.",
  DISCOUNT_INVALID: "قيمة الخصم غير صحيحة.",
  DISCOUNT_ABOVE_LIMIT: "قيمة الخصم أعلى من الحد الذي تسمح به الإدارة.",
  FINAL_PRICE_NOT_POSITIVE: "الخصم يجعل سعر أحد المنتجات صفراً أو أقل.",
  TOO_MANY_DISCOUNTED_OFFERS: "وصلت للحد الأقصى من العروض بخصم الجارية في نفس الوقت.",
  PRODUCT_ALREADY_IN_OFFER: "أحد المنتجات داخل عرض بخصم جارٍ بالفعل.",
};

export const DRIVER_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "اكتب اسماً ورقم موبايل مصرياً صحيحاً.",
  PHONE_IN_USE: "رقم الموبايل مسجّل بحساب آخر.",
  SHOP_NOT_APPROVED: "لا يمكن إضافة سائقين قبل اعتماد النشاط.",
  WEAK_PASSWORD: "كلمة المرور المؤقتة ضعيفة. استخدم 8 أحرف على الأقل بحروف وأرقام.",
};

export const ADMIN_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "راجع البيانات. الأسباب والملاحظات لا تقل عن 3 أحرف.",
  WRONG_STATE: "تغيّرت الحالة. حدّث الصفحة.",
  CONFLICT: "تم تنفيذ إجراء آخر على هذا العنصر للتو. حدّث الصفحة.",
  DUPLICATE_TRANSFER: "رقم التحويل هذا مؤكَّد على عملية أخرى، وتم وضع علامة مراجعة عليه.",
  RATE_LIMITED: "محاولات كثيرة. حاول لاحقاً.",
  OFFER_NOT_ACTIVE: "العرض لم يعد جارياً.",
  MONTH_NOT_CLOSED: "الشهر لم ينتهِ بعد.",
  USER_NOT_ELIGIBLE: "هذا المستخدم غير مؤهل.",
  RANK_TAKEN: "هذا المركز محجوز.",
  ALREADY_RANKED: "هذا المستخدم لديه مركز بالفعل.",
  CONTEST_NOT_ENABLED: "المسابقة مغلقة. فعّلها من الإعدادات بعد اعتماد القواعد.",
  RULES_NOT_APPROVED: "صفحة قواعد المسابقة غير معتمدة بعد.",
  AWARDS_EXIST: "توجد جوائز مقترحة أو معتمدة لهذا الشهر.",
  NOT_ENOUGH_PARTICIPANTS: "لا يوجد مشاركون مؤهلون في هذا الشهر.",
};
