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

// الشاشة دي بقت بتتحكم فيها ConsignmentPanels (الزرارين اللي فوق "📦 البضاعة" و"📊 النشاط") - مبقتش
// بتفتح/تقفل نفسها بزرار خاص بيها عشان الاتنين (البضاعة والنشاط) يبقوا في تاب واحد، وميحصلش إن الاتنين
// يتفتحوا مع بعض ويطوّلوا الكارت زي قبل كده.
export default function ConsignmentDetail({
  consignmentId,
  locations,
  paymentMethods,
  open,
}: {
  consignmentId: string;
  locations: any[];
  paymentMethods: any[];
  open: boolean;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const router = useRouter();

  // نموذج "بيع" منفصل تمامًا عن "رجوع البضاعة" - وبيظهر جوه كارت الصنف نفسه بالظبط (مش في مكان
  // منفصل تحت الجدول) عشان يبقى واضح 100% إنه بيع لأي صنف بالظبط.
  const [sellItemId, setSellItemId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
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

  function openSell(it: Item, remaining: number) {
    setSellItemId(it.id);
    setSellQty(String(remaining));
    setSellPrice(it.unitPrice);
    setSellError("");
  }

  function submitSell() {
    setSellError("");
    if (!sellItemId) return;
    const q = parseInt(sellQty) || 0;
    if (q <= 0) return setSellError("أدخل كمية البيع");
    if (!sellLocationId) return setSellError("اختار المكان");
    const price = parseFloat(sellPrice);
    if (!Number.isFinite(price) || price < 0) return setSellError("أدخل سعر بيع صحيح");
    if (!sellPaymentMethodId) return setSellError("اختار طريقة التحصيل");
    start(async () => {
      try {
        const result = await settleConsignmentItemMixed({
          consignmentItemId: sellItemId,
          locationId: sellLocationId,
          sale: {
            quantity: q,
            unitPrice: price,
            paymentMethodId: sellPaymentMethodId,
            customerName: sellCustomerName.trim() || undefined,
            customerPhone: sellCustomerPhone.trim() || undefined,
          },
        });
        if (isActionError(result)) { setSellError(result.error); return; }
        setSellItemId(null); setSellQty(""); setSellPrice(""); setSellCustomerName(""); setSellCustomerPhone("");
        await refreshItems();
        router.refresh();
      } catch (e: any) {
        setSellError(friendlyErrorMessage(e, "تعذر تسجيل البيع"));
      }
    });
  }

  if (!open) return null;

  return (
    <div className="space-y-2.5">
      {!items ? (
        <div className="text-xs text-muted py-2">جارٍ التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted py-2">لا توجد أصناف مسجلة في العهدة دي</div>
      ) : (
        <>
          {/* كل صنف كارت لوحده - مش سطر في جدول مضغوط - عشان يبقى واضح 100% إنك بتتعامل مع صنف
              واحد بعينه (اسمه، اللي متبقي منه، وزراره) من غير أي لبس مع صنف تاني جنبه */}
          <div className="space-y-2">
            {items.map((it) => {
              const remaining = it.quantity - it.returnedQty - it.soldQty;
              const age = ageDays(it.createdAt);
              const isStale = remaining > 0 && age >= STALE_DAYS;
              const done = remaining === 0;
              return (
                <div key={it.id} className={`border rounded-lg p-2.5 ${done ? "bg-neutral-50 border-neutral-200" : "border-neutral-300"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{it.productName}</div>
                      <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>الأصل: {it.quantity}</span>
                        {it.soldQty > 0 && <span>اتباع: {it.soldQty}</span>}
                        {it.returnedQty > 0 && <span>رجع: {it.returnedQty}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-left">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${done ? "bg-neutral-200 text-neutral-600" : "bg-gold/15 text-gold-dark"}`}>
                        {done ? "خلصت" : `متبقي ${remaining}`}
                      </span>
                    </div>
                  </div>

                  {isStale && (
                    <div className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 w-fit">
                      ⚠ عندها {age} يوم من غير رجوع/بيع
                    </div>
                  )}

                  <div className="mt-1.5">
                    {it.receivedConfirmedAt ? (
                      <span className="text-[11px] text-green-700">✓ الموظف أكّد الاستلام{it.confirmedByName ? ` (${it.confirmedByName})` : ""}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending && confirmingId === it.id}
                        onClick={() => submitConfirmReceipt(it.id)}
                        className="text-[11px] text-navy underline"
                      >
                        {pending && confirmingId === it.id ? "..." : "لسه محدش أكّد الاستلام - أكّده"}
                      </button>
                    )}
                  </div>

                  {remaining > 0 && (
                    <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-muted">↩️ رجوع للمخزن:</label>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          placeholder="0"
                          value={qty[it.id] || ""}
                          onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                          className="border rounded px-2 py-1 w-16 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => (sellItemId === it.id ? setSellItemId(null) : openSell(it, remaining))}
                        className={`text-[11px] rounded px-2.5 py-1 font-semibold ${sellItemId === it.id ? "bg-neutral-200 text-neutral-700" : "bg-gold text-white"}`}
                      >
                        {sellItemId === it.id ? "إلغاء البيع" : "🧾 بيع"}
                      </button>
                    </div>
                  )}

                  {/* نموذج البيع بيظهر هنا جوه كارت الصنف نفسه بالظبط - مش في مكان تاني منفصل - عشان
                      يبقى واضح إنه بيع للصنف ده بالتحديد، مفيش أي احتمال يتلخبط مع صنف تاني */}
                  {sellItemId === it.id && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
                      <div className="text-[11px] font-semibold">🧾 بيع "{it.productName}" لعميل - هيتعمل فاتورة تلقائي</div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">الكمية المباعة</label>
                          <input type="number" min={1} max={remaining} placeholder="0" value={sellQty} onChange={(e) => setSellQty(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">سعر البيع للعميل</label>
                          <input type="number" step="0.01" placeholder="سعر البيع" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
                        </div>
                        <select value={sellLocationId} onChange={(e) => setSellLocationId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
                          {locations.map((l: any) => <option key={l.id} value={l.id}>مكان الفاتورة: {l.name}</option>)}
                        </select>
                        <select value={sellPaymentMethodId} onChange={(e) => setSellPaymentMethodId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
                          {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <input placeholder="اسم العميل (اختياري)" value={sellCustomerName} onChange={(e) => setSellCustomerName(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                        <input placeholder="رقم هاتف العميل (اختياري)" value={sellCustomerPhone} onChange={(e) => setSellCustomerPhone(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                      </div>
                      {sellError && <div className="text-red-600 text-xs">{sellError}</div>}
                      <div className="flex gap-2">
                        <button disabled={pending} onClick={submitSell} className="bg-gold text-white rounded px-3 py-1.5 text-xs">
                          {pending ? "جارٍ الحفظ..." : "تأكيد تسجيل البيع"}
                        </button>
                        <button type="button" onClick={() => setSellItemId(null)} className="text-xs text-muted">إلغاء</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* زرار رجوع البضاعة واحد بس تحت كل الكروت - بيرجّع مرة واحدة كل الكميات اللي كتبتها في
              خانة "↩️ رجوع للمخزن" في أي عدد من الكروت فوق */}
          <div className="bg-neutral-50 border rounded-lg p-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-muted">هترجّع البضاعة فين؟</span>
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
    </div>
  );
}
