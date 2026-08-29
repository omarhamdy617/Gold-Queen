import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// نقطة استقبال أوردرات من موقع خارجي مستقبلي (جاهزية لموقع أونلاين)
// الموقع الخارجي لازم يبعت header: X-Api-Key = WEBHOOK_SECRET
// body: { customerName, customerPhone, items: [{ barcode أو productId, quantity }], shippingAddress? }
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.ORDERS_WEBHOOK_SECRET || apiKey !== process.env.ORDERS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json();
  const { customerName, customerPhone, items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "لا توجد أصناف في الأوردر" }, { status: 400 });
  }

  let customer = null;
  if (customerPhone) {
    [customer] = await db.select().from(schema.customers).where(eq(schema.customers.phone, customerPhone));
    if (!customer) {
      [customer] = await db.insert(schema.customers).values({ name: customerName || customerPhone, phone: customerPhone, type: "RETAIL" }).returning();
    }
  }

  // نحاول نطابق كل صنف بالباركود أو بالـ id
  const resolvedItems: { productId: string; quantity: number }[] = [];
  for (const item of items) {
    let product = null;
    if (item.productId) {
      [product] = await db.select().from(schema.products).where(eq(schema.products.id, item.productId));
    } else if (item.barcode) {
      [product] = await db.select().from(schema.products).where(eq(schema.products.barcode, item.barcode));
    }
    if (product) resolvedItems.push({ productId: product.id, quantity: item.quantity || 1 });
  }
  if (resolvedItems.length === 0) {
    return NextResponse.json({ error: "لم يتم التعرف على أي صنف" }, { status: 400 });
  }

  const code = "WEB-" + Date.now().toString(36).toUpperCase();
  // نحتاج مستخدم "نظام" لتسجيل الأوردر - أول أدمن نشط
  const [systemUser] = await db.select().from(schema.users).innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id)).where(eq(schema.roles.name, "ADMIN"));
  if (!systemUser) return NextResponse.json({ error: "لا يوجد مستخدم أدمن لتسجيل الأوردر عليه" }, { status: 500 });

  const [order] = await db
    .insert(schema.orders)
    .values({
      code,
      customerId: customer?.id,
      source: "WEBSITE",
      shippingMethod: "OTHER",
      status: "PREPARING",
      createdById: (systemUser as any).users.id,
    })
    .returning();

  for (const item of resolvedItems) {
    await db.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity });
  }

  await db.insert(schema.auditLogs).values({ action: "CREATE", entityType: "Order", entityId: order.id, after: { source: "WEBSITE", code } });

  return NextResponse.json({ ok: true, orderCode: code, orderId: order.id });
}
