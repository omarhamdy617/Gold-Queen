"use client";
import { useState, useTransition } from "react";
import { createCourier, createShippingCompany, deactivateCourier, deactivateShippingCompany } from "@/actions/orders";
import { useRouter } from "next/navigation";

export default function ShippingManager({ couriers, shippingCompanies }: { couriers: any[]; shippingCompanies: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [courierName, setCourierName] = useState("");
  const [courierPhone, setCourierPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">مناديب الشحن الداخلي</h2>
        <ul className="text-sm space-y-1">
          {couriers.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>• {c.name} {c.phone && <span className="text-muted">({c.phone})</span>}</span>
              <button
                onClick={() => start(async () => { await deactivateCourier(c.id); router.refresh(); })}
                className="text-xs text-red-500"
              >
                إيقاف
              </button>
            </li>
          ))}
          {couriers.length === 0 && <li className="text-muted">مفيش مناديب مسجلين لسه</li>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (!courierName.trim()) return;
              await createCourier(courierName.trim(), courierPhone.trim() || undefined);
              setCourierName(""); setCourierPhone("");
              router.refresh();
            });
          }}
          className="flex gap-2"
        >
          <input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="اسم المندوب" className="border rounded px-3 py-2 text-sm flex-1" />
          <input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} placeholder="رقم الهاتف" className="border rounded px-3 py-2 text-sm flex-1" />
          <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
        </form>
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">شركات الشحن الخارجية</h2>
        <ul className="text-sm space-y-1">
          {shippingCompanies.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>• {c.name} {c.phone && <span className="text-muted">({c.phone})</span>}</span>
              <button
                onClick={() => start(async () => { await deactivateShippingCompany(c.id); router.refresh(); })}
                className="text-xs text-red-500"
              >
                إيقاف
              </button>
            </li>
          ))}
          {shippingCompanies.length === 0 && <li className="text-muted">مفيش شركات مسجلة لسه</li>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (!companyName.trim()) return;
              await createShippingCompany(companyName.trim(), companyPhone.trim() || undefined);
              setCompanyName(""); setCompanyPhone("");
              router.refresh();
            });
          }}
          className="flex gap-2"
        >
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="اسم الشركة" className="border rounded px-3 py-2 text-sm flex-1" />
          <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="رقم الهاتف" className="border rounded px-3 py-2 text-sm flex-1" />
          <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
        </form>
      </div>
    </div>
  );
}
