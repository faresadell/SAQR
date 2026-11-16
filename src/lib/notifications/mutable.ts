/** The only notification kinds a user may switch off. Everything about orders, payments, refunds, plans and safety is deliberately NOT here. */
export const MUTABLE_GROUPS = [
  { key: "chat", label: "رسائل المحادثات", types: ["CHAT_MESSAGE"] },
  { key: "reviews", label: "التقييمات الجديدة", types: ["REVIEW_RECEIVED"] },
  { key: "offers", label: "إشعارات العروض", types: ["OFFER_CREATED_BY_ADMIN", "OFFER_STOPPED"] },
] as const;

export type MutableKey = (typeof MUTABLE_GROUPS)[number]["key"];
export const mutableTypes = (key: string): readonly string[] => MUTABLE_GROUPS.find((g) => g.key === key)?.types ?? [];
