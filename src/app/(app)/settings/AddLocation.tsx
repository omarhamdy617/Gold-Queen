"use client";
import { useState, useTransition } from "react";
import { createLocation } from "@/actions/products";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function AddLocation() {
  const [name, setName] = useState("");
  const [type, setType] = useState<"SHOP" | "WAREHOUSE" | "OTHER">("SHOP");
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
            const r = await createLocation(name, type);
            if (isActionError(r)) { setError(r.error); return; }
            setName("");
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر إضافة المكان"));
          }
        });
      }}
      className="space-y-1"
    >
      <div className="flex gap-2">
        <input placeholder="اسم الفرع/المكان" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="border rounded px-3 py-2 text-sm">
          <option value="SHOP">محل</option>
          <option value="WAREHOUSE">مخزن</option>
          <option value="OTHER">أخرى</option>
        </select>
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </form>
  );
}
