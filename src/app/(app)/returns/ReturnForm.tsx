"use client";
import { useState, useTransition } from "react";
import { createReturnRequest } from "@/actions/returns";
import { useRouter } from "next/navigation";

export default function ReturnForm({ products, customers }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [kind, setKind] = useState<"SALE_RETURN" | "PURCHASE_RETURN">("SALE_RETURN");
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([{ productId: "", quantity: "", unitPrice: "" }]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ تسجيل مرتجع</button>;

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="border rounded px-3 py-2 text-sm">
          <option value="SALE_RETURN">مرتجع بيع (من عميل)</option>
          <option value="PURCHASE_RETURN">مرتجع شراء (لمورد)</option>
        </select>
        {kind === "SALE_RETURN" && (
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="border rounded px-3 py-2 text-sm">
            <option value="">اختر العميل</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="grid sm:grid-cols-3 gap-2">
          <select value={line.productId} onChange={(e) => { const next = [...lines]; next[idx].productId = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const next = [...lines]; next[idx].quantity = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
          <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => { const next = [...lines]; next[idx].unitPrice = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>
      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={() => start(async () => {
          await createReturnRequest({
            kind, customerId: customerId || undefined, reason,
            items: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 })),
          });
          setOpen(false); router.refresh();
        })} className="bg-gold text-white rounded-lg px-5 py-2 text-sm">إرسال للاعتماد</button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
