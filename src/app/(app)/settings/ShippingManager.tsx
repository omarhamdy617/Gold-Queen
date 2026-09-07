"use client";
import { useState, useTransition } from "react";
import { createCourier, createShippingCompany, deactivateCourier, deactivateShippingCompany } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";

export default function ShippingManager({ couriers, shippingCompanies }: { couriers: any[]; shippingCompanies: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [courierName, setCourierName] = useState("");
  const [courierPhone, setCourierPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [courierError, setCourierError] = useState("");
  const [companyError, setCompanyError] = useState("");

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">مناديب الشحن الداخلي</h2>
        <ul className="text-sm space-y-1">
          {couriers.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>• {c.name} {c.phone && <span className="text-muted">({c.phone})</span>}</span>
              <button
                onClick={() =>
                  start(async () => {
                    try {
                      await deactivateCourier(c.id);
                      router.refresh();
                    } catch (err: any) {
                      setCourierError(friendlyErrorMessage(err, "تعذر إيقاف المندوب - جرب تاني"));
                    }
                  })
                }
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
            setCourierError("");
            start(async () => {
              if (!courierName.trim()) return;
              try {
                await createCourier(courierName.trim(), courierPhone.trim() || undefined);
                setCourierName(""); setCourierPhone("");
                router.refresh();
              } catch (err: any) {
                setCourierError(friendlyErrorMessage(err, "تعذر إضافة المندوب - البيانات لسه موجودة، جرب تاني"));
              }
            });
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="اسم المندوب" className="border rounded px-3 py-2 text-sm flex-1 min-w-[120px]" />
          <input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} placeholder="رقم الهاتف" className="border rounded px-3 py-2 text-sm flex-1 min-w-[120px]" />
          <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm shrink-0">إضافة</button>
        </form>
        {courierError && <div className="text-red-600 text-xs">{courierError}</div>}
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">شركات الشحن الخارجية</h2>
        <ul className="text-sm space-y-1">
          {shippingCompanies.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>• {c.name} {c.phone && <span className="text-muted">({c.phone})</span>}</span>
              <button
                onClick={() =>
                  start(async () => {
                    try {
                      await deactivateShippingCompany(c.id);
                      router.refresh();
                    } catch (err: any) {
                      setCompanyError(friendlyErrorMessage(err, "تعذر إيقاف الشركة - جرب تاني"));
                    }
                  })
                }
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
            setCompanyError("");
            start(async () => {
              if (!companyName.trim()) return;
              try {
                await createShippingCompany(companyName.trim(), companyPhone.trim() || undefined);
                setCompanyName(""); setCompanyPhone("");
                router.refresh();
              } catch (err: any) {
                setCompanyError(friendlyErrorMessage(err, "تعذر إضافة الشركة - البيانات لسه موجودة، جرب تاني"));
              }
            });
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="اسم الشركة" className="border rounded px-3 py-2 text-sm flex-1 min-w-[120px]" />
          <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="رقم الهاتف" className="border rounded px-3 py-2 text-sm flex-1 min-w-[120px]" />
          <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm shrink-0">إضافة</button>
        </form>
        {companyError && <div className="text-red-600 text-xs">{companyError}</div>}
      </div>
    </div>
  );
}
