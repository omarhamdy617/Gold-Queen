import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession, logAudit } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "من فضلك أدخل اسم المستخدم وكلمة المرور" }, { status: 400 });
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username.trim()));
  if (!user || !user.active) {
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, user.roleId));
  await createSession({
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    roleName: role?.name || "",
  });
  await logAudit({ action: "LOGIN", entityType: "User", entityId: user.id });
  return NextResponse.json({ ok: true });
}
