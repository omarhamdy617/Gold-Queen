"use server";
import { db, schema } from "@/db";
import { sql, eq, gt } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { getTotalSuppliersPayable } from "@/actions/purchases";

export async function getFinancialPosition() {
  await requirePermission("finance.view");

  const drawers = await db.select().from(schema.cashDrawers);
  const totalCash = drawers.reduce((s, d) => s + Number(d.balance), 0);

  const customers = await db.select().from(schema.customers);
  const totalReceivable = customers.reduce((s, c) => s + Math.max(Number(c.balance), 0), 0);
  // فلوس احنا مديونين بيها للعملاء (رصيدهم سالب - دفعوا زيادة أو رجّعوا بضاعة وليهم رصيد عندنا) -
  // قبل كده الرقم ده كان بيتجاهل تمامًا في "الوضع المالي الصافي" فكان بيظهر أعلى من الحقيقي.
  const totalCustomerCredit = customers.reduce((s, c) => s + Math.max(-Number(c.balance), 0), 0);

  const suppliers = await db.select().from(schema.suppliers);
  // بنستخدم نفس دالة "المستحق للموردين" المستخدمة في كل شاشة تانية (شاشة الموردين، الداشبورد) - قبل
  // كده كل شاشة كانت بتحسبه بطريقة مختلفة شوية عن التانية (هنا كانت بتجمع الأرصدة السالبة كمان، في
  // شاشات تانية كانت بتستبعدها أو بتستبعد الموردين الموقوفين) فكانت الأرقام بتختلف من شاشة لشاشة.
  const totalPayable = await getTotalSuppliersPayable();
  // فلوس المفروض الموردين يردّوها لينا (رصيدهم سالب - دفعنالهم زيادة أو رجّعنالهم بضاعة وليهم رصيد
  // دائن عندنا) - ده أصل حقيقي لينا. قبل كده كان بيتحسب ضمنيًا جوه totalPayable نفسه (بجمع الأرصدة
  // السالبة، وده بيقلل المطروح في صافي الوضع المالي بنفس الأثر) - دلوقتي بعد ما totalPayable بقى
  // بيستبعد الأرصدة السالبة (زي totalReceivable بالظبط)، لازم نضيفه صراحةً كبند مستقل في الصافي.
  const totalSupplierCredit = suppliers.reduce((s, s2) => s + Math.max(-Number(s2.balance), 0), 0);

  const consignments = await db.select().from(schema.consignments);
  const totalConsignmentValue = consignments.reduce((s, c) => s + Number(c.balance), 0);

  // قيمة بضاعة العهدة *بسعر التكلفة* (avgCost) بدل سعر البيع للعميل - قبل كده "الوضع المالي" كان بيحسبها
  // بسعر البيع (consignments.balance، اللي متبني على unitPrice وقت التسليم) وده بيضخّم صافي الوضع المالي
  // عن الحقيقي، لأن قيمة البضاعة الفعلية اللي معاك (لسه ماتباعتش) هي تكلفتها مش سعر بيعها المتوقع.
  const consignmentItemRows = await db
    .select({ quantity: schema.consignmentItems.quantity, returnedQty: schema.consignmentItems.returnedQty, soldQty: schema.consignmentItems.soldQty, avgCost: schema.products.avgCost })
    .from(schema.consignmentItems)
    .innerJoin(schema.products, eq(schema.consignmentItems.productId, schema.products.id));
  // المتبقي فعليًا مع الموظف (بضاعة لسه معاه، لا رجعت ولا اتباعت) = الكمية - المرتجع - المباع. قبل
  // كده الحساب كان بيطرح returnedQty بس وبينسى soldQty، فكان بيحسب البضاعة اللي اتباعت فعليًا لعميل
  // (بقت فلوس/مديونية عند العميل، مش بضاعة قاعدة مع الموظف) كأنها لسه "قيمة عهدة" قايمة - تضخيم
  // مزدوج لصافي الوضع المالي (مرة كبضاعة عهدة، ومرة كمان لو دخلت في رصيد العميل من بيع العهدة).
  const consignmentCostValue = consignmentItemRows.reduce((s, r) => s + Math.max(r.quantity - r.returnedQty - r.soldQty, 0) * Number(r.avgCost), 0);

  // قيمة المخزون بالتكلفة (محل + مخزن)
  const stockRows = await db
    .select({ productId: schema.stocks.productId, quantity: schema.stocks.quantity, avgCost: schema.products.avgCost, locationType: schema.locations.type, locationName: schema.locations.name, locationId: schema.stocks.locationId })
    .from(schema.stocks)
    .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id))
    .innerJoin(schema.locations, eq(schema.stocks.locationId, schema.locations.id));

  let inventoryValue = 0;
  const byLocation: Record<string, { id: string; name: string; qty: number; value: number }> = {};
  for (const r of stockRows) {
    const value = r.quantity * Number(r.avgCost);
    inventoryValue += value;
    if (!byLocation[r.locationId]) byLocation[r.locationId] = { id: r.locationId, name: r.locationName, qty: 0, value: 0 };
    byLocation[r.locationId].qty += r.quantity;
    byLocation[r.locationId].value += value;
  }

  // بضاعة الأوردرات الجارية (قيد التجهيز + في الشحن): المخزون بتاعها بيتخصم فعليًا من جدول
  // المخازن لحظة ما الأوردر يتحدد له مكان تجهيز (يدخل "قيد التجهيز") - مش بس وقت الشحن الفعلي.
  // قبل التعديل ده، الرقم ده كان بيختفي تمامًا من "الوضع المالي" من لحظة الحجز لحد التسليم الفعلي -
  // يعني أصل حقيقي (بضاعة محجوزة/في الطريق) ضايع من الحسابات لمدة يوم لتلاتة (فترة التجهيز+الشحن).
  const inProgressItemRows = await db
    .select({ quantity: schema.orderItems.quantity, avgCost: schema.products.avgCost })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(sql`${schema.orders.status} IN ('PREPARING','SHIPPED')`);
  const inProgressCostValue = inProgressItemRows.reduce((s, r) => s + r.quantity * Number(r.avgCost), 0);

  // العائد المتوقع (إجمالي البيع المتوقع تحصيله) لو كل الأوردرات الجارية دي اتسلمت وتحصّلت بالكامل -
  // رقم استرشادي/معلوماتي بس ومش بيدخل في صافي الوضع المالي (لسه مش مضمون لحد ما يتسلم فعليًا).
  const inProgressOrders = await db
    .select({ id: schema.orders.id, total: schema.orders.total })
    .from(schema.orders)
    .where(sql`${schema.orders.status} IN ('PREPARING','SHIPPED')`);
  const inProgressExpectedRevenue = inProgressOrders.reduce((s, o) => s + Number(o.total), 0);

  // حسابات السلف: رصيد موجب = فلوس ليّا (مستحقة لي)، رصيد سالب = فلوس عليّا (مديون بيها) -
  // قبل كده حسابات السلف كانت متجاهلة تمامًا من "الوضع المالي" رغم إنها فلوس حقيقية داخلة/خارجة.
  const loanAccounts = await db.select().from(schema.loanAccounts);
  const totalLoanReceivable = loanAccounts.reduce((s, a) => s + Math.max(Number(a.balance), 0), 0);
  const totalLoanPayable = loanAccounts.reduce((s, a) => s + Math.max(-Number(a.balance), 0), 0);

  return {
    totalCash,
    drawers,
    totalReceivable,
    totalCustomerCredit,
    totalPayable,
    totalSupplierCredit,
    totalConsignmentValue,
    consignmentCostValue,
    inventoryValue,
    byLocation: Object.values(byLocation),
    inTransitCount: inProgressOrders.length,
    inProgressCostValue,
    inProgressExpectedRevenue,
    totalLoanReceivable,
    totalLoanPayable,
    netPosition:
      totalCash +
      totalReceivable +
      inventoryValue +
      consignmentCostValue +
      inProgressCostValue +
      totalLoanReceivable +
      totalSupplierCredit -
      totalPayable -
      totalCustomerCredit -
      totalLoanPayable,
  };
}
