"use client";
import { useState, useTransition } from "react";
import { adjustCashDrawer } from "@/actions/cash";
import { friendlyErrorMessage } from "@/lib/errors";

export default function CashAdjustForm({ paymentMethodId }: { paymentMethodId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-gold hover:underline">
        تسوية يدوية
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            await adjustCashDrawer(paymentMethodId, parseFloat(amount), note);
            setOpen(false);
            setAmount("");
            setNote("");
          } catch (err: any) {
            setError(friendlyErrorMessage(err, "تعذر حفظ التسوية - البيانات اللي كتبتها لسه موجودة، جرب تاني"));
          }
        });
      }}
      className="space-y-2 pt-2 border-t"
    >
      <input
        required
        type="number"
        step="0.01"
        placeholder="المبلغ (بالسالب للخصم)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full border rounded px-2 py-1 text-sm"
      />
      <input
        placeholder="السبب"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full border rounded px-2 py-1 text-sm"
      />
      {error && <div className="text-red-600 text-[11px]">{error}</div>}
      <div className="flex gap-2">
        <button disabled={pending} className="bg-gold text-white text-xs rounded px-3 py-1">
          حفظ
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500">
          إلغاء
        </button>
      </div>
    </form>
  );
}
