/**
 * Turns any thrown error into a specific, useful Arabic message for the user.
 *
 * Next.js redacts unhandled server-side exceptions in production into a generic,
 * meaningless "Minified React error #441" (or similar) message with no details.
 * This detects that (and a few other common raw/technical error shapes) and
 * substitutes a clear Arabic explanation instead, while leaving our own
 * deliberate `throw new Error("...")` messages (already in Arabic) untouched.
 */
export function friendlyErrorMessage(e: unknown, fallback = "حصل خطأ أثناء الحفظ"): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const trimmed = raw.trim();

  const isGenericProductionError =
    !trimmed ||
    /minified react error/i.test(trimmed) ||
    /^\d+$/.test(trimmed) ||
    /digest/i.test(trimmed) ||
    /server components render/i.test(trimmed);

  if (isGenericProductionError) {
    return `${fallback}: حصل خطأ غير متوقع من السيرفر (مش مشكلة في البيانات اللي دخلتها). حاول تاني، ولو الخطأ اتكرر بلغ الدعم الفني.`;
  }

  if (/unique|duplicate key|already exists/i.test(trimmed)) {
    return "في تعارض في البيانات (كود أو رقم مكرر موجود بالفعل). حاول تحفظ العملية تاني.";
  }

  if (/fetch failed|network|econnrefused|timeout/i.test(trimmed)) {
    return "في مشكلة في الاتصال بالسيرفر. اتأكد من الإنترنت وحاول تاني.";
  }

  return trimmed;
}
