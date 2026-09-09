"use server";
import { db, schema } from "@/db";
import { eq, and, desc, inArray, or, ilike } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode, can, isCallerAdmin } from "@/lib/auth";
import { postCashByPaymentMethod, adjustStock, updateCustomerBalance, checkCreditLimit, stockShortageMessage } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { normalizePhone } from "@/lib/phone";
import { revalidatePath } from "next/cache";

type InvoiceInput = {
  customerId?: string;
  // لو مفيش customerId جاهز، تقدر تبعت اسم/رقم هاتف بس وهيتسجل عميل جديد تلقائيًا (أو يترَبَط بعميل موجود بنفس الرقم)
  customerName?: string;
  customerPhone?: string;
  customerType?: "RETAIL" | "TRADER";
  locationId: string;
  items: { productId: string; quantity: number; unitPrice: number; serials?: string[] }[];
  discount: number;
  vatEnabled?: boolean;
  vatRate?: number;
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  paidAmount: number;
  paymentMethodId?: string;
  source: "WEBSITE" | "PHONE" | "WHATSAPP" | "FACEBOOK" | "OTHER";
  notes?: string;
};

export async function createSalesInvoice(input: InvoiceInput) {
  try {
    return await createSalesInvoiceInner(input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ الفاتورة");
  }
}

async function createSalesInvoiceInner(input: InvoiceInput) {
  await requirePermission("sales.create");
  const session = await requireSession();

  if (!input.items || input.items.length === 0) {
    throw new Error("لازم تضيف صنف واحد على الأقل في الفاتورة قبل الحفظ");
  }
  // تحقق من صحة كل سطر - قبل كده كان ممكن تتسجل كمية أو سعر سالب من الشاشة من غير ما السيرفر يرفضها،
  // وده كان بيزوّد المخزون بدل ما يقلله وممكن يخلي إجمالي الفاتورة سالب.
  for (const it of input.items) {
    if (!it.productId) throw new Error("فيه سطر صنف لسه ماتحددش");
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new Error("الكمية لازم تكون رقم أكبر من صفر لكل صنف في الفاتورة");
    if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) throw new Error("السعر لازم يكون رقم صحيح (مش سالب) لكل صنف في الفاتورة");
  }
  if (!Number.isFinite(input.discount) || input.discount < 0) throw new Error("قيمة الخصم لازم تكون رقم صحيح (مش سالب)");
  if (!Number.isFinite(input.paidAmount) || input.paidAmount < 0) throw new Error("المبلغ المدفوع لازم يكون رقم صحيح (مش سالب)");

  const products = await db.select().from(schema.products);
  const productMap = new Map(products.map((p) => [p.id, p]));

  // أقل سعر بيع مسموح لكل منتج (لو متحدد) - بيتطبق على كل الموظفين ما عدا الأدمن الكامل، اللي
  // يقدر يحط أي سعر حتى لو صفر. ده بيقفل ثغرة تعديل سعر السطر مباشرة (بدل خانة الخصم) للتحايل
  // على صلاحية "منح خصم كبير" - قبل كده كان ممكن تنزّل سعر الوحدة لأي رقم وإجمالي الفاتورة ينزل
  // معاه من غير ما خانة الخصم تتحرك خالص فمتقاعدتش أي تحقق.
  const isAdmin = await isCallerAdmin();
  if (!isAdmin) {
    for (const it of input.items) {
      const product = productMap.get(it.productId);
      const minPrice = product?.minSellingPrice !== null && product?.minSellingPrice !== undefined ? Number(product.minSellingPrice) : null;
      if (minPrice !== null && it.unitPrice < minPrice) {
        throw new Error(`السعر اللي حاطه لـ"${product?.name || "المنتج"}" (${it.unitPrice}) أقل من أقل سعر بيع مسموح (${minPrice}) - محتاج صلاحية أدمن عشان تبيع بسعر أقل من كده`);
      }
    }
  }

  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const afterDiscount = subtotal - input.discount;
  if (afterDiscount < 0) throw new Error("الخصم أكبر من إجمالي الفاتورة - راجع القيم");

  // خصم أكبر من 10% من إجمالي الفاتورة يحتاج صلاحية خاصة
  if (subtotal > 0 && input.discount / subtotal > 0.1) {
    const allowed = await can("sales.discount.large");
    if (!allowed) throw new Error("الخصم اللي حاطه أكبر من المسموح - محتاج صلاحية \"منح خصم كبير\"");
  }

  // ضريبة القيمة المضافة - نفس منطق عرض السعر (createQuoteInner) بالظبط: نسبة اختيارية على
  // الإجمالي بعد الخصم. لو الضريبة مفعّلة لازم نتأكد من صحة النسبة قبل ما نحسب عليها أي حاجة.
  if (input.vatEnabled && (input.vatRate === undefined || input.vatRate === null || !Number.isFinite(input.vatRate) || input.vatRate < 0)) {
    throw new Error("نسبة الضريبة لازم تكون رقم صحيح (مش سالب)");
  }
  const vatAmount = input.vatEnabled && input.vatRate ? afterDiscount * (input.vatRate / 100) : 0;
  const total = afterDiscount + vatAmount;

  const result = await db.transaction(async (tx) => {
    // ربط/إنشاء العميل تلقائيًا بالهاتف لو مبعتش customerId جاهز (اختيار من البحث) وبعتّ اسم و/أو رقم هاتف بس -
    // بنفس أسلوب تسجيل الأوردرات: لو الرقم مسجل قبل كده بنربط بنفس العميل، ولو رقم جديد بنسجله عميل جديد أوتوماتيك
    let customerId = input.customerId;
    if (!customerId && (input.customerName?.trim() || input.customerPhone?.trim())) {
      const phone = input.customerPhone?.trim() ? normalizePhone(input.customerPhone.trim()) : undefined;
      if (phone) {
        const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
        if (existing) {
          customerId = existing.id;
          if (input.customerName?.trim() && input.customerName.trim() !== existing.name) {
            await tx.update(schema.customers).set({ name: input.customerName.trim() }).where(eq(schema.customers.id, existing.id));
          }
        } else {
          const [created] = await tx
            .insert(schema.customers)
            .values({ name: input.customerName?.trim() || "عميل بدون اسم", phone, type: input.customerType || "RETAIL" })
            .returning();
          customerId = created.id;
        }
      } else if (input.customerName?.trim()) {
        const [created] = await tx
          .insert(schema.customers)
          .values({ name: input.customerName.trim(), type: input.customerType || "RETAIL" })
          .returning();
        customerId = created.id;
      }
    }

    // فحص حد الائتمان بيتم *جوه* الـ transaction وبعد قفل صف العميل، عشان نمنع تجاوز الحد لو فيه فاتورتين بتتسجلوا لنفس العميل في نفس اللحظة
    if (customerId && input.paymentStatus !== "PAID") {
      const [customer] = await tx.select().from(schema.customers).where(eq(schema.customers.id, customerId)).for("update");
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
        customerId,
        locationId: input.locationId,
        subtotal: subtotal.toFixed(2),
        discount: input.discount.toFixed(2),
        vatEnabled: input.vatEnabled || false,
        vatRate: input.vatEnabled ? input.vatRate?.toFixed(2) : undefined,
        total: total.toFixed(2),
        paidAmount: input.paidAmount.toFixed(2),
        paymentStatus: input.paymentStatus,
        paymentMethodId: input.paymentMethodId,
        source: input.source,
        notes: input.notes || undefined,
        createdById: session.userId,
        // في الفواتير العادية البايع الفعلي هو نفسه اللي سجّل الفاتورة - بيختلف بس في حالة "بيع من
        // عهدة الموظف" (شوف sellFromConsignment في actions/consignments.ts) اللي بتحدد soldById بنفسها بعد الإنشاء
        soldById: session.userId,
      })
      .returning();

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        // قبل كده كان بيتجاهل السطر ده تمامًا (continue) بينما subtotal/total اتحسبوا بالفعل
        // وهما شاملين قيمة السطر ده - يعني العميل يتحمّل مبلغ سطر منتج مالوش وجود في الفاتورة
        // النهائية خالص، من غير أي أثر أو تفسير. دلوقتي برفض العملية كلها بدل ما نسيب فاتورة ناقصة.
        throw new Error("فيه سطر بمنتج غير موجود في قاعدة البيانات - يمكن اتمسح بعد ما فتحت شاشة البيع. حدّث الصفحة وحاول تاني");
      }
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
        throw new Error(await stockShortageMessage(tx, item.productId, product.name, input.locationId, available, item.quantity));
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

    if (customerId) {
      const unpaid = total - input.paidAmount;
      if (unpaid !== 0) await updateCustomerBalance(tx, customerId, unpaid);
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
  // قبل كده كانت الباراميتر دي متعرّفة بس مش مستخدمة خالص في جسم الاستعلام - أي بحث في الشاشة كان
  // بيرجع نفس آخر 300 فاتورة زي ما هي من غير أي فلترة فعلية، وأصلًا مفيش شاشة بحث بتستخدمها
  const trimmed = search?.trim();
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
    .where(
      trimmed
        ? or(ilike(schema.salesInvoices.code, `%${trimmed}%`), ilike(schema.customers.name, `%${trimmed}%`), ilike(schema.customers.phone, `%${trimmed}%`))
        : undefined
    )
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
  try {
    return await deleteSalesInvoiceInner(id);
  } catch (e) {
    return toActionError(e, "تعذر حذف الفاتورة");
  }
}

async function deleteSalesInvoiceInner(id: string) {
  await requirePermission("sales.edit_old");
  const session = await requireSession();
  let invoiceForAudit: any = null;

  await db.transaction(async (tx) => {
    // قفل صف الفاتورة الأول جوه المعاملة عشان لو حد ضغط "حذف" مرتين قريب من بعض، المحاولة التانية
    // تستنى لحد ما الأولى تخلص وتلاقي الفاتورة اتمسحت بالفعل فتترفض - بدل ما تعكس نفس الأثر مرتين
    // (رجوع مخزون مرتين، وفلوس زيادة في الخزينة "كأنها اتردت" مرتين).
    const [invoice] = await tx.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, id)).for("update");
    if (!invoice) throw new Error("الفاتورة غير موجودة (يمكن اتمسحت بالفعل)");
    invoiceForAudit = invoice;
    const items = await tx.select().from(schema.salesInvoiceItems).where(eq(schema.salesInvoiceItems.invoiceId, id));

    for (const item of items) {
      await adjustStock(tx, item.productId, invoice.locationId, item.quantity);
    }
    // رجّع أي سيريالات اتباعت في الفاتورة دي لحالة "متاح" تاني - قبل كده كانت فاضلة متسجلة "مباع"
    // للأبد حتى لو الفاتورة اتمسحت، فبحث السيريال كان بيقول "متسجل قبل كده كمباع" غلط.
    const itemIds = items.map((i) => i.id);
    if (itemIds.length) {
      for (const itemId of itemIds) {
        await tx
          .update(schema.productSerials)
          .set({ status: "IN_STOCK", soldAt: null, invoiceItemId: null, warrantyStart: null, locationId: invoice.locationId })
          .where(eq(schema.productSerials.invoiceItemId, itemId));
      }
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

  await logAudit({ action: "DELETE", entityType: "SalesInvoice", entityId: id, before: invoiceForAudit });
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/cash");
  revalidatePath("/customers");
}

// -------------------- QUOTES --------------------

type QuoteInput = {
  customerId?: string;
  // لو مفيش customerId جاهز، هيتسجل عميل جديد تلقائي بالاسم/الرقم دول (أو يترَبَط بعميل موجود بنفس الرقم) - زي فاتورة البيع
  customerName?: string;
  customerPhone?: string;
  customerType?: "RETAIL" | "TRADER";
  items: { productId: string; quantity: number; unitPrice: number }[];
  discountPct?: number;
  discountAmt?: number;
  vatEnabled: boolean;
  vatRate?: number;
  isTemplate?: boolean;
  templateName?: string;
};

export async function createQuote(input: QuoteInput) {
  try {
    return await createQuoteInner(input);
  } catch (e) {
    return toActionError(e, "تعذر حفظ عرض السعر");
  }
}

async function createQuoteInner(input: QuoteInput) {
  await requirePermission("quotes.manage");
  // قبل كده عرض السعر كان مقبول من غير أي أصناف، ومن غير حد أقصى لنسبة الخصم (ممكن تحط 150%) -
  // على عكس فاتورة البيع اللي فيها نفس الحماية دي بالظبط.
  if (!input.items || input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل في عرض السعر قبل الحفظ");
  for (const it of input.items) {
    if (!it.productId) throw new Error("فيه سطر صنف لسه ماتحددش");
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new Error("الكمية لازم تكون رقم أكبر من صفر لكل صنف");
    if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) throw new Error("السعر لازم يكون رقم صحيح (مش سالب) لكل صنف");
  }
  // نفس حماية أقل سعر بيع الموجودة في فاتورة البيع بالظبط - عرض السعر لازم يلتزم بنفس الحد الأدنى
  const isAdminQuote = await isCallerAdmin();
  if (!isAdminQuote) {
    const productsForQuote = await db.select().from(schema.products).where(inArray(schema.products.id, input.items.map((i) => i.productId)));
    const minPriceMap = new Map(productsForQuote.map((p) => [p.id, p]));
    for (const it of input.items) {
      const product = minPriceMap.get(it.productId);
      const minPrice = product?.minSellingPrice !== null && product?.minSellingPrice !== undefined ? Number(product.minSellingPrice) : null;
      if (minPrice !== null && it.unitPrice < minPrice) {
        throw new Error(`السعر اللي حاطه لـ"${product?.name || "المنتج"}" (${it.unitPrice}) أقل من أقل سعر بيع مسموح (${minPrice}) - محتاج صلاحية أدمن`);
      }
    }
  }
  if (input.discountPct !== undefined && input.discountPct !== null && (input.discountPct < 0 || input.discountPct > 100)) {
    throw new Error("نسبة الخصم لازم تكون بين 0% و 100%");
  }
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  if (input.discountAmt !== undefined && input.discountAmt !== null && (input.discountAmt < 0 || input.discountAmt > subtotal)) {
    throw new Error("قيمة الخصم لازم تكون رقم موجب وأقل من أو يساوي إجمالي عرض السعر");
  }
  let afterDiscount = subtotal;
  if (input.discountPct) afterDiscount -= subtotal * (input.discountPct / 100);
  if (input.discountAmt) afterDiscount -= input.discountAmt;
  // نفس قاعدة الخصم الكبير في فاتورة البيع: خصم أكبر من 10% محتاج صلاحية خاصة
  if (subtotal > 0 && (subtotal - afterDiscount) / subtotal > 0.1) {
    const allowed = await can("sales.discount.large");
    if (!allowed) throw new Error("الخصم اللي حاطه أكبر من المسموح - محتاج صلاحية \"منح خصم كبير\"");
  }
  const vatAmount = input.vatEnabled && input.vatRate ? afterDiscount * (input.vatRate / 100) : 0;
  const total = afterDiscount + vatAmount;

  const quote = await db.transaction(async (tx) => {
    // ربط/إنشاء العميل تلقائيًا بالهاتف - بنفس أسلوب فاتورة البيع والأوردر
    let customerId = input.customerId;
    if (!customerId && (input.customerName?.trim() || input.customerPhone?.trim())) {
      const phone = input.customerPhone?.trim() ? normalizePhone(input.customerPhone.trim()) : undefined;
      if (phone) {
        const [existing] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, phone)).for("update");
        if (existing) {
          customerId = existing.id;
          if (input.customerName?.trim() && input.customerName.trim() !== existing.name) {
            await tx.update(schema.customers).set({ name: input.customerName.trim() }).where(eq(schema.customers.id, existing.id));
          }
        } else {
          const [created] = await tx
            .insert(schema.customers)
            .values({ name: input.customerName?.trim() || "عميل بدون اسم", phone, type: input.customerType || "RETAIL" })
            .returning();
          customerId = created.id;
        }
      } else if (input.customerName?.trim()) {
        const [created] = await tx
          .insert(schema.customers)
          .values({ name: input.customerName.trim(), type: input.customerType || "RETAIL" })
          .returning();
        customerId = created.id;
      }
    }

    const code = genCode("QUO");
    const [q] = await tx
      .insert(schema.quotes)
      .values({
        code,
        customerId,
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
      await tx.insert(schema.quoteItems).values({ quoteId: q.id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2) });
    }
    return q;
  });

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
