import type { IconName } from "@/components/ui/icon";

/** Icon and soft tint per business kind (by code). Unknown kinds fall back to a neutral store tile. */
const STYLES: Record<string, { icon: IconName; tint: string }> = {
  restaurant: { icon: "store", tint: "bg-orange-100 text-orange-700" },
  supermarket: { icon: "cart", tint: "bg-emerald-100 text-emerald-700" },
  phones: { icon: "phone", tint: "bg-sky-100 text-sky-700" },
  pharmacy: { icon: "activity", tint: "bg-rose-100 text-rose-700" },
  bakery: { icon: "gift", tint: "bg-amber-100 text-amber-700" },
  greengrocer: { icon: "sun", tint: "bg-lime-100 text-lime-700" },
  clothes: { icon: "tag", tint: "bg-fuchsia-100 text-fuchsia-700" },
  electronics: { icon: "layers", tint: "bg-indigo-100 text-indigo-700" },
  home: { icon: "home", tint: "bg-teal-100 text-teal-700" },
};
const FALLBACK = { icon: "store" as IconName, tint: "bg-brand-soft text-navy-700" };

export function categoryStyle(code: string): { icon: IconName; tint: string } {
  return STYLES[code] ?? FALLBACK;
}
