"use client";
import { useEffect, useRef, useState } from "react";
import { searchEverything } from "@/actions/customers";
import Link from "next/link";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ customers: any[]; invoices: any[] }>({ customers: [], invoices: [] });
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // كان البحث ده بيبعت طلب لقاعدة البيانات مع كل حرف يتكتب - من غير أي تأخير - وهو ظاهر في كل
  // صفحة في السيستم (مش بس صفحة معينة). يعني لو حد كتب كلمة من 6 حروف، ده كان معناه 6 طلبات لقاعدة
  // البيانات في ثواني معدودة، وكل طلب بيفتح لوحده حتى 8 اتصالات (فحص صلاحيتين بالتوازي + استعلامين
  // بيانات) - ده حمل حقيقي على قاعدة البيانات وممكن يساهم في تعليق السيستم حتى لو حد تاني فاتح صفحة
  // تانية تمامًا. دلوقتي البحث بيستنى المستخدم يبطّل الكتابة لمدة نص ثانية الأول قبل ما يبعت الطلب،
  // وأي طلب قديم استنى رده لما رد طلب أحدث منه وصل الأول.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) {
      setResults({ customers: [], invoices: [] });
      return;
    }
    const myId = ++requestIdRef.current;
    timerRef.current = setTimeout(async () => {
      const r = await searchEverything(q);
      if (requestIdRef.current === myId) setResults(r);
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q]);

  return (
    <div className="relative w-full max-w-xs">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
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
