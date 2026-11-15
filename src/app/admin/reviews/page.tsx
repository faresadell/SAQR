import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ReviewsPanel } from "@/features/admin/reviews-panel";
import { requirePermission } from "@/server/auth/guards";
import { listReviewsForAdmin } from "@/server/reviews/service";

export const metadata: Metadata = { title: "التقييمات" };

export default async function Page() {
  const { user } = await requirePermission("complaints.manage");
  const rows = await listReviewsForAdmin(user);
  return (
    <>
      <PageHeader title="التقييمات" description="راجع تقييمات العملاء. الإخفاء يوقف احتساب التقييم وعرضه دون حذفه." />
      <ReviewsPanel rows={rows} />
    </>
  );
}
