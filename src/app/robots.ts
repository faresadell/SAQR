import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/merchant", "/driver", "/api", "/checkout", "/cart", "/settings", "/register", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
