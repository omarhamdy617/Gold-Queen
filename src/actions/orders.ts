"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createOrder(input: {
  invoiceId?: string;
  customerId?: string;
  items: { productId: string; quantity: number }[];
  source: "WEBSITE" | "PHONE" | "WHATSAPP" | "FACEBOOK" | "OTHER";
  shippingMethod: "INTERNAL_COURIER" | "EXTERNAL_COMPANY" | "OTHER";
  shippingCompanyName?: string;
  courierName?: string;
  prepaid: boolean;
}) {
  await requirePermission("orders.manage");
  const session = await requireSession();
  const code = genCode("ORD");
  const [order] = await db
    .insert(schema.orders)
    .values({
      code,
      invoiceId: input.invoiceId,
      customerId: input.customerId,
      source: input.source,
      shippingMethod: input.shippingMethod,
      shippingCompanyName: input.shippingCompanyName,
      courierName: input.courierName,
      prepaid: input.prepaid,
      createdById: session.userId,
    })
    .returning();
  for (const item of input.items) {
    await db.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity });
  }
  await logAudit({ action: "CREATE", entityType: "Order", entityId: order.id, after: order });
  revalidatePath("/orders");
  return order;
}

export async function updateOrderStatus(orderId: string, status: "PREPARING" | "SHIPPED" | "DELIVERED" | "RETURNED") {
  await requirePermission("orders.manage");
  const before = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).then((r) => r[0]);
  const [order] = await db.update(schema.orders).set({ status, updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  await logAudit({ action: "UPDATE", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  return order;
}

export async function listOrders() {
  await requirePermission("orders.manage");
  const rows = await db
    .select({
      id: schema.orders.id,
      code: schema.orders.code,
      status: schema.orders.status,
      source: schema.orders.source,
      shippingMethod: schema.orders.shippingMethod,
      shippingCompanyName: schema.orders.shippingCompanyName,
      courierName: schema.orders.courierName,
      prepaid: schema.orders.prepaid,
      createdAt: schema.orders.createdAt,
      customerName: schema.customers.name,
    })
    .from(schema.orders)
    .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
    .orderBy(desc(schema.orders.createdAt));
  return rows;
}
