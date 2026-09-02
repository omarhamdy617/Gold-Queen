"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type BannerAlert = { key: string; text: string; href?: string };

const STORAGE_KEY = "gq_dismissed_alerts";

export default function AlertsBanner({ alerts }: { alerts: BannerAlert[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setDismissed(raw ? JSON.parse(raw) : []);
    } catch {
      setDismissed([]);
    }
    setReady(true);
  }, []);

  function dismiss(key: string) {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  if (!ready) return null;
  const visible = alerts.filter((a) => !dismissed.includes(a.key));
  if (visible.length === 0) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5 text-sm">
      <h2 className="font-bold text-red-700 mb-2">🔔 تنبيهات فورية</h2>
      {visible.map((a) => (
        <div key={a.key} className="flex items-center justify-between gap-2">
          {a.href ? (
            <Link href={a.href} className="underline">{a.text}</Link>
          ) : (
            <p>{a.text}</p>
          )}
          <button
            type="button"
            onClick={() => dismiss(a.key)}
            aria-label="إخفاء التنبيه"
            className="text-red-400 hover:text-red-700 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
