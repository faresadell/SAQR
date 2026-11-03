import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { loadBusinessTypes, loadOffers, loadShops } from "@/features/public/data";
import { HomeView } from "@/features/public/home-view";
import { IntroSplash } from "@/features/intro/intro-splash";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function HomePage() {
  const [types, shops, offers, session] = await Promise.all([loadBusinessTypes(), loadShops(), loadOffers(), getCurrentSession()]);
  return (
    <SiteShell>
      <IntroSplash />
      <HomeView types={types} shops={shops} offers={offers.status === "ready" ? offers.data : []} signedIn={Boolean(session)} />
    </SiteShell>
  );
}
