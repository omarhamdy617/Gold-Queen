"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AppShell({ sidebar, mobileBell, children }: { sidebar: React.ReactNode; mobileBell: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // اقفل الدرج تلقائيًا لما ينتقل لصفحة تانية من الموبايل
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen md:flex md:flex-row">
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setOpen(false)} />
      )}

      <div
        className={
          "no-print fixed md:static inset-y-0 right-0 z-40 w-80 max-w-[85vw] md:w-80 md:flex-shrink-0 h-full transition-transform duration-300 ease-out md:transition-none " +
          (open ? "translate-x-0" : "translate-x-full md:translate-x-0")
        }
      >
        {sidebar}
      </div>

      <div className="flex-1 min-h-screen max-w-full overflow-x-hidden flex flex-col">
        <div className="no-print md:hidden sticky top-0 z-20 bg-navy text-white flex items-center justify-between px-3 py-2.5 shadow">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="فتح القائمة"
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 text-xl"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center font-bold text-white text-xs">GQ</div>
            <div className="font-bold text-sm">جولد كوين</div>
          </div>
          {mobileBell}
        </div>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
