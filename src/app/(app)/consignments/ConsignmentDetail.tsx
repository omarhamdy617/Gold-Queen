"use client";
import { useEffect, useState, useTransition } from "react";
import { getConsignmentItems, returnConsignmentItems } from "@/actions/consignments";
import { useRouter } from "next/navigation";

type Item = { id: string; productId: string; quantity: number; unitPrice: string; returnedQty: number; productName: string };

export default function ConsignmentDetail({ consignmentId, locations }: { consignmentId: string; locations: any[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open && !items) {
      getConsignmentItems(consignmentId).then(setItems as any);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitReturn() {
    setError("");
    const toReturn = Object.entries(qty)
      .map(([itemId, q]) => ({ itemId, quantity: parseInt(q) || 0 }))
      .filter((i) => i.quantity > 0);
    if (toReturn.length === 0) return setError("اكتب كمية عشان ترجعها في صنف واحد على الأقل");
    if (!locationId) return setError("اختار المكان اللي هترجع له البضاعة");
    start(async () => {
      try {
        await returnConsignmentItems({ consignmentId, locationId, items: toReturn });
        setQty({});
        const fresh = await getConsignmentItems(consignmentId);
        setItems(fresh as any);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        تفاصيل البضاعة / تسجيل رجوع
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
              <tr><th className="py-1">المنتج</th><th>الكمية اللي معاه</th><th>المتبقي فعليًا</th><th>كمية الرجوع</th></tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const remaining = it.quantity - it.returnedQty;
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5">{it.productName}</td>
                    <td>{it.quantity}</td>
                    <td className={remaining === 0 ? "text-muted" : "font-bold"}>{remaining}</td>
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
    </div>
  );
}
