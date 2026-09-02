"use server";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode, can } from "@/lib/auth";
import { postCashByPaymentMethod, adjustStock, updateCustomerBalance, checkCreditLimit } from "@/lib/ops";
import { revalidatePath } from "next/cache";

type InvoiceInput = {
  customerId?: string;
  locationId: string;
  items: { productId: string; quantity: number; unitPrice: number; serials?: string[] }[];
  discount: number;
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  paidAmount: number;
  paymentMethodId?: string;
  source: "WEBSITE" | "PHONE" | "WHATSAPP" | "FACEBOOK" | "OTHER";
  notes?: string;
};

export async function createSalesInvoice(input: InvoiceInput) {
  await requirePermission("sales.create");
  const session = await requireSession();

  if (!input.items || input.items.length === 0) {
    throw new Error("لازم تضيف صنف واحد على الأقل في الفاتورة قبل الحفظ");
  }

  const products = await db.select().from(schema.products);
  const productMap = new Map(products.map((p) => [p.id, p]));

  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = subtotal - input.discount;

  // خصم أكبر من 10% من إجمالي الفاتورة يحتاج صلاحية خاصة
  if (subtotal > 0 && input.discount / subtotal > 0.1) {
    const allowed = await can("sales.discount.large");
    if (!allowed) throw new Error("الخصم اللي حاطه أكبر من المسموح - محتاج صلاحية \"منح خصم كبير\"");
  }

  const result = await db.transaction(async (tx) => {
    // فحص حد الائتمان بيتم *جوه* الـ transaction وبعد قفل صف العميل، عشان نمنع تجاوز الحد لو فيه فاتورتين بتتسجلوا لنفس العميل في نفس اللحظة
    if (input.customerId && input.paymentStatus !== "PAID") {
      const [customer] = await tx.select().from(schema.customers).where(eq(schema.customers.id, input.customerId)).for("update");
      if (customer) {
        const unpaid = total - input.paidAmount;
        const check = checkCreditLimit(customer, unpaid);
        if (!check.ok) throw new Error(check.message);
      }
    }

    const code = genCode("INV");
    const [invoice] = await tx
      .insert(schema.salesInvoices)
      .values({
        code,
        customerId: input.customerId,
        locationId: input.locationId,
        subtotal: subtotal.toFixed(2),
        discount: input.discount.toFixed(2),
        total: total.toFixed(2),
        paidAmount: input.paidAmount.toFixed(2),
        paymentStatus: input.paymentStatus,
        paymentMethodId: input.paymentMethodId,
        source: input.source,
        notes: input.notes || undefined,
        createdById: session.userId,
      })
      .returning();

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const [ii] = await tx
        .insert(schema.salesInvoiceItems)
        .values({
          invoiceId: invoice.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          unitCost: product.avgCost,
        })
        .returning();

      const newQty = await adjustStock(tx, item.productId, input.locationId, -item.quantity);
      if (newQty < 0) {
        const available = newQty + item.quantity;
        throw new Error(`المنتج "${product.name}" غير متاح بالكمية دي في المكان ده - المتاح فعليًا ${available} بس وأنت طالب ${item.quantity}`);
      }

      if (item.serials && item.serials.length) {
        for (const sn of item.serials) {
          await tx
            .update(schema.productSerials)
            .set({ status: "SOLD", soldAt: new Date(), invoiceItemId: ii.id, warrantyStart: new Date(), warrantyMonths: product.warrantyMonths ?? undefined })
            .where(eq(schema.productSerials.serialNumber, sn));
        }
      }
    }

    if (input.customerId) {
      const unpaid = total - input.paidAmount;
      if (unpaid !== 0) await updateCustomerBalance(tx, input.customerId, unpaid);
    }

    if (input.paidAmount > 0 && input.paymentMethodId) {
      await postCashByPaymentMethod(tx, input.paymentMethodId, "SALE_IN", input.paidAmount, {
        note: `تحصيل فاتورة ${code}`,
        refType: "SalesInvoice",
        refId: invoice.id,
        createdById: session.userId,
      });
    }

    return invoice;
  });

  await logAudit({ action: "CREATE", entityType: "SalesInvoice", entityId: result.id, after: result });
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/customers");
  return result;
}

export async function listInvoices(search?: string) {
  await requirePermission("sales.view");
  const rows = await db
    .select({
      id: schema.salesInvoices.id,
      code: schema.salesInvoices.code,
      total: schema.salesInvoices.total,
      paidAmount: schema.salesInvoices.paidAmount,
      paymentStatus: schema.salesInvoices.paymentStatus,
      source: schema.salesInvoices.source,
      createdAt: schema.salesInvoices.createdAt,
      customerName: schema.customers.name,
    })
    .from(schema.salesInvoices)
    .leftJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
    .orderBy(desc(schema.salesInvoices.createdAt))
    .limit(300);
  return rows;
}

export async function getInvoice(id: string) {
  await requirePermission("sales.view");
  const [invoice] = await db.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, id));
  if (!invoice) return null;
  const items = await db
    .select({
      id: schema.salesInvoiceItems.id,
      quantity: schema.salesInvoiceItems.quantity,
      unitPrice: schema.salesInvoiceItems.unitPrice,
      productName: schema.products.name,
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
    .where(eq(schema.salesInvoiceItems.invoiceId, id));
  let customer = null;
  if (invoice.customerId) [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, invoice.customerId));
  let createdByName: string | null = null;
  if (invoice.createdById) {
    const [u] = await db.select({ fullName: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, invoice.createdById));
    createdByName = u?.fullName || null;
  }
  const canEdit = await can("sales.edit_old");
  return { invoice, items, customer, createdByName, canEdit };
}

// -------------------- حذف فاتورة بيع (بيعكس المخزون ورصيد العميل والخزينة) --------------------
export async function deleteSalesInvoice(id: string) {
  await requirePermission("sales.edit_old");
  const session = await requireSession();
  const [invoice] = await db.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, id));
  if (!invoice) throw new Error("الفاتورة غير موجودة");
  const items = await db.select().from(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.invoiceId, id));

  await db.transaction(async (tx) => {
    for (const item of items) {
      await adjustStock(tx, item.productId, invoice.locationId, item.quantity);
    }
    if (invoice.customerId) {
      const unpaid = Number(invoice.total) - Number(invoice.paidAmount);
      if (unpaid !== 0) await updateCustomerBalance(tx, invoice.customerId, -unpaid);
    }
    if (Number(invoice.paidAmount) > 0 && invoice.paymentMethodId) {
      await postCashByPaymentMethod(tx, invoice.paymentMethodId, "RETURN_OUT", Number(invoice.paidAmount), {
        note: `حذف فاتورة بيع ${invoice.code}`,
        refType: "SalesInvoice",
        refId: invoice.id,
        createdById: session.userId,
        direction: "out",
      });
    }
    await tx.delete(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.invoiceId, id));
    await tx.delete(schema.salesInvoices).where(eq(schema.salesInvoices.id, id));
  });

  await logAudit({ action: "DELETE", entityType: "SalesInvoice", entityId: id, before: invoice });
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/customers");
}

// -------------------- QUOTES --------------------

type QuoteInput = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  discountPct?: number;
  discountAmt?: number;
  vatEnabled: boolean;
  vatRate?: number;
  isTemplate?: boolean;
  templateName?: string;
};

export async function createQuote(input: QuoteInput) {
  await requirePermission("quotes.manage");
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  let afterDiscount = subtotal;
  if (input.discountPct) afterDiscount -= subtotal * (input.discountPct / 100);
  if (input.discountAmt) afterDiscount -= input.discountAmt;
  const vatAmount = input.vatEnabled && input.vatRate ? afterDiscount * (input.vatRate / 100) : 0;
  const total = afterDiscount + vatAmount;

  const code = genCode("QUO");
  const [quote] = await db
    .insert(schema.quotes)
    .values({
      code,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      subtotal: subtotal.toFixed(2),
      discountPct: input.discountPct?.toFixed(2),
      discountAmt: input.discountAmt?.toFixed(2),
      vatEnabled: input.vatEnabled,
      vatRate: input.vatRate?.toFixed(2),
      total: total.toFixed(2),
      isTemplate: input.isTemplate,
      templateName: input.templateName,
    })
    .returning();

  for (const item of input.items) {
    await db.insert(schema.quoteItems).values({ quoteId: quote.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2) });
  }
  revalidatePath("/quotes");
  return quote;
}

export async function listQuotes() {
  await requirePermission("quotes.manage");
  return db.select().from(schema.quotes).orderBy(desc(schema.quotes.createdAt));
}

export async function getQuote(id: string) {
  await requirePermission("quotes.manage");
  const [quote] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  const items = await db
    .select({ id: schema.quoteItems.id, quantity: schema.quoteItems.quantity, unitPrice: schema.quoteItems.unitPrice, productName: schema.products.name })
    .from(schema.quoteItems)
    .innerJoin(schema.products, eq(schema.quoteItems.productId, schema.products.id))
    .where(eq(schema.quoteItems.quoteId, id));
  return { quote, items };
}
