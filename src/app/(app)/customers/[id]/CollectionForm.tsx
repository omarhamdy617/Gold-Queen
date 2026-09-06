"use client";
import { useState, useTransition } from "react";
import { recordCollection } from "@/actions/customers";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function CollectionForm({ customerId, paymentMethods, customerBalance }: { customerId: string; paymentMethods: any[]; customerBalance: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function submit() {
    setError("");
    const amt = parseFloat(amount);
    // العميل مديون بمبلغ أقل من اللي هتحصله - النظام بيسمح بيه بس بعد تأكيد صريح، عشان الفرق ميضيعش
    // من غير حد يلاحظ (لو دفع زيادة، الفرق بيتسجل رصيد دائن ليه تلقائي).
    if (Number.isFinite(amt) && amt > Math.max(customerBalance, 0)) {
      const extra = (amt - Math.max(customerBalance, 0)).toFixed(2);
      const ok = confirm(
        customerBalance > 0
          ? `المبلغ اللي هتحصله (${amt}) أكبر من المديونية الفعلية على العميل (${customerBalance.toFixed(2)}) بمقدار ${extra} - هيتسجل الفرق كرصيد دائن للعميل. متأكد إنك عايز تكمل؟`
          : `العميل ده مالوش عليه فلوس دلوقتي، وأنت بتسجل تحصيل ${amt} - هيتسجل كرصيد دائن للعميل. متأكد إنك عايز تكمل؟`
      );
      if (!ok) return;
    }
    start(async () => {
      try {
        const r = await recordCollection({ customerId, amount: amt, paymentMethodId, note });
        if (isActionError(r)) { setError(r.error); return; }
        setAmount(""); setNote("");
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تسجيل التحصيل"));
      }
    });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="bg-white rounded-xl shadow p-4 space-y-2"
    >
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-1">
          <label className="text-xs text-neutral-500">تسجيل تحصيل دفعة</label>
          <input required type="number" step="0.01" min="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
        </div>
        <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">تسجيل التحصيل</button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </form>
  );
}
