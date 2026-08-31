"use client";
import { useState, useTransition } from "react";
import { createTransfer } from "@/actions/transfers";
import { useRouter } from "next/navigation";

export default function TransferForm({ products, locations }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [fromLocationId, setFrom] = useState(locations[0]?.id || "");
  const [toLocationId, setTo] = useState(locations[1]?.id || locations[0]?.id || "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);
  const [error, setError] = useState("");

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">
        + تحويل بضاعة
      </button>
    );

  function availableAt(productId: string, locationId: string) {
    const p = products.find((pp: any) => pp.id === productId);
    return p?.stockByLocation?.[locationId] ?? 0;
  }

  function submit() {
    setError("");
    if (!fromLocationId || !toLocationId) return setError("لازم تحدد المكان المصدر والوجهة");
    if (fromLocationId === toLocationId) return setError("لازم يكون المصدر والوجهة مختلفين");
    const items = lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) || 0 }));
    if (items.length === 0) return setError("لازم تضيف صنف واحد على الأقل");
    for (const it of items) {
      if (!it.quantity || it.quantity <= 0) return setError("لازم تدخل كمية صحيحة لكل صنف");
      const avail = availableAt(it.productId, fromLocationId);
      if (it.quantity > avail) {
        const p = products.find((pp: any) => pp.id === it.productId);
        return setError(`الكمية المتاحة من "${p?.name}" في المكان المصدر هي ${avail} فقط، وانت طالب تحويل ${it.quantity}`);
      }
    }
    start(async () => {
      try {
        await createTransfer({ fromLocationId, toLocationId, note, items });
        setOpen(false);
        setLines([{ productId: "", quantity: "" }]);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ أثناء تنفيذ التحويل");
      }
    });
  }

  return (
    <div className="app-card p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <select value={fromLocationId} onChange={(e) => setFrom(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>من: {l.name}</option>)}
        </select>
        <select value={toLocationId} onChange={(e) => setTo(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>إلى: {l.name}</option>)}
        </select>
        <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="grid sm:grid-cols-3 gap-2 items-center">
          <select value={line.productId} onChange={(e) => {
            const next = [...lines]; next[idx].productId = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} (متاح في المصدر: {p.stockByLocation?.[fromLocationId] ?? 0})</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
            const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "" }])} className="text-sm text-gold">+ سطر</button>
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="flex gap-2 pt-2 border-t">
        <button disabled={pending} onClick={submit} className="bg-gold text-white rounded-lg px-5 py-2 text-sm">
          تنفيذ التحويل
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
