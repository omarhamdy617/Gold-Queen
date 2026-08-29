"use server";
import { db, schema } from "@/db";
import { eq, or, ilike, and, gte, lte, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit } from "@/lib/auth";
import { postCashByPaymentMethod, updateCustomerBalance } from "@/lib/ops";
import { revalidatePath } from "next/cache";

export async function listCustomers(search?: string) {
  await requirePermission("customers.manage");
  return db
    .select()
    .from(schema.customers)
    .where(
      search ? or(ilike(schema.customers.name, `%${search}%`), ilike(schema.customers.phone, `%${search}%`)) : undefined
    )
    .orderBy(schema.customers.name);
}

export async function createCustomer(data: { name: string; phone?: string; type: "RETAIL" | "TRADER"; creditLimit?: number; notes?: string }) {
  await requirePermission("customers.manage");
  const [c] = await db
    .insert(schema.customers)
    .values({ ...data, creditLimit: (data.creditLimit || 0).toFixed(2) })
    .returning();
  await logAudit({ action: "CREATE", entityType: "Customer", entityId: c.id, after: c });
  revalidatePath("/customers");
  return c;
}

export async function updateCustomer(id: string, data: Partial<{ name: string; phone: string; type: "RETAIL" | "TRADER"; creditLimit: number; notes: string; active: boolean }>) {
  await requirePermission("customers.manage");
  const payload: any = { ...data };
  if (data.creditLimit !== undefined) payload.creditLimit = data.creditLimit.toFixed(2);
  const [c] = await db.update(schema.customers).set(payload).where(eq(schema.customers.id, id)).returning();
  revalidatePath("/customers");
  return c;
}

export async function getCustomer(id: string) {
  await requirePermission("customers.manage");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  return c;
}

export async function recordCollection(data: { customerId: string; amount: number; paymentMethodId: string; note?: string }) {
  await requirePermission("customers.manage");
  const session = await requireSession();
  await db.transaction(async (tx) => {
    await updateCustomerBalance(tx, data.customerId, -data.amount);
    await postCashByPaymentMethod(tx, data.paymentMethodId, "COLLECTION_IN", data.amount, {
      note: data.note || "تحصيل من عميل",
      refType: "Customer",
      refId: data.customerId,
      createdById: session.userId,
    });
    await tx.insert(schema.collections).values({
      customerId: data.customerId,
      amount: data.amount.toFixed(2),
      paymentMethodId: data.paymentMethodId,
      note: data.note,
      createdById: session.userId,
    });
  });
  await logAudit({ action: "CREATE", entityType: "Collection", entityId: data.customerId, after: data });
  revalidatePath("/customers");
  revalidatePath("/cash");
}

export async function customerStatement(customerId: string, from: Date, to: Date) {
  await requirePermission("customers.statement");
  const invoices = await db
    .select()
    .from(schema.salesInvoices)
    .where(and(eq(schema.salesInvoices.customerId, customerId), gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
    .orderBy(schema.salesInvoices.createdAt);
  const payments = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.customerId, customerId), gte(schema.collections.createdAt, from), lte(schema.collections.createdAt, to)))
    .orderBy(schema.collections.createdAt);
  return { invoices, payments };
}

export async function searchEverything(q: string) {
  await requireSession();
  if (!q || q.length < 2) return { customers: [], invoices: [] };
  const customers = await db
    .select()
    .from(schema.customers)
    .where(or(ilike(schema.customers.name, `%${q}%`), ilike(schema.customers.phone, `%${q}%`)))
    .limit(10);
  const invoices = await db
    .select()
    .from(schema.salesInvoices)
    .where(ilike(schema.salesInvoices.code, `%${q}%`))
    .limit(10);
  return { customers, invoices };
}
