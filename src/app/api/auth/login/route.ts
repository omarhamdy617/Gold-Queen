import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSession,
  logAudit,
  checkLoginLock,
  registerFailedLogin,
  clearFailedLogins,
  checkUnknownUsernameLock,
  registerUnknownUsernameFailedLogin,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "من فضلك أدخل اسم المستخدم وكلمة المرور" }, { status: 400 });
  }
  const usernameKey = username.trim().toLowerCase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username.trim()));

  // لو اسم المستخدم مش موجود (أو موقوف)، بنطبّق نفس منطق القفل المؤقت بالظبط على اسم المستخدم نفسه
  // (بدل حساب مستخدم حقيقي) - عشان محاولات الدخول الفاشلة المتكررة ترجع بنفس الشكل والرسالة تمامًا
  // سواء الاسم موجود فعليًا في النظام أو لأ. من غير كده، ظهور رسالة "الحساب اتقفل" لاسم معيّن بعد
  // كذا محاولة، مقابل رسالة "بيانات دخول غير صحيحة" العادية لاسم تاني، كان بيسرب إن الاسم الأول
  // مسجل فعليًا في النظام (username enumeration) حتى لو الرسالة النهائية لصاحب الحساب الحقيقي واحدة.
  if (!user || !user.active) {
    const lock = await checkUnknownUsernameLock(usernameKey);
    if (lock.locked) {
      return NextResponse.json({ error: `الحساب ده اتقفل مؤقتًا بعد محاولات دخول فاشلة كتير - حاول تاني بعد ${lock.minutesLeft} دقيقة` }, { status: 429 });
    }
    await registerUnknownUsernameFailedLogin(usernameKey);
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  // حماية من تخمين كلمة السر بلا حدود: بعد 5 محاولات فاشلة متتالية، الحساب بيتقفل مؤقتًا 15 دقيقة
  const lock = await checkLoginLock(user.id);
  if (lock.locked) {
    return NextResponse.json({ error: `الحساب ده اتقفل مؤقتًا بعد محاولات دخول فاشلة كتير - حاول تاني بعد ${lock.minutesLeft} دقيقة` }, { status: 429 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await registerFailedLogin(user.id);
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }
  await clearFailedLogins(user.id);

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
