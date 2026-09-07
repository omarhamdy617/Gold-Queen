"use server";
import { db, schema } from "@/db";
import { eq, gte, lte, and, sql, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { cairoStartOfDay, cairoStartOfMonth } from "@/lib/time";
import { getTotalSuppliersPayable } from "@/actions/purchases";

export async function getDashboardData() {
  await requirePermission("dashboard.view");

  // بتوقيت القاهرة مش توقيت السيرفر (UTC) - وإلا بيع حصل الساعة 12:30 بالليل بتوقيت مصر (لسه
  // "النهارده" بالنسبة للمحل) كان ممكن يتحسب "إمبارح"، وقريب من نهاية الشهر مبيعة يوم 1 كانت ممكن
  // تتحسب على الشهر اللي فات.
  const today = cairoStartOfDay();
  const monthStart = cairoStartOfMonth();
  const prevMonthStart = cairoStartOfMonth(new Date(monthStart.getTime() - 1));
  const prevMonthEnd = new Date(monthStart.getTime() - 1);

  const [salesToday, salesMonth, salesPrevMonth] = await Promise.all([
    sumInvoices(today, new Date()),
    sumInvoices(monthStart, new Date()),
    sumInvoices(prevMonthStart, prevMonthEnd),
  ]);

  const expensesMonth = await db
    .select({ total: sql<string>`coalesce(sum(${schema.expenses.amount}), 0)` })
    .from(schema.expenses)
    .where(gte(schema.expenses.createdAt, monthStart));

  // ربح تقديري = مجموع (سعر البيع - التكلفة) للفواتير هذا الشهر - المصروفات
  const grossProfitRows = await db
    .select({
      profit: sql<string>`coalesce(sum((${schema.salesInvoiceItems.unitPrice} - ${schema.salesInvoiceItems.unitCost}) * ${schema.salesInvoiceItems.quantity}), 0)`,
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
    .where(gte(schema.salesInvoices.createdAt, monthStart));

  // المرتجعات المعتمدة (SALE_RETURN) كانت بتتجاهل تمامًا من حساب الربح - يعني بيع اتباع واترجع
  // بعدين في نفس الشهر كان لسه بيظهر ربحه كامل وكأنه ماترجعش خالص. بنطرح هنا صافي ربح البنود
  // المرتجعة (سعر البيع اللي كان مسجل - تكلفة الوحدة وقت البيع الأصلي، من salesInvoiceItems لو
  // البند مرتبط ببند فاتورة حقيقي، وإلا متوسط التكلفة الحالي كتقريب).
  const approvedReturnProfitRows = await db
    .select({
      profit: sql<string>`coalesce(sum((${schema.returnItems.unitPrice} - coalesce(${schema.salesInvoiceItems.unitCost}, ${schema.products.avgCost}, 0)) * ${schema.returnItems.quantity}), 0)`,
    })
    .from(schema.returnItems)
    .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
    .leftJoin(schema.salesInvoiceItems, eq(schema.returnItems.invoiceItemId, schema.salesInvoiceItems.id))
    .leftJoin(schema.products, eq(schema.returnItems.productId, schema.products.id))
    .where(and(eq(schema.returnRequests.kind, "SALE_RETURN"), eq(schema.returnRequests.status, "APPROVED"), gte(schema.returnRequests.approvedAt, monthStart)));

  const grossProfit = Number(grossProfitRows[0]?.profit || 0) - Number(approvedReturnProfitRows[0]?.profit || 0);
  const netProfit = grossProfit - Number(expensesMonth[0]?.total || 0);

  const drawers = await db.select().from(schema.cashDrawers);
  const totalCash = drawers.reduce((s, d) => s + Number(d.balance), 0);

  const customers = await db.select().from(schema.customers);
  const totalReceivable = customers.reduce((s, c) => s + Math.max(Number(c.balance), 0), 0);

  // بنستخدم نفس دالة "المستحق للموردين" المستخدمة في كل شاشة تانية (شاشة الموردين، الوضع المالي) -
  // قبل كده كل شاشة كانت بتحسبه بطريقة شوية مختلفة عن التانية فكانت الأرقام مش متطابقة بين الشاشات.
  const totalPayable = await getTotalSuppliersPayable();

  const stockRows = await db
    .select({ quantity: schema.stocks.quantity, avgCost: schema.products.avgCost })
    .from(schema.stocks)
    .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id));
  const inventoryValue = stockRows.reduce((s, r) => s + r.quantity * Number(r.avgCost), 0);

  const products = await db.select().from(schema.products).where(eq(schema.products.active, true));
  const stocksByProduct = new Map<string, number>();
  for (const r of await db.select().from(schema.stocks)) {
    stocksByProduct.set(r.productId, (stocksByProduct.get(r.productId) || 0) + r.quantity);
  }
  const lowStock = products.filter((p) => (stocksByProduct.get(p.id) || 0) <= p.reorderPoint);

  // أداء الموظفين بالاسم هذا الشهر - بيتحسب على soldById (البايع الفعلي) مش createdById (اللي سجّل
  // الفاتورة في الشاشة) عشان في حالة "بيع من عهدة الموظف" البايع الحقيقي هو صاحب العهدة حتى لو
  // أدمن/محاسب هو اللي سجّل عملية التسوية. في الفواتير العادية الاتنين نفس الشخص أصلًا.
  const perf = await db
    .select({
      userId: schema.salesInvoices.soldById,
      userName: schema.users.fullName,
      salesCount: sql<number>`count(*)`,
      salesTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
    })
    .from(schema.salesInvoices)
    .innerJoin(schema.users, eq(schema.salesInvoices.soldById, schema.users.id))
    .where(gte(schema.salesInvoices.createdAt, monthStart))
    .groupBy(schema.salesInvoices.soldById, schema.users.fullName);

  const collectionsPerf = await db
    .select({
      userId: schema.collections.createdById,
      userName: schema.users.fullName,
      total: sql<string>`coalesce(sum(${schema.collections.amount}), 0)`,
    })
    .from(schema.collections)
    .innerJoin(schema.users, eq(schema.collections.createdById, schema.users.id))
    .where(gte(schema.collections.createdAt, monthStart))
    .groupBy(schema.collections.createdById, schema.users.fullName);
  const collMap = new Map(collectionsPerf.map((c) => [c.userId, Number(c.total)]));

  // قبل كده الموظفين اللي شغلهم تحصيل بس (بلا أي فواتير مبيعات باسمهم) كانوا بيختفوا من اللستة
  // خالص - القائمة الأساسية كانت مبنية على salesInvoices بس، وأي بيانات تحصيل ليهم في collMap
  // كانت بتتحسب بس متعرضش لعدم وجود صف أصلًا. دلوقتي بنبني اللستة من اتحاد الاتنين مع بعض.
  const perfMap = new Map(perf.map((p) => [p.userId, p]));
  for (const c of collectionsPerf) {
    if (!perfMap.has(c.userId)) {
      perfMap.set(c.userId, { userId: c.userId, userName: c.userName, salesCount: 0, salesTotal: "0" });
    }
  }
  // كلا الاستعلامين معمول عليهم innerJoin مع users، فـ userId فعليًا مش هيبقى null أبدًا هنا - بس
  // النوع في الـ schema بيسمح بـ null (العمود nullable أصلًا) فبنأكد للتايبسكريبت بـ "!" إن هي مش فاضية
  const employeePerf = [...perfMap.values()].map((p) => ({ ...p, collections: collMap.get(p.userId!) || 0 }));

  const [settingsRow] = await db.select().from(schema.settings);
  const parsedThreshold = Number(settingsRow?.largeInvoiceAlert);
  const largeInvoiceThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 10000;
  const largeInvoices = await db
    .select()
    .from(schema.salesInvoices)
    .where(and(gte(schema.salesInvoices.createdAt, today), sql`${schema.salesInvoices.total} >= ${largeInvoiceThreshold}`));

  const pendingReturns = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.status, "PENDING"));

  const overLimitCustomers = customers.filter((c) => Number(c.creditLimit) > 0 && Number(c.balance) > Number(c.creditLimit));

  return {
    salesToday,
    salesMonth,
    salesPrevMonth,
    salesChangePct: salesPrevMonth > 0 ? ((salesMonth - salesPrevMonth) / salesPrevMonth) * 100 : null,
    grossProfit,
    netProfit,
    totalCash,
    totalReceivable,
    totalPayable,
    inventoryValue,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock.slice(0, 10),
    employeePerf,
    largeInvoices,
    pendingReturnsCount: pendingReturns.length,
    overLimitCustomers,
  };
}

async function sumInvoices(from: Date, to: Date) {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)` })
    .from(schema.salesInvoices)
    .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)));
  return Number(rows[0]?.total || 0);
}
