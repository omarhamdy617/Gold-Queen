"use client";
import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/actions/orders";
import { useRouter } from "next/navigation";

const LABELS: Record<string, string> = { PREPARING: "قيد التجهيز", SHIPPED: "في الشحن", DELIVERED: "تم التسليم", RETURNED: "مرتجع" };
const COLORS: Record<string, string> = { PREPARING: "bg-neutral-200", SHIPPED: "bg-blue-200", DELIVERED: "bg-green-200", RETURNED: "bg-red-200" };

export default function StatusControl({ orderId, status, canEdit = true }: { orderId: string; status: string; canEdit?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<"PENDING" | "COLLECTED">("COLLECTED");
  const [collectedAmount, setCollectedAmount] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState("");

  if (!canEdit) {
    return <span className={`text-xs rounded px-2 py-1 ${COLORS[status]}`}>{LABELS[status]}</span>;
  }

  function onChange(newStatus: string) {
    setError("");
    if (newStatus === "DELIVERED" || newStatus === "RETURNED") {
      setPendingStatus(newStatus);
      return;
    }
    start(async () => {
      await updateOrderStatus(orderId, newStatus as any);
      router.refresh();
    });
  }

  function confirmSpecial() {
    setError("");
    if (pendingStatus === "DELIVERED") {
      if (collectionStatus === "COLLECTED" && (!collectedAmount || parseFloat(collectedAmount) < 0)) {
        return setError("أدخل المبلغ المحصّل");
      }
      start(async () => {
        try {
          await updateOrderStatus(orderId, "DELIVERED", {
            collectionStatus,
            collectedAmount: collectionStatus === "COLLECTED" ? parseFloat(collectedAmount) : undefined,
          });
          setPendingStatus(null);
          router.refresh();
        } catch (e: any) {
          setError(e?.message || "حصل خطأ");
        }
      });
    } else if (pendingStatus === "RETURNED") {
      if (!returnReason.trim()) return setError("لازم تكتب سبب الإرجاع");
      start(async () => {
        try {
          await updateOrderStatus(orderId, "RETURNED", { returnReason });
          setPendingStatus(null);
          router.refresh();
        } catch (e: any) {
          setError(e?.message || "حصل خطأ");
        }
      });
    }
  }

  if (pendingStatus) {
    return (
      <div className="bg-neutral-50 border rounded-lg p-2 space-y-2 min-w-[200px]">
        {pendingStatus === "DELIVERED" && (
          <>
            <div className="text-xs font-semibold">حالة التحصيل؟</div>
            <select value={collectionStatus} onChange={(e) => setCollectionStatus(e.target.value as any)} className="border rounded px-2 py-1 text-xs w-full">
              <option value="COLLECTED">تم التحصيل</option>
              <option value="PENDING">لسه ما اتحصلش</option>
            </select>
            {collectionStatus === "COLLECTED" && (
              <input type="number" step="0.01" placeholder="المبلغ المحصّل" value={collectedAmount} onChange={(e) => setCollectedAmount(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
            )}
          </>
        )}
        {pendingStatus === "RETURNED" && (
          <>
            <div className="text-xs font-semibold">سبب الإرجاع؟</div>
            <input placeholder="اكتب السبب" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
            <div className="text-[11px] text-muted">هيتم إرجاع الأصناف للمخزون تلقائيًا</div>
          </>
        )}
        {error && <div className="text-red-600 text-[11px]">{error}</div>}
        <div className="flex gap-1">
          <button disabled={pending} onClick={confirmSpecial} className="bg-primary text-white text-xs rounded px-2 py-1">تأكيد</button>
          <button onClick={() => setPendingStatus(null)} className="text-xs text-muted">إلغاء</button>
        </div>
      </div>
    );
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className={`text-xs rounded px-2 py-1 border-0 ${COLORS[status]}`}
    >
      {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
