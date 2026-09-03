"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
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
  const totalAmount = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const code = genCode("RET");
  const [ret] = await db
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
    await db.insert(schema.returnItems).values({
      returnRequestId: ret.id,
      invoiceItemId: item.invoiceItemId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
    });
  }
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
  await requirePermission("returns.approve");
  const session = await requireSession();
  const { ret, items } = await getReturnDetail(id);
  if (!ret) throw new Error("مرتجع غير موجود");
  if (ret.status !== "PENDING") throw new Error("تم التعامل مع المرتجع بالفعل");

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (ret.kind === "SALE_RETURN") {
        await adjustStock(tx, item.productId, locationId, item.quantity); // ترجع للمخزون
      } else {
        await adjustStock(tx, item.productId, locationId, -item.quantity); // ترجع للمورد فبتقل من عندنا
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
  await requirePermission("returns.approve");
  const session = await requireSession();
  await db.update(schema.returnRequests).set({ status: "REJECTED", approvedById: session.userId, approvedAt: new Date() }).where(eq(schema.returnRequests.id, id));
  await logAudit({ action: "REJECT", entityType: "ReturnRequest", entityId: id });
  revalidatePath("/returns");
}
