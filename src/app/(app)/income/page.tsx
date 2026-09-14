import { listIncome, listIncomeCategories } from "@/actions/income";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import IncomeForm from "./IncomeForm";
import IncomeRowActions from "./IncomeRowActions";

export default async function IncomePage() {
  const [income, categories, paymentMethods] = await Promise.all([listIncome(), listIncomeCategories(), listPaymentMethods()]);
  const total = income.reduce((s, i) => s + Number(i.amount), 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الإيرادات</h1>
        <div className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-bold">إجمالي: {money(total)}</div>
      </div>
      <p className="text-xs text-muted bg-neutral-50 border rounded-lg px-3 py-2">
        سجّل هنا أي إيراد مش ناتج عن فاتورة بيع أو أوردر أو تحصيل من عميل/تاجر - زي عمولة، عربون من غير أوردر مسجّل، أو أي دخل متفرق تاني. كل عملية هنا بتدخل الخزينة اللي تحددها فورًا.
      </p>
      <IncomeForm categories={categories} paymentMethods={paymentMethods} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">التصنيف</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            {income.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-3">{i.categoryName}</td><td>{money(i.amount)}</td><td>{i.paymentMethodName}</td><td className="text-neutral-500">{i.note}</td><td>{dateAr(i.createdAt)}</td>
                <td><IncomeRowActions income={i} categories={categories} paymentMethods={paymentMethods} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
