"use client";
import { useState, useTransition } from "react";
import { createOrderSource } from "@/actions/orderSources";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function AddOrderSource() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          if (!name) return;
          try {
            const r = await createOrderSource(name);
            if (isActionError(r)) { setError(r.error); return; }
            setName("");
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر إضافة المصدر"));
          }
        });
      }}
      className="space-y-1"
    >
      <div className="flex gap-2">
        <input placeholder="اسم مصدر جديد (مثال: تيك توك)" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </form>
  );
}
