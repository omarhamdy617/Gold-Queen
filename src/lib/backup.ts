import "server-only";
import { db, schema } from "@/db";

// نسخة احتياطية كاملة لكل الجداول كـ JSON - تُستخدم للتنزيل اليدوي والنسخ الدورية التلقائية
export async function buildFullBackup() {
  const tables = {
    roles: schema.roles,
    permissions: schema.permissions,
    users: schema.users,
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
    orders: schema.orders,
    orderItems: schema.orderItems,
    returnRequests: schema.returnRequests,
    returnItems: schema.returnItems,
    expenseCategories: schema.expenseCategories,
    expenses: schema.expenses,
    auditLogs: schema.auditLogs,
    settings: schema.settings,
  };

  const result: Record<string, any[]> = {};
  for (const [name, table] of Object.entries(tables)) {
    result[name] = await db.select().from(table as any);
  }
  return { generatedAt: new Date().toISOString(), data: result };
}
