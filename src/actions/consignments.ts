"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock, updateConsignmentBalance, postCashByPaymentMethod, stockShortageMessage, checkConsignmentLimit } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

export async function listEmployees() {
  await requirePermission("consignments.manage");
  return db.select().from(schema.users).where(eq(schema.users.active, true));
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
    .innerJoin(schema.users, eq(schema.consignments.holderId, schema.users.id));
  return rows;
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
        // (schema.ts) بيرفض الإدخال التاني، فبنقرا الصف اللي اتعمل فعليًا بدل ما نفشل العملية كلها
        if (String(e?.message || "").toLowerCase().includes("unique") || e?.code === "23505") {
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

export async function settleConsignment(consignmentId: string, amount: number, paymentMethodId: string) {
  try {
    return await settleConsignmentInner(consignmentId, amount, paymentMethodId);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل التسوية");
  }
}

async function settleConsignmentInner(consignmentId: string, amount: number, paymentMethodId: string) {
  await requirePermission("consignments.manage");
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await updateConsignmentBalance(tx, consignmentId, -amount);
    await postCashByPaymentMethod(tx, paymentMethodId, "COLLECTION_IN", amount, {
      note: "تسوية عهدة",
      refType: "Consignment",
      refId: consignmentId,
      createdById: session.userId,
    });
  });
  await logAudit({ action: "SETTLE", entityType: "Consignment", entityId: consignmentId, after: { amount } });
  revalidatePath("/consignments");
  revalidatePath("/cash");
}

export async function getConsignmentItems(consignmentId: string) {
  await requirePermission("consignments.manage");
  const rows = await db
    .select({
      id: schema.consignmentItems.id,
      productId: schema.consignmentItems.productId,
      quantity: schema.consignmentItems.quantity,
      unitPrice: schema.consignmentItems.unitPrice,
      returnedQty: schema.consignmentItems.returnedQty,
      soldQty: schema.consignmentItems.soldQty,
      productName: schema.products.name,
    })
    .from(schema.consignmentItems)
    .innerJoin(schema.products, eq(schema.consignmentItems.productId, schema.products.id))
    .where(eq(schema.consignmentItems.consignmentId, consignmentId));
  return rows;
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
