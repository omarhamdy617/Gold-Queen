import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ملحوظة: الملف ده كان اسمه src/proxy.ts قبل كده - وده اسم غلط تقنيًا، فـ Next.js كان بيتجاهله
// تمامًا ومش بيشغله خالص كـ middleware. لازم يكون اسمه بالظبط middleware.ts في src/ عشان يشتغل.
// من غير الملف ده شغال، مفيش حماية موحّدة على مستوى كل الصفحات - كل صفحة وعملية بتتأكد من
// الجلسة بنفسها بس (وده اللي خلى 3 عمليات في المنتجات ناسية تتأكد قبل كده).

const COOKIE_NAME = "gc_session";

function secretKey(): Uint8Array | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length < 16) return null; // مفيش قيمة آمنة متسجلة - نتعامل مع أي جلسة كإنها مش صحيحة
  return new TextEncoder().encode(secret);
}

// /api/cron/backup ليها حماية خاصة بيها (بيرمز CRON_SECRET) جوه الراوت نفسه - لو منعناها هنا هتترفض
// بـ 401 قبل ما توصل حتى لحماية الـ CRON_SECRET، وده كان معناه إن النسخة الاحتياطية اليومية التلقائية
// (اللي بيستدعيها Vercel Cron، مش متصفح فيه جلسة مستخدم) كانت فعليًا متوقفة تمامًا من غير ما حد يلاحظ.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/orders/webhook", "/api/cron/backup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public")) {
    return NextResponse.next();
  }

  const key = secretKey();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !key) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  try {
    await jwtVerify(token, key);
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
