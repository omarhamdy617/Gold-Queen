"use client";
import { useState, useTransition } from "react";
import { createPaymentMethodWithDrawer } from "@/actions/cash";
import { useRouter } from "next/navigation";

export default function AddPaymentMethod() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { if (name) { await createPaymentMethodWithDrawer(name); setName(""); router.refresh(); } }); }} className="flex gap-2">
      <input placeholder="اسم طريقة الدفع الجديدة" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
      <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
    </form>
  );
}
