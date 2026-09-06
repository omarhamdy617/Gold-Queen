import { listLoanAccounts } from "@/actions/loans";
import { listPaymentMethods } from "@/actions/cash";
import { money } from "@/lib/format";
import LoanForm from "./LoanForm";
import LoanDetail from "./LoanDetail";

export default async function LoansPage() {
  const [accounts, paymentMethods] = await Promise.all([listLoanAccounts(), listPaymentMethods()]);
  const totalOwedToUs = accounts.reduce((s, a) => s + Math.max(Number(a.balance), 0), 0);
  const totalWeOwe = accounts.reduce((s, a) => s + Math.max(-Number(a.balance), 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">السلف</h1>
        <div className="flex gap-3">
          <div className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-bold">لينا: {money(totalOwedToUs)}</div>
          <div className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-bold">علينا: {money(totalWeOwe)}</div>
        </div>
      </div>
      <p className="text-xs text-muted -mt-4">
        سجّل هنا أي سلفة بتاخدها من حد (موظف أو غيره) أو سلفة إنت مديها لحد، وتابع رصيد كل شخص تراكميًا لحد ما يتسوى.
      </p>
      <LoanForm />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((a) => (
          <div key={a.id} className="app-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">{a.name}</div>
              {!a.active && <span className="text-[10px] text-muted">غير نشط</span>}
            </div>
            {a.phone && <div className="text-xs text-muted">{a.phone}</div>}
            <div className={`text-lg font-bold ${Number(a.balance) > 0 ? "text-green-600" : Number(a.balance) < 0 ? "text-red-600" : ""}`}>
              {Number(a.balance) > 0 ? `مديون لينا: ${money(a.balance)}` : Number(a.balance) < 0 ? `مديونين له: ${money(Math.abs(Number(a.balance)))}` : "متسوى (0)"}
            </div>
            <LoanDetail loanAccountId={a.id} paymentMethods={paymentMethods} />
          </div>
        ))}
        {accounts.length === 0 && <p className="text-muted text-sm">لا توجد حسابات سلف مسجلة بعد</p>}
      </div>
    </div>
  );
}
