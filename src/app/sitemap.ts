import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Public pages and approved shops. Private areas (admin, merchant, driver, account, checkout) are not listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = ["", "/explore", "/offers", "/search", "/tasbeeh", "/privacy"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.6,
  }));
  try {
    const shops = await db.merchant.findMany({ where: { status: "APPROVED" }, select: { id: true, updatedAt: true }, take: 5000, orderBy: { updatedAt: "desc" } });
    return [...pages, ...shops.map((s) => ({ url: `${base}/shops/${s.id}`, lastModified: s.updatedAt, changeFrequency: "daily" as const, priority: 0.7 }))];
  } catch {
    return pages; // never fail the sitemap because the database is briefly unreachable
  }
}
