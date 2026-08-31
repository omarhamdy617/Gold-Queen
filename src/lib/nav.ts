export type NavItem = { href: string; label: string; perm?: string; icon: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "لوحة التحكم", perm: "dashboard.view", icon: "📊" },
  { href: "/sales/new", label: "فاتورة بيع جديدة", perm: "sales.create", icon: "🧾" },
  { href: "/sales", label: "الفواتير", perm: "sales.view", icon: "📄" },
  { href: "/quotes", label: "عروض الأسعار", perm: "quotes.manage", icon: "📝" },
  { href: "/products", label: "المنتجات والمخزون", perm: "products.view", icon: "📦" },
  { href: "/products/barcode", label: "طباعة الباركود", perm: "products.barcode.print", icon: "🏷️" },
  { href: "/purchases", label: "المشتريات", perm: "purchases.view", icon: "🛒" },
  { href: "/suppliers", label: "الموردين", perm: "purchases.view", icon: "🏭" },
  { href: "/transfers", label: "التحويلات الداخلية", perm: "transfers.create", icon: "🔁" },
  { href: "/customers", label: "العملاء والتجار", perm: "customers.manage", icon: "👥" },
  { href: "/consignments", label: "العهدة", perm: "consignments.manage", icon: "🎒" },
  { href: "/orders", label: "الأوردرات والشحن", perm: "orders.manage", icon: "🚚" },
  { href: "/returns", label: "المرتجعات", perm: "returns.create", icon: "↩️" },
  { href: "/cash", label: "الخزائن", perm: "cash.view", icon: "💰" },
  { href: "/expenses", label: "المصروفات", perm: "expenses.manage", icon: "💸" },
  { href: "/finance", label: "الوضع المالي", perm: "finance.view", icon: "📈" },
  { href: "/reports", label: "الأكثر مبيعًا", perm: "reports.view", icon: "🏆" },
  { href: "/audit", label: "سجل التدقيق", perm: "audit.view", icon: "🔒" },
  { href: "/settings/users", label: "المستخدمون والصلاحيات", perm: "users.manage", icon: "🧑‍💼" },
  { href: "/settings", label: "الإعدادات العامة", perm: "settings.manage", icon: "⚙️" },
];
