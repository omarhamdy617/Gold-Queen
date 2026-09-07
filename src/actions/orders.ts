"use server";
import { db, schema } from "@/db";
import { eq, desc, and, or, ilike, gte, sql } from "drizzle-orm";
import { requirePermission, requireAnyPermission, requireSession, requireAdminRole, logAudit, genCode } from "@/lib/auth";
import { adjustStock, stockShortageMessage, postCashByPaymentMethod, updateCustomerBalance } from "@/lib/ops";
import { inArray } from "drizzle-orm";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

// خط سير واضح لحالة الأوردر: مش أي حالة تقدر تروح لأي حالة تانية بأي ترتيب. الخريطة نفسها منقولة
// لـ lib/orderStatus.ts عشان الكلينت يستخدمها في فلترة القائمة المنسدلة وعرض التسميات/الألوان
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orderStatus";

// -------------------- تسجيل الأوردر (السلز/الكول سنتر) --------------------
// المكان اللي هيتجهز منه الأوردر بقى اختياري وقت التسجيل - بيتحدد بعد كده في خطوة منفصلة، وكمان
// الأوردر بيدخل بحالة "في الانتظار" ولازم يتأكد تليفونيًا الأول قبل ما أي مخزون يتحجز له (confirmOrder).
// السعر بيتكتب يدويًا هنا (مش بياخد سعر المنتج المسجل تلقائيًا) - اللي بيسجل الأوردر هو اللي كاتب
// السعر المتفق عليه فعليًا مع العميل.
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
  items: { productId: string; quantity: number; unitPrice: number }[];
  discount?: number;
  shippingFee?: number;
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
  for (const item of input.items) {
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error("سعر الصنف غير صحيح");
  }
  const discount = Number(input.discount || 0);
  const shippingFee = Number(input.shippingFee || 0);
  if (!Number.isFinite(discount) || discount < 0) throw new Error("قيمة الخصم غير صحيحة");
  if (!Number.isFinite(shippingFee) || shippingFee < 0) throw new Error("مصاريف الشحن غير صحيحة");
  const subtotal = input.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0);
  const total = subtotal - discount + shippingFee;
  if (total < 0) throw new Error("الإجمالي طلع بالسالب - راجع الخصم/الأسعار");

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

    // لو المكان اتحدد من الأول (استخدام برمجي/API مش من شاشة التسجيل العادية) بنعتبر الأوردر ده
    // متأكد تلقائيًا وبنحجز المخزون على طول - غير كده الأوردر بيدخل "في الانتظار" لحد ما حد يأكده
    const autoConfirmed = !!input.locationId;

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
        status: autoConfirmed ? "PREPARING" : "PENDING",
        locationId: input.locationId || undefined,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        total: total.toFixed(2),
        confirmedById: autoConfirmed ? session.userId : undefined,
        confirmedAt: autoConfirmed ? new Date() : undefined,
        createdById: session.userId,
      })
      .returning();
    for (const item of input.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) throw new Error("فيه سطر صنف غير صحيح");
      await tx.insert(schema.orderItems).values({ orderId: order.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2) });
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

// -------------------- كشف التكرار: نفس الرقم سجّل أوردر تاني قريب --------------------
// بيحصل كتير من دبل كليك على فورم الموقع أو تسجيل نفس الأوردر مرتين غلط من الكول سنتر - بنحذّر بس
// من غير ما نمنع التسجيل، لأن ممكن يكون فعلاً أوردر تاني حقيقي بنفس الرقم
export async function checkDuplicateOrder(phone: string) {
  try {
    return await checkDuplicateOrderInner(phone);
  } catch (e) {
    return toActionError(e, "تعذر فحص التكرار");
  }
}

async function checkDuplicateOrderInner(phone: string) {
  await requirePermission("orders.manage");
  const normalized = normalizePhone(phone.trim());
  if (!normalized) return { found: false as const };
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ code: schema.orders.code, createdAt: schema.orders.createdAt, customerPhone: schema.orders.customerPhone, status: schema.orders.status })
    .from(schema.orders)
    .where(and(gte(schema.orders.createdAt, since), sql`${schema.orders.status} != 'CANCELLED'`));
  const match = recent.find((o) => normalizePhone(o.customerPhone) === normalized);
  if (!match) return { found: false as const };
  return { found: true as const, code: match.code, createdAt: match.createdAt, status: match.status };
}

// -------------------- تأكيد الأوردر تليفونيًا (خطوة قبل تحديد المكان/حجز المخزون) --------------------
export async function confirmOrder(orderId: string) {
  try {
    return await confirmOrderInner(orderId);
  } catch (e) {
    return toActionError(e, "تعذر تأكيد الأوردر");
  }
}

async function confirmOrderInner(orderId: string) {
  await requireAnyPermission(["orders.confirm", "orders.ship"]);
  const session = await requireSession();

  let before: any = null;
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");
    if (order.status !== "PENDING") throw new Error(`الأوردر ده مش في حالة "الانتظار" - متقدرش تأكده دلوقتي`);
    before = order;
    await tx
      .update(schema.orders)
      .set({ status: "CONFIRMED", confirmedById: session.userId, confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "CONFIRM", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  return order;
}

// -------------------- تسجيل محاولة اتصال (من غير ما تأكد أو تلغي) --------------------
export async function logOrderAttempt(orderId: string, result: "NO_ANSWER" | "WRONG_NUMBER" | "POSTPONED" | "OTHER", note?: string) {
  try {
    return await logOrderAttemptInner(orderId, result, note);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل المحاولة");
  }
}

async function logOrderAttemptInner(orderId: string, result: "NO_ANSWER" | "WRONG_NUMBER" | "POSTPONED" | "OTHER", note?: string) {
  await requireAnyPermission(["orders.confirm", "orders.ship"]);

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new Error("الأوردر غير موجود");
  if (order.status !== "PENDING") throw new Error(`الأوردر ده اتأكد أو اتلغى بالفعل`);

  await db
    .update(schema.orders)
    .set({
      confirmationAttempts: order.confirmationAttempts + 1,
      lastAttemptAt: new Date(),
      lastAttemptResult: result,
      lastAttemptNote: note?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, orderId));

  revalidatePath("/orders");
  const [updated] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  return updated;
}

// -------------------- إلغاء الأوردر قبل الشحن (حالة منفصلة عن "مرتجع") --------------------
export async function cancelOrder(orderId: string, reason: string) {
  try {
    return await cancelOrderInner(orderId, reason);
  } catch (e) {
    return toActionError(e, "تعذر إلغاء الأوردر");
  }
}

async function cancelOrderInner(orderId: string, reason: string) {
  await requireAnyPermission(["orders.manage", "orders.confirm", "orders.ship"]);
  const session = await requireSession();
  if (!reason?.trim()) throw new Error("لازم تكتب سبب الإلغاء");

  let before: any = null;
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");
    if (!["PENDING", "CONFIRMED", "PREPARING"].includes(order.status)) {
      throw new Error(`الأوردر ده اتشحن بالفعل أو خلص - متقدرش تلغيه (استخدم "مرتجع" بدل كده)`);
    }
    before = order;

    // لو كان اتحدد له مكان (يعني اتحجز مخزون فعليًا وقت "تحديد المكان")، لازم نرجّع الكمية للمخزون
    if (order.locationId) {
      const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      for (const item of items) {
        await adjustStock(tx, item.productId, order.locationId, item.quantity);
      }
    }

    await tx
      .update(schema.orders)
      .set({ status: "CANCELLED", cancelReason: reason.trim(), cancelledById: session.userId, cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "CANCEL", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  revalidatePath("/products");
  return order;
}

// -------------------- تحديد المكان اللي هيتجهز منه الأوردر (خطوة منفصلة بعد التأكيد) --------------------
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
    // مينفعش نحجز مخزون لأوردر لسه ما اتأكدش تليفونيًا - لو اتلغى بعدها هيبقى حجزنا مخزون من غير داعي
    if (order.status === "PENDING") throw new Error("لازم تأكد الأوردر مع العميل الأول قبل ما تحدد مكان تجهيزه");
    if (order.status !== "CONFIRMED") throw new Error("الأوردر ده مش في حالة تسمح بتحديد المكان دلوقتي");
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
    await tx
      .update(schema.orders)
      .set({ locationId, status: "PREPARING", assignedById: session.userId, assignedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));
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
    // القفل هنا بيضمن إن أي محاولة تانية تستنى وتشوف الحالة الفعلية المحدّثة قبل ما تكمل.
    const [existingOrder] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!existingOrder) throw new Error("الأوردر غير موجود");
    if (!existingOrder.locationId) throw new Error("لازم تحدد المحل/المخزن اللي هيتجهز منه الأوردر الأول قبل ما تحدد الشحن");
    if (["DELIVERED", "RETURNED", "CANCELLED"].includes(existingOrder.status)) {
      throw new Error("الأوردر ده خلص خلاص (تم التسليم/مرتجع/ملغي) - متقدرش تعدل بيانات الشحن بعد كده");
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

// -------------------- تحديث حالة الأوردر: تسليم/مرتجع (اللي قبلهم بيتم عن طريق دوال مخصصة) --------------------
export async function updateOrderStatus(
  orderId: string,
  status: "DELIVERED" | "RETURNED",
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
  status: "DELIVERED" | "RETURNED",
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
        // بدل ما نوزّع المبلغ المحصّل على أسعار بيع المنتجات (اللي ممكن تختلف عن سعر الأوردر المتفق
        // عليه)، بنستخدم سعر كل صنف زي ما اتكتب فعليًا وقت تسجيل الأوردر (order_items.unit_price)
        const referenceTotal = orderItems.reduce((s, i) => s + i.quantity * Number(i.unitPrice || 0), 0);
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
          const unitPrice = referenceTotal > 0 ? Number(item.unitPrice || 0) * scale : orderItems.length > 0 ? collectedAmt / orderItems.reduce((s, i) => s + i.quantity, 0) : 0;
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

      // لو الأوردر ده كان اتسلّم وحُصّل فعلًا (معاه فاتورة مرتبطة اتعملت وقت "تم التسليم")، إرجاعه
      // دلوقتي كان قبل كده بيرجّع المخزون بس ويسيب الفاتورة والفلوس المحصّلة زي ما هي بالظبط - يعني
      // التقارير المالية والداشبورد كانوا لسه شايفين المبيعة دي "قايمة ومحصّلة" رغم إن البضاعة رجعت
      // فعليًا والعميل المفروض ياخد فلوسه (أو تتخصم من حسابه). دلوقتي بنعكس نفس أثر "حذف الفاتورة"
      // (فلوس + رصيد العميل) بالظبط - بدون لمس المخزون تاني (اتعالج فوق أصلًا في نفس الخطوة).
      if (order.invoiceId) {
        const [invoice] = await tx.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, order.invoiceId)).for("update");
        if (invoice) {
          const unpaid = Number(invoice.total) - Number(invoice.paidAmount);
          if (unpaid !== 0 && invoice.customerId) {
            await updateCustomerBalance(tx, invoice.customerId, -unpaid);
          }
          if (Number(invoice.paidAmount) > 0 && invoice.paymentMethodId) {
            await postCashByPaymentMethod(tx, invoice.paymentMethodId, "RETURN_OUT", Number(invoice.paidAmount), {
              note: `إرجاع أوردر ${order.code} - عكس تحصيل الفاتورة ${invoice.code}`,
              refType: "Order",
              refId: orderId,
              createdById: session.userId,
            });
          }
          // لازم نصفّر orders.invoice_id فعليًا في قاعدة البيانات الأول (استعلام UPDATE منفصل، مش بس
          // في متغير payload اللي هيتحفظ في الآخر) قبل ما نمسح صف الفاتورة نفسه - وإلا الحذف هيترفض
          // فورًا بخطأ foreign key لأن صف الأوردر لسه بيشاور فعليًا على فاتورة بنحاول نمسحها.
          payload.invoiceId = null;
          await tx.update(schema.orders).set({ invoiceId: null }).where(eq(schema.orders.id, orderId));
          await tx.delete(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.invoiceId, invoice.id));
          await tx.delete(schema.salesInvoices).where(eq(schema.salesInvoices.id, invoice.id));
        }
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

// حجم الصفحة الافتراضي لقائمة الأوردرات - قبل كده كانت الشاشة بتجيب لحد 500 أوردر مرة واحدة وتعرضهم
// كلهم كـ 500 صف تفاعلي (كل صف فيه StatusControl عنده كذا useState لوحده) - ده كان سبب رئيسي في
// إن الصفحة "بتهنج" وبتاخر في المتصفح كل ما عدد الأوردرات يكبر، حتى لو السيرفر نفسه رد بسرعة
const ORDERS_PAGE_SIZE = 60;

export async function listOrders(status?: string, search?: string, page: number = 1) {
  await requirePermission("orders.manage");
  const trimmed = search?.trim();
  const conditions = [];
  if (status && status !== "ALL") conditions.push(eq(schema.orders.status, status as any));
  if (trimmed) {
    conditions.push(
      or(
        ilike(schema.orders.code, `%${trimmed}%`),
        ilike(schema.orders.customerName, `%${trimmed}%`),
        ilike(schema.orders.customerPhone, `%${trimmed}%`)
      )
    );
  }
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const rows = await db
    .select()
    .from(schema.orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.orders.createdAt))
    .limit(ORDERS_PAGE_SIZE + 1) // بنجيب صف زيادة بس عشان نعرف لو فيه صفحة تانية بعدها - من غير ما نعمل count() منفصل
    .offset((safePage - 1) * ORDERS_PAGE_SIZE);
  const hasMore = rows.length > ORDERS_PAGE_SIZE;
  return { rows: rows.slice(0, ORDERS_PAGE_SIZE), hasMore, page: safePage, pageSize: ORDERS_PAGE_SIZE };
}

// -------------------- إحصائيات أعلى صفحة الأوردرات --------------------
// قبل كده كانت بتجيب كل صفوف وكل أعمدة جدول الأوردرات كامل (من غير حد أقصى) وتحسب العدادات بـ
// filter() في الجافاسكريبت - يعني كل ما عدد الأوردرات يكبر (خصوصًا بعد شهور من الشغل)، الصفحة
// كانت بتاخد وقت أطول وأطول لحد ما توصل لحد الـ timeout بتاع السيرفر (Vercel) وتظهر "network error".
// دلوقتي استعلام واحد بس بيرجع العدد النهائي لكل حالة من قاعدة البيانات نفسها (GROUP BY)
export async function getOrderStats() {
  await requirePermission("orders.manage");
  const rows = await db
    .select({ status: schema.orders.status, count: sql<number>`count(*)`.as("count") })
    .from(schema.orders)
    .groupBy(schema.orders.status);
  const pendingCollectionRows = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "DELIVERED"), eq(schema.orders.collectionStatus, "PENDING")));

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = Number(r.count);
    total += Number(r.count);
  }
  const pending = byStatus.PENDING || 0;
  const confirmed = byStatus.CONFIRMED || 0;
  const preparing = byStatus.PREPARING || 0;
  const shipped = byStatus.SHIPPED || 0;
  const delivered = byStatus.DELIVERED || 0;
  const returned = byStatus.RETURNED || 0;
  const cancelled = byStatus.CANCELLED || 0;
  const pendingCollection = Number(pendingCollectionRows[0]?.count || 0);
  const inProgress = confirmed + preparing + shipped;
  return { total, pending, confirmed, preparing, shipped, delivered, returned, cancelled, inProgress, pendingCollection };
}

export async function getOrderItems(orderId: string) {
  await requirePermission("orders.manage");
  return db
    .select({ id: schema.orderItems.id, productId: schema.orderItems.productId, quantity: schema.orderItems.quantity, unitPrice: schema.orderItems.unitPrice, productName: schema.products.name })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
    .where(eq(schema.orderItems.orderId, orderId));
}

// -------------------- تفاصيل أوردر كاملة --------------------
export async function getOrder(orderId: string) {
  await requirePermission("orders.manage");
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;

  const [creator, assigner, deliverer, confirmer, canceller] = await Promise.all([
    order.createdById ? db.select().from(schema.users).where(eq(schema.users.id, order.createdById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.assignedById ? db.select().from(schema.users).where(eq(schema.users.id, order.assignedById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.deliveredById ? db.select().from(schema.users).where(eq(schema.users.id, order.deliveredById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.confirmedById ? db.select().from(schema.users).where(eq(schema.users.id, order.confirmedById)).then((r) => r[0]) : Promise.resolve(undefined),
    order.cancelledById ? db.select().from(schema.users).where(eq(schema.users.id, order.cancelledById)).then((r) => r[0]) : Promise.resolve(undefined),
  ]);

  const items = await db
    .select({ id: schema.orderItems.id, productId: schema.orderItems.productId, quantity: schema.orderItems.quantity, unitPrice: schema.orderItems.unitPrice, productName: schema.products.name })
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
    confirmedByName: confirmer?.fullName,
    cancelledByName: canceller?.fullName,
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

// -------------------- تعديل بيانات الأوردر بعد التسجيل (اسم/هاتف/عنوان/أصناف/أسعار) --------------------
// متاح طول ما الأوردر لسه ماوصلش لحالة نهائية (تم التسليم/مرتجع/ملغي) - لو محتاج تصحح أوردر خلص
// خلاص، استخدم "تراجع عن آخر تحديث" (أدمن فقط) الأول عشان ترجعه لحالة قابلة للتعديل.
export async function updateOrderDetails(orderId: string, input: {
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  address: string;
  governorate: string;
  source?: "WEBSITE" | "PHONE" | "WHATSAPP" | "FACEBOOK" | "OTHER";
  prepaid?: boolean;
  orderNotes?: string;
  deliveryNotes?: string;
  discount?: number;
  shippingFee?: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
}) {
  try {
    return await updateOrderDetailsInner(orderId, input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ تعديلات الأوردر");
  }
}

async function updateOrderDetailsInner(orderId: string, input: Parameters<typeof updateOrderDetails>[1]) {
  await requirePermission("orders.manage");

  if (!input.customerName?.trim()) throw new Error("اسم العميل مطلوب");
  if (!input.customerPhone?.trim()) throw new Error("رقم الهاتف مطلوب");
  if (!input.address?.trim()) throw new Error("العنوان مطلوب");
  if (!input.governorate?.trim()) throw new Error("المحافظة مطلوبة");
  if (!input.items || input.items.length === 0) throw new Error("لازم يفضل صنف واحد على الأقل في الأوردر");
  for (const item of input.items) {
    if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("فيه سطر صنف غير صحيح");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error("سعر الصنف غير صحيح");
  }
  const discount = Number(input.discount || 0);
  const shippingFee = Number(input.shippingFee || 0);
  if (!Number.isFinite(discount) || discount < 0) throw new Error("قيمة الخصم غير صحيحة");
  if (!Number.isFinite(shippingFee) || shippingFee < 0) throw new Error("مصاريف الشحن غير صحيحة");
  const subtotal = input.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0);
  const total = subtotal - discount + shippingFee;
  if (total < 0) throw new Error("الإجمالي طلع بالسالب - راجع الخصم/الأسعار");

  let before: any = null;
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");
    if (["DELIVERED", "RETURNED", "CANCELLED"].includes(order.status)) {
      throw new Error('الأوردر ده خلص خلاص (تم التسليم/مرتجع/ملغي) - متقدرش تعدل بياناته دلوقتي. لو محتاج تصحح غلطة، استخدم "تراجع عن آخر تحديث" (أدمن) الأول');
    }
    before = order;

    const oldItems = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));

    // لو المخزون كان اتحجز فعليًا (الأوردر بقى له مكان محدد - قيد التجهيز أو في الشحن)، لازم نرجّع
    // الكميات القديمة للمخزون الأول وبعدين ننقص الكميات الجديدة - عشان أي تعديل في الأصناف/الكميات
    // ينعكس صح على رصيد المخزون الفعلي بدل ما يفضل محجوز بكمية قديمة غلط
    if (order.locationId) {
      for (const item of oldItems) {
        await adjustStock(tx, item.productId, order.locationId, item.quantity);
      }
    }

    await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    for (const item of input.items) {
      await tx.insert(schema.orderItems).values({ orderId, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2) });
    }

    if (order.locationId) {
      for (const item of input.items) {
        const newQty = await adjustStock(tx, item.productId, order.locationId, -item.quantity);
        if (newQty < 0) {
          const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
          const available = newQty + item.quantity;
          throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "المنتج", order.locationId, available, item.quantity));
        }
      }
    }

    // ربط/تحديث بيانات العميل بنفس أسلوب تسجيل الأوردر
    let customerId = order.customerId;
    const phone = normalizePhone(input.customerPhone.trim());
    if (phone) {
      if (customerId) {
        await tx.update(schema.customers).set({ name: input.customerName.trim(), address: input.address.trim() }).where(eq(schema.customers.id, customerId));
      } else {
        const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
        if (existing) customerId = existing.id;
        else {
          const [created] = await tx
            .insert(schema.customers)
            .values({ name: input.customerName.trim(), phone, type: "RETAIL", address: input.address.trim() })
            .returning();
          customerId = created.id;
        }
      }
    }

    await tx
      .update(schema.orders)
      .set({
        customerId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        customerPhone2: input.customerPhone2?.trim() || null,
        address: input.address.trim(),
        governorate: input.governorate.trim(),
        source: input.source || order.source,
        prepaid: input.prepaid ?? order.prepaid,
        orderNotes: input.orderNotes?.trim() || null,
        deliveryNotes: input.deliveryNotes?.trim() || null,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        total: total.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, orderId));
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  // اسم حدث مختلف عن "UPDATE" (اللي بيستخدمها updateOrderStatus لتغيير الحالة نفسها) عشان
  // "تراجع عن آخر تحديث" (revertOrderStatus) يقدر يفرّق بين تعديل بيانات عادي وتغيير حالة حقيقي،
  // ويرجع بالظبط لآخر حالة اتغيرت مش يتلخبط بتعديلات البيانات اللي في النص
  await logAudit({ action: "EDIT_DETAILS", entityType: "Order", entityId: orderId, before, after: order });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/products");
  revalidatePath("/customers");
  return order;
}

// معاينة بس (من غير أي تعديل) لآخر حالة كان عليها الأوردر - بتستخدمها الواجهة عشان تعرض للأدمن
// "هيرجع لحالة إيه" على زرار التراجع قبل ما يدوس عليه، ولو مفيش حاجة يرجعلها بترجع null
// آخر سجل تدقيق فعلي على الأوردر ده - من ضمن التغييرات الجوهرية *و* "تراجع" سابق مع بعض، عشان لو
// آخر حاجة حصلت فعليًا كانت "تراجع" بالفعل، نعرف إن مفيش حاجة تانية نرجعها ونخفي الزرار. قبل كده
// كان بيدوّر بس على أفعال التغيير (CONFIRM/ASSIGN_LOCATION/...) وبيتجاهل "REVERT_STATUS" تمامًا -
// فكان بيلاقي نفس آخر تغيير حقيقي حتى بعد ما يترجع بالفعل، والزرار كان فاضل ظاهر وقابل للدوس تاني
// على نفس السجل القديم (ده اللي كان بيسبب تراجع مكرر على نفس العملية - راجع revertOrderStatusInner).
const STATUS_ACTIONS = ["CONFIRM", "ASSIGN_LOCATION", "SHIP", "UPDATE", "CANCEL"];
async function getLastOrderStatusLog(orderId: string) {
  const [lastLog] = await db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.entityType, "Order"), eq(schema.auditLogs.entityId, orderId), inArray(schema.auditLogs.action, [...STATUS_ACTIONS, "REVERT_STATUS"])))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1);
  return lastLog;
}

export async function getRevertPreviewStatus(orderId: string) {
  const lastLog = await getLastOrderStatusLog(orderId);
  if (!lastLog || lastLog.action === "REVERT_STATUS") return null;
  const before = lastLog.before as any;
  return before?.status || null;
}

// -------------------- تراجع عن آخر تحديث لحالة الأوردر (أدمن فقط) --------------------
// لو حد غيّر حالة الأوردر غلط (دوس على الحالة الغلط، أكد تسليم بالغلط، ألغى أوردر غلط...)، الأدمن
// بس يقدر يرجّعه لآخر حالة كان عليها - وبيرجّع معاها أي أثر جانبي حصل وقتها (مخزون اتحجز/اترجع،
// فاتورة وتحصيل اتسجلوا) عشان الأرقام تفضل متوافقة مع الواقع، مش بس اسم الحالة يتغير.
export async function revertOrderStatus(orderId: string) {
  try {
    return await revertOrderStatusInner(orderId);
  } catch (e) {
    return toActionError(e, "تعذر التراجع عن آخر تحديث للأوردر");
  }
}

async function revertOrderStatusInner(orderId: string) {
  await requireAdminRole();
  const session = await requireSession();

  // كان بيدوّر بس على آخر سجل من أفعال التغيير (من غير ما يعتبر "REVERT_STATUS")، فكان ممكن تدوس
  // "تراجع" مرتين على نفس العملية (مرة بعد الصفحة بتتحدّث، أو ضغط تاني بعدين): المرة التانية كانت
  // بتلاقي *نفس* السجل القديم تاني وتحاول تعكس نفس الأثر مرة كمان - في حالة الإلغاء (CANCEL) بالذات
  // ده كان بيسبب خصم كمية من المخزون مرتين فعليًا (تلف بيانات مخزون صامت، من غير أي رسالة خطأ).
  // دلوقتي لو آخر حاجة حصلت فعليًا للأوردر ده كانت "تراجع" بالفعل، بنرفض من الأول بدل ما نعيد التنفيذ.
  const lastLog = await getLastOrderStatusLog(orderId);
  if (!lastLog) throw new Error("مفيش سجل تغيير حالة سابق للأوردر ده عشان نرجع له");
  if (lastLog.action === "REVERT_STATUS") {
    throw new Error("آخر عملية اتسجلت على الأوردر ده كانت تراجع بالفعل - مفيش حاجة تانية نرجعها تلقائيًا");
  }
  const before = lastLog.before as any;
  if (!before || !before.status) throw new Error("سجل التدقيق ده مبيحتويش على حالة سابقة صالحة للرجوع ليها");

  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new Error("الأوردر غير موجود");

    const payload: any = { status: before.status, updatedAt: new Date() };

    if (lastLog.action === "CONFIRM") {
      payload.confirmedById = before.confirmedById;
      payload.confirmedAt = before.confirmedAt;
    } else if (lastLog.action === "ASSIGN_LOCATION") {
      // كان اتحجز مخزون وقت تحديد المكان - نرجعه قبل ما نمسح المكان من الأوردر
      const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      for (const item of items) {
        if (order.locationId) await adjustStock(tx, item.productId, order.locationId, item.quantity);
      }
      payload.locationId = before.locationId ?? null;
      payload.assignedById = before.assignedById ?? null;
      payload.assignedAt = before.assignedAt ?? null;
    } else if (lastLog.action === "SHIP") {
      payload.shippingMethod = before.shippingMethod ?? null;
      payload.courierId = before.courierId ?? null;
      payload.courierName = before.courierName ?? null;
      payload.shippingCompanyId = before.shippingCompanyId ?? null;
      payload.shippingCompanyName = before.shippingCompanyName ?? null;
      payload.assignedById = before.assignedById ?? null;
      payload.assignedAt = before.assignedAt ?? null;
    } else if (lastLog.action === "UPDATE" && order.status === "DELIVERED") {
      // لو الفاتورة والتحصيل اتسجلوا فعلًا وقت التسليم ده بالذات (مكانوش موجودين قبل كده)، لازم نلغيهم
      if (order.invoiceId && !before.invoiceId) {
        const [invoice] = await tx.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, order.invoiceId)).for("update");
        if (invoice) {
          if (invoice.paymentMethodId && Number(invoice.paidAmount) > 0) {
            await postCashByPaymentMethod(tx, invoice.paymentMethodId, "ADJUSTMENT", Number(invoice.paidAmount), {
              direction: "out",
              note: `عكس تحصيل الأوردر ${order.code} (تراجع أدمن عن تحديث غلط)`,
              refType: "Order",
              refId: orderId,
              createdById: session.userId,
            });
          }
          // لازم نصفّر orders.invoice_id فعليًا في قاعدة البيانات (UPDATE منفصل) قبل ما نمسح صف
          // الفاتورة - قبل كده كان بيتصفر بس في متغير payload اللي بيتحفظ في آخر الترانزاكشن، يعني
          // وقت تنفيذ DELETE على sales_invoices، صف الأوردر كان لسه بيشاور عليها فعليًا في قاعدة
          // البيانات، فالحذف كان بيترفض دايمًا بخطأ foreign key - يعني التراجع عن تسليم محصّل كان
          // فاشل 100% من المرة الأولى (مش بس حالة نادرة)، والأدمن كان بياخد رسالة خطأ عامة مكانش
          // واضح منها السبب.
          await tx.update(schema.orders).set({ invoiceId: null }).where(eq(schema.orders.id, orderId));
          await tx.delete(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.invoiceId, invoice.id));
          await tx.delete(schema.salesInvoices).where(eq(schema.salesInvoices.id, invoice.id));
        }
      }
      payload.collectionStatus = before.collectionStatus ?? null;
      payload.collectedAmount = before.collectedAmount ?? null;
      payload.deliveredById = before.deliveredById ?? null;
      payload.deliveredAt = before.deliveredAt ?? null;
      payload.invoiceId = before.invoiceId ?? null;
    } else if (lastLog.action === "UPDATE" && order.status === "RETURNED") {
      // كان اترجع للمخزون وقت التسجيل كمرتجع (لو كان له مكان محدد) - ننقصه تاني
      if (order.locationId) {
        const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
        for (const item of items) {
          const newQty = await adjustStock(tx, item.productId, order.locationId, -item.quantity);
          if (newQty < 0) {
            const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
            const available = newQty + item.quantity;
            throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "المنتج", order.locationId, available, item.quantity));
          }
        }
      }
      payload.returnReason = null;
      payload.collectionStatus = before.collectionStatus ?? null;
      payload.collectedAmount = before.collectedAmount ?? null;
      payload.deliveredById = before.deliveredById ?? null;
      payload.deliveredAt = before.deliveredAt ?? null;
    } else if (lastLog.action === "CANCEL") {
      // كان اترجع المخزون وقت الإلغاء (لو كان اتحدد له مكان) - ننقصه تاني
      if (order.locationId) {
        const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
        for (const item of items) {
          const newQty = await adjustStock(tx, item.productId, order.locationId, -item.quantity);
          if (newQty < 0) {
            const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
            const available = newQty + item.quantity;
            throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "المنتج", order.locationId, available, item.quantity));
          }
        }
      }
      payload.cancelReason = null;
      payload.cancelledById = null;
      payload.cancelledAt = null;
    } else {
      throw new Error("مش قادر أحدد إزاي أرجع الحالة دي تلقائيًا - راجع الأوردر يدويًا من غير الزرار ده");
    }

    await tx.update(schema.orders).set(payload).where(eq(schema.orders.id, orderId));
    return { previousStatus: order.status };
  });

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  await logAudit({ action: "REVERT_STATUS", entityType: "Order", entityId: orderId, before: { status: result.previousStatus }, after: order });
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/sales");
  revalidatePath("/");
  return order;
}
