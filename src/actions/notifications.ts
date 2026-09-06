"use server";
import { db, schema } from "@/db";
import { eq, gte, and, sql } from "drizzle-orm";
import { can } from "@/lib/auth";
import { cairoStartOfDay } from "@/lib/time";

export type AlertItem = { label: string; count: number; href: string };

// ملخص تنبيهات خفيف لجرس الإشعارات - بيتحسب من غير ما يعمل كل استعلامات الداشبورد التقيلة
export async function getAlertsSummary(): Promise<AlertItem[]> {
  if (!(await can("dashboard.view"))) return [];

  const today = cairoStartOfDay(); // بتوقيت القاهرة مش UTC - نفس تصحيح الداشبورد
  const alerts: AlertItem[] = [];

  const [settingsRow] = await db.select().from(schema.settings);
  // Number.isFinite بدل الاعتماد على || بس - قيمة مخزّنة تالفة زي النص "NaN" كانت بتفشل Number()
  // وترجع NaN اللي هو falsy لكن يمرّ من عملية المقارنة sql`>= NaN` بشكل غير متوقع بدل ما يقع على القيمة الافتراضية
  const parsedThreshold = Number(settingsRow?.largeInvoiceAlert);
  const largeInvoiceThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 10000;
  const largeInvoices = await db
    .select({ id: schema.salesInvoices.id })
    .from(schema.salesInvoices)
    .where(and(gte(schema.salesInvoices.createdAt, today), sql`${schema.salesInvoices.total} >= ${largeInvoiceThreshold}`));
  if (largeInvoices.length > 0) alerts.push({ label: `${largeInvoices.length} فاتورة بمبلغ كبير اليوم`, count: largeInvoices.length, href: "/sales" });

  const customers = await db.select().from(schema.customers);
  const overLimit = customers.filter((c) => Number(c.creditLimit) > 0 && Number(c.balance) > Number(c.creditLimit));
  if (overLimit.length > 0) alerts.push({ label: `${overLimit.length} عميل تجاوز حد الائتمان`, count: overLimit.length, href: "/customers" });

  const pendingReturns = await db.select({ id: schema.returnRequests.id }).from(schema.returnRequests).where(eq(schema.returnRequests.status, "PENDING"));
  if (pendingReturns.length > 0) alerts.push({ label: `${pendingReturns.length} مرتجع قيد الموافقة`, count: pendingReturns.length, href: "/returns" });

  const products = await db.select({ id: schema.products.id, reorderPoint: schema.products.reorderPoint }).from(schema.products).where(eq(schema.products.active, true));
  const stockRows = await db.select({ productId: schema.stocks.productId, quantity: schema.stocks.quantity }).from(schema.stocks);
  const stocksByProduct = new Map<string, number>();
  for (const r of stockRows) stocksByProduct.set(r.productId, (stocksByProduct.get(r.productId) || 0) + r.quantity);
  const lowStockCount = products.filter((p) => (stocksByProduct.get(p.id) || 0) <= p.reorderPoint).length;
  if (lowStockCount > 0) alerts.push({ label: `${lowStockCount} منتج وصل لحد إعادة الطلب`, count: lowStockCount, href: "/products" });

  // أوردرات واقفة من غير حركة - قبل كده الأوردر ممكن يفضل "في الانتظار" أو "قيد التجهيز" لأيام
  // من غير ما حد ياخد باله، لأن مفيش تنبيه بيربط على المدة اللي الأوردر قاعدها في نفس الحالة
  const staleOrders = await db
    .select({ id: schema.orders.id, status: schema.orders.status, createdAt: schema.orders.createdAt, updatedAt: schema.orders.updatedAt })
    .from(schema.orders)
    .where(and(sql`${schema.orders.status} IN ('PENDING','CONFIRMED','PREPARING')`));
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const stalePending = staleOrders.filter((o) => o.status === "PENDING" && now - new Date(o.createdAt).getTime() > dayMs).length;
  const staleInProgress = staleOrders.filter((o) => o.status !== "PENDING" && now - new Date(o.updatedAt).getTime() > 2 * dayMs).length;
  if (stalePending > 0) alerts.push({ label: `${stalePending} أوردر لسه في الانتظار من غير تأكيد من أكتر من يوم`, count: stalePending, href: "/orders?status=PENDING" });
  if (staleInProgress > 0) alerts.push({ label: `${staleInProgress} أوردر واقف من غير شحن من أكتر من يومين`, count: staleInProgress, href: "/orders?status=PREPARING" });

  return alerts;
}
