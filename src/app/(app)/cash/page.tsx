import { listCashDrawers, listCashTransactions } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import CashAdjustForm from "./AdjustForm";

export default async function CashPage() {
  const drawers = await listCashDrawers();
  const txs = await listCashTransactions();
  const total = drawers.reduce((s, d) => s + Number(d.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">الخزائن</h1>
        <div className="bg-gold text-white rounded-xl px-5 py-3 font-bold">
          إجمالي الكاش: {money(total)}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {drawers.map((d) => (
          <div key={d.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="text-sm text-neutral-500">{d.paymentMethodName}</div>
            <div className="text-2xl font-bold">{money(d.balance)}</div>
            <CashAdjustForm paymentMethodId={d.paymentMethodId!} />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-bold mb-3">آخر الحركات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b text-neutral-500">
                <th className="py-2">التاريخ</th>
                <th>النوع</th>
                <th>المبلغ</th>
                <th>الرصيد بعدها</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2">{dateAr(t.createdAt)}</td>
                  <td>{typeLabel(t.type)}</td>
                  <td>{money(t.amount)}</td>
                  <td>{money(t.balanceAfter)}</td>
                  <td className="text-neutral-500">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
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
  };
  return map[t] || t;
}
