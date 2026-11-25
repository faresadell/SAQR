import type { Metadata, Viewport } from "next";
import { Cairo, Inter } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { ToastProvider } from "@/components/ui/toast";
import { env } from "@/lib/env";
import { CartProvider } from "@/features/cart/cart-provider";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const SITE_DESCRIPTION = "صقر: اطلب من محلاتك القريبة، وتابع طلبك لحد باب بيتك. مطاعم وسوبر ماركت وعطارة وأكتر في مكان واحد.";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  openGraph: { type: "website", locale: "ar_EG", siteName: "صقر", title: "صقر", description: SITE_DESCRIPTION, images: [{ url: "/brand/saqr-mark.png", alt: "شعار صقر" }] },
  twitter: { card: "summary", title: "صقر", description: SITE_DESCRIPTION, images: ["/brand/saqr-mark.png"] },
  title: { default: "صقر", template: "%s | صقر" },
  description: SITE_DESCRIPTION,
  applicationName: "صقر",
  appleWebApp: { capable: true, title: "صقر", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B1530",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${inter.variable}`}>
      <body>
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
