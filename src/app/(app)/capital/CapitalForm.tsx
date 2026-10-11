"use client";
import { useState, useTransition } from "react";
import { recordCapitalMovement } from "@/actions/capital";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";
import { money } from "@/lib/format";

type Drawer = { paymentMethodId: string; name: string; balance: string | null };

export default function CapitalForm({ drawers }: { drawers: Drawer[] }) {
  const [kind, setKind] = useState<"CAPITAL_IN" | "OWNER_DRAW">("OWNER_DRAW");
  const [paymentMethodId, setPaymentMethodId] = useState(drawers[0]?.paymentMethodId || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const isDraw = kind === "OWNER_DRAW";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setDone("");
        start(async () => {
          try {
            const r = await recordCapitalMovement({ kind, paymentMethodId, amount: parseFloat(amount), note });
            if (isActionError(r)) {
              setError(r.error);
              return;
            }
            setDone(isDraw ? "اتسجل السحب واتخصم من الخزينة." : "اتسجل رأس المال ودخل الخزينة.");
            setAmount("");
            setNote("");
            router.refresh();
          } catch (err: any) {
            setError(friendlyErrorMessage(err, "تعذر تسجيل الحركة"));
          }
        });
      }}
      className="app-card p-4 space-y-3"
    >
      <div className="flex gap-2" role="radiogroup" aria-label="نوع الحركة">
        {(
          [
            ["OWNER_DRAW", "سحب لنفسي (مسحوبات)"],
            ["CAPITAL_IN", "إيداع رأس مال"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-lg px-4 py-2 text-sm border ${kind === k ? "bg-gold text-white border-gold" : "border-border"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted block mb-0.5">{isDraw ? "سحبت من خزينة" : "دخلت خزينة"}</label>
          <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            {drawers.map((d) => (
              <option key={d.paymentMethodId} value={d.paymentMethodId}>
                {d.name} - رصيدها {money(d.balance || 0)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-0.5">المبلغ</label>
          <input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-0.5">ملاحظة (اختياري)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isDraw ? "مثلًا: مسحوبات شهر أكتوبر" : "مثلًا: رأس مال افتتاحي"} className="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <button disabled={pending || !paymentMethodId} className="bg-gold text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
          {isDraw ? "تسجيل السحب" : "تسجيل رأس المال"}
        </button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
      {done && <div className="text-green-700 text-xs">{done}</div>}
    </form>
  );
}
