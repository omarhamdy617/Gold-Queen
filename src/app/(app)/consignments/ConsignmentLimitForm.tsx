"use client";
import { useState, useTransition } from "react";
import { setConsignmentLimit } from "@/actions/consignments";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function ConsignmentLimitForm({ consignmentId, currentLimit }: { consignmentId: string; currentLimit: string | number | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentLimit !== null && currentLimit !== undefined ? String(currentLimit) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[10px] text-muted underline">
        {currentLimit !== null && currentLimit !== undefined ? "تعديل الحد الأقصى" : "تحديد حد أقصى للعهدة"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.01"
        placeholder="بدون حد"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-2 py-1 text-xs w-24"
      />
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const r = await setConsignmentLimit(consignmentId, value.trim() ? parseFloat(value) : null);
              if (isActionError(r)) { setError(r.error); return; }
              setOpen(false);
              router.refresh();
            } catch (e: any) {
              setError(friendlyErrorMessage(e, "تعذر حفظ الحد الأقصى"));
            }
          })
        }
        className="bg-navy text-white text-[10px] rounded px-2 py-1"
      >
        حفظ
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-muted">إلغاء</button>
      {error && <span className="text-red-600 text-[10px]">{error}</span>}
    </div>
  );
}
