// اختبارات الفلوس الأساسية: البيع، الشراء، الخزائن، المرتجعات، المصروفات والإيرادات، رأس المال والمسحوبات،
// والأوردر بعربون من التسجيل لحد التسليم والمرتجع. كل خطوة بتتأكد من رصيد الخزينة والمخزون، وفي الآخر
// من أرقام الربح في ملف Excel (اللي هو نفس أرقام شاشة الأرباح) ومن ROAS في لوحة التحليلات.
// التشغيل: npx tsx --test src/tests/*.test.ts   (شوف الشرح في harness.ts)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, drawerBalance, stockOf, expectOk, sheetValue, todayCairo, type Env } from "./harness";

let env: Env;
before(async () => {
  env = await startEnv();
});
after(async () => {
  await env?.stop();
});

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: متوقع ${b} ولقيت ${a}`);

test("دورة الفلوس الكاملة: رأس مال، شراء، بيع، مصروفات، إيراد، سحب، مرتجع", async () => {
  const { action, sql, ids } = env;

  expectOk(await action("recordCapitalMovement", [{ kind: "CAPITAL_IN", paymentMethodId: ids.cash, amount: 10000, note: "رأس مال افتتاحي" }]));
  near(await drawerBalance(sql, ids.cash), 10000, "بعد إيداع رأس المال");

  const supplier = expectOk(await action("createSupplier", [{ name: "مورد اختبار" }]));
  const product = expectOk(
    await action("createProduct", [{ name: "طلمبة اختبار", requiresSerial: false, wholesalePrice: 130, retailPrice: 150, reorderPoint: 0 }])
  );

  expectOk(
    await action("createPurchase", [
      { supplierId: supplier.id, locationId: ids.shop, items: [{ productId: product.id, quantity: 10, unitCost: 100 }], paymentStatus: "PAID", paidAmount: 1000, paymentMethodId: ids.cash },
    ])
  );
  near(await drawerBalance(sql, ids.cash), 9000, "بعد الشراء");
  assert.equal(await stockOf(sql, product.id), 10, "المخزون بعد الشراء");
  const [p1] = await sql`select avg_cost from products where id = ${product.id}`;
  near(Number(p1.avg_cost), 100, "متوسط التكلفة بعد الشراء");

  const invoice = expectOk(
    await action("createSalesInvoice", [
      { locationId: ids.shop, items: [{ productId: product.id, quantity: 2, unitPrice: 150 }], discount: 0, paymentStatus: "PAID", paidAmount: 300, paymentMethodId: ids.cash, source: "facebook" },
    ])
  );
  near(await drawerBalance(sql, ids.cash), 9300, "بعد البيع");
  assert.equal(await stockOf(sql, product.id), 8, "المخزون بعد البيع");

  const rent = expectOk(await action("createExpenseCategory", ["إيجار"]));
  const ads = expectOk(await action("createExpenseCategory", ["إعلانات"]));
  expectOk(await action("createExpense", [{ categoryId: rent.id, amount: 50, paymentMethodId: ids.cash, note: "إيجار" }]));
  const adExpense = expectOk(await action("createExpense", [{ categoryId: ads.id, amount: 30, paymentMethodId: ids.cash, note: "إعلان", adSourceId: "facebook" }]));
  near(await drawerBalance(sql, ids.cash), 9220, "بعد المصروفات");

  const commission = expectOk(await action("createIncomeCategory", ["عمولة"]));
  expectOk(await action("createIncome", [{ categoryId: commission.id, amount: 20, paymentMethodId: ids.cash, note: "عمولة" }]));
  near(await drawerBalance(sql, ids.cash), 9240, "بعد الإيراد");

  expectOk(await action("recordCapitalMovement", [{ kind: "OWNER_DRAW", paymentMethodId: ids.cash, amount: 100 }]));
  near(await drawerBalance(sql, ids.cash), 9140, "بعد المسحوبات");

  // السحب من خزينة رصيدها صفر لازم يترفض، ورصيدها ميتغيّرش
  const refused = await action("recordCapitalMovement", [{ kind: "OWNER_DRAW", paymentMethodId: ids.vodafone, amount: 500 }]);
  assert.ok(refused && refused.error, "السحب من خزينة فاضية المفروض يترفض");
  near(await drawerBalance(sql, ids.vodafone), 0, "رصيد فودافون بعد السحب المرفوض");

  // مرتجع قطعة واحدة مع رد فلوسها كاش
  const [item] = await sql`select id from sales_invoice_items where invoice_id = ${invoice.id}`;
  const ret = expectOk(
    await action("createReturnRequest", [
      { kind: "SALE_RETURN", invoiceId: invoice.id, items: [{ productId: product.id, quantity: 1, unitPrice: 150, invoiceItemId: item.id }], reason: "اختبار" },
    ])
  );
  expectOk(await action("approveReturn", [ret.id, ids.shop, ids.cash, 150]));
  near(await drawerBalance(sql, ids.cash), 8990, "بعد المرتجع");
  assert.equal(await stockOf(sql, product.id), 9, "المخزون بعد المرتجع");

  // أرقام الربح (نفس شاشة الأرباح): هامش (150-100)×2 ناقص مرتجع قطعة (50) = 50، مصروفات 80، إيراد 20
  const day = todayCairo();
  const wb = await env.xlsx(`/api/export/profit?from=${day}&to=${day}`);
  near(sheetValue(wb, "ملخص الفترة", "إجمالي المبيعات") ?? NaN, 300, "إجمالي المبيعات");
  near(sheetValue(wb, "ملخص الفترة", "إجمالي الربح (هامش البيع بعد المرتجعات)") ?? NaN, 50, "إجمالي الربح");
  near(sheetValue(wb, "ملخص الفترة", "المصروفات") ?? NaN, 80, "المصروفات");
  near(sheetValue(wb, "ملخص الفترة", "إيرادات أخرى") ?? NaN, 20, "الإيرادات الأخرى");
  near(sheetValue(wb, "ملخص الفترة", "صافي الربح") ?? NaN, -10, "صافي الربح");

  // ROAS فيسبوك: إيراد 300 ÷ إعلانات 30 = 10، والربح بعد الإعلانات = هامش 100 − 30 = 70
  const mk = expectOk(await action("getMarketingAnalytics", ["custom", day, day]));
  const fb = mk.byChannel.find((c: any) => c.sourceId === "facebook");
  assert.ok(fb, "قناة فيسبوك لازم تظهر");
  near(fb.adSpend, 30, "مصاريف إعلانات فيسبوك");
  near(fb.roas, 10, "ROAS فيسبوك");
  near(fb.profitAfterAds, 70, "ربح فيسبوك بعد الإعلانات");

  // حذف مصروف بيرجّع فلوسه للخزينة ويختفي من الإعلانات
  expectOk(await action("deleteExpense", [adExpense.id]));
  near(await drawerBalance(sql, ids.cash), 9020, "بعد حذف مصروف الإعلان");
  const mk2 = expectOk(await action("getMarketingAnalytics", ["custom", day, day]));
  near(mk2.byChannel.find((c: any) => c.sourceId === "facebook").adSpend, 0, "إعلانات فيسبوك بعد الحذف");

  // ملف Excel الحسابات فيه كل الشيتات للأدمن
  const fin = await env.xlsx(`/api/export/finance?from=${day}&to=${day}`);
  for (const name of ["المصروفات", "الإيرادات الأخرى", "رأس المال والمسحوبات", "حركات الخزائن"]) {
    assert.ok(fin.getWorksheet(name), `شيت ${name} لازم يكون موجود`);
  }
  const inv = await env.xlsx(`/api/export/inventory`);
  assert.ok(inv.getWorksheet("المخزون"), "شيت المخزون");
  const sales = await env.xlsx(`/api/export/sales?from=${day}&to=${day}`);
  assert.equal(sales.getWorksheet("الفواتير")!.rowCount, 1 + 1 + 1, "فاتورة واحدة + العناوين + الإجمالي");
});

test("أوردر بعربون: العربون يدخل الخزينة، التسليم يحصّل الباقي في خزينة تانية، والمرتجع يرجّع كل جزء لخزينته", async () => {
  const { action, sql, ids } = env;
  const product = expectOk(
    await action("createProduct", [{ name: "فلتر اختبار", requiresSerial: false, wholesalePrice: 120, retailPrice: 150, reorderPoint: 0 }])
  );
  const supplier = expectOk(await action("createSupplier", [{ name: "مورد الأوردرات" }]));
  expectOk(
    await action("createPurchase", [
      { supplierId: supplier.id, locationId: ids.shop, items: [{ productId: product.id, quantity: 5, unitCost: 80 }], paymentStatus: "UNPAID", paidAmount: 0 },
    ])
  );
  const cash0 = await drawerBalance(sql, ids.cash);
  const vf0 = await drawerBalance(sql, ids.vodafone);

  const order = expectOk(
    await action("createOrder", [
      {
        customerName: "عميل أوردر",
        customerPhone: "01011112222",
        address: "شارع الاختبار",
        governorate: "القاهرة",
        items: [{ productId: product.id, quantity: 1, unitPrice: 150 }],
        discount: 0,
        shippingFee: 0,
        source: "website",
        prepaidAmount: 50,
        prepaidPaymentMethodId: ids.cash,
      },
    ])
  );
  near(await drawerBalance(sql, ids.cash), cash0 + 50, "العربون دخل الكاش");

  expectOk(await action("confirmOrder", [order.id]));
  expectOk(await action("assignOrderLocation", [order.id, ids.shop]));
  assert.equal(await stockOf(sql, product.id), 4, "المخزون اتحجز للأوردر");
  expectOk(await action("assignOrderShipping", [order.id, { shippingMethod: "OTHER" }]));

  expectOk(await action("updateOrderStatus", [order.id, "DELIVERED", { collectionStatus: "COLLECTED", collectedAmount: 100, paymentMethodId: ids.vodafone }]));
  near(await drawerBalance(sql, ids.cash), cash0 + 50, "الكاش ميتكررش فيه العربون وقت التسليم");
  near(await drawerBalance(sql, ids.vodafone), vf0 + 100, "الباقي دخل فودافون");
  const [o] = await sql`select invoice_id from orders where id = ${order.id}`;
  const [inv] = await sql`select total, paid_amount from sales_invoices where id = ${o.invoice_id}`;
  near(Number(inv.total), 150, "فاتورة الأوردر = العربون + المحصّل");
  near(Number(inv.paid_amount), 150, "المدفوع في فاتورة الأوردر");

  expectOk(await action("updateOrderStatus", [order.id, "RETURNED", { returnReason: "اختبار" }]));
  near(await drawerBalance(sql, ids.cash), cash0, "العربون رجع من الكاش");
  near(await drawerBalance(sql, ids.vodafone), vf0, "المحصّل رجع من فودافون");
  assert.equal(await stockOf(sql, product.id), 5, "المخزون رجع بعد المرتجع");
});

// غلطة شاشة التعديل نفسها (أكواد ثابتة كابيتال) بيمسكها consistency.test.ts - هنا بنتأكد إن حفظ مصدر
// حقيقي من جدول المصادر شغال من الأول للآخر
test("تعديل مصدر الأوردر لمصدر من جدول المصادر بيتحفظ", async () => {
  const { action, sql, ids } = env;
  const product = expectOk(
    await action("createProduct", [{ name: "منتج مصدر", requiresSerial: false, wholesalePrice: 10, retailPrice: 20, reorderPoint: 0 }])
  );
  const order = expectOk(
    await action("createOrder", [
      { customerName: "عميل مصدر", customerPhone: "01033334444", address: "عنوان", governorate: "الجيزة", items: [{ productId: product.id, quantity: 1, unitPrice: 20 }], source: "website" },
    ])
  );
  const [row] = await sql`select * from orders where id = ${order.id}`;
  const r = await action("updateOrderDetails", [
    order.id,
    {
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      address: row.address,
      governorate: row.governorate,
      source: "facebook",
      items: [{ productId: product.id, quantity: 1, unitPrice: 20 }],
      shippingFee: 0,
      discount: 0,
      prepaidAmount: 0,
    },
  ]);
  expectOk(r);
  const [after] = await sql`select source from orders where id = ${order.id}`;
  assert.equal(after.source, "facebook");
  void ids;
});
