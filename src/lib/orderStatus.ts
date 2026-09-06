// خط سير حالة الأوردر - مشترك بين السيرفر (actions/orders.ts، بيتحقق منه فعليًا) والكلينت
// (StatusControl.tsx، بيفلتر بيه القائمة المنسدلة). قبل كده كانت القائمة المنسدلة بتعرض كل الحالات
// الأربعة دايمًا بغض النظر عن حالة الأوردر الحالية، فكان ممكن تختار حالة "غير منطقية" من الشاشة
// نفسها (زي الرجوع من "تم التسليم" لـ"قيد التجهيز") وتتفاجئ برسالة رفض من السيرفر بعد ما تختارها.
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PREPARING: ["SHIPPED", "RETURNED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PREPARING: "قيد التجهيز",
  SHIPPED: "في الشحن",
  DELIVERED: "تم التسليم",
  RETURNED: "مرتجع",
};
