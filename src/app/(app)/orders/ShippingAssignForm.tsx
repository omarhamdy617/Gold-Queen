"use client";
import { useState, useTransition } from "react";
import { assignOrderShipping } from "@/actions/orders";
import { useRouter } from "next/navigation";

export default function ShippingAssignForm({ orderId, couriers, shippingCompanies }: { orderId: string; couriers: any[]; shippingCompanies: any[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [method, setMethod] = useState("INTERNAL_COURIER");
  const [courierId, setCourierId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState("");

  if (!open) return <button onClick={() => setOpen(true)} className="text-xs bg-primary text-white rounded px-2 py-1">تحديد الشحن</button>;

  function submit() {
    setError("");
    if (method === "INTERNAL_COURIER" && !courierId) return setError("اختر المندوب");
    if (method === "EXTERNAL_COMPANY" && !companyId) return setError("اختر شركة الشحن");
    start(async () => {
      try {
        await assignOrderShipping(orderId, {
          shippingMethod: method as any,
          courierId: method === "INTERNAL_COURIER" ? courierId : undefined,
          shippingCompanyId: method === "EXTERNAL_COMPANY" ? companyId : undefined,
        });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 bg-neutral-50 border rounded p-2">
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="border rounded px-2 py-1 text-xs">
        <option value="INTERNAL_COURIER">مندوب داخلي</option>
        <option value="EXTERNAL_COMPANY">شركة شحن خارجية</option>
        <option value="OTHER">أخرى</option>
      </select>
      {method === "INTERNAL_COURIER" && (
        <select value={courierId} onChange={(e) => setCourierId(e.target.value)} className="border rounded px-2 py-1 text-xs">
          <option value="">اختر المندوب</option>
          {couriers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ""}</option>)}
        </select>
      )}
      {method === "EXTERNAL_COMPANY" && (
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="border rounded px-2 py-1 text-xs">
          <option value="">اختر الشركة</option>
          {shippingCompanies.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ""}</option>)}
        </select>
      )}
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <div className="flex gap-1">
        <button disabled={pending} onClick={submit} className="text-xs bg-primary text-white rounded px-2 py-1 flex-1">تأكيد</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">إلغاء</button>
      </div>
    </div>
  );
}
