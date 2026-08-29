"use server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { postCashByPaymentMethod, adjustStock, updateSupplierBalance, updateWeightedAvgCost } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function listSuppliers() {
  return db.select().from(schema.suppliers).where(eq(schema.suppliers.active, true));
}

export async function createSupplier(data: { name: string; phone?: string; notes?: string }) {
  await requirePermission("purchases.create");
  const [s] = await db.insert(schema.suppliers).values(data).returning();
  revalidatePath("/purchases");
  return s;
}

type PurchaseInput = {
  supplierId: string;
  locationId: string;
  items: { productId: string; quantity: number; unitCost: number; serials?: string[] }[];
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  paidAmount: number;
  paymentMethodId?: string;
};

export async function createPurchase(input: PurchaseInput) {
  await requirePermission("purchases.create");
  const session = await requireSession();
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

      await adjustStock(tx, item.productId, input.locationId, item.quantity);
      await updateWeightedAvgCost(tx, item.productId, item.quantity, item.unitCost);

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
  return result;
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
