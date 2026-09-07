"use client";
import { useState, useTransition } from "react";
import { createPaymentMethodWithDrawer } from "@/actions/cash";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";

export default function AddPaymentMethod() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="space-y-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            if (!name) return;
            try {
              await createPaymentMethodWithDrawer(name);
              setName("");
              router.refresh();
            } catch (err: any) {
              setError(friendlyErrorMessage(err, "تعذر إضافة طريقة الدفع - الاسم لسه موجود، جرب تاني"));
            }
          });
        }}
        className="flex gap-2"
      >
        <input placeholder="اسم طريقة الدفع الجديدة" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </form>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </div>
  );
}
