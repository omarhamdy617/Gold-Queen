"use client";
import { useState, useTransition } from "react";
import { getCashTransaction } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  SALE_IN: "تحصيل بيع",
  PURCHASE_OUT: "دفع مشتريات",
  EXPENSE_OUT: "مصروف",
  COLLECTION_IN: "تحصيل من تاجر",
  PAYMENT_OUT: "دفع لمورد",
  RETURN_OUT: "استرداد للعميل",
  RETURN_IN: "استرداد من مورد",
  ADJUSTMENT: "تسوية يدوية",
  TRANSFER_IN: "تحويل داخل",
  TRANSFER_OUT: "تحويل خارج",
};

export default function TransactionDetail({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<any>(null);

  function openDetail() {
    setOpen(true);
    if (!detail) start(async () => setDetail(await getCashTransaction(id)));
  }

  return (
    <>
      <button onClick={openDetail} className="text-primary underline text-right">{label}</button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="app-card p-4 space-y-2 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">تفاصيل الحركة</h2>
            {pending && !detail && <div className="text-sm text-muted">جاري التحميل...</div>}
            {detail && (
              <div className="text-sm space-y-1">
                <div><span className="text-muted">النوع: </span>{TYPE_LABELS[detail.type] || detail.type}</div>
                <div><span className="text-muted">الخزينة: </span>{detail.drawerName}</div>
                <div><span className="text-muted">المبلغ: </span>{money(detail.amount)}</div>
                <div><span className="text-muted">الرصيد بعدها: </span>{money(detail.balanceAfter)}</div>
                <div><span className="text-muted">التاريخ: </span>{dateAr(detail.createdAt)}</div>
                <div><span className="text-muted">اللي عملها: </span>{detail.createdByName || "-"}</div>
                {detail.note && <div><span className="text-muted">ملاحظة: </span>{detail.note}</div>}
                {detail.refType && <div><span className="text-muted">مرتبطة بـ: </span>{detail.refType}</div>}
              </div>
            )}
            <button onClick={() => setOpen(false)} className="text-muted text-sm pt-2">إغلاق</button>
          </div>
        </div>
      )}
    </>
  );
}
