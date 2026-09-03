"use client";
import { useState, useTransition } from "react";
import { paySupplier } from "@/actions/purchases";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

export default function PaySupplierForm({ supplierId, paymentMethods }: { supplierId: string; paymentMethods: any[] }) {
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [transferMethod, setTransferMethod] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="font-bold">سداد مبلغ للمورد</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">المبلغ</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted">طريقة الدفع (تخصم من الخزينة دي)</label>
          <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1">
            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted">طريقة التحويل (اختياري - مثلاً: تحويل بنكي، فودافون كاش، كاش يد بيد)</label>
        <input value={transferMethod} onChange={(e) => setTransferMethod(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted">ملاحظات</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <button
        disabled={pending}
        onClick={() => {
          setError("");
          const amt = parseFloat(amount) || 0;
          if (amt <= 0) return setError("أدخل مبلغ صحيح");
          if (!paymentMethodId) return setError("اختر طريقة الدفع");
          start(async () => {
            try {
              const result = await paySupplier({ supplierId, amount: amt, paymentMethodId, transferMethod: transferMethod || undefined, note: note || undefined });
              if (isActionError(result)) { setError(result.error); return; }
              setAmount(""); setTransferMethod(""); setNote("");
              router.refresh();
            } catch (e: any) {
              setError(friendlyErrorMessage(e, "تعذر تسجيل السداد"));
            }
          });
        }}
        className="bg-primary text-white rounded-lg px-5 py-2 text-sm"
      >
        تسجيل السداد
      </button>
    </div>
  );
}
