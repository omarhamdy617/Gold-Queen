// نسخة "آمنة للكلينت" من تعريف مفاتيح الفترة الزمنية المشتركة - من غير "server-only" ومن غير أي
// منطق حساب توقيت القاهرة (ده موجود في lib/period.ts بس، وده اللي محتاج يفضل سيرفر-أونلي). الملف
// ده بيتستورد من كومبوننتات كلاينت (زي PeriodContext) عشان تعرف أسماء الأزرار وترتيبها بس.
export type PeriodKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "إمبارح" },
  { key: "this_week", label: "الأسبوع ده" },
  { key: "last_week", label: "الأسبوع اللي فات" },
  { key: "this_month", label: "الشهر ده" },
  { key: "last_month", label: "الشهر اللي فات" },
  { key: "this_quarter", label: "الربع ده" },
  { key: "this_year", label: "السنة دي" },
  { key: "custom", label: "فترة مخصصة" },
];
