"use client";
import { useState, useTransition } from "react";
import { revertOrderStatus } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

export default function RevertStatusButton({ orderId, previousStatusLabel }: { orderId: string; previousStatusLabel: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function run() {
    const ok = confirm(
      `هيرجّع الأوردر لحالة "${previousStatusLabel}" (الحالة اللي كان عليها قبل آخر تحديث)، ويرجّع معاه أي أثر جانبي حصل وقتها (مخزون محجوز/فاتورة/تحصيل). متأكد؟`
    );
    if (!ok) return;
    setError("");
    start(async () => {
      try {
        const result = await revertOrderStatus(orderId);
        if (isActionError(result)) { setError(result.error); return; }
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر التراجع عن آخر تحديث للأوردر"));
      }
    });
  }

  return (
    <div className="no-print">
      <button disabled={pending} onClick={run} className="bg-red-700 text-white rounded-lg px-4 py-2 text-sm">
        {pending ? "جارٍ التراجع..." : `⟲ تراجع عن آخر تحديث (رجوع لـ"${previousStatusLabel}")`}
      </button>
      {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
    </div>
  );
}
