"use client";
import { useState, useTransition } from "react";
import { updateOrderStatus, confirmOrder, cancelOrder, logOrderAttempt } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";
import { ORDER_STATUS_TRANSITIONS, ORDER_STATUS_LABELS as LABELS, ORDER_STATUS_COLORS as COLORS, ORDER_ATTEMPT_RESULT_LABELS } from "@/lib/orderStatus";

export default function StatusControl({
  orderId,
  status,
  canEdit = true,
  canConfirm = false,
  customerPhone,
  paymentMethods = [],
  confirmationAttempts = 0,
}: {
  orderId: string;
  status: string;
  canEdit?: boolean;
  canConfirm?: boolean;
  customerPhone?: string;
  paymentMethods?: { id: string; name: string }[];
  confirmationAttempts?: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<"PENDING" | "COLLECTED">("COLLECTED");
  const [collectedAmount, setCollectedAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [attemptResult, setAttemptResult] = useState("NO_ANSWER");
  const [attemptNote, setAttemptNote] = useState("");
  const [mode, setMode] = useState<"" | "CANCEL" | "ATTEMPT">("");
  const [error, setError] = useState("");

  const badge = <span className={`text-xs rounded px-2 py-1 ${COLORS[status]}`}>{LABELS[status]}</span>;

  if (!canEdit && !canConfirm) return badge;

  function run(action: () => Promise<any>) {
    setError("");
    start(async () => {
      try {
        const result = await action();
        if (isActionError(result)) { setError(result.error); return; }
        setMode("");
        setPendingStatus(null);
        router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تنفيذ العملية"));
      }
    });
  }

  // -------------------- في الانتظار: تأكيد / تسجيل محاولة اتصال / إلغاء --------------------
  if (status === "PENDING") {
    if (mode === "CANCEL") {
      return (
        <div className="bg-neutral-50 border rounded-lg p-2 space-y-2 min-w-[220px]">
          <div className="text-xs font-semibold">سبب الإلغاء؟</div>
          <input placeholder="اكتب السبب" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
          {error && <div className="text-red-600 text-[11px]">{error}</div>}
          <div className="flex gap-1">
            <button disabled={pending || !cancelReason.trim()} onClick={() => run(() => cancelOrder(orderId, cancelReason))} className="bg-red-600 text-white text-xs rounded px-2 py-1">تأكيد الإلغاء</button>
            <button onClick={() => { setMode(""); setError(""); }} className="text-xs text-muted">رجوع</button>
          </div>
        </div>
      );
    }
    if (mode === "ATTEMPT") {
      return (
        <div className="bg-neutral-50 border rounded-lg p-2 space-y-2 min-w-[220px]">
          <div className="text-xs font-semibold">نتيجة المحاولة؟</div>
          <select value={attemptResult} onChange={(e) => setAttemptResult(e.target.value)} className="border rounded px-2 py-1 text-xs w-full">
            {Object.entries(ORDER_ATTEMPT_RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="ملاحظة (اختياري)" value={attemptNote} onChange={(e) => setAttemptNote(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
          {error && <div className="text-red-600 text-[11px]">{error}</div>}
          <div className="flex gap-1">
            <button disabled={pending} onClick={() => run(() => logOrderAttempt(orderId, attemptResult as any, attemptNote))} className="bg-navy text-white text-xs rounded px-2 py-1">حفظ</button>
            <button onClick={() => { setMode(""); setError(""); }} className="text-xs text-muted">رجوع</button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1 min-w-[170px]">
        <div className="flex items-center gap-1 flex-wrap">
          {badge}
          {confirmationAttempts > 0 && <span className="text-[10px] text-muted">({confirmationAttempts} محاولة)</span>}
        </div>
        {canConfirm && (
          <div className="flex gap-1 flex-wrap">
            <button disabled={pending} onClick={() => run(() => confirmOrder(orderId))} className="bg-primary text-white text-xs rounded px-2 py-1">تأكيد</button>
            <button disabled={pending} onClick={() => setMode("ATTEMPT")} className="bg-neutral-200 text-xs rounded px-2 py-1">محاولة اتصال</button>
            <button disabled={pending} onClick={() => setMode("CANCEL")} className="text-red-600 text-xs rounded px-2 py-1 border border-red-300">إلغاء</button>
          </div>
        )}
        {error && <div className="text-red-600 text-[11px]">{error}</div>}
      </div>
    );
  }

  // -------------------- تم التأكيد / قيد التجهيز: يقدر يلغي لحد ما يتشحن --------------------
  if (status === "CONFIRMED" || status === "PREPARING") {
    if (mode === "CANCEL") {
      return (
        <div className="bg-neutral-50 border rounded-lg p-2 space-y-2 min-w-[220px]">
          <div className="text-xs font-semibold">سبب الإلغاء؟</div>
          <input placeholder="اكتب السبب" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
          {status === "PREPARING" && <div className="text-[11px] text-muted">هيتم إرجاع الكمية المحجوزة للمخزون تلقائيًا</div>}
          {error && <div className="text-red-600 text-[11px]">{error}</div>}
          <div className="flex gap-1">
            <button disabled={pending || !cancelReason.trim()} onClick={() => run(() => cancelOrder(orderId, cancelReason))} className="bg-red-600 text-white text-xs rounded px-2 py-1">تأكيد الإلغاء</button>
            <button onClick={() => { setMode(""); setError(""); }} className="text-xs text-muted">رجوع</button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        {badge}
        {canEdit && (
          <button disabled={pending} onClick={() => setMode("CANCEL")} className="text-red-600 text-[11px] underline w-fit">إلغاء الأوردر</button>
        )}
        {error && <div className="text-red-600 text-[11px]">{error}</div>}
      </div>
    );
  }

  if (!canEdit) return badge;

  // -------------------- في الشحن / تم التسليم: نفس منطق التسليم/الإرجاع القديم --------------------
  const allowedOptions = [status, ...(ORDER_STATUS_TRANSITIONS[status] || [])];

  function onChange(newStatus: string) {
    setError("");
    if (newStatus === status) return;
    if (newStatus === "DELIVERED" || newStatus === "RETURNED") {
      setPendingStatus(newStatus);
      return;
    }
  }

  function confirmSpecial() {
    setError("");
    if (pendingStatus === "DELIVERED") {
      const digits = confirmPhone.replace(/\D/g, "");
      if (digits.length !== 11) return setError("رقم تأكيد العميل لازم يبقى 11 رقم بالظبط");
      if (customerPhone && digits !== customerPhone.replace(/\D/g, "")) return setError("رقم الهاتف اللي كتبته مش مطابق لرقم العميل المسجل في الأوردر");
      if (collectionStatus === "COLLECTED" && (!collectedAmount || parseFloat(collectedAmount) < 0)) {
        return setError("أدخل المبلغ المحصّل (سعر الأوردر)");
      }
      if (collectionStatus === "COLLECTED" && parseFloat(collectedAmount) > 0 && !paymentMethodId) {
        return setError("اختار طريقة التحصيل عشان المبلغ يدخل الخزينة");
      }
      run(() =>
        updateOrderStatus(orderId, "DELIVERED", {
          collectionStatus,
          collectedAmount: collectionStatus === "COLLECTED" ? parseFloat(collectedAmount) : undefined,
          paymentMethodId: collectionStatus === "COLLECTED" ? paymentMethodId : undefined,
        })
      );
    } else if (pendingStatus === "RETURNED") {
      if (!returnReason.trim()) return setError("لازم تكتب سبب الإرجاع");
      run(() => updateOrderStatus(orderId, "RETURNED", { returnReason }));
    }
  }

  if (pendingStatus) {
    return (
      <div className="bg-neutral-50 border rounded-lg p-2 space-y-2 min-w-[220px]">
        {pendingStatus === "DELIVERED" && (
          <>
            <div className="text-xs font-semibold">تأكيد رقم هاتف العميل (11 رقم)</div>
            <input
              maxLength={11}
              placeholder="01xxxxxxxxx"
              value={confirmPhone}
              onChange={(e) => setConfirmPhone(e.target.value.replace(/\D/g, ""))}
              className="border rounded px-2 py-1 text-xs w-full"
            />
            <div className="text-xs font-semibold">حالة التحصيل؟</div>
            <select value={collectionStatus} onChange={(e) => setCollectionStatus(e.target.value as any)} className="border rounded px-2 py-1 text-xs w-full">
              <option value="COLLECTED">تم التحصيل</option>
              <option value="PENDING">لسه ما اتحصلش</option>
            </select>
            {collectionStatus === "COLLECTED" && (
              <>
                <input type="number" step="0.01" placeholder="سعر الأوردر (المبلغ المحصّل)" value={collectedAmount} onChange={(e) => setCollectedAmount(e.target.value)} className="border rounded px-2 py-1 text-xs w-full" />
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-2 py-1 text-xs w-full">
                  <option value="">اختار طريقة التحصيل</option>
                  {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </>
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
    <div>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={`text-xs rounded px-2 py-1 border-0 ${COLORS[status]}`}
      >
        {allowedOptions.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
      </select>
      {error && <div className="text-red-600 text-[11px]">{error}</div>}
    </div>
  );
}
