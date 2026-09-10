import "server-only";
import { cairoStartOfDay, cairoStartOfMonth, cairoStartOfWeek, cairoStartOfQuarter, cairoStartOfYear } from "@/lib/time";
// تعريف المفاتيح وتسمياتها منقول لملف منفصل من غير "server-only" (lib/periodShared.ts) عشان
// كومبوننتات الكلاينت (PeriodContext وأزرار اختيار الفترة) تقدر تستورده من غير ما تجيب معاه أي
// كود سيرفر - لو استوردوا النوع من هنا مباشرة، أي استيراد بالغلط (من غير "import type") هيكسر
// البيلد كله لأن "server-only" بترمي استثناء وقت التحميل لو اتحملت جوه كود كلاينت.
import type { PeriodKey } from "@/lib/periodShared";
export type { PeriodKey };

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  // فترة المقارنة (نفس الطول، اللي قبلها مباشرة) - عشان أي رقم يتعرض دايمًا مع "زيادة/نقصان عن ايه"
  // بدل ما يفضل رقم مجرد من غير سياق (فلسفة "Metric → Comparison → Trend" اللي طلبها صاحب النظام)
  prevFrom: Date;
  prevTo: Date;
  label: string;
  prevLabel: string;
};

// بيحسب حدود الفترة المطلوبة + فترة المقارنة المكافئة لها (نفس الطول، قبلها على طول) - كله بتوقيت
// القاهرة (نفس دوال cairoStartOf* المستخدمة في كل حساب تاريخ/شهر تاني في السيستم) عشان "اليوم/
// الأسبوع/الشهر ده" يبقى متطابق مع تعريفه في أي شاشة تانية في النظام.
export function resolvePeriod(key: PeriodKey, customFrom?: string, customTo?: string): ResolvedPeriod {
  const now = new Date();

  switch (key) {
    case "today": {
      const from = cairoStartOfDay(now);
      const prevFrom = cairoStartOfDay(new Date(from.getTime() - 1));
      return { from, to: now, prevFrom, prevTo: new Date(from.getTime() - 1), label: "اليوم", prevLabel: "إمبارح" };
    }
    case "yesterday": {
      const todayStart = cairoStartOfDay(now);
      const from = cairoStartOfDay(new Date(todayStart.getTime() - 1));
      const to = new Date(todayStart.getTime() - 1);
      const prevFrom = cairoStartOfDay(new Date(from.getTime() - 1));
      return { from, to, prevFrom, prevTo: new Date(from.getTime() - 1), label: "إمبارح", prevLabel: "قبل إمبارح" };
    }
    case "this_week": {
      const from = cairoStartOfWeek(now);
      const prevFrom = cairoStartOfWeek(new Date(from.getTime() - 1));
      return { from, to: now, prevFrom, prevTo: new Date(from.getTime() - 1), label: "الأسبوع ده", prevLabel: "الأسبوع اللي فات" };
    }
    case "last_week": {
      const thisWeekStart = cairoStartOfWeek(now);
      const from = cairoStartOfWeek(new Date(thisWeekStart.getTime() - 1));
      const to = new Date(thisWeekStart.getTime() - 1);
      const prevFrom = cairoStartOfWeek(new Date(from.getTime() - 1));
      return { from, to, prevFrom, prevTo: new Date(from.getTime() - 1), label: "الأسبوع اللي فات", prevLabel: "قبل ما فات" };
    }
    case "last_month": {
      const thisMonthStart = cairoStartOfMonth(now);
      const from = cairoStartOfMonth(new Date(thisMonthStart.getTime() - 1));
      const to = new Date(thisMonthStart.getTime() - 1);
      const prevFrom = cairoStartOfMonth(new Date(from.getTime() - 1));
      return { from, to, prevFrom, prevTo: new Date(from.getTime() - 1), label: "الشهر اللي فات", prevLabel: "قبل ما فات" };
    }
    case "this_quarter": {
      const from = cairoStartOfQuarter(now);
      const prevFrom = cairoStartOfQuarter(new Date(from.getTime() - 1));
      return { from, to: now, prevFrom, prevTo: new Date(from.getTime() - 1), label: "الربع ده", prevLabel: "الربع اللي فات" };
    }
    case "this_year": {
      const from = cairoStartOfYear(now);
      const prevFrom = cairoStartOfYear(new Date(from.getTime() - 1));
      return { from, to: now, prevFrom, prevTo: new Date(from.getTime() - 1), label: "السنة دي", prevLabel: "السنة اللي فاتت" };
    }
    case "custom": {
      const from = customFrom ? new Date(customFrom) : cairoStartOfMonth(now);
      const to = customTo ? new Date(customTo + "T23:59:59") : now;
      const lengthMs = Math.max(to.getTime() - from.getTime(), 1);
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - lengthMs);
      return { from, to, prevFrom, prevTo, label: "فترة مخصصة", prevLabel: "نفس المدة قبلها" };
    }
    case "this_month":
    default: {
      const from = cairoStartOfMonth(now);
      const prevFrom = cairoStartOfMonth(new Date(from.getTime() - 1));
      return { from, to: now, prevFrom, prevTo: new Date(from.getTime() - 1), label: "الشهر ده", prevLabel: "الشهر اللي فات" };
    }
  }
}

export { PERIOD_OPTIONS } from "@/lib/periodShared";
