"use client";
import { useState, useTransition } from "react";
import { approveReturn, rejectReturn } from "@/actions/returns";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";
import { money } from "@/lib/format";

export default function ApproveControls({
  id,
  locations,
  paymentMethods,
  totalAmount,
  kind,
}: {
  id: string;
  locations: any[];
  paymentMethods: any[];
  totalAmount: number | string;
  kind: "SALE_RETURN" | "PURCHASE_RETURN";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [pmId, setPmId] = useState(paymentMethods[0]?.id || "");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const total = Number(totalAmount) || 0;
  // قد إيه من قيمة المرتجع هيترد نقدي دلوقتي - افتراضيًا المبلغ بالكامل (زي السلوك القديم لأشهر
  // سيناريو: عميل واقف قدامك رجّع منتج وعايز فلوسه كاش). أي جزء متبقي بيتخصم من الرصيد بدل الكاش،
  // من غير ما الاتنين يحصلوا مع بعض بكامل القيمة زي ما كان بيحصل قبل كده.
  const [cashAmount, setCashAmount] = useState(String(total));
  const cash = Math.min(Math.max(parseFloat(cashAmount) || 0, 0), total);
  const balancePortion = total - cash;
  const balanceLabel = kind === "SALE_RETURN" ? "رصيد العميل" : "رصيد المورد";

  return (
    <div className="flex flex-col items-end gap-1">
      {!expanded ? (
        <button onClick={() => setExpanded(true)} className="bg-green-600 text-white text-xs rounded px-2 py-1">
          اعتماد
        </button>
      ) : (
        <div className="flex flex-col items-end gap-1 bg-neutral-50 border rounded p-2">
          <div className="text-[11px] text-muted">قيمة المرتجع: {money(total)}</div>
          <div className="flex items-center gap-1">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded text-xs px-1 py-1">
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input
              type="number"
              min={0}
              max={total}
              step="0.01"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              className="border rounded text-xs px-1 py-1 w-20"
              title="المبلغ اللي هيترد نقدي دلوقتي"
            />
            {cash > 0 && (
              <select value={pmId} onChange={(e) => setPmId(e.target.value)} className="border rounded text-xs px-1 py-1">
                {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <div className="text-[11px] text-muted">
            نقدي: {money(cash)} {balancePortion > 0 && <>+ يتخصم من {balanceLabel}: {money(balancePortion)}</>}
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={pending}
              onClick={() => {
                setError("");
                start(async () => {
                  try {
                    const r = await approveReturn(id, locationId, cash > 0 ? pmId : undefined, cash);
                    if (isActionError(r)) { setError(r.error); return; }
                    router.refresh();
                  } catch (err: any) {
                    setError(friendlyErrorMessage(err, "تعذر اعتماد المرتجع - جرب تاني"));
                  }
                });
              }}
              className="bg-green-600 text-white text-xs rounded px-2 py-1"
            >
              تأكيد الاعتماد
            </button>
            <button onClick={() => setExpanded(false)} className="text-muted text-xs">إلغاء</button>
          </div>
        </div>
      )}
      <button
        disabled={pending}
        onClick={() => {
          setError("");
          start(async () => {
            try {
              const r = await rejectReturn(id);
              if (isActionError(r)) { setError(r.error); return; }
              router.refresh();
            } catch (err: any) {
              setError(friendlyErrorMessage(err, "تعذر رفض المرتجع - جرب تاني"));
            }
          });
        }}
        className="bg-red-600 text-white text-xs rounded px-2 py-1"
      >
        رفض
      </button>
      {error && <div className="text-red-600 text-[11px]">{error}</div>}
    </div>
  );
}
