// بناء كشف حساب (جدول حركات) بحيث يتطابق دايمًا مع الرصيد الحالي المسجل على العميل/المورد
// كل فاتورة بيع بتتسجل كحركة "مدين" بإجمالي قيمتها، وأي مبلغ اتدفع وقت البيع نفسه بيتسجل كحركة
// "دائن" منفصلة بنفس تاريخ الفاتورة - عشان لو حد فتح كشف الحساب يلاقي مجموع مدين - مجموع دائن = الرصيد
// المعروض فوق بالظبط، وميحصلش لبس إن الفاتورة اتحسبت مديونية كاملة رغم إنها اتدفعت وقت البيع.

export type StatementRow = {
  date: Date | string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
  balance?: number;
};

export function buildCustomerTimeline(
  currentBalance: number,
  invoices: { createdAt: Date | string; code: string; total: string | number; paidAmount: string | number }[],
  payments: { createdAt: Date | string; amount: string | number }[]
) {
  const rows: StatementRow[] = [];
  for (const i of invoices) {
    rows.push({ date: i.createdAt, type: "فاتورة بيع", ref: i.code, debit: Number(i.total), credit: 0 });
    const paid = Number(i.paidAmount);
    if (paid > 0) rows.push({ date: i.createdAt, type: "دفع مع الفاتورة", ref: i.code, debit: 0, credit: paid });
  }
  for (const p of payments) {
    rows.push({ date: p.createdAt, type: "تحصيل", ref: "-", debit: 0, credit: Number(p.amount) });
  }
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // الرصيد الافتتاحي = الرصيد الحالي مطروح منه صافي حركة الفترة المعروضة (مدين - دائن)
  const netMovement = rows.reduce((s, r) => s + r.debit - r.credit, 0);
  const opening = currentBalance - netMovement;
  let running = opening;
  const withRunning = rows.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });
  return { rows: withRunning, opening };
}

export function buildSupplierTimeline(
  currentBalance: number,
  purchases: { createdAt: Date | string; code: string; total: string | number; paidAmount: string | number }[],
  payments: { createdAt: Date | string; amount: string | number }[]
) {
  const rows: StatementRow[] = [];
  for (const p of purchases) {
    // بالنسبة للمورد: فاتورة الشراء "دائن" (احنا مديونين له) والدفع "مدين" (بنقلل مديونيتنا)
    rows.push({ date: p.createdAt, type: "فاتورة شراء", ref: p.code, debit: 0, credit: Number(p.total) });
    const paid = Number(p.paidAmount);
    if (paid > 0) rows.push({ date: p.createdAt, type: "دفع مع الفاتورة", ref: p.code, debit: paid, credit: 0 });
  }
  for (const pay of payments) {
    rows.push({ date: pay.createdAt, type: "سداد للمورد", ref: "-", debit: Number(pay.amount), credit: 0 });
  }
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const netMovement = rows.reduce((s, r) => s + r.credit - r.debit, 0);
  const opening = currentBalance - netMovement;
  let running = opening;
  const withRunning = rows.map((r) => {
    running += r.credit - r.debit;
    return { ...r, balance: running };
  });
  return { rows: withRunning, opening };
}
