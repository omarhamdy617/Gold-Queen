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

  const suppliers = await db.select().from(schema.suppliers);
  const totalPayable = suppliers.reduce((s, s2) => s + Number(s2.balance), 0);

  const consignments = await db.select().from(schema.consignments);
  const totalConsignmentValue = consignments.reduce((s, c) => s + Number(c.balance), 0);

  // قيمة المخزون بالتكلفة (محل + مخزن)
  const stockRows = await db
    .select({ productId: schema.stocks.productId, quantity: schema.stocks.quantity, avgCost: schema.products.avgCost, locationType: schema.locations.type, locationName: schema.locations.name })
    .from(schema.stocks)
    .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id))
    .innerJoin(schema.locations, eq(schema.stocks.locationId, schema.locations.id));

  let inventoryValue = 0;
  const byLocation: Record<string, { name: string; qty: number; value: number }> = {};
  for (const r of stockRows) {
    const value = r.quantity * Number(r.avgCost);
    inventoryValue += value;
    if (!byLocation[r.locationName]) byLocation[r.locationName] = { name: r.locationName, qty: 0, value: 0 };
    byLocation[r.locationName].qty += r.quantity;
    byLocation[r.locationName].value += value;
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
    totalPayable,
    totalConsignmentValue,
    inventoryValue,
    byLocation: Object.values(byLocation),
    inTransitCount: inTransitOrders.length,
    netPosition: totalCash + totalReceivable + inventoryValue - totalPayable,
  };
}
