"use server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";

export async function listAuditLogs(limit = 300) {
  await requirePermission("audit.view");
  const rows = await db
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      entityType: schema.auditLogs.entityType,
      entityId: schema.auditLogs.entityId,
      createdAt: schema.auditLogs.createdAt,
      userName: schema.users.fullName,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit);
  return rows;
}
