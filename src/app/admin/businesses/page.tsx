import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Notice } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { loadAdminBusinesses, type BusinessOverviewRow } from "@/features/admin/data";
import { ResultState } from "@/features/shared/result-state";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "الأنشطة والمنتجات" };

const STATUS = { PENDING_REVIEW: ["قيد المراجعة", "warning"], APPROVED: ["معتمد", "success"], REJECTED: ["مرفوض", "danger"], SUSPENDED: ["موقوف", "danger"] } as const;

const columns: Column<BusinessOverviewRow>[] = [
  { key: "n", header: "النشاط", cell: (r) => <span className="font-bold">{r.name}</span> },
  { key: "t", header: "النوع", cell: (r) => r.businessType },
  { key: "o", header: "المالك", cell: (r) => <span>{r.ownerName} · <span className="ltr-isolate num">{r.ownerPhone}</span></span> },
  { key: "s", header: "الحالة", cell: (r) => { const [label, tone] = STATUS[r.status as keyof typeof STATUS] ?? [r.status, "neutral" as const]; return <Badge tone={tone}>{label}</Badge>; } },
  { key: "p", header: "المنتجات", numeric: true, cell: (r) => <span className="num">{formatNumber(r.availableProducts)} / {formatNumber(r.products)} متاح</span> },
  { key: "d", header: "التسجيل", cell: (r) => <span className="num">{formatDate(r.createdAt)}</span> },
];

export default async function Page() {
  const { user } = await requirePermission("catalog.manage");
  const result = await loadAdminBusinesses(user);
  return (
    <>
      <PageHeader title="الأنشطة والمنتجات" description="نظرة عامة على كل الأنشطة وحجم كتالوج كل منها." />
      <Notice>اعتماد النشاط أو رفضه أو إيقافه من <Link href="/admin/merchants" className="font-semibold underline">صفحة التجار</Link>. إيقاف النشاط يخفيه عن العملاء. إخفاء منتج واحد بعينه من الإدارة غير متاح حالياً (يحتاج قراراً منك، انظر التقرير).</Notice>
      {result.status === "ready" ? <DataTable caption="الأنشطة" columns={columns} rows={result.data} rowKey={(r) => r.id} empty={<EmptyState icon="store" title="لا توجد أنشطة" />} /> : <ResultState result={result} />}
    </>
  );
}
