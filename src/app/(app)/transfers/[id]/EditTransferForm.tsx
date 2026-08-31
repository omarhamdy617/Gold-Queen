"use client";
import { useState, useTransition } from "react";
import { updateTransfer } from "@/actions/transfers";
import { useRouter } from "next/navigation";

export default function EditTransferForm({ transfer, items, products, locations }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [fromLocationId, setFrom] = useState(transfer.fromLocationId);
  const [toLocationId, setTo] = useState(transfer.toLocationId);
  const [note, setNote] = useState(transfer.note || "");
  const [lines, setLines] = useState(items.map((it: any) => ({ productId: it.productId, quantity: String(it.quantity) })));
  const [error, setError] = useState("");

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-primary border border-primary/30 rounded-lg px-4 py-2">
        تعديل التحويل
      </button>
    );

  function submit() {
    setError("");
    if (!fromLocationId || !toLocationId) return setError("لازم تحدد المكان المصدر والوجهة");
    if (fromLocationId === toLocationId) return setError("لازم يكون المصدر والوجهة مختلفين");
    const parsed = lines.filter((l: any) => l.productId && l.quantity).map((l: any) => ({ productId: l.productId, quantity: parseInt(l.quantity) || 0 }));
    if (parsed.length === 0) return setError("لازم تضيف صنف واحد على الأقل");
    for (const it of parsed) {
      if (!it.quantity || it.quantity <= 0) return setError("لازم تدخل كمية صحيحة لكل صنف");
    }
    start(async () => {
      try {
        await updateTransfer(transfer.id, { fromLocationId, toLocationId, note, items: parsed });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ أثناء حفظ التعديل");
      }
    });
  }

  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="font-bold">تعديل التحويل</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <select value={fromLocationId} onChange={(e) => setFrom(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>من: {l.name}</option>)}
        </select>
        <select value={toLocationId} onChange={(e) => setTo(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>إلى: {l.name}</option>)}
        </select>
        <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      </div>
      {lines.map((line: any, idx: number) => (
        <div key={idx} className="grid sm:grid-cols-3 gap-2">
          <select value={line.productId} onChange={(e) => {
            const next = [...lines]; next[idx].productId = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-1">
            <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
              const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
            }} className="border rounded px-2 py-1.5 text-sm flex-1" />
            <button type="button" onClick={() => setLines(lines.filter((_: any, i: number) => i !== idx))} className="text-red-500 text-xs">حذف</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "" }])} className="text-sm text-gold">+ سطر</button>
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="flex gap-2 pt-2 border-t">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">حفظ التعديل</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
