"use client";
import { useState, useTransition } from "react";
import { createOrder } from "@/actions/orders";
import { useRouter } from "next/navigation";
import SimpleCustomerField, { type SimpleCustomer, type SimpleCustomerValue } from "@/components/SimpleCustomerField";
import { EGYPT_GOVERNORATES } from "@/lib/governorates";
import { friendlyErrorMessage } from "@/lib/errors";

export default function OrderForm({ products, customers: initialCustomers, locations }: any) {
  const [customers] = useState<SimpleCustomer[]>(initialCustomers);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");
  const [customerField, setCustomerField] = useState<SimpleCustomerValue>({ customerId: "", name: "", phone: "", type: "RETAIL" });
  const customerId = customerField.customerId;
  const customerName = customerField.name;
  const customerPhone = customerField.phone;
  const [customerPhone2, setCustomerPhone2] = useState("");
  const [address, setAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [source, setSource] = useState("WEBSITE");
  const [orderNotes, setOrderNotes] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [prepaid, setPrepaid] = useState(false);
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ أوردر جديد</button>;

  function submit() {
    setError("");
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    if (!customerPhone.trim()) return setError("رقم الهاتف مطلوب");
    if (!address.trim()) return setError("العنوان مطلوب");
    if (!governorate.trim()) return setError("المحافظة مطلوبة");
    const items = lines.filter((l) => l.productId && l.quantity && parseInt(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) }));
    if (items.length === 0) return setError("لازم تضيف صنف واحد على الأقل بكمية صحيحة");
    start(async () => {
      try {
        await createOrder({
          customerId: customerId || undefined,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerPhone2: customerPhone2.trim() || undefined,
          address: address.trim(),
          governorate: governorate.trim(),
          orderNotes: orderNotes.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          source: source as any,
          prepaid,
          items,
        });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر حفظ الأوردر"));
      }
    });
  }

  return (
    <div className="app-card p-4 space-y-4">
      <h2 className="font-bold">تسجيل أوردر جديد</h2>

      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">بيانات العميل والتوصيل</div>
        <SimpleCustomerField customers={customers} value={customerField} onChange={setCustomerField} />
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">رقم هاتف إضافي (اختياري)</label>
            <input value={customerPhone2} onChange={(e) => setCustomerPhone2(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted">المحافظة *</label>
            <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1">
              <option value="">اختر المحافظة</option>
              {EGYPT_GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted">العنوان بالتفصيل *</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">مصدر الأوردر</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1">
              <option value="WEBSITE">الموقع</option><option value="PHONE">تليفون</option><option value="WHATSAPP">واتساب</option><option value="FACEBOOK">فيسبوك</option><option value="OTHER">أخرى</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} /> العميل دافع مقدمًا</label>
        </div>
        <p className="text-xs text-muted bg-neutral-50 border rounded-lg px-3 py-2">
          هيتجهز من إيه المحل أو المخزن؟ ده بيتحدد بعد كده من فريق المخازن/الشحن، مش لازم تحدده أنت دلوقتي.
        </p>
        <div>
          <label className="text-xs text-muted">ملاحظات الأوردر</label>
          <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" rows={2} />
        </div>
        <div>
          <label className="text-xs text-muted">ملاحظات التسليم/الشحن</label>
          <textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" rows={2} placeholder="مثال: التسليم بعد الساعة 5، الدور التالت..." />
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">الأصناف</div>
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
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">حفظ الأوردر</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
