/**
 * Next.js يشيل رسالة أي Error يتعمله throw جوه Server Action ("use server") في وضع
 * production ويستبدلها برسالة عامة غير مفيدة ("Minified React error #441") - ده سلوك
 * موثّق ومقصود منهم لمنع تسريب تفاصيل حساسة، ومش بينفع تتجاوزه من جوه try/catch في الكلينت.
 *
 * الحل الرسمي (موصى بيه من Next.js نفسهم): متعملش throw للأخطاء المتوقعة (زي التحقق من
 * البيانات، أو نقص المخزون، أو تجاوز حد الائتمان) - ارجعها كـ return value عادي بدل كده،
 * عشان الرسالة توصل للكلينت زي ما هي من غير ما Next.js يلمسها.
 *
 * الدالتين دول بيطبقوا الحل ده: toActionError بتحول أي خطأ لـ { error: "..." } جوه
 * الـ action نفسه (قبل ما يعدي حدود السيرفر/كلينت)، و isActionError بتتأكد في الكلينت
 * إن النتيجة اللي رجعت فعلاً خطأ مش نتيجة ناجحة.
 */
// بيدوّر على أقرب كود خطأ PostgreSQL حقيقي (زي 23503 لقيد foreign key، أو 23505 لقيد unique) -
// سواء كان الكود موجود مباشرة على الخطأ اللي اتمسك، أو متلفوف جواه بواسطة Drizzle: نسخة Drizzle
// الحالية بتغلّف أي خطأ فشل فيه استعلام قاعدة البيانات في DrizzleQueryError، اللي رسالتها
// الظاهرة (.message) بتبقى "Failed query: <SQL كامل>\nparams: <القيم>" - مش رسالة الخطأ
// الحقيقية من قاعدة البيانات - والخطأ الأصلي (اللي فيه الكود الحقيقي زي 23503) بيتحط على
// خاصية .cause بدل ما يبقى هو نفسه. أي كود قبل كده بيدوّر على e.message أو e.code مباشرة (زي
// "includes('foreign key')" أو "e.code === '23503'") كان بيفشل يلاقي الخطأ الحقيقي بسبب ده،
// ويسيب الرسالة التقنية الخام (فيها نص الاستعلام SQL كامل) تظهر للمستخدم النهائي كما هي.
function pgErrorCode(e: unknown): string | undefined {
  let cur: any = e;
  for (let i = 0; i < 3 && cur; i++) {
    if (typeof cur.code === "string") return cur.code;
    cur = cur.cause;
  }
  return undefined;
}

function pgErrorMessage(e: unknown): string {
  let cur: any = e;
  let combined = "";
  for (let i = 0; i < 3 && cur; i++) {
    if (typeof cur.message === "string") combined += " " + cur.message;
    cur = cur.cause;
  }
  return combined.toLowerCase();
}

// دالة مساعدة عامة لأي مكان في الكود محتاج يتأكد بنفسه (قبل ما يوصل toActionError) إن خطأ معين
// فعليًا قيد foreign key أو unique - بتدوّر في e نفسه وفي .cause بتاعه (مش في e.message السطحي
// بس، اللي ممكن يبقى مجرد "Failed query: ..." من غير أي تفاصيل حقيقية عن سبب الفشل).
export function pgConstraintCode(e: unknown): string | undefined {
  const code = pgErrorCode(e);
  if (code) return code;
  const msg = pgErrorMessage(e);
  if (msg.includes("foreign key")) return "23503";
  if (msg.includes("unique") || msg.includes("duplicate key")) return "23505";
  return undefined;
}

export function toActionError(e: unknown, fallback = "حصل خطأ غير متوقع"): { error: string } {
  // لو الرسالة الظاهرة على الخطأ هي غلاف Drizzle الفني ("Failed query: ...") - ده معناه استعلام
  // قاعدة بيانات فشل بشكل ما ولسه محدش فسّره لرسالة عربية واضحة قبل ما يوصل هنا. متنعملش عرض
  // الرسالة الخام دي (فيها نص SQL وقيم حقيقية زي IDs) للمستخدم - بنستبدلها برسالة آمنة عامة، مع
  // محاولة نتعرف على السبب الشائع (قيد foreign key أو unique) عشان نديله رسالة أدق لو أمكن.
  if (e instanceof Error && e.message.startsWith("Failed query:")) {
    const code = pgConstraintCode(e);
    if (code === "23503") return { error: "في بيانات مرتبطة بالسجل ده بتمنع تنفيذ العملية دي - لو فيه خيار \"إيقاف/تعطيل\" بدل الحذف استخدمه." };
    if (code === "23505") return { error: "القيمة دي مستخدمة بالفعل - اختار قيمة تانية." };
    return { error: fallback };
  }
  const msg = e instanceof Error && e.message ? e.message : fallback;
  return { error: msg };
}

export function isActionError(x: unknown): x is { error: string } {
  return !!x && typeof x === "object" && typeof (x as any).error === "string";
}
