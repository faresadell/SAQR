import type { IconName } from "@/components/ui/icon";

/** Icon per business kind (by code); every kind shares ONE tint so the site keeps a single colour language. Unknown kinds fall back to a neutral store tile. */
const STYLES: Record<string, { icon: IconName; tint: string }> = {
  restaurant: { icon: "store", tint: "bg-brand-soft text-brand" },
  supermarket: { icon: "cart", tint: "bg-brand-soft text-brand" },
  phones: { icon: "phone", tint: "bg-brand-soft text-brand" },
  pharmacy: { icon: "activity", tint: "bg-brand-soft text-brand" },
  bakery: { icon: "gift", tint: "bg-brand-soft text-brand" },
  greengrocer: { icon: "sun", tint: "bg-brand-soft text-brand" },
  clothes: { icon: "tag", tint: "bg-brand-soft text-brand" },
  electronics: { icon: "layers", tint: "bg-brand-soft text-brand" },
  home: { icon: "home", tint: "bg-brand-soft text-brand" },
};
const FALLBACK = { icon: "store" as IconName, tint: "bg-brand-soft text-brand" };

export function categoryStyle(code: string): { icon: IconName; tint: string } {
  return STYLES[code] ?? FALLBACK;
}
