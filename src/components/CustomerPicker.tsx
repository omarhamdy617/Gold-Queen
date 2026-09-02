"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createCustomer } from "@/actions/customers";

export type PickerCustomer = {
  id: string;
  name: string;
  phone: string | null;
  type: "RETAIL" | "TRADER";
  creditLimit?: string | number | null;
  balance?: string | number | null;
};

export default function CustomerPicker({
  customers,
  value,
  onChange,
  onCreated,
  label = "العميل",
}: {
  customers: PickerCustomer[];
  value: string;
  onChange: (id: string, customer: PickerCustomer | null) => void;
  onCreated?: (customer: PickerCustomer) => void;
  label?: string;
}) {
  const selected = customers.find((c) => c.id === value) || null;
  const [query, setQuery] = useState(selected ? selected.name : "");
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState<"RETAIL" | "TRADER">("RETAIL");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected ? selected.name : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdd(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return customers.slice(0, 30);
    return customers
      .filter((c) => c.name.includes(q) || (c.phone && c.phone.includes(q)))
      .slice(0, 30);
  }, [customers, query]);

  // لو اللي اتكتب رقم هاتف مسجل قبل كده لعميل - نلمّح بيه فوق النتايج
  const phoneMatch = useMemo(() => {
    const q = query.trim();
    if (!q || q.length < 6 || !/^\d+$/.test(q)) return null;
    return customers.find((c) => c.phone === q) || null;
  }, [customers, query]);

  function pick(c: PickerCustomer) {
    onChange(c.id, c);
    setQuery(c.name);
    setOpen(false);
    setShowAdd(false);
  }

  function clearSelection() {
    onChange("", null);
    setQuery("");
  }

  async function submitNewCustomer() {
    setAddError("");
    if (!newName.trim()) {
      setAddError("اكتب اسم العميل");
      return;
    }
    setSaving(true);
    try {
      const c = await createCustomer({ name: newName.trim(), phone: newPhone.trim() || undefined, type: newType });
      onCreated?.(c as any);
      pick(c as any);
      setNewName("");
      setNewPhone("");
      setNewType("RETAIL");
      setShowAdd(false);
    } catch (e: any) {
      setAddError(e?.message || "حصل خطأ أثناء إضافة العميل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      {label && <label className="text-xs text-muted mb-1 block">{label}</label>}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("", null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="اكتب اسم العميل أو رقم الهاتف..."
          className="border rounded px-3 py-2 text-sm w-full"
        />
        {query && (
          <button type="button" onClick={clearSelection} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs">
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[280px] bg-card border border-border rounded-lg shadow-xl max-h-72 overflow-y-auto text-sm">
          {phoneMatch && (
            <div className="px-3 py-2 bg-emerald-50 text-emerald-800 text-xs border-b border-border">
              🔎 الرقم ده مسجل قبل كده لـ <b>{phoneMatch.name}</b> - دوس عليه تحته للاختيار
            </div>
          )}
          <button type="button" onClick={clearSelection} className="w-full text-right px-3 py-2 hover:bg-neutral-50 text-muted border-b border-border">
            عميل نقدي (بدون تسجيل)
          </button>
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="w-full text-right px-3 py-2 hover:bg-neutral-50 flex items-center justify-between gap-2 border-b border-border last:border-0"
            >
              <span>
                {c.name} {c.type === "TRADER" ? <span className="text-[10px] text-primary">(تاجر)</span> : ""}
              </span>
              <span className="text-xs text-muted">{c.phone || ""}</span>
            </button>
          ))}
          {results.length === 0 && <div className="px-3 py-3 text-center text-muted text-xs">مفيش نتائج مطابقة</div>}

          {!showAdd ? (
            <button
              type="button"
              onClick={() => {
                setShowAdd(true);
                setNewName(query && !/^\d+$/.test(query) ? query : "");
                setNewPhone(query && /^\d+$/.test(query) ? query : "");
              }}
              className="w-full text-right px-3 py-2.5 text-primary font-medium hover:bg-neutral-50"
            >
              + إضافة عميل جديد
            </button>
          ) : (
            <div className="p-3 space-y-2 bg-background">
              {addError && <div className="text-red-600 text-xs">{addError}</div>}
              <input placeholder="اسم العميل" value={newName} onChange={(e) => setNewName(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
              <input placeholder="رقم الهاتف (اختياري)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={newType === "RETAIL"} onChange={() => setNewType("RETAIL")} /> فرد
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={newType === "TRADER"} onChange={() => setNewType("TRADER")} /> تاجر
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={submitNewCustomer} className="bg-navy text-white rounded px-3 py-1.5 text-xs flex-1 disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : "حفظ العميل"}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="border rounded px-3 py-1.5 text-xs">
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
