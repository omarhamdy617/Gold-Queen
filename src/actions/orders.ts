"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock, stockShortageMessage, postCashByPaymentMethod } from "@/lib/ops";
import { inArray } from "drizzle-orm";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

// خط سير واضح لحالة الأوردر: مش أي حالة تقدر تروح لأي حالة تانية بأي ترتيب. قبل كده كان ممكن
// تحول أوردر من "قيد التجهيز" لـ"تم التسليم" على طول من غير ما يمر بـ"في الشحن"، أو ترجّع أوردر
// "مرتجع" لـ"تم التسليم" تاني وده كان بيرصد المخزون مرتين (مرة وقت الإرجاع، ومرة وهمية تانية).
// (الخريطة نفسها منقولة لـ lib/orderStatus.ts عشان الكلينت يستخدمها في فلترة القائمة المنسدلة)
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orderStatus";

// -------------------- تسجيل الأوردر (السلز/الكول سنتر) --------------------
// المكان اللي هيتجهز منه الأوردر بقى اختياري وقت التسجيل - بيتحدد بعد كده في خطوة منفصلة
// (اللي بيسجل الأوردر مش لازم يكون هو نفسه المسؤول عن تحديد المخزون/الفرع)
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
  locationId?: string;
}) {
  try {
    return await createOrderInner(input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ الأوردر");
  }
}

async function createOrderInner(input: Parameters<typeof createOrder>[0]) {
  await requirePermission("orders.manage");
  const session = await requireSession();

  if (!input.customerName?.trim()) throw new Error("اسم العميل مطلوب");
  if (!input.customerPhone?.trim()) throw new Error("رقم الهاتف مطلوب");
  if (!input.address?.trim()) throw new Error("العنوان مطلوب");
  if (!input.governorate?.trim()) throw new Error("المحافظة مطلوبة");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const order = await db.transaction(async (tx) => {
    // ربط/إنشاء العميل تلقائيًا بالهاتف عشان منعملش عميل مكرر ولما نكتب نفس الرقم تاني يترجعلنا نفس العميل
    let customerId = input.customerId;
    const phone = normalizePhone(input.customerPhone.trim());
    if (!customerId && phone) {
      const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
      if (existing) {
        customerId = existing.id;
        // حدّث بيانات العميل بأحدث عنوان/اسم لو اتغيروا
        await tx.update(schema.customers).set({ name: input.customerName.trim(), address: input.address.trim() }).where(eq(schema.customers.id, existing.id));
      } else {
        const [created] = await tx
          .insert(schema.customers)
          .values({ name: input.customerName.trim(), phone, type: "RETAIL", address: input.address.trim() })
          .returning();
        customerId = created.id;
      }
    }

    const code = genCode("ORD");
    const [order] = await tx
      .insert(schema.orders)
      .values({
        code,
        invoiceId: input.invoiceId,
        customerId,
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
        locationId: input.locationId || undefined,
        createdById: session.userId,
      })
      .returning();
    for (const item of input.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) throw new Error("فيه سطر صنف غير صحيح");
      await tx.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity });
      // لو المكان محدد من الأول بننقص المخزون فورًا، ولو لسه هيتحدد بعدين بننقصه وقت تحديد المكان (assignOrderLocation)
      if (input.locationId) {
        const newQty = await adjustStock(tx, item.productId, input.locationId, -item.quantity);
        if (newQty < 0) {
          const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
          const available = newQty + item.quantity;
          throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "المنتج", input.locationId, available, item.quantity));
        }
      }
    }
    return order;
  });

  await logAudit({ action: "CREATE", entityType: "Order", entityId: order.id, after: order });
  revalidatePath("/orders");
  revalidatePath("/products");
  revalidatePath("/customers");
  return order;
}

// -------------------- تحديد المكان اللي هيتجهز منه الأوردر (خطوة منفصلة بعد التسجيل) --------------------
export async function assignOrderLocation(orderId: string, locationId: string) {
  try {
    return await assignOrderLocationInner(orderId, locationId);
  } catch (e) {
    return toActionError(e, "تعذر تحديد المكان");
  }
}

async function assignOrderLocationInner(orderId: string, locationId: string) {
  await requirePermission("orders.ship");
  const session = await requireSession();
  if (!locationId) throw new Error("لازم تحدد المكان");

  let before: any = null;
  await db.transaction(async (tx) => {
    // قفل صف الأوردر الأول جوه المعاملة - لو اتنين ضغطوا "تحديد المكان" لنفس الأوردر في نفس اللحظة،
    // التاني هيستنى لحد ما الأول يخلص، وهيلاقي locationId اتحدد بالفعل فهيترفض بدل ما ينقص المخزون مرتين.
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");
    if (order.locationId) throw new Error("المكان اتحدد للأوردر ده بالفعل");
    before = order;

    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    for (const item of items) {
      const newQty = await adjustStock(tx, item.productId, locationId, -item.quantity);
      if (newQty < 0) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
        const available = newQty + item.quantity;
        throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "المنتج", locationId, available, item.quantity));
      }
    }
    await tx.update(schema.orders).set({ locationId, assignedById: session.userId, assignedAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "ASSIGN_LOCATION", entityType: "Order", entityId: orderId, before, after: order });
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
  try {
    return await assignOrderShippingInner(orderId, input);
  } catch (e) {
    return toActionError(e, "تعذر تحديد الشحن");
  }
}

async function assignOrderShippingInner(orderId: string, input: Parameters<typeof assignOrderShipping>[1]) {
  await requirePermission("orders.ship");
  const session = await requireSession();

  let before: any = null;
  const order = await db.transaction(async (tx) => {
    // قبل كده كانت بتقرا الأوردر بـ select عادي من غير قفل ومن غير transaction، وبعدين تعمل update
    // غير مشروط - لو اتنين فتحوا "تحديد الشحن" لنفس الأوردر في نفس اللحظة (أو حد كان بيحدّث حالته
    // لـ"تم التسليم"/"مرتجع" في نفس الوقت)، كل القراءتين كانوا بيشوفوا نفس الحالة القديمة، وآخر
    // update بيكسب من غير أي تحقق - ممكن يرجّع أوردر متسلّم لحالة "في الشحن" تاني ويمسح بيانات
        // التسليم/التحصيل المسجلة من غير أي تحذير. القفل هنا بيضمن إن أي محاولة تانية تستنى وتشوف
    // الحالة الفعلية المحدّثة قبل ما تكمل.
    const [existingOrder] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!existingOrder) throw new Error("الأوردر غير موجود");
    if (!existingOrder.locationId) throw new Error("لازم تحدد المحل/المخزن اللي هيتجهز منه الأوردر الأول قبل ما تحدد الشحن");
    if (existingOrder.status === "DELIVERED" || existingOrder.status === "RETURNED") {
      throw new Error("الأوردر ده خلص خلاص (تم التسليم أو مرتجع) - متقدرش تعدل بيانات الشحن بعد كده");
    }
    before = existingOrder;

    let courierName: string | undefined;
    let shippingCompanyName: string | undefined;
    if (input.shippingMethod === "INTERNAL_COURIER" && input.courierId) {
      const [c] = await tx.select().from(schema.couriers).where(eq(schema.couriers.id, input.courierId));
      courierName = c?.name;
    }
    if (input.shippingMethod === "EXTERNAL_COMPANY" && input.shippingCompanyId) {
      const [c] = await tx.select().from(schema.shippingCompanies).where(eq(schema.shippingCompanies.id, input.shippingCompanyId));
      shippingCompanyName = c?.name;
    }

    const [updated] = await tx
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
    return updated;
  });

  await logAudit({ action: "SHIP", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  return order;
}

// -------------------- تحديث حالة الأوردر: تجهيز/شحن/تسليم/مرتجع --------------------
export async function updateOrderStatus(
  orderId: string,
  status: "PREPARING" | "SHIPPED" | "DELIVERED" | "RETURNED",
  extra?: { collectionStatus?: "PENDING" | "COLLECTED"; collectedAmount?: number; paymentMethodId?: string; returnReason?: string }
) {
  try {
    return await updateOrderStatusInner(orderId, status, extra);
  } catch (e) {
    return toActionError(e, "تعذر تحديث حالة الأوردر");
  }
}

async function updateOrderStatusInner(
  orderId: string,
  status: "PREPARING" | "SHIPPED" | "DELIVERED" | "RETURNED",
  extra?: { collectionStatus?: "PENDING" | "COLLECTED"; collectedAmount?: number; paymentMethodId?: string; returnReason?: string }
) {
  await requirePermission("orders.ship");
  const session = await requireSession();

  if (status === "RETURNED" && !extra?.returnReason?.trim()) {
    throw new Error("لازم تكتب سبب الإرجاع");
  }
  if (status === "DELIVERED" && !extra?.collectionStatus) {
    throw new Error("لازم تحدد حالة التحصيل (تم التحصيل / لسه)");
  }
  if (status === "DELIVERED" && extra?.collectionStatus === "COLLECTED" && (extra?.collectedAmount === undefined || extra.collectedAmount < 0)) {
    throw new Error("لازم تدخل المبلغ المحصّل");
  }
  if (status === "DELIVERED" && extra?.collectionStatus === "COLLECTED" && Number(extra.collectedAmount) > 0 && !extra?.paymentMethodId) {
    // قبل كده تحصيل الأوردر كان مجرد رقم بيتسجل على الأوردر نفسه وخلاص - مبيدخلش الخزينة ولا فاتورة
    // ولا أي تقرير مالي، يعني فلوس حقيقية بتتحصّل من غير أي أثر محاسبي. دلوقتي لازم تحدد طريقة
    // التحصيل عشان تدخل فعليًا في خزينة حقيقية.
    throw new Error("لازم تحدد طريقة التحصيل (كاش/فودافون كاش/إلخ) عشان المبلغ يدخل الخزينة");
  }

  let before: any = null;
  await db.transaction(async (tx) => {
    // قفل صف الأوردر الأول - يمنع اتنين يغيروا حالة نفس الأوردر في نفس اللحظة، ويضمن إننا بنشوف
    // آخر حالة فعلية قبل ما نتأكد إن الانتقال مسموح بيه
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");
    before = order;

    if (order.status !== status) {
      const allowed = ORDER_STATUS_TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        throw new Error(`متقدرش تغيّر حالة الأوردر من "${order.status}" لـ"${status}" مباشرة - ده مش خط سير منطقي (وممكن يرصد المخزون غلط)`);
      }
    }

    const payload: any = { status, updatedAt: new Date() };
    if (status === "DELIVERED") {
      payload.collectionStatus = extra?.collectionStatus;
      payload.collectedAmount = extra?.collectionStatus === "COLLECTED" ? (extra?.collectedAmount ?? 0).toFixed(2) : null;
      payload.deliveredById = session.userId;
      payload.deliveredAt = new Date();

      // ربط تحصيل الأوردر فعليًا بالخزينة والتقارير - بس أول مرة (لو الأوردر لسه مالوش فاتورة مرتبطة
      // بيه) عشان لو حد أعاد تأكيد "تم التسليم" لأوردر متسلّم بالفعل (لتصحيح المبلغ مثلًا) منعملش
      // إدخال خزينة أو فاتورة تانية مكررة.
      const collectedAmt = Number(extra?.collectedAmount || 0);
      if (extra?.collectionStatus === "COLLECTED" && collectedAmt > 0 && extra?.paymentMethodId && !order.invoiceId) {
        const orderItems = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
        const productIds = orderItems.map((i) => i.productId);
        const prods = productIds.length ? await tx.select().from(schema.products).where(inArray(schema.products.id, productIds)) : [];
        const prodMap = new Map(prods.map((p) => [p.id, p]));
        const referenceTotal = orderItems.reduce((s, i) => s + i.quantity * Number(prodMap.get(i.productId)?.retailPrice || 0), 0);
        const scale = referenceTotal > 0 ? collectedAmt / referenceTotal : 0;

        const invCode = genCode("INV");
        const [invoice] = await tx
          .insert(schema.salesInvoices)
          .values({
            code: invCode,
            customerId: order.customerId,
            locationId: order.locationId!,
            subtotal: collectedAmt.toFixed(2),
            discount: "0.00",
            total: collectedAmt.toFixed(2),
            paidAmount: collectedAmt.toFixed(2),
            paymentStatus: "PAID",
            paymentMethodId: extra.paymentMethodId,
            source: order.source,
            notes: `فاتورة تلقائية عند تسليم/تحصيل الأوردر ${order.code}`,
            createdById: session.userId,
            soldById: order.createdById,
          })
          .returning();
        for (const item of orderItems) {
          const product = prodMap.get(item.productId);
          const unitPrice = referenceTotal > 0 ? Number(product?.retailPrice || 0) * scale : orderItems.length > 0 ? collectedAmt / orderItems.reduce((s, i) => s + i.quantity, 0) : 0;
          await tx.insert(schema.salesInvoiceItems).values({
            invoiceId: invoice.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: unitPrice.toFixed(2),
            unitCost: product?.avgCost || "0",
          });
        }
        payload.invoiceId = invoice.id;

        await postCashByPaymentMethod(tx, extra.paymentMethodId, "SALE_IN", collectedAmt, {
          note: `تحصيل أوردر توصيل ${order.code}`,
          refType: "Order",
          refId: orderId,
          createdById: session.userId,
        });
      }
    }
    if (status === "RETURNED") {
      payload.returnReason = extra?.returnReason?.trim();
    }

    if (status === "RETURNED" && order.status !== "RETURNED") {
      // رجّع الأصناف للمخزون تلقائيًا
      const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      for (const item of items) {
        if (order.locationId) await adjustStock(tx, item.productId, order.locationId, item.quantity);
      }
    }
    await tx.update(schema.orders).set(payload).where(eq(schema.orders.id, orderId));
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "UPDATE", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/sales");
  revalidatePath("/");
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
