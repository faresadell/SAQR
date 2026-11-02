import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { CheckoutView } from "@/features/public/checkout-view";
import { getSetting } from "@/lib/settings";
import { listMyAddresses } from "@/server/addresses/service";
import { listOpenZones } from "@/server/addresses/zones";
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
  const customer = session?.user.role === "CUSTOMER" ? session.user : null;
  const [rows, zones] = customer ? await Promise.all([listMyAddresses(customer), listOpenZones()]) : [[], []];
  const feeByZone = new Map(zones.map((z) => [z.id, z.feeCents]));
  // feeCents is what the server would charge per shop for this address today; null = the zone is closed right now.
  const addresses = rows.map((a) => ({ id: a.id, label: a.label ?? "عنوان", line: a.line, zoneName: a.zone?.name, feeCents: a.zoneId ? (feeByZone.get(a.zoneId) ?? null) : null }));
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="تأكيد الطلب" description="راجع طلباتك لكل نشاط قبل التأكيد." />
        <CheckoutView
          starRules={starRules}
          signedIn={customer !== null}
          addresses={addresses}
        />
      </div>
    </SiteShell>
  );
}
