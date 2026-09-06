// خط سير حالة الأوردر - مشترك بين السيرفر (actions/orders.ts، بيتحقق منه فعليًا) والكلينت
// (StatusControl.tsx، بيفلتر بيه القائمة المنسدلة). خط السير دلوقتي بيعكس مسار أوردر حقيقي:
// في الانتظار (لسه ما اتأكدش) → تم التأكيد (اتكلمنا مع العميل) → قيد التجهيز (بيتجهز من المحل/المخزن)
// → في الشحن → تم التسليم، مع إمكانية "إلغاء" في أي وقت قبل الشحن (حالة منفصلة عن "مرتجع" اللي
// بيحصل بعد ما الأوردر يتشحن أو يتسلّم فعليًا - قبل كده مكانش فيه فرق بين الاتنين).
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "في الانتظار",
  CONFIRMED: "تم التأكيد",
  PREPARING: "قيد التجهيز",
  SHIPPED: "في الشحن",
  DELIVERED: "تم التسليم",
  RETURNED: "مرتجع",
  CANCELLED: "ملغي",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-sky-100 text-sky-800",
  PREPARING: "bg-neutral-200",
  SHIPPED: "bg-blue-200",
  DELIVERED: "bg-green-200",
  RETURNED: "bg-red-200",
  CANCELLED: "bg-neutral-300 text-neutral-600",
};

export const ORDER_ATTEMPT_RESULT_LABELS: Record<string, string> = {
  NO_ANSWER: "محدش رد",
  WRONG_NUMBER: "رقم غلط",
  POSTPONED: "أجّل الرد",
  OTHER: "سبب تاني",
};
