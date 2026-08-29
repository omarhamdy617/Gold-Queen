// سكريبت التهيئة الأولى: يشغّل مرة واحدة بعد ربط قاعدة البيانات الحقيقية
// بينشئ: الأدوار الأساسية + صلاحياتها الافتراضية + حساب الأدمن الأول + طرق دفع ومحل ومخزن افتراضيين
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/permissions";
import { eq } from "drizzle-orm";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL غير موجود");
  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log("بدء التهيئة الأولى لسيستم جولد كوين...");

  // 1) الأدوار
  const roleNames = ["ADMIN", "ACCOUNTANT", "WAREHOUSE_KEEPER", "CASHIER"];
  const roleIds: Record<string, string> = {};
  for (const name of roleNames) {
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
    if (existing) {
      roleIds[name] = existing.id;
    } else {
      const [role] = await db.insert(schema.roles).values({ name, builtIn: true }).returning();
      roleIds[name] = role.id;
    }
  }

  // 2) صلاحيات كل دور (ADMIN مش محتاج صفوف - عنده bypass كامل في الكود)
  for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (roleName === "ADMIN") continue;
    const roleId = roleIds[roleName];
    const existing = await db.select().from(schema.permissions).where(eq(schema.permissions.roleId, roleId));
    const existingKeys = new Set(existing.map((e) => e.key));
    for (const key of perms) {
      if (!existingKeys.has(key)) {
        await db.insert(schema.permissions).values({ roleId, key, allow: true });
      }
    }
  }

  // 3) حساب الأدمن الأول
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "goldqueen123";
  const [existingAdmin] = await db.select().from(schema.users).where(eq(schema.users.username, adminUsername));
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.insert(schema.users).values({
      username: adminUsername,
      fullName: "المدير العام",
      passwordHash,
      roleId: roleIds["ADMIN"],
    });
    console.log(`تم إنشاء حساب الأدمن: ${adminUsername} / ${adminPassword} (غيّر الباسورد فورًا بعد أول دخول)`);
  } else {
    console.log("حساب الأدمن موجود بالفعل - تم التخطي");
  }

  // 4) طرق الدفع الافتراضية + خزائنها
  const defaultMethods = ["كاش", "فودافون كاش", "إنستا باي", "تحويل بنكي"];
  for (const name of defaultMethods) {
    const [existing] = await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.name, name));
    if (!existing) {
      const [pm] = await db.insert(schema.paymentMethods).values({ name }).returning();
      await db.insert(schema.cashDrawers).values({ name: `خزينة ${name}`, paymentMethodId: pm.id });
    }
  }

  // 5) المحل والمخزن الافتراضيين
  const defaultLocations: { name: string; type: "SHOP" | "WAREHOUSE" }[] = [
    { name: "المحل", type: "SHOP" },
    { name: "المخزن", type: "WAREHOUSE" },
  ];
  for (const loc of defaultLocations) {
    const [existing] = await db.select().from(schema.locations).where(eq(schema.locations.name, loc.name));
    if (!existing) await db.insert(schema.locations).values(loc);
  }

  // 6) الإعدادات الافتراضية
  const [existingSettings] = await db.select().from(schema.settings);
  if (!existingSettings) {
    await db.insert(schema.settings).values({ id: 1, companyName: "جولد كوين" });
  }

  console.log("تمت التهيئة الأولى بنجاح ✅");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
