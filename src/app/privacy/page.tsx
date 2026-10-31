import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";

export const metadata: Metadata = { title: "سياسة الخصوصية" };

// NOTE: starting text only. Have a lawyer review it against Egypt's Personal Data
// Protection Law (No. 151 of 2020) before public launch.
export default function PrivacyPage() {
  return (
    <SiteShell>
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-10 leading-8">
      <h1 className="text-2xl font-bold">سياسة الخصوصية</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">البيانات التي نجمعها</h2>
        <p>الاسم ورقم الموبايل وكلمة المرور (مخزّنة بشكل مشفّر ولا يمكن قراءتها)، وعناوين التوصيل، وبيانات الطلبات، وإيصالات التحويل التي ترفعها، وبيانات تقنية لحماية الحساب مثل عنوان الشبكة ونوع المتصفح.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">لماذا نستخدمها</h2>
        <p>لتشغيل حسابك، وتنفيذ الطلبات والتوصيل، والتحقق من المدفوعات، ومنع الاحتيال، وإرسال رموز التحقق والتنبيهات المتعلقة بطلباتك.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">من يطّلع عليها</h2>
        <p>التاجر يرى بيانات الطلب اللازمة لتنفيذه فقط، والسائق يرى بيانات التسليم لطلباته فقط، وفريق الإدارة يطّلع عليها للمراجعة والدعم. لا نبيع بياناتك.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">مدة الاحتفاظ</h2>
        <p>نحتفظ ببيانات الحساب والطلبات طوال مدة استخدامك للخدمة وللمدة التي يفرضها القانون المحاسبي، ونحذف إيصالات التحويل بعد انتهاء المدة المحددة في إعدادات المنصة.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">حقوقك</h2>
        <p>يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذف حسابك عبر الدعم، وسنرد في المدة القانونية.</p>
      </section>
    </div>
    </SiteShell>
  );
}
