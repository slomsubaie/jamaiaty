import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { t } from "@jamaiah/shared";
import { Providers } from "./providers";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: t.appName,
  description: "منصة إدارة وأرشفة جمعيات الملاك",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
