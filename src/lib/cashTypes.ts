// أسماء أنواع حركات الخزينة بالعربي - مكان واحد بس في السيستم كله. قبل كده الخريطة دي كانت متكررة
// في أكتر من ملف (صفحة الخزائن وتفاصيل الحركة)، وكل نوع جديد كان لازم يتضاف في كل نسخة لوحده، ونسيان
// نسخة منهم حصل فعلًا (الدفعة 23). أي نوع جديد في cashTxTypeEnum يتضاف هنا بس.
export const CASH_TX_LABELS: Record<string, string> = {
  SALE_IN: "تحصيل بيع",
  PURCHASE_OUT: "دفع مشتريات",
  EXPENSE_OUT: "مصروف",
  COLLECTION_IN: "تحصيل من تاجر",
  PAYMENT_OUT: "دفع لمورد",
  RETURN_OUT: "استرداد للعميل",
  RETURN_IN: "استرداد من مورد",
  ADJUSTMENT: "تسوية يدوية",
  TRANSFER_IN: "تحويل داخل",
  TRANSFER_OUT: "تحويل خارج",
  LOAN_OUT: "سلفة/سداد (خارج)",
  LOAN_IN: "سلفة/تحصيل (داخل)",
  ORDER_DEPOSIT_IN: "عربون أوردر",
  OTHER_INCOME_IN: "إيراد آخر",
  CAPITAL_IN: "إيداع رأس مال",
  OWNER_DRAW_OUT: "مسحوبات شخصية",
};

export function cashTxLabel(type: string) {
  return CASH_TX_LABELS[type] || type;
}
