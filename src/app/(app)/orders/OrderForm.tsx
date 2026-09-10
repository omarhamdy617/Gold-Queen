"use client";
import { useState, useTransition } from "react";
import { createOrder, checkDuplicateOrder } from "@/actions/orders";
import { listProductsWithStock } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { useRouter } from "next/navigation";
import SimpleCustomerField, { type SimpleCustomer, type SimpleCustomerValue } from "@/components/SimpleCustomerField";
import { EGYPT_GOVERNORATES } from "@/lib/governorates";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";
import ProductSearchSelect from "@/components/ProductSearchSelect";
import { money, dateAr } from "@/lib/format";

// المنتجات والعملاء بقوا بيتجابوا بس لما الفورم ده يتفتح فعليًا (مش مع كل تحميل لصفحة الأوردرات
// زي قبل كده) - ده كان أكبر سبب في بطء صفحة الأوردرات: كل مرة أي حد يغيّر حالة أوردر، الصفحة
// كلها كانت بتتحدث وبتجيب كل المنتجات وكل العملاء تاني من غير داعي حتى لو الفورم ده مقفول أصلًا.
export default function OrderForm({ locations, orderSources }: any) {
  const [open, setOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<SimpleCustomer[]>([]);
  const [loaded, setLoaded] = useState(false);
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
  // الافتراضي زي قبل كده تمامًا (الموقع، أكتر مصدر شائع للأوردرات) - دلوقتي مصادر الأوردر بقت
  // جدول حقيقي قابل للتعديل من الإعدادات (شوف src/actions/orderSources.ts) بدل قيم enum ثابتة،
  // فبندوّر على "الموقع" بالاسم بدل ما نفترض كود ثابت زي "WEBSITE"
  const [source, setSource] = useState(orderSources.find((s: any) => s.name === "الموقع")?.id || orderSources[0]?.id || "");
  const [orderNotes, setOrderNotes] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [prepaid, setPrepaid] = useState(false);
  const [lines, setLines] = useState([{ productId: "", quantity: "", unitPrice: "" }]);
  const [shippingFee, setShippingFee] = useState("");
  const [discount, setDiscount] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ code: string; createdAt: string } | null>(null);

  async function openForm() {
    setOpen(true);
    if (loaded) return; // اتحمّلوا قبل كده في نفس الزيارة - مفيش داعي نجيبهم تاني
    setLoadingData(true);
    setDataError("");
    try {
      const [prods, custs] = await Promise.all([listProductsWithStock(), listCustomers()]);
      setProducts(prods as any[]);
      setCustomers(custs as any as SimpleCustomer[]);
      setLoaded(true);
    } catch (e: any) {
      setDataError(friendlyErrorMessage(e, "تعذر تحميل بيانات المنتجات/العملاء"));
    } finally {
      setLoadingData(false);
    }
  }

  if (!open) return <button onClick={openForm} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ أوردر جديد</button>;

  if (loadingData) {
    return (
      <div className="app-card p-4 text-sm text-muted">جارٍ تحميل بيانات المنتجات والعملاء...</div>
    );
  }

  if (dataError) {
    return (
      <div className="app-card p-4 space-y-2">
        <div className="text-red-600 text-sm">{dataError}</div>
        <button onClick={openForm} className="text-sm text-gold">حاول تاني</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm mr-3">إلغاء</button>
      </div>
    );
  }

  const validItems = lines.filter((l) => l.productId && l.quantity && parseInt(l.quantity) > 0);
  const subtotal = validItems.reduce((s, l) => s + parseInt(l.quantity || "0") * parseFloat(l.unitPrice || "0"), 0);
  const total = subtotal - parseFloat(discount || "0") + parseFloat(shippingFee || "0");

  function buildItems() {
    return lines
      .filter((l) => l.productId && l.quantity && parseInt(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice || "0") }));
  }

  function doSubmit() {
    const items = buildItems();
    start(async () => {
      try {
        const result = await createOrder({
          customerId: customerId || undefined,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerPhone2: customerPhone2.trim() || undefined,
          address: address.trim(),
          governorate: governorate.trim(),
          orderNotes: orderNotes.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          source,
          prepaid,
          items,
          discount: discount ? parseFloat(discount) : 0,
          shippingFee: shippingFee ? parseFloat(shippingFee) : 0,
        });
        if (isActionError(result)) { setError(result.error); return; }
        setOpen(false);
        setDuplicateWarning(null);
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر حفظ الأوردر"));
      }
    });
  }

  function submit() {
    setError("");
    setDuplicateWarning(null);
    if (!customerName.trim()) return setError("اسم العميل مطلوب");
    if (!customerPhone.trim()) return setError("رقم الهاتف مطلوب");
    if (!address.trim()) return setError("العنوان مطلوب");
    if (!governorate.trim()) return setError("المحافظة مطلوبة");
    const items = buildItems();
    if (items.length === 0) return setError("لازم تضيف صنف واحد على الأقل بكمية صحيحة");
    if (items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice < 0)) return setError("لازم تكتب سعر صحيح لكل صنف");
    if (total < 0) return setError("الإجمالي طلع بالسالب - راجع الخصم/الأسعار");

    start(async () => {
      try {
        const dup = await checkDuplicateOrder(customerPhone.trim());
        if (!isActionError(dup) && dup.found) {
          setDuplicateWarning({ code: dup.code!, createdAt: String(dup.createdAt) });
          return;
        }
      } catch {
        // فشل فحص التكرار مش لازم يوقف التسجيل - نكمل عادي
      }
      doSubmit();
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
              {orderSources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} /> العميل دافع مقدمًا</label>
        </div>
        <p className="text-xs text-muted bg-neutral-50 border rounded-lg px-3 py-2">
          هيتجهز من إيه المحل أو المخزن؟ ده بيتحدد بعد كده من فريق المخازن/الشحن بعد ما الأوردر يتأكد تليفونيًا، مش لازم تحدده أنت دلوقتي.
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
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">الأصناف والسعر</div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid sm:grid-cols-[1fr_90px_120px_auto] gap-2 items-center">
            <ProductSearchSelect
              products={products}
              value={line.productId}
              onChange={(productId) => { const next = [...lines]; next[idx].productId = productId; setLines(next); }}
            />
            <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const next = [...lines]; next[idx].quantity = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
            <input type="number" step="0.01" placeholder="سعر الوحدة" value={line.unitPrice} onChange={(e) => { const next = [...lines]; next[idx].unitPrice = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-600 text-xs">حذف</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="text-xs text-muted">مصاريف الشحن</label>
            <input type="number" step="0.01" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-muted">خصم</label>
            <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" placeholder="0" />
          </div>
        </div>

        <div className="bg-neutral-50 border rounded-lg px-3 py-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <div><span className="text-muted">إجمالي الأصناف: </span><span className="font-semibold">{money(subtotal)}</span></div>
          <div><span className="text-muted">الإجمالي الكلي (المبلغ المتوقع تحصيله): </span><span className="font-bold text-primary">{money(total)}</span></div>
        </div>
      </div>

      {duplicateWarning && (
        <div className="text-amber-800 text-sm bg-amber-50 border border-amber-300 rounded px-3 py-2 space-y-2">
          <div>⚠️ عندك أوردر تاني بنفس رقم التليفون ده اتسجل قبل كده بكود <b>{duplicateWarning.code}</b> بتاريخ {dateAr(duplicateWarning.createdAt)} - متأكد إن ده مش تكرار؟</div>
          <div className="flex gap-2">
            <button disabled={pending} onClick={doSubmit} className="bg-amber-700 text-white text-xs rounded px-3 py-1.5">أيوه، سجّل الأوردر ده كمان</button>
            <button type="button" onClick={() => setDuplicateWarning(null)} className="text-xs text-muted">إلغاء</button>
          </div>
        </div>
      )}

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">حفظ الأوردر</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
