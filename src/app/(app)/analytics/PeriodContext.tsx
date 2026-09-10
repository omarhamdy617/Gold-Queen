"use client";
import { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { PeriodKey } from "@/lib/periodShared";

type PeriodState = {
  periodKey: PeriodKey;
  customFrom?: string;
  customTo?: string;
  // بيزيد رقم واحد في كل مرة الفترة تتغيّر - كل الأقسام (النظرة التنفيذية + التابات) بتراقب الرقم
  // ده عشان تعرف تحدّث بياناتها. القسم المفتوح دلوقتي بيحدّث فورًا، والقسم المقفول هيحدّث لوحده
  // أول ما المستخدم يفتحه تاني (شوف LazySection.tsx) - عشان تغيير الفترة ميفجّرش كل الاستعلامات
  // مرة واحدة لو المستخدم كان فاتح كذا تاب قبل كده.
  version: number;
  setPeriod: (key: PeriodKey, customFrom?: string, customTo?: string) => void;
};

const PeriodCtx = createContext<PeriodState | null>(null);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);

  const setPeriod = useCallback((key: PeriodKey, from?: string, to?: string) => {
    setPeriodKey(key);
    setCustomFrom(from);
    setCustomTo(to);
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo(
    () => ({ periodKey, customFrom, customTo, version, setPeriod }),
    [periodKey, customFrom, customTo, version, setPeriod]
  );

  return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodCtx);
  if (!ctx) throw new Error("usePeriod لازم يتستخدم جوه PeriodProvider");
  return ctx;
}
