"use client";
import { useTransition } from "react";
import { deleteSalesInvoice } from "@/actions/sales";
import { useRouter } from "next/navigation";

export default function DeleteInvoiceButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("متأكد إنك عايز تمسح الفاتورة دي؟ هيرجع المخزون ورصيد العميل والخزينة زي ما كانوا قبلها.")) return;
        start(async () => {
          try {
            await deleteSalesInvoice(id);
            router.push("/sales");
            router.refresh();
          } catch (e: any) {
            alert(e?.message || "حصل خطأ أثناء الحذف");
          }
        });
      }}
      className="text-xs bg-red-600 text-white rounded px-3 py-1.5"
    >
      حذف الفاتورة
    </button>
  );
}
