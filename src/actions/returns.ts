"use server";
import { db, schema } from "@/db";
import { eq, desc, and, ne, inArray, like } from "drizzle-orm";
import { requirePermission, requireSession, logAudit, genCode } from "@/lib/auth";
import { adjustStock, updateCustomerBalance, updateSupplierBalance, postCashByPaymentMethod } from "@/lib/ops";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";

// -------------------- بيانات الفاتورة الأصلية لبناء مرتجع بيع مرتبط بيها --------------------
// كانت شاشة "تسجيل مرتجع" بتخلي المستخدم يختار أي منتج وكمية بحرية تامة من غير أي ربط بفاتورة -
// فمكانش فيه أي حد أقصى فعلي لكمية أي مرتجع (الحماية اللي في createReturnRequestInner ضد الإرجاع
// المتكرر لنفس البند كانت موجودة بالكود لكن معطّلة عمليًا لأنها بتتفعّل بس لو invoiceItemId موجود،
// وده مكانش بيتبعت من الشاشة أصلًا). الدالتين دول بيوفروا للشاشة قائمة فواتير العميل، وبعد اختيار
// الفاتورة، بنودها مع "الكمية المتاحة للإرجاع فعليًا" بعد خصم أي مرتجع سابق (معلّق أو معتمد) لنفس البند.
export async function listCustomerInvoicesForReturn(customerId: string) {
  await requirePermission("returns.create");
  return db
    .select({
      id: schema.salesInvoices.id,
      code: schema.salesInvoices.code,
      total: schema.salesInvoices.total,
      paidAmount: schema.salesInvoices.paidAmount,
      paymentStatus: schema.salesInvoices.paymentStatus,
      createdAt: schema.salesInvoices.createdAt,
    })
    .from(schema.salesInvoices)
    .where(eq(schema.salesInvoices.customerId, customerId))
    .orderBy(desc(schema.salesInvoices.createdAt))
    .limit(100);
}

// -------------------- إيجاد فاتورة مباشرة بالكود --------------------
// طريقة تانية بديلة عن "اختر العميل الأول" - مفيدة تحديدًا للفواتير النقدية اللي اتسجلت من غير عميل
// مسجل خالص (customerId فاضي)، واللي شاشة "اختر العميل" الأساسية مش قادرة توصلها أصلًا لأنها بتفلتر
// فواتير عميل محدد بس. البحث هنا بالكود مش مربوط بعميل، فبيشتغل لأي فاتورة سواء ليها عميل مسجل أو لأ.
export async function searchInvoicesForReturn(codeQuery: string) {
  await requirePermission("returns.create");
  const q = codeQuery.trim();
  if (!q) return [];
  return db
    .select({
      id: schema.salesInvoices.id,
      code: schema.salesInvoices.code,
      total: schema.salesInvoices.total,
      paidAmount: schema.salesInvoices.paidAmount,
      paymentStatus: schema.salesInvoices.paymentStatus,
      createdAt: schema.salesInvoices.createdAt,
      customerId: schema.salesInvoices.customerId,
      customerName: schema.customers.name,
    })
    .from(schema.salesInvoices)
    .leftJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
    .where(like(schema.salesInvoices.code, `%${q}%`))
    .orderBy(desc(schema.salesInvoices.createdAt))
    .limit(20);
}

export async function getInvoiceItemsForReturn(invoiceId: string) {
  await requirePermission("returns.create");
  const items = await db
    .select({
      id: schema.salesInvoiceItems.id,
      productId: schema.salesInvoiceItems.productId,
      productName: schema.products.name,
      quantity: schema.salesInvoiceItems.quantity,
      unitPrice: schema.salesInvoiceItems.unitPrice,
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
    .where(eq(schema.salesInvoiceItems.invoiceId, invoiceId));
  const itemIds = items.map((i) => i.id);
  const priorRows = itemIds.length
    ? await db
        .select({ invoiceItemId: schema.returnItems.invoiceItemId, quantity: schema.returnItems.quantity })
        .from(schema.returnItems)
        .innerJoin(schema.returnRequests, eq(schema.returnItems.returnRequestId, schema.returnRequests.id))
        .where(and(inArray(schema.returnItems.invoiceItemId, itemIds), ne(schema.returnRequests.status, "REJECTED")))
    : [];
  const priorMap: Record<string, number> = {};
  for (const r of priorRows) if (r.invoiceItemId) priorMap[r.invoiceItemId] = (priorMap[r.invoiceItemId] || 0) + r.quantity;
  return items.map((i) => ({ ...i, alreadyReturned: priorMap[i.id] || 0, returnableQty: i.quantity - (priorMap[i.id] || 0) }));
}

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
  // مرتجع البيع لازم يكون مرتبط بالفاتورة الأصلية وببند الفاتورة بالظبط لكل صنف - قبل كده كان
  // ممكن تسجّل مرتجع بيع بأي منتج/كمية بحرية من غير أي ربط بفاتورة حقيقية، وده كان بيعطّل فعليًا
  // حماية "منع تكرار الإرجاع لنفس البند بكمية أكبر من الأصلية" اللي تحت (كانت موجودة بالكود لكن
  // بتتفعّل بس لو invoiceItemId موجود، وده مكانش بيتبعت من الشاشة أصلًا خالص).
  if (input.kind === "SALE_RETURN") {
    if (!input.invoiceId) throw new Error("لازم تختار الفاتورة الأصلية للمرتجع");
    for (const item of input.items) {
      if (!item.invoiceItemId) throw new Error("لازم تختار البند الأصلي من الفاتورة لكل صنف في المرتجع");
    }
  }
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

// عايزين اسم العميل/المورد وكود الفاتورة الأصلية يظهروا في جدول المرتجعات مباشرة - قبل كده الشاشة
// كانت بتوري بيانات المرتجع نفسه بس (كود المرتجع، النوع، المبلغ...) من غير ما تقول "مين العميل"
// أو "الفاتورة اللي جايه منها"، فمكانش فيه طريقة تتعرف بيها على المرتجع من غير ما تفتحه (ولو فتحته
// مكانش فيه أصلًا شاشة تفاصيل شغالة - شوف getReturnDetail تحت). ده استعلام واحد بس بـ 3 leftJoin
// (مش استعلام لكل صف)، فمفيش أي خطر تكرار الحادثة اللي حصلت مع صفحة الأرباح.
export async function listReturns() {
  await requirePermission("returns.create");
  return db
    .select({
      id: schema.returnRequests.id,
      code: schema.returnRequests.code,
      kind: schema.returnRequests.kind,
      totalAmount: schema.returnRequests.totalAmount,
      status: schema.returnRequests.status,
      reasonCategory: schema.returnRequests.reasonCategory,
      reason: schema.returnRequests.reason,
      imageUrl: schema.returnRequests.imageUrl,
      createdAt: schema.returnRequests.createdAt,
      invoiceCode: schema.salesInvoices.code,
      customerName: schema.customers.name,
      supplierName: schema.suppliers.name,
    })
    .from(schema.returnRequests)
    .leftJoin(schema.salesInvoices, eq(schema.returnRequests.invoiceId, schema.salesInvoices.id))
    .leftJoin(schema.customers, eq(schema.returnRequests.customerId, schema.customers.id))
    .leftJoin(schema.suppliers, eq(schema.returnRequests.supplierId, schema.suppliers.id))
    .orderBy(desc(schema.returnRequests.createdAt));
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
//
// cashRefundAmount: قد إيه من قيمة المرتجع (ret.totalAmount) هيترد "نقدي دلوقتي" من الخزينة، والباقي
// (totalAmount - cashRefundAmount) بيتخصم من رصيد العميل/المورد بدل ما يترد كاش. قبل كده الاعتماد
// كان بيعمل الاتنين مع بعض دايمًا وبكامل قيمة المرتجع (يخصم رصيد العميل بالكامل + يطلع فلوس كاش
// بالكامل من الخزينة كمان) - يعني كل مرتجع بيع بيتّرد فلوسه "مرتين" فعليًا. لو الباراميتر ده متبعتش،
// بيتعامل معاه كـ 0 (يعني الافتراضي الآمن: خصم من الرصيد بس، من غير أي حركة كاش) بدل ما يفترض
// استرداد كامل بالغلط.
export async function approveReturn(id: string, locationId: string, refundPaymentMethodId?: string, cashRefundAmount?: number) {
  try {
    return await approveReturnInner(id, locationId, refundPaymentMethodId, cashRefundAmount);
  } catch (e) {
    return toActionError(e, "تعذر اعتماد المرتجع");
  }
}

async function approveReturnInner(id: string, locationId: string, refundPaymentMethodId?: string, cashRefundAmount?: number) {
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
    // قيمة المرتجع بتتقسم لجزئين ميتقابلوش مع بعض أبدًا: جزء بيترد كاش من الخزينة، والباقي بيتخصم من
    // رصيد العميل/المورد - عشان قيمة المرتجع متتّرد مرتين (مرة كاش ومرة كخصم رصيد) زي ما كان بيحصل.
    const totalAmount = Number(ret.totalAmount);
    const cashPortion = Math.min(Math.max(Number(cashRefundAmount) || 0, 0), totalAmount);
    const balancePortion = totalAmount - cashPortion;
    if (cashPortion > 0 && !refundPaymentMethodId) {
      throw new Error("لازم تختار طريقة الدفع اللي هيترد بيها الجزء النقدي من المرتجع");
    }

    if (ret.kind === "SALE_RETURN" && ret.customerId) {
      if (balancePortion > 0) {
        await updateCustomerBalance(tx, ret.customerId, -balancePortion);
      }
      if (cashPortion > 0 && refundPaymentMethodId) {
        await postCashByPaymentMethod(tx, refundPaymentMethodId, "RETURN_OUT", cashPortion, {
          note: `استرداد مرتجع ${ret.code}`,
          refType: "ReturnRequest",
          refId: ret.id,
          createdById: session.userId,
        });
      }
    }
    if (ret.kind === "PURCHASE_RETURN" && ret.supplierId) {
      // بيقل اللي علينا للمورد بمقدار الجزء اللي مخصوم من رصيده
      if (balancePortion > 0) {
        await updateSupplierBalance(tx, ret.supplierId, -balancePortion);
      }
      if (cashPortion > 0 && refundPaymentMethodId) {
        // لو المورد رجعلنا فلوس كاش بدل ما يخصم من رصيده
        await postCashByPaymentMethod(tx, refundPaymentMethodId, "RETURN_IN", cashPortion, {
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
