import "server-only";
import { schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";

// كل الدوال دي بتتنفذ جوه transaction (tx) عشان تضمن التزامن الصحيح مع كذا مستخدم بيكتبوا في نفس اللحظة

type Tx = any; // drizzle transaction type (postgres-js)

export async function postCashByPaymentMethod(
  tx: Tx,
  paymentMethodId: string,
  type: (typeof schema.cashTxTypeEnum.enumValues)[number],
  amount: number,
  opts: { note?: string; refType?: string; refId?: string; createdById?: string; direction?: "in" | "out" } = {}
) {
  if (!Number.isFinite(amount)) {
    // قيمة مش رقمية (NaN) - قبل كده كانت بتعدي من غير رفض وتخزن رصيد "NaN" مكسور في الخزينة
    throw new Error("قيمة المبلغ غير صحيحة (مش رقم) - راجع المبلغ المدخل");
  }
  if (amount <= 0) return;
  const [drawer] = await tx
    .select()
    .from(schema.cashDrawers)
    .where(eq(schema.cashDrawers.paymentMethodId, paymentMethodId))
    .for("update");
  if (!drawer) throw new Error("لا توجد خزينة مرتبطة بطريقة الدفع دي");

  const isOut = opts.direction
    ? opts.direction === "out"
    : ["PURCHASE_OUT", "EXPENSE_OUT", "PAYMENT_OUT", "RETURN_OUT", "TRANSFER_OUT", "LOAN_OUT"].includes(type);
  const signedAmount = isOut ? -amount : amount;
  const newBalance = Number(drawer.balance) + signedAmount;

  await tx.update(schema.cashDrawers).set({ balance: newBalance.toFixed(2), updatedAt: new Date() }).where(eq(schema.cashDrawers.id, drawer.id));

  await tx.insert(schema.cashTransactions).values({
    drawerId: drawer.id,
    type,
    amount: amount.toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    note: opts.note,
    refType: opts.refType,
    refId: opts.refId,
    createdById: opts.createdById,
  });
  return newBalance;
}

/**
 * بتزوّد/تنقص رصيد منتج في مكان معيّن جوه transaction (مع قفل الصف بـ for("update") لمنع أي
 * تزامن). بشكل افتراضي بترفض أي عملية هتودّي بالرصيد الناتج تحت الصفر (حماية مركزية - قبل كده كل
 * استدعاء كان لازم يتذكر بنفسه إنه يتحقق من `newQty < 0` بعد النداء، وكان سهل جدًا ينسى حالة
 * واحدة زي خطوة عكس تعديل التحويل، فيسيب الرصيد يروح بالسالب من غير أي تحذير أو رفض).
 * لو محتاج تسمح بالسالب استثنائيًا (مفيش حالة استخدام حالية بس سايبينها موجودة للمرونة)، ابعت
 * `allowNegative: true`.
 */
export async function adjustStock(
  tx: Tx,
  productId: string,
  locationId: string,
  delta: number,
  opts: { allowNegative?: boolean } = {}
) {
  const [existing] = await tx
    .select()
    .from(schema.stocks)
    .where(and(eq(schema.stocks.productId, productId), eq(schema.stocks.locationId, locationId)))
    .for("update");
  const availableBefore = existing?.quantity || 0;
  const newQty = availableBefore + delta;

  if (newQty < 0 && !opts.allowNegative) {
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
    throw new Error(await stockShortageMessage(tx, productId, product?.name || "المنتج", locationId, availableBefore, -delta));
  }

  if (existing) {
    await tx.update(schema.stocks).set({ quantity: newQty, updatedAt: new Date() }).where(eq(schema.stocks.id, existing.id));
  } else {
    await tx.insert(schema.stocks).values({ productId, locationId, quantity: newQty });
  }
  return newQty;
}

// بتقفل صفوف عدة خزائن بترتيب ثابت (مش بترتيب استخدامها في العملية) - عشان لو عمليتين بيلمسوا نفس
// الخزينتين في نفس اللحظة بس باتجاه معاكس (زي تحويل من أ لـ ب في نفس وقت تحويل من ب لـ أ، أو
// تعديل مصروف بيبدّل طريقة الدفع)، الاتنين هيحاولوا يقفلوا بنفس الترتيب فمش هيحصل تعطل متبادل
// (deadlock) - واحد هيستنى التاني بدل ما الاتنين يستنوا بعض للأبد.
export async function lockDrawersInOrder(tx: Tx, paymentMethodIds: (string | null | undefined)[]) {
  const ids = [...new Set(paymentMethodIds.filter(Boolean) as string[])].sort();
  for (const id of ids) {
    await tx.select().from(schema.cashDrawers).where(eq(schema.cashDrawers.paymentMethodId, id)).for("update");
  }
}

/**
 * بترجع رسالة عربية واضحة لما منتج ميكونش متاح بالكمية المطلوبة في مكان معيّن - بتوضح اسم
 * المكان، الكمية المتاحة فعليًا هناك، ولو المنتج متاح في مكان تاني (زي المخزن) بتقوله فين بالظبط،
 * عشان المستخدم يعرف السبب الحقيقي من غير ما يدوّر بنفسه (بدل ما بيقولها "غير متاح" بس من غير تفاصيل).
 */
export async function stockShortageMessage(
  tx: Tx,
  productId: string,
  productName: string,
  locationId: string,
  availableHere: number,
  requestedQty: number
) {
  const [loc] = await tx.select().from(schema.locations).where(eq(schema.locations.id, locationId));
  const elsewhere = await tx
    .select({ name: schema.locations.name, quantity: schema.stocks.quantity })
    .from(schema.stocks)
    .innerJoin(schema.locations, eq(schema.locations.id, schema.stocks.locationId))
    .where(and(eq(schema.stocks.productId, productId), sql`${schema.stocks.quantity} > 0`, sql`${schema.stocks.locationId} != ${locationId}`));
  const elsewhereText = elsewhere.length
    ? ` - لكن متاح في مكان تاني: ${elsewhere.map((e: any) => `${e.name} (${e.quantity})`).join("، ")}`
    : " - وغير متوفر حاليًا في أي مكان تاني";
  return `المنتج "${productName}" مش متوفر بالكمية دي في "${loc?.name || "المكان المحدد"}" (المتاح هناك فعليًا: ${Math.max(availableHere, 0)} بس، وأنت طالب ${requestedQty})${elsewhereText}`;
}

export async function updateCustomerBalance(tx: Tx, customerId: string, delta: number) {
  const [c] = await tx.select().from(schema.customers).where(eq(schema.customers.id, customerId)).for("update");
  if (!c) throw new Error("عميل غير موجود");
  const newBalance = Number(c.balance) + delta;
  await tx.update(schema.customers).set({ balance: newBalance.toFixed(2) }).where(eq(schema.customers.id, customerId));
  return newBalance;
}

export async function updateSupplierBalance(tx: Tx, supplierId: string, delta: number) {
  const [s] = await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplierId)).for("update");
  if (!s) throw new Error("مورد غير موجود");
  const newBalance = Number(s.balance) + delta;
  await tx.update(schema.suppliers).set({ balance: newBalance.toFixed(2) }).where(eq(schema.suppliers.id, supplierId));
  return newBalance;
}

export async function updateConsignmentBalance(tx: Tx, consignmentId: string, delta: number) {
  const [c] = await tx.select().from(schema.consignments).where(eq(schema.consignments.id, consignmentId)).for("update");
  if (!c) throw new Error("عهدة غير موجودة");
  const newBalance = Number(c.balance) + delta;
  await tx.update(schema.consignments).set({ balance: newBalance.toFixed(2) }).where(eq(schema.consignments.id, consignmentId));
  return newBalance;
}

// موجب = الشخص مديون لينا / سالب = إحنا مديونين له - راجع التعليق فوق جدول loanAccounts في schema.ts
export async function updateLoanAccountBalance(tx: Tx, loanAccountId: string, delta: number) {
  const [a] = await tx.select().from(schema.loanAccounts).where(eq(schema.loanAccounts.id, loanAccountId)).for("update");
  if (!a) throw new Error("حساب سلفة غير موجود");
  const newBalance = Number(a.balance) + delta;
  await tx.update(schema.loanAccounts).set({ balance: newBalance.toFixed(2) }).where(eq(schema.loanAccounts.id, loanAccountId));
  return newBalance;
}

// تحويل مبلغ بين خزينتين (طريقتي دفع مختلفتين) - بيقفل الخزينتين بترتيب ثابت الأول (lockDrawersInOrder)
// عشان يمنع أي deadlock لو حصل تحويل تاني بالعكس في نفس اللحظة، وبيرفض تلقائيًا لو رصيد الخزينة
// المرسلة مش كفاية (نفس حماية postCashByPaymentMethod العادية - مش بترفض هي نفسها الرصيد السالب،
// فالتحقق ده بيحصل هنا صراحة قبل التنفيذ)
export async function transferBetweenDrawers(
  tx: Tx,
  fromPaymentMethodId: string,
  toPaymentMethodId: string,
  amount: number,
  opts: { note?: string; createdById?: string }
) {
  if (fromPaymentMethodId === toPaymentMethodId) throw new Error("لازم تختار خزينتين مختلفتين للتحويل");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("مبلغ التحويل لازم يكون رقم أكبر من صفر");
  await lockDrawersInOrder(tx, [fromPaymentMethodId, toPaymentMethodId]);
  const [fromDrawer] = await tx.select().from(schema.cashDrawers).where(eq(schema.cashDrawers.paymentMethodId, fromPaymentMethodId));
  if (!fromDrawer) throw new Error("لا توجد خزينة مرتبطة بطريقة الدفع المرسلة");
  if (Number(fromDrawer.balance) < amount) {
    throw new Error(`رصيد "${fromDrawer.name}" مش كفاية للتحويل - المتاح فعليًا ${fromDrawer.balance} وأنت طالب تحويل ${amount}`);
  }
  await postCashByPaymentMethod(tx, fromPaymentMethodId, "TRANSFER_OUT", amount, {
    note: opts.note || "تحويل بين الخزائن",
    refType: "CashTransfer",
    createdById: opts.createdById,
  });
  await postCashByPaymentMethod(tx, toPaymentMethodId, "TRANSFER_IN", amount, {
    note: opts.note || "تحويل بين الخزائن",
    refType: "CashTransfer",
    createdById: opts.createdById,
  });
}

// متوسط التكلفة المرجح: التكلفة الجديدة = (كمية قديمة * تكلفة قديمة + كمية جديدة * تكلفة جديدة) / إجمالي الكمية
export async function updateWeightedAvgCost(tx: Tx, productId: string, addedQty: number, addedUnitCost: number) {
  const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for("update");
  if (!product) throw new Error("منتج غير موجود");

  const stockRows = await tx.select().from(schema.stocks).where(eq(schema.stocks.productId, productId));
  const currentQty = stockRows.reduce((s: number, r: any) => s + r.quantity, 0);
  const currentCost = Number(product.avgCost);

  const totalQty = currentQty + addedQty;
  const newAvgCost =
    totalQty > 0 ? (currentQty * currentCost + addedQty * addedUnitCost) / totalQty : addedUnitCost;

  await tx.update(schema.products).set({ avgCost: newAvgCost.toFixed(2), updatedAt: new Date() }).where(eq(schema.products.id, productId));
  return newAvgCost;
}

// عكس أثر عملية شراء واحدة على متوسط التكلفة المرجّح - بتتنادى قبل ما ننقص كمية فاتورة الشراء
// المحذوفة من stocks (لازم نعرف الكمية الإجمالية *قبل* النقص عشان نعكس معادلة المتوسط المرجّح
// بشكل صحيح). دقيقة رياضيًا 100% بس لو مفيش عمليات شراء تانية لنفس المنتج حصلت من وقت الفاتورة
// المحذوفة دي - في حالة تداخل فواتير شراء متعددة، الناتج بيبقى تقريبي (أفضل بكتير من إهماله خالص
// زي ما كان بيحصل قبل كده، لكن مش مضمون يرجّع بالظبط نفس الرقم الأصلي قبل الشراء).
export async function reverseWeightedAvgCost(tx: Tx, productId: string, removedQty: number, removedUnitCost: number) {
  const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for("update");
  if (!product) return;
  const stockRows = await tx.select().from(schema.stocks).where(eq(schema.stocks.productId, productId));
  const currentQty = stockRows.reduce((s: number, r: any) => s + r.quantity, 0); // شامل كمية الفاتورة اللي هتتمسح، لسه متنقصتش
  const remainingQty = currentQty - removedQty;
  if (remainingQty <= 0) return; // مفيش رصيد متبقي يتحسب عليه متوسط بعد الحذف - سيبها زي ما هي
  const currentCost = Number(product.avgCost);
  const newAvgCost = (currentQty * currentCost - removedQty * removedUnitCost) / remainingQty;
  if (Number.isFinite(newAvgCost) && newAvgCost >= 0) {
    await tx.update(schema.products).set({ avgCost: newAvgCost.toFixed(2), updatedAt: new Date() }).where(eq(schema.products.id, productId));
  }
}

export function checkCreditLimit(customer: { creditLimit: string | number; balance: string | number }, additionalDebt: number) {
  const limit = Number(customer.creditLimit);
  // حد ائتمان سالب معناه "امنع أي دين خالص" (مقصودة كإجراء تشديد، مش "بلا حد") - قبل كده كان
  // النظام بيعامل أي رقم <= 0 (بما فيها السالب) كـ"بدون حد" وهو عكس القصد تمامًا.
  if (limit < 0) {
    if (additionalDebt > 0) {
      return { ok: false, message: `العميل ده حد ائتمانه مقفول (${limit}) يعني ممنوع يزيد دينه خالص - المفروض يدفع الفاتورة كاملة كاش` };
    }
    return { ok: true };
  }
  if (limit === 0) return { ok: true }; // 0 = بدون حد
  const projected = Number(customer.balance) + additionalDebt;
  if (projected > limit) {
    return { ok: false, message: `تجاوز حد الائتمان! الحد الأقصى ${limit} والمديونية بعد العملية هتبقى ${projected.toFixed(2)}` };
  }
  return { ok: true };
}

// نفس فكرة حد الائتمان بالظبط بس لحد أقصى قيمة العهدة اللي ممكن تتدي لموظف - NULL/undefined يعني بدون حد
export function checkConsignmentLimit(consignment: { limitAmount: string | number | null; balance: string | number }, additionalValue: number) {
  const limit = consignment.limitAmount === null || consignment.limitAmount === undefined ? null : Number(consignment.limitAmount);
  if (limit === null) return { ok: true };
  const projected = Number(consignment.balance) + additionalValue;
  if (projected > limit) {
    return { ok: false, message: `تجاوز حد العهدة المسموح للموظف ده! الحد الأقصى ${limit} وقيمة العهدة بعد العملية هتبقى ${projected.toFixed(2)}` };
  }
  return { ok: true };
}
