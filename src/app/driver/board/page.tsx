import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { BoardList } from "@/features/driver/board-view";
import { loadBoard } from "@/features/driver/data";
import { ResultState } from "@/features/shared/result-state";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "طلبات متاحة" };

export default async function DriverBoardPage() {
  const { user } = await requireRole("DRIVER");
  const result = await loadBoard(user);
  return (
    <>
      <PageHeader title="طلبات متاحة للتوصيل" description="أول سائق يقبل الطلب يحصل عليه، ويُبلَّغ النشاط والعميل باسمه." />
      {result.status === "ready" ? <BoardList rows={result.data} /> : <ResultState result={result} />}
    </>
  );
}
