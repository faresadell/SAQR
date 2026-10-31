import type { IconName } from "@/components/ui/icon-paths";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Admin only: permission that must be held for the item to appear (the server still enforces it). */
  permission?: string;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** `base` lets the same navigation serve the real area ("/account") and the design preview ("/preview/account"). */
export function customerNav(base = "/account"): { groups: NavGroup[]; mobile: NavItem[] } {
  const home = { href: base, label: "الرئيسية", icon: "home" } as const;
  const orders = { href: `${base}/orders`, label: "طلباتي", icon: "box" } as const;
  const stars = { href: `${base}/stars`, label: "النجوم", icon: "star" } as const;
  const tasbeeh = { href: `${base}/tasbeeh`, label: "التسبيح", icon: "sun" } as const;
  return {
    groups: [
      { items: [home, orders] },
      {
        title: "النجوم والباقات",
        items: [stars, { href: `${base}/packages`, label: "الباقات والشحن", icon: "layers" }, { href: `${base}/rewards`, label: "المكافآت الشهرية", icon: "gift" }],
      },
      {
        title: "حسابي",
        items: [
          { href: `${base}/addresses`, label: "العناوين", icon: "pin" },
          { href: `${base}/notifications`, label: "الإشعارات", icon: "bell" },
          tasbeeh,
          { href: `${base}/profile`, label: "الملف الشخصي والدعم", icon: "user" },
        ],
      },
    ],
    mobile: [home, orders, stars, tasbeeh],
  };
}

export function merchantNav(base = "/merchant"): { groups: NavGroup[]; mobile: NavItem[] } {
  const home = { href: base, label: "الملخص", icon: "home" } as const;
  const orders = { href: `${base}/orders`, label: "الطلبات", icon: "box" } as const;
  const products = { href: `${base}/products`, label: "المنتجات", icon: "store" } as const;
  const offers = { href: `${base}/offers`, label: "العروض", icon: "tag" } as const;
  return {
    groups: [
      { items: [home, orders] },
      { title: "الكتالوج", items: [products, offers] },
      {
        title: "المال",
        items: [
          { href: `${base}/packages`, label: "الباقات والنجوم", icon: "star" },
          { href: `${base}/reports`, label: "المدفوعات والتقارير", icon: "chart" },
        ],
      },
      {
        title: "النشاط",
        items: [
          { href: `${base}/profile`, label: "بيانات النشاط وساعات العمل", icon: "settings" },
          { href: `${base}/notifications`, label: "الإشعارات والدعم", icon: "bell" },
        ],
      },
    ],
    mobile: [home, orders, products, offers],
  };
}

export function driverNav(base = "/driver"): { groups: NavGroup[]; mobile: NavItem[] } {
  const home = { href: base, label: "الرئيسية", icon: "home" } as const;
  const tasks = { href: `${base}/tasks`, label: "المهام المتاحة", icon: "list" } as const;
  const trip = { href: `${base}/trip`, label: "الرحلة النشطة", icon: "navigation" } as const;
  const history = { href: `${base}/history`, label: "سجل الرحلات", icon: "clock" } as const;
  return {
    groups: [
      { items: [home, tasks, trip, history] },
      {
        title: "حسابي",
        items: [
          { href: `${base}/package`, label: "الباقة والنجوم", icon: "star" },
          { href: `${base}/profile`, label: "الملف والإشعارات والدعم", icon: "user" },
        ],
      },
    ],
    mobile: [home, tasks, trip, { href: `${base}/profile`, label: "حسابي", icon: "user" }],
  };
}

export function adminNav(base = "/admin"): { groups: NavGroup[]; mobile: NavItem[] } {
  const home = { href: base, label: "الملخص", icon: "home" } as const;
  const merchants = { href: `${base}/merchants`, label: "التجار", icon: "store", permission: "merchants.review" } as const;
  const orders = { href: `${base}/orders`, label: "الطلبات", icon: "box", permission: "orders.view" } as const;
  const payments = { href: `${base}/payments`, label: "التحويلات والإيصالات", icon: "receipt", permission: "payments.review" } as const;
  return {
    groups: [
      { items: [home] },
      {
        title: "التشغيل",
        items: [
          { href: `${base}/users`, label: "المستخدمون", icon: "users", permission: "users.view" },
          merchants,
          { href: `${base}/businesses`, label: "الأنشطة والمنتجات", icon: "layers", permission: "catalog.manage" },
          orders,
        ],
      },
      {
        title: "المالية",
        items: [
          payments,
          { href: `${base}/packages`, label: "الباقات والأسعار", icon: "star", permission: "settings.view" },
          { href: `${base}/settings#commissions`, label: "العمولات", icon: "percent", permission: "settings.view" },
          { href: `${base}/settings#delivery`, label: "رسوم التوصيل", icon: "truck", permission: "settings.view" },
          { href: `${base}/complaints`, label: "الشكاوى والاستردادات", icon: "flag", permission: "refunds.verify" },
        ],
      },
      {
        title: "المحتوى والنظام",
        items: [
          { href: `${base}/catalog`, label: "التصنيفات وأنواع النشاط", icon: "grid", permission: "catalog.manage" },
          { href: `${base}/offers`, label: "العروض", icon: "tag", permission: "orders.view" },
          { href: `${base}/settings`, label: "الإعدادات العامة", icon: "settings", permission: "settings.view" },
          { href: `${base}/notifications`, label: "الإشعارات", icon: "bell", permission: "settings.view" },
          { href: `${base}/audit`, label: "سجل العمليات", icon: "shield", permission: "audit.view" },
        ],
      },
    ],
    mobile: [home, merchants, orders, payments],
  };
}

/** Hide items the signed-in admin lacks permission for. Convenience only: pages and actions enforce on the server. */
export function filterNav(groups: NavGroup[], can: (permission: string) => boolean): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(i.permission)) }))
    .filter((g) => g.items.length > 0);
}
