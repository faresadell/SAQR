import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { Notice } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import { getLegalPage, isLegalSlug } from "@/server/legal/service";
import { NotFoundError } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    return { title: isLegalSlug(slug) ? (await getLegalPage(slug)).title : "صفحة غير موجودة" };
  } catch {
    return { title: "صفحة غير موجودة" };
  }
}

/** Public legal text. An unapproved page is always labelled as a draft; the text is rendered as plain text only. */
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  let page;
  try {
    page = await getLegalPage(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <SiteShell>
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-10 leading-8">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        {page.approved ? (
          <p className="text-xs text-ink-muted">النسخة <span className="num">{page.version}</span> · اعتُمدت في <span className="num">{formatDate(page.approvedAt!)}</span></p>
        ) : (
          <Notice tone="warning">مسودة غير معتمدة. هذا النص قيد المراجعة ولا يُعتدّ به كنص قانوني نهائي.</Notice>
        )}
        <div className="whitespace-pre-wrap">{page.body}</div>
      </article>
    </SiteShell>
  );
}
