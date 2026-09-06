"use client";
import { useEffect, useState, useTransition } from "react";
import { getLoanAccount, recordLoanTransaction } from "@/actions/loans";
import { useRouter } from "next/navigation";
import { money, dateAr } from "@/lib/format";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

type TxType = "LOAN_GIVEN" | "LOAN_TAKEN" | "REPAYMENT_RECEIVED" | "REPAYMENT_PAID";

const TYPE_LABELS: Record<TxType, string> = {
  LOAN_GIVEN: "سلّفناه إحنا (كاش خارج)",
  REPAYMENT_RECEIVED: "حصّلنا منه سداد (كاش داخل)",
  LOAN_TAKEN: "استلفنا إحنا منه (كاش داخل)",
  REPAYMENT_PAID: "سددنا له (كاش خارج)",
};

export default function LoanDetail({ loanAccountId, paymentMethods }: { loanAccountId: string; paymentMethods: any[] }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ account: any; transactions: any[] } | null>(null);
  const [type, setType] = useState<TxType>("LOAN_GIVEN");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open && !data) refresh();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    return getLoanAccount(loanAccountId).then((fresh) => setData(fresh as any));
  }

  function submit() {
    setError("");
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("أدخل مبلغ صحيح أكبر من صفر");
    if (!paymentMethodId) return setError("اختار الخزينة/طريقة الدفع");
    start(async () => {
      try {
        const res = await recordLoanTransaction({ loanAccountId, type, amount: amt, paymentMethodId, note: note.trim() || undefined });
        if (isActionError(res)) { setError(res.error); return; }
        setAmount(""); setNote("");
        await refresh();
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تسجيل الحركة"));
      }
    });
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">تفاصيل / تسجيل حركة</button>;
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">إخفاء التفاصيل ✕</button>

      <div className="bg-neutral-50 border rounded-lg p-3 space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as TxType)} className="border rounded px-2 py-1.5 text-sm">
            {Object.entries(TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
          <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
            {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        {error && <div className="text-red-600 text-xs">{error}</div>}
        <button disabled={pending} onClick={submit} className="bg-gold text-white rounded px-3 py-1.5 text-xs">
          {pending ? "جارٍ الحفظ..." : "تسجيل الحركة"}
        </button>
      </div>

      {!data ? (
        <div className="text-xs text-muted">جارٍ التحميل...</div>
      ) : data.transactions.length === 0 ? (
        <div className="text-xs text-muted">لا توجد حركات مسجلة بعد</div>
      ) : (
        <table className="w-full text-xs text-right">
          <thead className="text-muted border-b">
            <tr><th className="py-1">التاريخ</th><th>النوع</th><th>المبلغ</th><th>الخزينة</th><th>اللي سجلها</th><th>ملاحظة</th></tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-1.5">{dateAr(t.createdAt)}</td>
                <td>{TYPE_LABELS[t.type as TxType] || t.type}</td>
                <td>{money(t.amount)}</td>
                <td>{t.paymentMethodName}</td>
                <td>{t.createdByName}</td>
                <td className="text-muted">{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
