import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { CheckoutView } from "@/features/public/checkout-view";
import { getSetting } from "@/lib/settings";
import { getCurrentSession } from "@/server/auth/session";

/** Star rules come from admin settings; null when they cannot be read (we then show no numbers rather than guess). */
async function loadStarRules(): Promise<{ minBalance: number; chargePerOrder: number } | null> {
  try {
    const [minBalance, chargePerOrder] = await Promise.all([getSetting("stars.min_balance_customer"), getSetting("orders.stars_charge_per_party")]);
    return { minBalance, chargePerOrder };
  } catch {
    return null;
  }
}

export const metadata: Metadata = { title: "تأكيد الطلب" };

export default async function CheckoutPage() {
  const [session, starRules] = await Promise.all([getCurrentSession(), loadStarRules()]);
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="تأكيد الطلب" description="راجع طلباتك لكل نشاط قبل التأكيد." />
        <CheckoutView
          starRules={starRules}
          signedIn={session?.user.role === "CUSTOMER"}
          unavailableNote="تأكيد الطلب غير مفعّل بعد على الخادم، لذلك لن يُرسل أي طلب من هذه الصفحة. سلتك تبقى محفوظة على هذا الجهاز."
        />
      </div>
    </SiteShell>
  );
}
