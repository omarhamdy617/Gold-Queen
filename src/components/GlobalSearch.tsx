"use client";
import { useState, useTransition } from "react";
import { searchEverything } from "@/actions/customers";
import Link from "next/link";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ customers: any[]; invoices: any[] }>({ customers: [], invoices: [] });
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="relative w-full max-w-xs">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          start(async () => {
            const r = await searchEverything(e.target.value);
            setResults(r);
          });
        }}
        placeholder="بحث برقم الهاتف أو الاسم أو كود الفاتورة..."
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
      />
      {open && q.length >= 2 && (results.customers.length > 0 || results.invoices.length > 0) && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border max-h-80 overflow-y-auto">
          {results.customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm hover:bg-neutral-50 border-b">
              👤 {c.name} {c.phone && `- ${c.phone}`}
            </Link>
          ))}
          {results.invoices.map((i) => (
            <Link key={i.id} href={`/sales/${i.id}`} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm hover:bg-neutral-50 border-b">
              🧾 فاتورة {i.code}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
