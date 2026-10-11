import ExcelExportForm from "@/components/ExcelExportForm";
import { listExpenses, listExpenseCategories } from "@/actions/expenses";
import { listPaymentMethods } from "@/actions/cash";
import { listAllOrderSources } from "@/actions/orderSources";
import { money, dateAr } from "@/lib/format";
import ExpenseForm from "./ExpenseForm";
import ExpenseRowActions from "./ExpenseRowActions";

export default async function ExpensesPage() {
  // واحد ورا التاني مش Promise.all (درس الدفعات 19-20 عن عدد الاتصالات المتزامنة)
  const expenses = await listExpenses();
  const categories = await listExpenseCategories();
  const paymentMethods = await listPaymentMethods();
  const orderSources = await listAllOrderSources();
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">المصروفات</h1>
        <div className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-bold">إجمالي: {money(total)}</div>
      </div>
      <ExcelExportForm action="/api/export/finance" label="تنزيل Excel (المصروفات والإيرادات والخزائن)" />
      <ExpenseForm categories={categories} paymentMethods={paymentMethods} orderSources={orderSources} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">التصنيف</th><th>المبلغ</th><th>طريقة الدفع</th><th>قناة الإعلان</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="p-3">{e.categoryName}</td><td>{money(e.amount)}</td><td>{e.paymentMethodName}</td><td>{e.adSourceName ? <span className="badge badge-blue">{e.adSourceName}</span> : <span className="text-muted">—</span>}</td><td className="text-neutral-500">{e.note}</td><td>{dateAr(e.createdAt)}</td>
                <td><ExpenseRowActions expense={e} categories={categories} paymentMethods={paymentMethods} orderSources={orderSources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
