"use server";
import { db, schema } from "@/db";
import { eq, desc, ilike, or } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode, can } from "@/lib/auth";
import { postCashByPaymentMethod, adjustStock, updateSupplierBalance, updateWeightedAvgCost } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

export async function listSuppliers(search?: string) {
  return db
    .select()
    .from(schema.suppliers)
    .where(
      search
        ? or(ilike(schema.suppliers.name, `%${search}%`), ilike(schema.suppliers.phone, `%${search}%`))
        : eq(schema.suppliers.active, true)
    )
    .orderBy(schema.suppliers.name);
}

export async function getTotalSuppliersPayable() {
  const rows = await db.select().from(schema.suppliers).where(eq(schema.suppliers.active, true));
  return rows.reduce((s, r) => s + Number(r.balance), 0);
}

export async function createSupplier(data: { name: string; phone?: string; notes?: string }) {
  await requirePermission("purchases.create");
  const [s] = await db.insert(schema.suppliers).values(data).returning();
  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  return s;
}

export async function updateSupplier(id: string, data: Partial<{ name: string; phone: string; notes: string; active: boolean }>) {
  await requirePermission("purchases.create");
  const [s] = await db.update(schema.suppliers).set(data).where(eq(schema.suppliers.id, id)).returning();
  revalidatePath("/suppliers");
  return s;
}

export async function getSupplier(id: string) {
  await requirePermission("purchases.view");
  const [s] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id));
  return s;
}

// -------------------- كشف حساب المورد الكامل: مشتريات + سداد --------------------
export async function getSupplierLedger(supplierId: string) {
  await requirePermission("purchases.view");
  const purchases = await db
    .select({
      id: schema.purchases.id,
      code: schema.purchases.code,
      totalAmount: schema.purchases.totalAmount,
      paidAmount: schema.purchases.paidAmount,
      paymentStatus: schema.purchases.paymentStatus,
      createdAt: schema.purchases.createdAt,
    })
    .from(schema.purchases)
    .where(eq(schema.purchases.supplierId, supplierId))
    .orderBy(desc(schema.purchases.createdAt));

  const payments = await db
    .select({
      id: schema.supplierPayments.id,
      amount: schema.supplierPayments.amount,
      transferMethod: schema.supplierPayments.transferMethod,
      note: schema.supplierPayments.note,
      createdAt: schema.supplierPayments.createdAt,
      paymentMethodName: schema.paymentMethods.name,
    })
    .from(schema.supplierPayments)
    .innerJoin(schema.paymentMethods, eq(schema.supplierPayments.paymentMethodId, schema.paymentMethods.id))
    .where(eq(schema.supplierPayments.supplierId, supplierId))
    .orderBy(desc(schema.supplierPayments.createdAt));

  const timeline = [
    ...purchases.map((p) => ({ kind: "PURCHASE" as const, date: p.createdAt, ...p })),
    ...payments.map((p) => ({ kind: "PAYMENT" as const, date: p.createdAt, ...p })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { purchases, payments, timeline };
}

// -------------------- سداد مبلغ لمورد --------------------
export async function paySupplier(data: { supplierId: string; amount: number; paymentMethodId: string; transferMethod?: string; note?: string }) {
  try {
    return await paySupplierInner(data);
  } catch (e) {
    return toActionError(e, "تعذر تسجيل السداد");
  }
}

async function paySupplierInner(data: Parameters<typeof paySupplier>[0]) {
  await requirePermission("purchases.create");
  const session = await requireSession();
  if (data.amount <= 0) throw new Error("المبلغ لازم يكون أكبر من صفر");
  await db.transaction(async (tx) => {
    await updateSupplierBalance(tx, data.supplierId, -data.amount);
    await postCashByPaymentMethod(tx, data.paymentMethodId, "PAYMENT_OUT", data.amount, {
      note: data.note || "دفعة لمورد",
      refType: "Supplier",
      refId: data.supplierId,
      createdById: session.userId,
    });
    await tx.insert(schema.supplierPayments).values({
      supplierId: data.supplierId,
      amount: data.amount.toFixed(2),
      paymentMethodId: data.paymentMethodId,
      transferMethod: data.transferMethod,
      note: data.note,
      createdById: session.userId,
    });
  });
  await logAudit({ action: "CREATE", entityType: "SupplierPayment", entityId: data.supplierId, after: data });
  revalidatePath("/suppliers");
  revalidatePath("/cash");
}

type PurchaseInput = {
  supplierId: string;
  locationId: string;
  items: { productId: string; quantity: number; unitCost: number; serials?: string[] }[];
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  paidAmount: number;
  paymentMethodId?: string;
};

function validatePurchaseInput(input: PurchaseInput) {
  if (!input.supplierId) throw new Error("لازم تختار المورد");
  if (!input.locationId) throw new Error("لازم تختار المكان (المحل أو المخزن)");
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
  for (const it of input.items) {
    if (!it.productId) throw new Error("فيه سطر منتج لسه ماتحددش");
    if (!it.quantity || it.quantity <= 0) throw new Error("لازم تدخل كمية صحيحة لكل صنف");
    if (it.unitCost === undefined || it.unitCost === null || it.unitCost < 0) throw new Error("لازم تدخل سعر شراء صحيح لكل صنف");
  }
  if ((input.paymentStatus === "PAID" || input.paymentStatus === "PARTIAL") && input.paidAmount > 0 && !input.paymentMethodId) {
    throw new Error("لازم تحدد طريقة الدفع للمبلغ المدفوع");
  }
}

export async function createPurchase(input: PurchaseInput) {
  try {
    return await createPurchaseInner(input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ فاتورة الشراء");
  }
}

async function createPurchaseInner(input: PurchaseInput) {
  await requirePermission("purchases.create");
  const session = await requireSession();
  validatePurchaseInput(input);
  const totalAmount = input.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const result = await db.transaction(async (tx) => {
    const code = genCode("PUR");
    const [purchase] = await tx
      .insert(schema.purchases)
      .values({
        code,
        supplierId: input.supplierId,
        locationId: input.locationId,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: input.paidAmount.toFixed(2),
        paymentStatus: input.paymentStatus,
        paymentMethodId: input.paymentMethodId,
        createdById: session.userId,
      })
      .returning();

    for (const item of input.items) {
      const [pi] = await tx
        .insert(schema.purchaseItems)
        .values({ purchaseId: purchase.id, productId: item.productId, quantity: item.quantity, unitCost: item.unitCost.toFixed(2) })
        .returning();

      // مهم: نحسب متوسط التكلفة المرجح على أساس الكمية القديمة *قبل* إضافة الكمية الجديدة للمخزون
      await updateWeightedAvgCost(tx, item.productId, item.quantity, item.unitCost);
      await adjustStock(tx, item.productId, input.locationId, item.quantity);

      await tx.insert(schema.supplierProductPrices).values({
        supplierId: input.supplierId,
        productId: item.productId,
        price: item.unitCost.toFixed(2),
        purchaseId: purchase.id,
      });

      if (item.serials && item.serials.length) {
        for (const sn of item.serials) {
          await tx.insert(schema.productSerials).values({
            productId: item.productId,
            serialNumber: sn,
            status: "IN_STOCK",
            purchaseItemId: pi.id,
            locationId: input.locationId,
          });
        }
      }
    }

    // تحديث رصيد المورد (اللي علينا) بمقدار المبلغ الغير مدفوع
    const unpaid = totalAmount - input.paidAmount;
    if (unpaid > 0) await updateSupplierBalance(tx, input.supplierId, unpaid);

    if (input.paidAmount > 0 && input.paymentMethodId) {
      await postCashByPaymentMethod(tx, input.paymentMethodId, "PURCHASE_OUT", input.paidAmount, {
        note: `دفعة على المشترى ${code}`,
        refType: "Purchase",
        refId: purchase.id,
        createdById: session.userId,
      });
    }

    return purchase;
  });

  await logAudit({ action: "CREATE", entityType: "Purchase", entityId: result.id, after: result });
  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/suppliers");
  return result;
}

// -------------------- حذف فاتورة مشترى (بيعكس كل أثرها: مخزون + رصيد مورد + خزينة) --------------------
export async function deletePurchase(id: string) {
  try {
    return await deletePurchaseInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف فاتورة الشراء");
  }
}

async function deletePurchaseInner(id: string) {
  await requirePermission("purchases.edit");
  const session = await requireSession();
  const [purchase] = await db.select().from(schema.purchases).where(eq(schema.purchases.id, id));
  if (!purchase) throw new Error("فاتورة الشراء غير موجودة");
  const items = await db.select().from(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, id));

  await db.transaction(async (tx) => {
    for (const item of items) {
      const newQty = await adjustStock(tx, item.productId, purchase.locationId, -item.quantity);
      if (newQty < 0) throw new Error("متقدرش تمسح الفاتورة دي - جزء من الكمية اتباع بالفعل من المخزون");
    }
    const unpaid = Number(purchase.totalAmount) - Number(purchase.paidAmount);
    if (unpaid > 0) await updateSupplierBalance(tx, purchase.supplierId, -unpaid);
    if (Number(purchase.paidAmount) > 0 && purchase.paymentMethodId) {
      await postCashByPaymentMethod(tx, purchase.paymentMethodId, "PAYMENT_OUT", Number(purchase.paidAmount), {
        note: `إلغاء/حذف فاتورة مشترى ${purchase.code}`,
        refType: "Purchase",
        refId: purchase.id,
        createdById: session.userId,
        direction: "in",
      });
    }
    await tx.delete(schema.purchaseItems).where(eq(schema.purchaseItems.purchaseId, id));
    await tx.delete(schema.purchases).where(eq(schema.purchases.id, id));
  });

  await logAudit({ action: "DELETE", entityType: "Purchase", entityId: id, before: purchase });
  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/suppliers");
}

export async function listPurchases() {
  await requirePermission("purchases.view");
  const rows = await db
    .select({
      id: schema.purchases.id,
      code: schema.purchases.code,
      totalAmount: schema.purchases.totalAmount,
      paidAmount: schema.purchases.paidAmount,
      paymentStatus: schema.purchases.paymentStatus,
      createdAt: schema.purchases.createdAt,
      supplierName: schema.suppliers.name,
      locationName: schema.locations.name,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .innerJoin(schema.locations, eq(schema.purchases.locationId, schema.locations.id))
    .orderBy(schema.purchases.createdAt);
  return rows.reverse();
}

export async function getPurchase(id: string) {
  await requirePermission("purchases.view");
  const [purchase] = await db
    .select({
      id: schema.purchases.id,
      code: schema.purchases.code,
      totalAmount: schema.purchases.totalAmount,
      paidAmount: schema.purchases.paidAmount,
      paymentStatus: schema.purchases.paymentStatus,
      paymentMethodId: schema.purchases.paymentMethodId,
      createdAt: schema.purchases.createdAt,
      supplierId: schema.purchases.supplierId,
      supplierName: schema.suppliers.name,
      locationId: schema.purchases.locationId,
      locationName: schema.locations.name,
      createdById: schema.purchases.createdById,
      createdByName: schema.users.fullName,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .innerJoin(schema.locations, eq(schema.purchases.locationId, schema.locations.id))
    .leftJoin(schema.users, eq(schema.purchases.createdById, schema.users.id))
    .where(eq(schema.purchases.id, id));
  if (!purchase) return null;
  const items = await db
    .select({
      id: schema.purchaseItems.id,
      quantity: schema.purchaseItems.quantity,
      unitCost: schema.purchaseItems.unitCost,
      productName: schema.products.name,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.products, eq(schema.purchaseItems.productId, schema.products.id))
    .where(eq(schema.purchaseItems.purchaseId, id));
  const canEdit = await can("purchases.edit");
  return { purchase, items, canEdit };
}
