"use server";
// ==========================================================================
// لوحة تحليلات الأعمال الشاملة (Business Management Dashboard) - دفعة 16
// ==========================================================================
// كل دالة هنا بترجع رقم ثابت من الاستعلامات (Fixed query count) بغض النظر عن طول الفترة المختارة
// أو عدد الصفوف - نفس القاعدة المتبعة في كل السيستم من بعد حادثة توقف الموقع في 8 سبتمبر (شوف تعليق
// getMonthlyPerformance في actions/reports.ts). ممنوع أي loop بيعمل استعلام لكل يوم/منتج/موظف.
//
// كل دالة هنا ملفوفة في try/catch وبترجع toActionError بدل ما ترمي استثناء خام - عشان لو حد اتمنحله
// صلاحية "analytics.view" بس من غير باقي صلاحيات الأقسام اللي بتتقرا منها بعض الدوال (زي reports.view
// لصفحة الربح، أو inventory.view لتنبيهات المخزون)، يشوف رسالة عربية واضحة بدل صفحة تتهد بالكامل.
// الأدمن (البايباس الافتراضي) عنده كل الصلاحيات دايمًا فمش هيواجه المشكلة دي خالص.
import { db, schema } from "@/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { toActionError, isActionError } from "@/lib/actionError";
import { resolvePeriod, type PeriodKey } from "@/lib/period";
import { getTotalSuppliersPayable } from "@/actions/purchases";
import { getProfitSummary, getProfitBreakdownByProduct, getMonthlyPerformance } from "@/actions/reports";
import { getReorderAlerts, bestSellers } from "@/actions/products";
import { getConsignmentSalesLeaderboard } from "@/actions/consignments";
import { getOrderStats } from "@/actions/orders";

// -------------------- أدوات مشتركة --------------------

// نسبة التغيير بين رقمين - null لما مفيش أساس للمقارنة أصلًا (الفترة اللي قبل كانت صفر) عشان
// الواجهة تعرض "بيانات مش كافية للمقارنة" بدل رقم وهمي زي "+∞%" أو حتى "0%" المضلل
function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function withChange(cur: number, prev: number) {
  return { current: cur, previous: prev, changePct: pctChange(cur, prev) };
}

async function period(key: PeriodKey, from?: string, to?: string) {
  await requirePermission("analytics.view");
  return resolvePeriod(key, from, to);
}

// -------------------- إيراد حسب القناة (مصدر الأوردر) --------------------
// مستخدمة في تاب "تحليل المبيعات" وتاب "التسويق" مع بعض (نفس الرقم بالظبط) - عشان القناة اللي
// جايالك منها فلوس أكتر تبقى واحدة معروضة بشكل ثابت في الصفحتين، مش نسختين مختلفتين بالغلط
async function revenueByChannel(from: Date, to: Date, prevFrom: Date, prevTo: Date) {
  const rows = await db
    .select({
      sourceId: schema.salesInvoices.source,
      sourceName: schema.orderSources.name,
      curTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()}), 0)`,
      curCount: sql<number>`count(*) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()})`,
      prevTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}) filter (where ${schema.salesInvoices.createdAt} < ${from.toISOString()}), 0)`,
    })
    .from(schema.salesInvoices)
    .innerJoin(schema.orderSources, eq(schema.salesInvoices.source, schema.orderSources.id))
    .where(and(gte(schema.salesInvoices.createdAt, prevFrom), lte(schema.salesInvoices.createdAt, to)))
    .groupBy(schema.salesInvoices.source, schema.orderSources.name)
    .orderBy(desc(sql`coalesce(sum(${schema.salesInvoices.total}) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()}), 0)`));

  return rows.map((r) => ({
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    current: Number(r.curTotal),
    currentCount: Number(r.curCount),
    previous: Number(r.prevTotal),
    changePct: pctChange(Number(r.curTotal), Number(r.prevTotal)),
  }));
}

// -------------------- مصروفات حسب الفئة (مقارنة) --------------------
// مستخدمة في تنبيهات "طفرة مصروفات" (Overview) وفي تفصيل تاب "الأرباح والوضع المالي"
async function expensesByCategoryCmp(from: Date, to: Date, prevFrom: Date) {
  const rows = await db
    .select({
      categoryId: schema.expenses.categoryId,
      categoryName: schema.expenseCategories.name,
      curTotal: sql<string>`coalesce(sum(${schema.expenses.amount}) filter (where ${schema.expenses.createdAt} >= ${from.toISOString()}), 0)`,
      prevTotal: sql<string>`coalesce(sum(${schema.expenses.amount}) filter (where ${schema.expenses.createdAt} < ${from.toISOString()}), 0)`,
    })
    .from(schema.expenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .where(and(gte(schema.expenses.createdAt, prevFrom), lte(schema.expenses.createdAt, to)))
    .groupBy(schema.expenses.categoryId, schema.expenseCategories.name);

  return rows
    .map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, current: Number(r.curTotal), previous: Number(r.prevTotal), changePct: pctChange(Number(r.curTotal), Number(r.prevTotal)) }))
    .sort((a, b) => b.current - a.current);
}

// ==========================================================================
// أ) نظرة تنفيذية عامة: المؤشرات الرئيسية (Executive KPIs) + التنبيهات والفرص - القسم الوحيد اللي
// بيتحمّل تلقائيًا لحظة فتح الصفحة (الباقي كله تابات بتتحمّل عند الفتح بس - شوف AnalyticsTabs)
// ==========================================================================
export async function getManagementOverview(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom, label, prevLabel } = await period(periodKey, customFrom, customTo);

    const since60 = new Date(Date.now() - 60 * 86400000);

    // ⚠️ رجعنا هنا لاستعلامات واحد ورا التاني (مش Promise.all) بعد عطل حقيقي حصل في الموقع كله يوم
    // 10 سبتمبر بعد ما اتجربت نسخة Promise.all: فتح صفحة التحليلات كان بيبعت الـ12 استعلام دول مرة
    // واحدة مع بعض، وده كان بياخد أكتر من عدد الاتصالات المتاحة فعليًا لقاعدة البيانات (خصوصًا إن
    // الاتصال بيعدي على مجمّع Supabase - PgBouncer - مش قاعدة البيانات مباشرة، ومساحته أصغر من
    // max:10 المحلي) فكان بيعلّق لحد ما Vercel يقفل الطلب بعد 300 ثانية (504) - نفس فئة عطل 8
    // سبتمبر بالظبط بس بسبب صفحة مختلفة. عدد الاستعلامات المرسلة لسه ثابت زي ما هو (12) - الفرق إن
    // كل استعلام بياخد اتصاله ويسيبه قبل ما اللي بعده يبدأ، بدل ما الـ12 يحجزوا اتصال في نفس اللحظة.
    const [salesCmp] = await db
      .select({
        curTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()}), 0)`,
        curCount: sql<number>`count(*) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()})`,
        prevTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}) filter (where ${schema.salesInvoices.createdAt} < ${from.toISOString()}), 0)`,
        prevCount: sql<number>`count(*) filter (where ${schema.salesInvoices.createdAt} < ${from.toISOString()})`,
      })
      .from(schema.salesInvoices)
      .where(and(gte(schema.salesInvoices.createdAt, prevFrom), lte(schema.salesInvoices.createdAt, to)));

    const [profitCmp] = await db
      .select({
        curProfit: sql<string>`coalesce(sum((${schema.salesInvoiceItems.unitPrice} - ${schema.salesInvoiceItems.unitCost}) * ${schema.salesInvoiceItems.quantity}) filter (where ${schema.salesInvoices.createdAt} >= ${from.toISOString()}), 0)`,
        prevProfit: sql<string>`coalesce(sum((${schema.salesInvoiceItems.unitPrice} - ${schema.salesInvoiceItems.unitCost}) * ${schema.salesInvoiceItems.quantity}) filter (where ${schema.salesInvoices.createdAt} < ${from.toISOString()}), 0)`,
      })
      .from(schema.salesInvoiceItems)
      .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
      .where(and(gte(schema.salesInvoices.createdAt, prevFrom), lte(schema.salesInvoices.createdAt, to)));

    const [returnProfitCmp] = await db
      .select({
        curProfit: sql<string>`coalesce(sum((${schema.returnItems.unitPrice} - coalesce(${schema.salesInvoiceItems.unitCost}, ${schema.products.avgCost}, 0)) * ${schema.returnItems.quantity}) filter (where ${schema.returnRequests.approvedAt} >= ${from.toISOString()}), 0)`,
        prevProfit: sql<string>`coalesce(sum((${schema.returnItems.unitPrice} - coalesce(${schema.salesInvoiceItems.unitCost}, ${schema.products.avgCost}, 0)) * ${schema.returnItems.quantity}) filter (where ${schema.returnRequests.approvedAt} < ${from.toISOString()}), 0)`,
      })
      .from(schema.returnItems)
      .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
      .leftJoin(schema.salesInvoiceItems, eq(schema.returnItems.invoiceItemId, schema.salesInvoiceItems.id))
      .leftJoin(schema.products, eq(schema.returnItems.productId, schema.products.id))
      .where(
        and(
          eq(schema.returnRequests.kind, "SALE_RETURN"),
          eq(schema.returnRequests.status, "APPROVED"),
          gte(schema.returnRequests.approvedAt, prevFrom),
          lte(schema.returnRequests.approvedAt, to)
        )
      );

    const [expenseCmp] = await db
      .select({
        curTotal: sql<string>`coalesce(sum(${schema.expenses.amount}) filter (where ${schema.expenses.createdAt} >= ${from.toISOString()}), 0)`,
        prevTotal: sql<string>`coalesce(sum(${schema.expenses.amount}) filter (where ${schema.expenses.createdAt} < ${from.toISOString()}), 0)`,
      })
      .from(schema.expenses)
      .where(and(gte(schema.expenses.createdAt, prevFrom), lte(schema.expenses.createdAt, to)));

    const expenseCategories = await expensesByCategoryCmp(from, to, prevFrom);
    const customers = await db.select().from(schema.customers);
    // نفس دالة "المستحق للموردين" المستخدمة في كل شاشة تانية في السيستم (الداشبورد، الوضع المالي،
    // شاشة الموردين) - عشان الرقم هنا يفضل متطابق معاهم دايمًا (نفس درس batch سابق في finance.ts)
    const totalPayable = await getTotalSuppliersPayable();
    const drawers = await db.select().from(schema.cashDrawers);
    const stockRows = await db
      .select({
        productId: schema.stocks.productId,
        productName: schema.products.name,
        quantity: schema.stocks.quantity,
        avgCost: schema.products.avgCost,
        reorderPoint: schema.products.reorderPoint,
        active: schema.products.active,
      })
      .from(schema.stocks)
      .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id));
    const soldRows60 = await db
      .select({ productId: schema.salesInvoiceItems.productId, qty: sql<number>`sum(${schema.salesInvoiceItems.quantity})` })
      .from(schema.salesInvoiceItems)
      .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
      .where(gte(schema.salesInvoices.createdAt, since60))
      .groupBy(schema.salesInvoiceItems.productId);
    const pendingReturnsRows = await db
      .select({ id: schema.returnRequests.id })
      .from(schema.returnRequests)
      .where(eq(schema.returnRequests.status, "PENDING"));
    const consignmentsRows = await db.select().from(schema.consignments).where(eq(schema.consignments.active, true));

    const totalReceivable = customers.reduce((s, c) => s + Math.max(Number(c.balance), 0), 0);
    const overLimitCustomers = customers.filter((c) => Number(c.creditLimit) > 0 && Number(c.balance) > Number(c.creditLimit));
    const totalCash = drawers.reduce((s, d) => s + Number(d.balance), 0);

    const byProduct = new Map<string, { name: string; qty: number; avgCost: number; reorderPoint: number; active: boolean }>();
    for (const r of stockRows) {
      const cur = byProduct.get(r.productId) || { name: r.productName, qty: 0, avgCost: Number(r.avgCost), reorderPoint: r.reorderPoint, active: r.active };
      cur.qty += r.quantity;
      byProduct.set(r.productId, cur);
    }
    const inventoryValue = [...byProduct.values()].reduce((s, p) => s + p.qty * p.avgCost, 0);
    const lowStockList = [...byProduct.entries()].filter(([, p]) => p.active && p.qty <= p.reorderPoint);

    const sold60Map = new Map(soldRows60.map((r) => [r.productId, Number(r.qty)]));

    const deadStock = [...byProduct.entries()]
      .filter(([id, p]) => p.active && p.qty > 0 && !((sold60Map.get(id) || 0) > 0))
      .map(([id, p]) => ({ productId: id, name: p.name, qty: p.qty, value: p.qty * p.avgCost }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const deadStockValue = [...byProduct.entries()]
      .filter(([id, p]) => p.active && p.qty > 0 && !((sold60Map.get(id) || 0) > 0))
      .reduce((s, [, p]) => s + p.qty * p.avgCost, 0);

    const criticalLowStock = lowStockList
      .map(([id, p]) => {
        const dailyRate = (sold60Map.get(id) || 0) / 60;
        const daysLeft = dailyRate > 0 ? p.qty / dailyRate : p.qty === 0 ? 0 : Infinity;
        return { productId: id, name: p.name, qty: p.qty, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 8);

    const overLimitConsignments = consignmentsRows.filter((c) => c.limitAmount && Number(c.balance) > Number(c.limitAmount));

    const revenue = withChange(Number(salesCmp.curTotal), Number(salesCmp.prevTotal));
    const invoiceCount = withChange(Number(salesCmp.curCount), Number(salesCmp.prevCount));
    const grossProfit = withChange(
      Number(profitCmp.curProfit) - Number(returnProfitCmp.curProfit),
      Number(profitCmp.prevProfit) - Number(returnProfitCmp.prevProfit)
    );
    const expensesTotal = withChange(Number(expenseCmp.curTotal), Number(expenseCmp.prevTotal));
    const netProfit = withChange(grossProfit.current - expensesTotal.current, grossProfit.previous - expensesTotal.previous);
    const aov = withChange(
      invoiceCount.current > 0 ? revenue.current / invoiceCount.current : 0,
      invoiceCount.previous > 0 ? revenue.previous / invoiceCount.previous : 0
    );
    const marginPct = {
      current: revenue.current > 0 ? (grossProfit.current / revenue.current) * 100 : 0,
      previous: revenue.previous > 0 ? (grossProfit.previous / revenue.previous) * 100 : 0,
    };

    // بناء قائمة التنبيهات والفرص - كل تنبيه بيتبع فلسفة "Metric → Comparison → Problem → Action"
    // اللي طلبها صاحب النظام: مش رقم مجرد، لازم يبقى معاه إيه المشكلة وإيه الاقتراح العملي
    type Alert = { severity: "critical" | "warning" | "info"; icon: string; title: string; detail: string; action: string };
    const alerts: Alert[] = [];

    if (netProfit.current < 0) {
      alerts.push({
        severity: "critical",
        icon: "🔴",
        title: `صافي الربح سالب في ${label}`,
        detail: `صافي الربح ${netProfit.current.toFixed(2)} ج.م - يعني المصروفات (${expensesTotal.current.toFixed(2)} ج.م) أكلت هامش الربح (${grossProfit.current.toFixed(2)} ج.م) بالكامل وزيادة.`,
        action: "راجع المصروفات الأكبر في الفترة دي وشوف أي بند ممكن يتقلل، أو راجع هامش البيع على المنتجات الأكتر مبيعًا.",
      });
    } else if (netProfit.previous > 0 && pctChange(netProfit.current, netProfit.previous) !== null && (pctChange(netProfit.current, netProfit.previous) as number) <= -20) {
      alerts.push({
        severity: "warning",
        icon: "🟠",
        title: `صافي الربح نازل بشكل ملحوظ عن ${prevLabel}`,
        detail: `صافي الربح نزل ${Math.abs(pctChange(netProfit.current, netProfit.previous) as number).toFixed(0)}% مقارنة بالفترة اللي فاتت.`,
        action: "قارن الإيراد والمصروفات لكل فترة على حدة (تاب الأرباح والوضع المالي) عشان تعرف السبب الرئيسي.",
      });
    }

    if (criticalLowStock.length > 0) {
      const names = criticalLowStock.slice(0, 3).map((p) => p.name).join("، ");
      alerts.push({
        severity: "critical",
        icon: "📦",
        title: `${criticalLowStock.length} صنف على وشك النفاد`,
        detail: `على معدل البيع الحالي، هينفدوا خلال أسبوعين أو أقل - منهم: ${names}${criticalLowStock.length > 3 ? " وغيرهم" : ""}.`,
        action: "اعمل طلب شراء عاجل لتجديد المخزون قبل ما تخسر مبيعات بسبب نفاد الصنف.",
      });
    }

    if (deadStock.length > 0 && deadStockValue > 0) {
      alerts.push({
        severity: "warning",
        icon: "🐢",
        title: `${deadStock.length}+ صنف راكد (من غير بيع آخر 60 يوم)`,
        detail: `قيمة البضاعة الراكدة دي بالتكلفة تقريبًا ${deadStockValue.toFixed(2)} ج.م - فلوس واقفة في مخزون مبيعش بدل ما تكون شغالة.`,
        action: "فكّر في عرض/خصم لتحريك الأصناف دي، أو راجع سبب توقف الطلب عليها.",
      });
    }

    if (overLimitCustomers.length > 0) {
      alerts.push({
        severity: "warning",
        icon: "👤",
        title: `${overLimitCustomers.length} عميل تجاوز حد الائتمان`,
        detail: `إجمالي المتجاوز فوق الحد المسموح ${overLimitCustomers.reduce((s, c) => s + (Number(c.balance) - Number(c.creditLimit)), 0).toFixed(2)} ج.م.`,
        action: "تابع تحصيل المستحق من العملاء دول قبل ما تزيدهم بضاعة جديدة بالأجل.",
      });
    }

    if (overLimitConsignments.length > 0) {
      alerts.push({
        severity: "warning",
        icon: "🎒",
        title: `${overLimitConsignments.length} عهدة موظف تجاوزت الحد الأقصى`,
        detail: "فيه موظفين عندهم بضاعة عهدة بقيمة أكبر من الحد المسموح ليهم.",
        action: "راجع تسوية العُهد دي من شاشة العهدة قبل ما تدي بضاعة إضافية.",
      });
    }

    if (pendingReturnsRows.length > 0) {
      alerts.push({
        severity: "info",
        icon: "↩️",
        title: `${pendingReturnsRows.length} طلب مرتجع في انتظار الاعتماد`,
        detail: "لسه محتاجين مراجعة واعتماد أو رفض.",
        action: "افتح شاشة المرتجعات وراجعهم - مرتجع متأخر في الاعتماد بيأخر تسوية حساب العميل أو المورد.",
      });
    }

    const spikeCategories = expenseCategories.filter((c) => c.previous > 0 && c.current > c.previous * 1.3 && c.current - c.previous > 200);
    if (spikeCategories.length > 0) {
      const top = spikeCategories[0];
      alerts.push({
        severity: "info",
        icon: "💸",
        title: `مصروفات "${top.categoryName}" زادت بشكل ملحوظ`,
        detail: `من ${top.previous.toFixed(2)} إلى ${top.current.toFixed(2)} ج.م (+${(top.changePct as number).toFixed(0)}%) مقارنة بـ${prevLabel}.`,
        action: "راجع بنود الفئة دي وتأكد إن الزيادة مبررة (زي زيادة نشاط موسمية) مش تسرب غير ملحوظ.",
      });
    }

    if (alerts.length === 0) {
      alerts.push({ severity: "info", icon: "✅", title: "مفيش تنبيهات حرجة دلوقتي", detail: "كل المؤشرات الأساسية في نطاقها الطبيعي.", action: "" });
    }

    return {
      period: { label, prevLabel, from: from.toISOString(), to: to.toISOString() },
      kpis: {
        revenue,
        invoiceCount,
        aov,
        grossProfit,
        netProfit,
        expenses: expensesTotal,
        marginPct,
        cash: totalCash,
        receivable: totalReceivable,
        payable: totalPayable,
        inventoryValue,
        lowStockCount: lowStockList.length,
      },
      alerts,
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل النظرة التنفيذية");
  }
}

// ==========================================================================
// ب) تحليل المبيعات
// ==========================================================================
export async function getSalesAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom, prevTo } = await period(periodKey, customFrom, customTo);

    // "الاتجاه اليومي" (dailyTrend) كان بيجيب صف خام لكل فاتورة في الفترة كلها من قاعدة البيانات
    // (تاريخ + إجمالي بس) وبيجمعهم يوم بيوم في كود السيرفر (JS) - ده معناه إن فترة زي "السنة دي"
    // كانت بترجّع آلاف صفوف الفواتير الخام على الشبكة بدل ما تتجمّع جوه قاعدة البيانات نفسها. دلوقتي
    // التجميع بيحصل في قاعدة البيانات (GROUP BY على تاريخ اليوم بتوقيت القاهرة - نفس تحويل المنطقة
    // الزمنية اللي بتعمله cairoDayKey بالظبط، بس في SQL) فالراجع بحد أقصى عدد أيام الفترة (365 يوم
    // بالكتير)، مش عدد الفواتير - ونفس مبدأ getManagementOverview: كل الاستعلامات دي مستقلة عن بعض
    // ⚠️ برضه واحد ورا التاني مش Promise.all - نفس سبب getManagementOverview فوق بالظبط (عطل 10
    // سبتمبر: Promise.all على عدة استعلامات في نفس اللحظة كان بيعلّق الموقع لحد ما Vercel يقفله).
    const cairoDaySql = sql<string>`to_char((${schema.salesInvoices.createdAt} at time zone 'UTC' at time zone 'Africa/Cairo'), 'YYYY-MM-DD')`;

    const trendRows = await db
      .select({ day: cairoDaySql, total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)` })
      .from(schema.salesInvoices)
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(cairoDaySql)
      .orderBy(cairoDaySql);

    const byCategoryRows = await db
      .select({
        categoryId: schema.categories.id,
        categoryName: schema.categories.name,
        revenue: sql<string>`coalesce(sum(${schema.salesInvoiceItems.unitPrice} * ${schema.salesInvoiceItems.quantity}), 0)`,
        qty: sql<string>`coalesce(sum(${schema.salesInvoiceItems.quantity}), 0)`,
      })
      .from(schema.salesInvoiceItems)
      .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
      .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
      .leftJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.categories.id, schema.categories.name)
      .orderBy(desc(sql`coalesce(sum(${schema.salesInvoiceItems.unitPrice} * ${schema.salesInvoiceItems.quantity}), 0)`));

    const byChannel = await revenueByChannel(from, to, prevFrom, prevTo);

    const byPaymentRows = await db
      .select({
        methodId: schema.salesInvoices.paymentMethodId,
        methodName: schema.paymentMethods.name,
        total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.salesInvoices)
      .leftJoin(schema.paymentMethods, eq(schema.salesInvoices.paymentMethodId, schema.paymentMethods.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.salesInvoices.paymentMethodId, schema.paymentMethods.name)
      .orderBy(desc(sql`coalesce(sum(${schema.salesInvoices.total}), 0)`));

    const byLocationRows = await db
      .select({
        locationId: schema.salesInvoices.locationId,
        locationName: schema.locations.name,
        total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.salesInvoices)
      .innerJoin(schema.locations, eq(schema.salesInvoices.locationId, schema.locations.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.salesInvoices.locationId, schema.locations.name)
      .orderBy(desc(sql`coalesce(sum(${schema.salesInvoices.total}), 0)`));

    const dailyTrend = trendRows.map((r) => ({ day: r.day, total: Number(r.total) }));
    const byCategory = byCategoryRows.map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName || "بدون فئة", revenue: Number(r.revenue), qty: Number(r.qty) }));
    const byPaymentMethod = byPaymentRows.map((r) => ({ methodName: r.methodName || "غير محدد", total: Number(r.total), count: Number(r.count) }));
    const byLocation = byLocationRows.map((r) => ({ locationName: r.locationName, total: Number(r.total), count: Number(r.count) }));

    return { dailyTrend, byCategory, byChannel, byPaymentMethod, byLocation };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل المبيعات");
  }
}

// ==========================================================================
// ج) الأرباح والوضع المالي - مبني فوق الدوال الموجودة فعلًا في actions/reports.ts (نفس المعادلة
// المستخدمة في شاشة "الأرباح والأداء" بالظبط - مفيش أي منطق ربح جديد هنا، بس تجميع وعرض)
// ==========================================================================
export async function getFinancialAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom } = await period(periodKey, customFrom, customTo);

    // ⚠️ واحد ورا التاني مش Promise.all (نفس سبب الدالتين فوق) - وده هنا أهم لأن getMonthlyPerformance
    // لوحدها بتفتح 4 اتصالات مع بعض جواها أصلًا (Promise.all داخلي من دفعة 11) - لو استعملنا
    // Promise.all هنا كمان كانت هتتحط جنب الـ4 دول في نفس اللحظة زيادة على استعلامات تانية.
    const summary = await getProfitSummary(from, to);
    const byProduct = await getProfitBreakdownByProduct(from, to);
    const monthly = await getMonthlyPerformance(12);
    const expenseCategories = await expensesByCategoryCmp(from, to, prevFrom);
    const cashRows = await db
      .select({ type: schema.cashTransactions.type, total: sql<string>`coalesce(sum(${schema.cashTransactions.amount}), 0)` })
      .from(schema.cashTransactions)
      .where(and(gte(schema.cashTransactions.createdAt, from), lte(schema.cashTransactions.createdAt, to)))
      .groupBy(schema.cashTransactions.type);

    // TRANSFER_IN/OUT مستبعدين من صافي التدفق - دول مجرد نقل بين خزنتين جوه نفس الشركة (بيلغوا
    // بعض حسابيًا)، مش فلوس حقيقية داخلة أو خارجة من الشركة. ADJUSTMENT معروضة لوحدها لأن اتجاهها
    // (تسوية زيادة أو نقصان) مش متسجل صراحة في نوع الحركة نفسه - القيمة المخزنة مقدار مطلق بس.
    const IN_TYPES = new Set(["SALE_IN", "COLLECTION_IN", "LOAN_IN", "RETURN_IN"]);
    const OUT_TYPES = new Set(["PURCHASE_OUT", "EXPENSE_OUT", "PAYMENT_OUT", "LOAN_OUT", "RETURN_OUT"]);
    let cashIn = 0, cashOut = 0, adjustments = 0;
    for (const r of cashRows) {
      const v = Number(r.total);
      if (IN_TYPES.has(r.type)) cashIn += v;
      else if (OUT_TYPES.has(r.type)) cashOut += v;
      else if (r.type === "ADJUSTMENT") adjustments += v;
    }

    return {
      summary,
      byProduct,
      monthlyTrend: monthly,
      expenseCategories,
      cashFlow: { in: cashIn, out: cashOut, net: cashIn - cashOut, adjustments },
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل الأرباح والوضع المالي");
  }
}

// ==========================================================================
// د) تحليل المنتجات
// ==========================================================================
export async function getProductsAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to } = await period(periodKey, customFrom, customTo);

    const topSellers = await bestSellers(from, to);
    const profitByProduct = await getProfitBreakdownByProduct(from, to);

    const soldInPeriod = await db
      .select({ productId: schema.salesInvoiceItems.productId, qty: sql<number>`sum(${schema.salesInvoiceItems.quantity})` })
      .from(schema.salesInvoiceItems)
      .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.salesInvoiceItems.productId);
    const soldMap = new Map(soldInPeriod.map((r) => [r.productId, Number(r.qty)]));

    const activeStockRows = await db
      .select({ productId: schema.products.id, name: schema.products.name, qty: schema.stocks.quantity, avgCost: schema.products.avgCost })
      .from(schema.products)
      .leftJoin(schema.stocks, eq(schema.stocks.productId, schema.products.id))
      .where(eq(schema.products.active, true));
    const byProduct = new Map<string, { name: string; qty: number; avgCost: number }>();
    for (const r of activeStockRows) {
      const cur = byProduct.get(r.productId) || { name: r.name, qty: 0, avgCost: Number(r.avgCost) };
      cur.qty += r.qty || 0;
      byProduct.set(r.productId, cur);
    }
    const slowMovers = [...byProduct.entries()]
      .filter(([id, p]) => p.qty > 0 && !((soldMap.get(id) || 0) > 0))
      .map(([id, p]) => ({ productId: id, name: p.name, stockQty: p.qty, stockValue: p.qty * p.avgCost }))
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 15);

    const mostProfitable = [...profitByProduct].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const leastProfitable = [...profitByProduct]
      .filter((p) => p.qty > 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 10);

    return {
      topSellers: topSellers.slice(0, 15),
      mostProfitable,
      leastProfitable,
      slowMovers,
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل المنتجات");
  }
}

// ==========================================================================
// هـ) المخزون والمشتريات
// ==========================================================================
export async function getInventoryPurchasingAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom } = await period(periodKey, customFrom, customTo);

    const reorder = await getReorderAlerts();

    const [purchaseCmp] = await db
      .select({
        curTotal: sql<string>`coalesce(sum(${schema.purchases.totalAmount}) filter (where ${schema.purchases.createdAt} >= ${from.toISOString()}), 0)`,
        curCount: sql<number>`count(*) filter (where ${schema.purchases.createdAt} >= ${from.toISOString()})`,
        prevTotal: sql<string>`coalesce(sum(${schema.purchases.totalAmount}) filter (where ${schema.purchases.createdAt} < ${from.toISOString()}), 0)`,
      })
      .from(schema.purchases)
      .where(and(gte(schema.purchases.createdAt, prevFrom), lte(schema.purchases.createdAt, to)));

    const topSuppliersRows = await db
      .select({
        supplierId: schema.purchases.supplierId,
        supplierName: schema.suppliers.name,
        total: sql<string>`coalesce(sum(${schema.purchases.totalAmount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.purchases)
      .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
      .where(and(gte(schema.purchases.createdAt, from), lte(schema.purchases.createdAt, to)))
      .groupBy(schema.purchases.supplierId, schema.suppliers.name)
      .orderBy(desc(sql`coalesce(sum(${schema.purchases.totalAmount}), 0)`))
      .limit(10);

    const stockByLocRows = await db
      .select({ locationId: schema.stocks.locationId, locationName: schema.locations.name, qty: schema.stocks.quantity, avgCost: schema.products.avgCost })
      .from(schema.stocks)
      .innerJoin(schema.locations, eq(schema.stocks.locationId, schema.locations.id))
      .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id));
    const byLoc = new Map<string, { name: string; qty: number; value: number }>();
    for (const r of stockByLocRows) {
      const cur = byLoc.get(r.locationId) || { name: r.locationName, qty: 0, value: 0 };
      cur.qty += r.qty;
      cur.value += r.qty * Number(r.avgCost);
      byLoc.set(r.locationId, cur);
    }

    return {
      reorderAlerts: isActionError(reorder) ? { manual: [], smart: [] } : reorder,
      purchasing: withChange(Number(purchaseCmp.curTotal), Number(purchaseCmp.prevTotal)),
      purchaseCount: Number(purchaseCmp.curCount),
      topSuppliers: topSuppliersRows.map((r) => ({ supplierName: r.supplierName, total: Number(r.total), count: Number(r.count) })),
      inventoryByLocation: [...byLoc.values()],
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل المخزون والمشتريات");
  }
}

// ==========================================================================
// و) أداء الموظفين (المبيعات والتحصيل والعهدة) - ملحوظة: مفيش تتبع حضور/انصراف أو مهام في
// السيستم حاليًا، فالقسم ده بيقتصر على أداء مالي قابل للقياس فعليًا من البيانات الموجودة
// ==========================================================================
export async function getEmployeesAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to } = await period(periodKey, customFrom, customTo);

    const salesPerf = await db
      .select({
        userId: schema.salesInvoices.soldById,
        userName: schema.users.fullName,
        salesCount: sql<number>`count(*)`,
        salesTotal: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
      })
      .from(schema.salesInvoices)
      .innerJoin(schema.users, eq(schema.salesInvoices.soldById, schema.users.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.salesInvoices.soldById, schema.users.fullName)
      .orderBy(desc(sql`coalesce(sum(${schema.salesInvoices.total}), 0)`));

    const collectionsPerf = await db
      .select({
        userId: schema.collections.createdById,
        userName: schema.users.fullName,
        total: sql<string>`coalesce(sum(${schema.collections.amount}), 0)`,
      })
      .from(schema.collections)
      .innerJoin(schema.users, eq(schema.collections.createdById, schema.users.id))
      .where(and(gte(schema.collections.createdAt, from), lte(schema.collections.createdAt, to)))
      .groupBy(schema.collections.createdById, schema.users.fullName);
    const collMap = new Map(collectionsPerf.map((c) => [c.userId, Number(c.total)]));

    const perfMap = new Map(salesPerf.map((p) => [p.userId, p]));
    for (const c of collectionsPerf) {
      if (!perfMap.has(c.userId)) perfMap.set(c.userId, { userId: c.userId, userName: c.userName, salesCount: 0, salesTotal: "0" });
    }
    const employeePerf = [...perfMap.values()]
      .map((p) => ({ userId: p.userId as string, userName: p.userName, salesCount: Number(p.salesCount), salesTotal: Number(p.salesTotal), collections: collMap.get(p.userId!) || 0 }))
      .sort((a, b) => b.salesTotal - a.salesTotal);

    const consignmentLeaderboard = await getConsignmentSalesLeaderboard(from, to);

    return {
      employeePerf,
      consignmentLeaderboard: isActionError(consignmentLeaderboard) ? [] : consignmentLeaderboard,
      missingData: "مفيش تتبع حضور/انصراف أو ساعات عمل أو مهام لكل موظف في السيستم حاليًا - الأداء هنا مبني على مبيعات وتحصيل وعهدة فعلية بس (بيانات حقيقية 100%).",
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل أداء الموظفين");
  }
}

// ==========================================================================
// ز) التسويق - إيراد حسب القناة بس (حسب الاتفاق) - مفيش تتبع تكلفة إعلانات/عملاء محتملين
// (Leads/CAC/ROAS) في السيستم حاليًا، فمينفعش نعرضهم كأرقام حقيقية
// ==========================================================================
export async function getMarketingAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom, prevTo } = await period(periodKey, customFrom, customTo);
    const byChannel = await revenueByChannel(from, to, prevFrom, prevTo);
    return {
      byChannel,
      missingData: "مفيش تتبع لتكلفة الإعلانات، عدد العملاء المحتملين (Leads)، أو تكلفة اكتساب العميل (CAC/ROAS) في السيستم حاليًا - المعروض هنا إيراد المبيعات الفعلي مقسّم حسب مصدر الأوردر بس.",
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل التسويق");
  }
}

// ==========================================================================
// ح) تحليل العملاء
// ==========================================================================
export async function getCustomerAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to, prevFrom } = await period(periodKey, customFrom, customTo);

    const [newCustomersCmp] = await db
      .select({
        curCount: sql<number>`count(*) filter (where ${schema.customers.createdAt} >= ${from.toISOString()})`,
        prevCount: sql<number>`count(*) filter (where ${schema.customers.createdAt} < ${from.toISOString()})`,
      })
      .from(schema.customers)
      .where(and(gte(schema.customers.createdAt, prevFrom), lte(schema.customers.createdAt, to)));

    const topCustomersRows = await db
      .select({
        customerId: schema.salesInvoices.customerId,
        customerName: schema.customers.name,
        total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.salesInvoices)
      .innerJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .groupBy(schema.salesInvoices.customerId, schema.customers.name)
      .orderBy(desc(sql`coalesce(sum(${schema.salesInvoices.total}), 0)`))
      .limit(10);

    // "عميل جديد" هنا = العميل نفسه اتسجل في السيستم لأول مرة جوه الفترة المختارة (customers.createdAt)
    // - نفس تعريف "عميل جديد" المستخدم فوق بالظبط، عشان الرقمين يتطابقوا مع بعض
    const newVsReturningRows = await db
      .select({
        isNew: sql<boolean>`(${schema.customers.createdAt} >= ${from.toISOString()})`,
        total: sql<string>`coalesce(sum(${schema.salesInvoices.total}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.salesInvoices)
      .innerJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      // GROUP BY 1 (بالترتيب مش بإعادة كتابة نفس التعبير) - لو كتبنا نفس تعبير isNew تاني هنا،
      // كل استعلام لتاريخ زي ${from} بيتحول لـ parameter منفصل ($1 هنا، $4 هنا) حتى لو نفس القيمة
      // بالظبط - وبما إن Postgres بيتحقق من صحة GROUP BY قبل ما يعرف قيم الـ parameters الفعلية،
      // بيشوفهم تعبيرين مختلفين ويرفض الاستعلام بـ "column must appear in the GROUP BY clause".
      // بالترتيب (1 = أول عمود في SELECT) بيتفادى المشكلة دي تمامًا.
      .groupBy(sql`1`);

    const newRow = newVsReturningRows.find((r) => r.isNew);
    const returningRow = newVsReturningRows.find((r) => !r.isNew);

    return {
      newCustomers: withChange(Number(newCustomersCmp.curCount), Number(newCustomersCmp.prevCount)),
      topCustomers: topCustomersRows.map((r) => ({ customerName: r.customerName, total: Number(r.total), count: Number(r.count) })),
      newVsReturning: {
        newRevenue: Number(newRow?.total || 0),
        newCount: Number(newRow?.count || 0),
        returningRevenue: Number(returningRow?.total || 0),
        returningCount: Number(returningRow?.count || 0),
      },
      missingData: "مفيش تسجيل لمصدر اكتساب العميل نفسه (مثلًا العميل ده جالك أصلًا من فيسبوك ولا واتساب) - المتاح هو مصدر كل أوردر/فاتورة على حدة بس (شوف تاب التسويق).",
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل تحليل العملاء");
  }
}

// ==========================================================================
// ط) نظرة عامة على العمليات (أوردرات وشحن ومرتجعات)
// ==========================================================================
export async function getOperationsAnalytics(periodKey: PeriodKey, customFrom?: string, customTo?: string) {
  try {
    const { from, to } = await period(periodKey, customFrom, customTo);

    const orderStats = await getOrderStats();

    const returnsRows = await db
      .select({ status: schema.returnRequests.status, count: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${schema.returnRequests.totalAmount}), 0)` })
      .from(schema.returnRequests)
      .where(and(gte(schema.returnRequests.createdAt, from), lte(schema.returnRequests.createdAt, to)))
      .groupBy(schema.returnRequests.status);

    const [fulfillment] = await db
      .select({
        avgHours: sql<string>`avg(extract(epoch from (${schema.orders.deliveredAt} - ${schema.orders.createdAt})) / 3600)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.orders)
      .where(and(eq(schema.orders.status, "DELIVERED"), gte(schema.orders.deliveredAt, from), lte(schema.orders.deliveredAt, to)));

    return {
      orderStats,
      returnsOverview: returnsRows.map((r) => ({ status: r.status, count: Number(r.count), total: Number(r.total) })),
      avgFulfillmentHours: fulfillment?.avgHours ? Number(fulfillment.avgHours) : null,
      deliveredInPeriod: Number(fulfillment?.count || 0),
      missingData: "مفيش تتبع لمهام تشغيلية داخلية (Tasks) أو وقت كل خطوة في سير عمل الأوردر (غير وقت التسليم الكلي) في السيستم حاليًا.",
    };
  } catch (e) {
    return toActionError(e, "تعذر تحميل نظرة العمليات");
  }
}
