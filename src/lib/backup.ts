import "server-only";
import { db, schema } from "@/db";

// نسخة احتياطية كاملة لكل الجداول كـ JSON - تُستخدم للتنزيل اليدوي والنسخ الدورية التلقائية
//
// كانت القائمة دي بتُكتب يدوي وناقصة 6 جداول كاملة أضيفوا للنظام بعد ما القائمة اتكتبت (مدفوعات
// الموردين، حسابات وحركات السلف، المناديب الداخليين، شركات الشحن، وقفل محاولات الدخول الفاشلة) -
// يعني أي نسخة احتياطية (يدوية أو تلقائية) كانت بتضيع البيانات دي بالكامل من غير أي تحذير أو خطأ،
// ولو حصل استرجاع من نسخة زي دي، الجداول دي كانت هترجع فاضية تمامًا.
export async function buildFullBackup() {
  const tables = {
    roles: schema.roles,
    permissions: schema.permissions,
    users: schema.users,
    loginLockouts: schema.loginLockouts,
    paymentMethods: schema.paymentMethods,
    cashDrawers: schema.cashDrawers,
    cashTransactions: schema.cashTransactions,
    locations: schema.locations,
    categories: schema.categories,
    products: schema.products,
    stocks: schema.stocks,
    productSerials: schema.productSerials,
    suppliers: schema.suppliers,
    supplierProductPrices: schema.supplierProductPrices,
    supplierPayments: schema.supplierPayments,
    purchases: schema.purchases,
    purchaseItems: schema.purchaseItems,
    stockTransfers: schema.stockTransfers,
    stockTransferItems: schema.stockTransferItems,
    customers: schema.customers,
    collections: schema.collections,
    consignments: schema.consignments,
    consignmentItems: schema.consignmentItems,
    salesInvoices: schema.salesInvoices,
    salesInvoiceItems: schema.salesInvoiceItems,
    quotes: schema.quotes,
    quoteItems: schema.quoteItems,
    couriers: schema.couriers,
    shippingCompanies: schema.shippingCompanies,
    orders: schema.orders,
    orderItems: schema.orderItems,
    returnRequests: schema.returnRequests,
    returnItems: schema.returnItems,
    expenseCategories: schema.expenseCategories,
    expenses: schema.expenses,
    loanAccounts: schema.loanAccounts,
    loanTransactions: schema.loanTransactions,
    auditLogs: schema.auditLogs,
    settings: schema.settings,
  };

  const result: Record<string, any[]> = {};
  for (const [name, table] of Object.entries(tables)) {
    result[name] = await db.select().from(table as any);
  }
  return { generatedAt: new Date().toISOString(), data: result };
}
