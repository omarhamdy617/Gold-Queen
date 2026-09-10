import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { normalizePhone } from "@/lib/phone";

// نقطة استقبال أوردرات من موقع خارجي مستقبلي (جاهزية لموقع أونلاين)
// الموقع الخارجي لازم يبعت header: X-Api-Key = WEBHOOK_SECRET
// body: { customerName, customerPhone, items: [{ barcode أو productId, quantity }], shippingAddress?, governorate? }
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.ORDERS_WEBHOOK_SECRET || apiKey !== process.env.ORDERS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json();
  const { customerName, customerPhone, items, shippingAddress, governorate, shippingFee, discount } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "لا توجد أصناف في الأوردر" }, { status: 400 });
  }
  // كانت الكمية بتتقبل بلا أي تحقق (item.quantity || 1 بيغطي الصفر/الفاضي بس مش السالب) - كمية
  // سالبة هنا كانت هتتحول لاحقًا لإضافة مخزون بدل خصمه وقت تحديد مكان الأوردر (adjustStock بسالب × سالب = موجب)
  for (const item of items) {
    if (item.quantity !== undefined && (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      return NextResponse.json({ error: `كمية غير صحيحة لصنف: ${item.productId || item.barcode || "?"}` }, { status: 400 });
    }
    if (item.unitPrice !== undefined && (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) {
      return NextResponse.json({ error: `سعر غير صحيح لصنف: ${item.productId || item.barcode || "?"}` }, { status: 400 });
    }
  }

  // نحاول نطابق كل صنف بالباركود أو بالـ id - وسعر الوحدة (لو الموقع بعته) بيتسجل زي ما هو،
  // غير كده بيتسجل صفر لحد ما حد يراجعه ويأكد الأوردر تليفونيًا
  const resolvedItems: { productId: string; quantity: number; unitPrice: number }[] = [];
  for (const item of items) {
    let product = null;
    if (item.productId) {
      [product] = await db.select().from(schema.products).where(eq(schema.products.id, item.productId));
    } else if (item.barcode) {
      [product] = await db.select().from(schema.products).where(eq(schema.products.barcode, item.barcode));
    }
    if (product) resolvedItems.push({ productId: product.id, quantity: item.quantity || 1, unitPrice: Number(item.unitPrice) || 0 });
  }
  if (resolvedItems.length === 0) {
    return NextResponse.json({ error: "لم يتم التعرف على أي صنف" }, { status: 400 });
  }
  const shippingFeeNum = Number.isFinite(Number(shippingFee)) ? Math.max(Number(shippingFee), 0) : 0;
  const discountNum = Number.isFinite(Number(discount)) ? Math.max(Number(discount), 0) : 0;
  const subtotal = resolvedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = Math.max(subtotal - discountNum + shippingFeeNum, 0);

  const code = "WEB-" + Date.now().toString(36).toUpperCase();
  // نحتاج مستخدم "نظام" لتسجيل الأوردر - أول أدمن نشط
  const [systemUser] = await db.select().from(schema.users).innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id)).where(eq(schema.roles.name, "ADMIN"));
  if (!systemUser) return NextResponse.json({ error: "لا يوجد مستخدم أدمن لتسجيل الأوردر عليه" }, { status: 500 });

  // كل الإدخالات (العميل + الأوردر + بنوده + سجل التدقيق) دلوقتي جوه transaction واحدة - قبل كده
  // كانت inserts منفصلة تباعًا، فلو حصل خطأ في نص العملية (زي فشل إدخال بند واحد) كان بيفضل عميل
  // و/أو أوردر ناقص متسجلين فعليًا في القاعدة من غير ما الموقع الخارجي ياخد رد نجاح واضح.
  const { order, code: orderCode } = await db.transaction(async (tx) => {
    let customer = null;
    // كان بيستخدم رقم الهاتف الخام زي ما هو للمطابقة (eq) من غير normalizePhone - يعني نفس العميل
    // اللي بيدخل بصيغ مختلفة شويّه (+20، صفر إضافي...) كان بيتسجل كذا عميل منفصل بدل واحد بس
    const normalizedPhone = customerPhone ? normalizePhone(String(customerPhone)) : undefined;
    if (normalizedPhone) {
      [customer] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, normalizedPhone)).for("update");
      if (!customer) {
        [customer] = await tx
          .insert(schema.customers)
          .values({ name: customerName || normalizedPhone, phone: normalizedPhone, type: "RETAIL", address: shippingAddress || undefined })
          .returning();
      }
    }

    const [order] = await tx
      .insert(schema.orders)
      .values({
        code,
        customerId: customer?.id,
        // قبل كده اسم/رقم العميل وعنوان التوصيل مكنش بيتسجلوا على الأوردر نفسه خالص (رغم إن التعليق
        // في الكود القديم كان بيقول لازم نسجلهم) - يعني شاشة الأوردرات كانت بتعرضهم فاضيين تمامًا
        customerName: customerName || normalizedPhone || "",
        customerPhone: normalizedPhone || "",
        address: shippingAddress || undefined,
        governorate: governorate || undefined,
        // "website" بقى id لصف حقيقي في order_sources بدل قيمة enum ثابتة (نفس القيمة اللي
        // اتزرعت بيها في migration 0008 - لو حد مسح مصدر "الموقع" من الإعدادات، الـ webhook ده
        // هيبدأ يفشل بخطأ قيد foreign key لحد ما يتضاف تاني أو يتغيّر الكود هنا).
        source: "website",
        // الأوردر بيدخل "في الانتظار" زي أي أوردر تاني - لازم يتأكد تليفونيًا الأول قبل ما يتحدد
        // مكانه ويتحجز مخزونه (نفس خط سير الأوردرات اليدوية بالظبط)
        status: "PENDING",
        subtotal: subtotal.toFixed(2),
        discount: discountNum.toFixed(2),
        shippingFee: shippingFeeNum.toFixed(2),
        total: total.toFixed(2),
        createdById: (systemUser as any).users.id,
      })
      .returning();

    for (const item of resolvedItems) {
      await tx.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2) });
    }

    await tx.insert(schema.auditLogs).values({ action: "CREATE", entityType: "Order", entityId: order.id, after: { source: "website", code } });
    return { order, code };
  });

  return NextResponse.json({ ok: true, orderCode, orderId: order.id });
}
