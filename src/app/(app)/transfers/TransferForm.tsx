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

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">
        + تحويل بضاعة
      </button>
    );

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
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
        <div key={idx} className="grid sm:grid-cols-3 gap-2">
          <select value={line.productId} onChange={(e) => {
            const next = [...lines]; next[idx].productId = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} (متاح: {p.totalStock})</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
            const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "" }])} className="text-sm text-gold">+ سطر</button>
      <div className="flex gap-2 pt-2 border-t">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await createTransfer({
                fromLocationId, toLocationId, note,
                items: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) })),
              });
              setOpen(false);
              setLines([{ productId: "", quantity: "" }]);
              router.refresh();
            })
          }
          className="bg-gold text-white rounded-lg px-5 py-2 text-sm"
        >
          تنفيذ التحويل
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
