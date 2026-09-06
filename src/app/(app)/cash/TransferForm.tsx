"use client";
import { useState, useTransition } from "react";
import { transferCash } from "@/actions/cash";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function TransferForm({ drawers }: { drawers: { paymentMethodId: string | null; paymentMethodName: string | null; balance: string }[] }) {
  const options = drawers.filter((d) => d.paymentMethodId);
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(options[0]?.paymentMethodId || "");
  const [toId, setToId] = useState(options[1]?.paymentMethodId || options[0]?.paymentMethodId || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-white border border-gold text-gold rounded-lg px-4 py-2 text-sm">
        🔁 تحويل بين الخزائن
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (fromId === toId) { setError("لازم تختار خزينتين مختلفتين"); return; }
        if (!parseFloat(amount) || parseFloat(amount) <= 0) { setError("المبلغ لازم يكون أكبر من صفر"); return; }
        start(async () => {
          try {
            const res = await transferCash(fromId, toId, parseFloat(amount), note.trim() || undefined);
            if (isActionError(res)) { setError(res.error); return; }
            setOpen(false);
            setAmount("");
            setNote("");
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر تنفيذ التحويل"));
          }
        });
      }}
      className="app-card p-4 space-y-3 max-w-md"
    >
      <div className="font-bold text-sm">تحويل بين الخزائن</div>
      {error && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted block mb-1">من خزينة</label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full">
            {options.map((d) => <option key={d.paymentMethodId} value={d.paymentMethodId!}>{d.paymentMethodName || "-"} ({d.balance})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">إلى خزينة</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full">
            {options.map((d) => <option key={d.paymentMethodId} value={d.paymentMethodId!}>{d.paymentMethodName || "-"} ({d.balance})</option>)}
          </select>
        </div>
      </div>
      <input required type="number" step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
      <input placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
      <div className="flex gap-2">
        <button disabled={pending} className="bg-gold text-white text-sm rounded px-4 py-1.5">{pending ? "جارٍ التحويل..." : "تنفيذ التحويل"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500">إلغاء</button>
      </div>
    </form>
  );
}
