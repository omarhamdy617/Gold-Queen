"use client";
import { useState, useTransition } from "react";
import { updateOrderDetails } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { EGYPT_GOVERNORATES } from "@/lib/governorates";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";
import ProductSearchSelect from "@/components/ProductSearchSelect";
import { money } from "@/lib/format";

type ExistingItem = { id: string; productId: string; quantity: number; unitPrice: string };

export default function OrderEditForm({
  orderId,
  products,
  order,
  items,
}: {
  orderId: string;
  products: any[];
  order: any;
  items: ExistingItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");

  const [customerName, setCustomerName] = useState(order.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone || "");
  const [customerPhone2, setCustomerPhone2] = useState(order.customerPhone2 || "");
  const [address, setAddress] = useState(order.address || "");
  const [governorate, setGovernorate] = useState(order.governorate || "");
  const [source, setSource] = useState(order.source || "WEBSITE");
  const [orderNotes, setOrderNotes] = useState(order.orderNotes || "");
  const [deliveryNotes, setDeliveryNotes] = useState(order.deliveryNotes || "");
  const [prepaid, setPrepaid] = useState(!!order.prepaid);
  const [lines, setLines] = useState(
    items.length > 0
      ? items.map((it) => ({ productId: it.productId, quantity: String(it.quantity), unitPrice: it.unitPrice }))
      : [{ productId: "", quantity: "", unitPrice: "" }]
  );
  const [shippingFee, setShippingFee] = useState(String(order.shippingFee ?? "0"));
  const [discount, setDiscount] = useState(String(order.discount ?? "0"));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="no-print bg-navy text-white rounded-lg px-4 py-2 text-sm">
        تعديل بيانات الأوردر
      </button>
    );
  }

  const validItems = lines.filter((l) => l.productId && l.quantity && parseInt(l.quantity) > 0);
  const subtotal = validItems.reduce((s, l) => s + parseInt(l.quantity || "0") * parseFloat(l.unitPrice || "0"), 0);
  const total = subtotal - parseFloat(discount || "0") + parseFloat(shippingFee || "0");

  function submit() {
    setError("");
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    if (!customerPhone.trim()) return setError("رقم الهاتف مطلوب");
    if (!address.trim()) return setError("العنوان مطلوب");
    if (!governorate.trim()) return setError("المحافظة مطلوبة");
    const finalItems = lines
      .filter((l) => l.productId && l.quantity && parseInt(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice || "0") }));
    if (finalItems.length === 0) return setError("لازم يفضل صنف واحد على الأقل بكمية صحيحة");
    if (finalItems.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice < 0)) return setError("لازم تكتب سعر صحيح لكل صنف");
    if (total < 0) return setError("الإجمالي طلع بالسالب - راجع الخصم/الأسعار");

    start(async () => {
      try {
        const result = await updateOrderDetails(orderId, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerPhone2: customerPhone2.trim() || undefined,
          address: address.trim(),
          governorate: governorate.trim(),
          source: source as any,
          prepaid,
          orderNotes: orderNotes.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          items: finalItems,
          discount: discount ? parseFloat(discount) : 0,
          shippingFee: shippingFee ? parseFloat(shippingFee) : 0,
        });
        if (isActionError(result)) { setError(result.error); return; }
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر حفظ تعديلات الأوردر"));
      }
    });
  }

  return (
    <div className="no-print app-card p-4 space-y-4 border-2 border-navy">
      <h2 className="font-bold">تعديل بيانات الأوردر</h2>
      {order.locationId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          الأوردر ده اتحدد له مكان تجهيز بالفعل - لو غيّرت الأصناف أو الكميات، المخزون هيتعدّل تلقائيًا (رجوع القديم وحجز الجديد).
        </p>
      )}

      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">اسم العميل *</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted">رقم الهاتف *</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
          </div>
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
        <div>
          <label className="text-xs text-muted">ملاحظات الأوردر</label>
          <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" rows={2} />
        </div>
        <div>
          <label className="text-xs text-muted">ملاحظات التسليم/الشحن</label>
          <textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" rows={2} />
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">الأصناف والسعر</div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid sm:grid-cols-[1fr_90px_120px_auto] gap-2 items-center">
            <ProductSearchSelect
              products={products}
              value={line.productId}
              onChange={(productId) => { const next = [...lines]; next[idx] = { ...next[idx], productId }; setLines(next); }}
            />
            <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const next = [...lines]; next[idx] = { ...next[idx], quantity: e.target.value }; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
            <input type="number" step="0.01" placeholder="سعر الوحدة" value={line.unitPrice} onChange={(e) => { const next = [...lines]; next[idx] = { ...next[idx], unitPrice: e.target.value }; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-600 text-xs">حذف</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="text-xs text-muted">مصاريف الشحن</label>
            <input type="number" step="0.01" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted">خصم</label>
            <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" />
          </div>
        </div>

        <div className="bg-neutral-50 border rounded-lg px-3 py-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <div><span className="text-muted">إجمالي الأصناف: </span><span className="font-semibold">{money(subtotal)}</span></div>
          <div><span className="text-muted">الإجمالي الكلي: </span><span className="font-bold text-primary">{money(total)}</span></div>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">
          {pending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
