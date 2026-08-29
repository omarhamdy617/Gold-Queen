// كل مفاتيح الصلاحيات المتاحة في السيستم - كل شاشة/إجراء له مفتاح مستقل
// الأدمن دايمًا عنده كل حاجة تلقائيًا (bypass) - باقي الأدوار بتتحدد صلاحياتها بالتفصيل هنا

export const PERMISSION_GROUPS: { group: string; perms: { key: string; label: string }[] }[] = [
  {
    group: "الداشبورد",
    perms: [{ key: "dashboard.view", label: "عرض لوحة التحكم" }],
  },
  {
    group: "المستخدمين والصلاحيات",
    perms: [
      { key: "users.manage", label: "إدارة المستخدمين والصلاحيات" },
    ],
  },
  {
    group: "الخزائن",
    perms: [
      { key: "cash.view", label: "عرض الخزائن" },
      { key: "cash.adjust", label: "تسوية يدوية للخزينة" },
    ],
  },
  {
    group: "المنتجات والمخزون",
    perms: [
      { key: "products.view", label: "عرض المنتجات" },
      { key: "products.manage", label: "إضافة/تعديل المنتجات" },
      { key: "products.barcode.print", label: "طباعة الباركود" },
      { key: "inventory.view", label: "عرض تقارير المخزون" },
    ],
  },
  {
    group: "المشتريات والتحويلات",
    perms: [
      { key: "purchases.create", label: "تسجيل مشتريات" },
      { key: "purchases.view", label: "عرض المشتريات" },
      { key: "transfers.create", label: "تحويل بضاعة بين المحل والمخزن" },
    ],
  },
  {
    group: "المبيعات وعروض الأسعار",
    perms: [
      { key: "sales.create", label: "إنشاء فاتورة بيع" },
      { key: "sales.view", label: "عرض الفواتير" },
      { key: "sales.edit_old", label: "تعديل/حذف فواتير قديمة" },
      { key: "sales.discount.large", label: "منح خصم كبير" },
      { key: "quotes.manage", label: "عروض الأسعار" },
    ],
  },
  {
    group: "العملاء والتجار",
    perms: [
      { key: "customers.manage", label: "إدارة العملاء والتجار" },
      { key: "customers.statement", label: "كشف حساب وتصدير" },
      { key: "consignments.manage", label: "إدارة العهدة" },
    ],
  },
  {
    group: "الأوردرات والشحن",
    perms: [
      { key: "orders.manage", label: "إدارة الأوردرات والشحن" },
    ],
  },
  {
    group: "المرتجعات",
    perms: [
      { key: "returns.create", label: "تسجيل مرتجع" },
      { key: "returns.approve", label: "اعتماد المرتجعات" },
    ],
  },
  {
    group: "المصروفات",
    perms: [{ key: "expenses.manage", label: "تسجيل المصروفات" }],
  },
  {
    group: "التقارير والوضع المالي",
    perms: [
      { key: "reports.view", label: "عرض التقارير" },
      { key: "finance.view", label: "الوضع المالي الشامل" },
      { key: "audit.view", label: "سجل التدقيق" },
    ],
  },
  {
    group: "الإعدادات",
    perms: [{ key: "settings.manage", label: "الإعدادات العامة" }],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSION_KEYS, // أدمن: كل حاجة دايمًا
  ACCOUNTANT: [
    "dashboard.view",
    "cash.view",
    "products.view",
    "inventory.view",
    "purchases.view",
    "sales.view",
    "customers.manage",
    "customers.statement",
    "expenses.manage",
    "reports.view",
    "finance.view",
    "quotes.manage",
  ],
  WAREHOUSE_KEEPER: [
    "dashboard.view",
    "products.view",
    "products.manage",
    "products.barcode.print",
    "inventory.view",
    "purchases.create",
    "purchases.view",
    "transfers.create",
    "orders.manage",
  ],
  CASHIER: [
    "dashboard.view",
    "products.view",
    "sales.create",
    "sales.view",
    "quotes.manage",
    "customers.manage",
    "returns.create",
    "orders.manage",
    "cash.view",
  ],
};
