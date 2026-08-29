"use client";
import { useState, useTransition } from "react";
import { updateSettings } from "@/actions/settings";

export default function SettingsForm({ settings }: { settings: any }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    companyName: settings?.companyName || "جولد كوين",
    defaultVatRate: settings?.defaultVatRate || "14",
    largeInvoiceAlert: settings?.largeInvoiceAlert || "10000",
    adminWhatsapp: settings?.adminWhatsapp || "",
  });
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await updateSettings({
            companyName: form.companyName,
            defaultVatRate: parseFloat(form.defaultVatRate),
            largeInvoiceAlert: parseFloat(form.largeInvoiceAlert),
            adminWhatsapp: form.adminWhatsapp,
          });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        });
      }}
      className="bg-white rounded-xl shadow p-4 space-y-3"
    >
      <div>
        <label className="text-xs text-neutral-500">اسم الشركة</label>
        <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-neutral-500">نسبة ضريبة القيمة المضافة الافتراضية (%) - لعروض الأسعار فقط</label>
        <input type="number" value={form.defaultVatRate} onChange={(e) => setForm({ ...form, defaultVatRate: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-neutral-500">حد تنبيه الفاتورة الكبيرة (ج.م)</label>
        <input type="number" value={form.largeInvoiceAlert} onChange={(e) => setForm({ ...form, largeInvoiceAlert: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-neutral-500">رقم واتساب الأدمن للتنبيهات</label>
        <input value={form.adminWhatsapp} onChange={(e) => setForm({ ...form, adminWhatsapp: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" placeholder="مثال: 201001234567" />
      </div>
      <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">{saved ? "تم الحفظ ✓" : "حفظ الإعدادات"}</button>
    </form>
  );
}
