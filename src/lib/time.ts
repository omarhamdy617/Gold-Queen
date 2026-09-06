import "server-only";

// السيرفر (Vercel) بيشتغل بتوقيت UTC، لكن "اليوم/الشهر الحالي" في الداشبورد والتنبيهات لازم يتحسبوا
// بتوقيت القاهرة، وإلا بيع حصل الساعة 12:30 بالليل بتوقيت مصر (لسه "النهارده" بالنسبة للمحل) ممكن
// يتحسب "إمبارح"، وقريب من نهاية الشهر مبيعة يوم 1 ممكن تتحسب على الشهر اللي فات.
const CAIRO_TZ = "Africa/Cairo";

function cairoOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour; // بعض بيئات Intl بترجع "24" بدل "00"
  const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second));
  return Math.round((asUTC - date.getTime()) / 60000);
}

// بداية اليوم بتوقيت القاهرة - بيرجع Date UTC حقيقي بيمثل نفس اللحظة (صالح للمقارنة في قاعدة البيانات)
export function cairoStartOfDay(d = new Date()): Date {
  const offsetMin = cairoOffsetMinutes(d);
  const local = new Date(d.getTime() + offsetMin * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMin * 60000);
}

// بداية الشهر بتوقيت القاهرة
export function cairoStartOfMonth(d = new Date()): Date {
  const offsetMin = cairoOffsetMinutes(d);
  const local = new Date(d.getTime() + offsetMin * 60000);
  const localStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0));
  return new Date(localStart.getTime() - offsetMin * 60000);
}
