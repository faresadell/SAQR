import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { loadBusinessTypes, loadOffers, loadShops } from "@/features/public/data";
import { HomeView } from "@/features/public/home-view";
import { IntroSound } from "@/features/intro/intro-sound";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "الرئيسية" };

export default async function HomePage() {
  const [types, shops, offers, session] = await Promise.all([loadBusinessTypes(), loadShops(), loadOffers(), getCurrentSession()]);
  return (
    <SiteShell>
      <IntroSound />
      <HomeView types={types} shops={shops} offers={offers.status === "ready" ? offers.data : []} signedIn={Boolean(session)} />
    </SiteShell>
  );
}
