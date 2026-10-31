import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MERCHANT_STATUS } from "@/features/shared/status";
import { canEditOwnProfile } from "@/lib/catalog/catalog-policy";
import { emptyWeek, validateOpeningHours, type OpeningHours } from "@/lib/catalog/opening-hours";
import { requireRole } from "@/server/auth/guards";
import { listBusinessTypes } from "@/server/catalog/categories";
import { getOwnMerchant } from "@/server/merchants/service";
import { ProfileForm, type ProfileDefaults } from "../profile-form";

export const metadata: Metadata = { title: "بيانات النشاط" };

function weekFrom(json: unknown): OpeningHours {
  if (json === null || json === undefined) return emptyWeek();
  const parsed = validateOpeningHours(json);
  return parsed.ok ? parsed.value : emptyWeek();
}

export default async function MerchantProfilePage() {
  const { user } = await requireRole("MERCHANT");
  const [shop, businessTypes] = await Promise.all([getOwnMerchant(user), listBusinessTypes(true)]);
  const canEdit = !shop || canEditOwnProfile(user, shop);
  const defaults: ProfileDefaults = {
    name: shop?.name ?? "",
    description: shop?.description ?? "",
    businessType: shop?.businessType ?? "",
    phone: shop?.phone ?? "",
    address: shop?.address ?? "",
    lat: shop?.lat?.toString() ?? "",
    lng: shop?.lng?.toString() ?? "",
    hours: weekFrom(shop?.openingHours),
  };
  return (
    <>
      <PageHeader
        title="بيانات النشاط وساعات العمل"
        actions={shop ? <Badge tone={MERCHANT_STATUS[shop.status].tone}>{MERCHANT_STATUS[shop.status].label}</Badge> : undefined}
      />
      {!canEdit ? <Notice tone="warning">لا يمكن تعديل البيانات في حالتها الحالية.</Notice> : null}
      <Card className="max-w-3xl">
        <ProfileForm defaults={defaults} businessTypes={businessTypes.map((t) => ({ code: t.code, nameAr: t.nameAr }))} canEdit={canEdit} />
      </Card>
    </>
  );
}
