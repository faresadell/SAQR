import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/merchant", "/driver", "/api", "/checkout", "/cart", "/settings", "/register", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
