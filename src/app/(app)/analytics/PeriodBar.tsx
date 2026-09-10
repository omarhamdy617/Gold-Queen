"use client";
import { useState } from "react";
import { usePeriod } from "./PeriodContext";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/periodShared";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// شريط اختيار الفترة الزمنية المشترك لكل اللوحة - غيّر الفترة هنا مرة واحدة وكل قسم (النظرة
// التنفيذية + التابات المفتوحة) بيتحدّث لوحده (شوف PeriodContext.tsx و LazySection.tsx)
export default function PeriodBar() {
  const { periodKey, setPeriod } = usePeriod();
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());

  function choose(key: PeriodKey) {
    if (key === "custom") {
      setPeriod("custom", customFrom, customTo);
    } else {
      setPeriod(key);
    }
  }

  return (
    <div className="app-card p-3 flex flex-wrap items-center gap-2">
      {PERIOD_OPTIONS.filter((o) => o.key !== "custom").map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => choose(o.key)}
          className={`pill ${periodKey === o.key ? "pill-active" : ""}`}
        >
          {o.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 border-r pr-2 mr-1">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-xs"
        />
        <span className="text-xs text-muted">إلى</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setPeriod("custom", customFrom, customTo)}
          className={`pill ${periodKey === "custom" ? "pill-active" : ""}`}
        >
          تطبيق فترة مخصصة
        </button>
      </div>
    </div>
  );
}
