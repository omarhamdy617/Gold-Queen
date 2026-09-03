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
export function toActionError(e: unknown, fallback = "حصل خطأ غير متوقع"): { error: string } {
  const msg = e instanceof Error && e.message ? e.message : fallback;
  return { error: msg };
}

export function isActionError(x: unknown): x is { error: string } {
  return !!x && typeof x === "object" && typeof (x as any).error === "string";
}
