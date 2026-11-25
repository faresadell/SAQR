import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/merchant", "/driver", "/api", "/checkout", "/cart", "/settings", "/register", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
