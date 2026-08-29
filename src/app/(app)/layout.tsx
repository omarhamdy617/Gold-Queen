import { getSession, getEffectivePermissions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import LogoutButton from "@/components/LogoutButton";
import GlobalSearch from "@/components/GlobalSearch";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const perms = await getEffectivePermissions(session.userId, session.roleId, session.roleName);
  const items = NAV_ITEMS.filter((i) => !i.perm || perms.has(i.perm));

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="no-print md:w-64 md:min-h-screen bg-neutral-950 text-neutral-200 flex-shrink-0 flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-neutral-800">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-light to-gold flex items-center justify-center font-bold text-white">
            جك
          </div>
          <div>
            <div className="font-bold">جولد كوين</div>
            <div className="text-xs text-neutral-400">نظام إدارة متكامل</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-800 transition"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="p-4 border-t border-neutral-800 text-xs text-neutral-400">
          <div className="mb-1">{session.fullName}</div>
          <div className="mb-2 text-neutral-500">{session.roleName}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-h-screen max-w-full overflow-x-hidden">
        <div className="no-print bg-white border-b p-3 flex justify-end">
          <GlobalSearch />
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
