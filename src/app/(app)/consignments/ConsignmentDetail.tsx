"use client";
import { useEffect, useState, useTransition } from "react";
import { getConsignmentItems, returnConsignmentItems, settleConsignmentItemMixed, confirmConsignmentReceipt } from "@/actions/consignments";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

type Item = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  returnedQty: number;
  soldQty: number;
  productName: string;
  createdAt: string;
  receivedConfirmedAt: string | null;
  confirmedByName: string | null;
};

const STALE_DAYS = 21;

export default function ConsignmentDetail({ consignmentId, locations, paymentMethods }: { consignmentId: string; locations: any[]; paymentMethods: any[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const router = useRouter();

  // نموذج "توزيع الباقي": حدد أي جزء يترجع للمخزون وأي جزء يتباع لعميل حقيقي - في نفس الوقت لنفس الصنف
  const [sellItemId, setSellItemId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [extraReturnQty, setExtraReturnQty] = useState("");
  const [sellLocationId, setSellLocationId] = useState(locations[0]?.id || "");
  const [sellPaymentMethodId, setSellPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [sellCustomerName, setSellCustomerName] = useState("");
  const [sellCustomerPhone, setSellCustomerPhone] = useState("");
  const [sellError, setSellError] = useState("");

  useEffect(() => {
    if (open && !items) {
      getConsignmentItems(consignmentId).then(setItems as any);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshItems() {
    return getConsignmentItems(consignmentId).then((fresh) => setItems(fresh as any));
  }

  function ageDays(createdAt: string) {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000));
  }

  function submitReturn() {
    setError("");
    const toReturn = Object.entries(qty)
      .map(([itemId, q]) => ({ itemId, quantity: parseInt(q) || 0 }))
      .filter((i) => i.quantity > 0);
    if (toReturn.length === 0) return setError("اكتب كمية عشان ترجعها في صنف واحد على الأقل");
    if (!locationId) return setError("اختار المكان اللي هترجع له البضاعة");
    start(async () => {
      try {
        const result = await returnConsignmentItems({ consignmentId, locationId, items: toReturn });
        if (isActionError(result)) { setError(result.error); return; }
        setQty({});
        await refreshItems();
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تسجيل إرجاع البضاعة"));
      }
    });
  }

  function submitConfirmReceipt(itemId: string) {
    setConfirmingId(itemId);
    start(async () => {
      try {
        const result = await confirmConsignmentReceipt(itemId);
        if (isActionError(result)) { setError(result.error); setConfirmingId(null); return; }
        await refreshItems();
        setConfirmingId(null);
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تأكيد الاستلام"));
        setConfirmingId(null);
      }
    });
  }

  function submitSell() {
    setSellError("");
    if (!sellItemId) return;
    const q = parseInt(sellQty) || 0;
    const returnQ = parseInt(extraReturnQty) || 0;
    if (q <= 0 && returnQ <= 0) return setSellError("أدخل كمية بيع أو كمية إرجاع على الأقل");
    if (!sellLocationId) return setSellError("اختار المكان");
    if (q > 0) {
      const price = parseFloat(sellPrice);
      if (!Number.isFinite(price) || price < 0) return setSellError("أدخل سعر بيع صحيح");
      if (!sellPaymentMethodId) return setSellError("اختار طريقة التحصيل");
    }
    start(async () => {
      try {
        const result = await settleConsignmentItemMixed({
          consignmentItemId: sellItemId,
          locationId: sellLocationId,
          returnQuantity: returnQ > 0 ? returnQ : undefined,
          sale:
            q > 0
              ? {
                  quantity: q,
                  unitPrice: parseFloat(sellPrice),
                  paymentMethodId: sellPaymentMethodId,
                  customerName: sellCustomerName.trim() || undefined,
                  customerPhone: sellCustomerPhone.trim() || undefined,
                }
              : undefined,
        });
        if (isActionError(result)) { setSellError(result.error); return; }
        setSellItemId(null); setSellQty(""); setSellPrice(""); setExtraReturnQty(""); setSellCustomerName(""); setSellCustomerPhone("");
        await refreshItems();
        router.refresh();
      } catch (e: any) {
        setSellError(friendlyErrorMessage(e, "تعذر تنفيذ العملية"));
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        تفاصيل البضاعة / بيع / تسجيل رجوع
      </button>
    );
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-2">
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">إخفاء التفاصيل ✕</button>
      {!items ? (
        <div className="text-xs text-muted">جارٍ التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted">لا توجد أصناف مسجلة في العهدة دي</div>
      ) : (
        <>
          <table className="w-full text-xs text-right">
            <thead className="text-muted border-b">
              <tr><th className="py-1">المنتج</th><th>الكمية اللي معاه</th><th>المتبقي فعليًا</th><th>الاستلام</th><th>كمية الرجوع</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const remaining = it.quantity - it.returnedQty - it.soldQty;
                const age = ageDays(it.createdAt);
                const isStale = remaining > 0 && age >= STALE_DAYS;
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      {it.productName}
                      {it.soldQty > 0 && <span className="text-[10px] text-muted"> (اتباع منه {it.soldQty})</span>}
                      {isStale && (
                        <span className="block text-[10px] text-amber-700">⚠ عندها {age} يوم من غير رجوع/بيع</span>
                      )}
                    </td>
                    <td>{it.quantity}</td>
                    <td className={remaining === 0 ? "text-muted" : "font-bold"}>{remaining}</td>
                    <td>
                      {it.receivedConfirmedAt ? (
                        <span className="text-[10px] text-green-700">✓ اتأكد{it.confirmedByName ? ` (${it.confirmedByName})` : ""}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={pending && confirmingId === it.id}
                          onClick={() => submitConfirmReceipt(it.id)}
                          className="text-[10px] text-navy underline"
                        >
                          {pending && confirmingId === it.id ? "..." : "تأكيد الاستلام"}
                        </button>
                      )}
                    </td>
                    <td>
                      {remaining > 0 ? (
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          value={qty[it.id] || ""}
                          onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                          className="border rounded px-2 py-1 w-20 text-xs"
                        />
                      ) : (
                        <span className="text-[10px] text-muted">اترجع كله</span>
                      )}
                    </td>
                    <td>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => { setSellItemId(it.id); setSellQty(String(remaining)); setSellPrice(it.unitPrice); setExtraReturnQty(""); setSellError(""); }}
                          className="text-[11px] text-gold underline"
                        >
                          بيع / توزيع الباقي
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">هترجع فين؟</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded px-2 py-1 text-xs">
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button disabled={pending} onClick={submitReturn} className="bg-navy text-white rounded px-3 py-1.5 text-xs">
              {pending ? "جارٍ التسجيل..." : "تسجيل رجوع البضاعة"}
            </button>
          </div>
          {error && <div className="text-red-600 text-xs">{error}</div>}
        </>
      )}

      {sellItemId && (
        <div className="bg-neutral-50 border rounded-lg p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold">
            توزيع "{items?.find((i) => i.id === sellItemId)?.productName}" - ابيع جزء لعميل وارجع الباقي (أو أي منهم لوحده) في خطوة واحدة
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">الكمية المباعة لعميل (اختياري)</label>
              <input type="number" min={0} placeholder="0" value={sellQty} onChange={(e) => setSellQty(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">سعر البيع للعميل</label>
              <input type="number" step="0.01" placeholder="سعر البيع" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">كمية هترجع للمخزون كمان (اختياري)</label>
              <input type="number" min={0} placeholder="0" value={extraReturnQty} onChange={(e) => setExtraReturnQty(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <select value={sellLocationId} onChange={(e) => setSellLocationId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              {locations.map((l: any) => <option key={l.id} value={l.id}>مكان الفاتورة/الرجوع: {l.name}</option>)}
            </select>
            <input placeholder="اسم العميل (اختياري)" value={sellCustomerName} onChange={(e) => setSellCustomerName(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="رقم هاتف العميل (اختياري)" value={sellCustomerPhone} onChange={(e) => setSellCustomerPhone(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <select value={sellPaymentMethodId} onChange={(e) => setSellPaymentMethodId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
              {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {sellError && <div className="text-red-600 text-xs">{sellError}</div>}
          <div className="flex gap-2">
            <button disabled={pending} onClick={submitSell} className="bg-gold text-white rounded px-3 py-1.5 text-xs">
              {pending ? "جارٍ الحفظ..." : "تنفيذ"}
            </button>
            <button type="button" onClick={() => setSellItemId(null)} className="text-xs text-muted">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
