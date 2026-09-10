"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePeriod } from "./PeriodContext";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";
import type { PeriodKey } from "@/lib/periodShared";

// غلاف موحّد لكل قسم "تفصيلي" في لوحة التحليلات (تاب بيتحمّل بس لما المستخدم يفتحه - مش لحظة
// تحميل الصفحة) - نفس فكرة ConsignmentPanels/ConsignmentActivity المستخدمة في شاشة العهدة بالظبط:
// كل الأقسام فعليًا Mounted طول الوقت (شوف AnalyticsTabs.tsx) بس بتعرض محتواها وتجيب بياناتها بس
// لما تتفتح، وبتفضل فاكرة آخر بيانات جابتها لو اتقفلت وبعدين اتفتحت تاني من غير ما الفترة تتغيّر.
//
// ده أهم قرار أمان في الصفحة دي كلها: لو غيّرت الفترة وأنت فاتح كذا تاب، التاب المفتوح بس هو اللي
// بيحدّث فورًا - الباقي هيحدّث لوحده أول ما تفتحه تاني. لو كل التابات المفتوحة حدّثت مرة واحدة، ده
// كان ممكن يبعت عشرات الاستعلامات لقاعدة البيانات في نفس اللحظة (نفس سبب توقف الموقع في 8 سبتمبر).
export default function LazySection<T>({
  id,
  title,
  icon,
  open,
  onToggle,
  loader,
  render,
}: {
  id: string;
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  loader: (periodKey: PeriodKey, customFrom?: string, customTo?: string) => Promise<T | { error: string }>;
  render: (data: T) => ReactNode;
}) {
  const { periodKey, customFrom, customTo, version } = usePeriod();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const lastLoadedVersion = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (lastLoadedVersion.current === version) return;
    lastLoadedVersion.current = version;
    setError("");
    start(async () => {
      try {
        const r = await loader(periodKey, customFrom, customTo);
        if (isActionError(r)) {
          setError(r.error);
          setData(null);
          return;
        }
        setData(r as T);
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تحميل بيانات القسم ده"));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version]);

  return (
    <div id={id} className="app-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-colors ${open ? "bg-navy text-white" : "hover:bg-neutral-50"}`}
      >
        <span>
          {icon} {title}
        </span>
        <span className="text-xs opacity-80">{open ? "إخفاء ▲" : "عرض التفاصيل ▼"}</span>
      </button>
      {open && (
        <div className="p-4 border-t space-y-3">
          {pending && !data && <div className="text-xs text-muted py-8 text-center">جارٍ التحميل...</div>}
          {error && <div className="text-red-600 text-xs">{error}</div>}
          {data && render(data)}
        </div>
      )}
    </div>
  );
}
