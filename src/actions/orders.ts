"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// -------------------- تسجيل الأوردر (السلز/الكول سنتر) --------------------
export async function createOrder(input: {
  invoiceId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  address: string;
  governorate: string;
  orderNotes?: string;
  deliveryNotes?: string;
  items: { productId: string; quantity: number }[];
  source: "WEBSITE" | "PHONE" | "WHATSAPP" | "FACEBOOK" | "OTHER";
  prepaid: boolean;
}) {
  await requirePermission("orders.manage");
  const session = await requireSession();

  if (!input.customerName?.trim()) throw new Error("اسم العميل مطلوب");
  if (!input.customerPhone?.trim()) throw new Error("رقم الهاتف مطلوب");
  if (!input.address?.trim()) throw new Error("العنوان مطلوب");
  if (!input.governorate?.trim()) throw new Error("المحافظة مطلوبة");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const code = genCode("ORD");
  const [order] = await db
    .insert(schema.orders)
    .values({
      code,
      invoiceId: input.invoiceId,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerPhone2: input.customerPhone2,
      address: input.address,
      governorate: input.governorate,
      orderNotes: input.orderNotes,
      deliveryNotes: input.deliveryNotes,
      source: input.source,
      prepaid: input.prepaid,
      status: "PREPARING",
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

// -------------------- تحديد الشحن (صلاحية منفصلة: orders.ship) --------------------
export async function assignOrderShipping(orderId: string, input: {
  shippingMethod: "INTERNAL_COURIER" | "EXTERNAL_COMPANY" | "OTHER";
  courierId?: string;
  shippingCompanyId?: string;
}) {
  await requirePermission("orders.ship");
  const session = await requireSession();

  let courierName: string | undefined;
  let shippingCompanyName: string | undefined;
  if (input.shippingMethod === "INTERNAL_COURIER" && input.courierId) {
    const [c] = await db.select().from(schema.couriers).where(eq(schema.couriers.id, input.courierId));
    courierName = c?.name;
  }
  if (input.shippingMethod === "EXTERNAL_COMPANY" && input.shippingCompanyId) {
    const [c] = await db.select().from(schema.shippingCompanies).where(eq(schema.shippingCompanies.id, input.shippingCompanyId));
    shippingCompanyName = c?.name;
  }

  const before = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).then((r) => r[0]);
  const [order] = await db
    .update(schema.orders)
    .set({
      shippingMethod: input.shippingMethod,
      courierId: input.courierId,
      courierName,
      shippingCompanyId: input.shippingCompanyId,
      shippingCompanyName,
      status: "SHIPPED",
      assignedById: session.userId,
      assignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId))
    .returning();
  await logAudit({ action: "SHIP", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  return order;
}

export async function updateOrderStatus(orderId: string, status: "PREPARING" | "SHIPPED" | "DELIVERED" | "RETURNED") {
  await requirePermission("orders.ship");
  const before = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).then((r) => r[0]);
  const [order] = await db.update(schema.orders).set({ status, updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  await logAudit({ action: "UPDATE", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  return order;
}

export async function listOrders() {
  await requirePermission("orders.manage");
  const rows = await db
    .select()
    .from(schema.orders)
    .orderBy(desc(schema.orders.createdAt));
  return rows;
}

export async function getOrderItems(orderId: string) {
  await requirePermission("orders.manage");
  return db
    .select({ id: schema.orderItems.id, quantity: schema.orderItems.quantity, productName: schema.products.name })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(eq(schema.orderItems.orderId, orderId));
}

// -------------------- إعدادات: شركات الشحن والمناديب الداخليين --------------------
export async function listCouriers() {
  return db.select().from(schema.couriers).where(eq(schema.couriers.active, true));
}
export async function createCourier(name: string, phone?: string) {
  await requirePermission("settings.manage");
  const [c] = await db.insert(schema.couriers).values({ name, phone }).returning();
  revalidatePath("/settings");
  revalidatePath("/orders");
  return c;
}
export async function deactivateCourier(id: string) {
  await requirePermission("settings.manage");
  await db.update(schema.couriers).set({ active: false }).where(eq(schema.couriers.id, id));
  revalidatePath("/settings");
}

export async function listShippingCompanies() {
  return db.select().from(schema.shippingCompanies).where(eq(schema.shippingCompanies.active, true));
}
export async function createShippingCompany(name: string, phone?: string) {
  await requirePermission("settings.manage");
  const [c] = await db.insert(schema.shippingCompanies).values({ name, phone }).returning();
  revalidatePath("/settings");
  revalidatePath("/orders");
  return c;
}
export async function deactivateShippingCompany(id: string) {
  await requirePermission("settings.manage");
  await db.update(schema.shippingCompanies).set({ active: false }).where(eq(schema.shippingCompanies.id, id));
  revalidatePath("/settings");
}
