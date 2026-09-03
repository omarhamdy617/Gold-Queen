"use client";
import { useState, useTransition } from "react";
import { settleConsignment } from "@/actions/consignments";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

export default function SettleForm({ consignmentId, paymentMethods }: { consignmentId: string; paymentMethods: any[] }) {
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const amt = parseFloat(amount) || 0;
        if (amt <= 0) return setError("أدخل مبلغ صحيح");
        if (!paymentMethodId) return setError("اختر طريقة التحصيل");
        start(async () => {
          try {
            const result = await settleConsignment(consignmentId, amt, paymentMethodId);
            if (isActionError(result)) { setError(result.error); return; }
            setAmount("");
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر تسجيل التسوية"));
          }
        });
      }}
      className="space-y-1"
    >
      <div className="flex gap-2">
        <input type="number" step="0.01" placeholder="مبلغ التسوية" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" />
        <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-2 py-1 text-sm">
          {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button disabled={pending} className="bg-primary text-white text-xs rounded px-3">تسوية</button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </form>
  );
}
