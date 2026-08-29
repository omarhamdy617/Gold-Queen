// ==========================================================================
// جولد كوين - Gold Queen ERP - Drizzle schema (PostgreSQL)
// ==========================================================================
import {
  pgTable,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const cuid = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

// --------------------------------------------------------------------------
// ENUMS
// --------------------------------------------------------------------------
export const locationTypeEnum = pgEnum("location_type", ["SHOP", "WAREHOUSE", "OTHER"]);
export const cashTxTypeEnum = pgEnum("cash_tx_type", [
  "SALE_IN",
  "PURCHASE_OUT",
  "EXPENSE_OUT",
  "COLLECTION_IN",
  "PAYMENT_OUT",
  "RETURN_OUT",
  "RETURN_IN",
  "ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
]);
export const serialStatusEnum = pgEnum("serial_status", ["IN_STOCK", "SOLD", "RETURNED"]);
export const purchasePaymentStatusEnum = pgEnum("purchase_payment_status", ["PAID", "UNPAID", "PARTIAL"]);
export const customerTypeEnum = pgEnum("customer_type", ["RETAIL", "TRADER"]);
export const invoicePaymentStatusEnum = pgEnum("invoice_payment_status", ["PAID", "UNPAID", "PARTIAL"]);
export const orderSourceEnum = pgEnum("order_source", ["WEBSITE", "PHONE", "WHATSAPP", "FACEBOOK", "OTHER"]);
export const shippingMethodEnum = pgEnum("shipping_method", ["INTERNAL_COURIER", "EXTERNAL_COMPANY", "OTHER"]);
export const orderStatusEnum = pgEnum("order_status", ["PREPARING", "SHIPPED", "DELIVERED", "RETURNED"]);
export const returnStatusEnum = pgEnum("return_status", ["PENDING", "APPROVED", "REJECTED"]);
export const returnKindEnum = pgEnum("return_kind", ["SALE_RETURN", "PURCHASE_RETURN"]);

// --------------------------------------------------------------------------
// USERS / ROLES / PERMISSIONS
// --------------------------------------------------------------------------
export const roles = pgTable("roles", {
  id: cuid(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  builtIn: boolean("built_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const permissions = pgTable(
  "permissions",
  {
    id: cuid(),
    key: varchar("key", { length: 150 }).notNull(),
    roleId: text("role_id").references(() => roles.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    allow: boolean("allow").notNull().default(true),
  },
  (t) => [index("perm_key_idx").on(t.key)]
);

export const users = pgTable("users", {
  id: cuid(),
  username: varchar("username", { length: 100 }).notNull().unique(), // اسم الموظف بس
  fullName: varchar("full_name", { length: 150 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// CASH / PAYMENT METHODS
// --------------------------------------------------------------------------
export const paymentMethods = pgTable("payment_methods", {
  id: cuid(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashDrawers = pgTable("cash_drawers", {
  id: cuid(),
  name: varchar("name", { length: 150 }).notNull(),
  paymentMethodId: text("payment_method_id")
    .notNull()
    .unique()
    .references(() => paymentMethods.id),
  balance: money("balance").notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cashTransactions = pgTable(
  "cash_transactions",
  {
    id: cuid(),
    drawerId: text("drawer_id")
      .notNull()
      .references(() => cashDrawers.id),
    type: cashTxTypeEnum("type").notNull(),
    amount: money("amount").notNull(),
    balanceAfter: money("balance_after").notNull(),
    note: text("note"),
    refType: varchar("ref_type", { length: 50 }),
    refId: text("ref_id"),
    createdById: text("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("cashtx_drawer_idx").on(t.drawerId)]
);

// --------------------------------------------------------------------------
// LOCATIONS
// --------------------------------------------------------------------------
export const locations = pgTable("locations", {
  id: cuid(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  type: locationTypeEnum("type").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// CATEGORIES / PRODUCTS
// --------------------------------------------------------------------------
export const categories = pgTable("categories", {
  id: cuid(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  requiresSerial: boolean("requires_serial").notNull().default(false),
  defaultWarrantyMonths: integer("default_warranty_months"),
});

export const products = pgTable("products", {
  id: cuid(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  barcode: varchar("barcode", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 250 }).notNull(),
  categoryId: text("category_id").references(() => categories.id),
  requiresSerial: boolean("requires_serial").notNull().default(false),
  warrantyMonths: integer("warranty_months"),
  unit: varchar("unit", { length: 50 }).notNull().default("قطعة"),
  wholesalePrice: money("wholesale_price").notNull().default("0"),
  retailPrice: money("retail_price").notNull().default("0"),
  avgCost: money("avg_cost").notNull().default("0"),
  reorderPoint: integer("reorder_point").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const stocks = pgTable(
  "stocks",
  {
    id: cuid(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_product_location_uq").on(t.productId, t.locationId)]
);

export const productSerials = pgTable(
  "product_serials",
  {
    id: cuid(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    serialNumber: varchar("serial_number", { length: 150 }).notNull().unique(),
    status: serialStatusEnum("status").notNull().default("IN_STOCK"),
    purchaseItemId: text("purchase_item_id"),
    locationId: text("location_id").references(() => locations.id),
    soldAt: timestamp("sold_at"),
    warrantyStart: timestamp("warranty_start"),
    warrantyMonths: integer("warranty_months"),
    invoiceItemId: text("invoice_item_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("serial_product_idx").on(t.productId)]
);

// --------------------------------------------------------------------------
// SUPPLIERS / PURCHASES
// --------------------------------------------------------------------------
export const suppliers = pgTable("suppliers", {
  id: cuid(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  notes: text("notes"),
  balance: money("balance").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const supplierProductPrices = pgTable(
  "supplier_product_prices",
  {
    id: cuid(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    price: money("price").notNull(),
    purchaseId: text("purchase_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sup_price_product_idx").on(t.productId)]
);

export const purchases = pgTable("purchases", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id),
  totalAmount: money("total_amount").notNull(),
  paidAmount: money("paid_amount").notNull().default("0"),
  paymentStatus: purchasePaymentStatusEnum("payment_status").notNull().default("UNPAID"),
  paymentMethodId: text("payment_method_id").references(() => paymentMethods.id),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: cuid(),
  purchaseId: text("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
});

// --------------------------------------------------------------------------
// STOCK TRANSFERS
// --------------------------------------------------------------------------
export const stockTransfers = pgTable("stock_transfers", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  fromLocationId: text("from_location_id")
    .notNull()
    .references(() => locations.id),
  toLocationId: text("to_location_id")
    .notNull()
    .references(() => locations.id),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: cuid(),
  transferId: text("transfer_id")
    .notNull()
    .references(() => stockTransfers.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
});

// --------------------------------------------------------------------------
// CUSTOMERS / TRADERS / CONSIGNMENT
// --------------------------------------------------------------------------
export const customers = pgTable("customers", {
  id: cuid(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }).unique(),
  type: customerTypeEnum("type").notNull().default("RETAIL"),
  creditLimit: money("credit_limit").notNull().default("0"),
  balance: money("balance").notNull().default("0"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const collections = pgTable("collections", {
  id: cuid(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  amount: money("amount").notNull(),
  paymentMethodId: text("payment_method_id")
    .notNull()
    .references(() => paymentMethods.id),
  note: text("note"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const consignments = pgTable("consignments", {
  id: cuid(),
  holderId: text("holder_id")
    .notNull()
    .references(() => users.id),
  balance: money("balance").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const consignmentItems = pgTable("consignment_items", {
  id: cuid(),
  consignmentId: text("consignment_id")
    .notNull()
    .references(() => consignments.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  returnedQty: integer("returned_qty").notNull().default(0),
  settledAmount: money("settled_amount").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// SALES INVOICES
// --------------------------------------------------------------------------
export const salesInvoices = pgTable("sales_invoices", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  customerId: text("customer_id").references(() => customers.id),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id),
  subtotal: money("subtotal").notNull(),
  discount: money("discount").notNull().default("0"),
  total: money("total").notNull(),
  paidAmount: money("paid_amount").notNull().default("0"),
  paymentStatus: invoicePaymentStatusEnum("payment_status").notNull().default("PAID"),
  paymentMethodId: text("payment_method_id").references(() => paymentMethods.id),
  source: orderSourceEnum("source").notNull().default("OTHER"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesInvoiceItems = pgTable("sales_invoice_items", {
  id: cuid(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => salesInvoices.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  unitCost: money("unit_cost").notNull(),
});

// --------------------------------------------------------------------------
// QUOTES
// --------------------------------------------------------------------------
export const quotes = pgTable("quotes", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  customerId: text("customer_id").references(() => customers.id),
  customerName: varchar("customer_name", { length: 200 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  subtotal: money("subtotal").notNull(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }),
  discountAmt: money("discount_amt"),
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
  total: money("total").notNull(),
  isTemplate: boolean("is_template").notNull().default(false),
  templateName: varchar("template_name", { length: 150 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quoteItems = pgTable("quote_items", {
  id: cuid(),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
});

// --------------------------------------------------------------------------
// ORDERS / SHIPPING
// --------------------------------------------------------------------------
export const orders = pgTable("orders", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  invoiceId: text("invoice_id").unique().references(() => salesInvoices.id),
  customerId: text("customer_id").references(() => customers.id),
  source: orderSourceEnum("source").notNull().default("OTHER"),
  shippingMethod: shippingMethodEnum("shipping_method").notNull().default("OTHER"),
  shippingCompanyName: varchar("shipping_company_name", { length: 150 }),
  courierName: varchar("courier_name", { length: 150 }),
  status: orderStatusEnum("status").notNull().default("PREPARING"),
  prepaid: boolean("prepaid").notNull().default(false),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: cuid(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
});

// --------------------------------------------------------------------------
// RETURNS
// --------------------------------------------------------------------------
export const returnRequests = pgTable("return_requests", {
  id: cuid(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  kind: returnKindEnum("kind").notNull(),
  invoiceId: text("invoice_id").references(() => salesInvoices.id),
  customerId: text("customer_id").references(() => customers.id),
  totalAmount: money("total_amount").notNull(),
  status: returnStatusEnum("status").notNull().default("PENDING"),
  reason: text("reason"),
  requestedById: text("requested_by_id").references(() => users.id),
  approvedById: text("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const returnItems = pgTable("return_items", {
  id: cuid(),
  returnRequestId: text("return_request_id")
    .notNull()
    .references(() => returnRequests.id, { onDelete: "cascade" }),
  invoiceItemId: text("invoice_item_id").references(() => salesInvoiceItems.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
});

// --------------------------------------------------------------------------
// EXPENSES
// --------------------------------------------------------------------------
export const expenseCategories = pgTable("expense_categories", {
  id: cuid(),
  name: varchar("name", { length: 150 }).notNull().unique(),
});

export const expenses = pgTable("expenses", {
  id: cuid(),
  categoryId: text("category_id")
    .notNull()
    .references(() => expenseCategories.id),
  amount: money("amount").notNull(),
  paymentMethodId: text("payment_method_id")
    .notNull()
    .references(() => paymentMethods.id),
  note: text("note"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// AUDIT LOG
// --------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: cuid(),
    userId: text("user_id").references(() => users.id),
    action: varchar("action", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: varchar("ip", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_user_idx").on(t.userId),
  ]
);

// --------------------------------------------------------------------------
// SETTINGS (single row)
// --------------------------------------------------------------------------
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: varchar("company_name", { length: 150 }).notNull().default("جولد كوين"),
  currency: varchar("currency", { length: 10 }).notNull().default("EGP"),
  defaultVatRate: numeric("default_vat_rate", { precision: 5, scale: 2 }).notNull().default("14"),
  largeInvoiceAlert: money("large_invoice_alert").notNull().default("10000"),
  adminWhatsapp: varchar("admin_whatsapp", { length: 50 }),
  backupFrequency: varchar("backup_frequency", { length: 20 }).notNull().default("daily"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// RELATIONS (for query API convenience)
// --------------------------------------------------------------------------
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  stocks: many(stocks),
}));

export const salesInvoicesRelations = relations(salesInvoices, ({ one, many }) => ({
  customer: one(customers, { fields: [salesInvoices.customerId], references: [customers.id] }),
  location: one(locations, { fields: [salesInvoices.locationId], references: [locations.id] }),
  items: many(salesInvoiceItems),
}));

export const salesInvoiceItemsRelations = relations(salesInvoiceItems, ({ one }) => ({
  invoice: one(salesInvoices, { fields: [salesInvoiceItems.invoiceId], references: [salesInvoices.id] }),
  product: one(products, { fields: [salesInvoiceItems.productId], references: [products.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  location: one(locations, { fields: [purchases.locationId], references: [locations.id] }),
  items: many(purchaseItems),
}));
