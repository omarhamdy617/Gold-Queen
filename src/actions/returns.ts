"use server";
import { db, schema } from "@/db";
import { eq, desc, and, ne, inArray } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock, updateCustomerBalance, updateSupplierBalance, postCashByPaymentMethod } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

export async function createReturnRequest(input: {
  kind: "SALE_RETURN" | "PURCHASE_RETURN";
  invoiceId?: string;
  customerId?: string;
  supplierId?: string;
  items: { productId: string; quantity: number; unitPrice: number; invoiceItemId?: string }[];
  reasonCategory?: string;
  reason?: string;
  imageUrl?: string;
}) {
  try {
    return await createReturnRequestInner(input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ المرتجع");
  }
}

async function createReturnRequestInner(input: Parameters<typeof createReturnRequest>[0]) {
  await requirePermission("returns.create");
  const session = await requireSession();
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل في المرتجع");
  const totalAmount = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const code = genCode("RET");

  const ret = await db.transaction(async (tx) => {
    // قبل كده الإنشاء كان بيعمل insert منفصلة تباعًا بلا transaction - لو صنف فشل إدخاله في نص
    // اللستة، كان بيفضل صف return_requests + بعض بنوده متسجلين فعليًا رغم إن المستخدم شاف رسالة
    // فشل (مرتجع PENDING ناقص وهمي)
    if (input.kind === "SALE_RETURN") {
      // منع تقديم مرتجع أكتر من مرة لنفس بند الفاتورة بكمية إجمالية أكبر من الكمية الأصلية فيه -
      // قبل كده كل مرتجع جديد كان بيتقبل من غير أي مقارنة بمرتجعات سابقة لنفس البند (سواء لسه
      // PENDING أو اتاعتمدت بالفعل APPROVED)، فممكن نفس البند يترجّع 3-4 مرات بنفس الكمية.
      for (const item of input.items) {
        if (!item.invoiceItemId) continue;
        const [origLine] = await tx.select().from(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.id, item.invoiceItemId));
        if (!origLine) throw new Error("بند فاتورة غير موجود ضمن أصناف المرتجع");
        const priorItems = await tx
          .select({ quantity: schema.returnItems.quantity, status: schema.returnRequests.status })
          .from(schema.returnItems)
          .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
          .where(and(eq(schema.returnItems.invoiceItemId, item.invoiceItemId), ne(schema.returnRequests.status, "REJECTED")));
        const alreadyRequested = priorItems.reduce((s, r) => s + r.quantity, 0);
        if (alreadyRequested + item.quantity > origLine.quantity) {
          throw new Error(
            `الكمية المطلوب إرجاعها من البند ده أكبر من المتاح - الكمية الأصلية في الفاتورة ${origLine.quantity}، اتطلب إرجاع ${alreadyRequested} منها قبل كده (مرتجعات معلّقة أو معتمدة)، وأنت طالب ${item.quantity} كمان`
          );
        }
      }
    }

    const [r] = await tx
      .insert(schema.returnRequests)
      .values({
        code,
        kind: input.kind,
        invoiceId: input.invoiceId,
        customerId: input.customerId,
        supplierId: input.supplierId,
        totalAmount: totalAmount.toFixed(2),
        status: "PENDING",
        reasonCategory: input.reasonCategory,
        reason: input.reason,
        imageUrl: input.imageUrl,
        requestedById: session.userId,
      })
      .returning();
    for (const item of input.items) {
      await tx.insert(schema.returnItems).values({
        returnRequestId: r.id,
        invoiceItemId: item.invoiceItemId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      });
    }
    return r;
  });

  await logAudit({ action: "CREATE", entityType: "ReturnRequest", entityId: ret.id, after: ret });
  revalidatePath("/returns");
  return ret;
}

export async function listReturns() {
  await requirePermission("returns.create");
  return db.select().from(schema.returnRequests).orderBy(desc(schema.returnRequests.createdAt));
}

export async function getReturnDetail(id: string) {
  await requirePermission("returns.create");
  const [ret] = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, id));
  const items = await db
    .select({ id: schema.returnItems.id, quantity: schema.returnItems.quantity, unitPrice: schema.returnItems.unitPrice, productId: schema.returnItems.productId, productName: schema.products.name })
    .from(schema.returnItems)
    .innerJoin(schema.products, eq(schema.returnItems.productId, schema.products.id))
    .where(eq(schema.returnItems.returnRequestId, id));
  return { ret, items };
}

// المكان الافتراضي اللي ترجعله البضاعة (أول محل نشط) - ممكن تتحسن لاحقًا لاختيار المكان وقت الطلب
export async function approveReturn(id: string, locationId: string, refundPaymentMethodId?: string) {
  try {
    return await approveReturnInner(id, locationId, refundPaymentMethodId);
  } catch (e) {
    return toActionError(e, "تعذر اعتماد المرتجع");
  }
}

async function approveReturnInner(id: string, locationId: string, refundPaymentMethodId?: string) {
  await requirePermission("returns.approve");
  const session = await requireSession();

  await db.transaction(async (tx) => {
    // قفل صف المرتجع الأول جوه المعاملة - ده اللي بيمنع اعتماد المرتجع مرتين لو اتنين ضغطوا "اعتماد"
    // في نفس اللحظة (أو ضغط مرتين بالغلط قبل ما الصفحة تحدّث): المحاولة التانية هتستنى، وهتلاقي
    // الحالة اتغيرت من PENDING فهتترفض بدل ما ترجّع الفلوس والمخزون مرتين.
    const [ret] = await tx.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, id)).for("update");
    if (!ret) throw new Error("مرتجع غير موجود");
    if (ret.status !== "PENDING") throw new Error("تم التعامل مع المرتجع بالفعل");
    const items = await tx
      .select({ productId: schema.returnItems.productId, quantity: schema.returnItems.quantity, invoiceItemId: schema.returnItems.invoiceItemId })
      .from(schema.returnItems)
      .where(eq(schema.returnItems.returnRequestId, id));

    for (const item of items) {
      if (ret.kind === "SALE_RETURN") {
        await adjustStock(tx, item.productId, locationId, item.quantity); // ترجع للمخزون
        // رجّع سيريالات السطر المباع ده بالظبط (لو المنتج بسيريال) لحالة "متاح" تاني - بنحدد السيريالات
        // اللي اتباعت جوه *نفس سطر الفاتورة* اللي المرتجع ده جاي منه (invoiceItemId)، مش أي سيريال
        // "مباع" للمنتج ده بشكل عام، عشان منرجعش بالغلط سيريالات لسه فعليًا مع عملاء تانيين.
        if (item.invoiceItemId) {
          const soldSerials = await tx
            .select()
            .from(schema.productSerials)
            .where(and(eq(schema.productSerials.invoiceItemId, item.invoiceItemId), eq(schema.productSerials.status, "SOLD")))
            .limit(item.quantity);
          for (const s of soldSerials) {
            await tx.update(schema.productSerials).set({ status: "IN_STOCK", locationId, soldAt: null, invoiceItemId: null }).where(eq(schema.productSerials.id, s.id));
          }
        }
      } else {
        // مرتجع مشتريات (بيرجع بضاعة للمورد): بينقص المخزون - لازم نتأكد إن الكمية دي موجودة أصلًا
        // قبل كده، وإلا المخزون كان يروح بالسالب من غير أي تحذير لو جزء من البضاعة اتباع أو اتحول قبل كده
        const newQty = await adjustStock(tx, item.productId, locationId, -item.quantity);
        if (newQty < 0) {
          const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
          throw new Error(
            `متقدرش تعتمد المرتجع ده - الكمية المتاحة فعليًا من "${product?.name || "المنتج"}" في المكان ده أقل من ${item.quantity} (يمكن جزء اتباع أو اتحول قبل كده)`
          );
        }
      }
    }
    if (ret.kind === "SALE_RETURN" && ret.customerId) {
      await updateCustomerBalance(tx, ret.customerId, -Number(ret.totalAmount));
      if (refundPaymentMethodId) {
        await postCashByPaymentMethod(tx, refundPaymentMethodId, "RETURN_OUT", Number(ret.totalAmount), {
          note: `استرداد مرتجع ${ret.code}`,
          refType: "ReturnRequest",
          refId: ret.id,
          createdById: session.userId,
        });
      }
    }
    if (ret.kind === "PURCHASE_RETURN" && ret.supplierId) {
      // بيقل اللي علينا للمورد بمقدار قيمة المرتجع
      await updateSupplierBalance(tx, ret.supplierId, -Number(ret.totalAmount));
      if (refundPaymentMethodId) {
        // لو المورد رجعلنا فلوس كاش بدل ما يخصم من رصيده
        await postCashByPaymentMethod(tx, refundPaymentMethodId, "RETURN_IN", Number(ret.totalAmount), {
          note: `استرداد نقدي من مورد - مرتجع ${ret.code}`,
          refType: "ReturnRequest",
          refId: ret.id,
          createdById: session.userId,
        });
      }
    }
    await tx.update(schema.returnRequests).set({ status: "APPROVED", approvedById: session.userId, approvedAt: new Date() }).where(eq(schema.returnRequests.id, id));
  });

  await logAudit({ action: "APPROVE", entityType: "ReturnRequest", entityId: id });
  revalidatePath("/returns");
  revalidatePath("/products");
  revalidatePath("/customers");
  revalidatePath("/cash");
}

export async function rejectReturn(id: string) {
  try {
    return await rejectReturnInner(id);
  } catch (e) {
    return toActionError(e, "تعذر رفض المرتجع");
  }
}

async function rejectReturnInner(id: string) {
  await requirePermission("returns.approve");
  const session = await requireSession();
  await db.transaction(async (tx) => {
    // نفس قفل الصف المستخدم في الاعتماد - وبيمنع كمان رفض مرتجع اتاعتمد بالفعل (كان بيمسح حالته
    // لـ"مرفوض" من غير ما يعكس أثر الاعتماد اللي حصل - فلوس ومخزون كانوا فاضلين متأثرين رغم إن
    // الحالة بتقول "مرفوض").
    const [ret] = await tx.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, id)).for("update");
    if (!ret) throw new Error("مرتجع غير موجود");
    if (ret.status !== "PENDING") throw new Error("تم التعامل مع المرتجع بالفعل - متقدرش ترفض مرتجع اتاعتمد أو اترفض قبل كده");
    await tx.update(schema.returnRequests).set({ status: "REJECTED", approvedById: session.userId, approvedAt: new Date() }).where(eq(schema.returnRequests.id, id));
  });
  await logAudit({ action: "REJECT", entityType: "ReturnRequest", entityId: id });
  revalidatePath("/returns");
}
