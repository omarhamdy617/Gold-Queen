import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { buildFullBackup } from "@/lib/backup";

// تنزيل نسخة احتياطية يدوية فورية - يتطلب صلاحية الإعدادات
export async function GET() {
  await requirePermission("settings.manage");
  const backup = await buildFullBackup();
  const json = JSON.stringify(backup, null, 2);
  const filename = `goldqueen-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
