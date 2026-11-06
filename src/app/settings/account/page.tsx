import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { Card } from "@/components/ui/card";
import { AvatarPanel } from "@/features/shared/avatar-panel";
import { EmailSection } from "@/features/shared/email-section";
import { NameForm } from "@/features/shared/name-panel";
import { PhonePanel } from "@/features/shared/phone-panel";
import { avatarVersion } from "@/server/auth/avatar";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "حسابي" };
export const dynamic = "force-dynamic";

/** One account page for every role: picture, name, email and phone. */
export default async function AccountSettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { user } = session;
  const version = await avatarVersion(user.id);
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold">حسابي</h1>
        <Card className="flex flex-col gap-5">
          <AvatarPanel name={user.name} version={version} />
          <NameForm name={user.name} />
        </Card>
        <EmailSection userId={user.id} />
        <PhonePanel phone={user.phone} />
      </div>
    </SiteShell>
  );
}
