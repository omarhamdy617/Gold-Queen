"use server";
import { db, schema } from "@/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { cairoStartOfMonth } from "@/lib/time";

// نفس معادلة الربح المستخدمة بالظبط في كارتي "إجمالي الربح" و"صافي الربح" في لوحة التحكم
// (src/actions/dashboard.ts) - عشان أي رقم ربح يظهر في أي شاشة في السيستم يبقى متطابق مع الباقي
// ومحدش يتلخبط إنه شايف رقمين مختلفين لنفس الفترة:
//   إجمالي الربح = مجموع (سعر البيع - تكلفة الوحدة وقت البيع) × الكمية لكل بنود الفواتير في الفترة
//                  ناقص نفس الحساب لأي بنود اتباعت وارتجعت (مرتجع بيع معتمد) في نفس الفترة
//   صافي الربح   = إجمالي الربح - كل المصروفات المسجلة في نفس الفترة
// وده رياضيًا نفس "إجمالي المبيعات - تكلفة البضاعة المباعة - المصروفات" بالظبط.
export async function getProfitSummary(from: Date, to: Date) {
  await requirePermission("reports.view");

  const salesRows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)` })
    .from(schema.salesInvoices)
    .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)));
  const salesTotal = Number(salesRows[0]?.total || 0);

  const grossProfitRows = await db
    .select({
      profit: sql<string>`coalesce(sum((${schema.salesInvoiceItems.unitPrice} - ${schema.salesInvoiceItems.unitCost}) * ${schema.salesInvoiceItems.quantity}), 0)`,
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
    .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)));

  const approvedReturnProfitRows = await db
    .select({
      profit: sql<string>`coalesce(sum((${schema.returnItems.unitPrice} - coalesce(${schema.salesInvoiceItems.unitCost}, ${schema.products.avgCost}, 0)) * ${schema.returnItems.quantity}), 0)`,
    })
    .from(schema.returnItems)
    .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
    .leftJoin(schema.salesInvoiceItems, eq(schema.returnItems.invoiceItemId, schema.salesInvoiceItems.id))
    .leftJoin(schema.products, eq(schema.returnItems.productId, schema.products.id))
    .where(
      and(
        eq(schema.returnRequests.kind, "SALE_RETURN"),
        eq(schema.returnRequests.status, "APPROVED"),
        gte(schema.returnRequests.approvedAt, from),
        lte(schema.returnRequests.approvedAt, to)
      )
    );

  const grossProfit = Number(grossProfitRows[0]?.profit || 0) - Number(approvedReturnProfitRows[0]?.profit || 0);

  const expensesRows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.expenses.amount}), 0)` })
    .from(schema.expenses)
    .where(and(gte(schema.expenses.createdAt, from), lte(schema.expenses.createdAt, to)));
  const expensesTotal = Number(expensesRows[0]?.total || 0);

  return { salesTotal, grossProfit, expensesTotal, netProfit: grossProfit - expensesTotal };
}

// ربح كل فترة مقسّم على مستوى المنتج - عشان تعرف مش بس "الربح كام" لكن "جاي منين بالظبط"
export async function getProfitBreakdownByProduct(from: Date, to: Date) {
  await requirePermission("reports.view");

  const soldRows = await db
    .select({
      productId: schema.salesInvoiceItems.productId,
      name: schema.products.name,
      qty: sql<string>`coalesce(sum(${schema.salesInvoiceItems.quantity}), 0)`,
      revenue: sql<string>`coalesce(sum(${schema.salesInvoiceItems.unitPrice} * ${schema.salesInvoiceItems.quantity}), 0)`,
      profit: sql<string>`coalesce(sum((${schema.salesInvoiceItems.unitPrice} - ${schema.salesInvoiceItems.unitCost}) * ${schema.salesInvoiceItems.quantity}), 0)`,
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
    .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
    .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
    .groupBy(schema.salesInvoiceItems.productId, schema.products.name);

  const returnRows = await db
    .select({
      productId: schema.returnItems.productId,
      qty: sql<string>`coalesce(sum(${schema.returnItems.quantity}), 0)`,
      revenue: sql<string>`coalesce(sum(${schema.returnItems.unitPrice} * ${schema.returnItems.quantity}), 0)`,
      profit: sql<string>`coalesce(sum((${schema.returnItems.unitPrice} - coalesce(${schema.salesInvoiceItems.unitCost}, ${schema.products.avgCost}, 0)) * ${schema.returnItems.quantity}), 0)`,
    })
    .from(schema.returnItems)
    .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
    .leftJoin(schema.salesInvoiceItems, eq(schema.returnItems.invoiceItemId, schema.salesInvoiceItems.id))
    .leftJoin(schema.products, eq(schema.returnItems.productId, schema.products.id))
    .where(
      and(
        eq(schema.returnRequests.kind, "SALE_RETURN"),
        eq(schema.returnRequests.status, "APPROVED"),
        gte(schema.returnRequests.approvedAt, from),
        lte(schema.returnRequests.approvedAt, to)
      )
    )
    .groupBy(schema.returnItems.productId);

  const map = new Map<string, { productId: string; name: string; qty: number; revenue: number; profit: number }>();
  for (const r of soldRows) {
    map.set(r.productId, { productId: r.productId, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue), profit: Number(r.profit) });
  }
  // بنخصم المرتجعات من نفس صف المنتج اللي اتباع بيه في الفترة دي - لو صنف اترجع في الفترة دي بس
  // اتباع في فترة سابقة (نادر ومش متوقع في الاستخدام العادي)، مش هيظهر له صف مستقل هنا لأنه مش
  // "مباع" فعليًا في الفترة المعروضة أصلًا
  for (const r of returnRows) {
    const cur = map.get(r.productId);
    if (cur) {
      cur.qty -= Number(r.qty);
      cur.revenue -= Number(r.revenue);
      cur.profit -= Number(r.profit);
    }
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

function monthLabelAr(d: Date) {
  return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric", timeZone: "Africa/Cairo" });
}

// أداء آخر N شهر (افتراضيًا 12) - كل شهر بيتحسب بنفس حدود "بداية الشهر" المستخدمة في لوحة
// التحكم (بتوقيت القاهرة، نفس دالة cairoStartOfMonth) عشان أي شهر يتقارن صح مع الرقم اللي
// كان ظاهر ليه وقتها في الداشبورد - الشهر الحالي (index 0) بيوقف عند "دلوقتي" مش آخر يوم فيه
export async function getMonthlyPerformance(monthsBack = 12) {
  await requirePermission("reports.view");

  const ranges: { label: string; start: Date; end: Date }[] = [];
  let periodEnd = new Date();
  let periodStart = cairoStartOfMonth();
  for (let i = 0; i < monthsBack; i++) {
    ranges.push({ label: monthLabelAr(periodStart), start: periodStart, end: periodEnd });
    periodEnd = new Date(periodStart.getTime() - 1);
    periodStart = cairoStartOfMonth(periodEnd);
  }

  const results = await Promise.all(ranges.map((r) => getProfitSummary(r.start, r.end)));
  return ranges.map((r, i) => ({ label: r.label, ...results[i] }));
}
