import type { MetadataRoute } from "next";

// ملف الـ PWA Manifest - Next.js بيتعرف عليه تلقائيًا (اسمه "manifest.ts" جوه app/) وبيضيف
// <link rel="manifest"> لوحده من غير أي تعديل تاني - ده اللي بيخلي "إضافة للشاشة الرئيسية" على
// الموبايل تستخدم شعار وألوان ثابتة بدل ما تولّد أيقونة تلقائية (سكرين شوت مشوّه) زي ما كان بيحصل.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "جولد كوين",
    short_name: "جولد كوين",
    description: "نظام مبيعات ومخازن وحسابات وتجار - جولد كوين",
    start_url: "/",
    display: "standalone",
    background_color: "#14161c",
    theme_color: "#14161c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
