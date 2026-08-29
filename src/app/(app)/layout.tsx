import { getSession, getEffectivePermissions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import LogoutButton from "@/components/LogoutButton";
import GlobalSearch from "@/components/GlobalSearch";

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
      <aside className="no-print md:w-72 md:min-h-screen bg-navy text-neutral-300 flex-shrink-0 flex flex-col">
        <div className="p-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold-light via-gold to-gold-dark flex items-center justify-center font-bold text-navy shadow-lg shadow-black/30 text-lg">
            GQ
          </div>
          <div>
            <div className="font-bold text-white tracking-wide">جولد كوين</div>
            <div className="text-[11px] text-neutral-500">نظام إدارة متكامل</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {SECTIONS.map((section) => {
            const sectionItems = section.hrefs.map((h) => itemsByHref.get(h)).filter(Boolean) as typeof items;
            if (sectionItems.length === 0) return null;
            return (
              <div key={section.title}>
                <div className="px-3 mb-1 text-[10px] font-semibold text-neutral-600 uppercase tracking-wider">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {sectionItems.map((item) => (
                    
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-neutral-300 hover:bg-white/5 hover:text-gold-light transition"
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-gold-light flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{session.fullName}</div>
            <div className="text-[11px] text-neutral-500">{session.roleName}</div>
          </div>
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
