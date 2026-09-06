"use client";
import { useState, useTransition } from "react";
import { settleConsignment } from "@/actions/consignments";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

export default function SettleForm({ consignmentId, paymentMethods, consignmentBalance }: { consignmentId: string; paymentMethods: any[]; consignmentBalance: number }) {
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
        // تحذير (مش منع) لو المبلغ أكبر من رصيد العهدة الفعلي على الموظف - نفس منطق تحذير تحصيل
        // العميل بالظبط (CollectionForm.tsx): ممكن يكون فعلًا مقصود (تسوية زيادة)، فبنسيب القرار
        // للمستخدم بعد ما نوضحله الفرق، بدل ما نمنعه أو نتجاهل التحقق خالص
        if (amt > Math.max(consignmentBalance, 0)) {
          const extra = (amt - Math.max(consignmentBalance, 0)).toFixed(2);
          const ok = confirm(
            consignmentBalance > 0
              ? `المبلغ اللي هتحصله (${amt}) أكبر من رصيد العهدة الفعلي على الموظف (${consignmentBalance.toFixed(2)}) بمقدار ${extra}. متأكد إنك عايز تكمل؟`
              : `الموظف ده مالوش عليه عهدة دلوقتي، وأنت بتسجل تسوية ${amt}. متأكد إنك عايز تكمل؟`
          );
          if (!ok) return;
        }
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
