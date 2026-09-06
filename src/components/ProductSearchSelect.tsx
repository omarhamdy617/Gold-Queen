"use client";
import { useEffect, useRef, useState } from "react";

type Product = { id: string; name: string; sku?: string; barcode?: string; totalStock?: number; stockByLocation?: Record<string, number>; [k: string]: any };

// كان بيدور بالاسم بس - لو عدد المنتجات كبير وكاشير عايز يدور برقم الصنف (SKU) أو الباركود مش
// عارف اسمه بالظبط كان مضطر يفتش كل القايمة بعينه. دلوقتي بيدور في الاسم + الكود + الباركود
// كلهم مع بعض. وبيعرض كمان الكمية المتاحة فعليًا في المكان المحدد (locationId) لو اتبعت، بدل
// إجمالي كل الأماكن اللي كان بيلخبط الكاشير وهو بيبيع من محل معيّن.
export default function ProductSearchSelect({
  products,
  value,
  onChange,
  locationId,
  placeholder = "دور بالاسم أو الكود أو الباركود...",
  className = "",
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  locationId?: string;
  placeholder?: string;
  className?: string;
}) {
  const selected = products.find((p) => p.id === value);
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function stockFor(p: Product): number | null {
    if (locationId && p.stockByLocation) return p.stockByLocation[locationId] ?? 0;
    if (p.totalStock !== undefined) return p.totalStock;
    return null;
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? products
        .filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
        .slice(0, 30)
    : products.slice(0, 30);

  return (
    <div className="relative" ref={ref}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`border rounded px-2 py-1.5 text-sm w-full ${className}`}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-w-xs bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted">مفيش نتائج</div>}
          {filtered.map((p) => {
            const stock = stockFor(p);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  setQuery(p.name);
                  setOpen(false);
                }}
                className="w-full text-right px-3 py-2 text-sm hover:bg-neutral-50 border-b last:border-0 flex items-center justify-between gap-2"
              >
                <span className="flex-1">
                  {p.name}
                  {p.sku && <span className="text-[10px] text-muted block">{p.sku}</span>}
                </span>
                {stock !== null && (
                  <span className={`text-[11px] flex-shrink-0 ${stock <= 0 ? "text-red-500" : "text-muted"}`}>متاح: {stock}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
