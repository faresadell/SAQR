import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { loadBusinessTypes, loadShops } from "@/features/public/data";
import { HomeView } from "@/features/public/home-view";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function HomePage() {
  const [types, shops] = await Promise.all([loadBusinessTypes(), loadShops()]);
  return (
    <SiteShell>
      <HomeView types={types} shops={shops} />
    </SiteShell>
  );
}
