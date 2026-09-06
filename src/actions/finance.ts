"use server";
import { db, schema } from "@/db";
import { sql, eq, gt } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";

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
  const totalPayable = suppliers.reduce((s, s2) => s + Number(s2.balance), 0);

  const consignments = await db.select().from(schema.consignments);
  const totalConsignmentValue = consignments.reduce((s, c) => s + Number(c.balance), 0);

  // قيمة بضاعة العهدة *بسعر التكلفة* (avgCost) بدل سعر البيع للعميل - قبل كده "الوضع المالي" كان بيحسبها
  // بسعر البيع (consignments.balance، اللي متبني على unitPrice وقت التسليم) وده بيضخّم صافي الوضع المالي
  // عن الحقيقي، لأن قيمة البضاعة الفعلية اللي معاك (لسه ماتباعتش) هي تكلفتها مش سعر بيعها المتوقع.
  const consignmentItemRows = await db
    .select({ quantity: schema.consignmentItems.quantity, returnedQty: schema.consignmentItems.returnedQty, avgCost: schema.products.avgCost })
    .from(schema.consignmentItems)
    .innerJoin(schema.products, eq(schema.consignmentItems.productId, schema.products.id));
  const consignmentCostValue = consignmentItemRows.reduce((s, r) => s + Math.max(r.quantity - r.returnedQty, 0) * Number(r.avgCost), 0);

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

  // البضاعة في الطريق (أوردرات مشحونة ولسه معلقة)
  const inTransitOrders = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.status, "SHIPPED"));

  return {
    totalCash,
    drawers,
    totalReceivable,
    totalCustomerCredit,
    totalPayable,
    totalConsignmentValue,
    consignmentCostValue,
    inventoryValue,
    byLocation: Object.values(byLocation),
    inTransitCount: inTransitOrders.length,
    netPosition: totalCash + totalReceivable + inventoryValue + consignmentCostValue - totalPayable - totalCustomerCredit,
  };
}
