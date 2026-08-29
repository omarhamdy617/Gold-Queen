"use client";
import { useState, useTransition } from "react";
import { createOrder } from "@/actions/orders";
import { useRouter } from "next/navigation";

export default function OrderForm({ products, customers }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [source, setSource] = useState("WEBSITE");
  const [shippingMethod, setShippingMethod] = useState("INTERNAL_COURIER");
  const [courierName, setCourierName] = useState("");
  const [shippingCompanyName, setShippingCompanyName] = useState("");
  const [prepaid, setPrepaid] = useState(false);
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ أوردر جديد</button>;

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">بدون عميل مسجل</option>
          {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="WEBSITE">الموقع</option><option value="PHONE">تليفون</option><option value="WHATSAPP">واتساب</option><option value="FACEBOOK">فيسبوك</option><option value="OTHER">أخرى</option>
        </select>
        <select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="INTERNAL_COURIER">مندوب داخلي</option><option value="EXTERNAL_COMPANY">شركة شحن خارجية</option><option value="OTHER">أخرى</option>
        </select>
      </div>
      {shippingMethod === "INTERNAL_COURIER" && <input placeholder="اسم المندوب" value={courierName} onChange={(e) => setCourierName(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />}
      {shippingMethod === "EXTERNAL_COMPANY" && <input placeholder="اسم شركة الشحن" value={shippingCompanyName} onChange={(e) => setShippingCompanyName(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} /> العميل دافع مقدمًا</label>

      {lines.map((line, idx) => (
        <div key={idx} className="grid sm:grid-cols-2 gap-2">
          <select value={line.productId} onChange={(e) => { const next = [...lines]; next[idx].productId = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const next = [...lines]; next[idx].quantity = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "" }])} className="text-sm text-gold">+ سطر</button>

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={() => start(async () => {
          await createOrder({
            customerId: customerId || undefined, source: source as any, shippingMethod: shippingMethod as any,
            courierName: courierName || undefined, shippingCompanyName: shippingCompanyName || undefined, prepaid,
            items: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) })),
          });
          setOpen(false); router.refresh();
        })} className="bg-gold text-white rounded-lg px-5 py-2 text-sm">حفظ الأوردر</button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
