import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/server/errors";

export const LEGAL_SLUGS = ["terms", "privacy", "cancellation", "refund", "support", "contest"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export interface LegalPageView {
  slug: string;
  title: string;
  body: string;
  version: number;
  /** false = DRAFT: the text has not been reviewed/approved by an administrator and must be shown as such. */
  approved: boolean;
  approvedAt: Date | null;
  updatedAt: Date;
}

const view = (p: { slug: string; title: string; body: string; version: number; approvedAt: Date | null; updatedAt: Date }): LegalPageView => ({
  slug: p.slug, title: p.title, body: p.body, version: p.version, approved: p.approvedAt !== null, approvedAt: p.approvedAt, updatedAt: p.updatedAt,
});

export const isLegalSlug = (value: string): value is LegalSlug => (LEGAL_SLUGS as readonly string[]).includes(value);

/** Public: every page, with its approval state (the client must label drafts). */
export async function listLegalPages(): Promise<LegalPageView[]> {
  const rows = await db.legalPage.findMany({ orderBy: { slug: "asc" } });
  return rows.map(view);
}

export async function getLegalPage(slug: string): Promise<LegalPageView> {
  const row = isLegalSlug(slug) ? await db.legalPage.findUnique({ where: { slug } }) : null;
  if (!row) throw new NotFoundError();
  return view(row);
}

export type LegalResult = { ok: true; version: number } | { ok: false; error: "INVALID_REQUEST" | "STALE_VERSION" };

/** Editing creates a new version and removes any approval, so changed text is never shown as approved. */
export async function updateLegalPage(actor: Actor, slug: string, input: { title: string; body: string; expectedVersion: number }): Promise<LegalResult> {
  if (!hasPermission(actor, "content.manage")) throw new AuthorizationError();
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!isLegalSlug(slug) || title.length < 1 || title.length > 120 || body.length < 1 || body.length > 20000 || !Number.isInteger(input.expectedVersion)) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx) => {
    const changed = await tx.legalPage.updateMany({
      where: { slug, version: input.expectedVersion },
      data: { title, body, version: { increment: 1 }, approvedAt: null, approvedById: null, updatedById: actor.id },
    });
    if (changed.count !== 1) {
      if (!(await tx.legalPage.findUnique({ where: { slug } }))) throw new NotFoundError();
      return { ok: false as const, error: "STALE_VERSION" as const };
    }
    await writeAudit({ actorId: actor.id, action: "LEGAL_PAGE_EDITED", entityType: "LegalPage", entityId: slug, after: { version: input.expectedVersion + 1 } }, tx);
    return { ok: true as const, version: input.expectedVersion + 1 };
  });
}

/** The reviewer confirms THIS version. If the page changed meanwhile the approval is refused. */
export async function approveLegalPage(actor: Actor, slug: string, expectedVersion: number): Promise<LegalResult> {
  if (!hasPermission(actor, "content.manage")) throw new AuthorizationError();
  if (!isLegalSlug(slug) || !Number.isInteger(expectedVersion)) return { ok: false, error: "INVALID_REQUEST" };
  return db.$transaction(async (tx) => {
    const changed = await tx.legalPage.updateMany({ where: { slug, version: expectedVersion }, data: { approvedAt: new Date(), approvedById: actor.id } });
    if (changed.count !== 1) {
      if (!(await tx.legalPage.findUnique({ where: { slug } }))) throw new NotFoundError();
      return { ok: false as const, error: "STALE_VERSION" as const };
    }
    await writeAudit({ actorId: actor.id, action: "LEGAL_PAGE_APPROVED", entityType: "LegalPage", entityId: slug, after: { version: expectedVersion } }, tx);
    return { ok: true as const, version: expectedVersion };
  });
}
