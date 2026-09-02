"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type SimpleCustomer = {
  id: string;
  name: string;
  phone: string | null;
  type: "RETAIL" | "TRADER";
};

export type SimpleCustomerValue = {
  customerId: string; // فاضي = مفيش عميل متطابق - هيتسجل عميل جديد تلقائي وقت الحفظ لو الاسم أو الرقم مكتوبين
  name: string;
  phone: string;
  type: "RETAIL" | "TRADER";
};

// خانة عميل مبسطة: اسم + رقم هاتف جنب بعض. وانت بتكتب رقم الهاتف، بتظهرلك تحته
// اقتراحات بأسماء وأرقام عملاء متسجلين قبل كده بنفس الأرقام دي - دوس على أي واحد عشان تختاره بدل ما تكتب من الأول.
// لو الرقم اللي كتبته مش موجود، العميل هيتسجل جديد أوتوماتيك وقت حفظ الفاتورة من غير ما تحتاج تروح صفحة العملاء الأول.
export default function SimpleCustomerField({
  customers,
  value,
  onChange,
}: {
  customers: SimpleCustomer[];
  value: SimpleCustomerValue;
  onChange: (v: SimpleCustomerValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const digits = value.phone.trim();
  const suggestions = useMemo(() => {
    if (!digits || digits.length < 3) return [];
    return customers.filter((c) => c.phone && c.phone.includes(digits)).slice(0, 8);
  }, [customers, digits]);

  const isExactMatch = !!value.customerId;

  function pick(c: SimpleCustomer) {
    onChange({ customerId: c.id, name: c.name, phone: c.phone || "", type: c.type });
    setOpen(false);
  }

  function onNameChange(name: string) {
    onChange({ ...value, name, customerId: "" });
  }

  function onPhoneChange(phone: string) {
    onChange({ ...value, phone, customerId: "" });
    setOpen(true);
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3" ref={ref}>
      <div>
        <label className="text-xs text-muted mb-1 block">اسم العميل (اختياري)</label>
        <input
          value={value.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="عميل نقدي بدون اسم"
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </div>
      <div className="relative">
        <label className="text-xs text-muted mb-1 block">رقم الهاتف (اختياري)</label>
        <input
          value={value.phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="01xxxxxxxxx"
          className="border rounded px-3 py-2 text-sm w-full"
        />
        {isExactMatch && (
          <div className="text-[11px] text-emerald-700 mt-1">
            ✓ عميل مسجل {value.type === "TRADER" ? "(تاجر)" : "(فرد)"} - مش هيتعمل عميل جديد
          </div>
        )}
        {!isExactMatch && value.phone.trim() && (
          <div className="flex items-center gap-3 text-[11px] mt-1">
            <span className="text-muted">هيتسجل عميل جديد بالبيانات دي، نوعه:</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={value.type === "RETAIL"} onChange={() => onChange({ ...value, type: "RETAIL" })} /> فرد
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={value.type === "TRADER"} onChange={() => onChange({ ...value, type: "TRADER" })} /> تاجر
            </label>
          </div>
        )}
        {open && suggestions.length > 0 && (
          <div className="absolute z-40 mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-56 overflow-y-auto text-sm">
            <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 text-[11px] border-b border-border">
              🔎 في عملاء متسجلين بأرقام مشابهة - دوس عشان تختار بدل ما تسجل تاني
            </div>
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full text-right px-3 py-2 hover:bg-neutral-50 flex items-center justify-between gap-2 border-b border-border last:border-0"
              >
                <span>
                  {c.name} {c.type === "TRADER" ? <span className="text-[10px] text-primary">(تاجر)</span> : ""}
                </span>
                <span className="text-xs text-muted">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
