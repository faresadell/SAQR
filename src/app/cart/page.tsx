import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHeader } from "@/components/ui/page-header";
import { CartView } from "@/features/public/cart-view";

export const metadata: Metadata = { title: "السلة" };

export default function CartPage() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="السلة" description="سلة واحدة لكل أنشطتك. يُنشأ لكل نشاط طلب فرعي مستقل." />
        <CartView />
      </div>
    </SiteShell>
  );
}
