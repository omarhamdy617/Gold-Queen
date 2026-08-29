"use client";
import { useState, useTransition } from "react";
import { recordCollection } from "@/actions/customers";
import { useRouter } from "next/navigation";

export default function CollectionForm({ customerId, paymentMethods }: { customerId: string; paymentMethods: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await recordCollection({ customerId, amount: parseFloat(amount), paymentMethodId, note });
          setAmount(""); setNote("");
          router.refresh();
        });
      }}
      className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-4 gap-3 items-end"
    >
      <div className="sm:col-span-1">
        <label className="text-xs text-neutral-500">تسجيل تحصيل دفعة</label>
        <input required type="number" step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">تسجيل التحصيل</button>
    </form>
  );
}
