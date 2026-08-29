"use client";
import { useState, useTransition } from "react";
import { giveConsignment } from "@/actions/consignments";
import { useRouter } from "next/navigation";

export default function ConsignmentForm({ employees, products, locations }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [holderId, setHolderId] = useState(employees[0]?.id || "");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [lines, setLines] = useState([{ productId: "", quantity: "", unitPrice: "" }]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ تسليم عهدة</button>;

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <select value={holderId} onChange={(e) => setHolderId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {employees.map((e: any) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>من: {l.name}</option>)}
        </select>
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="grid sm:grid-cols-3 gap-2">
          <select value={line.productId} onChange={(e) => {
            const p = products.find((p: any) => p.id === e.target.value);
            const next = [...lines]; next[idx] = { ...next[idx], productId: e.target.value, unitPrice: p?.retailPrice || "" }; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
            const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
          <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => {
            const next = [...lines]; next[idx].unitPrice = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>
      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={() => start(async () => {
          await giveConsignment({ holderId, locationId, items: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 })) });
          setOpen(false); router.refresh();
        })} className="bg-gold text-white rounded-lg px-5 py-2 text-sm">تسليم</button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
