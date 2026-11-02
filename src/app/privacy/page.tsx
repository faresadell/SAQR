import { redirect } from "next/navigation";

/** The privacy text is managed (and approved) in the admin panel; this old address forwards there. */
export default function PrivacyPage(): never {
  redirect("/legal/privacy");
}
