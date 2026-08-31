"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock } from "@/lib/ops";
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
  locationId: string;
}) {
  await requirePermission("orders.manage");
  const session = await requireSession();

  if (!input.customerName?.trim()) throw new Error("اسم العميل مطلوب");
  if (!input.customerPhone?.trim()) throw new Error("رقم الهاتف مطلوب");
  if (!input.address?.trim()) throw new Error("العنوان مطلوب");
  if (!input.governorate?.trim()) throw new Error("المحافظة مطلوبة");
  if (!input.locationId) throw new Error("لازم تحدد المكان اللي هيتجهز منه الأوردر");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const order = await db.transaction(async (tx) => {
    const code = genCode("ORD");
    const [order] = await tx
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
        locationId: input.locationId,
        createdById: session.userId,
      })
      .returning();
    for (const item of input.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) throw new Error("فيه سطر صنف غير صحيح");
      await tx.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity });
      const newQty = await adjustStock(tx, item.productId, input.locationId, -item.quantity);
      if (newQty < 0) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
        throw new Error(`الكمية المتاحة من "${product?.name || "المنتج"}" في المكان ده مش كفاية للأوردر ده`);
      }
    }
    return order;
  });

  await logAudit({ action: "CREATE", entityType: "Order", entityId: order.id, after: order });
  revalidatePath("/orders");
  revalidatePath("/products");
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

// -------------------- تحديث حالة الأوردر: تجهيز/شحن/تسليم/مرتجع --------------------
export async function updateOrderStatus(
  orderId: string,
  status: "PREPARING" | "SHIPPED" | "DELIVERED" | "RETURNED",
  extra?: { collectionStatus?: "PENDING" | "COLLECTED"; collectedAmount?: number; returnReason?: string }
) {
  await requirePermission("orders.ship");
  const session = await requireSession();
  const before = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).then((r) => r[0]);
  if (!before) throw new Error("الأوردر غير موجود");

  if (status === "RETURNED" && !extra?.returnReason?.trim()) {
    throw new Error("لازم تكتب سبب الإرجاع");
  }
  if (status === "DELIVERED" && !extra?.collectionStatus) {
    throw new Error("لازم تحدد حالة التحصيل (تم التحصيل / لسه)");
  }
  if (status === "DELIVERED" && extra?.collectionStatus === "COLLECTED" && (extra?.collectedAmount === undefined || extra.collectedAmount < 0)) {
    throw new Error("لازم تدخل المبلغ المحصّل");
  }

  const payload: any = { status, updatedAt: new Date() };
  if (status === "DELIVERED") {
    payload.collectionStatus = extra?.collectionStatus;
    payload.collectedAmount = extra?.collectionStatus === "COLLECTED" ? (extra?.collectedAmount ?? 0).toFixed(2) : null;
    payload.deliveredById = session.userId;
    payload.deliveredAt = new Date();
  }
  if (status === "RETURNED") {
    payload.returnReason = extra?.returnReason?.trim();
  }

  if (status === "RETURNED" && before.status !== "RETURNED") {
    // رجّع الأصناف للمخزون تلقائيًا
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (before.locationId) await adjustStock(tx, item.productId, before.locationId, item.quantity);
      }
      await tx.update(schema.orders).set(payload).where(eq(schema.orders.id, orderId));
    });
  } else {
    await db.update(schema.orders).set(payload).where(eq(schema.orders.id, orderId));
  }

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "UPDATE", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  revalidatePath("/products");
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

// -------------------- إحصائيات أعلى صفحة الأوردرات --------------------
export async function getOrderStats() {
  await requirePermission("orders.manage");
  const orders = await db.select().from(schema.orders);
  const total = orders.length;
  const preparing = orders.filter((o) => o.status === "PREPARING").length;
  const shipped = orders.filter((o) => o.status === "SHIPPED").length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const returned = orders.filter((o) => o.status === "RETURNED").length;
  const pendingCollection = orders.filter((o) => o.status === "DELIVERED" && o.collectionStatus === "PENDING").length;
  const inProgress = preparing + shipped;
  return { total, preparing, shipped, delivered, returned, inProgress, pendingCollection };
}

export async function getOrderItems(orderId: string) {
  await requirePermission("orders.manage");
  return db
    .select({ id: schema.orderItems.id, quantity: schema.orderItems.quantity, productName: schema.products.name })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(eq(schema.orderItems.orderId, orderId));
}

// -------------------- تفاصيل أوردر كاملة --------------------
export async function getOrder(orderId: string) {
  await requirePermission("orders.manage");
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;

  const [creator, assigner, deliverer] = await Promise.all([
    order.createdById ? db.select().from(schema.users).where(eq(schema.users.id, order.createdById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.assignedById ? db.select().from(schema.users).where(eq(schema.users.id, order.assignedById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.deliveredById ? db.select().from(schema.users).where(eq(schema.users.id, order.deliveredById)).then((r) => r[0]) : Promise.resolve(undefined),
  ]);

  const items = await db
    .select({ id: schema.orderItems.id, quantity: schema.orderItems.quantity, productName: schema.products.name })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(eq(schema.orderItems.orderId, orderId));

  let locationName: string | undefined;
  if (order.locationId) {
    const [loc] = await db.select().from(schema.locations).where(eq(schema.locations.id, order.locationId));
    locationName = loc?.name;
  }

  return {
    order,
    items,
    locationName,
    createdByName: creator?.fullName,
    assignedByName: assigner?.fullName,
    deliveredByName: deliverer?.fullName,
  };
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
