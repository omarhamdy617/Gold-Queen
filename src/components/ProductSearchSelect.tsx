"use client";
import { useEffect, useRef, useState } from "react";

type Product = { id: string; name: string; [k: string]: any };

export default function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = "دور على المنتج بالاسم...",
  className = "",
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
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

  const filtered = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
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
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setQuery(p.name);
                setOpen(false);
              }}
              className="w-full text-right px-3 py-2 text-sm hover:bg-neutral-50 border-b last:border-0"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
