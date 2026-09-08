"use server";
import { db, schema } from "@/db";
import { eq, and, gte, lte, like, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock, updateConsignmentBalance, postCashByPaymentMethod, stockShortageMessage, checkConsignmentLimit } from "@/lib/ops";
import { toActionError, pgConstraintCode } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export async function listEmployees() {
  await requirePermission("consignments.manage");
  // كانت db.select().from(schema.users) من غير تحديد أعمدة - وده كان بيرجّع passwordHash (كلمة السر
  // المشفرة) وباقي أعمدة حساسة (failedLoginAttempts, lockedUntil) لأي مستخدم عنده صلاحية إدارة
  // العُهد بس (مش أدمن)، وكانت القيم دي بتوصل لمتصفح العميل عادي جوه بيانات صفحة العُهد. بنحدد الأعمدة
  // المطلوبة فعليًا بس (زي listUsers بالظبط) عشان الـ hash متسربش خالص برا السيرفر.
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      active: schema.users.active,
      roleId: schema.users.roleId,
    })
    .from(schema.users)
    .where(eq(schema.users.active, true));
}

export async function listConsignments() {
  await requirePermission("consignments.manage");
  const rows = await db
    .select({
      id: schema.consignments.id,
      balance: schema.consignments.balance,
      limitAmount: schema.consignments.limitAmount,
      active: schema.consignments.active,
      holderName: schema.users.fullName,
      holderId: schema.users.id,
    })
    .from(schema.consignments)
    .innerJoin(schema.users, eq(schema.consignments.holderId, schema.users.id))
    // كانت من غير حد أقصى للسطور - مش مشكلة دلوقتي بعدد الموظفين الحالي، لكن سقف أمان يمنع
    // الشاشة من التقيل لو عدد العهد كبر كتير مستقبلًا (نفس أسلوب listOrders/listSales بالظبط)
    .limit(500);

  // قبل كده الشاشة كانت بتوريك "الرصيد المالي" بس لكل موظف، ومش بتوريك "معاه كام قطعة فعليًا"
  // من غير ما تفتح "تفاصيل" كل عهدة لوحدها - وده كان بيصعّب متابعة كل الموظفين مرة واحدة بنظرة
  // سريعة. بنحسب هنا إجمالي الكمية والقيمة المتبقية فعليًا (مش راجعة ولا اتباعت) لكل عهدة، عشان
  // تظهر في كارت الملخص نفسه.
  const itemRows = await db
    .select({
      consignmentId: schema.consignmentItems.consignmentId,
      quantity: schema.consignmentItems.quantity,
      returnedQty: schema.consignmentItems.returnedQty,
      soldQty: schema.consignmentItems.soldQty,
      unitPrice: schema.consignmentItems.unitPrice,
    })
    .from(schema.consignmentItems);
  const remainingByConsignment = new Map<string, { qty: number; value: number }>();
  for (const r of itemRows) {
    const remaining = r.quantity - r.returnedQty - r.soldQty;
    if (remaining <= 0) continue;
    const cur = remainingByConsignment.get(r.consignmentId) || { qty: 0, value: 0 };
    cur.qty += remaining;
    cur.value += remaining * Number(r.unitPrice);
    remainingByConsignment.set(r.consignmentId, cur);
  }
  return rows.map((r) => ({
    ...r,
    remainingQty: remainingByConsignment.get(r.id)?.qty || 0,
    remainingValue: remainingByConsignment.get(r.id)?.value || 0,
  }));
}

// عمر أقدم صنف لسه متبقي (مش راجع ولا اتباع بالكامل) لكل عهدة - عشان نقدر نبني تنبيه/شارة
// "عهدة قديمة" بدل ما البضاعة تقعد شهور مع موظف من غير ما حد ياخد باله
export async function getOldestPendingItemAge() {
  await requirePermission("consignments.manage");
  const rows = await db
    .select({
      consignmentId: schema.consignmentItems.consignmentId,
      createdAt: schema.consignmentItems.createdAt,
      quantity: schema.consignmentItems.quantity,
      returnedQty: schema.consignmentItems.returnedQty,
      soldQty: schema.consignmentItems.soldQty,
    })
    .from(schema.consignmentItems);
  const oldestByConsignment = new Map<string, Date>();
  for (const r of rows) {
    if (r.quantity - r.returnedQty - r.soldQty <= 0) continue;
    const current = oldestByConsignment.get(r.consignmentId);
    if (!current || new Date(r.createdAt) < current) oldestByConsignment.set(r.consignmentId, new Date(r.createdAt));
  }
  return Object.fromEntries(oldestByConsignment);
}

export async function giveConsignment(input: {
  holderId: string;
  locationId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
}) {
  try {
    return await giveConsignmentInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل العهدة");
  }
}

async function giveConsignmentInner(input: Parameters<typeof giveConsignment>[0]) {
  await requirePermission("consignments.manage");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
  for (const it of input.items) {
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new Error("الكمية لازم تكون رقم أكبر من صفر لكل صنف");
    if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) throw new Error("السعر لازم يكون رقم صحيح (مش سالب) لكل صنف");
  }
  const totalValue = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const result = await db.transaction(async (tx) => {
    let [consignment] = await tx.select().from(schema.consignments).where(eq(schema.consignments.holderId, input.holderId)).for("update");
    if (!consignment) {
      try {
        [consignment] = await tx.insert(schema.consignments).values({ holderId: input.holderId }).returning();
      } catch (e: any) {
        // نادر جدًا: عهدتين اتسجلوا لنفس الموظف في نفس اللحظة بالظبط - قيد الـ unique على holderId
        // (schema.ts) بيرفض الإدخال التاني، فبنقرا الصف اللي اتعمل فعليًا بدل ما نفشل العملية كلها.
        // كان الفحص بيدوّر على e.message/e.code مباشرة - مش بيلاقيهم لأن Drizzle بيغلّف الخطأ
        // الحقيقي جوه e.cause (استخدمنا pgConstraintCode اللي بيدوّر هناك كمان).
        if (pgConstraintCode(e) === "23505") {
          [consignment] = await tx.select().from(schema.consignments).where(eq(schema.consignments.holderId, input.holderId)).for("update");
          if (!consignment) throw e;
        } else {
          throw e;
        }
      }
    }
    // حد أقصى اختياري لقيمة العهدة اللي ممكن تتدي للموظف ده (زي حد ائتمان العميل بالظبط) - لو محدد ومتجاوز، نرفض
    const limitCheck = checkConsignmentLimit(consignment, totalValue);
    if (!limitCheck.ok) throw new Error(limitCheck.message);
    for (const item of input.items) {
      await tx.insert(schema.consignmentItems).values({
        consignmentId: consignment.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      });
      const newQty = await adjustStock(tx, item.productId, input.locationId, -item.quantity);
      if (newQty < 0) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
        const available = newQty + item.quantity;
        throw new Error(await stockShortageMessage(tx, item.productId, product?.name || "", input.locationId, available, item.quantity));
      }
    }
    await updateConsignmentBalance(tx, consignment.id, totalValue);
    return consignment;
  });

  await logAudit({ action: "CREATE", entityType: "Consignment", entityId: result.id, after: input });
  revalidatePath("/consignments");
  revalidatePath("/products");
  return result;
}

// قبل كده الحقل limitAmount وكل منطق checkConsignmentLimit كانوا شغالين فعليًا في الكود، لكن مفيش
// أي شاشة تقدر تضبط قيمته أصلًا - يعني الحد الأقصى لقيمة عهدة أي موظف كان دايمًا "بدون حد" فعليًا
export async function setConsignmentLimit(consignmentId: string, limitAmount: number | null) {
  try {
    await requirePermission("consignments.manage");
    if (limitAmount !== null && (!Number.isFinite(limitAmount) || limitAmount < 0)) {
      throw new Error("الحد الأقصى لازم يكون رقم موجب أو فاضي (بدون حد)");
    }
    await db.update(schema.consignments).set({ limitAmount: limitAmount === null ? null : limitAmount.toFixed(2) }).where(eq(schema.consignments.id, consignmentId));
    await logAudit({ action: "UPDATE", entityType: "Consignment", entityId: consignmentId, after: { limitAmount } });
    revalidatePath("/consignments");
  } catch (e) {
    return toActionError(e, "تعذر حفظ الحد الأقصى");
  }
}

// ملحوظة: دالة "settleConsignment" (تسوية مديونية الموظف بمبلغ نقدي مباشر من غير ربطه ببيع/رجوع
// بضاعة فعلي) اتشالت عن قصد - كانت بتسمح إن رصيد المديونية يقل من غير ما جدول الأصناف (البضاعة
// اللي لسه معاه) يتحدّث، فكان بيحصل تعارض بين الرقمين. الطريقة الوحيدة دلوقتي لتقليل مديونية
// الموظف هي فعليًا "بيع من عهدة" (sellFromConsignment/settleConsignmentItemMixed) أو "رجوع بضاعة"
// (returnConsignmentItems) - الاتنين مرتبطين بصنف حقيقي فبيفضل الرصيد المالي وجدول الأصناف متطابقين.

export async function getConsignmentItems(consignmentId: string) {
  await requirePermission("consignments.manage");
  const confirmedBy = alias(schema.users, "confirmed_by");
  const rows = await db
    .select({
      id: schema.consignmentItems.id,
      productId: schema.consignmentItems.productId,
      quantity: schema.consignmentItems.quantity,
      unitPrice: schema.consignmentItems.unitPrice,
      returnedQty: schema.consignmentItems.returnedQty,
      soldQty: schema.consignmentItems.soldQty,
      productName: schema.products.name,
      createdAt: schema.consignmentItems.createdAt,
      receivedConfirmedAt: schema.consignmentItems.receivedConfirmedAt,
      confirmedByName: confirmedBy.fullName,
    })
    .from(schema.consignmentItems)
    .innerJoin(schema.products, eq(schema.consignmentItems.productId, schema.products.id))
    .leftJoin(confirmedBy, eq(schema.consignmentItems.receivedConfirmedById, confirmedBy.id))
    .where(eq(schema.consignmentItems.consignmentId, consignmentId));
  return rows;
}

// تأكيد استلام صنف معين من العهدة - "إيصال" إلكتروني بسيط بيسجل مين أكد وإمتى، بدل ما الاعتماد
// يبقى بس على كلام اللي سجّل العهدة في السيستم من غير أي دليل من الموظف نفسه إنه فعلًا استلم
export async function confirmConsignmentReceipt(consignmentItemId: string) {
  try {
    await requirePermission("consignments.manage");
    const session = await requireSession();
    const [item] = await db.select().from(schema.consignmentItems).where(eq(schema.consignmentItems.id, consignmentItemId));
    if (!item) throw new Error("صنف العهدة غير موجود");
    if (item.receivedConfirmedAt) throw new Error("الاستلام مؤكد بالفعل");
    await db
      .update(schema.consignmentItems)
      .set({ receivedConfirmedAt: new Date(), receivedConfirmedById: session.userId })
      .where(eq(schema.consignmentItems.id, consignmentItemId));
    await logAudit({ action: "CONFIRM_RECEIPT", entityType: "ConsignmentItem", entityId: consignmentItemId });
    revalidatePath("/consignments");
  } catch (e) {
    return toActionError(e, "تعذر تأكيد الاستلام");
  }
}

// -------------------- بيع من عهدة الموظف: تسجيل بيع فعلي لعميل حقيقي من البضاعة اللي معاه --------------------
// المخزون كان اتخصم بالفعل وقت تسليم العهدة، فمش بننقصه تاني هنا - بس بنسجل الكمية دي كـ"مباعة"
// (soldQty، منفصلة عن returnedQty اللي بترجع فعليًا للمخزون)، وبننشئ فاتورة بيع حقيقية عشان تظهر
// في التقارير وأداء الموظفين، والبايع الفعلي فيها هو صاحب العهدة نفسه (holderId) حتى لو أدمن أو
// محاسب هو اللي سجّل عملية التسوية دي فعليًا.
export async function sellFromConsignment(input: {
  consignmentItemId: string;
  quantity: number;
  unitPrice: number;
  locationId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethodId: string;
}) {
  try {
    return await sellFromConsignmentInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل البيع من العهدة");
  }
}

async function sellFromConsignmentInner(input: Parameters<typeof sellFromConsignment>[0]) {
  await requirePermission("consignments.manage");
  const session = await requireSession();
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("الكمية لازم تكون رقم أكبر من صفر");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error("السعر لازم يكون رقم صحيح (مش سالب)");
  if (!input.locationId) throw new Error("لازم تحدد المكان (لتسجيل الفاتورة)");
  if (!input.paymentMethodId) throw new Error("لازم تحدد طريقة التحصيل");

  const result = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(schema.consignmentItems).where(eq(schema.consignmentItems.id, input.consignmentItemId)).for("update");
    if (!item) throw new Error("صنف العهدة غير موجود");
    const remaining = item.quantity - item.returnedQty - item.soldQty;
    if (input.quantity > remaining) {
      const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
      throw new Error(`المتبقي فعليًا مع الموظف من "${product?.name || "المنتج"}" هو ${remaining} بس - مينفعش تبيع ${input.quantity}`);
    }
    const [consignment] = await tx.select().from(schema.consignments).where(eq(schema.consignments.id, item.consignmentId)).for("update");
    if (!consignment) throw new Error("عهدة غير موجودة");
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));

    // ربط/إنشاء العميل تلقائيًا بالهاتف - نفس أسلوب فاتورة البيع العادية بالظبط
    let customerId = input.customerId;
    if (!customerId && (input.customerName?.trim() || input.customerPhone?.trim())) {
      const phone = input.customerPhone?.trim() ? normalizePhone(input.customerPhone.trim()) : undefined;
      if (phone) {
        const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
        if (existing) customerId = existing.id;
        else {
          const [created] = await tx.insert(schema.customers).values({ name: input.customerName?.trim() || "عميل بدون اسم", phone, type: "RETAIL" }).returning();
          customerId = created.id;
        }
      } else if (input.customerName?.trim()) {
        const [created] = await tx.insert(schema.customers).values({ name: input.customerName.trim(), type: "RETAIL" }).returning();
        customerId = created.id;
      }
    }

    const total = input.quantity * input.unitPrice;
    const code = genCode("INV");
    const [invoice] = await tx
      .insert(schema.salesInvoices)
      .values({
        code,
        customerId,
        locationId: input.locationId,
        subtotal: total.toFixed(2),
        discount: "0.00",
        total: total.toFixed(2),
        paidAmount: total.toFixed(2),
        paymentStatus: "PAID",
        paymentMethodId: input.paymentMethodId,
        source: "OTHER",
        notes: `بيع من عهدة الموظف`,
        createdById: session.userId,
        // البايع الفعلي هو صاحب العهدة - ده اللي بيتحسب عليه أداء المبيعات، مش اللي سجّل التسوية
        soldById: consignment.holderId,
      })
      .returning();
    await tx.insert(schema.salesInvoiceItems).values({
      invoiceId: invoice.id,
      productId: item.productId,
      quantity: input.quantity,
      unitPrice: input.unitPrice.toFixed(2),
      unitCost: product?.avgCost || "0",
    });

    await tx.update(schema.consignmentItems).set({ soldQty: item.soldQty + input.quantity }).where(eq(schema.consignmentItems.id, item.id));
    // البضاعة دي بيعت وتحصّلت فعليًا - رصيد العهدة اللي على الموظف بيقل بمقدار قيمتها الأصلية
    // (سعر التسليم المسجل وقت إعطاء العهدة)، مش سعر البيع الجديد اللي ممكن يختلف عن السعر الأصلي
    await updateConsignmentBalance(tx, consignment.id, -(input.quantity * Number(item.unitPrice)));
    await postCashByPaymentMethod(tx, input.paymentMethodId, "COLLECTION_IN", total, {
      note: `بيع من عهدة الموظف - فاتورة ${code}`,
      refType: "Consignment",
      refId: consignment.id,
      createdById: session.userId,
    });

    return invoice;
  });

  await logAudit({ action: "SELL_FROM_CONSIGNMENT", entityType: "SalesInvoice", entityId: result.id, after: input });
  revalidatePath("/consignments");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/sales");
  revalidatePath("/");
  return result;
}

// تسوية مختلطة لصنف واحد في خطوة واحدة: جزء يترجع للمخزون + جزء يتباع لعميل حقيقي في نفس الوقت -
// قبل كده كان لازم تعمل عمليتين منفصلتين (إرجاع، وبعدين بيع لعميل) حتى لو كنت عايز توزّع نفس
// الكمية المتبقية من نفس الصنف في نفس اللحظة. دلوقتي العمليتين بيحصلوا مع بعض جوه transaction واحدة.
export async function settleConsignmentItemMixed(input: {
  consignmentItemId: string;
  locationId: string;
  returnQuantity?: number;
  sale?: {
    quantity: number;
    unitPrice: number;
    paymentMethodId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
  };
}) {
  try {
    return await settleConsignmentItemMixedInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تنفيذ العملية");
  }
}

async function settleConsignmentItemMixedInner(input: Parameters<typeof settleConsignmentItemMixed>[0]) {
  await requirePermission("consignments.manage");
  const session = await requireSession();
  const returnQuantity = input.returnQuantity && input.returnQuantity > 0 ? input.returnQuantity : 0;
  const sale = input.sale && input.sale.quantity > 0 ? input.sale : undefined;
  if (returnQuantity === 0 && !sale) throw new Error("لازم تحدد كمية إرجاع أو كمية بيع على الأقل");
  if (!input.locationId) throw new Error("لازم تحدد المكان");
  if (sale) {
    if (!Number.isFinite(sale.unitPrice) || sale.unitPrice < 0) throw new Error("سعر البيع لازم يكون رقم صحيح (مش سالب)");
    if (!sale.paymentMethodId) throw new Error("لازم تحدد طريقة التحصيل للبيع");
  }

  const result = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(schema.consignmentItems).where(eq(schema.consignmentItems.id, input.consignmentItemId)).for("update");
    if (!item) throw new Error("صنف العهدة غير موجود");
    const remaining = item.quantity - item.returnedQty - item.soldQty;
    const totalRequested = returnQuantity + (sale?.quantity || 0);
    if (totalRequested > remaining) {
      const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
      throw new Error(
        `المتبقي فعليًا مع الموظف من "${product?.name || "المنتج"}" هو ${remaining} بس - مينفعش توزّع ${totalRequested} (${returnQuantity} رجوع + ${sale?.quantity || 0} بيع)`
      );
    }
    const [consignment] = await tx.select().from(schema.consignments).where(eq(schema.consignments.id, item.consignmentId)).for("update");
    if (!consignment) throw new Error("عهدة غير موجودة");
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));

    let invoiceId: string | undefined;
    let invoiceCode: string | undefined;

    if (returnQuantity > 0) {
      await tx.update(schema.consignmentItems).set({ returnedQty: item.returnedQty + returnQuantity }).where(eq(schema.consignmentItems.id, item.id));
      await adjustStock(tx, item.productId, input.locationId, returnQuantity);
      await updateConsignmentBalance(tx, consignment.id, -(returnQuantity * Number(item.unitPrice)));
    }

    if (sale) {
      let customerId = sale.customerId;
      if (!customerId && (sale.customerName?.trim() || sale.customerPhone?.trim())) {
        const phone = sale.customerPhone?.trim() ? normalizePhone(sale.customerPhone.trim()) : undefined;
        if (phone) {
          const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
          if (existing) customerId = existing.id;
          else {
            const [created] = await tx.insert(schema.customers).values({ name: sale.customerName?.trim() || "عميل بدون اسم", phone, type: "RETAIL" }).returning();
            customerId = created.id;
          }
        } else if (sale.customerName?.trim()) {
          const [created] = await tx.insert(schema.customers).values({ name: sale.customerName.trim(), type: "RETAIL" }).returning();
          customerId = created.id;
        }
      }

      const total = sale.quantity * sale.unitPrice;
      const code = genCode("INV");
      const [invoice] = await tx
        .insert(schema.salesInvoices)
        .values({
          code,
          customerId,
          locationId: input.locationId,
          subtotal: total.toFixed(2),
          discount: "0.00",
          total: total.toFixed(2),
          paidAmount: total.toFixed(2),
          paymentStatus: "PAID",
          paymentMethodId: sale.paymentMethodId,
          source: "OTHER",
          notes: `بيع من عهدة الموظف`,
          createdById: session.userId,
          soldById: consignment.holderId,
        })
        .returning();
      invoiceId = invoice.id;
      invoiceCode = code;
      await tx.insert(schema.salesInvoiceItems).values({
        invoiceId: invoice.id,
        productId: item.productId,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice.toFixed(2),
        unitCost: product?.avgCost || "0",
      });
      await tx.update(schema.consignmentItems).set({ soldQty: item.soldQty + sale.quantity }).where(eq(schema.consignmentItems.id, item.id));
      await updateConsignmentBalance(tx, consignment.id, -(sale.quantity * Number(item.unitPrice)));
      await postCashByPaymentMethod(tx, sale.paymentMethodId, "COLLECTION_IN", total, {
        note: `بيع من عهدة الموظف - فاتورة ${code}`,
        refType: "Consignment",
        refId: consignment.id,
        createdById: session.userId,
      });
    }

    return { consignmentId: consignment.id, invoiceId, invoiceCode, returnQuantity, saleQuantity: sale?.quantity || 0 };
  });

  await logAudit({ action: "PARTIAL_SETTLE", entityType: "Consignment", entityId: result.consignmentId, after: result });
  revalidatePath("/consignments");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/sales");
  revalidatePath("/");
  return result;
}

// تسجيل رجوع بضاعة من عهدة موظف للمخزون - بيرجع الكمية للمخزون وبينقص قيمتها من رصيد العهدة عليه
export async function returnConsignmentItems(input: {
  consignmentId: string;
  locationId: string;
  items: { itemId: string; quantity: number }[];
}) {
  try {
    return await returnConsignmentItemsInner(input);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل إرجاع البضاعة");
  }
}

async function returnConsignmentItemsInner(input: Parameters<typeof returnConsignmentItems>[0]) {
  await requirePermission("consignments.manage");
  const session = await requireSession();

  const validItems = input.items.filter((i) => i.quantity > 0);
  if (validItems.length === 0) throw new Error("لازم تحدد كمية أكبر من صفر لصنف واحد على الأقل عشان ترجعه");

  let totalReturnedValue = 0;
  await db.transaction(async (tx) => {
    for (const ret of validItems) {
      const [row] = await tx.select().from(schema.consignmentItems).where(eq(schema.consignmentItems.id, ret.itemId)).for("update");
      if (!row || row.consignmentId !== input.consignmentId) throw new Error("صنف غير صحيح في العهدة دي");
      const remaining = row.quantity - row.returnedQty - row.soldQty;
      if (ret.quantity > remaining) {
        const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, row.productId));
        throw new Error(`المتبقي فعليًا مع الموظف من "${product?.name || "المنتج"}" هو ${remaining} بس - مينفعش ترجع ${ret.quantity}`);
      }
      await tx.update(schema.consignmentItems).set({ returnedQty: row.returnedQty + ret.quantity }).where(eq(schema.consignmentItems.id, row.id));
      await adjustStock(tx, row.productId, input.locationId, ret.quantity);
      totalReturnedValue += ret.quantity * Number(row.unitPrice);
    }
    await updateConsignmentBalance(tx, input.consignmentId, -totalReturnedValue);
  });

  await logAudit({ action: "RETURN", entityType: "Consignment", entityId: input.consignmentId, after: { items: validItems, totalReturnedValue } });
  revalidatePath("/consignments");
  revalidatePath("/products");
  return { totalReturnedValue };
}

// -------------------- نشاط ومبيعات الموظف من عهدته خلال فترة زمنية محددة --------------------
// المستخدم كان بيحتاج يعرف "الموظف/المندوب ده باع بكام وعمل كام فاتورة خلال الفترة اللي أنا
// محددها" من غير ما يدوّر يدويًا في شاشة الفواتير - بنستخدم نفس العلامة (notes) اللي بتتسجل تلقائيًا
// على أي فاتورة اتعملت من بيع عهدة (sellFromConsignment / settleConsignmentItemMixed) عشان نميزها
// عن باقي فواتير البيع العادية لنفس الموظف، ونحسبها مجمّعة في الفترة المطلوبة.
export async function getConsignmentActivity(holderId: string, from: Date, to: Date) {
  try {
    await requirePermission("consignments.manage");
    const rows = await db
      .select({
        id: schema.salesInvoices.id,
        code: schema.salesInvoices.code,
        total: schema.salesInvoices.total,
        createdAt: schema.salesInvoices.createdAt,
        customerName: schema.customers.name,
      })
      .from(schema.salesInvoices)
      .leftJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.salesInvoices.soldById, holderId),
          like(schema.salesInvoices.notes, "بيع من عهدة الموظف%"),
          gte(schema.salesInvoices.createdAt, from),
          lte(schema.salesInvoices.createdAt, to)
        )
      )
      .orderBy(desc(schema.salesInvoices.createdAt))
      // سقف أمان يمنع الشاشة من التقيل لو فترة طويلة جدًا فيها مئات الفواتير لنفس الموظف
      .limit(500);
    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    return { count: rows.length, total, invoices: rows };
  } catch (e) {
    return toActionError(e, "تعذر تحميل نشاط الموظف");
  }
}
