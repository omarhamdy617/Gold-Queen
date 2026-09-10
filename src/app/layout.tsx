import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "جولد كوين",
  description: "نظام مبيعات ومخازن وحسابات وتجار - جولد كوين",
  // بيتحكم في الاسم اللي بيظهر تحت الأيقونة لما تتضاف للشاشة الرئيسية على آيفون (بدل رابط الموقع)
  appleWebApp: {
    title: "جولد كوين",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // لون شريط المتصفح/الحالة لما الموقع يتفتح من الأيقونة على الموبايل - نفس اللون الداكن
  // (--navy) المستخدم في الهيدر وباقي عناصر الواجهة الداكنة في السيستم كله
  themeColor: "#14161c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
