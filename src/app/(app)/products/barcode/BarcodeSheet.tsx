"use client";
import { useMemo, useState } from "react";

type P = { id: string; name: string; sku: string; barcode: string; retailPrice: string };

export default function BarcodeSheet({ products }: { products: P[] }) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => products.filter((p) => p.name.includes(search) || p.barcode.includes(search)),
    [products, search]
  );

  const labels: P[] = [];
  for (const p of products) {
    const count = selected[p.id] || 0;
    for (let i = 0; i < count; i++) labels.push(p);
  }

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <h1 className="text-xl font-bold">طباعة ملصقات الباركود</h1>
        <input
          placeholder="بحث..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm"
        />
        <div className="bg-white rounded-xl shadow divide-y max-h-96 overflow-y-auto">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-neutral-400 font-mono">{p.barcode}</div>
              </div>
              <input
                type="number"
                min={0}
                placeholder="عدد الملصقات"
                className="border rounded px-2 py-1 w-24 text-sm"
                value={selected[p.id] || ""}
                onChange={(e) => setSelected({ ...selected, [p.id]: parseInt(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
        <button onClick={() => window.print()} className="bg-gold text-white rounded-lg px-5 py-2.5 text-sm">
          طباعة ({labels.length} ملصق)
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 print:grid-cols-3">
        {labels.map((p, i) => (
          <div key={i} className="border rounded p-2 text-center break-inside-avoid">
            <div className="text-xs font-bold mb-1 truncate">{p.name}</div>
            <img src={`/api/barcode/${p.barcode}`} alt={p.barcode} className="mx-auto" />
            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">#{p.sku}</div>
            <div className="text-xs font-bold mt-0.5">{Number(p.retailPrice).toFixed(2)} ج.م</div>
          </div>
        ))}
      </div>
    </div>
  );
}
