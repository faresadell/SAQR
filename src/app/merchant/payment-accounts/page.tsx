import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentAccountsPanel } from "@/features/merchant/payment-accounts-panel";
import { requireRole } from "@/server/auth/guards";
import { listAccountMethods, listMyAccounts } from "@/server/payments/merchant-accounts";

export const metadata: Metadata = { title: "حسابات استلام الدفع" };

export default async function PaymentAccountsPage() {
  const { user } = await requireRole("MERCHANT");
  const [accounts, methods] = await Promise.all([listMyAccounts(user), listAccountMethods()]);
  const label = new Map(methods.map((m) => [m.code, m.nameAr]));
  const rows = accounts.map((a) => ({ ...a, methodLabel: label.get(a.method) ?? a.method }));
  return (
    <>
      <PageHeader title="حسابات استلام الدفع" description="العميل بيحوّل ليك مباشرة على الحساب اللي يختاره من هنا. أضف أي عدد من الحسابات." />
      <PaymentAccountsPanel rows={rows} methods={methods.map((m) => ({ code: m.code, label: m.nameAr }))} />
    </>
  );
}
