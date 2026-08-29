"use server";
import { db, schema } from "@/db";
import { eq, gte, lte, and, sql, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }

export async function getDashboardData() {
  await requirePermission("dashboard.view");

  const today = startOfDay();
  const monthStart = startOfMonth();
  const prevMonthStart = startOfMonth(new Date(monthStart.getTime() - 1));
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

  const grossProfit = Number(grossProfitRows[0]?.profit || 0);
  const netProfit = grossProfit - Number(expensesMonth[0]?.total || 0);

  const drawers = await db.select().from(schema.cashDrawers);
  const totalCash = drawers.reduce((s, d) => s + Number(d.balance), 0);

  const customers = await db.select().from(schema.customers);
  const totalReceivable = customers.reduce((s, c) => s + Math.max(Number(c.balance), 0), 0);

  const suppliers = await db.select().from(schema.suppliers);
  const totalPayable = suppliers.reduce((s, s2) => s + Number(s2.balance), 0);

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

  // أداء الموظفين بالاسم هذا الشهر
  const perf = await db
    .select({
      userId: schema.salesInvoices.createdById,
      userName: schema.users.fullName,
      salesCount: sql<number>`count(*)`,
      salesTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
    })
    .from(schema.salesInvoices)
    .innerJoin(schema.users, eq(schema.salesInvoices.createdById, schema.users.id))
    .where(gte(schema.salesInvoices.createdAt, monthStart))
    .groupBy(schema.salesInvoices.createdById, schema.users.fullName);

  const collectionsPerf = await db
    .select({
      userId: schema.collections.createdById,
      total: sql<string>`coalesce(sum(${schema.collections.amount}), 0)`,
    })
    .from(schema.collections)
    .where(gte(schema.collections.createdAt, monthStart))
    .groupBy(schema.collections.createdById);
  const collMap = new Map(collectionsPerf.map((c) => [c.userId, Number(c.total)]));

  const employeePerf = perf.map((p) => ({ ...p, collections: collMap.get(p.userId) || 0 }));

  const [settingsRow] = await db.select().from(schema.settings);
  const largeInvoiceThreshold = Number(settingsRow?.largeInvoiceAlert || 10000);
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
