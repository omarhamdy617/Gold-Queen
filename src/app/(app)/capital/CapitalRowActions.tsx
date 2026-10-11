"use client";
import { useTransition } from "react";
import { deleteCapitalMovement } from "@/actions/capital";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";

export default function CapitalRowActions({ id, kind }: { id: string; kind: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const isDraw = kind === "OWNER_DRAW";

  return (
    <button
      disabled={pending}
      onClick={() => {
        const msg = isDraw
          ? "هتمسح السحب ده؟ المبلغ هيرجع للخزينة تلقائيًا."
          : "هتمسح إيداع رأس المال ده؟ المبلغ هيتخصم من الخزينة تلقائيًا.";
        if (!confirm(msg)) return;
        start(async () => {
          const r = await deleteCapitalMovement(id);
          if (isActionError(r)) {
            alert(r.error);
            return;
          }
          router.refresh();
        });
      }}
      className="text-xs text-red-600 disabled:opacity-50"
    >
      حذف
    </button>
  );
}
