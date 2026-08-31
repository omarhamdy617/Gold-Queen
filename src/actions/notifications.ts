"use server";
import { db, schema } from "@/db";
import { eq, gte, and, sql } from "drizzle-orm";
import { can } from "@/lib/auth";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type AlertItem = { label: string; count: number; href: string };

// ملخص تنبيهات خفيف لجرس الإشعارات - بيتحسب من غير ما يعمل كل استعلامات الداشبورد التقيلة
export async function getAlertsSummary(): Promise<AlertItem[]> {
  if (!(await can("dashboard.view"))) return [];

  const today = startOfDay();
  const alerts: AlertItem[] = [];

  const [settingsRow] = await db.select().from(schema.settings);
  const largeInvoiceThreshold = Number(settingsRow?.largeInvoiceAlert || 10000);
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

  return alerts;
}
