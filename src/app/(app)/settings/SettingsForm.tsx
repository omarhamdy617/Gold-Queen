"use client";
import { useState, useTransition } from "react";
import { updateSettings } from "@/actions/settings";

export default function SettingsForm({ settings }: { settings: any }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    companyName: settings?.companyName || "جولد كوين",
    companyAddress: settings?.companyAddress || "",
    companyPhone: settings?.companyPhone || "",
    companyPhone2: settings?.companyPhone2 || "",
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
            companyAddress: form.companyAddress,
            companyPhone: form.companyPhone,
            companyPhone2: form.companyPhone2,
            defaultVatRate: parseFloat(form.defaultVatRate),
            largeInvoiceAlert: parseFloat(form.largeInvoiceAlert),
            adminWhatsapp: form.adminWhatsapp,
          });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        });
      }}
      className="app-card p-4 space-y-3"
    >
      <div className="text-xs font-semibold text-muted uppercase tracking-wide">بيانات الشركة (بتظهر على الفواتير وعروض الأسعار)</div>
      <div>
        <label className="text-xs text-muted">اسم الشركة</label>
        <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted">العنوان</label>
        <input value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" placeholder="مثال: القاهرة - شارع..." />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">رقم الهاتف 1</label>
          <input value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted">رقم الهاتف 2 (اختياري)</label>
          <input value={form.companyPhone2} onChange={(e) => setForm({ ...form, companyPhone2: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
        </div>
      </div>

      <div className="text-xs font-semibold text-muted uppercase tracking-wide pt-2">إعدادات عامة</div>
      <div>
        <label className="text-xs text-muted">نسبة ضريبة القيمة المضافة الافتراضية (%) - لعروض الأسعار فقط</label>
        <input type="number" value={form.defaultVatRate} onChange={(e) => setForm({ ...form, defaultVatRate: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted">حد تنبيه الفاتورة الكبيرة (ج.م)</label>
        <input type="number" value={form.largeInvoiceAlert} onChange={(e) => setForm({ ...form, largeInvoiceAlert: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted">رقم واتساب الأدمن للتنبيهات</label>
        <input value={form.adminWhatsapp} onChange={(e) => setForm({ ...form, adminWhatsapp: e.target.value })} className="border rounded px-3 py-2 text-sm w-full mt-1" placeholder="مثال: 201001234567" />
      </div>
      <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">{saved ? "تم الحفظ ✓" : "حفظ الإعدادات"}</button>
    </form>
  );
}
