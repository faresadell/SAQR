# FRONTEND_HANDOFF — واجهة صقر (SAQR)

## 1. ملخص ما تم
واجهة كاملة RTL (كايرو/إنتر، ألوان كحلي/أبيض/فضي، tokens مركزية في `tailwind.config.ts`) فوق الباكند الموجود (المراحل 0–3) **بدون أي تعديل في الباكند أو قاعدة البيانات أو Prisma أو الـ auth أو قواعد النجوم/الباقات/العمولات/الدفع/الطلبات/التوصيل**.
المناطق: الموقع العام (الرئيسية، الاستكشاف، البحث، المتجر، المنتج، العروض، السلة متعددة الأنشطة، الدفع، الدخول/التسجيل)، لوحة العميل (بما فيها **التسبيح** كصفحة كاملة محلية بلا صوت ولا ربط بالنجوم ولا endpoint)، لوحة التاجر، لوحة السائق، لوحة الأدمن (قائمة حسب الصلاحيات).
**مبدأ مهم:** أي شاشة لا يوجد لها خدمة في الباكند تعرض حالة «غير متاحة بعد» صادقة (لا بيانات وهمية ولا نجاح مزيف). نقاط الربط هي ملفات `src/features/*/data.ts` (الـ loaders تُرجع `unavailable(feature)` الآن)، والـ views نقية تستقبل props.

## 2. الصفحات والمكوّنات
- عام: `/`، `/explore`، `/search`، `/offers`، `/shops/[id]`، `/shops/[id]/products/[productId]`، `/cart`، `/checkout`، `/login`، `/register`، `/verify`، `/privacy`، 404/error/loading.
- العميل `/account/*`: الرئيسية، orders، orders/[id]، stars، packages، rewards، addresses، notifications، profile، tasbeeh.
- التاجر `/merchant/*`: الملخص، profile، products (+new، [id])، orders، offers، packages، reports، notifications.
- السائق `/driver/*`: الرئيسية، tasks، trip، history، package، profile.
- الأدمن `/admin/*`: الملخص + (الموجود سابقاً: users، merchants، catalog، settings) + orders، payments، packages، complaints، audit، offers، notifications، businesses.
- مكوّنات مشتركة في `src/components/ui|saqr|layout`: Button/LinkButton، Input/Textarea/Checkbox، Modal/ConfirmDialog، Drawer، Toast، Skeleton، Empty/Error/Unavailable/Notice، StatCard، Progress، SafeImage، FileUpload، DataTable (جدول→بطاقات على الجوال)، Pagination، TabLinks، BarChart، OrderTimeline، StarBalance، PackageCard، SlideToConfirm، StatusBadge، DashboardShell (سايدبار كحلي + شريط علوي + تبويبات سفلية على الجوال)، SiteShell/SiteFrame.

## 3. الملفات
### معدّلة (17)
- `src/components/ui/button.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/app/not-found.tsx`
- `src/app/(auth)/register/register-form.tsx`
- `src/app/(auth)/login/login-form.tsx`
- `src/app/(auth)/verify/verify-form.tsx`
- `src/app/(auth)/layout.tsx`
- `src/app/(app)/account/page.tsx`
- `src/app/merchant/product-forms.tsx`
- `src/app/merchant/actions.ts`
- `src/app/merchant/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/layout.tsx`
- `tailwind.config.ts`

ملاحظات على المعدّل: `merchant/actions.ts` تغيّرت فيه **ثلاث وجهات redirect/revalidate فقط** (إلى `/merchant/products`)؛ `merchant/page.tsx` و`(app)/account/page.tsx` و`app/page.tsx` و`admin/page.tsx` استُبدلت بالكامل؛ `tailwind.config.ts` و`globals.css` و`layout.tsx` توسعة (لا حذف).

### جديدة (114)
- `src/components/ui/stat-card.tsx`
- `src/components/ui/tab-links.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/icon-paths.ts`
- `src/components/ui/page-header.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/drawer.tsx`
- `src/components/ui/modal.tsx`
- `src/components/ui/file-upload.tsx`
- `src/components/ui/toast.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/states.tsx`
- `src/components/ui/safe-image.tsx`
- `src/components/ui/icon.tsx`
- `src/components/ui/link-button.tsx`
- `src/components/ui/bar-chart.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/saqr/order-timeline.tsx`
- `src/components/saqr/slide-to-confirm.tsx`
- `src/components/saqr/status-badge.tsx`
- `src/components/saqr/package-card.tsx`
- `src/components/saqr/star-balance.tsx`
- `src/components/layout/dashboard-shell.tsx`
- `src/components/layout/site-shell.tsx`
- `src/components/layout/public-bottom-nav.tsx`
- `src/components/layout/site-header-controls.tsx`
- `src/app/loading.tsx`
- `src/app/admin/businesses/page.tsx`
- `src/app/admin/packages/page.tsx`
- `src/app/admin/orders/page.tsx`
- `src/app/admin/offers/page.tsx`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/notifications/page.tsx`
- `src/app/admin/complaints/page.tsx`
- `src/app/admin/payments/page.tsx`
- `src/app/driver/history/page.tsx`
- `src/app/driver/tasks/page.tsx`
- `src/app/driver/profile/page.tsx`
- `src/app/driver/trip/page.tsx`
- `src/app/driver/page.tsx`
- `src/app/driver/package/page.tsx`
- `src/app/driver/layout.tsx`
- `src/app/error.tsx`
- `src/app/offers/page.tsx`
- `src/app/search/page.tsx`
- `src/app/checkout/page.tsx`
- `src/app/cart/page.tsx`
- `src/app/shops/[id]/page.tsx`
- `src/app/shops/[id]/products/[productId]/page.tsx`
- `src/app/(app)/account/packages/page.tsx`
- `src/app/(app)/account/orders/[id]/page.tsx`
- `src/app/(app)/account/orders/page.tsx`
- `src/app/(app)/account/profile/page.tsx`
- `src/app/(app)/account/rewards/page.tsx`
- `src/app/(app)/account/notifications/page.tsx`
- `src/app/(app)/account/layout.tsx`
- `src/app/(app)/account/tasbeeh/page.tsx`
- `src/app/(app)/account/addresses/page.tsx`
- `src/app/(app)/account/stars/page.tsx`
- `src/app/merchant/packages/page.tsx`
- `src/app/merchant/orders/page.tsx`
- `src/app/merchant/profile/page.tsx`
- `src/app/merchant/offers/page.tsx`
- `src/app/merchant/notifications/page.tsx`
- `src/app/merchant/products/new/page.tsx`
- `src/app/merchant/products/[id]/page.tsx`
- `src/app/merchant/products/page.tsx`
- `src/app/merchant/reports/page.tsx`
- `src/app/merchant/layout.tsx`
- `src/app/explore/page.tsx`
- `src/features/shared/nav.test.ts`
- `src/features/shared/shared-views.tsx`
- `src/features/shared/packages-view.tsx`
- `src/features/shared/backend-gaps.ts`
- `src/features/shared/loaded.ts`
- `src/features/shared/nav.ts`
- `src/features/shared/status.ts`
- `src/features/shared/section-gate.tsx`
- `src/features/shared/role-home.ts`
- `src/features/shared/purchase-panel.tsx`
- `src/features/shared/types.ts`
- `src/features/shared/result-state.tsx`
- `src/features/customer/orders-views.tsx`
- `src/features/customer/views.tsx`
- `src/features/customer/data.ts`
- `src/features/admin/views.tsx`
- `src/features/admin/data.ts`
- `src/features/admin/types.ts`
- `src/features/public/shop-card.tsx`
- `src/features/public/product-row.tsx`
- `src/features/public/home-view.tsx`
- `src/features/public/add-to-cart.tsx`
- `src/features/public/checkout-view.tsx`
- `src/features/public/data.ts`
- `src/features/public/cart-view.tsx`
- `src/features/public/types.ts`
- `src/features/driver/safe-url.test.ts`
- `src/features/driver/views.tsx`
- `src/features/driver/data.ts`
- `src/features/driver/safe-url.ts`
- `src/features/cart/cart-provider.tsx`
- `src/features/cart/cart-state.ts`
- `src/features/cart/cart-state.test.ts`
- `src/features/merchant/views.tsx`
- `src/features/merchant/data.ts`
- `src/features/merchant/types.ts`
- `src/features/tasbeeh/tasbeeh-view.tsx`
- `src/features/tasbeeh/tasbeeh-state.test.ts`
- `src/features/tasbeeh/tasbeeh-state.ts`
- `src/features/tasbeeh/use-tasbeeh.ts`
- `src/lib/format.ts`
- `src/lib/format.test.ts`

## 4. العقود المستخدمة فعلياً (خدمات السيرفر الموجودة، لا REST)
`getCurrentSession`، `requireUser/requireRole/requirePermission`، `hasPermission`، `listPublicMerchants`، `getPublicMenu`، `listBusinessTypes`، `listUsableCategories`، `listCategoryTree`، `listOwnProducts`، `getOwnMerchant`، `listMerchantsForAdmin`، `listZones`، `listPaymentMethods`، `listCommissionHistory`، وأكشنز التاجر/الأدمن/الـ auth الموجودة. لم أخترع أي endpoint. الأنواع في `src/features/shared/types.ts` و`features/*/types.ts` هي **مقترحات من الواجهة** لشكل البيانات، وليست عقوداً قائمة.

## 5. ما يحتاجه الباكند (لتفعيل الشاشات)
| المفتاح | الشاشة | المطلوب |
|---|---|---|
| `customer.stars` | رصيد النجوم وسجل الحركات | قراءة StarAccount.balance وStarLedgerEntry للعميل الحالي (التاريخ، السبب، المقدار، الرصيد بعد الحركة، المرجع). |
| `customer.packages` | باقات العميل وشراؤها | قائمة الباقات النشطة (سعر/أساسية/إضافية)، حالة اشتراك العميل، وإرسال طلب شراء مع إيصال تحويل ليراجعه الأدمن. |
| `customer.orders` | الطلبات الرئيسية والفرعية | خدمة قراءة طلبات العميل: طلب رئيسي + طلبات فرعية لكل نشاط (عناصر، حالات الدفع والتجهيز والتوصيل، أحداث). |
| `customer.rewards` | المكافآت الشهرية | عدد الطلبات المكتملة هذا الشهر والمكافآت الممنوحة فعلاً من النظام. |
| `customer.addresses` | عناوين العميل | إنشاء/تعديل/حذف Address وربطه بـ DeliveryZone (النموذج موجود، الخدمات غير موجودة). |
| `customer.notifications` | الإشعارات | جدول وخدمة إشعارات (المرحلة 9). |
| `customer.checkout` | تأكيد الطلب | خدمة إنشاء الطلب من سلة متعددة الأنشطة: تتحقق من التوفر والأسعار، تحسب رسوم التوصيل من المنطقة (resolveZoneFee)، وتُرجع الطلب الرئيسي والفرعي. |
| `public.offers` | العروض النشطة | نموذج وخدمة قراءة العروض النشطة (غير الموجودة في المخطط الحالي). |
| `merchant.orders` | طلبات التاجر | قراءة الطلبات الفرعية الخاصة بالتاجر وإجراءات القبول/الرفض/تحديث التجهيز/تأكيد الدفع. |
| `merchant.offers` | العروض والتمديدات وحصتها | إنشاء العروض وتمديدها وخصم النجوم بشكل idempotent وحصة الباقة ومواعيد التصفير. |
| `merchant.packages` | باقات التاجر والنجوم | رصيد التاجر، الباقات، حالة الاشتراك، وطلب الشراء مع الإيصال. |
| `merchant.reports` | المبيعات والعمولات والتسويات | تجميعات المبيعات والعمولات المخزّنة في الطلبات (commissionBp/commissionCents) والتسويات. |
| `merchant.notifications` | إشعارات التاجر | جدول وخدمة إشعارات (المرحلة 9). |
| `merchant.images` | صور المنتجات | تخزين كائنات (S3/R2/MinIO) وخدمة رفع وربط Product.imageKey (قرار مفتوح في docs/PHASE3.md). |
| `driver.home` | ملخص السائق | قراءة DeliveryRecord للسائق وحالة الباقة/النجوم. |
| `driver.tasks` | المهام المتاحة | قائمة المهام/الرحلات المتاحة وقبولها (غير موجودة؛ Driver مرتبط بتاجر في المخطط الحالي). |
| `driver.trip` | الرحلة النشطة | رحلة بنقاط استلام وتسليم، وإجراءات بدء/تأكيد استلام/تأكيد تسليم/إنهاء. |
| `driver.history` | سجل الرحلات | قراءة الرحلات المنتهية للسائق. |
| `driver.package` | باقة السائق والنجوم | الباقة (٣٠ جنيه/٣٥ نجمة)، رصيد السائق، وطلب الشراء. |
| `driver.notifications` | إشعارات السائق | جدول وخدمة إشعارات (المرحلة 9). |
| `admin.orders` | الطلبات الرئيسية والفرعية للإدارة | قراءة الطلبات مع تصفية وصفحات (صلاحية orders.view). |
| `admin.payments` | مراجعة التحويلات والإيصالات | قائمة المدفوعات/الإيصالات، تنزيل الإيصال عبر canViewReceipt، واعتماد/رفض مع سبب (صلاحية payments.review). |
| `admin.packages` | الباقات والأسعار والبونص | إدارة StarPackage (سعر/أساسية/بونص/حصة عروض/فئة) بنسخ مؤرخة وسجل مراجعة. |
| `admin.offers` | إدارة العروض | قراءة العروض وإيقافها وإعدادات المدة وتكلفة النجوم. |
| `admin.complaints` | الشكاوى والاستردادات | قراءة Refund وتحقق الإدارة (refunds.verify) ونموذج شكاوى. |
| `admin.notifications` | الإشعارات | إرسال/إدارة قوالب الإشعارات (المرحلة 9). |
| `admin.audit` | سجل العمليات | خدمة قراءة AuditLog مع تصفية وصفحات (صلاحية audit.view). |
| `admin.businesses` | إدارة الأنشطة والمنتجات | قراءة كل المنتجات والأنشطة للإدارة مع إجراءات إخفاء/إيقاف. |
| `support` | الدعم | قناة دعم وبيانات تواصل أو نموذج شكاوى تحدده الإدارة. |
أيضاً: `getPublicMerchant(id)` (الآن يُجلب من القائمة)، وخدمة نسيت كلمة المرور، وتسجيل السائق (Driver مرتبط بتاجر حالياً).

## 6. تبعيات جديدة
لا شيء أُضيف إلى `package.json`. الأيقونات داخل المشروع (`icon-paths.ts`، هندسة Feather كبيانات). اختبارات المكوّنات (jsdom/RTL) لم تُضف.

## 7. نتائج الاختبار الفعلية
- **تم تشغيله:** اختبارات الوحدة (format، nav، cart-state، tasbeeh-state، safe-url) عبر runner بديل خفيف: **كلها نجحت**؛ اختبار E2E للتسبيح عبر Playwright على harness: نجح؛ فحص بناء/صياغة كل ملفات `src` عبر esbuild: بلا أخطاء؛ لقطات RTL بعروض 360/768/1280 لمكوّنات أساسية.
- **لم يُشغَّل:** `npm install` و`tsc` و`eslint` و`next build` و`vitest` الفعلي — سجل npm محجوب في بيئتي. لذلك **لم يُتحقق من أنواع TypeScript ولا من Next build**؛ شغّلهم بعد الدمج.
- لم أضف route `/preview`: لا أستطيع التحقق من عزله بأمان في بيئة بلا بناء حقيقي، ولا توجد بيانات وهمية في أي مسار إنتاج (قرار موثّق بدل مسار غير مختبر).

## 8. خطوات الدمج
1. انسخ الملفات فوق المشروع بنفس المسارات.
2. `npm install && npx prisma generate`
3. `npm run typecheck && npm run lint && npm test && npm run build`
4. `npm run dev` وجرّب كل دور.

## 9. تعارضات/قرارات مفتوحة
- نجوم الطلب: كان الافتراضي في الباكند 5؛ صُحّح إلى 2 (انظر القسم 11). إن كانت القيمة 5 محفوظة فعلاً في جدول الإعدادات بقاعدة بياناتك فعدّلها من لوحة الأدمن (الطلبات والنجوم).
- لا نص شروط/دعم/تواصل (لم أخترع نصاً قانونياً).
- الـ checkout يعرض الملخص فقط؛ تأكيد الطلب معطّل حتى توفّر الخدمة، ورسوم التوصيل لا تُحسب محلياً.
- رفع صور المنتجات معطّل (قرار التخزين مفتوح).

## 10. التحقق بعد الدمج
تسجيل الدخول بكل دور وفحص القوائم حسب الصلاحيات؛ أن صفحات «غير متاحة» لا تعرض نجاحاً مزيفاً؛ تدفق المنتجات الحالي للتاجر؛ إضافة للسلة من أكثر من نشاط؛ التسبيح يعمل محلياً ويختفي عند إعادة التحميل؛ فحص RTL على 360px.

## 11. مراجعة ما بعد التسليم الأول (Audit)
**قاعدة النجوم:** الحد الأدنى لبدء الطلب 5 نجوم (`stars.min_balance_customer`)، وتكلفة الطلب نجمتان (`orders.stars_charge_per_party`).
| ما وُجد | الإصلاح | الملف |
|---|---|---|
| الافتراضي `orders.stars_charge_per_party` = 5 (خلط بين الحد الأدنى والتكلفة) | صار 2، والاختبار يؤكد 2 مع حد أدنى 5 | `src/lib/settings-registry.ts` + `.test.ts` (**تعديل صغير خارج الواجهة، بطلب صريح**) |
| نص باقة السائق القديم (٣٠ جنيه/٣٥ نجمة) | الباقات المعتمدة 30/50/100 نجمة، نجمة = جنيه | `features/shared/backend-gaps.ts` |
| نموذج تمديد العرض كان «مضاعفات ٢٤ ساعة» وتكلفة = كل الساعات (قاعدة مخترعة) | المدة الأساسية 24 ساعة، التمديد نجمة لكل ساعة إضافية (تقدير فقط) | `features/merchant/views.tsx` |
| نص «مدة الباقة ٣٠ يوماً… لا تختفي النجوم» (سياسة مخترعة) | استُبدل بأن النجوم لا تُمنح قبل اعتماد الإدارة | `features/shared/packages-view.tsx` |
| الدفع لم يوضّح قاعدة النجوم | يعرض الحد الأدنى والتكلفة من الإعدادات الفعلية (وإن تعذّرت القراءة لا يعرض أرقاماً) | `app/checkout/page.tsx`, `features/public/checkout-view.tsx` |

**الباقات والعضويات:** أرقام (30/50/100، Plus 30، Premium 60، عمولة 8%/5%، جوائز 1000/500/250) **ليست مكتوبة في الواجهة**؛ تأتي من الباكند عند توفره (العمولات تُقرأ من `listCommissionHistory`). لا يوجد بيانات ثابتة لأرصدة.
**منع التكرار:** أزرار الإرسال تتعطل أثناء التنفيذ (`pending/busy`)، ولا خصم/منح محلي للنجوم.
**التسبيح:** معزول بالكامل (لا imports لنجوم/طلبات/شبكة)، `localStorage` فقط مع إعادة ضبط بتأكيد؛ اختبار E2E ناجح.
**الأمان:** لا `any` ولا `eval` ولا `dangerouslySetInnerHTML` ولا `@ts-ignore`. يوجد `eslint-disable` واحد لكل من `<img>` في `file-upload.tsx` و`safe-image.tsx` (معاينة blob/روابط مصرّح بها، `next/image` غير مناسب هنا). التحقق من الملفات في المتصفح مجرد تسهيل؛ التحقق الفعلي على الخادم.

### جدول التكامل (وظيفة ← صفحة ← خدمة ← الحالة)
| الوظيفة | الصفحة | الخدمة | الحالة / الناقص |
|---|---|---|---|
| تسجيل/دخول/تحقق | `(auth)/*` | actions الموجودة | متكامل. ينقص: استعادة كلمة المرور |
| متاجر ومنتجات عامة | `/`, `/explore`, `/search`, `/shops/*` | `listPublicMerchants`, `getPublicMenu`, `listBusinessTypes` | متكامل (قراءة) |
| سلة متعددة الأنشطة | `/cart` | محلي (localStorage) | عرض فقط، لا حساب نهائي |
| تأكيد الطلب | `/checkout` | غير موجودة | غير متاح — يحتاج خدمة إنشاء طلب |
| منتجات التاجر / بياناته | `/merchant/products*`, `/merchant/profile` | `listOwnProducts`, `getOwnMerchant`, actions | متكامل. الصور غير متاحة (تخزين) |
| مراجعة التجار، التصنيفات، الإعدادات، العمولات، طرق الدفع، المناطق | `/admin/merchants|catalog|settings` | خدمات الأدمن الموجودة | متكامل |
| رصيد النجوم/الدفتر، الباقات، الدفع والإيصالات، الطلبات، العروض، الاستردادات، الإشعارات، العناوين، رحلات السائق، سجل التدقيق | الصفحات المقابلة | غير موجودة | «غير متاح بعد» — راجع القسم 5 |
| التسبيح | `/account/tasbeeh` | لا يلزم | محلي بالكامل |

### ما لم يُشغَّل (بصراحة)
`npm run typecheck` و`lint` و`build` و`vitest` الفعلية و`prisma generate` **لم تُشغَّل** — سجل npm محجوب (أعدت المحاولة وما زال). فحص esbuild للصياغة ليس بديلاً عنها. اختبارات الوحدة بالـrunner البديل (بما فيها settings-registry) نجحت، وE2E التسبيح نجح. لم تُجرَّ اختبارات تكامل (تحتاج قاعدة بيانات) ولا سيناريوهات الأدوار (1–9 من قائمة التحقق) — **غير مختبرة**. قد تظهر أخطاء أنواع عند أول `typecheck`؛ أصلحها قبل الدمج.

## 12. الإغلاق النهائي (Final closure)
### إعداد النجوم والقيمة المخزنة
- `orders.stars_charge_per_party` الافتراضي صار **2** في `src/lib/settings-registry.ts` (والاختبار). الإعدادات تُقرأ في `src/lib/settings.ts` من جدول `PlatformSettingVersion` وإذا لم يوجد صف تُستخدم القيمة الافتراضية؛ و`prisma/seed.ts` لا يكتب هذا الإعداد ولا توجد migration تحتويه. **لا حاجة لأي migration.**
- **انتباه:** إن كان أحد الأدمن قد حفظ هذا الإعداد سابقاً فستبقى قيمته المخزنة سارية (مثلاً 5). راجع `/admin/settings` ← «الطلبات والنجوم» أو استعلم: `SELECT * FROM "PlatformSettingVersion" WHERE key='orders.stars_charge_per_party'` (للقراءة فقط) وعدّلها من اللوحة إن لزم. لم ألمس أي قاعدة بيانات.
- حد الرصيد الأدنى 5 (`stars.min_balance_customer` / `stars.min_balance_merchant`) لم يتغير، وتكلفة الطلب منفصلة عنه.
- ملاحظة: النموذج الحالي يخصم `stars_charge_per_party` من **كل طرف** (العميل والتاجر) عند موافقة التاجر. هذا سلوك الباكند القائم ولم أغيّره.

### ما شُغّل فعلياً في هذه الجولة
| الفحص | النتيجة |
|---|---|
| اختبارات الوحدة (runner بديل، يشمل settings-registry وformat وnav وcart وtasbeeh وsafe-url) | نجحت |
| E2E التسبيح (Playwright) | نجح |
| فحص صياغة كل `src` بـ esbuild | بلا أخطاء |
| `tsc` (TypeScript 6.0.3 المتاح محلياً) مع **stubs يدوية** لـ react/next/prisma | لا أخطاء حقيقية في ملفات الواجهة؛ المتبقي كله ناتج عن الـstubs (implicit any، namespace React). خطأ TS2367 في `admin/settings/actions.ts` موجود في النسخة الأصلية قبل تعديلاتي (غير معدّل). **هذا ليس بديلاً عن typecheck الحقيقي.** |
| لقطات RTL (360/768/1280) لمكوّنات: الباقات، النجوم، عروض التاجر، حالة «غير متاح»، DashboardShell، التسبيح | لا overflow أفقي ولا أخطاء JS (باستثناء شعار غير محمّل في الـharness) |
| `npm run typecheck/lint/test/build` الحقيقية، `prisma generate`، اختبارات التكامل (DB)، سيناريوهات الأدوار | **لم تُشغَّل** (npm registry محجوب؛ لا نسخة Next/React/Prisma/ESLint/Vitest محلية) |

### نواقص تمنع الإطلاق (الواجهة جاهزة للربط، والخدمات غير موجودة)
الجداول موجودة في `schema.prisma` (Order، StarLedger، Refund، DeliveryRecord…) لكن **لا توجد خدمات** لها، لذلك هذه الوظائف الأساسية «غير متاحة» ولا يمكن الإطلاق بدونها:
1. **إنشاء الطلب (checkout)**: التحقق من حد 5 نجوم، خصم نجمتين مرة واحدة (idempotent) عند موافقة التاجر، حساب رسوم التوصيل عبر `resolveZoneFee`. → الخطوة: خدمة `createOrder` + اتصال `checkout-view` بـ server action.
2. **رصيد النجوم والدفتر + شراء الباقات (30/50/100، نجمة = جنيه) ومراجعة الأدمن**: منح النجوم فقط عند الاعتماد وبقيد فريد يمنع التكرار. → خدمات StarAccount/StarLedger/PackagePurchase وربط `loadStars/loadPackages` و`admin/payments`.
3. **طلبات العميل والتاجر وتحديث الحالات والإلغاء/الاسترداد (مهلة 24 ساعة)** → خدمات الطلبات وانتقالات الحالة.
4. **السائق**: لا نموذج تسجيل مستقل ولا خدمات رحلات.
5. **العروض (24 ساعة، التمديد نجمة/ساعة)، المسابقة الشهرية، التسويات، الإشعارات، العناوين، رفع صور المنتجات، استعادة كلمة المرور.**
لكل نقطة ربط ملف محدد: `src/features/<area>/data.ts` (استبدل `unavailable(...)` بالقراءة الفعلية) ومفتاح في `backend-gaps.ts`.

### تعليمات الدمج والانتباه
1. انسخ الملفات بنفس المسارات (لا تعارض مع الباكند). 2. التعديل خارج الواجهة الوحيد: `src/lib/settings-registry.ts` + اختباره. 3. `merchant/actions.ts`: ثلاث وجهات redirect فقط. 4. شغّل `npm install && npx prisma generate && npm run typecheck && npm run lint && npm test && npm run build` وأصلح أي أخطاء أنواع (لم يُتحقق منها فعلياً). 5. لم أضف `/preview` (موثّق سابقاً)، ولا بيانات وهمية في مسارات الإنتاج؛ fixtures الـharness غير مشحونة. 6. لا أسرار في الملفات المسلّمة (فُحصت).

## 13. الربط مع باكند المرحلة 4 (فرع frontend-integration فوق gen-migration)
**اتربط فعلياً (قراءة فقط، عبر `src/features/shared/server-mappers.ts`):**
| الشاشة | الخدمة | ملاحظات |
|---|---|---|
| رصيد النجوم والدفتر (عميل/تاجر/سائق) | جدولا `StarAccount` و`StarLedgerEntry` (بفلتر المستخدم الحالي) | لا يوجد service قراءة؛ الاستعلام داخل الـmapper |
| الباقات والاشتراك الحالي | `listPlansFor`, `getMyPlanState` | الأسعار والنجوم من جدول `Plan` كما هو في الـseed |
| طلبات العميل وتفاصيلها (مجمعة بالطلب الرئيسي) | `listOrdersForActor` | |
| طلبات التاجر | `listOrdersForActor` | أزرار القبول/الرفض/التجهيز **معطّلة**: الإجراءات REST فقط ولم تُربط |
| طلبات الأدمن | `listOrdersForActor` (صلاحية `orders.view`) | |
| الإشعارات (عميل/تاجر/سائق) | `listMyNotifications` | |
| طرق الدفع المفعّلة | `getEnabledPaymentMethods` | الجدول لا يحفظ رقم الحساب المستلم؛ تُعرض عبارة «غير محدد بعد» ولا يُخترع رقم |

**ما زال ناقصاً (يمنع الإطلاق):**
1. **إرسال طلب شراء باقة** من الواجهة (رفع الإيصال ثم `POST /api/v1/plans/purchases`) — النموذج معروض لكنه معطّل.
2. **تأكيد الطلب (checkout)**: `POST /api/v1/orders` يحتاج `addressId` ولا توجد خدمة عناوين. + إجراءات التاجر على الطلب + رفع إيصال الطلب.
3. مراجعة الأدمن للتحويلات/الباقات (`decidePlanPurchase`) والاستردادات (`reviewRefund`) والتسويات (`listSettlements`) موجودة كخدمات لكن شاشاتها لم تُربط بعد.
4. العناوين، المكافآت الشهرية (لا قراءة)، السائق (رحلات)، العروض، المسابقة، صور المنتجات.
5. **قرار الباقات**: الـseed الحالي يزرع برونز/فضي/ذهبي (50/75/100 جنيه) بينما القاعدة الأحدث 30/50/100 نجمة بجنيه للنجمة — الواجهة تعرض ما في قاعدة البيانات كما هو.
6. أرقام استقبال التحويل (Vodafone Cash/InstaPay) غير مخزّنة في الإعدادات.

**ما لم يُشغَّل:** نفس القسم 12 — typecheck/lint/test/build الحقيقية واختبارات التكامل. فحص `tsc` المحلي بـstubs ينتج فقط أخطاء implicit-any ناتجة عن الـstubs في الـmappers الجديدة.

## 14. نقطتان حُسمتا للمراجعة (الباقات وأرقام الدفع)
### 14.1 الباقات: القاعدة المعتمدة ≠ بيانات الباكند الحالية
**القاعدة المعتمدة:** باقات 30 و50 و100 نجمة، النجمة = 1 جنيه (أي 30/50/100 جنيه).
**ما هو موجود فعلاً (للقراءة فقط، لم أغيّر شيئاً):**
| الموضع | ما يحتويه |
|---|---|
| `src/lib/stars/rules.ts` ← `DEFAULT_PLANS` | عميل برونز/فضي/ذهبي = 50/75/100 جنيه بنجوم 50/75/100 + بونص 0/15/25؛ سائق 30 جنيه/35 نجمة؛ تاجر 100/150/200 جنيه بنجوم 100/150/200 + بونص 15/25/35 وحصة عروض 4/6/8 |
| `prisma/seed.ts` | يقرأ `DEFAULT_PLANS` ويزرعها في جدول `Plan` مرة واحدة (`update: {}`: لا يكتب فوق ما عدّله الأدمن) |
| `src/server/plans/plans.integration.test.ts` | يعتمد على `DEFAULT_PLANS` وعلى الكودين `customer_bronze/silver/gold` |
| جدول `Plan` في قاعدة البيانات | **المصدر الفعلي وقت التشغيل**؛ تعديله عبر `updatePlan` (صلاحية settings) |
| API `GET /api/v1/plans` و`listPlansFor` | يعيدان صفوف جدول `Plan` كما هي، بلا أرقام مكتوبة |
| الواجهة | **لا تحتوي أي رقم باقة**: `server-mappers.ts` تعرض `Plan` كما تأتي. لذلك ما يظهر للمستخدم = ما في القاعدة. |

**ما يقع ضمن الفرونت إند (مكتمل):** لا أرقام مكتوبة في الواجهة، وتعرض أي باقات تُسلَّم لها بما فيها البونص. لم أُخفِ التعارض بتعديل الواجهة.
**ما يحتاج الباكند (لم ألمسه):**
1. قرار المسؤول: هل المعتمد جدول واحد 30/50/100 نجمة لكل الجمهور؟ أم يبقى التمييز (عميل/تاجر/سائق)؟ وهل يبقى «البونص» (غير وارد في القاعدة المعتمدة) وحصة العروض للتاجر؟ هذه نقاط غير محسومة في القاعدة ولم أفترضها.
2. بعد القرار: تحديث `DEFAULT_PLANS` و`seed.ts` والاختبار التكاملي (أكواد وأرقام).
3. **قاعدة بيانات قائمة**: الـseed لا يعدّل الصفوف الموجودة؛ إن كانت الباقات الحالية قد زُرعت فيجب تعديلها عبر `updatePlan` أو سكربت/ migration مراجَع. لا تُعدَّل بيانات حقيقية دون موافقة.
4. لا توجد شاشة/API أدمن لتعديل الباقات (`updatePlan` خدمة فقط)، وشاشتي `admin/packages` ما زالت «غير متاحة». المطلوب: خدمة قراءة كل الباقات للأدمن + route/action للتعديل، ثم أربطها.
**الحكم:** الباقات **غير جاهزة للإطلاق** حتى يتوحد المصدر: القاعدة المعتمدة = `DEFAULT_PLANS` = `seed.ts` = جدول `Plan` = الاختبار.

### 14.2 أرقام استلام الدفع (فودافون كاش/إنستاباي)
- `PaymentMethodConfig` يحفظ الكود والاسم وتفعيل الوسيلة فقط، ولا يوجد حقل رقم/حساب في أي إعدادات.
- السلوك الآمن مُبقى ومشدَّد: الواجهة لا تعرض أي رقم افتراضي أو وهمي؛ إذا لم يوجد رقم تظهر رسالة «لم تحدّد الإدارة بعد رقم استلام الدفع لهذه الوسيلة…» ويُعطَّل زر الإرسال لهذه الوسيلة (`accountValue` صار اختيارياً في النوع `PaymentInstruction`).
- **قبل الإطلاق (إجراء للأدمن/الباكند):** إضافة حقل لرقم الاستلام (إعداد أو عمود في `PaymentMethodConfig`) مع شاشة أدمن لتحريره وتدقيقه، ثم قراءته في `mapPackages` (ويستخدم نفسه checkout). الأدمن يُعدّ رقمَي فودافون كاش وإنستاباي قبل أي تشغيل. لا أرقام في الكود.

### الإجراء المطلوب من كلود المسؤول عن الباكند (ملخص)
1. حسم جدول الباقات (واحد 30/50/100 أم متعدد) ثم توحيد `DEFAULT_PLANS` + seed + الاختبار + تصحيح البيانات الحالية بطريقة آمنة مراجَعة.
2. إضافة خدمة/route أدمن لقائمة الباقات وتعديلها.
3. إضافة حقل رقم استلام الدفع + شاشة/خدمة أدمن لإعداده + قراءته للعميل.
بعدها يُحدَّث ربط الواجهة (ملفان: `server-mappers.ts` و`admin/data.ts`) دون تغيير في الشاشات.
