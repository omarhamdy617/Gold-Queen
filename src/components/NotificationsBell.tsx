"use client";
import { useEffect, useRef, useState } from "react";
import type { AlertItem } from "@/actions/notifications";

export default function NotificationsBell({ alerts, align = "right" }: { alerts: AlertItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = alerts.reduce((s, a) => s + a.count, 0);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition text-lg"
      >
        🔔
        {total > 0 && (
          <span className="absolute -top-0.5 -left-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className={
            "absolute top-12 w-72 max-w-[85vw] bg-card text-foreground rounded-xl shadow-xl border border-border overflow-hidden z-50 " +
            (align === "left" ? "left-0" : "right-0")
          }
        >
          <div className="p-3 border-b border-border font-bold text-sm">الإشعارات</div>
          {alerts.length === 0 ? (
            <div className="p-4 text-sm text-muted text-center">مفيش تنبيهات جديدة 👍</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {alerts.map((a, i) => (
                <li key={i} className="border-b border-border last:border-0">
                  <a href={a.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-neutral-50">
                    <span>{a.label}</span>
                    <span className="badge badge-red">{a.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
