import { getSession, getEffectivePermissions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import LogoutButton from "@/components/LogoutButton";
import GlobalSearch from "@/components/GlobalSearch";
import NavList from "@/components/NavList";

const SECTIONS: { title: string; hrefs: string[] }[] = [
  { title: "عام", hrefs: ["/"] },
  { title: "المبيعات", hrefs: ["/sales/new", "/sales", "/quotes"] },
  { title: "المخزون", hrefs: ["/products", "/products/barcode", "/purchases", "/transfers"] },
  { title: "العملاء والأوردرات", hrefs: ["/customers", "/consignments", "/orders", "/returns"] },
  { title: "الحسابات", hrefs: ["/cash", "/expenses", "/finance", "/reports"] },
  { title: "الإدارة", hrefs: ["/audit", "/settings/users", "/settings"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions(session.userId, session.roleId, session.roleName);
  const items = NAV_ITEMS.filter((i) => !i.perm || perms.has(i.perm));
  const itemsByHref = new Map(items.map((i) => [i.href, i]));

  const initials = (session.fullName || "?").trim().slice(0, 1);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="no-print md:w-80 md:min-h-screen md:sticky md:top-0 md:h-screen bg-navy text-neutral-300 flex-shrink-0 flex flex-col z-20 shadow-[0_0_40px_rgba(0,0,0,0.35)] md:border-l md:border-white/10">
        <div className="p-5 flex items-center justify-between border-b border-white/10">
          <button className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition text-lg">
            🔔
          </button>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="font-bold text-white text-base leading-tight">جولد كوين</div>
              <div className="text-[10px] text-neutral-500">نظام إدارة متكامل</div>
            </div>
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center font-bold text-white shadow-lg text-sm">
              GQ
            </div>
          </div>
        </div>

        <div className="mx-3 mt-4 p-3.5 rounded-xl bg-white/5 shadow-inner flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-primary-light flex-shrink-0 ring-2 ring-white/10">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate font-medium">{session.fullName}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="badge badge-blue">{session.roleName}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5 mt-1">
          {SECTIONS.map((section) => {
            const sectionItems = section.hrefs.map((h) => itemsByHref.get(h)).filter(Boolean) as typeof items;
            if (sectionItems.length === 0) return null;
            return (
              <div key={section.title}>
                <div className="px-3 mb-1 text-[10px] font-semibold text-neutral-600 uppercase tracking-wider">
                  {section.title}
                </div>
                <NavList items={sectionItems} />
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-neutral-600">جولد كوين © {new Date().getFullYear()}</span>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 min-h-screen max-w-full overflow-x-hidden">
        <div className="no-print bg-card/95 backdrop-blur border-b border-border p-3 flex justify-end sticky top-0 z-10">
          <GlobalSearch />
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
