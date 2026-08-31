"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePurchase } from "@/actions/purchases";

export default function DeletePurchaseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function onClick() {
    if (!confirm("هتمسح فاتورة الشراء دي؟ هيتم عكس أثرها: هينقص المخزون بنفس الكمية، وهيتعدل رصيد المورد والخزينة تلقائي. الإجراء ده مينفعش يترجع.")) return;
    setError("");
    start(async () => {
      try {
        await deletePurchase(id);
        router.push("/purchases");
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ أثناء حذف الفاتورة");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button disabled={pending} onClick={onClick} className="text-red-600 text-sm border border-red-200 rounded-lg px-4 py-2 hover:bg-red-50">
        حذف الفاتورة
      </button>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </div>
  );
}
