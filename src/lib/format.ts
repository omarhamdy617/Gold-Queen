export function money(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + " ج.م";
}

export function num(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-US").format(v || 0);
}

export function dateAr(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  // من غير timeZone صريح، Intl.DateTimeFormat بيستخدم توقيت السيرفر (UTC على Vercel) - يعني وقت
  // حركة حصلت الساعة 1 بالليل بتوقيت القاهرة كان بيتعرض بتوقيت متأخر عنه بساعتين (أو 3 وقت التوقيت
  // الصيفي)، فبيبان وكأنها حصلت في وقت مختلف تمامًا عن الوقت الفعلي في مصر
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(date);
}
