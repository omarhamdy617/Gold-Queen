import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "جولد كوين",
  description: "نظام مبيعات ومخازن وحسابات وتجار - جولد كوين",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
